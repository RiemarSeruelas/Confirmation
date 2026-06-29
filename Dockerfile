FROM node:20-alpine

WORKDIR /app

# Keep dev deps during image build because Vite is needed to build the React app.
ENV NODE_ENV=development

COPY package*.json ./
RUN npm install --include=dev

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV PORT=5178

EXPOSE 5178

CMD ["node", "server.js"]
