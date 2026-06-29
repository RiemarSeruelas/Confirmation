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
- Provides a web form for input
- Shows the latest saved records

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

You can use `DATABASE_URL`:

```env
DATABASE_URL=postgres://postgres:your_password@localhost:5432/confirmation_test_db
PGSSL=false
PORT=5178
```

Or separate values:

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

### 3. Create/update the database and table

```bash
npm run setup-db
```

This now does three things:

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

### 4. Run the app

```bash
npm run dev
```

Open during development:

```text
http://localhost:5179
```

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
