import { useCallback, useEffect, useRef, useState } from "react";

export interface FuelConsumptionBaPayload {
  deviceType?: "cat777" | "hd785" | string | null;
  cn: string;
  sn?: string | null;
  dateTime: string;
  timeZone?: string | null;

  lat?: number | null;
  lon?: number | null;
  alt?: number | null;
  hdg?: number | null;

  fuelLevel?: number | null;
  fuelRate?: number | null;
  totalFuelConsum?: number | null;
  totalIdleFuel?: number | null;
  totalIdleTime?: number | null;
  fuelTemperature?: number | null;
  fuelPressure?: number | null;

  hmEngine1?: number | null;
  totalHmEngine1?: number | null;
  coolantTemperature?: number | null;
  oilPressure?: number | null;
  engineTorque?: number | null;
  boostPressure?: number | null;
  intakeManifoldAirTemp?: number | null;
  airInletTemperature?: number | null;
  rightExhaustTemp?: number | null;

  vehicleSpeed?: number | null;
  odometer?: number | null;
  gearPosition?: number | null;
  ambientAirTemperature?: number | null;
  atmosphericPressure?: number | null;
  batteryVoltage?: number | null;
  brakeOilTemperature?: number | null;
  transmissionOilTemp?: number | null;
  torqueConverterOilTemp?: number | null;
  retarderPosition?: number | null;

  actualPayload?: number | null;
  loadCount?: number | null;
  lifetimeTotalPayloadWeight?: number | null;
  hoistLeverPosition?: number | null;
  bodyUp?: number | null;
  parkingBrakeState?: number | null;
  servicebrakePosition?: number | null;

  vimsEnh?: number | null;
  vimsPing?: number | null;
  vimsCyc?: number | null;

  // HD785-specific
  gradient?: number | null;
  hydraulicOilTemp?: number | null;
  engineOilTemp?: number | null;
  blowByPressure?: number | null;
  alternatorVoltage?: number | null;
  keyOn?: number | null;
  emptyVehicleWeight?: number | null;
  calcWeight?: number | null;
  bodyFloat?: number | null;
  bodySeating?: number | null;
  vehicleState?: number | null;
  vehicleStateMain?: number | null;
  retarderOn?: number | null;
  footBrakePosition?: number | null;
  rearBrakeOilPressure?: number | null;
  transmissionInputSpeed?: number | null;
  boostTemp?: number | null;
  tcOutputTorque?: number | null;
  fuelInjection?: number | null;
  liveWeightDisp?: number | null;
  engineRunTime?: number | null;
  engineSpeedPrev?: number | null;

  receivedAt?: string;
  topic?: string;
  [k: string]: unknown;
}

export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

interface UseFcbaApiReturn {
  status: ConnectionStatus;
  units: FuelConsumptionBaPayload[];
  liveHistoryByCn: Map<string, FuelConsumptionBaPayload[]>;
  apiUrl: string;
}

function normalizeBaseUrl(raw: string): string {
  const trimmed = raw.replace(/\/$/, "").trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

const HIST_BUFFER = 500;

/**
 * Konek ke `/iot/fuel-consumption-ba/*`:
 * - GET /latest (initial hydrate)
 * - GET /stream (SSE realtime push, event: fcba-snapshot + fuel-consumption-ba)
 *
 * `units` = latest reading per cn (sorted).
 * `liveHistoryByCn` = ring buffer per cn dari SSE stream (buat chart live mode).
 */
export function useFuelConsumptionBaApi(): UseFcbaApiReturn {
  const esRef = useRef<EventSource | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [units, setUnits] = useState<FuelConsumptionBaPayload[]>([]);
  const [liveHistoryByCn, setLiveHistoryByCn] = useState<
    Map<string, FuelConsumptionBaPayload[]>
  >(new Map());
  const [apiUrl, setApiUrl] = useState<string>("");

  const upsertUnit = useCallback((incoming: FuelConsumptionBaPayload) => {
    setUnits((prev) => {
      const idx = prev.findIndex((u) => u.cn === incoming.cn);
      const next = idx >= 0 ? [...prev] : [...prev, incoming];
      if (idx >= 0) next[idx] = incoming;
      return next.sort((a, b) => a.cn.localeCompare(b.cn));
    });
    setLiveHistoryByCn((prev) => {
      const next = new Map(prev);
      const buf = next.get(incoming.cn) ?? [];
      const updated = [incoming, ...buf].slice(0, HIST_BUFFER);
      next.set(incoming.cn, updated);
      return next;
    });
  }, []);

  const connect = useCallback(
    (baseUrl: string) => {
      if (esRef.current) esRef.current.close();

      const url = normalizeBaseUrl(baseUrl);
      setApiUrl(url);
      setStatus("connecting");

      fetch(`${url}/iot/fuel-consumption-ba/latest?t=${Date.now()}`, {
        cache: "no-store",
      })
        .then((r) => (r.ok ? r.json() : Promise.reject(r.statusText)))
        .then((body: { data: FuelConsumptionBaPayload[] }) => {
          if (Array.isArray(body.data) && body.data.length > 0) {
            setUnits(
              [...body.data].sort((a, b) => a.cn.localeCompare(b.cn)),
            );
          }
        })
        .catch((err) => console.warn("[fcba] initial /latest failed:", err));

      const es = new EventSource(`${url}/iot/fuel-consumption-ba/stream`);
      esRef.current = es;

      es.addEventListener("open", () => setStatus("connected"));

      es.addEventListener("fcba-snapshot", (evt) => {
        try {
          const data = JSON.parse(
            (evt as MessageEvent).data,
          ) as FuelConsumptionBaPayload[];
          if (Array.isArray(data) && data.length > 0) {
            setUnits([...data].sort((a, b) => a.cn.localeCompare(b.cn)));
          }
        } catch (err) {
          console.warn("[fcba] snapshot parse fail:", err);
        }
      });

      es.addEventListener("fuel-consumption-ba", (evt) => {
        try {
          const msg = JSON.parse(
            (evt as MessageEvent).data,
          ) as FuelConsumptionBaPayload;
          upsertUnit(msg);
        } catch (err) {
          console.warn("[fcba] event parse fail:", err);
        }
      });

      es.addEventListener("error", () => {
        if (es.readyState === EventSource.CLOSED) setStatus("error");
        else setStatus("connecting");
      });
    },
    [upsertUnit],
  );

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

  return { status, units, liveHistoryByCn, apiUrl };
}
