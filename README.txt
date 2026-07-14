CONFIRMATION — MOBILE FEED UI + AUTOMATIC DOCLING

CHANGED FRONTEND FILES
- frontend/App.jsx
- frontend/styles.css

AUTOMATIC DOCLING FILES
- server.js
- docling_service.py
- package.json
- Dockerfile
- Dockerfile.docling
- docker-compose.yml
- requirements-docling.txt
- .dockerignore

LOCAL DEVELOPMENT

Docling must already be installed in your active Python environment:

  python -m pip install docling

Then one command starts Docling, Express, and Vite:

  npm.cmd run dev

The three processes stop together when you press Ctrl+C.

DOCKER

Docker Compose now builds two containers:
- confirmation-app
- confirmation-docling

Run:

  docker compose down
  docker compose --progress=plain build --no-cache
  docker compose up -d
  docker compose logs -f

The first Docling Docker build is large and may take a while because Python OCR/model dependencies are installed. The model cache is retained in the docling-cache volume.

Open:

  http://localhost:5058
  http://192.168.0.242:5058

VERIFY

  docker ps
  docker exec confirmation-docling python -c "import urllib.request; print(urllib.request.urlopen('http://127.0.0.1:5006/health').read().decode())"
  docker exec confirmation-app node -e "fetch('http://docling:5006/health').then(async r=>console.log(r.status,await r.text())).catch(console.error)"

MOBILE REDESIGN

- Social-feed-inspired mobile header and navigation
- Larger CT brand header
- Icon navigation for Submit, Machines, Trends, and Logout
- Redesigned Area Confirmation card
- Mobile Answer/Latest segmented control
- Feed-style latest machine cards
- Field icons and cleaner rows for Status, Mode, Temperature, images, and other parameters
- Desktop functionality remains intact

COPYING

Your actual project normally stores App.jsx and styles.css under src/. Copy:

  frontend/App.jsx   -> src/App.jsx
  frontend/styles.css -> src/styles.css

Place every root file in the main project folder. Keep your existing .env, db.js, makeDb.js, schema.sql, confirmationproof.sql, index.html, vite.config.js, and src/main.jsx.

DOCLING PORT NOTE

The Docker Docling service is internal to the Compose network, so it does not take Windows port 5006. This prevents a conflict if you were previously testing docling_service.py locally.
