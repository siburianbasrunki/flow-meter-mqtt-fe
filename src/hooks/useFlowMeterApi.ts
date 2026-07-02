import { useCallback, useEffect, useRef, useState } from "react";

export interface FlowMeterPayload {
  datetime: string;
  timezone?: string | null;
  totalisator: number;
  pulse?: number | null;
  pulseEQEP?: number | null;
  flow_rate?: number | null;
  fm_id: string;
  slocn?: string | null;
  plant_id?: string | null;
  company?: string | null;
  fuel_level?: number | null;
  received_at?: string;
  receivedAt?: string;
  topic?: string;
  [k: string]: unknown;
}

export interface FeedbackPayload {
  received_at: string;
  status: "ok" | "error";
  fm_id: string;
  datetime_echoed: string;
}

export interface ApiConfig {
  baseUrl: string;
}

export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

interface UseFlowMeterApiReturn {
  status: ConnectionStatus;
  messages: FlowMeterPayload[];
  latestMessage: FlowMeterPayload | null;
  connect: (config: ApiConfig) => void;
  disconnect: () => void;
  apiUrl: string;
}

const HISTORY_LIMIT = 500;

/**
 * Konek ke `flow-meter-api` lewat:
 * - GET /iot/flow-meter/latest         (initial hydrate)
 * - GET /iot/flow-meter/stream (SSE)   (realtime push)
 *
 * Bentuk return-nya sengaja mirror `useMqtt` biar minim perubahan di Dashboard.
 */
export function useFlowMeterApi(): UseFlowMeterApiReturn {
  const esRef = useRef<EventSource | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [messages, setMessages] = useState<FlowMeterPayload[]>([]);
  const [latestMessage, setLatestMessage] =
    useState<FlowMeterPayload | null>(null);
  const [apiUrl, setApiUrl] = useState<string>("");

  const disconnect = useCallback(() => {
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
    setStatus("disconnected");
  }, []);

  const connect = useCallback((config: ApiConfig) => {
    if (esRef.current) {
      esRef.current.close();
    }

    const baseUrl = config.baseUrl.replace(/\/$/, "");
    setApiUrl(baseUrl);
    setStatus("connecting");

    // 1. Initial hydrate dari /latest (best-effort, kalau gagal SSE snapshot bakal isi)
    // cache-busting + no-store biar browser gak pake response 304 stale
    fetch(`${baseUrl}/iot/flow-meter/latest?t=${Date.now()}`, {
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.statusText)))
      .then((body: { data: FlowMeterPayload[] }) => {
        if (Array.isArray(body.data) && body.data.length > 0) {
          setMessages((prev) => mergeMessages(prev, body.data));
          setLatestMessage(body.data[0] ?? null);
        }
      })
      .catch((err) => {
        console.warn("[api] initial /latest failed:", err);
      });

    // 2. Subscribe SSE
    const es = new EventSource(`${baseUrl}/iot/flow-meter/stream`);
    esRef.current = es;

    es.addEventListener("open", () => {
      setStatus("connected");
    });

    es.addEventListener("snapshot", (evt) => {
      try {
        const data = JSON.parse(
          (evt as MessageEvent).data
        ) as FlowMeterPayload[];
        if (Array.isArray(data) && data.length > 0) {
          setMessages((prev) => mergeMessages(prev, data));
          setLatestMessage(data[0]);
        }
      } catch (err) {
        console.warn("[api] snapshot parse fail:", err);
      }
    });

    es.addEventListener("flow-meter", (evt) => {
      try {
        const msg = JSON.parse(
          (evt as MessageEvent).data
        ) as FlowMeterPayload;
        setMessages((prev) => [msg, ...prev].slice(0, HISTORY_LIMIT));
        setLatestMessage(msg);
      } catch (err) {
        console.warn("[api] flow-meter event parse fail:", err);
      }
    });

    es.addEventListener("error", () => {
      // EventSource auto-reconnects; show error briefly
      if (es.readyState === EventSource.CLOSED) {
        setStatus("error");
      } else {
        setStatus("connecting");
      }
    });
  }, []);

  // Auto-connect once on mount using env (lae bisa override pakai connect())
  useEffect(() => {
    const url =
      (import.meta as unknown as { env: Record<string, string> }).env
        ?.VITE_FLOW_METER_API_URL ?? "http://localhost:3002";
    connect({ baseUrl: url });
    return () => {
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { status, messages, latestMessage, connect, disconnect, apiUrl };
}

/**
 * Merge initial snapshot ke state. Setiap fm_id hanya 1 entry terbaru.
 * Snapshot biasanya 1 entry per fm_id, jadi cukup unshift di depan + dedupe.
 */
function mergeMessages(
  prev: FlowMeterPayload[],
  incoming: FlowMeterPayload[]
): FlowMeterPayload[] {
  const seen = new Set<string>();
  const out: FlowMeterPayload[] = [];
  // incoming first (treated as newest)
  for (const m of incoming) {
    const key = `${m.fm_id}|${m.datetime}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(m);
    }
  }
  for (const m of prev) {
    const key = `${m.fm_id}|${m.datetime}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(m);
    }
  }
  return out.slice(0, HISTORY_LIMIT);
}
