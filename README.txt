CONFIRMATION — HTTP + MOBILE NATIVE CAMERA

This version does not use HTTPS certificates or a reverse proxy.

WHAT IT DOES
- Keeps the app on normal HTTP.
- Removes navigator.mediaDevices/getUserMedia live-stream camera code.
- Mobile uses the native camera through an image input with capture=user or capture=environment.
- PC opens the normal image file picker instead of trying to open a webcam.
- Face login/registration uses the front mobile camera.
- Machine proof scanning uses the rear mobile camera.
- The selected image is still sent to the existing AI endpoints and stored as proof.

REPLACE
- src/App.jsx with frontend/App.jsx
- src/styles.css with frontend/styles.css
- server.js with backend/server.js
- Dockerfile
- docker-compose.yml
- .dockerignore

DELETE FROM THE PROJECT IF PRESENT
- generate-certs.ps1
- .env.https-additions
- certs/ folder
- Any HTTPS-only server.js copied from Confirmation_Direct_HTTPS

REMOVE FROM .env IF PRESENT
- HTTPS_ENABLED
- HTTPS_KEY_PATH
- HTTPS_CERT_PATH

DO NOT DELETE
- schema.sql
- confirmationproof.sql
- makeDb.js
- db.js
- PostgreSQL settings

REBUILD

docker compose down
docker rm -f confirmation-app
docker compose --progress=plain build --no-cache
docker compose up -d
docker compose logs -f confirmation

OPEN

http://localhost:5058
http://172.27.1.92:5058

On mobile, tap Login, Register Face, or Scan Image. The phone should open its native camera. On PC, the same controls open a file picker.
