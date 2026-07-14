FROM node:22.23.1-bookworm-slim

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

WORKDIR /app

RUN corepack enable \
    && corepack prepare pnpm@9.15.9 --activate

COPY package.json package-lock.json* ./
RUN pnpm install --no-frozen-lockfile

COPY . .
RUN pnpm run build

ENV NODE_ENV=production
ENV PORT=5178

EXPOSE 5178

CMD ["sh", "-c", "pnpm run setup-db && pnpm run start"]
