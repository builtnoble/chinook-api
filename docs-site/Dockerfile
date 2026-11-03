# The docs site: the API's spec is turned into pages by the generator, built
# into a static site with the private theme, and served by nginx.
#
# Build from the repository root. The theme is private, so it is passed in as a
# named build context:
#
#   docker buildx build -f docs-site/Dockerfile \
#     --build-context theme=../chinook-docs-theme \
#     -t builtnoble/chinook-docs .
#
# Only the last stage ends up in the image: the static files and nginx. The
# theme's source stays in the earlier stages. The first three stages run on the
# machine doing the build, whatever its architecture, because the site they
# produce is the same everywhere. Only the nginx stage differs by platform, and
# it just copies files, so building for several platforms needs no emulation.

# 1. Export openapi.json from the API. It needs no database and no running
# server.
FROM --platform=$BUILDPLATFORM oven/bun:1.2-debian AS spec
WORKDIR /repo
COPY package.json bun.lock bunfig.toml ./
COPY api/package.json api/
COPY docs-site/package.json docs-site/
RUN bun install --frozen-lockfile --filter @chinook-api/api
COPY api/ api/
WORKDIR /repo/api
RUN bun run openapi:export /out/openapi.json

# 2. Turn the spec and the Markdown in docs/ into the theme's pages. The
# generator only needs its own packages, so only those are installed. The
# license script is also bundled here, together with the one package it uses,
# for the stage that runs it.
FROM --platform=$BUILDPLATFORM oven/bun:1.2-debian AS content
WORKDIR /repo
COPY package.json bun.lock bunfig.toml ./
COPY api/package.json api/
COPY docs-site/package.json docs-site/
RUN bun install --frozen-lockfile --production --filter @chinook-api/docs-site
COPY docs/ docs/
COPY docs-site/generator docs-site/generator
COPY docs-site/content docs-site/content
COPY docs-site/scripts/third-party-licenses.mjs docs-site/scripts/
COPY --from=spec /out/openapi.json /out/openapi.json
RUN bun docs-site/generator/index.ts --spec /out/openapi.json --pages docs-site/content/pages.json --out /out/content
RUN bun build docs-site/scripts/third-party-licenses.mjs --target bun --outfile /out/third-party-licenses.mjs

# 3. The theme with the generated pages added, installed and ready to build.
FROM --platform=$BUILDPLATFORM node:22-alpine AS site-src
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /site
COPY --from=theme package.json package-lock.json ./
RUN npm ci
COPY --from=theme . .
COPY --from=content /out/content/ ./
ARG GIT_SHA=
ENV NEXT_PUBLIC_GIT_SHA=$GIT_SHA

# 3a. Build the static site that gets served.
FROM site-src AS site
RUN npm run build

# Bun, for the license script. The next stage runs Node on Alpine, so Bun is
# taken from its Alpine image.
FROM --platform=$BUILDPLATFORM oven/bun:1.2-alpine AS bun

# 3b. Build the site a second time with source maps, only to find out which
# packages end up in its JavaScript, and write their license notices. The maps
# and this build are not part of the image. The CSS framework's code is in the
# output too, so it is listed by name.
FROM site-src AS licenses
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
COPY --from=content /out/third-party-licenses.mjs /tools/third-party-licenses.mjs
RUN SOURCEMAPS=true npm run build \
    && bun /tools/third-party-licenses.mjs /site /third-party-licenses.txt --also tailwindcss,@tailwindcss/typography

# 4. Serve it. Only the static files and the license notices are copied in.
FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime
# The nginx image sets `maintainer` to the nginx maintainers, so it is cleared.
# The licenses label makes no claim, because the site's design comes from the
# Tailwind Plus Protocol template, which is not under the repository's MIT
# license.
LABEL org.opencontainers.image.title="chinook-docs" \
      org.opencontainers.image.description="Documentation site for the Chinook API, generated from its OpenAPI spec and served by nginx" \
      org.opencontainers.image.source="https://github.com/builtnoble/chinook-api" \
      org.opencontainers.image.licenses="NOASSERTION" \
      io.github.builtnoble.chinook-docs.design-license="Design derived from the Tailwind Plus Protocol template, used under the Tailwind Plus license (https://tailwindcss.com/plus/license). The image holds only the compiled static site." \
      maintainer=""
COPY docs-site/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=site /site/out /usr/share/nginx/html
COPY --from=licenses /third-party-licenses.txt /usr/share/nginx/html/third-party-licenses.txt
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -q --spider http://127.0.0.1:8080/ || exit 1
