"""Optional OpenTelemetry tracing to Google Cloud Trace for the worker.

Spans go to Cloud Trace's OTLP endpoint (telemetry.googleapis.com) over
HTTP/protobuf, authenticated with Application Default Credentials.

Off unless BOOKWISE_TRACE_EXPORTER=cloud-trace. Each claimed command becomes a
``command <type>`` span that continues the trace of the API request which
queued it (its ``traceparent`` payload key), with database and model HTTP
calls beneath it. Idle polling is never traced, and spans carry ids and
timings only: no prompts, responses, or book text.
"""

from __future__ import annotations

import os
from collections.abc import Iterator, Mapping, Sequence
from contextlib import contextmanager
from typing import Any

from opentelemetry import trace
from opentelemetry.context import Context
from opentelemetry.trace import Link, SpanKind, Tracer
from opentelemetry.trace.propagation.tracecontext import TraceContextTextMapPropagator
from opentelemetry.util.types import Attributes

_COMMAND_SPAN_PREFIX = "command "
_tracer: Tracer | None = None


def configure_tracing(engine: Any) -> None:
    """Install the Cloud Trace exporter and instrument SQLAlchemy and httpx."""

    global _tracer
    if os.environ.get("BOOKWISE_TRACE_EXPORTER", "").strip().lower() != "cloud-trace":
        return

    # Imported lazily so a worker without tracing never loads the exporter.
    import google.auth
    from google.auth.transport.requests import AuthorizedSession
    from opentelemetry.exporter.otlp.proto.http.trace_exporter import (
        OTLPSpanExporter,
    )
    from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
    from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
    from opentelemetry.sdk.resources import Resource
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import BatchSpanProcessor
    from opentelemetry.sdk.trace.sampling import (
        Decision,
        ParentBased,
        Sampler,
        SamplingResult,
        TraceIdRatioBased,
    )

    class CommandRootSampler(Sampler):
        """Starts traces only for command spans, so idle polls are dropped."""

        def __init__(self, ratio: float) -> None:
            self._ratio = TraceIdRatioBased(ratio)

        def should_sample(
            self,
            parent_context: Context | None,
            trace_id: int,
            name: str,
            kind: SpanKind | None = None,
            attributes: Attributes = None,
            links: Sequence[Link] | None = None,
            trace_state: Any = None,
        ) -> SamplingResult:
            if not name.startswith(_COMMAND_SPAN_PREFIX):
                return SamplingResult(Decision.DROP)
            return self._ratio.should_sample(
                parent_context, trace_id, name, kind, attributes, links, trace_state
            )

        def get_description(self) -> str:
            return "CommandRootSampler"

    ratio = _sample_ratio()
    provider = TracerProvider(
        resource=Resource.create(
            {
                "service.name": "bookwise-worker",
                # Cloud Trace files spans under this project.
                "gcp.project_id": os.environ.get("GOOGLE_CLOUD_PROJECT", ""),
            }
        ),
        sampler=ParentBased(root=CommandRootSampler(ratio)),
    )
    credentials, _ = google.auth.default(
        scopes=["https://www.googleapis.com/auth/cloud-platform"]
    )
    # The authorized session refreshes the access token as needed.
    exporter = OTLPSpanExporter(
        endpoint="https://telemetry.googleapis.com/v1/traces",
        session=AuthorizedSession(credentials),
    )
    provider.add_span_processor(BatchSpanProcessor(exporter))
    trace.set_tracer_provider(provider)
    SQLAlchemyInstrumentor().instrument(engine=engine)
    HTTPXClientInstrumentor().instrument()
    _tracer = trace.get_tracer("bookwise.worker")


def shutdown_tracing() -> None:
    """Flush pending spans before the worker exits."""

    provider = trace.get_tracer_provider()
    shutdown = getattr(provider, "shutdown", None)
    if callable(shutdown):
        shutdown()


@contextmanager
def command_span(
    command_type: str,
    payload: Mapping[str, Any],
    attributes: Mapping[str, str],
) -> Iterator[None]:
    """A span for one command, parented by the queuing request when known."""

    if _tracer is None:
        yield
        return
    traceparent = payload.get("traceparent")
    parent = (
        TraceContextTextMapPropagator().extract({"traceparent": traceparent})
        if isinstance(traceparent, str)
        else None
    )
    with _tracer.start_as_current_span(
        f"{_COMMAND_SPAN_PREFIX}{command_type}",
        context=parent,
        kind=SpanKind.CONSUMER,
        attributes=dict(attributes),
    ):
        yield


def _sample_ratio() -> float:
    try:
        ratio = float(os.environ.get("BOOKWISE_TRACE_SAMPLE_RATIO", "1"))
    except ValueError:
        return 1.0
    return min(max(ratio, 0.0), 1.0)
