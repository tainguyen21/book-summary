---
title: "Request tracing"
description: "OpenTelemetry traces from API requests through the worker's command, database, and Vertex calls into Cloud Trace."
status: completed
priority: P2
effort: 1d
branch: master
tags: [api, worker, observability, gcp]
created: 2026-10-18
---

# Request tracing (roadmap B7)

## Contract

- **Outcome:**
  - With `BOOKWISE_TRACE_EXPORTER=cloud-trace`, the API traces incoming HTTP
    requests, Postgres queries, and outgoing calls (Vertex).
  - The API puts the request's `traceparent` into the processing command's
    `payload`.
  - The worker continues that trace with a `command <type>` span over
    ingestion and generation, with database and model HTTP (httpx) calls
    beneath it.
- **Export:**
  - Spans go to Cloud Trace's OTLP endpoint (`telemetry.googleapis.com`) over
    HTTP/protobuf, authenticated with Application Default Credentials.
  - The Google Cloud Trace exporter for Node is deprecated and is archived
    after 2026-10-30, so OTLP is used in both services.
- **Constraints:**
  - Off unless configured. Sampling uses `BOOKWISE_TRACE_SAMPLE_RATIO`
    (default 1) and follows the parent.
  - Health probes and the worker's idle polling are never traced.
  - Spans hold ids, routes, status codes, SQL without parameters, and timings,
    never bodies, questions, prompts, or book text.
  - No schema change: the existing `payload` JSONB carries the context.
- **Non-goals:**
  - Browser tracing, so the web app does not start traces.
  - Metrics and log correlation.
- **Infra:**
  - The ConfigMap enables tracing.
  - `configure-services.ps1` grants `roles/telemetry.tracesWriter` to the
    `bookwise-api` and `bookwise-worker` service accounts.
  - `bootstrap-gcp.ps1` enables `cloudtrace.googleapis.com` and
    `telemetry.googleapis.com`; both are already enabled in `bookwise-509408`.

## Results (2026-10-18)

- **API**, run locally with tracing on and my credentials:
  - Requests to `/v1/books` appeared in Cloud Trace as `GET` server spans with
    `url.path` and status 401.
  - Health checks were excluded.
- **Worker:**
  - Given a `traceparent`, a `command ingest_book` span was exported under that
    trace id as `bookwise-worker`, with `connect` and `select` database spans
    beneath it.
  - An idle query outside a command was dropped by the sampler.
- **Checks:**
  - API lint and build pass. Worker `ruff check` passes. The touched worker
    files are formatted; `bootstrap.py` was already unformatted before this change.
  - `pnpm install --frozen-lockfile` passes; `protobufjs` build scripts are
    declined in `pnpm-workspace.yaml`.
- **Before deploy:** grant `roles/telemetry.tracesWriter` to both service
  accounts. Without it the services still work, but spans are rejected.
