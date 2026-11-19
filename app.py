from flask import (
    Flask, jsonify, request, send_from_directory, Response, session
)
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import func
from dotenv import load_dotenv
from pathlib import Path
from datetime import datetime, timezone, date, timedelta
from collections import defaultdict, deque
from functools import wraps
from deepface import DeepFace
from werkzeug.utils import secure_filename
from werkzeug.security import generate_password_hash, check_password_hash
from PIL import Image, ImageOps
import tempfile
import io
import os
import re
import time

# Load DATABASE_URL and SECRET_KEY from the .env file
load_dotenv()

# Initialize Flask
app = Flask(__name__)

BASE_DIR = Path(__file__).resolve().parent

# ==========================================================
# SECURITY SETTINGS (NEW)
# ==========================================================

# Needed to sign the login session cookie. Add SECRET_KEY to your .env file.
SECRET_KEY = os.getenv("SECRET_KEY")

if not SECRET_KEY:
    raise RuntimeError("SECRET_KEY is missing. Add it to your .env file.")

app.config["SECRET_KEY"] = SECRET_KEY
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
app.config["SESSION_COOKIE_SECURE"] = os.getenv("APP_ENV") == "production"
app.config["PERMANENT_SESSION_LIFETIME"] = timedelta(days=7)

# ==========================================================
# DATABASE (Neon PostgreSQL)
# ==========================================================

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL is missing. Check your .env file.")

# Tell SQLAlchemy to use the psycopg2 driver (the one we installed).
if DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace(
        "postgresql://", "postgresql+psycopg2://", 1
    )

app.config["SQLALCHEMY_DATABASE_URI"] = DATABASE_URL

# Neon pauses idle databases, so test each connection before using it.
app.config["SQLALCHEMY_ENGINE_OPTIONS"] = {
    "pool_pre_ping": True,
    "pool_recycle": 280,
}

db = SQLAlchemy(app)


class User(db.Model):
    """A registered EmotiScan account. (NEW)"""

    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    first_name = db.Column(db.String(50), nullable=False)
    last_name = db.Column(db.String(50), nullable=False)
    birthdate = db.Column(db.Date, nullable=True)
    email = db.Column(db.String(254), nullable=False, unique=True)
    username = db.Column(db.String(30), nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    created_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # Usernames are unique regardless of upper/lower case.
    __table_args__ = (
        db.Index("ix_users_username_lower", func.lower(username), unique=True),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "first_name": self.first_name,
            "last_name": self.last_name,
            "birthdate": self.birthdate.isoformat() if self.birthdate else None,
            "email": self.email,
            "username": self.username,
            "created_at": self.created_at.isoformat(),
        }


class Scan(db.Model):
    """One emotion analysis result, with a small copy of the photo."""

    __tablename__ = "scans"

    id = db.Column(db.Integer, primary_key=True)
    emotion = db.Column(db.String(20), nullable=False)
    score = db.Column(db.Float, nullable=False)
    image = db.Column(db.LargeBinary, nullable=False)   # JPEG thumbnail
    created_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    def to_dict(self):
        return {
            "id": self.id,
            "emotion": self.emotion,
            "score": self.score,
            "created_at": self.created_at.isoformat(),
            "image_url": f"/api/scans/{self.id}/image",
        }


# Create the tables in Neon if they do not exist yet.
# (Existing tables are left untouched; only the new "users" table is added.)
with app.app_context():
    db.create_all()

# ==========================================================
# SETTINGS
# ==========================================================

# Maximum image upload size: 10 MB
app.config["MAX_CONTENT_LENGTH"] = 10 * 1024 * 1024

# Allowed image formats
ALLOWED_EXTENSIONS = {"jpg", "jpeg", "png", "webp"}

# Minimum age to register
MIN_AGE = 13


def allowed_file(filename):
    return (
        "." in filename
        and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS
    )


def make_thumbnail(path, max_size=400):
    """Shrink the photo to a small JPEG so it is cheap to store."""
    with Image.open(path) as img:
        img = ImageOps.exif_transpose(img)   # fix phone photo rotation
        img = img.convert("RGB")
        img.thumbnail((max_size, max_size))

        buffer = io.BytesIO()
        img.save(buffer, format="JPEG", quality=75)
        return buffer.getvalue()


# ==========================================================
# AUTH HELPERS (NEW)
# ==========================================================

EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
USERNAME_RE = re.compile(r"^[a-zA-Z0-9._-]{3,30}$")
BIRTHDATE_RE = re.compile(r"^(\d{2})\s*/\s*(\d{2})\s*/\s*(\d{4})$")


def parse_birthdate(raw):
    """Convert 'MM / DD / YYYY' (what register.js produces) to a date."""
    match = BIRTHDATE_RE.match(str(raw).strip())

    if not match:
        return None

    month, day, year = (int(part) for part in match.groups())

    try:
        return date(year, month, day)
    except ValueError:
        return None


def age_from(born):
    today = date.today()
    return today.year - born.year - (
        (today.month, today.day) < (born.month, born.day)
    )


def json_error(message, status):
    return jsonify({"error": message}), status


def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if "user_id" not in session:
            return json_error("Not authenticated.", 401)
        return view(*args, **kwargs)
    return wrapped


# Simple in-memory limiter: 20 attempts per IP every 15 minutes.
# It resets when the server restarts.
_attempts = defaultdict(deque)
RATE_LIMIT = 20
RATE_WINDOW = 15 * 60


def rate_limited(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        now = time.time()
        attempts = _attempts[request.remote_addr]

        while attempts and now - attempts[0] > RATE_WINDOW:
            attempts.popleft()

        if len(attempts) >= RATE_LIMIT:
            return json_error("Too many attempts. Please try again later.", 429)

        attempts.append(now)
        return view(*args, **kwargs)
    return wrapped


def start_session(user):
    session.clear()
    session.permanent = True
    session["user_id"] = user.id


# ==========================================================
# FRONTEND FILES
# ==========================================================

# Homepage
@app.route("/")
def home():
    return send_from_directory(BASE_DIR, "index.html")


# Serve existing frontend files
@app.route("/<path:filename>")
def frontend_files(filename):
    allowed_extensions = {
        ".html", ".css", ".js", ".png", ".jpg",
        ".jpeg", ".webp", ".svg", ".ico"
    }

    file_path = BASE_DIR / filename
    if (
        file_path.is_file()
        and file_path.suffix.lower() in allowed_extensions
    ):
        return send_from_directory(BASE_DIR, filename)

    return jsonify({"error": "File not found"}), 404


# ==========================================================
# API ROUTES
# ==========================================================

# Backend status
@app.route("/api/status")
def backend_status():
    return jsonify({
        "status": "running",
        "message": "EmotiScan backend is connected!"
    })


# ----------------------------------------------------------
# ACCOUNTS (NEW)
# ----------------------------------------------------------

# Create a new account (called by register.js)
@app.route("/api/register", methods=["POST"])
@rate_limited
def register():
    data = request.get_json(silent=True) or {}

    first_name = data.get("firstName")
    last_name = data.get("lastName")
    email = data.get("email")
    username = data.get("username")
    password = data.get("password")
    birthdate_raw = data.get("birthdate")

    # Required fields
    required = [first_name, last_name, email, username, password]

    if not all(isinstance(v, str) and v.strip() for v in required):
        return json_error("Please fill in all required fields.", 400)

    first_name = first_name.strip()
    last_name = last_name.strip()
    email = email.strip().lower()
    username = username.strip()

    if len(first_name) > 50 or len(last_name) > 50:
        return json_error("Names must be 50 characters or fewer.", 400)

    if not EMAIL_RE.match(email) or len(email) > 254:
        return json_error("Please enter a valid email address.", 400)

    if not USERNAME_RE.match(username):
        return json_error(
            'Username must be 3-30 characters '
            '(letters, numbers, ".", "_" or "-").', 400
        )

    if not 8 <= len(password) <= 128:
        return json_error(
            "Password must be between 8 and 128 characters.", 400
        )

    # Birthdate is optional in the form, but checked if it is filled in.
    birthdate = None

    if isinstance(birthdate_raw, str) and birthdate_raw.strip():
        birthdate = parse_birthdate(birthdate_raw)

        if birthdate is None:
            return json_error(
                "Please enter a valid birthdate (MM / DD / YYYY).", 400
            )

        if birthdate > date.today():
            return json_error("Birthdate cannot be in the future.", 400)

        if age_from(birthdate) < MIN_AGE:
            return json_error(
                f"You must be at least {MIN_AGE} years old to register.", 400
            )

    # Duplicate checks
    if User.query.filter_by(email=email).first():
        return json_error("That email is already registered.", 409)

    if User.query.filter(
        func.lower(User.username) == username.lower()
    ).first():
        return json_error("That username is already taken.", 409)

    try:
        user = User(
            first_name=first_name,
            last_name=last_name,
            birthdate=birthdate,
            email=email,
            username=username,
            password_hash=generate_password_hash(password),
        )
        db.session.add(user)
        db.session.commit()

    except Exception as error:
        # Also covers two people grabbing the same email/username at once.
        db.session.rollback()
        print("Register error:", error)

        if User.query.filter_by(email=email).first() or User.query.filter(
            func.lower(User.username) == username.lower()
        ).first():
            return json_error("Email or username is already in use.", 409)

        return json_error("Something went wrong. Please try again.", 500)

    start_session(user)

    return jsonify({
        "success": True,
        "message": "Account registered successfully!",
        "user": user.to_dict()
    }), 201


# Log in with email OR username
@app.route("/api/login", methods=["POST"])
@rate_limited
def login():
    data = request.get_json(silent=True) or {}

    identifier = data.get("identifier")
    password = data.get("password")

    if (
        not isinstance(identifier, str)
        or not isinstance(password, str)
        or not identifier.strip()
        or not password
    ):
        return json_error(
            "Please enter your email/username and password.", 400
        )

    identifier = identifier.strip()

    user = User.query.filter(
        (User.email == identifier.lower())
        | (func.lower(User.username) == identifier.lower())
    ).first()

    # Same message for an unknown user and a wrong password.
    if user is None or not check_password_hash(user.password_hash, password):
        return json_error("Invalid credentials.", 401)

    start_session(user)

    return jsonify({
        "success": True,
        "message": "Logged in.",
        "user": user.to_dict()
    })


# Who is logged in right now?
@app.route("/api/me")
@login_required
def me():
    user = db.session.get(User, session["user_id"])

    if user is None:
        session.clear()
        return json_error("User not found.", 404)

    return jsonify({"user": user.to_dict()})


# Log out
@app.route("/api/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"success": True, "message": "Logged out."})


# ----------------------------------------------------------
# EMOTION ANALYSIS
# ----------------------------------------------------------

# Analyze facial expression and save the result
@app.route("/api/analyze", methods=["POST"])
def analyze_emotion():

    # Check if an image was uploaded
    if "image" not in request.files:
        return jsonify({
            "error": "No image was provided."
        }), 400

    image = request.files["image"]

    # Check if a filename exists
    if image.filename == "":
        return jsonify({
            "error": "Please select an image."
        }), 400

    # Check file format
    if not allowed_file(image.filename):
        return jsonify({
            "error": "Please upload JPG, JPEG, PNG, or WEBP."
        }), 400

    # Create a temporary image file
    temp_path = None

    try:
        filename = secure_filename(image.filename)

        suffix = Path(filename).suffix.lower()

        with tempfile.NamedTemporaryFile(
            suffix=suffix,
            delete=False
        ) as temp_file:

            temp_path = temp_file.name
            image.save(temp_path)

        # Analyze the uploaded image
        result = DeepFace.analyze(
            img_path=temp_path,
            actions=["emotion"],
            enforce_detection=True
        )

        # DeepFace may return a list of face results
        if isinstance(result, list):
            if len(result) == 0:
                return jsonify({
                    "error": "No face was detected."
                }), 400

            result = result[0]

        # Get emotion scores from DeepFace
        emotions = result.get("emotion", {})

        # EmotiScan supports only these emotions.
        supported_emotions = [
            "happy",
            "angry",
            "disgust",
            "fear",
            "neutral",
            "sad",
            "surprise"
        ]

        # Keep only the supported emotions.
        filtered_emotions = {
            emotion: float(emotions.get(emotion, 0))
            for emotion in supported_emotions
        }

        # Select the emotion with the highest score.
        dominant_emotion = max(
            filtered_emotions,
            key=filtered_emotions.get
        )

        # Get its confidence score.
        emotion_score = round(float(filtered_emotions[dominant_emotion]), 2)

        print("EMOTISCAN EMOTION SCORES:", filtered_emotions)
        print("EMOTISCAN DETECTED EMOTION:", dominant_emotion)

        # Save the result and a small copy of the photo in the database.
        scan = Scan(
            emotion=dominant_emotion,
            score=emotion_score,
            image=make_thumbnail(temp_path),
        )
        db.session.add(scan)
        db.session.commit()

        return jsonify({
            "success": True,
            "id": scan.id,
            "emotion": dominant_emotion,
            "score": emotion_score,
            "message": "Facial expression analyzed successfully."
        })

    except ValueError as error:

        # DeepFace raises ValueError when it cannot find a face.
        db.session.rollback()
        print("Emotion analysis error:", error)

        if "Face could not be detected" in str(error):
            return jsonify({
                "error": "No face was detected. Try a clearer photo."
            }), 400

        return jsonify({
            "error": (
                "Unable to analyze this image. "
                "Try a clear photo showing one face."
            )
        }), 500

    except Exception as error:

        db.session.rollback()
        print("Emotion analysis error:", error)

        return jsonify({
            "error": (
                "Unable to analyze this image. "
                "Try a clear photo showing one face."
            )
        }), 500

    finally:

        # Delete temporary image
        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)


# List all saved scans (newest first) for the History page
@app.route("/api/history")
def get_history():
    scans = Scan.query.order_by(Scan.created_at.desc()).all()
    return jsonify([scan.to_dict() for scan in scans])


# Show the saved photo of one scan
@app.route("/api/scans/<int:scan_id>/image")
def get_scan_image(scan_id):
    scan = db.session.get(Scan, scan_id)

    if scan is None:
        return jsonify({"error": "Scan not found."}), 404

    return Response(scan.image, mimetype="image/jpeg")


# Delete one scan (and its photo)
@app.route("/api/scans/<int:scan_id>", methods=["DELETE"])
def delete_scan(scan_id):
    scan = db.session.get(Scan, scan_id)

    if scan is None:
        return jsonify({"error": "Scan not found."}), 404

    db.session.delete(scan)
    db.session.commit()

    return jsonify({"success": True, "message": "Scan deleted."})


# Handle oversized uploads
@app.errorhandler(413)
def file_too_large(error):
    return jsonify({
        "error": "Image is too large. Maximum size is 10 MB."
    }), 413


# Start Flask
if __name__ == "__main__":
    app.run(debug=True)