import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import {
  emitOtelLog,
  formatOtelPrometheus,
  getOtelSnapshot,
  incrementOtelCounter,
  type OtelSeverity,
} from "@/lib/otel";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format");
  const accept = request.headers.get("accept") || "";

  const db = await getDb();
  await incrementOtelCounter(db, "dockside_http_requests_total", 1, {
    route: "/api/telemetry",
  });

  const snapshot = await getOtelSnapshot(db, 100);

  if (format === "prometheus" || accept.includes("text/plain")) {
    const promText = formatOtelPrometheus(snapshot);
    return new NextResponse(promText, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
      },
    });
  }

  return NextResponse.json({
    ok: true,
    ...snapshot,
  });
}

export async function POST(request: Request) {
  const body = await request.json();
  const db = await getDb();

  const severityText: OtelSeverity =
    body.severityText === "ERROR" || body.severityText === "WARN"
      ? body.severityText
      : "INFO";
  const category = String(body.category || "app.custom");
  const message = String(body.body || body.message || "Application event");

  const logRecord = await emitOtelLog(db, {
    severityText,
    category,
    body: message,
    attributes: body.attributes || {},
  });

  return NextResponse.json({
    ok: true,
    log: logRecord,
  });
}
