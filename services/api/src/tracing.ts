/**
 * Optional OpenTelemetry tracing to Google Cloud Trace through its OTLP
 * endpoint (telemetry.googleapis.com), authenticated with Application Default
 * Credentials. Imported first in
 * main.ts so HTTP and pg are instrumented before they load. Off unless
 * BOOKWISE_TRACE_EXPORTER=cloud-trace.
 *
 * Spans carry routes, ids, status codes, and timings; never request bodies,
 * questions, or book text (pg statements are recorded without parameters).
 */
import { context, propagation, trace } from "@opentelemetry/api";
import { W3CTraceContextPropagator } from "@opentelemetry/core";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { registerInstrumentations } from "@opentelemetry/instrumentation";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { PgInstrumentation } from "@opentelemetry/instrumentation-pg";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  BatchSpanProcessor,
  ParentBasedSampler,
  TraceIdRatioBasedSampler,
} from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import { config as loadEnvironment } from "dotenv";
import { GoogleAuth } from "google-auth-library";
import { resolve } from "node:path";

loadEnvironment({ path: resolve(__dirname, "../../../.env"), quiet: true });

const exporter = process.env.BOOKWISE_TRACE_EXPORTER?.trim().toLowerCase();

if (exporter === "cloud-trace") {
  const ratio = Number(process.env.BOOKWISE_TRACE_SAMPLE_RATIO ?? "1");
  const provider = new NodeTracerProvider({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: "bookwise-api",
      // Cloud Trace files spans under this project.
      "gcp.project_id": process.env.GOOGLE_CLOUD_PROJECT ?? "",
    }),
    sampler: new ParentBasedSampler({
      root: new TraceIdRatioBasedSampler(
        Number.isFinite(ratio) ? Math.min(Math.max(ratio, 0), 1) : 1,
      ),
    }),
    spanProcessors: [new BatchSpanProcessor(cloudTraceExporter())],
  });
  provider.register({ propagator: new W3CTraceContextPropagator() });

  registerInstrumentations({
    instrumentations: [
      new HttpInstrumentation({
        // Health probes would otherwise be most of the traces.
        ignoreIncomingRequestHook: (request) =>
          request.url?.startsWith("/v1/health") ?? false,
        // Token and metadata-server calls add noise, not insight.
        ignoreOutgoingRequestHook: (request) =>
          request.hostname === "metadata.google.internal" ||
          request.hostname === "oauth2.googleapis.com" ||
          request.hostname === "telemetry.googleapis.com",
      }),
      new PgInstrumentation({ enhancedDatabaseReporting: false }),
    ],
  });

  // A signal listener replaces Node's default exit, so flush spans, then exit.
  const shutdown = (signal: NodeJS.Signals) => {
    void provider
      .shutdown()
      .catch(() => undefined)
      .finally(() => process.exit(signal === "SIGINT" ? 130 : 143));
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}

/** OTLP export with a fresh Google access token on every batch. */
function cloudTraceExporter(): OTLPTraceExporter {
  const auth = new GoogleAuth({
    scopes: "https://www.googleapis.com/auth/cloud-platform",
  });
  return new OTLPTraceExporter({
    url: "https://telemetry.googleapis.com/v1/traces",
    headers: async () => {
      const client = await auth.getClient();
      const headers = await client.getRequestHeaders();
      return headers instanceof Headers
        ? Object.fromEntries(headers.entries())
        : (headers as Record<string, string>);
    },
  });
}

/**
 * The W3C `traceparent` of the active span, so the worker can continue the
 * trace of the request that queued a command; undefined when not tracing.
 */
export function currentTraceparent(): string | undefined {
  if (!trace.getActiveSpan()) {
    return undefined;
  }
  const carrier: Record<string, string> = {};
  propagation.inject(context.active(), carrier);
  return carrier.traceparent;
}
