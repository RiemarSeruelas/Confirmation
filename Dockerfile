FROM node:20-alpine

WORKDIR /app

# Build needs Vite, so keep dev/build dependencies during install.
ENV NODE_ENV=development
ENV NPM_CONFIG_PRODUCTION=false
ENV NPM_CONFIG_OMIT=

COPY package*.json ./
RUN npm install --include=dev --no-audit --no-fund

# If npm/Docker skips the Vite bin link, use the direct Vite JS file during build.
# If Vite is missing completely, install it once.
RUN test -f ./node_modules/vite/bin/vite.js || npm install vite @vitejs/plugin-react --include=dev --no-audit --no-fund

COPY . .
RUN node ./node_modules/vite/bin/vite.js build

ENV NODE_ENV=production
ENV PORT=5178

EXPOSE 5178

CMD ["node", "server.js"]
