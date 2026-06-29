# Confirmation Test DB App

Simple React + Express + PostgreSQL app.

- Login opens the record input page.
- Register / Machine View opens the machine interface preview page.
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

## If you get 500 Internal Server Error

Usually it means the old table is missing the new `record_timestamp` column.

Run:

```bash
npm run setup-db
npm run dev
```

The server also now auto-checks the schema when `/api/health`, `/api/records`, or save record is called.

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
