FROM node:20-alpine

WORKDIR /app

# Vite is needed during build, so install dev dependencies too.
ENV NODE_ENV=development
ENV NPM_CONFIG_PRODUCTION=false

COPY package*.json ./
RUN npm ci --include=dev --no-audit --no-fund --loglevel=error

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV PORT=5178

EXPOSE 5178

CMD ["node", "server.js"]
