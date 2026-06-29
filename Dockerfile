FROM node:20-alpine

WORKDIR /app

# Install all dependencies needed to build the React/Vite frontend.
ENV NODE_ENV=development
ENV NPM_CONFIG_PRODUCTION=false

COPY package*.json ./
RUN npm install --include=dev --no-audit --no-fund

# Safety line: guarantees Vite exists even if the lock/cache was weird on Windows/Docker.
RUN npm install vite @vitejs/plugin-react --no-save --include=dev --no-audit --no-fund

COPY . .
RUN npx vite build

ENV NODE_ENV=production
ENV PORT=5178

EXPOSE 5178

CMD ["node", "server.js"]
