# The docs site: the spec exported from the API, turned into pages by the generator, built into a static site with
# the private theme, and served by nginx.
#
# Build from the repository root. The theme is private and is passed as a named build context:
#
#   docker buildx build -f docs-site/Dockerfile --build-context theme=../chinook-docs-theme -t builtnoble/chinook-docs .
#
# Only the last stage ends up in the image: static files and nginx. The theme's source stays in the earlier stages.
# The first three stages run on the build machine's own architecture, since the site they produce is the same for
# every platform; only the nginx stage differs, and it only copies files, so a multi-platform build needs no emulation.

# 1. Export /openapi.json without a database or a running server.
FROM --platform=$BUILDPLATFORM oven/bun:1.2-debian AS spec
WORKDIR /repo/api
COPY api/package.json api/bun.lock ./
RUN bun install --frozen-lockfile
COPY api/ ./
RUN bun run openapi:export /out/openapi.json

# 2. Turn the spec and the Markdown in docs/ into the theme's pages. The generator has no dependencies.
FROM --platform=$BUILDPLATFORM oven/bun:1.2-debian AS content
WORKDIR /repo
COPY docs/ docs/
COPY docs-site/generator docs-site/generator
COPY docs-site/content docs-site/content
COPY --from=spec /out/openapi.json /out/openapi.json
RUN bun docs-site/generator/index.ts --spec /out/openapi.json --pages docs-site/content/pages.json --out /out/content

# 3. The theme with the generated pages written into it, installed and ready to build.
FROM --platform=$BUILDPLATFORM node:22-alpine AS site-src
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /site
COPY --from=theme package.json package-lock.json ./
RUN npm ci
COPY --from=theme . .
COPY --from=content /out/content/ ./
ARG GIT_SHA=
ENV NEXT_PUBLIC_GIT_SHA=$GIT_SHA

# 3a. Build the static site that is served.
FROM site-src AS site
RUN npm run build

# 3b. Build it again with source maps, only to learn which packages are bundled into its JavaScript, and write their
# license notices. The maps and this build are not part of the image. The CSS framework's code is in the output too, so
# it is listed by name.
FROM site-src AS licenses
COPY docs-site/scripts/third-party-licenses.mjs /tools/third-party-licenses.mjs
RUN SOURCEMAPS=true npm run build \
    && node /tools/third-party-licenses.mjs /site /third-party-licenses.txt --also tailwindcss,@tailwindcss/typography

# 4. Serve it. Only static files and the license notices are copied in.
FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime
COPY docs-site/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=site /site/out /usr/share/nginx/html
COPY --from=licenses /third-party-licenses.txt /usr/share/nginx/html/third-party-licenses.txt
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -q --spider http://127.0.0.1:8080/ || exit 1
