import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    <div style={{
      width: "100%", height: "100%", display: "flex", alignItems: "center",
      justifyContent: "center", background: "#07130e", color: "#a8ff22",
      fontSize: 210, fontWeight: 900, letterSpacing: -18, borderRadius: 112,
      border: "20px solid #173c2b",
    }}>SK</div>,
    size,
  );
}
