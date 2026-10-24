import { ImageResponse } from "next/og";
import { SITE_NAME } from "@/lib/seo";
import { STORE_ICON_DATA_URI } from "@/lib/store-icon";

export const alt = `${SITE_NAME} — Board Games, TCGs & Tournaments in Haifa`;

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "80px",
          background: "linear-gradient(135deg, #042F2E 0%, #0F172A 55%, #115E59 100%)",
          color: "#FFFFFF",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            maxWidth: "780px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "20px",
              marginBottom: "24px",
              color: "#F59E0B",
              fontSize: 28,
              fontWeight: 700,
            }}
          >
            HAIFA TABLETOP & TCG SANCTUARY
          </div>
          <div
            style={{
              fontSize: 72,
              fontWeight: 900,
              lineHeight: 1.1,
              marginBottom: "24px",
            }}
          >
            {SITE_NAME}
          </div>
          <div
            style={{
              fontSize: 32,
              color: "#CCFBF1",
            }}
          >
            Strategy Board Games, Trading Card Games, Pre-Orders & Weekly Tournaments at Derech HaAtzmaut 41, Haifa
          </div>
        </div>
        <img
          src={STORE_ICON_DATA_URI}
          alt={SITE_NAME}
          width={236}
          height={256}
          style={{
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
