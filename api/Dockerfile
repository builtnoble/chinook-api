FROM oven/bun:1.2-debian AS build

WORKDIR /app

# Build from the repository root. The lockfile covers every workspace, so each
# package.json is copied even though only the API is installed.
COPY package.json bun.lock bunfig.toml ./
COPY api/package.json api/
COPY docs-site/package.json docs-site/
RUN bun install --frozen-lockfile --production --filter @chinook-api/api --verbose

COPY api api
WORKDIR /app/api
RUN bun build --compile --minify --sourcemap ./src --outfile bun-chinook-api

FROM gcr.io/distroless/base-debian12:nonroot AS runner

ENV NODE_ENV=production

WORKDIR /app
COPY --from=build /app/api/bun-chinook-api .

ARG APP_PORT=3000
ENV APP_PORT=${APP_PORT}
EXPOSE ${APP_PORT}

ENTRYPOINT ["./bun-chinook-api"]
