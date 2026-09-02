import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    <div style={{
      width: "100%", height: "100%", display: "flex", alignItems: "center",
      justifyContent: "center", background: "#07130e", color: "#a8ff22",
      fontSize: 74, fontWeight: 900, letterSpacing: -6,
    }}>SK</div>,
    size,
  );
}
