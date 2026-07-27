# API-EBook backend

The API-EBook backend is the shared application API for the BookStudio ebook
platform. It is not an admin-only service: the same NestJS application supports
public catalogue reads, authenticated customer accounts, shopping cart and
checkout flows, admin content operations, statistics, exports, and AI-assisted
workflows.

It is built with NestJS, Prisma, PostgreSQL, Redis, and a separate Python
LangGraph agent. The API is framework-independent from the frontend: a Next.js
BFF currently consumes it, but a mobile app, storefront, or another backend can
call the documented HTTP API with the same authentication contract.

## Related projects

Related repositories:

- [Next.js dashboard](https://github.com/Hieuej147/ebook-dashboard)
- [ebook-api](https://github.com/Hieuej147/ebook-api)

Components in this repository:

- [Python LangGraph agent](./ai-agent-python-v2/)
- [Framework-agnostic thread-manager](./packages/thread-manager/)

## Main features

- **Public catalogue**: browse active books and categories, search by catalogue
  fields, view book details, and read published chapters.
- **Customer accounts**: sign up, sign in, refresh sessions, manage profile data,
  and enforce `USER`/`ADMIN` role boundaries.
- **Shopping flow**: add and update cart items, create orders, track order
  status, and associate payments with orders.
- **Inventory integrity**: validate stock and update inventory inside Prisma
  transactions so concurrent order operations do not silently oversell stock.
- **Admin content management**: create and update books, categories, chapters,
  publication status, images, and inventory.
- **Admin operations**: inspect users, orders, statistics, exports, and usage
  metrics through protected endpoints.
- **Search and embeddings**: store pgvector embeddings for semantic-search and
  AI-assisted catalogue workflows.
- **File and payment integrations**: use Cloudinary for media and the configured
  payment provider for payment lifecycle updates.
- **AI-assisted workflows**: connect LangGraph agents to books, statistics,
  writing, and action tools through protected NestJS APIs.
- **Persistent conversation threads**: expose AG-UI-compatible runs, reconnect,
  stop, list, rename, and delete operations with durable serialized events and
  LangGraph checkpoints. The runtime uses exactly three thread tables:
  `conversation_threads`, `agent_runs`, and `agent_events`.
- **Framework-neutral API contract**: keep domain rules in NestJS so the same API
  can serve the dashboard, a storefront, a mobile app, or another trusted client.

## What the backend owns

```text
Clients
  ├─ public storefront / mobile client
  ├─ authenticated customer client
  ├─ Next.js admin dashboard BFF
  └─ Python AI agent
          │
          ▼
      NestJS API (this repository)
          ├─ PostgreSQL + pgvector
          ├─ Redis
          ├─ Cloudinary
          ├─ payment provider
          └─ thread runtime / AG-UI
```

The API owns business rules and persistence. Frontends should not connect to
Prisma, PostgreSQL, Redis, or the Python agent directly.

## Domain modules

| Module | Responsibility |
| --- | --- |
| `auth` | Sign up, sign in, refresh-token rotation, sign out, current session |
| `user` | Customer profile and admin user management |
| `books` | Catalogue, search, inventory, book CRUD, soft-delete/status |
| `category` | Category CRUD and catalogue grouping |
| `chapters` | Chapter authoring and book/chapter relationships |
| `cart` | Customer cart and cart-item quantities |
| `orders` | Order creation, order history, status and inventory transactions |
| `payments` | Payment intents/status and order payment association |
| `stats` | Aggregated business metrics for authorized admin workflows |
| `export-doc` | Export book/chapter content |
| `embeding` | Vector embeddings and semantic-search support |
| `cloudinary` | Image/file upload integration |
| `thread-runtime` | Persistent AG-UI runs, serialized event replay, thread CRUD, lineage and titles |

The Prisma schema models users, books, categories, chapters, carts, orders,
payments, usage, and conversation threads. Foreign keys and Prisma transactions
protect relationships and stock updates. PostgreSQL's vector extension is used
for embedding storage.

## Authentication and authorization

Authentication uses a short-lived access token and a rotating refresh token.
Passwords are hashed with Argon2. Protected controllers use JWT guards and role
guards; `USER` and `ADMIN` are represented by the Prisma `Role` enum.

Typical access boundaries:

- Public catalogue endpoints may be used without a session.
- Customer endpoints require a valid user session and enforce ownership of carts,
  orders, and profile data.
- Admin endpoints require the `ADMIN` role.
- AI tools call only protected endpoints and must forward an authorized identity.

The Next.js dashboard stores session state in an encrypted `httpOnly` cookie and
forwards the access token server-side. A different client may use the API directly,
but should keep tokens in a secure platform-managed storage and never expose
refresh tokens to ordinary browser JavaScript.

## AI and AG-UI architecture

The Python service in `ai-agent-python-v2` runs LangGraph agents and exposes the
AG-UI-compatible agent endpoint. The dashboard's `/api/copilotkit` BFF forwards
AG-UI requests to the NestJS thread runtime, while NestJS forwards authorized
book/stats/action calls to the Python agent where appropriate.

```text
CopilotKit React
  -> Next.js /api/copilotkit BFF
      -> NestJS thread-runtime
          -> Persistent AgentRunner
              -> Python LangGraph agent
                  -> NestJS protected domain APIs
```

No custom AG-UI transport is implemented in the frontend. Streaming is preserved
by forwarding the upstream response body/SSE stream.

## Conversation threads

The framework-agnostic package in `packages/thread-manager` provides stores,
checkpointers, runner persistence, and plain route handlers. The Nest adapter in
`src/module/thread-runtime` adds request identity, Prisma-backed thread metadata,
serialized event persistence, Redis run coordination, lineage fields, and title
generation.

The critical invariant is one namespace and one identifier:

```text
CopilotKit threadId
  === LangGraph configurable.thread_id
  === ConversationThread.id
  === AgentEvent.threadId
```

Runs create or touch metadata before execution. Connect-before-run creates a safe
stub thread instead of returning a 404. Stream events are compacted into
portable AG-UI snapshots after the terminal event. The first user message can
be used to generate a thread title. A run also carries `parentRunId`,
`rootRunId`, `depth`, and `kind` so future subagents can be added without
changing the storage contract.

Detailed local architecture and implementation notes are kept in
[`docs/THREADS_ARCHITECTURE.md`](docs/THREADS_ARCHITECTURE.md); the current
delivery summary is in [`docs/THREAD_RUNTIME_SUMMARY.md`](docs/THREAD_RUNTIME_SUMMARY.md).

For local package development use:

```env
STORE_DRIVER=memory
# stable local option:
STORE_DRIVER=sqlite
SQLITE_PATH=.data/threads.sqlite
# production option:
STORE_DRIVER=postgres
DATABASE_URL=postgresql://...
```

Memory is process-local and is intended for tests only. SQLite is convenient for
one local process and restart recovery. Postgres is the correct store and
checkpointer when multiple API instances share a load balancer.

## Requirements

- Node.js 20+
- pnpm
- Docker (recommended for PostgreSQL and Redis)
- Python 3.11+ and `uv` for AI features

## Local setup

```bash
pnpm install
cp .env.example .env
docker compose up db redis -d
pnpm prisma:generate
pnpm prisma:migrate
pnpm prisma:seed
pnpm start:dev
```

The thread-runtime migration is a deliberate clean rebuild: it drops only the
old conversation tables (including the removed `conversation_messages` table)
and recreates `conversation_threads`, `agent_runs`, and `agent_events`. If an
existing local database still has the previous thread migration history, run
`pnpm prisma migrate reset` once against a disposable/local database. This is
destructive, so back up any non-thread data first; production should use a
reviewed environment-specific migration procedure.

The Docker profile listens on `http://localhost:3000`. The host `start:dev`
profile defaults to `http://localhost:3006` unless `PORT` is set explicitly.

Start the optional Python agent in another terminal:

```bash
cd ai-agent-python-v2
uv run uvicorn main:app --reload --host 0.0.0.0 --port 8001
```

The admin dashboard is maintained in the separate
[ebook-dashboard repository](https://github.com/Hieuej147/ebook-dashboard) and
normally runs on port `3001`. It is one consumer of this API, not the only one; a
storefront or mobile client can call the NestJS routes directly.
Public or mobile clients can call the Nest API directly instead of using that
dashboard.

Seed admin credentials:

```text
admin@ebook.com / Admin@123
```

## Environment

Use environment variables for all deployment-specific values. Do not hardcode
database hosts, API keys, JWT secrets, or agent URLs.

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ebook
REDIS_URL=redis://localhost:6379
JWT_SECRET=replace-me
JWT_REFRESH_SECRET=replace-me
AI_AGENT_URL=http://localhost:8001
```

The complete variable list is in `.env.example`. Production values should come
from a secret manager. Configure CORS and cookie origins for the actual frontend
origins instead of using broad wildcards.

## Database and migrations

Prisma is the source of truth for relational schema changes:

```bash
pnpm prisma:generate
pnpm prisma:migrate
pnpm prisma:studio
```

Never edit generated Prisma client files. Add a migration for schema changes,
review foreign-key and index behavior, then regenerate the client. For production
deployments, run migrations as a release step before starting new application
instances.

## Tests and quality

```bash
pnpm test
pnpm build
pnpm lint
pnpm --filter @bookstore/thread-manager test
```

The thread package tests CRUD, title generation, connect-before-run, event
serialization/compaction, missing-terminal recovery, and SQLite restart recovery.
Domain modules contain unit tests for
auth, books, categories, chapters, orders, users, and statistics.

## Production direction

The application is deployment-agnostic. To run multiple API pods behind a load
balancer:

1. Move `ThreadStore` and the LangGraph checkpointer to Postgres.
2. Use shared Redis for rate limits, queues, or distributed coordination.
3. Keep uploads in Cloudinary/object storage rather than local disk.
4. Run the Python agent as a separately scalable service.
5. Apply database migrations before rolling out new API instances.
6. Keep JWT/session secrets identical across all instances.

No Kubernetes manifests, Helm charts, or Postgres Compose setup are part of this
repository's thread implementation yet. Those are deployment concerns and can be
added later without changing the domain module contracts.

## Repository layout

```text
src/
  module/                 NestJS domain modules and controllers
  common/                 shared guards, decorators, filters and utilities
  main.ts                 HTTP bootstrap
prisma/
  schema.prisma          relational schema
  migrations/             versioned database changes
ai-agent-python-v2/       optional LangGraph/AG-UI service
packages/thread-manager/  framework-agnostic persistence package
```
