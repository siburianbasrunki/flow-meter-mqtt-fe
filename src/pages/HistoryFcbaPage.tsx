import { useCallback, useEffect, useMemo, useState } from "react";
import type { FuelConsumptionBaPayload } from "../hooks/useFuelConsumptionBaApi";
import "./history.css";

const COMPANY = "PT Putra Perkasa Abadi";

const API_URL = (() => {
  const raw =
    (import.meta as unknown as { env: Record<string, string> }).env
      ?.VITE_FLOW_METER_API_URL ?? "http://localhost:3020";
  const trimmed = raw.replace(/\/$/, "").trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
})();

type RangeMode = "live" | "1h" | "6h" | "24h" | "7d" | "custom";
const PRESET_HOURS: Record<Exclude<RangeMode, "live" | "custom">, number> = {
  "1h": 1,
  "6h": 6,
  "24h": 24,
  "7d": 24 * 7,
};

function toLocalInput(d: Date): string {
  const wib = new Date(d.getTime() + 7 * 60 * 60 * 1000);
  return wib.toISOString().slice(0, 16);
}

function fmt(n: number | null | undefined, digits = 2) {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("id-ID", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n);
}

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

interface FcbaRowWithDelta extends FuelConsumptionBaPayload {
  _fuelDelta: number | null;
}

export default function HistoryFcbaPage() {
  const [cns, setCns] = useState<string[]>([]);
  const [selectedCn, setSelectedCn] = useState<string>("");
  const [rangeMode, setRangeMode] = useState<RangeMode>("24h");
  const [customFrom, setCustomFrom] = useState<string>(() =>
    toLocalInput(new Date(Date.now() - 24 * 60 * 60 * 1000)),
  );
  const [customTo, setCustomTo] = useState<string>(() =>
    toLocalInput(new Date()),
  );
  const [rows, setRows] = useState<FuelConsumptionBaPayload[]>([]);
  const [source, setSource] = useState<"db" | "cache" | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    fetch(`${API_URL}/iot/fuel-consumption-ba/list`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.statusText)))
      .then((body: { data: string[] }) => {
        const list = Array.isArray(body.data) ? body.data : [];
        setCns(list);
        setSelectedCn((prev) => prev || list[0] || "");
      })
      .catch((err) => console.warn("[history-fcba] list fetch failed:", err));
  }, []);

  useEffect(() => {
    if (!selectedCn) return;

    let fromDate: Date | null = null;
    let toDate: Date | null = null;

    if (rangeMode === "custom") {
      if (!customFrom || !customTo) return;
      fromDate = new Date(customFrom + ":00+07:00");
      toDate = new Date(customTo + ":00+07:00");
      if (
        !Number.isFinite(fromDate.getTime()) ||
        !Number.isFinite(toDate.getTime())
      ) {
        setError("Range custom tidak valid");
        setRows([]);
        return;
      }
      if (fromDate >= toDate) {
        setError("'From' harus sebelum 'To'");
        setRows([]);
        return;
      }
    } else if (rangeMode !== "live") {
      const hoursBack = PRESET_HOURS[rangeMode];
      toDate = new Date();
      fromDate = new Date(toDate.getTime() - hoursBack * 60 * 60 * 1000);
    }

    const controller = new AbortController();
    const params = new URLSearchParams({
      cn: selectedCn,
      limit: "5000",
    });
    if (fromDate && toDate) {
      params.set("from", fromDate.toISOString());
      params.set("to", toDate.toISOString());
    }

    setLoading(true);
    setError(null);
    fetch(
      `${API_URL}/iot/fuel-consumption-ba/history?${params.toString()}`,
      { signal: controller.signal, cache: "no-store" },
    )
      .then((r) => (r.ok ? r.json() : Promise.reject(r.statusText)))
      .then(
        (body: {
          data: FuelConsumptionBaPayload[];
          source?: "db" | "cache";
        }) => {
          setRows(Array.isArray(body.data) ? body.data : []);
          setSource(body.source ?? null);
        },
      )
      .catch((err) => {
        if (err?.name === "AbortError") return;
        console.warn("[history-fcba] fetch failed:", err);
        setError(String(err));
        setRows([]);
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [selectedCn, rangeMode, customFrom, customTo, refreshTick]);

  const rowsWithDelta: FcbaRowWithDelta[] = useMemo(() => {
    return rows.map((r, i) => {
      const next = rows[i + 1];
      const delta =
        next &&
        typeof next.totalFuelConsum === "number" &&
        typeof r.totalFuelConsum === "number"
          ? r.totalFuelConsum - next.totalFuelConsum
          : null;
      return { ...r, _fuelDelta: delta };
    });
  }, [rows]);

  const handleExportCsv = useCallback(() => {
    if (rows.length === 0) return;
    const header = [
      "no",
      "datetime_wib",
      "cn",
      "sn",
      "fuel_level_pct",
      "fuel_rate_lph",
      "total_fuel_consum_l",
      "fuel_delta_l",
      "total_idle_fuel_l",
      "engine_rpm",
      "vehicle_speed_kmh",
      "total_hm_h",
      "coolant_temp_c",
      "oil_pressure_mpa",
      "actual_payload_t",
      "load_count",
      "battery_voltage_v",
      "lat",
      "lon",
      "alt",
      "received_at",
    ];
    const lines = [header.join(",")];
    rowsWithDelta.forEach((r, i) => {
      lines.push(
        [
          i + 1,
          r.dateTime,
          r.cn,
          r.sn ?? "",
          r.fuelLevel ?? "",
          r.fuelRate ?? "",
          r.totalFuelConsum ?? "",
          r._fuelDelta ?? "",
          r.totalIdleFuel ?? "",
          r.hmEngine1 ?? "",
          r.vehicleSpeed ?? "",
          r.totalHmEngine1 ?? "",
          r.coolantTemperature ?? "",
          r.oilPressure ?? "",
          r.actualPayload ?? "",
          r.loadCount ?? "",
          r.batteryVoltage ?? "",
          r.lat ?? "",
          r.lon ?? "",
          r.alt ?? "",
          r.receivedAt ?? "",
        ]
          .map(csvEscape)
          .join(","),
      );
    });
    const blob = new Blob([lines.join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fcba-${selectedCn}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [rows.length, rowsWithDelta, selectedCn]);

  return (
    <div className="hist-dashboard">
      <header className="hist-header">
        <div className="hist-header-left">
          <div className="hist-header-logo">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#1a56db"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2" />
              <path d="M15 18h5a1 1 0 0 0 1-1v-3.34a1 1 0 0 0-.29-.7l-2.42-2.42a1 1 0 0 0-.7-.29H15" />
              <circle cx="7" cy="18" r="2" />
              <circle cx="17" cy="18" r="2" />
            </svg>
          </div>
          <div>
            <h1 className="hist-header-title">History Fuel Consumption BA</h1>
            <p className="hist-header-sub">{COMPANY} · SPT Dashboard</p>
          </div>
        </div>
        <div className="hist-header-right">
          {source && (
            <span className={`hist-source-badge hist-source-${source}`}>
              source · {source}
            </span>
          )}
        </div>
      </header>

      <section className="hist-filters">
        <div className="hist-filter-row">
          <label className="hist-field">
            <span className="hist-field-label">HD Unit</span>
            <select
              className="hist-select"
              value={selectedCn}
              onChange={(e) => setSelectedCn(e.target.value)}
            >
              {cns.length === 0 && <option value="">(no HD units)</option>}
              {cns.map((cn) => (
                <option key={cn} value={cn}>
                  {cn}
                </option>
              ))}
            </select>
          </label>

          <div className="hist-field">
            <span className="hist-field-label">Range</span>
            <div className="hist-pills">
              {(
                ["live", "1h", "6h", "24h", "7d", "custom"] as RangeMode[]
              ).map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`hist-pill${
                    rangeMode === m ? " hist-pill-active" : ""
                  }`}
                  onClick={() => setRangeMode(m)}
                >
                  {m === "live" ? "Live" : m}
                </button>
              ))}
            </div>
          </div>

          {rangeMode === "custom" && (
            <div className="hist-custom">
              <label className="hist-field">
                <span className="hist-field-label">From</span>
                <input
                  type="datetime-local"
                  className="hist-input"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                />
              </label>
              <label className="hist-field">
                <span className="hist-field-label">To</span>
                <input
                  type="datetime-local"
                  className="hist-input"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                />
              </label>
            </div>
          )}

          <div className="hist-actions">
            <button
              type="button"
              className="hist-btn"
              onClick={() => setRefreshTick((t) => t + 1)}
              disabled={loading}
            >
              {loading ? "loading…" : "Refresh"}
            </button>
            <button
              type="button"
              className="hist-btn hist-btn-primary"
              onClick={handleExportCsv}
              disabled={rows.length === 0}
            >
              Export CSV
            </button>
          </div>
        </div>

        {error && <div className="hist-error">{error}</div>}
      </section>

      <main className="hist-main">
        <div className="hist-table-wrap">
          <table className="hist-table">
            <thead>
              <tr>
                <th className="hist-num">#</th>
                <th>Datetime (WIB)</th>
                <th>Type</th>
                <th>CN</th>
                <th>SN</th>
                <th className="hist-num">Fuel Level (%)</th>
                <th className="hist-num">Fuel Rate (L/h)</th>
                <th className="hist-num">Total Consum (L)</th>
                <th className="hist-num">Kenaikan (L)</th>
                <th className="hist-num">Idle Fuel (L)</th>
                <th className="hist-num">RPM</th>
                <th className="hist-num">Speed (km/h)</th>
                <th className="hist-num">Total HM (h)</th>
                <th className="hist-num">Coolant (°C)</th>
                <th className="hist-num">Payload (t)</th>
                <th className="hist-num">Load Count</th>
                <th className="hist-num">Batt (V)</th>
                <th>GPS</th>
                <th>Received (WIB)</th>
              </tr>
            </thead>
            <tbody>
              {rowsWithDelta.length === 0 ? (
                <tr>
                  <td colSpan={19} className="hist-empty">
                    {loading ? "Loading…" : "Belum ada data untuk range ini"}
                  </td>
                </tr>
              ) : (
                rowsWithDelta.map((r, i) => (
                  <tr key={`${r.cn}-${r.dateTime}-${i}`}>
                    <td className="hist-num hist-mono">{i + 1}</td>
                    <td className="hist-mono">{r.dateTime}</td>
                    <td className="hist-mono">
                      {r.deviceType ? (
                        <span
                          className={`hist-type-badge hist-type-${r.deviceType}`}
                        >
                          {String(r.deviceType).toUpperCase()}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="hist-mono">{r.cn}</td>
                    <td className="hist-mono">{r.sn ?? "—"}</td>
                    <td className="hist-num hist-mono">{fmt(r.fuelLevel, 1)}</td>
                    <td className="hist-num hist-mono">{fmt(r.fuelRate, 2)}</td>
                    <td className="hist-num hist-mono">
                      {fmt(r.totalFuelConsum, 2)}
                    </td>
                    <td
                      className={`hist-num hist-mono${
                        r._fuelDelta && r._fuelDelta > 0
                          ? " hist-delta-pos"
                          : ""
                      }`}
                    >
                      {r._fuelDelta === null
                        ? "—"
                        : (r._fuelDelta > 0 ? "+" : "") +
                          fmt(r._fuelDelta, 2)}
                    </td>
                    <td className="hist-num hist-mono">
                      {fmt(r.totalIdleFuel, 2)}
                    </td>
                    <td className="hist-num hist-mono">
                      {r.hmEngine1 !== null && r.hmEngine1 !== undefined
                        ? fmt(r.hmEngine1, 0)
                        : "—"}
                    </td>
                    <td className="hist-num hist-mono">
                      {fmt(r.vehicleSpeed, 1)}
                    </td>
                    <td className="hist-num hist-mono">
                      {fmt(r.totalHmEngine1, 1)}
                    </td>
                    <td className="hist-num hist-mono">
                      {fmt(r.coolantTemperature, 1)}
                    </td>
                    <td className="hist-num hist-mono">
                      {fmt(r.actualPayload, 1)}
                    </td>
                    <td className="hist-num hist-mono">
                      {r.loadCount !== null && r.loadCount !== undefined
                        ? fmt(r.loadCount, 0)
                        : "—"}
                    </td>
                    <td className="hist-num hist-mono">
                      {fmt(r.batteryVoltage, 1)}
                    </td>
                    <td className="hist-mono">
                      {r.lat !== null &&
                      r.lat !== undefined &&
                      r.lon !== null &&
                      r.lon !== undefined
                        ? `${fmt(r.lat, 4)}, ${fmt(r.lon, 4)}`
                        : "—"}
                    </td>
                    <td className="hist-mono">{r.receivedAt ?? "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </main>

      <footer className="hist-footer">
        <span>
          Total rows: <code>{rows.length}</code>
        </span>
        <span>
          API: <code>{API_URL}</code>
        </span>
        <span className="hist-footer-time">
          {new Date().toLocaleTimeString("id-ID")}
        </span>
      </footer>
    </div>
  );
}
