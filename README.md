# Chinook API (Bun + Hono + Drizzle ORM + Better Auth)

![Hono Version](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fbuiltnoble%2Fchinook-api%2Frefs%2Fheads%2Fmain%2Fpackage.json&query=%24.dependencies.hono&style=for-the-badge&logo=hono&label=hono&color=E36002)
![Better Auth Version](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fbuiltnoble%2Fchinook-api%2Frefs%2Fheads%2Fmain%2Fpackage.json&query=%24.dependencies.better-auth&style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB3aWR0aD0nNjAnIGhlaWdodD0nNDUnIHZpZXdCb3g9JzAgMCA2MCA0NScgY2xhc3M9J3ctNSBoLTUnIHhtbG5zPSdodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2Zyc+PHBhdGggZmlsbC1ydWxlPSdldmVub2RkJyBjbGlwLXJ1bGU9J2V2ZW5vZGQnIGQ9J00wIDBIMTVWMTVIMzBWMzBIMTVWNDVIMFYzMFYxNVYwWk00NSAzMFYxNUgzMFYwSDQ1SDYwVjE1VjMwVjQ1SDQ1SDMwVjMwSDQ1WicgZmlsbD0nd2hpdGUnPjwvcGF0aD48L3N2Zz4=&label=better-auth&color=2B2D3E)
![Drizzle Version](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fbuiltnoble%2Fchinook-api%2Frefs%2Fheads%2Fmain%2Fpackage.json&query=%24.dependencies.drizzle-orm&style=for-the-badge&logo=drizzle&label=drizzle&color=C5F74F)

This project is a **testing ground for building complex frontends** backed by a fast and modern API stack.

It uses **Bun**, **Hono**, **Drizzle ORM**, and **Better Auth** to power a lightweight, authenticated API for the classic [Chinook sample database](https://github.com/lerocha/chinook-database) — running on **PostgreSQL** via a custom Docker image that ships with the dataset preloaded.

While the main goal is to support frontend experimentation, the backend also serves as a demonstration of how quickly a fully featured and secure API can be built with new tools like **Bun**, **Hono**, and **Better Auth**.

---

## Why Bun + Hono?

This project was my first experience with both tools, and I was impressed by how easy it was to go from a clean slate to a working, type-safe API:

-   **Bun** — modern runtime with native TypeScript support and lightning-fast builds
-   **Hono** — small, elegant framework for APIs and edge runtimes
-   **Drizzle ORM** — type-safe SQL layer that makes working with Postgres straightforward
-   **Better Auth** — simple, extensible authentication system for modern TypeScript apps
-   **PostgreSQL** — the Chinook database in a custom preloaded Docker image
-   **Biome** — unified linting and formatting for clean, consistent code

---

## Features

-   Ready-to-use **Chinook dataset** served through REST endpoints
-   Full **email/password authentication** powered by **Better Auth**
-   Fully typed schema and queries with **Drizzle ORM**
-   **Docker Compose** setup that starts both the API and a preloaded Postgres image
-   **Compiled binary** using Bun — no Node.js required in production
-   Clean, consistent developer experience with **Biome**

---

## Authentication Overview

Authentication is handled by **Better Auth**, using the **[email and password](https://www.better-auth.com/docs/authentication/email-password#usage)** strategy.
This secures all API routes under `/api/*` except for the auth endpoints themselves.

### Auth Endpoints

Better Auth automatically generates these routes for email/password authentication:

| Method | Endpoint                  | Description                              |
| ------ | ------------------------- | ---------------------------------------- |
| POST   | `/api/auth/sign-up/email` | Create a new user account                |
| POST   | `/api/auth/sign-in/email` | Authenticate a user and return a session |
| POST   | `/api/auth/sign-out`      | Revoke the current session               |

All API routes requiring authentication will check the session before processing the request.
For example:

```
GET /api/artists
Authorization: Bearer <access_token>
```

If no valid session exists, a `401 Unauthorized` response is returned.

---

## Frontend Context

The **Chinook API** provides a stable, well-structured backend for testing and refining complex frontend patterns.
It’s used as a **sandbox environment** to explore:

-   Advanced data fetching and caching strategies
-   Real-world state management with relational data
-   API error handling and optimistic UI updates
-   Integration testing for frontend-to-API communication

By keeping the backend lightweight and predictable, it lets me focus on **frontend complexity and developer experience** without being blocked by setup overhead.

---

## Getting Started

### Prerequisites

-   [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/)
-   A `.env` file with configuration values for your environment

### Example `.env`

```env
APP_PORT=3000

# Comma-separated browser origins allowed to call the API and trusted by Better Auth, e.g. http://localhost:5173,http://localhost:3001
CORS_ORIGINS=

BETTER_AUTH_SECRET=
BETTER_AUTH_URL=

DB_USER=
DB_PASSWORD=
DB_HOST=
DB_PORT=
DB_NAME=
DB_URL=postgres://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$DB_NAME
```

`CORS_ORIGINS` must list the origin of any frontend that calls the API from a browser (for example your
Vite dev server). Requests from origins that are not listed receive no CORS headers and are blocked by the
browser. Leave it empty to allow no cross-origin browser requests.

Better Auth trusts the same list, so a listed frontend can also sign in and out when its requests carry
cookies; Better Auth's own base URL (`BETTER_AUTH_URL`) is always trusted. An origin that is in neither place
gets `403 INVALID_ORIGIN` on those requests.

---

### Run with Docker Compose

The `docker-compose.yml` file starts:

1. A **PostgreSQL** service preloaded with the Chinook dataset (from my published image)
2. The **Bun-compiled API** container

Command to run:

```sh
docker compose up --build
```

API will be available at:
👉 [http://localhost:3000](http://localhost:3000)

---

## Example Endpoints

Authenticated endpoints require a valid token or session.

```
GET /api/artists
Authorization: Bearer <access_token>
```

Example response:

```
{
	"data": {
		"id": 1,
		"name": "AC/DC"
	}
}
```

---

## Development Notes

### Local Development

```sh
bun install

# Run only the database container
docker compose up -d db

# Migrate the database
bunx drizzle-kit migrate

bun run dev
```

Bun automatically reads `.env` and compiles TypeScript natively.

### Linting & Formatting

Run Biome to check or fix code:

```sh
bunx biome check .
bunx biome check . --apply
```
