import { GoogleAuth } from "google-auth-library";
import type { Readable } from "node:stream";

import type { AnswerGenerator } from "../../domain/ask/ask";

export interface VertexGenerationConfig {
  project: string;
  location: string;
  model: string;
  maxOutputTokens?: number;
  timeoutMs?: number;
}

interface StreamChunk {
  candidates?: {
    content?: { parts?: { text?: string; thought?: boolean }[] };
  }[];
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    thoughtsTokenCount?: number;
  };
}

/** Streams Gemini answers from Vertex AI (server-sent events). */
export class VertexGenerationClient implements AnswerGenerator {
  readonly provider = "vertex";
  readonly model: string;
  private readonly auth = new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });

  constructor(private readonly config: VertexGenerationConfig) {
    this.model = config.model;
  }

  async stream(
    system: string,
    prompt: string,
    onText: (text: string) => void,
  ): Promise<{ inputTokens: number; outputTokens: number }> {
    const { project, location, model } = this.config;
    const host =
      location === "global"
        ? "aiplatform.googleapis.com"
        : `${location}-aiplatform.googleapis.com`;
    const client = await this.auth.getClient();
    const response = await client.request<Readable>({
      url: `https://${host}/v1/projects/${project}/locations/${location}/publishers/google/models/${model}:streamGenerateContent?alt=sse`,
      method: "POST",
      responseType: "stream",
      timeout: this.config.timeoutMs ?? 45_000,
      data: {
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: this.config.maxOutputTokens ?? 1024,
          // Answers are bounded by the passages; deep thinking only adds latency and cost.
          thinkingConfig: { thinkingLevel: "LOW" },
        },
      },
    });

    let usage = { inputTokens: 0, outputTokens: 0 };
    let buffer = "";
    for await (const piece of response.data) {
      buffer += String(piece);
      let newline: number;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line.startsWith("data:")) {
          continue;
        }
        const chunk = JSON.parse(line.slice(5)) as StreamChunk;
        for (const part of chunk.candidates?.[0]?.content?.parts ?? []) {
          if (part.text && !part.thought) {
            onText(part.text);
          }
        }
        if (chunk.usageMetadata) {
          // Gemini bills thinking tokens as output.
          usage = {
            inputTokens: chunk.usageMetadata.promptTokenCount ?? 0,
            outputTokens:
              (chunk.usageMetadata.candidatesTokenCount ?? 0) +
              (chunk.usageMetadata.thoughtsTokenCount ?? 0),
          };
        }
      }
    }
    return usage;
  }
}
