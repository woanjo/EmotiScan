from flask import Flask, jsonify, request, send_from_directory, Response
from flask_sqlalchemy import SQLAlchemy
from dotenv import load_dotenv
from pathlib import Path
from datetime import datetime, timezone
from deepface import DeepFace
from werkzeug.utils import secure_filename
from PIL import Image, ImageOps
import tempfile
import io
import os

# Load DATABASE_URL from the .env file
load_dotenv()

# Initialize Flask
app = Flask(__name__)

BASE_DIR = Path(__file__).resolve().parent

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
with app.app_context():
    db.create_all()

# ==========================================================
# SETTINGS
# ==========================================================

# Maximum image upload size: 10 MB
app.config["MAX_CONTENT_LENGTH"] = 10 * 1024 * 1024

# Allowed image formats
ALLOWED_EXTENSIONS = {"jpg", "jpeg", "png", "webp"}


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

        # EmotiScan supports only these six emotions.
        supported_emotions = [
            "happy",
            "angry",
            "disgust",
            "fear",
            "neutral",
            "sad",
            "surprise"
        ]

        # Keep only the six supported emotions.
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