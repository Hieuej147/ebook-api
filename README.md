# API-EBook

NestJS backend for the E-Book admin demo. It provides auth, role-based admin APIs, books, categories, orders, stats, uploads, payments, and internal APIs used by the Python AI agent.

The public demo stack is:

- PostgreSQL + pgvector
- Redis
- NestJS API
- Python AI agent
- Next.js admin dashboard

The dashboard Copilot runtime lives in the Next.js app at `/api/copilotkit`.

## Requirements

- Node.js 20+
- pnpm
- Docker + Docker Compose
- API keys listed below

Keep `API-EBook` and `Dashboard/my-app` as sibling folders if you want to use the full Docker compose from this repo:

```text
/mnt/disk2/
  API-EBook/
  Dashboard/my-app/
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

## Run With Docker

From `API-EBook`:

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

## Notes

- `STRIPE_SECRET_KEY` is included so the backend payment module can initialize. The admin dashboard demo does not require checkout.
- Cloudinary keys are required for image upload flows.
- OpenAI and Tavily keys are required for the AI demo.
