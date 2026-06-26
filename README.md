# Confirmation React + DB Simple

Fresh simple version.

No Docker.
No client/server folders.
One React app plus one small Express API in the same folder.

The form saves to PostgreSQL:

```txt
mydatabase -> Schemas -> app -> confirmation_test_records
```

## 1. Create `.env`

Copy:

```powershell
copy .env.example .env
```

Then edit `.env` with the real DB username/password.

Example:

```env
PORT=5057
TZ=Asia/Manila

DB_HOST=10.156.119.155
DB_PORT=5432
DB_NAME=mydatabase
DB_USER=myuser
DB_PASSWORD=mypassword
DB_SSL=false
```

## 2. Install

```powershell
npm.cmd install
```

## 3. Make/check DB table

```powershell
npm.cmd run make-db
```

## 4. Run

```powershell
npm.cmd run dev
```

Open:

```txt
http://localhost:5173
```

The backend API runs at:

```txt
http://localhost:5057
```

## API

```txt
GET  /api/health
GET  /api/records
POST /api/records
```
