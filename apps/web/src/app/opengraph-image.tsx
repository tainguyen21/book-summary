import { ImageResponse } from "next/og";

export const alt = "Bookwise — Understand any book. Trust every line.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Social share card rendered at build time, matching the landing hero. */
export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          color: "#f4f4f5",
          background:
            "radial-gradient(60% 70% at 15% 10%, rgba(52,211,153,0.45), transparent 70%), radial-gradient(50% 60% at 90% 0%, rgba(167,139,250,0.45), transparent 70%), #07090a",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 34, fontWeight: 700 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 14,
              background: "linear-gradient(135deg, #34d399, #2dd4bf)",
            }}
          />
          Bookwise
        </div>
        <div style={{ display: "flex", flexDirection: "column", fontSize: 84, fontWeight: 700, letterSpacing: -3, lineHeight: 1.02 }}>
          <span>Understand any book.</span>
          <span style={{ color: "#34d399" }}>Trust every line.</span>
        </div>
        <div style={{ fontSize: 28, color: "#a1a1aa" }}>
          Private, cited summaries of your PDFs, EPUBs, DOCX, and TXT files.
        </div>
      </div>
    ),
    size,
  );
}
