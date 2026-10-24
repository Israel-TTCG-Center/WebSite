import { trace } from "@opentelemetry/api";

export async function register() {
  const tracer = trace.getTracer("dockside-keep-web", "1.0.0");
  const span = tracer.startSpan("nextjs.server.register");
  span.setAttribute(
    "service.name",
    process.env.OTEL_SERVICE_NAME || "dockside-keep-web"
  );
  span.end();
}
