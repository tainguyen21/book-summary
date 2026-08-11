import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("publicConfig", () => {
  it("accepts a valid public API URL", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.test");

    const { publicConfig } = await import("./config");

    expect(publicConfig).toEqual({
      NEXT_PUBLIC_API_URL: "https://api.example.test",
    });
  });

  it("rejects an invalid public API URL", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "not-a-url");

    await expect(import("./config")).rejects.toThrow();
  });
});
