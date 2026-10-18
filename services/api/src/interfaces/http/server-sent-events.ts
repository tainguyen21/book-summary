import type { FastifyReply } from "fastify";
import type { OutgoingHttpHeaders } from "node:http";

/**
 * Takes over the response for server-sent events, keeping headers Fastify
 * already prepared (CORS), and returns a writer for `event:`/`data:` blocks.
 */
export function openEventStream(reply: FastifyReply) {
  reply.hijack();
  const prepared = Object.fromEntries(
    Object.entries(reply.getHeaders()).filter(
      ([, value]) => value !== undefined,
    ),
  ) as OutgoingHttpHeaders;
  reply.raw.writeHead(200, {
    ...prepared,
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    "x-accel-buffering": "no",
  });
  return {
    send(event: string, data: unknown) {
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    },
    /** A comment line that keeps proxies from closing an idle stream. */
    ping() {
      reply.raw.write(": ping\n\n");
    },
    end() {
      reply.raw.end();
    },
  };
}
