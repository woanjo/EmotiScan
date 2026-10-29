
from flask import Flask, jsonify, send_from_directory
from pathlib import Path

app = Flask(__name__)
BASE_DIR = Path(__file__).resolve().parent


@app.route("/")
def home():
    return send_from_directory(BASE_DIR, "index.html")


@app.route("/<path:filename>")
def frontend_files(filename):
    file_path = BASE_DIR / filename

    if file_path.is_file() and file_path.suffix.lower() in {
        ".html", ".css", ".js", ".png", ".jpg", ".jpeg",
        ".webp", ".svg", ".ico"
    }:
        return send_from_directory(BASE_DIR, filename)

    return jsonify({"error": "File not found"}), 404


@app.route("/api/status")
def backend_status():
    return jsonify({
        "status": "running",
        "message": "EmotiScan backend is connected."
    })


if __name__ == "__main__":
    app.run(debug=True)
