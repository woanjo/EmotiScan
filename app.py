from flask import Flask, jsonify, request, send_from_directory
from pathlib import Path
from deepface import DeepFace
from werkzeug.utils import secure_filename
import tempfile
import os

# Initialize Flask
app = Flask(__name__)

BASE_DIR = Path(__file__).resolve().parent

# Maximum image upload size: 10 MB
app.config["MAX_CONTENT_LENGTH"] = 10 * 1024 * 1024

# Allowed image formats
ALLOWED_EXTENSIONS = {"jpg", "jpeg", "png", "webp"}

def allowed_file(filename):
    return (
        "." in filename
        and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS
    )

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

# Backend status
@app.route("/api/status")
def backend_status():
    return jsonify({
        "status": "running",
        "message": "EmotiScan backend is connected!"
    })

# Analyze facial expression
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

        # Get emotion scores
        emotions = result.get("emotion", {})

        # Get the most dominant emotion
        dominant_emotion = result.get(
            "dominant_emotion",
            "unknown"
        )

        # Get the score for the dominant emotion
        emotion_score = emotions.get(
            dominant_emotion,
            0
        )

        return jsonify({
            "success": True,
            "emotion": dominant_emotion,
            "score": round(float(emotion_score), 2),
            "message": "Facial expression analyzed successfully."
        })

    except Exception as error:

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

# Handle oversized uploads
@app.errorhandler(413)
def file_too_large(error):
    return jsonify({
        "error": "Image is too large. Maximum size is 10 MB."
    }), 413

# Start Flask
if __name__ == "__main__":
    app.run(debug=True)
