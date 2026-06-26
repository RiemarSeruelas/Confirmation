# Confirmation DB Only

This is a fresh minimal project.

Purpose: prove that the app can insert data into PostgreSQL and read it back.

No camera.
No facial recognition.
No image storage.
No old tables required.

## Folder structure

```txt
confirmation-db-only/
├─ package.json
├─ Dockerfile
├─ client/
└─ server/
```

## 1. Create backend env

Create this file:

```txt
server/.env
```

Use this template:

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
npm.cmd run install:all
```

## 3. Create/check DB table

```powershell
npm.cmd run make-db
```

This creates:

```txt
mydatabase -> Schemas -> app -> confirmation_test_records
```

## 4. Run locally

```powershell
npm.cmd run dev
```

Open:

```txt
http://localhost:5173
```

Backend:

```txt
http://localhost:5057
```

## 5. Docker

Build:

```powershell
docker build -t confirmation-db-only .
```

Run:

```powershell
docker rm -f confirmation-db-only
docker run --env-file .\server\.env -p 5057:5057 --name confirmation-db-only confirmation-db-only
```

Open:

```txt
http://localhost:5057
```

## API

```txt
GET  /api/health
GET  /api/records
POST /api/records
```

Sample POST body:

```json
{
  "operator_name": "Justin",
  "machine_name": "Machine 1",
  "reading_value": 123.45,
  "remarks": "DB test"
}
```
