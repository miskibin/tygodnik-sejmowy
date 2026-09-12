import { ImageResponse } from "next/og";

export const alt = "Tygodnik Sejmowy — przegląd posiedzeń Sejmu RP";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", background: "#ffffff", color: "#09090b", display: "flex", flexDirection: "column", padding: "72px 80px", fontFamily: "sans-serif" }}>
      <div style={{ fontSize: 24, color: "#71717a", display: "flex" }}>tygodniksejmowy.pl</div>
      <div style={{ marginTop: 64, fontSize: 98, lineHeight: 1.05, letterSpacing: -3, fontWeight: 600, display: "flex", gap: 22 }}>
        <span>Tygodnik</span><span style={{ color: "#b91c1c" }}>Sejmowy</span>
      </div>
      <div style={{ marginTop: 48, paddingTop: 32, borderTop: "2px solid #09090b", fontSize: 36, lineHeight: 1.4, display: "flex" }}>
        Przegląd posiedzeń Sejmu RP
      </div>
    </div>,
    size,
  );
}
