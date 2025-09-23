// webapp/src/telemetry.ts
export type TelemetryEvent = {
  ts: string;
  source: "pxt";
  exp_id?: string;
  case_id?: string;
  user_id?: string;
  device_id?: string;
  event: string;
  category: string;
  duration_ms?: number;
  props?: any;
};

const cfg = {
  endpoint: (localStorage.getItem("telemetry_endpoint")
    || (window as any).__TELEMETRY_ENDPOINT__) // ビルド時注入も可
    || "http://localhost:3000/api/telemetry",
  token: (localStorage.getItem("telemetry_token")
    || (window as any).__TELEMETRY_TOKEN__)
    || "please_change_me",
  batchSize: 50,
  flushMs: 1500,
};

let q: TelemetryEvent[] = [];
let timer: any;

export function push(ev: Omit<TelemetryEvent, "ts" | "source">) {
  q.push({ ts: new Date().toISOString(), source: "pxt", ...ev });
  schedule();
}

function schedule() {
  if (q.length >= cfg.batchSize) { void flush(); return; }
  if (timer) return;
  timer = setTimeout(() => { timer = undefined; void flush(); }, cfg.flushMs);
}

export async function flush() {
  if (q.length === 0) return;
  const batch = q.splice(0, q.length);
  try {
    const body = JSON.stringify({ events: batch });
    await fetch(cfg.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-telemetry-token": cfg.token,
      },
      body,
      keepalive: true
    });
  } catch {
    // 失敗時は戻して次回再送
    q.unshift(...batch);
  }
}
