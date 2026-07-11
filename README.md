# API-EBook

NestJS backend for the E-Book admin demo. It provides auth, role-based admin APIs, books, categories, orders, stats, uploads, payments, and internal APIs used by the Python AI agent.

The public demo stack is:

- PostgreSQL + pgvector
- Redis
- NestJS API
- Python AI agent
- Next.js admin dashboard

The dashboard Copilot runtime lives in the Next.js app at `/api/copilotkit`.

## What This Project Does

API-EBook is the backend for a small e-book management demo. It is built as a practical admin API rather than a production SaaS template. The main goal is to show a complete flow:

- Admin signs in with JWT access/refresh tokens.
- Admin manages books, categories, chapters, orders, users, and dashboard stats.
- Covers and assets can be uploaded through Cloudinary.
- A Python AI agent can call protected internal APIs for book and analytics workflows.
- The Next.js dashboard talks to this API through secure server-side route handlers.

## Architecture

```text
Browser
  -> Next.js Dashboard
      -> httpOnly session cookie
      -> Next.js API routes / proxy layer
          -> NestJS API
              -> PostgreSQL + pgvector
              -> Redis
              -> Cloudinary
              -> Stripe payment module
              -> Internal API guarded by x-internal-api-key

Next.js /api/copilotkit
  -> Python AI Agent
      -> NestJS stats/books/internal APIs
```

Important notes:

- CopilotKit runtime is handled by the dashboard at `/api/copilotkit`.

## Main Features

- **Authentication**: signup, signin, access token, refresh token rotation, logout.
- **Authorization**: admin-only dashboard APIs using role checks.
- **Books**: CRUD, categories, stock, status, image URL, chapter relation.
- **Chapters**: markdown-style content management for each book.
- **Categories**: category CRUD, active state, slug lookup.
- **Orders**: admin order list, status updates, order items, user order history.
- **Stats**: overview, revenue, order, user, and book chart data.
- **Exports**: book content export to supported document formats.
- **Uploads**: Cloudinary integration for images.
- **AI support**: internal APIs and Python agent integration for dashboard workflows.

## Repositories

This demo is split into two public repositories. Clone both to run the full app:

- Backend API: <https://github.com/Hieuej147/ebook-api>
- Admin dashboard: <https://github.com/Hieuej147/ebook-dashboard>

Recommended folder layout:

```text
your-workspace/
  API-EBook/
  Dashboard/
    my-app/
```

Example:

```bash
mkdir ebook-demo
cd ebook-demo

git clone https://github.com/Hieuej147/ebook-api.git API-EBook
mkdir Dashboard
git clone https://github.com/Hieuej147/ebook-dashboard.git Dashboard/my-app
```

## Requirements

- Node.js 20+
- pnpm
- Docker + Docker Compose
- API keys listed below
- Python 3.12+ and `uv` if running the Python agent outside Docker

Keep `API-EBook` and `Dashboard/my-app` in the layout above if you want to use the full Docker compose from this repo. The compose file builds the dashboard from `../Dashboard/my-app`.

```text
your-workspace/
  API-EBook/
  Dashboard/
    my-app/
```

## Environment

Create `.env` in `API-EBook`.

```env
DB_USER=postgres
DB_PASS=123
DB_NAME=nest

DATABASE_URL=postgresql://postgres:123@localhost:5433/nest?schema=public
REDIS_URL=redis://localhost:6379
PORT=3000

JWT_SECRET=change-me-access-secret
JWT_REFRESH_SECRET=change-me-refresh-secret
INTERNAL_API_KEY=change-me-internal-api-key

OPENAI_API_KEY=your-openai-key
TAVILY_API_KEY=your-tavily-key

CLOUDINARY_NAME=your-cloudinary-name
CLOUDINARY_API_KEY=your-cloudinary-api-key
CLOUDINARY_API_SECRET=your-cloudinary-api-secret

ALLOWED_ORIGINS=http://localhost:3001

# Needed so the current payment module can boot.
# Use a Stripe test key if you want to test checkout.
STRIPE_SECRET_KEY=sk_test_dummy_for_demo_boot_only

SESSION_SECRET_KEY=change-me-min-32-characters-for-dashboard
```

### Env Notes

- `SESSION_SECRET_KEY` is used by the dashboard container in full Docker mode.
- `INTERNAL_API_KEY` must match what the Python agent sends to internal endpoints.
- `STRIPE_SECRET_KEY` can be a Stripe test key or the dummy value above if you only need the backend to boot.
- Cloudinary keys are required when testing image upload.
- OpenAI and Tavily keys are required for AI-assisted flows.

## Run With Docker

From `API-EBook`, after cloning both repos:

```bash
docker compose up --build
```

Services:

- API: `http://localhost:3000`
- Dashboard: `http://localhost:3001`
- Python agent: `http://localhost:8001`
- PostgreSQL: `localhost:5433`
- Redis: `localhost:6379`

The API container runs Prisma migrations on startup.

Seed data is not automatically inserted by Docker. If you need demo books/admin data after containers are running:

```bash
pnpm prisma db seed
```

## Run Locally

Start database services:

```bash
docker compose up db redis -d
```

Install and prepare the backend:

```bash
pnpm install
pnpm prisma migrate deploy
pnpm prisma db seed
pnpm start:dev
```

Run Prisma Studio when you need to inspect or edit data:

```bash
pnpm prisma studio
```

Run the Python AI agent:

```bash
cd ai-agent-python-v2
uv sync
uv run uvicorn main:app --reload --host 0.0.0.0 --port 8001
```

Then run the dashboard from `Dashboard/my-app`.

## Common API Areas

```text
POST /auth/signup
POST /auth/signin
POST /auth/refresh
POST /auth/logout

GET  /books
GET  /books/:id
POST /books/admin

GET  /category
GET  /category/list

GET  /orders/admin/all
GET  /stats/overview
GET  /stats/revenue/chart

GET  /export/:id/:format
```

Some routes require `Authorization: Bearer <accessToken>`. Internal AI routes also require `x-internal-api-key`.

## Admin Login

Seeded admin account:

```text
email: admin@ebook.com
password: Admin@123
```

Signup creates a normal `USER`. The dashboard is admin-only, so a newly registered account will be blocked until its role is changed.

To promote a user:

1. Run `pnpm prisma studio`.
2. Open the `users` table.
3. Change `role` from `USER` to `ADMIN`.
4. Save and log in again.

## Useful Scripts

```bash
pnpm start:dev          # run NestJS in watch mode
pnpm build              # build backend
pnpm prisma validate    # validate Prisma schema
pnpm prisma migrate deploy
pnpm prisma db seed
pnpm prisma studio
pnpm test
```

## Troubleshooting

- **Dashboard login is blocked**: the user role is probably `USER`; promote it to `ADMIN` in Prisma Studio.
- **API cannot connect to database locally**: check that `DATABASE_URL` uses `localhost:5433`, not Docker service name `db`.
- **API cannot connect to Redis locally**: check `REDIS_URL=redis://localhost:6379`.
- **Docker containers cannot connect to each other**: use service names in Docker env, for example `db`, `redis`, `api`, and `ai-agent-python`.
- **Payment module fails on boot**: set `STRIPE_SECRET_KEY` to a Stripe test key or the dummy test value in this README.
- **AI stats/book tools fail**: check `INTERNAL_API_KEY`, `OPENAI_API_KEY`, `TAVILY_API_KEY`, and `NESTJS_BASE_URL` for the Python agent.

## Notes

- `STRIPE_SECRET_KEY` is included so the backend payment module can initialize. The admin dashboard demo does not require checkout.
- Cloudinary keys are required for image upload flows.
- OpenAI and Tavily keys are required for the AI demo.
