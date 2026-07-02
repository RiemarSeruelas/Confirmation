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
app.machine_configs
```

`setup-db` does not create a PostgreSQL database. It only creates or updates the tables inside the database you set in `.env`.

## Main features

- Clean login screen with Login, Register, Machines, and Admin.
- Light purple to light blue background.
- Face login through your Face AI workstation.
- Register operator with name, site, and face.
- Admin skip button for now.
- Admin can register operators or admins.
- Admin can create machine setups: machine name, site, details, image, input fields, required fields, field limits, and callout locations.
- Record input is generated from the admin machine setup.
- Operators can submit machine responses without retyping repeated values; the form preloads the latest saved values for the selected machine, even if another operator submitted them.
- Admin can view submission logs and registered people.
- Machines/dashboard reads the configured machine setup and saved confirmation records.

## Latest record preload

Shift locking has been removed. When an operator selects a machine, the form automatically loads the latest saved response for that machine, regardless of who submitted it. The operator can adjust only what changed and submit a new log entry.

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


## Machine Builder storage

Admin-created machine setups are stored in PostgreSQL in:

```text
app.machine_configs
```

The uploaded machine image is converted in the browser into a compact JPEG base64 data URL, then saved in `image_data_url`. The app renders that same value back as an image in Machines and in the admin preview.

Run this after replacing files so the table/columns exist:

```bash
npm run setup-db
```

## Machine-specific dashboard feed

Machines now scopes the live values to the selected machine.

When you pick a machine, the app calls:

```text
GET /api/dashboard/summary?machine_config_id=<machine_id>
```

That endpoint only returns the latest submissions for that selected machine. It matches by `machine_config_id`, with a fallback match by `machine_name` for older rows that may not have the config ID yet.

## Latest design update

- Machines is now light/white instead of the large blue panel.
- The left panel is simplified into a compact selected-machine/latest-record summary.
- Admin callout positions are treated as anchor points on the machine image.
- Machines shows each callout with a dot and connector line pointing to the configured location.

## Latest System Page Notes

- The System machine dropdown now lists only saved machine setups.
- `+ New Setup` creates a blank setup; no default template machine is auto-created.
- The left builder panel scrolls independently, and the preview stays visible on the right.

## Latest navigation update

The dashboard is now split into two separate pages:

- **Machines**: shows the selected machine image/interface and live callouts only.
- **Trends**: shows reading trends, threshold status, warning system, and a side list of each machine.

Threshold limits are configured per numeric input field in Admin → System → Input Fields.


## Latest update

- Logs now include an automatic machine filter populated from saved machine setups and existing submissions.
- Logs keep the existing search, machine, site, and date filters.

## Latest UI update

- System page now combines Machine Builder + Point Map into one workspace.
- Input Fields and Callouts are managed through pop-up editors.
- Callouts still support separate Card and Point placement.
- Backend/database logic is unchanged.
