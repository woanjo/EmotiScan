import os

os.environ.setdefault("TF_ENABLE_ONEDNN_OPTS", "0")

from flask import Flask, jsonify, request, send_from_directory, Response
from flask_sqlalchemy import SQLAlchemy
from dotenv import load_dotenv
from pathlib import Path
from datetime import datetime, timezone
from deepface import DeepFace
import keras
from werkzeug.utils import secure_filename
from PIL import Image, ImageOps
import numpy as np
import cv2
import tempfile
import json
import io

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