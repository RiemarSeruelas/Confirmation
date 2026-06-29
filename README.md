# Confirmation Test DB App

React + Express + PostgreSQL app for confirmation test input, face registration/login, admin user registration, admin logs, and dashboard feed.

## What it uses

Use your existing PostgreSQL database from pgAdmin:

```text
Servers -> PeopleCounting -> Databases -> mydatabase -> Schemas -> app
```

So your `.env` should use:

```env
PGDATABASE=mydatabase
```

Inside that database, the app uses these tables:

```text
app.confirmation_test_records
app.face_identities
```

`setup-db` does not create a PostgreSQL database. It only creates or updates the tables inside the database you set in `.env`.

## Main features

- Clean login screen with Login, Register, View Machine, and Admin.
- Light purple to light blue background.
- Face login through your Face AI workstation.
- Register operator with name, site, face, and role defaulting to operator.
- Admin skip button for now.
- Admin can register operators or admins.
- Admin can create a manual account without face, or capture face for face login.
- Admin can view submission logs and registered people.
- Record input behaves like a clean input form.
- Operators can submit or edit only during the selected shift.
- Machine View/dashboard reads the saved confirmation records.

## Shift edit windows

```text
1st Shift: 06:00 - 14:00
2nd Shift: 14:00 - 22:00
3rd Shift: 22:00 - 06:00
```

The backend checks Manila time. A response can only be submitted or edited while the selected shift is active.

## Setup

Copy `.env.example` to `.env` and edit it.

Example:

```env
PORT=5178
NODE_ENV=development

PGHOST=10.156.119.155
PGPORT=5432
PGDATABASE=mydatabase
PGUSER=myuser
PGPASSWORD=your_password
PGSSL=false

AI_FACE_BASE_URL=http://10.156.119.146:5005
AI_FACE_REGISTER_PATH=/register
AI_FACE_SEARCH_PATH=/search
AI_FACE_MODEL_NAME=SFace
AI_FACE_DETECTOR_BACKEND=yunet
AI_FACE_ALIGN=true
AI_FACE_L2_NORMALIZE=true
AI_FACE_DISTANCE_METRIC=cosine
AI_FACE_SEARCH_METHOD=exact
```

Install and prepare DB tables:

```bash
npm install
npm run setup-db
```

Run the app:

```bash
npm run dev
```

Open:

```text
http://localhost:5179
```

Backend:

```text
http://localhost:5178
```

## Important camera note

Camera access works on `localhost`. If you open this from another PC using `http://server-ip`, the browser may block camera access because LAN camera access usually needs HTTPS.

## Useful API checks

Health:

```text
GET http://localhost:5178/api/health
```

Current shift:

```text
GET http://localhost:5178/api/shift-status
```

Records:

```text
GET http://localhost:5178/api/records
```

Admin users:

```text
GET http://localhost:5178/api/admin/users
```

Dashboard summary:

```text
GET http://localhost:5178/api/dashboard/summary
```
