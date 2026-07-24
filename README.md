# Power Tool

React + Express QR registration and review system for **ELC** and
**Portable Tools**, backed by PostgreSQL and served through Nginx.

## Roles

- **User** — no login. Registers an equipment name, site, submitter, tool type, image, and the configured User Details.
- **Reviewer** — reviews requests, answers the configured Review Questions, approves or rejects, renews expired records, and manages Approved, Rejected, Expired, and Archived records.
- **Admin** — has the Reviewer workflow plus the Builder and Reviewer account management.

Initial accounts:

| Role | Username | Password |
| --- | --- | --- |
| Reviewer | `reviewer` | `1234` |
| Admin | `admin` | `engineering2026` |

Reviewer accounts are managed by Admin from the Accounts screen. The protected
Admin account is created during the first database migration.

## Builder

The Admin Builder has two independent systems for each tool type:

- **User Details** — fields completed during registration.
- **Review Questions** — Google Forms-style questions completed only by a Reviewer or Admin.

Both support add, duplicate, reorder, delete, required/optional, answer types,
and addable options. ELC starts with Module Type, Search Type, From Date, To
Date, Machine, Power Supply, and Vendor. Portable Tools starts without extra
details and can be configured in the same Builder.

## PostgreSQL configuration

Copy `.env.example` to `.env` and keep `.env` out of Git:

```powershell
Copy-Item .env.example .env
notepad .env
```

Required values:

```dotenv
POSTGRES_ENABLED=true
POSTGRES_HOST=10.156.119.155
POSTGRES_PORT=5432
POSTGRES_DB=mydatabase
POSTGRES_USER=myuser
POSTGRES_PASSWORD=your_real_password
POSTGRES_SCHEMA=app
```

The PostgreSQL account needs permission to connect to `mydatabase` and create
tables and indexes inside the existing `app` schema. The app creates only
`power_tool_*` tables and does not modify unrelated tables.

## One-time JSON import

On the first startup, if `app.power_tool_meta` is empty, the backend reads the
existing `server/data/db.json`, applies the existing v10 migration, and imports:

- Builder categories, User Details, and Review Questions
- Admin and Reviewer accounts
- Requests, Approved/Rejected records, QR items, images, and renewals
- Usage totals, visits, and events

After the import, PostgreSQL is the live source. `db.json` remains unchanged as
a rollback backup. Do not delete the `power_tool_data` Docker volume until the
import has been verified.

## Run locally

```powershell
npm ci
npm.cmd run dev
```

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:5057`

Always run both React and Express together. The server reads `.env`
automatically.

## Run with Docker and Nginx

```powershell
Copy-Item .env.example .env
# Edit .env before continuing

docker compose down
docker compose build --no-cache
docker compose up -d
```

Open `http://SERVER-IP:5057`.

Nginx owns host port `5057` and proxies to the private Node service. It provides
keep-alive connections, response compression, static-asset caching, request
buffering, per-client connection limits, and API rate limiting. The Node
container is not exposed directly.

Verify the deployment:

```powershell
docker compose ps
curl.exe http://127.0.0.1:5057/api/health
docker compose logs -f power-tool nginx
```

The health response must report `"provider":"postgresql"` and schema `"app"`.
If startup reports `ENETUNREACH`, test port `5432` from the Docker host and
confirm the Docker network has a route to `10.156.119.155`.

## PostgreSQL layout and concurrency

The backend stores each record separately in PostgreSQL JSONB:

- `app.power_tool_categories`
- `app.power_tool_legacy_categories`
- `app.power_tool_staff_accounts`
- `app.power_tool_requests`
- `app.power_tool_items`
- `app.power_tool_usage`
- `app.power_tool_meta`

Writes update only changed records, so simultaneous registrations do not
overwrite each other. Usage sessions and events are deduplicated while locked
inside a database transaction. The default pool is 20 connections per backend
container.

For more backend capacity:

```powershell
docker compose up -d --scale power-tool=2
```

Nginx dynamically discovers the scaled backend containers. Two containers with
`POSTGRES_POOL_MAX=20` can use up to 40 PostgreSQL connections, so keep
`replicas × POSTGRES_POOL_MAX` below the database server's available connection
limit.

For a much larger deployment, move uploaded images to object/file storage and
store only their paths in PostgreSQL, then add API pagination. Nginx improves
traffic handling, but PostgreSQL concurrency, indexes, pagination, and image
storage determine the main application capacity.

## Tests

```powershell
npm.cmd run build
npm.cmd run test:migration
npm.cmd run test:postgres
```

`test:postgres` uses an isolated in-memory PostgreSQL-compatible database. It
checks JSON import, record preservation, concurrent inserts, usage
deduplication, targeted deletion, health checks, and password-free connection
descriptions.

## Usage console log

Usage is not rendered in the interface. Visits, QR opens, checklist views,
unique IP counts, and totals are logged by the backend:

```powershell
docker compose logs -f power-tool
```

## Mobile QR camera

Browsers normally require HTTPS for live camera access from another device. QR
image upload and manual reference lookup remain available without camera
permission.
