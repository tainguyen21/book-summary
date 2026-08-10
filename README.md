# Bookwise

Evidence-first, private book summarization.

## Local development

Copy `.env.example` to `.env`, then run:

```bash
pnpm install
uv sync --project services/backend
docker compose up -d
```

Run the smoke checks with:

```bash
pnpm --dir apps/web test
uv run --project services/backend pytest services/backend/tests/test_package_import.py -v
```
