import { ImageResponse } from "next/og";
import { STORE_ICON_DATA_URI } from "@/lib/store-icon";

export const size = {
  width: 180,
  height: 180,
};

export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0f172a",
          borderRadius: "36px",
          overflow: "hidden",
        }}
      >
          <img
            src={STORE_ICON_DATA_URI}
            alt="Dockside Keep"
            width={160}
            height={174}
            style={{
              width: "160px",
              height: "174px",
              objectFit: "contain",
            }}
          />
      </div>
    ),
    {
      ...size,
    }
  );
}
