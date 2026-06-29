# Confirmation Test DB App

Simple React + Express + PostgreSQL app for saving manual confirmation test records into:

```sql
app.confirmation_test_records
```

## What it does

- Connects to PostgreSQL using `.env`
- Creates the PostgreSQL database if it does not exist
- Creates/updates the `app.confirmation_test_records` table
- Adds `record_timestamp` as the main timestamp for every saved test record
- Keeps `created_at` and `updated_at` as audit timestamps
- Opens with a temporary Login / Register landing page
- Login goes to the record input form
- Register opens a machine-interface style preview page inspired by the provided asset monitor screen
- Provides a web form for input
- Shows the latest saved records
- The machine-interface page fetches the latest DB record and uses `reading_value` as the main live reading callout

## Database timestamp fields

Your original table already had:

- `created_at` — when the row was inserted
- `updated_at` — when the row was last updated

This project also adds:

- `record_timestamp` — the actual timestamp of the confirmation test record

For now, the app saves `record_timestamp = NOW()` automatically when you click **Save Record**.

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Create your `.env`

Copy the example file:

```bash
copy .env.example .env
```

On PowerShell, you can also use:

```powershell
Copy-Item .env.example .env
```

Then edit `.env` and put your PostgreSQL details.

For normal local PostgreSQL on your PC, use this:

```env
PORT=5178
NODE_ENV=development

PGHOST=localhost
PGPORT=5432
PGDATABASE=confirmation_test_db
PGUSER=postgres
PGPASSWORD=your_password
PGMAINTENANCE_DATABASE=postgres
PGSSL=false
```

If the app is running inside Docker but PostgreSQL is installed on your PC, use this host instead:

```env
PGHOST=host.docker.internal
```

If PostgreSQL is another Docker container, use the container or compose service name, for example:

```env
PGHOST=postgres
```

### 3. Check the DB connection

Run this first if you are getting `ECONNREFUSED`:

```bash
npm run check-db
```

`ECONNREFUSED` usually means PostgreSQL is not running at the host/port in `.env`.

Common fixes:

1. Start PostgreSQL service.
2. Check that the port is really `5432`.
3. Check that `.env` is in the same folder as `package.json`.
4. If the app is inside Docker and PostgreSQL is on your PC, use `PGHOST=host.docker.internal`.
5. If PostgreSQL is another Docker container, use the container/service name as `PGHOST`.

### 4. Create/update the database and table

```bash
npm run setup-db
```

This does three things:

1. Connects first to `PGMAINTENANCE_DATABASE`, usually `postgres`
2. Creates your app database from `PGDATABASE` if it does not exist
3. Connects to that app database and creates/updates `app.confirmation_test_records`

You should see something like:

```text
🔎 Checking database: confirmation_test_db
✅ Database already exists: confirmation_test_db
✅ Connected to app database: ...
✅ Database schema is ready: app.confirmation_test_records
```

If the database is missing, you should see:

```text
🛠️ Creating database: confirmation_test_db
✅ Created database: confirmation_test_db
```

Important: the PostgreSQL user in `.env` needs permission to create a database. If it does not, use `postgres` or another admin user for `npm run setup-db`.

### 5. Run the app

```bash
npm run dev
```

Open during development:

```text
http://localhost:5179
```

The first screen now has two paths:

- **Login** → opens the record input page
- **Register / Machine View** → opens the machine-interface preview page

For now, this is temporary frontend navigation only. There is no real user authentication table yet.

Backend API runs on:

```text
http://localhost:5178
```

## Production build

```bash
npm run build
npm start
```

## API endpoints

### Health check

```http
GET /api/health
```

### Get latest records

```http
GET /api/records
```

### Save new record

```http
POST /api/records
Content-Type: application/json

{
  "operator_name": "Juan Dela Cruz",
  "machine_name": "Machine 1",
  "reading_value": 12.5,
  "product": "Sample Product",
  "batch_number": "BATCH-001",
  "shift_name": "1st Shift",
  "remarks": "OK"
}
```


## Machine interface preview

The Register / Machine View page currently uses this logic:

1. Fetch latest records from `GET /api/records?limit=20`
2. Use the latest row as the current machine value
3. Display `reading_value` as the main callout value
4. Fall back to temporary demo values if the DB has no records yet

Later, this can be connected to a specific machine table, AI workstation result, or live sensor table instead of the temporary confirmation records table.
