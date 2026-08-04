FROM node:22.23.1-bookworm-slim

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV NODE_ENV=production
ENV PORT=5178

WORKDIR /app

RUN corepack enable \
    && corepack prepare pnpm@9.15.9 --activate

COPY package.json pnpm-lock.yaml ./

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm run build

EXPOSE 5178

CMD ["pnpm", "run", "start"]
