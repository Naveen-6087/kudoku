import { ImageResponse } from "next/og";

export const size = {
  width: 64,
  height: 64
};

export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "radial-gradient(circle at 30% 30%, #ffb357 0%, #ff6f45 42%, #1f0b0b 100%)",
          borderRadius: 16,
          color: "#fff6d5",
          fontSize: 34,
          fontWeight: 800
        }}
      >
        K
      </div>
    ),
    size
  );
}
