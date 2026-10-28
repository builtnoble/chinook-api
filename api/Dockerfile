FROM oven/bun:1.2-debian AS build

WORKDIR /app

COPY bun.lock package.json ./
RUN bun install --frozen-lockfile --production --verbose

COPY . .
RUN bun build --compile --minify --sourcemap ./src --outfile bun-chinook-api

FROM gcr.io/distroless/base-debian12:nonroot AS runner

ENV NODE_ENV=production

WORKDIR /app
COPY --from=build /app/bun-chinook-api .

ARG APP_PORT=3000
ENV APP_PORT=${APP_PORT}
EXPOSE ${APP_PORT}

ENTRYPOINT ["./bun-chinook-api"]
