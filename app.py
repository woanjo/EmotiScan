import os
import time

os.environ.setdefault("TF_ENABLE_ONEDNN_OPTS", "0")

from flask import Flask, jsonify, request, send_from_directory, Response, session
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import func
from dotenv import load_dotenv
from pathlib import Path
from datetime import datetime, timezone, date
from functools import wraps
from deepface import DeepFace
import keras
from werkzeug.utils import secure_filename
from werkzeug.security import generate_password_hash, check_password_hash
from PIL import Image, ImageOps
import numpy as np
import cv2
import tempfile
import json
import io
import re

# Load DATABASE_URL and SECRET_KEY from the .env file
load_dotenv()

# Initialize Flask
app = Flask(__name__)

BASE_DIR = Path(__file__).resolve().parent

# ==========================================================
# SECURITY / SESSIONS
# ==========================================================
app.config["SECRET_KEY"] = os.getenv("SECRET_KEY") or os.urandom(32).hex()
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"

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
    """One registered EmotiScan account."""

    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    first_name = db.Column(db.String(60), nullable=False)
    last_name = db.Column(db.String(60), nullable=False)
    birthdate = db.Column(db.Date, nullable=True)
    email = db.Column(db.String(255), unique=True, nullable=False)
    username = db.Column(db.String(40), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    avatar = db.Column(db.LargeBinary, nullable=True)
    created_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    def to_dict(self):
        return {
            "id": self.id,
            "first_name": self.first_name,
            "last_name": self.last_name,
            "username": self.username,
            "email": self.email,
            "birthdate": self.birthdate.isoformat() if self.birthdate else None,
            "member_since": self.created_at.strftime("%B %Y"),
            "created_at": self.created_at.isoformat(),
            "avatar_url": f"/api/users/{self.id}/avatar?t={int(time.time())}" if self.avatar else None,
        }


class Scan(db.Model):
    """One emotion analysis result, with a small copy of the photo."""

    __tablename__ = "scans"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
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
# NOTE: create_all() does NOT add columns to existing tables.
# If needed in Neon SQL editor:
#   ALTER TABLE scans ADD COLUMN user_id INTEGER REFERENCES users(id);
#   ALTER TABLE users ADD COLUMN avatar BYTEA;
with app.app_context():
    db.create_all()

# ==========================================================
# OUR OWN EMOTION MODEL (trained in Google Colab)
# ==========================================================

MODEL_DIR = BASE_DIR / "model"

# Leave as None to use the newest .keras file in the model folder,
# or write the file name, for example "emotiscan_model_v3.keras".
MODEL_FILE = None

# Which face detector DeepFace uses to find the face in the photo.
# "opencv" is fast. If faces are missed, try "mtcnn" (pip install mtcnn).
DETECTOR = "opencv"

# Extra space kept around the detected face (0.1 = 10% of the face width).
FACE_MARGIN = 0.1

# Large photos are shrunk to this size (longest side) before face detection.
MAX_DETECT_SIZE = 1000


def load_emotion_model():
    if MODEL_FILE:
        model_path = MODEL_DIR / MODEL_FILE
    else:
        keras_files = sorted(
            MODEL_DIR.glob("*.keras"),
            key=lambda path: path.stat().st_mtime,
            reverse=True,
        )
        if not keras_files:
            raise RuntimeError(f"No .keras model file found in {MODEL_DIR}")
        model_path = keras_files[0]

    print("EMOTISCAN MODEL FILE:", model_path.name)

    # compile=False: we only need predictions, not the training settings.
    model = keras.models.load_model(model_path, compile=False)

    # Emotion names, in the same order the model outputs them.
    with open(MODEL_DIR / "class_names.json") as file:
        class_names = json.load(file)

    # Image size the model was trained with.
    img_size = 128
    info_path = MODEL_DIR / "model_info.json"
    if info_path.exists():
        with open(info_path) as file:
            img_size = json.load(file).get("img_size", img_size)

    print("EMOTISCAN EMOTIONS:", class_names, "| IMAGE SIZE:", img_size)
    return model, class_names, img_size


# Load once when the server starts (not on every request).
emotion_model, CLASS_NAMES, IMG_SIZE = load_emotion_model()


def read_photo_as_bgr(path):
    """Open the photo, fix phone rotation, and shrink very large photos."""
    with Image.open(path) as img:
        img = ImageOps.exif_transpose(img).convert("RGB")
        rgb = np.array(img)

    bgr = np.ascontiguousarray(rgb[:, :, ::-1])   # OpenCV uses BGR order

    longest = max(bgr.shape[:2])
    if longest > MAX_DETECT_SIZE:
        scale = MAX_DETECT_SIZE / longest
        bgr = cv2.resize(bgr, None, fx=scale, fy=scale)

    return bgr


def crop_face(bgr):
    """Find the biggest face and return it cropped.
    DeepFace raises ValueError('Face could not be detected...') if none is found."""
    faces = DeepFace.extract_faces(
        img_path=bgr,
        detector_backend=DETECTOR,
        enforce_detection=True,
        align=False,
    )

    best = max(
        faces,
        key=lambda f: f["facial_area"]["w"] * f["facial_area"]["h"],
    )
    area = best["facial_area"]
    x, y, w, h = area["x"], area["y"], area["w"], area["h"]

    margin = int(FACE_MARGIN * w)
    top = max(y - margin, 0)
    bottom = min(y + h + margin, bgr.shape[0])
    left = max(x - margin, 0)
    right = min(x + w + margin, bgr.shape[1])

    return bgr[top:bottom, left:right]


def predict_emotion(face_bgr):
    """Return the model's probability (0 to 1) for every emotion."""
    rgb = cv2.cvtColor(face_bgr, cv2.COLOR_BGR2RGB)
    rgb = cv2.resize(rgb, (IMG_SIZE, IMG_SIZE), interpolation=cv2.INTER_LINEAR)
    face = rgb.astype("float32")

    # Average the prediction of the face and its mirror image (more stable).
    batch = np.stack([face, face[:, ::-1, :]])
    return emotion_model.predict(batch, verbose=0).mean(axis=0)


# ==========================================================
# SETTINGS
# ==========================================================

# Maximum image upload size: 10 MB
app.config["MAX_CONTENT_LENGTH"] = 10 * 1024 * 1024

# Allowed image formats
ALLOWED_EXTENSIONS = {"jpg", "jpeg", "png", "webp"}

EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
USERNAME_RE = re.compile(r"^[A-Za-z0-9._-]{3,30}$")
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


def json_error(message, status=400):
    return jsonify({"success": False, "error": message}), status


def parse_birthdate(raw):
    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%d/%m/%Y", "%B %d, %Y", "%b %d, %Y"):
        try:
            return datetime.strptime(raw, fmt).date()
        except ValueError:
            continue
    return None


def age_from(born):
    today = date.today()
    return today.year - born.year - (
        (today.month, today.day) < (born.month, born.day)
    )


# ==========================================================
# LOGIN HELPERS
# ==========================================================

def login_required(view):
    """Block the route unless the user is logged in."""
    @wraps(view)
    def wrapped(*args, **kwargs):
        if "user_id" not in session:
            return jsonify({"success": False, "error": "Please log in."}), 401
        return view(*args, **kwargs)
    return wrapped


def is_strong_password(password):
    return bool(
        len(password) >= 8
        and re.search(r"[A-Z]", password)
        and re.search(r"[a-z]", password)
        and re.search(r"\d", password)
        and re.search(r"[^A-Za-z0-9]", password)
    )


# ==========================================================
# FRONTEND FILES
# ==========================================================

# Homepage (login page)
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
# API ROUTES: ACCOUNTS
# ==========================================================

# Backend status
@app.route("/api/status")
def backend_status():
    return jsonify({
        "status": "running",
        "message": "EmotiScan backend is connected!"
    })


# Create a new account
@app.route("/api/register", methods=["POST"])
def register():
    data = request.get_json(silent=True) or {}

    first = (data.get("first_name") or "").strip()
    last = (data.get("last_name") or "").strip()
    email = (data.get("email") or "").strip().lower()
    username = (data.get("username") or "").strip().lower()
    password = data.get("password") or ""

    if not (first and last and email and username and password):
        return jsonify({
            "success": False,
            "error": "Please fill in all required fields."
        }), 400

    if not re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", email):
        return jsonify({
            "success": False,
            "error": "Please enter a valid email address."
        }), 400

    if not is_strong_password(password):
        return jsonify({
            "success": False,
            "error": (
                "Password needs 8+ characters with uppercase, "
                "lowercase, a number and a special character."
            )
        }), 400

    # Birthdate must be sent as YYYY-MM-DD (convert it in register.js).
    birthdate = None
    if data.get("birthdate"):
        try:
            birthdate = date.fromisoformat(data["birthdate"])
        except ValueError:
            return jsonify({
                "success": False,
                "error": "Invalid birthdate."
            }), 400

        if birthdate >= date.today():
            return jsonify({
                "success": False,
                "error": "Birthdate must be in the past."
            }), 400

    if User.query.filter_by(username=username).first():
        return jsonify({
            "success": False,
            "error": "Username is already taken."
        }), 409

    if User.query.filter_by(email=email).first():
        return jsonify({
            "success": False,
            "error": "Email is already registered."
        }), 409

    user = User(
        first_name=first,
        last_name=last,
        birthdate=birthdate,
        email=email,
        username=username,
        password_hash=generate_password_hash(password),
    )
    db.session.add(user)
    db.session.commit()

    return jsonify({
        "success": True,
        "message": "Account created. You can log in now."
    }), 201


# Log in with username OR email
@app.route("/api/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}

    identifier = (data.get("username") or "").strip().lower()
    password = data.get("password") or ""

    user = User.query.filter(
        (User.username == identifier) | (User.email == identifier)
    ).first()

    if not user or not check_password_hash(user.password_hash, password):
        return jsonify({
            "success": False,
            "error": "Incorrect username or password."
        }), 401

    session.clear()
    session["user_id"] = user.id

    return jsonify({"success": True, "user": user.to_dict()})


# Log out
@app.route("/api/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"success": True})


# Current logged-in user (for Profile and the navbar)
@app.route("/api/me")
@login_required
def me():
    user = db.session.get(User, session["user_id"])

    if user is None:
        session.clear()
        return jsonify({"success": False, "error": "Please log in."}), 401

    return jsonify({"success": True, "user": user.to_dict()})


# ==========================================================
# API ROUTES: PROFILE MANAGEMENT
# ==========================================================

# Update profile details (First Name, Last Name, Username, Email, Birthdate)
@app.route("/api/profile", methods=["PUT"])
@login_required
def update_profile():
    user = db.session.get(User, session["user_id"])
    if user is None:
        session.clear()
        return json_error("User not found.", 404)

    data = request.get_json(silent=True) or {}
    first_name = (data.get("firstName") or "").strip()
    last_name = (data.get("lastName") or "").strip()
    email = (data.get("email") or "").strip().lower()
    username = (data.get("username") or "").strip()
    birthdate_raw = (data.get("birthdate") or "").strip()

    if not all([first_name, last_name, email, username]):
        return json_error("First name, last name, username, and email are required.", 400)

    if len(first_name) > 50 or len(last_name) > 50:
        return json_error("Names must be 50 characters or fewer.", 400)

    if not EMAIL_RE.match(email) or len(email) > 254:
        return json_error("Please enter a valid email address.", 400)

    if not USERNAME_RE.match(username):
        return json_error('Username must be 3-30 characters (letters, numbers, ".", "_" or "-").', 400)

    birthdate = None
    if birthdate_raw:
        try:
            birthdate = date.fromisoformat(birthdate_raw)
        except ValueError:
            birthdate = parse_birthdate(birthdate_raw)

        if birthdate is None:
            return json_error("Please enter a valid birthdate.", 400)
        if birthdate > date.today():
            return json_error("Birthdate cannot be in the future.", 400)
        if age_from(birthdate) < MIN_AGE:
            return json_error(f"You must be at least {MIN_AGE} years old.", 400)

    if User.query.filter(User.email == email, User.id != user.id).first():
        return json_error("That email is already in use by another account.", 409)

    if User.query.filter(func.lower(User.username) == username.lower(), User.id != user.id).first():
        return json_error("That username is already taken.", 409)

    try:
        user.first_name = first_name
        user.last_name = last_name
        user.email = email
        user.username = username
        user.birthdate = birthdate
        db.session.commit()
    except Exception as error:
        db.session.rollback()
        print("Profile update error:", error)
        return json_error("Failed to update profile.", 500)

    return jsonify({
        "success": True,
        "message": "Profile updated successfully!",
        "user": user.to_dict()
    })


# Change password
@app.route("/api/profile/password", methods=["PUT"])
@login_required
def update_password():
    user = db.session.get(User, session["user_id"])
    if user is None:
        session.clear()
        return json_error("User not found.", 404)

    data = request.get_json(silent=True) or {}
    current_password = data.get("currentPassword") or ""
    new_password = data.get("newPassword") or ""

    if not current_password or not new_password:
        return json_error("Please fill in all password fields.", 400)

    if not check_password_hash(user.password_hash, current_password):
        return json_error("Current password is incorrect.", 401)

    if not (8 <= len(new_password) <= 128) or not re.search(r"[a-zA-Z]", new_password) or not re.search(r"[0-9]", new_password):
        return json_error("New password must be at least 8 characters with letters & numbers.", 400)

    try:
        user.password_hash = generate_password_hash(new_password)
        db.session.commit()
    except Exception as error:
        db.session.rollback()
        print("Password update error:", error)
        return json_error("Failed to update password.", 500)

    return jsonify({"success": True, "message": "Password updated successfully!"})


# Upload profile picture
@app.route("/api/profile/avatar", methods=["POST"])
@login_required
def upload_avatar():
    user = db.session.get(User, session["user_id"])
    if user is None:
        return json_error("User not found.", 404)

    if "avatar" not in request.files:
        return json_error("No image provided.", 400)

    file = request.files["avatar"]
    if file.filename == "" or not allowed_file(file.filename):
        return json_error("Please upload JPG, JPEG, PNG, or WEBP.", 400)

    temp_path = None
    try:
        suffix = Path(secure_filename(file.filename)).suffix.lower()
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as temp_file:
            temp_path = temp_file.name
            file.save(temp_path)

        user.avatar = make_thumbnail(temp_path, max_size=300)
        db.session.commit()

        return jsonify({
            "success": True,
            "avatar_url": f"/api/users/{user.id}/avatar?t={int(time.time())}"
        })
    except Exception as error:
        db.session.rollback()
        print("Avatar upload error:", error)
        return json_error("Failed to upload avatar.", 500)
    finally:
        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)


# Serve user's profile picture
@app.route("/api/users/<int:user_id>/avatar")
def get_user_avatar(user_id):
    user = db.session.get(User, user_id)
    if user is None or not user.avatar:
        return json_error("Avatar not found.", 404)
    return Response(user.avatar, mimetype="image/jpeg")


# ==========================================================
# API ROUTES: SCANS & EMOTION ANALYSIS
# ==========================================================

# Analyze facial expression and save the result
@app.route("/api/analyze", methods=["POST"])
@login_required
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

        # 1. Read the photo, 2. find and crop the face,
        # 3. let OUR model predict the emotion.
        photo = read_photo_as_bgr(temp_path)
        face = crop_face(photo)
        probabilities = predict_emotion(face)

        # Pick the emotion with the highest probability.
        best_index = int(np.argmax(probabilities))
        dominant_emotion = CLASS_NAMES[best_index]
        emotion_score = round(float(probabilities[best_index]) * 100, 2)

        all_scores = {
            name: round(float(p) * 100, 2)
            for name, p in zip(CLASS_NAMES, probabilities)
        }

        print("EMOTISCAN EMOTION SCORES:", all_scores)
        print("EMOTISCAN DETECTED EMOTION:", dominant_emotion)

        # Save the result and a small copy of the photo for this user.
        scan = Scan(
            user_id=session["user_id"],
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
            "scores": all_scores,
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


# List the logged-in user's scans (newest first) for the History page
@app.route("/api/history")
@login_required
def get_history():
    scans = (
        Scan.query
        .filter_by(user_id=session["user_id"])
        .order_by(Scan.created_at.desc())
        .all()
    )
    return jsonify([scan.to_dict() for scan in scans])


# Show the saved photo of one scan
@app.route("/api/scans/<int:scan_id>/image")
@login_required
def get_scan_image(scan_id):
    scan = db.session.get(Scan, scan_id)

    if scan is None or scan.user_id != session["user_id"]:
        return jsonify({"error": "Scan not found."}), 404

    return Response(scan.image, mimetype="image/jpeg")


# Delete one scan (and its photo)
@app.route("/api/scans/<int:scan_id>", methods=["DELETE"])
@login_required
def delete_scan(scan_id):
    scan = db.session.get(Scan, scan_id)

    if scan is None or scan.user_id != session["user_id"]:
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
# use_reloader=False stops the model from loading twice in debug mode.
if __name__ == "__main__":
    app.run(debug=True, use_reloader=False)