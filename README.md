# Confirmation / Utilities — Full Project

This is the complete current project, including the frontend, Express backend,
PostgreSQL setup, Docker build, and Nginx reverse proxy.

## Important: keep your existing data

The ZIP does not contain your real `.env` or database data.

1. Keep the `.env` from your currently working project.
2. Do not delete your PostgreSQL database.
3. Do not run Docker commands that remove volumes.

Replacing these project files does not erase readings, machine configurations,
map markings, categories, proof images, or registered face identities. On
startup, `setup-db` only creates missing tables/columns/indexes.

If you no longer have an `.env`, copy `.env.example` to `.env`, then enter the
correct database password and verify the AI service addresses/model.

## Rebuild with Docker

Extract this ZIP into a new folder. Do not merge it into a folder that contains
an unfinished Git merge. Copy only your existing `.env` into the newly
extracted folder, then open PowerShell there.

Before building, you can verify that no Git conflict markers exist:

```powershell
Get-ChildItem -Recurse -File | Select-String '^(<<<<<<<|=======|>>>>>>>)'
```

The command should return no results. Then rebuild:

```powershell
docker compose down
docker compose up -d --build --force-recreate
docker compose ps
```

With `PUBLIC_PORT=5058`, open:

```text
http://YOUR-PC-IP:5058
```

To check the image-reading service:

```powershell
docker compose logs -f confirmation
```

## Included latest fixes

- Bottom-anchored compact Logs table and Nginx traffic handling
- Correct Asia/Manila submission timestamps with API caching disabled
- Equipment categories and entry-based Trends
- Operator/Machine Trends mode
- Shared Machines/System map sizing and coordinates
- Qwen image parsing from `response`, `thinking`, direct values, and plain text
- One safe AI retry when the first image result is empty
- PostgreSQL proof-image storage and existing face-recognition integration

## Main files

```text
src/App.jsx
src/styles.css
src/mobile.css
server.js
schema.sql
confirmationproof.sql
Dockerfile
docker-compose.yml
nginx.conf
```
