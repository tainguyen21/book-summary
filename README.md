# Bookwise

Evidence-first, private book summarization with a NestJS application backend
and a private Python processing service.

## Local development

Copy `.env.example` to `.env`, then run:

```bash
pnpm install
uv sync --project services/data
docker compose up -d
pnpm run migrate:local
```

Run the development services with:

```bash
pnpm run dev:web
pnpm run dev:api
uv run --project services/data python -m bookwise_data.workers.main
```

NestJS listens on port `3001`; the Next.js app reads its public API URL from
`NEXT_PUBLIC_API_URL`.
