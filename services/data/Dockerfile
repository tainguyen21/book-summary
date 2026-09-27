FROM ghcr.io/astral-sh/uv:0.12.17 AS uv
FROM python:3.12-slim

COPY --from=uv /uv /uvx /bin/

WORKDIR /app
ENV PYTHONUNBUFFERED=1
ENV PATH="/app/services/data/.venv/bin:$PATH"

RUN useradd --create-home --uid 10001 bookwise
COPY --chown=bookwise:bookwise services/data/pyproject.toml services/data/uv.lock services/data/
COPY --chown=bookwise:bookwise services/data/src services/data/src
RUN uv sync --project services/data --locked --no-dev

USER bookwise
CMD ["uv", "run", "--project", "services/data", "--no-sync", "python", "-m", "bookwise_data.workers.main"]
