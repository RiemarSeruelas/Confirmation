# Confirmation Test DB App

Simple React + Express + PostgreSQL app with manual login, AI face login/register, record input, and machine interface preview.

- Login opens the record input page.
- Face Login captures one camera frame and sends it to the AI workstation through the backend.
- Register Face captures one camera frame and registers it to the AI workstation through the backend.
- Machine View opens the machine interface preview page.
- Records are saved to `app.confirmation_test_records`.
- Face/profile mapping is saved to `app.face_identities`.
- The app uses `record_timestamp`, `created_at`, and `updated_at`.
- The app database default is `confirmation_test_db`.

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
PGSSL=false
PORT=5178

AI_FACE_BASE_URL=http://10.156.119.146:5005
AI_FACE_REGISTER_PATH=/register
AI_FACE_SEARCH_PATH=/search
AI_FACE_IMAGE_FIELD=img
AI_FACE_NAME_FIELD=name
AI_FACE_TIMEOUT_MS=30000
AI_FACE_PAYLOAD_MODE=json
AI_FACE_MODEL_NAME=SFace
AI_FACE_DETECTOR_BACKEND=yunet
AI_FACE_ALIGN=true
AI_FACE_L2_NORMALIZE=true
AI_FACE_DISTANCE_METRIC=cosine
AI_FACE_SEARCH_METHOD=exact
```


## Exact PostgreSQL names used by the code

Default database:

```text
confirmation_test_db
```

Schema:

```text
app
```

Tables:

```text
app.confirmation_test_records
app.face_identities
```

So if you manually create the database as `confirmation_test_db`, the app code and `.env` will match.

Use this only when the app runs inside Docker but PostgreSQL is on your PC:

```env
PGHOST=host.docker.internal
```

## 3. Create the database manually once

The code expects this default database name:

```text
confirmation_test_db
```

Create it manually in pgAdmin, DBeaver, or psql. Example SQL:

```sql
CREATE DATABASE confirmation_test_db OWNER myuser;
```

If you want a different database name, create that database manually and set the same name in `.env` under `PGDATABASE`. The table names stay fixed.

## 4. Create/update schema and tables

```bash
npm run setup-db
```

This does not create the database anymore. It only creates/updates the schema and tables inside the database from `.env`.

## 5. Run

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

## Face recognition body format

The AI workstation sample uses JSON, not multipart upload.

Search sends this shape:

```json
{
  "model_name": "SFace",
  "detector_backend": "yunet",
  "align": true,
  "l2_normalize": true,
  "distance_metric": "cosine",
  "search_method": "exact",
  "img": "data:image/jpeg;base64,..."
}
```

Register sends this shape:

```json
{
  "name": "TestUser",
  "identity": "TestUser",
  "person_id": "TestUser",
  "model_name": "SFace",
  "detector_backend": "yunet",
  "align": true,
  "l2_normalize": true,
  "distance_metric": "cosine",
  "search_method": "exact",
  "img": "data:image/jpeg;base64,..."
}
```

The browser capture flow is:

```text
Camera frame
↓
Canvas 640x640 JPEG data URL
↓
/api/face/search or /api/face/register
↓
Express backend sends JSON body to Face AI
↓
Face AI returns match/id/hash/img_name
↓
App DB checks app.face_identities
↓
App returns the operator profile/details
```

## Local face profile table

The Face AI stores the embedding. The application stores the person details.

Table:

```text
app.face_identities
```

Important columns:

```text
operator_name
employee_id
department
role_name
email
ai_face_key
ai_identifiers
registered_at
last_seen_at
```

Register Face now does this:

```text
1. Send image to Face AI /register
2. Search the same image if needed to get the AI face key/hash/img_name
3. Save that AI key + operator details in app.face_identities
```

Face Login now does this:

```text
1. Send image to Face AI /search
2. Extract AI identifiers from the result
3. Find matching row in app.face_identities
4. Login as that app profile
```

To see registered local profiles:

```text
GET http://localhost:5178/api/face/identities
```

## Face AI HTTP 400

HTTP 400 means the app reached the AI workstation, but the AI rejected the request body.

For this Face AI, keep:

```env
AI_FACE_PAYLOAD_MODE=json
AI_FACE_IMAGE_FIELD=img
AI_FACE_NAME_FIELD=name
```

You can check the current backend config here while the backend is running:

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

The server also auto-checks the schema when `/api/health`, `/api/records`, `/api/face/register`, `/api/face/search`, or save record is called.

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

## Git ignore

`.gitignore` is included. It ignores:

```text
node_modules/
.env
dist/
logs/
*.log
.vscode/
.idea/
```
