import { GoogleAuth } from "google-auth-library";

import type { QueryEmbedder } from "../../domain/search/search";

export interface VertexEmbeddingConfig {
  project: string;
  location: string;
  model: string;
  dimensions: number;
  timeoutMs?: number;
}

interface PredictResponse {
  predictions?: {
    embeddings?: { values?: number[]; statistics?: { token_count?: number } };
  }[];
}

/** Embeds search queries with Vertex AI using Application Default Credentials. */
export class VertexEmbeddingClient implements QueryEmbedder {
  readonly provider = "vertex";
  readonly model: string;
  private readonly auth = new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });

  constructor(private readonly config: VertexEmbeddingConfig) {
    this.model = config.model;
  }

  async embed(
    text: string,
  ): Promise<{ values: number[]; inputTokens: number }> {
    const { project, location, model, dimensions } = this.config;
    const host =
      location === "global"
        ? "aiplatform.googleapis.com"
        : `${location}-aiplatform.googleapis.com`;
    const client = await this.auth.getClient();
    const response = await client.request<PredictResponse>({
      url: `https://${host}/v1/projects/${project}/locations/${location}/publishers/google/models/${model}:predict`,
      method: "POST",
      // Interactive: fall back to keyword results quickly rather than wait.
      timeout: this.config.timeoutMs ?? 4_000,
      data: {
        instances: [{ content: text, task_type: "RETRIEVAL_QUERY" }],
        parameters: { outputDimensionality: dimensions },
      },
    });
    const embedding = response.data.predictions?.[0]?.embeddings;
    const values = embedding?.values;
    if (!Array.isArray(values) || values.length !== dimensions) {
      throw new Error("Vertex AI returned no usable query embedding.");
    }

    return { values, inputTokens: embedding?.statistics?.token_count ?? 0 };
  }
}
