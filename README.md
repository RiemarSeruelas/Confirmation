# Confirmation Test DB App

Simple React + Express + PostgreSQL app with manual login, AI face login/register, record input, and machine interface preview.

- Login opens the record input page.
- Face Login captures one camera frame, sends it to the backend, then the backend forwards it to the AI workstation.
- Register Face captures one camera frame and registers it to the AI workstation.
- Machine View opens the machine interface preview page.
- Records are saved to `app.confirmation_test_records`.
- The app uses `record_timestamp`, `created_at`, and `updated_at`.

## 1. Install

```bash
npm install
```

## 2. Setup `.env`

Copy `.env.example` to `.env`.

Example:

```env
PGHOST=localhost
PGPORT=5432
PGDATABASE=confirmation_test_db
PGUSER=postgres
PGPASSWORD=your_password
PGMAINTENANCE_DATABASE=postgres
PGSSL=false
PORT=5178

AI_FACE_BASE_URL=http://10.156.119.146:5005
AI_FACE_REGISTER_PATH=/register
AI_FACE_SEARCH_PATH=/search
AI_FACE_IMAGE_FIELD=img
AI_FACE_NAME_FIELD=name
AI_FACE_TIMEOUT_MS=30000
AI_FACE_PAYLOAD_MODE=auto
```

Use this only when the app runs inside Docker but PostgreSQL is on your PC:

```env
PGHOST=host.docker.internal
```

## 3. Create database if missing

```bash
npm run setup-db
```

This creates the database if missing, then creates/updates the schema and table.

## 4. Run

```bash
npm run dev
```

Frontend:

```text
http://localhost:5179
```

Backend:

```text
http://localhost:5178
```

## Face recognition flow

The browser does not send the image directly to the AI workstation.

```text
Camera frame
↓
Canvas JPEG base64
↓
/api/face/search or /api/face/register
↓
Express converts base64 to binary file/blob
↓
multipart/form-data POST to AI workstation
↓
AI response returns name/match
```

The backend now uses this default mode:

```env
AI_FACE_PAYLOAD_MODE=auto
```

In auto mode, it tries the common formats until the Face AI accepts one:

```text
multipart/form-data: file, image, face, photo, upload
register name fields: name, person_name, operator_name, username, label
JSON base64: image, file, face, imageDataUrl
raw JPEG body
```

Keep these defaults first:

```env
AI_FACE_IMAGE_FIELD=img
AI_FACE_NAME_FIELD=name
AI_FACE_PAYLOAD_MODE=auto
```

If you already know the exact Flask format, you can force it:

```env
AI_FACE_PAYLOAD_MODE=multipart
AI_FACE_IMAGE_FIELD=image
AI_FACE_NAME_FIELD=name
```


## Face AI HTTP 400

HTTP 400 means the app reached the AI workstation, but the AI rejected the request format. The updated backend will try multiple image/name formats automatically. If all formats fail, the app shows which formats were tried and the last AI response message.

You can also check the current face config here while the backend is running:

```text
http://localhost:5178/api/face/config
```

## Camera note for LAN hosting

Camera access works on `localhost` during development. For LAN hosting like `http://server-ip:5055`, browser camera access is usually blocked because camera APIs require a secure context. Use HTTPS for the deployed site.

For internal deployment, use a reverse proxy such as Caddy or Nginx with HTTPS. Your frontend/backend can be HTTPS while the backend still calls the AI workstation over HTTP.

## If you get 500 Internal Server Error

Usually it means the old table is missing the new `record_timestamp` column.

Run:

```bash
npm run setup-db
npm run dev
```

The server also auto-checks the schema when `/api/health`, `/api/records`, or save record is called.

## Scripts

```bash
npm run dev       # run backend + frontend
npm run server    # backend only
npm run client    # frontend only
npm run setup-db  # create db if missing + apply schema
npm run check-db  # test DB connection
npm run build     # build frontend
npm start         # run backend for production build
```


## Face AI field fix

Your Face AI returned:

```text
'img' not found in request in either json or form data
```

So the app now sends the captured face using the `img` field first. Keep this in `.env`:

```env
AI_FACE_IMAGE_FIELD=img
AI_FACE_NAME_FIELD=name
AI_FACE_PAYLOAD_MODE=auto
```

The capture flow is:

```text
Browser camera → 640x640 JPEG base64 → backend → multipart/form-data img file → Face AI
```
