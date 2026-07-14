from __future__ import annotations

import base64
import json
import os
import re
import tempfile
import threading
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

from docling.document_converter import DocumentConverter

HOST = os.getenv("DOCLING_HOST", "0.0.0.0")
PORT = int(os.getenv("DOCLING_PORT", "5006"))
MAX_IMAGE_BYTES = int(os.getenv("DOCLING_MAX_IMAGE_BYTES", str(10 * 1024 * 1024)))

_converter: DocumentConverter | None = None
_converter_lock = threading.Lock()


def get_converter() -> DocumentConverter:
    global _converter
    if _converter is None:
        _converter = DocumentConverter()
    return _converter


def decode_image_data_url(value: str) -> tuple[bytes, str]:
    source = str(value or "").strip()
    if not source:
        raise ValueError("imageDataUrl is required.")

    match = re.match(r"^data:(image/[A-Za-z0-9.+-]+);base64,(.+)$", source, re.DOTALL)
    mime_type = match.group(1) if match else "image/jpeg"
    encoded = match.group(2) if match else source

    try:
        image_bytes = base64.b64decode(encoded, validate=True)
    except Exception as error:
        raise ValueError("The image is not valid base64 data.") from error

    if not image_bytes:
        raise ValueError("The image is empty.")
    if len(image_bytes) > MAX_IMAGE_BYTES:
        raise ValueError(f"The image is larger than {MAX_IMAGE_BYTES // 1024 // 1024} MB.")

    suffixes = {
        "image/png": ".png",
        "image/webp": ".webp",
        "image/bmp": ".bmp",
        "image/tiff": ".tiff",
    }
    return image_bytes, suffixes.get(mime_type, ".jpg")


def convert_image(image_data_url: str) -> str:
    image_bytes, suffix = decode_image_data_url(image_data_url)
    temp_path: Path | None = None

    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
            temp_file.write(image_bytes)
            temp_path = Path(temp_file.name)

        with _converter_lock:
            result = get_converter().convert(temp_path)

        return result.document.export_to_markdown().strip()
    finally:
        if temp_path is not None:
            temp_path.unlink(missing_ok=True)


class DoclingHandler(BaseHTTPRequestHandler):
    server_version = "ConfirmationDocling/1.0"

    def log_message(self, format_string: str, *args: Any) -> None:
        print(f"{self.client_address[0]} - {format_string % args}")

    def send_json(self, status: int, payload: dict[str, Any]) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Connection", "close")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:
        self.send_response(HTTPStatus.NO_CONTENT)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.end_headers()

    def do_GET(self) -> None:
        if self.path.rstrip("/") == "/health":
            self.send_json(HTTPStatus.OK, {"ok": True, "service": "docling-local"})
            return
        self.send_json(HTTPStatus.NOT_FOUND, {"ok": False, "error": "Not found."})

    def do_POST(self) -> None:
        if self.path.rstrip("/") != "/extract":
            self.send_json(HTTPStatus.NOT_FOUND, {"ok": False, "error": "Not found."})
            return

        try:
            content_length = int(self.headers.get("Content-Length", "0"))
            if content_length <= 0:
                raise ValueError("The request body is empty.")
            if content_length > MAX_IMAGE_BYTES * 2:
                raise ValueError("The request body is too large.")

            body = self.rfile.read(content_length)
            payload = json.loads(body.decode("utf-8"))
            markdown = convert_image(payload.get("imageDataUrl", ""))

            self.send_json(
                HTTPStatus.OK,
                {
                    "ok": True,
                    "markdown": markdown,
                    "target": str(payload.get("target", "")),
                    "machineName": str(payload.get("machineName", "")),
                },
            )
        except ValueError as error:
            self.send_json(HTTPStatus.BAD_REQUEST, {"ok": False, "error": str(error)})
        except Exception as error:
            print(f"Docling conversion failed: {error}")
            self.send_json(
                HTTPStatus.INTERNAL_SERVER_ERROR,
                {"ok": False, "error": f"Docling conversion failed: {error}"},
            )


def main() -> None:
    server = ThreadingHTTPServer((HOST, PORT), DoclingHandler)
    print(f"Docling local service ready: http://{HOST}:{PORT}")
    print("Keep this window open while using the Confirmation app.")
    server.serve_forever()


if __name__ == "__main__":
    main()
