import { useCallback, useEffect, useRef, useState } from "react";

export type Fs02Kind = "liveLocations" | "machHealth" | "prod";

interface BaseFields {
  cn: string;
  sn: string | null;
  site: string | null;
  dateTime: string; // ISO 8601 UTC
  dateTimeRaw: string;
  timeZone: string | null;
  topic: string;
  receivedAt: string;
  rawPayload: Record<string, unknown>;
}

export interface Fs02Location extends BaseFields {
  kind: "liveLocations";
  gpsValid: boolean | null;
  lat: number | null;
  lng: number | null;
  alt: number | null;
  spd: number | null;
  hdg: number | null;
  rssi: number | null;
  firm: string | null;
  board: string | null;
  deliveryActive: boolean | null;
  flowActive: boolean | null;
  deliveryNoFlowNo: boolean | null;
  deliveryYesFlowYes: boolean | null;
  deliveryYesFlowNo: boolean | null;
  deliveryNoFlowYes: boolean | null;
}

export interface Fs02Health extends BaseFields {
  kind: "machHealth";
  volumeUnrounded: number | null;
  flowRate: number | null;
  temperature: number | null;
  grossVolume: number | null;
  compensatedVolume: number | null;
  totalizer: number | null;
}

export interface Fs02Transaction extends BaseFields {
  kind: "prod";
  ticketNumber: number;
  transactionType: string | null;
  startTime: string | null;
  finishTime: string | null;
  durationSeconds: number | null;
  volumeUnrounded: number | null;
  grossVolume: number | null;
  compensated: number | null;
  tankLoad: number | null;
  volume: number | null;
  totalizerStart: number | null;
  totalizerEnd: number | null;
}

export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

interface UseFs02ApiReturn {
  status: ConnectionStatus;
  location: Fs02Location | null;
  health: Fs02Health | null;
  transaction: Fs02Transaction | null;
  healthHistory: Fs02Health[]; // live ring buffer for chart
  apiUrl: string;
}

function normalizeBaseUrl(raw: string): string {
  const trimmed = raw.replace(/\/$/, "").trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

const HIST_BUFFER = 500;

export function useFs02Api(): UseFs02ApiReturn {
  const esRef = useRef<EventSource | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [location, setLocation] = useState<Fs02Location | null>(null);
  const [health, setHealth] = useState<Fs02Health | null>(null);
  const [transaction, setTransaction] = useState<Fs02Transaction | null>(null);
  const [healthHistory, setHealthHistory] = useState<Fs02Health[]>([]);
  const [apiUrl, setApiUrl] = useState<string>("");

  const connect = useCallback((baseUrl: string) => {
    if (esRef.current) esRef.current.close();

    const url = normalizeBaseUrl(baseUrl);
    setApiUrl(url);
    setStatus("connecting");

    // Initial hydrate: latest per kind
    fetch(`${url}/iot/fs02/latest?t=${Date.now()}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.statusText)))
      .then(
        (body: {
          data: {
            location: Fs02Location | null;
            health: Fs02Health | null;
            transaction: Fs02Transaction | null;
          };
        }) => {
          if (body.data?.location) setLocation(body.data.location);
          if (body.data?.health) {
            setHealth(body.data.health);
            setHealthHistory([body.data.health]);
          }
          if (body.data?.transaction) setTransaction(body.data.transaction);
        },
      )
      .catch((err) => console.warn("[fs02] /latest fetch failed:", err));

    // Fetch health history buat awal chart (biar gak nunggu SSE lama)
    fetch(`${url}/iot/fs02/history?kind=machHealth&limit=200`, {
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.statusText)))
      .then((body: { data: Fs02Health[] }) => {
        if (Array.isArray(body.data) && body.data.length > 0) {
          setHealthHistory(body.data.slice(0, HIST_BUFFER));
        }
      })
      .catch((err) =>
        console.warn("[fs02] /history machHealth fetch failed:", err),
      );

    const es = new EventSource(`${url}/iot/fs02/stream`);
    esRef.current = es;

    es.addEventListener("open", () => setStatus("connected"));

    es.addEventListener("fs02-snapshot", (evt) => {
      try {
        const data = JSON.parse((evt as MessageEvent).data) as {
          location: Fs02Location | null;
          health: Fs02Health | null;
          transaction: Fs02Transaction | null;
        };
        if (data.location) setLocation(data.location);
        if (data.health) setHealth(data.health);
        if (data.transaction) setTransaction(data.transaction);
      } catch (err) {
        console.warn("[fs02] snapshot parse fail:", err);
      }
    });

    es.addEventListener("fs02-location", (evt) => {
      try {
        const msg = JSON.parse((evt as MessageEvent).data) as Fs02Location;
        setLocation(msg);
      } catch (err) {
        console.warn("[fs02] location event parse fail:", err);
      }
    });

    es.addEventListener("fs02-health", (evt) => {
      try {
        const msg = JSON.parse((evt as MessageEvent).data) as Fs02Health;
        setHealth(msg);
        setHealthHistory((prev) => [msg, ...prev].slice(0, HIST_BUFFER));
      } catch (err) {
        console.warn("[fs02] health event parse fail:", err);
      }
    });

    es.addEventListener("fs02-transaction", (evt) => {
      try {
        const msg = JSON.parse((evt as MessageEvent).data) as Fs02Transaction;
        setTransaction(msg);
      } catch (err) {
        console.warn("[fs02] transaction event parse fail:", err);
      }
    });

    es.addEventListener("error", () => {
      if (es.readyState === EventSource.CLOSED) setStatus("error");
      else setStatus("connecting");
    });
  }, []);

  useEffect(() => {
    const url =
      (import.meta as unknown as { env: Record<string, string> }).env
        ?.VITE_FLOW_METER_API_URL ?? "http://localhost:3020";
    connect(url);
    return () => {
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { status, location, health, transaction, healthHistory, apiUrl };
}
