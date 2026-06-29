# Confirmation Test DB App

Simple React + Express + PostgreSQL app for saving manual confirmation test records into:

```sql
app.confirmation_test_records
```

## What it does

- Connects to PostgreSQL using `.env`
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
DATABASE_URL=postgres://postgres:your_password@localhost:5432/your_database
PGSSL=false
PORT=5178
```

Or separate values:

```env
PGHOST=localhost
PGPORT=5432
PGDATABASE=your_database
PGUSER=postgres
PGPASSWORD=your_password
PGSSL=false
PORT=5178
```

### 3. Create/update the database table

```bash
npm run setup-db
```

You should see:

```text
✅ Connected to PostgreSQL
✅ Database schema is ready: app.confirmation_test_records
```

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
