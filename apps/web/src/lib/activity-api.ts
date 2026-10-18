"use client";

import { z } from "zod";

import { bookwiseApi, type GetAccessTokenSilently } from "./bookwise-api";

const activitySchema = z.object({
  queue: z.object({ mine: z.number(), ahead: z.number() }),
  runs: z.array(
    z.object({
      runId: z.string(),
      bookId: z.string(),
      bookTitle: z.string(),
      commandType: z.string(),
      status: z.string(),
      startedAt: z.string(),
      completedAt: z.string().nullable(),
      latestEventType: z.string().nullable(),
      errorCode: z.string().nullable(),
    }),
  ),
  spendToday: z.object({
    totalUsd: z.number(),
    byOperation: z.array(z.object({ operation: z.string(), usd: z.number(), calls: z.number() })),
  }),
});

export type Activity = z.infer<typeof activitySchema>;
export type ActivityRun = Activity["runs"][number];

export function loadActivity(getToken: GetAccessTokenSilently) {
  return bookwiseApi(getToken, "/v1/activity", { method: "GET" }, activitySchema);
}
