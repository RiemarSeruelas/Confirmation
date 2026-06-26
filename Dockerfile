FROM node:20-alpine AS client-builder

WORKDIR /app

COPY client/package*.json ./client/
RUN npm install --prefix client

COPY client ./client
RUN npm run build --prefix client


FROM node:20-alpine AS server-runtime

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5057

COPY server/package*.json ./server/
RUN npm install --omit=dev --prefix server

COPY server ./server
COPY --from=client-builder /app/client/dist ./client/dist

WORKDIR /app/server

EXPOSE 5057

CMD ["node", "src/index.js"]
