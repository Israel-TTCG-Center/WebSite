import { trace, metrics, SpanStatusCode } from "@opentelemetry/api";
import type { Db } from "mongodb";
import { nowUtcIso } from "./premium";

export const OTEL_SERVICE_NAME =
  process.env.OTEL_SERVICE_NAME || "dockside-keep-web";
export const OTEL_SERVICE_VERSION = "1.0.0";

export const LOKI_PUSH_URL =
  process.env.LOKI_PUSH_URL || "http://loki:3100/loki/api/v1/push";
export const PROMETHEUS_PUBLIC_URL =
  process.env.PROMETHEUS_PUBLIC_URL || "http://localhost:9090";
export const GRAFANA_PUBLIC_URL =
  process.env.GRAFANA_PUBLIC_URL || "http://localhost:3001";
export const LOKI_PUBLIC_URL =
  process.env.LOKI_PUBLIC_URL || "http://localhost:3100";

const tracer = trace.getTracer(OTEL_SERVICE_NAME, OTEL_SERVICE_VERSION);
const meter = metrics.getMeter(OTEL_SERVICE_NAME, OTEL_SERVICE_VERSION);

const otelCounters = {
  dockside_http_requests_total: meter.createCounter(
    "dockside_http_requests_total",
    { description: "Total HTTP API requests processed by Dockside Keep" }
  ),
  dockside_orders_checkout_total: meter.createCounter(
    "dockside_orders_checkout_total",
    { description: "Total customer orders checked out" }
  ),
  dockside_admin_audit_logs_total: meter.createCounter(
    "dockside_admin_audit_logs_total",
    { description: "Total immutable admin audit log entries recorded" }
  ),
  dockside_auth_events_total: meter.createCounter(
    "dockside_auth_events_total",
    { description: "Total user and admin authentication events" }
  ),
  dockside_errors_total: meter.createCounter("dockside_errors_total", {
    description: "Total application error events captured by OpenTelemetry",
  }),
  dockside_order_ttl_deletions_total: meter.createCounter(
    "dockside_order_ttl_deletions_total",
    {
      description:
        "Total 3-day unpaid order TTL deletion events captured via MongoDB Change Streams",
    }
  ),
  dockside_privacy_erasures_total: meter.createCounter(
    "dockside_privacy_erasures_total",
    {
      description:
        "Total GDPR/CCPA/PPL account erasures and order anonymizations executed",
    }
  ),
};

const featureUsageCounter = meter.createCounter("dockside_feature_usage_total", {
  description: "Feature usage counter grouped by feature name",
});

const featureErrorCounter = meter.createCounter(
  "dockside_feature_errors_total",
  {
    description: "Error investigation counter grouped by route and status",
  }
);

export type OtelMetricName = keyof typeof otelCounters;
export type OtelSeverity = "INFO" | "WARN" | "ERROR";

export interface OtelLogRecord {
  id: string;
  timestampUtc: string;
  severityText: OtelSeverity;
  category: string;
  body: string;
  traceId: string;
  spanId: string;
  serviceName: string;
  attributes: Record<string, unknown>;
}

export interface OtelTraceSpanRecord {
  traceId: string;
  spanId: string;
  operation: string;
  durationMs: number;
  status: "OK" | "ERROR";
  timestampUtc: string;
  attributes: Record<string, unknown>;
}

export interface OtelErrorInvestigationRecord {
  id: string;
  timestampUtc: string;
  traceId: string;
  spanId: string;
  route: string;
  httpStatus: number;
  errorMessage: string;
  stack?: string;
  context: Record<string, unknown>;
}

const memoryCounters: Record<OtelMetricName, number> = {
  dockside_http_requests_total: 1,
  dockside_orders_checkout_total: 0,
  dockside_admin_audit_logs_total: 0,
  dockside_auth_events_total: 0,
  dockside_errors_total: 0,
  dockside_order_ttl_deletions_total: 0,
  dockside_privacy_erasures_total: 0,
};

const memoryFeatureUsage: Record<string, number> = {
  storefront_catalog: 1,
};

const memoryErrorCounts: Record<string, number> = {};
const memoryOtelLogs: OtelLogRecord[] = [];
const memoryTraceSpans: OtelTraceSpanRecord[] = [];
const memoryErrorInvestigations: OtelErrorInvestigationRecord[] = [];
const processStartedAtMs = Date.now();

export function generateHexId(byteLength: number): string {
  let out = "";
  const hex = "0123456789abcdef";
  for (let i = 0; i < byteLength * 2; i++) {
    out += hex[Math.floor(Math.random() * 16)];
  }
  return out;
}

export function generateTraceContext(): { traceId: string; spanId: string } {
  return {
    traceId: generateHexId(16), // 32-hex W3C traceId
    spanId: generateHexId(8), // 16-hex W3C spanId
  };
}

async function pushToSelfHostedLoki(record: OtelLogRecord): Promise<void> {
  if (!LOKI_PUSH_URL || process.env.VITEST) return;
  try {
    const nsTimestamp = `${Date.now()}000000`;
    const linePayload = JSON.stringify({
      timestampUtc: record.timestampUtc,
      severity: record.severityText,
      category: record.category,
      message: record.body,
      traceId: record.traceId,
      spanId: record.spanId,
      attributes: record.attributes,
    });

    await fetch(LOKI_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        streams: [
          {
            stream: {
              service_name: record.serviceName,
              severity: record.severityText,
              category: record.category,
            },
            values: [[nsTimestamp, linePayload]],
          },
        ],
      }),
      signal: AbortSignal.timeout(1500),
    });
  } catch {
    // Non-blocking: if Loki container is still starting up, MongoDB & memory retain all logs
  }
}

export async function incrementOtelCounter(
  db: Db | null,
  name: OtelMetricName,
  delta = 1,
  attributes: Record<string, string> = {}
): Promise<number> {
  const safeDelta = Math.max(0, Number(delta) || 0);
  otelCounters[name]?.add(safeDelta, attributes);
  memoryCounters[name] = (memoryCounters[name] || 0) + safeDelta;

  if (db) {
    try {
      await db.collection("otel_metrics").updateOne(
        { name },
        {
          $inc: { value: safeDelta },
          $set: { updatedAtUtc: nowUtcIso() },
          $setOnInsert: { name, createdAtUtc: nowUtcIso() },
        },
        { upsert: true }
      );
    } catch {
      // ignore transient DB errors
    }
  }

  return memoryCounters[name];
}

export async function recordFeatureUsage(
  db: Db | null,
  feature: string,
  attributes: Record<string, unknown> = {}
): Promise<number> {
  const cleanFeature = String(feature || "unknown")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]/g, "_");
  featureUsageCounter.add(1, { feature: cleanFeature });
  memoryFeatureUsage[cleanFeature] =
    (memoryFeatureUsage[cleanFeature] || 0) + 1;

  if (db) {
    try {
      await db.collection("otel_feature_usage").updateOne(
        { feature: cleanFeature },
        {
          $inc: { count: 1 },
          $set: { updatedAtUtc: nowUtcIso() },
          $setOnInsert: { feature: cleanFeature, createdAtUtc: nowUtcIso() },
        },
        { upsert: true }
      );
    } catch {
      // ignore transient DB errors
    }
  }

  await emitOtelLog(db, {
    severityText: "INFO",
    category: `feature.${cleanFeature}`,
    body: `Feature used: ${cleanFeature}`,
    attributes: { feature: cleanFeature, ...attributes },
  });

  return memoryFeatureUsage[cleanFeature];
}

export async function recordOtelTraceSpan(
  db: Db | null,
  params: {
    operation: string;
    durationMs: number;
    status?: "OK" | "ERROR";
    attributes?: Record<string, unknown>;
    traceId?: string;
    spanId?: string;
  }
): Promise<OtelTraceSpanRecord> {
  const ctx = generateTraceContext();
  const span = tracer.startSpan(params.operation);
  span.setStatus({
    code:
      params.status === "ERROR" ? SpanStatusCode.ERROR : SpanStatusCode.OK,
  });
  span.end();

  const spanRecord: OtelTraceSpanRecord = {
    traceId: params.traceId || ctx.traceId,
    spanId: params.spanId || ctx.spanId,
    operation: params.operation,
    durationMs: Math.max(0, Math.round(params.durationMs)),
    status: params.status || "OK",
    timestampUtc: nowUtcIso(),
    attributes: params.attributes || {},
  };

  memoryTraceSpans.unshift(spanRecord);
  if (memoryTraceSpans.length > 200) {
    memoryTraceSpans.pop();
  }

  if (db) {
    try {
      await db.collection("otel_traces").insertOne({ ...spanRecord });
    } catch {
      // ignore transient DB errors
    }
  }

  return spanRecord;
}

export async function recordErrorInvestigation(
  db: Db | null,
  params: {
    route: string;
    httpStatus: number;
    error: unknown;
    context?: Record<string, unknown>;
  }
): Promise<OtelErrorInvestigationRecord> {
  const ctx = generateTraceContext();
  const errorMessage =
    params.error instanceof Error
      ? params.error.message
      : String(params.error || "Unknown error");
  const stack =
    params.error instanceof Error ? params.error.stack : undefined;

  const key = `${params.route}|${params.httpStatus}`;
  memoryErrorCounts[key] = (memoryErrorCounts[key] || 0) + 1;
  featureErrorCounter.add(1, {
    route: params.route,
    status: String(params.httpStatus),
  });

  const record: OtelErrorInvestigationRecord = {
    id: `err-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestampUtc: nowUtcIso(),
    traceId: ctx.traceId,
    spanId: ctx.spanId,
    route: params.route,
    httpStatus: params.httpStatus,
    errorMessage,
    stack,
    context: params.context || {},
  };

  memoryErrorInvestigations.unshift(record);
  if (memoryErrorInvestigations.length > 200) {
    memoryErrorInvestigations.pop();
  }

  await emitOtelLog(db, {
    severityText: "ERROR",
    category: `error.${params.route.replace(/[^a-zA-Z0-9_.-]/g, "_")}`,
    body: `[HTTP ${params.httpStatus}] ${params.route}: ${errorMessage}`,
    traceId: ctx.traceId,
    spanId: ctx.spanId,
    attributes: {
      route: params.route,
      httpStatus: params.httpStatus,
      errorMessage,
      stack,
      ...(params.context || {}),
    },
  });

  return record;
}

export async function emitOtelLog(
  db: Db | null,
  params: {
    severityText: OtelSeverity;
    category: string;
    body: string;
    attributes?: Record<string, unknown>;
    traceId?: string;
    spanId?: string;
  }
): Promise<OtelLogRecord> {
  const ctx = generateTraceContext();
  const span = tracer.startSpan(`otel.log.${params.category}`);
  if (params.severityText === "ERROR") {
    span.setStatus({ code: SpanStatusCode.ERROR, message: params.body });
  } else {
    span.setStatus({ code: SpanStatusCode.OK });
  }
  span.end();

  const record: OtelLogRecord = {
    id: `otel-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestampUtc: nowUtcIso(),
    severityText: params.severityText,
    category: params.category,
    body: params.body,
    traceId: params.traceId || ctx.traceId,
    spanId: params.spanId || ctx.spanId,
    serviceName: OTEL_SERVICE_NAME,
    attributes: params.attributes || {},
  };

  memoryOtelLogs.unshift(record);
  if (memoryOtelLogs.length > 300) {
    memoryOtelLogs.pop();
  }

  if (params.severityText === "ERROR") {
    await incrementOtelCounter(db, "dockside_errors_total", 1, {
      category: params.category,
    });
  }

  if (db) {
    try {
      await db.collection("otel_logs").insertOne({ ...record });
    } catch {
      // ignore transient DB errors
    }
  }

  // Push asynchronously to self-hosted Grafana Loki (:3100)
  void pushToSelfHostedLoki(record);

  return record;
}

export interface OtelSnapshot {
  resource: {
    serviceName: string;
    serviceVersion: string;
    exporterTargets: {
      grafanaUrl: string;
      prometheusUrl: string;
      lokiUrl: string;
      lokiPushEndpoint: string;
    };
  };
  counters: Record<OtelMetricName, number>;
  featureUsage: Record<string, number>;
  errorCounts: Record<string, number>;
  errorInvestigations: OtelErrorInvestigationRecord[];
  traceSpans: OtelTraceSpanRecord[];
  runtime: {
    uptimeSeconds: number;
    memoryRssBytes: number;
    memoryHeapUsedBytes: number;
  };
  logs: OtelLogRecord[];
}

export async function getOtelSnapshot(
  db: Db | null,
  limit = 100
): Promise<OtelSnapshot> {
  const counters: Record<OtelMetricName, number> = { ...memoryCounters };
  const featureUsage: Record<string, number> = { ...memoryFeatureUsage };
  let logs: OtelLogRecord[] = [...memoryOtelLogs].slice(0, limit);
  let traceSpans: OtelTraceSpanRecord[] = [...memoryTraceSpans].slice(0, 50);

  if (db) {
    try {
      const metricDocs = await db.collection("otel_metrics").find({}).toArray();
      for (const m of metricDocs) {
        if (m.name && m.name in counters) {
          counters[m.name as OtelMetricName] = Math.max(
            counters[m.name as OtelMetricName],
            Number(m.value || 0)
          );
        }
      }
      const featureDocs = await db
        .collection("otel_feature_usage")
        .find({})
        .toArray();
      for (const f of featureDocs) {
        if (f.feature) {
          featureUsage[String(f.feature)] = Math.max(
            featureUsage[String(f.feature)] || 0,
            Number(f.count || 0)
          );
        }
      }
      const logDocs = await db
        .collection("otel_logs")
        .find({})
        .sort({ timestampUtc: -1 })
        .limit(limit)
        .toArray();
      if (logDocs.length > 0) {
        logs = logDocs.map((d) => ({
          id: String(d.id || d._id),
          timestampUtc: String(d.timestampUtc || nowUtcIso()),
          severityText: (d.severityText as OtelSeverity) || "INFO",
          category: String(d.category || "app"),
          body: String(d.body || ""),
          traceId: String(d.traceId || ""),
          spanId: String(d.spanId || ""),
          serviceName: String(d.serviceName || OTEL_SERVICE_NAME),
          attributes: (d.attributes as Record<string, unknown>) || {},
        }));
      }
      const traceDocs = await db
        .collection("otel_traces")
        .find({})
        .sort({ timestampUtc: -1 })
        .limit(50)
        .toArray();
      if (traceDocs.length > 0) {
        traceSpans = traceDocs.map((t) => ({
          traceId: String(t.traceId || ""),
          spanId: String(t.spanId || ""),
          operation: String(t.operation || ""),
          durationMs: Number(t.durationMs || 0),
          status: t.status === "ERROR" ? "ERROR" : "OK",
          timestampUtc: String(t.timestampUtc || nowUtcIso()),
          attributes: (t.attributes as Record<string, unknown>) || {},
        }));
      }
    } catch {
      // fallback to memory snapshot
    }
  }

  const mem =
    typeof process !== "undefined" && typeof process.memoryUsage === "function"
      ? process.memoryUsage()
      : { rss: 0, heapUsed: 0 };

  return {
    resource: {
      serviceName: OTEL_SERVICE_NAME,
      serviceVersion: OTEL_SERVICE_VERSION,
      exporterTargets: {
        grafanaUrl: GRAFANA_PUBLIC_URL,
        prometheusUrl: PROMETHEUS_PUBLIC_URL,
        lokiUrl: LOKI_PUBLIC_URL,
        lokiPushEndpoint: LOKI_PUSH_URL,
      },
    },
    counters,
    featureUsage,
    errorCounts: { ...memoryErrorCounts },
    errorInvestigations: [...memoryErrorInvestigations].slice(0, 50),
    traceSpans,
    runtime: {
      uptimeSeconds: Math.max(
        1,
        Math.floor((Date.now() - processStartedAtMs) / 1000)
      ),
      memoryRssBytes: mem.rss || 0,
      memoryHeapUsedBytes: mem.heapUsed || 0,
    },
    logs,
  };
}

export function formatOtelPrometheus(snapshot: OtelSnapshot): string {
  const svc = snapshot.resource.serviceName;
  const lines: string[] = [
    "# HELP dockside_http_requests_total Total HTTP API requests processed by Dockside Keep",
    "# TYPE dockside_http_requests_total counter",
    `dockside_http_requests_total{service_name="${svc}"} ${snapshot.counters.dockside_http_requests_total}`,
    "",
    "# HELP dockside_orders_checkout_total Total customer orders checked out",
    "# TYPE dockside_orders_checkout_total counter",
    `dockside_orders_checkout_total{service_name="${svc}"} ${snapshot.counters.dockside_orders_checkout_total}`,
    "",
    "# HELP dockside_admin_audit_logs_total Total immutable admin audit log entries recorded",
    "# TYPE dockside_admin_audit_logs_total counter",
    `dockside_admin_audit_logs_total{service_name="${svc}"} ${snapshot.counters.dockside_admin_audit_logs_total}`,
    "",
    "# HELP dockside_auth_events_total Total user and admin authentication events",
    "# TYPE dockside_auth_events_total counter",
    `dockside_auth_events_total{service_name="${svc}"} ${snapshot.counters.dockside_auth_events_total}`,
    "",
    "# HELP dockside_errors_total Total application error events captured by OpenTelemetry",
    "# TYPE dockside_errors_total counter",
    `dockside_errors_total{service_name="${svc}"} ${snapshot.counters.dockside_errors_total}`,
    "",
    "# HELP dockside_order_ttl_deletions_total Total 3-day unpaid order TTL deletion events captured via MongoDB Change Streams",
    "# TYPE dockside_order_ttl_deletions_total counter",
    `dockside_order_ttl_deletions_total{service_name="${svc}"} ${snapshot.counters.dockside_order_ttl_deletions_total}`,
    "",
    "# HELP dockside_privacy_erasures_total Total GDPR/CCPA/PPL account erasures and order anonymizations executed",
    "# TYPE dockside_privacy_erasures_total counter",
    `dockside_privacy_erasures_total{service_name="${svc}"} ${snapshot.counters.dockside_privacy_erasures_total}`,
    "",
    "# HELP dockside_feature_usage_total Feature usage counter grouped by feature name",
    "# TYPE dockside_feature_usage_total counter",
    ...Object.entries(snapshot.featureUsage).map(
      ([feature, count]) =>
        `dockside_feature_usage_total{service_name="${svc}",feature="${feature}"} ${count}`
    ),
    "",
    "# HELP dockside_feature_errors_total Error investigation counter grouped by route and status",
    "# TYPE dockside_feature_errors_total counter",
    ...Object.entries(snapshot.errorCounts).map(([routeStatus, count]) => {
      const [route, status] = routeStatus.split("|");
      return `dockside_feature_errors_total{service_name="${svc}",route="${route}",status="${status}"} ${count}`;
    }),
    "",
    "# HELP dockside_process_uptime_seconds Process uptime in seconds",
    "# TYPE dockside_process_uptime_seconds gauge",
    `dockside_process_uptime_seconds{service_name="${svc}"} ${snapshot.runtime.uptimeSeconds}`,
    "",
    "# HELP dockside_process_memory_rss_bytes Resident set size memory in bytes",
    "# TYPE dockside_process_memory_rss_bytes gauge",
    `dockside_process_memory_rss_bytes{service_name="${svc}"} ${snapshot.runtime.memoryRssBytes}`,
    "",
  ];
  return lines.join("\n");
}
