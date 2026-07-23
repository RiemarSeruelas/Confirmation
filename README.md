# Power Tool

React + Express QR registration and review system for **ELC** and **Portable Tools**.

## Roles

- **User** — no login. Registers an equipment name, site, submitter, tool type, image, and the configured User Details.
- **Reviewer** — reviews requests, answers the configured Review Questions, approves or rejects, and manages Approved, Rejected, Expired, and Archived records.
- **Admin** — has the Reviewer workflow plus the Builder.

Default JSON accounts:

| Role | Username | Password |
| --- | --- | --- |
| Reviewer | `reviewer` | `1234` |
| Admin | `admin` | `1234` |

Change the passwords under `staffAccounts` in `server/data/db.json` before production use.

## Builder

The Admin Builder has two independent systems for each tool type:

- **User Details** — fields completed during registration.
- **Review Questions** — Google Forms-style questions completed only by a Reviewer or Admin.

Both support add, duplicate, reorder, delete, required/optional, answer types, and addable options. ELC starts with:

- Module Type
- Search Type
- From Date
- To Date
- Machine
- Power Supply (N/A if none)
- Vendor

All seven are adjustable. Portable Tools starts without extra details and can be configured in the same Builder.

## Review records

- Requests, Approved, Rejected, Expired, and Archived are separate views.
- Approved and Expired records include the permanent downloadable QR.
- Every row is a compact detail button with equipment name, site, QR/reference, status, and next check where applicable.
- Review answers can be expanded in short `Q1 👍` / `Q1 👎` cards.
- Approved, Rejected, and Expired records can be archived and restored.
- Search matches name, generated ID, site, reference, and QR while the field is labeled `Search Name or QR`.

## Run locally

```bash
npm ci
npm run dev
```

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:5057`

Always use `npm run dev`, not `npm run client`, so the React and Express processes run together.

## Run with Docker

```bash
docker compose down
docker compose build --no-cache
docker compose up -d
```

Open `http://SERVER-IP:5057`.

The JSON database uses the `power_tool_data` volume. Do not run `docker compose down -v` if you want to preserve records.

## Existing database behavior

Database version 7 migrates the previous Power Tool database without deleting existing requests, QR items, Builder fields, or usage totals. It also performs a one-time repair of the two staff logins so the credentials match the login screen:

- Reviewer: `reviewer` / `1234`
- Admin: `admin` / `1234`

After that migration, later username or password edits in `server/data/db.json` are preserved.

## Usage console log

Usage is not rendered in the interface. Visits, QR opens, checklist views, unique IP counts, and totals are logged by the backend. In Docker:

```bash
docker compose logs -f power-tool
```

## Mobile QR camera

Browsers normally require HTTPS for live camera access from another device. QR image upload and manual reference lookup remain available without camera permission.
