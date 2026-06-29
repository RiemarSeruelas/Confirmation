FROM node:22-bullseye-slim

WORKDIR /app

# Keep dev deps during image build because Vite is needed to build the React app.
ENV NODE_ENV=development

COPY package*.json ./
RUN npm install -g npm@11.17.0
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV PORT=5178

EXPOSE 5178

CMD ["node", "server.js"]
