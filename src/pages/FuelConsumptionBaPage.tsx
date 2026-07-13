import { useEffect, useMemo, useState } from "react";
import {
  useFuelConsumptionBaApi,
  type FuelConsumptionBaPayload,
} from "../hooks/useFuelConsumptionBaApi";
import "./fuel-consumption-ba.css";

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

function fmt(n: number | null | undefined, digits = 2) {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("id-ID", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n);
}

function fmtInt(n: number | null | undefined) {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(n);
}

function parseWib(s: string | undefined): number {
  if (!s) return NaN;
  const cleaned = s.includes("T") ? s : s.replace(" ", "T");
  const hasTz = /[Zz]|[+-]\d{2}:?\d{2}$/.test(cleaned);
  return new Date(hasTz ? cleaned : cleaned + "+07:00").getTime();
}

function ageBadge(dateTime: string | undefined, receivedAt?: string): string {
  const ref = receivedAt ?? dateTime;
  if (!ref) return "—";
  const ts = parseWib(ref);
  if (!Number.isFinite(ts)) return "—";
  const ageSec = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (ageSec < 60) return `${ageSec}s ago`;
  if (ageSec < 3600) return `${Math.floor(ageSec / 60)}m ago`;
  return `${Math.floor(ageSec / 3600)}h ago`;
}

function fuelColor(level: number | null | undefined): string {
  if (level === null || level === undefined || !Number.isFinite(level))
    return "#94a3b8";
  if (level >= 60) return "#16a34a";
  if (level >= 30) return "#d97706";
  return "#dc2626";
}

function toLocalInput(d: Date): string {
  const wib = new Date(d.getTime() + 7 * 60 * 60 * 1000);
  return wib.toISOString().slice(0, 16);
}

export default function FuelConsumptionBaPage() {
  const { status, units, liveHistoryByCn, apiUrl } = useFuelConsumptionBaApi();

  // Sidebar hanya nampilin unit yang aktif (live cache). Unit offline
  // di-hide supaya sidebar bersih.
  const displayUnits = useMemo(
    () => [...units].sort((a, b) => a.cn.localeCompare(b.cn)),
    [units],
  );

  const [selectedCn, setSelectedCn] = useState<string | null>(null);
  useEffect(() => {
    if (displayUnits.length === 0) {
      if (selectedCn) setSelectedCn(null);
      return;
    }
    if (!selectedCn || !displayUnits.find((u) => u.cn === selectedCn)) {
      setSelectedCn(displayUnits[0].cn);
    }
  }, [displayUnits, selectedCn]);

  const selected = useMemo(
    () => units.find((u) => u.cn === selectedCn) ?? null,
    [units, selectedCn],
  );

  const isSelectedStale = selectedCn !== null && selected === null;

  // ── Range filter for chart ───────────────────────────────────────
  const [rangeMode, setRangeMode] = useState<RangeMode>("live");
  const [customFrom, setCustomFrom] = useState<string>(() =>
    toLocalInput(new Date(Date.now() - 24 * 60 * 60 * 1000)),
  );
  const [customTo, setCustomTo] = useState<string>(() =>
    toLocalInput(new Date()),
  );
  const [historyData, setHistoryData] = useState<
    FuelConsumptionBaPayload[] | null
  >(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  useEffect(() => {
    if (rangeMode === "live") {
      setHistoryData(null);
      setHistoryError(null);
      return;
    }
    if (!selectedCn) return;

    let fromDate: Date, toDate: Date;
    if (rangeMode === "custom") {
      if (!customFrom || !customTo) return;
      fromDate = new Date(customFrom + ":00+07:00");
      toDate = new Date(customTo + ":00+07:00");
      if (
        !Number.isFinite(fromDate.getTime()) ||
        !Number.isFinite(toDate.getTime())
      ) {
        setHistoryError("Range custom tidak valid");
        setHistoryData([]);
        return;
      }
      if (fromDate >= toDate) {
        setHistoryError("'From' harus sebelum 'To'");
        setHistoryData([]);
        return;
      }
    } else {
      const hoursBack = PRESET_HOURS[rangeMode];
      toDate = new Date();
      fromDate = new Date(toDate.getTime() - hoursBack * 60 * 60 * 1000);
    }

    const controller = new AbortController();
    const params = new URLSearchParams({
      cn: selectedCn,
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
      limit: "5000",
    });
    setHistoryLoading(true);
    setHistoryError(null);
    fetch(`${API_URL}/iot/fuel-consumption-ba/history?${params.toString()}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.statusText)))
      .then((body: { data: FuelConsumptionBaPayload[] }) => {
        setHistoryData(Array.isArray(body.data) ? body.data : []);
      })
      .catch((err) => {
        if (err?.name === "AbortError") return;
        console.warn("[fcba] history fetch failed:", err);
        setHistoryError(String(err));
        setHistoryData([]);
      })
      .finally(() => setHistoryLoading(false));

    return () => controller.abort();
  }, [rangeMode, selectedCn, customFrom, customTo]);

  const chartData: FuelConsumptionBaPayload[] = useMemo(() => {
    if (rangeMode === "live") {
      return selectedCn ? liveHistoryByCn.get(selectedCn) ?? [] : [];
    }
    return historyData ?? [];
  }, [rangeMode, selectedCn, liveHistoryByCn, historyData]);

  // KPI
  const kpiUnitCount = units.length;
  const kpiAvgFuel = useMemo(() => {
    const vals = units
      .map((u) => u.fuelLevel)
      .filter((v): v is number => typeof v === "number" && v > 0);
    if (vals.length === 0) return null;
    return vals.reduce((s, v) => s + v, 0) / vals.length;
  }, [units]);
  const kpiTotalConsum = useMemo(() => {
    return units.reduce(
      (s, u) =>
        s + (typeof u.totalFuelConsum === "number" ? u.totalFuelConsum : 0),
      0,
    );
  }, [units]);
  const kpiLastReceived = useMemo(() => {
    let latest: string | null = null;
    for (const u of units) {
      const ts = u.receivedAt ?? u.dateTime;
      if (!ts) continue;
      if (!latest || ts > latest) latest = ts;
    }
    return latest;
  }, [units]);

  const statusColor = {
    disconnected: "#9ca3af",
    connecting: "#f59e0b",
    connected: "#22c55e",
    error: "#ef4444",
  }[status];
  const statusLabel = {
    disconnected: "Disconnected",
    connecting: "Connecting...",
    connected: "Connected",
    error: "Error",
  }[status];

  return (
    <div className="fcba-dashboard">
      <header className="fcba-header">
        <div className="fcba-header-left">
          <div className="fcba-header-logo">
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
            <h1 className="fcba-header-title">Fuel Consumption · BA (CAT777 &amp; HD785)</h1>
            <p className="fcba-header-sub">{COMPANY} · SPT Dashboard</p>
          </div>
        </div>
        <div className="fcba-header-right">
          <div
            className="fcba-status-pill"
            style={{ "--status-color": statusColor } as React.CSSProperties}
          >
            <span className="fcba-status-dot" />
            <span>{statusLabel}</span>
          </div>
        </div>
      </header>

      <section className="fcba-kpi-row">
        <KpiTile
          label="HD Aktif"
          value={String(kpiUnitCount)}
          hint="unit terdeteksi"
          color="#0891b2"
        />
        <KpiTile
          label="Avg Fuel Level"
          value={kpiAvgFuel !== null ? fmt(kpiAvgFuel, 1) + "%" : "—"}
          hint="rata-rata (>0%)"
          color="#16a34a"
        />
        <KpiTile
          label="Total Consumption"
          value={fmt(kpiTotalConsum, 1) + " L"}
          hint="akumulasi total"
          color="#ea580c"
        />
        <KpiTile
          label="Last Received"
          value={kpiLastReceived?.slice(11, 19) ?? "—"}
          hint={kpiLastReceived?.slice(0, 10) ?? "no data"}
          color="#7c3aed"
        />
      </section>

      <main className="fcba-main">
        <aside className="fcba-list-panel">
          <div className="fcba-panel-title">HD Units</div>
          <div className="fcba-list">
            {displayUnits.length === 0 ? (
              <div className="fcba-list-empty">Belum ada data</div>
            ) : (
              displayUnits.map((u) => {
                const isActive = selectedCn === u.cn;
                const hasLive = u.dateTime !== "";
                return (
                  <button
                    key={u.cn}
                    className={`fcba-list-item${
                      isActive ? " fcba-list-item-active" : ""
                    }${!hasLive ? " fcba-list-item-stale" : ""}`}
                    onClick={() => setSelectedCn(u.cn)}
                  >
                    <div className="fcba-list-id">
                      <span
                        className="fcba-list-led"
                        style={{
                          background: hasLive
                            ? fuelColor(u.fuelLevel)
                            : "#94a3b8",
                        }}
                      />
                      {u.cn}
                      {u.deviceType && (
                        <span
                          className={`fcba-list-type fcba-type-${u.deviceType}`}
                        >
                          {u.deviceType.toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className="fcba-list-meta">
                      {hasLive ? (
                        <>
                          <span className="fcba-mono">
                            {u.fuelLevel !== null && u.fuelLevel !== undefined
                              ? fmt(u.fuelLevel, 0) + "%"
                              : "—"}
                          </span>
                          <span className="fcba-list-rate fcba-mono">
                            {u.fuelRate !== null && u.fuelRate !== undefined
                              ? fmt(u.fuelRate, 1) + " L/h"
                              : "—"}
                          </span>
                        </>
                      ) : (
                        <span className="fcba-list-stale-label">
                          no live · pilih range historikal
                        </span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        <section className="fcba-detail-panel">
          {isSelectedStale && selectedCn ? (
            <StaleUnitDetail
              cn={selectedCn}
              rangeMode={rangeMode}
              setRangeMode={setRangeMode}
              customFrom={customFrom}
              setCustomFrom={setCustomFrom}
              customTo={customTo}
              setCustomTo={setCustomTo}
              chartData={chartData}
              historyLoading={historyLoading}
              historyError={historyError}
            />
          ) : selected ? (
            <>
              <div className="fcba-tbar">
                <div className="fcba-tbar-id">{selected.cn}</div>
                {selected.deviceType && (
                  <span
                    className={`fcba-tbar-badge fcba-type-${selected.deviceType}`}
                  >
                    {selected.deviceType.toUpperCase()}
                  </span>
                )}
                <div className="fcba-tbar-meta">
                  <span className="fcba-mono">
                    {selected.sn ? `SN ${selected.sn}` : ""}
                  </span>
                  {selected.lat !== null && selected.lon !== null &&
                    selected.lat !== undefined && selected.lon !== undefined && (
                      <>
                        <span className="fcba-tbar-sep">·</span>
                        <span className="fcba-mono">
                          {fmt(selected.lat, 5)}, {fmt(selected.lon, 5)}
                        </span>
                      </>
                    )}
                  {selected.alt !== null && selected.alt !== undefined && (
                    <>
                      <span className="fcba-tbar-sep">·</span>
                      <span className="fcba-mono">
                        alt {fmt(selected.alt, 1)}m
                      </span>
                    </>
                  )}
                </div>
                <div className="fcba-tbar-spacer" />
                <div className="fcba-tbar-time fcba-mono">
                  {selected.dateTime}{" "}
                  <span className="fcba-muted">
                    ({ageBadge(selected.dateTime, selected.receivedAt)})
                  </span>
                </div>
              </div>

              <div className="fcba-hero-row">
                <div className="fcba-hero-cell">
                  <div className="fcba-hero-label">FUEL LEVEL</div>
                  <FuelGauge value={selected.fuelLevel ?? null} />
                </div>
                <div className="fcba-hero-divider" />
                <div className="fcba-hero-cell fcba-hero-cell-secondary">
                  <div className="fcba-hero-label">FUEL RATE</div>
                  <div className="fcba-hero-value">
                    <span className="fcba-hero-number">
                      {fmt(selected.fuelRate, 2)}
                    </span>
                    <span className="fcba-hero-unit">L/h</span>
                  </div>
                  <div className="fcba-hero-sub fcba-mono">
                    Total: {fmt(selected.totalFuelConsum, 2)} L · Idle:{" "}
                    {fmt(selected.totalIdleFuel, 2)} L
                  </div>
                </div>
              </div>

              {/* Charts */}
              <div className="fcba-chart-section">
                <div className="fcba-chart-head">
                  <div className="fcba-chart-title">Trend Fuel · Live/History</div>
                  <div className="fcba-chart-meta">
                    {historyLoading
                      ? "loading…"
                      : `${chartData.length} data point · WIB`}
                  </div>
                </div>
                <div className="fcba-range-bar">
                  <div className="fcba-range-pills">
                    {(
                      ["live", "1h", "6h", "24h", "7d", "custom"] as RangeMode[]
                    ).map((m) => (
                      <button
                        key={m}
                        type="button"
                        className={`fcba-range-pill${
                          rangeMode === m ? " fcba-range-pill-active" : ""
                        }`}
                        onClick={() => setRangeMode(m)}
                      >
                        {m === "live" ? "Live" : m}
                      </button>
                    ))}
                  </div>
                  {rangeMode === "custom" && (
                    <div className="fcba-range-custom">
                      <label className="fcba-range-label">
                        From
                        <input
                          type="datetime-local"
                          className="fcba-range-input"
                          value={customFrom}
                          onChange={(e) => setCustomFrom(e.target.value)}
                        />
                      </label>
                      <label className="fcba-range-label">
                        To
                        <input
                          type="datetime-local"
                          className="fcba-range-input"
                          value={customTo}
                          onChange={(e) => setCustomTo(e.target.value)}
                        />
                      </label>
                    </div>
                  )}
                  {historyError && (
                    <span className="fcba-range-error">{historyError}</span>
                  )}
                </div>

                <div className="fcba-chart-grid">
                  <MetricChart
                    title="Fuel Level (%)"
                    data={chartData}
                    accessor={(r) => r.fuelLevel ?? null}
                    color="#0891b2"
                    unit="%"
                    fixedScale={{ yMin: 0, yMax: 100 }}
                    defaultScaleMode="auto"
                  />
                  <MetricChart
                    title="Fuel Rate (L/h)"
                    data={chartData}
                    accessor={(r) => r.fuelRate ?? null}
                    color="#ea580c"
                    unit=" L/h"
                  />
                  <MetricChart
                    title="Total Fuel Consumption (L)"
                    data={chartData}
                    accessor={(r) => r.totalFuelConsum ?? null}
                    color="#7c3aed"
                    unit=" L"
                    stepMode
                  />
                </div>
              </div>

              <div className="fcba-grid">
                <StatCard
                  label="RPM Engine"
                  value={fmtInt(selected.hmEngine1)}
                  hint="engine speed"
                  color="#0891b2"
                />
                <StatCard
                  label="Vehicle Speed"
                  value={fmt(selected.vehicleSpeed, 1)}
                  hint="km/h"
                  color="#1d4ed8"
                />
                <StatCard
                  label="Total HM"
                  value={fmt(selected.totalHmEngine1, 1)}
                  hint="jam operasi"
                  color="#7c3aed"
                />
                <StatCard
                  label="Odometer"
                  value={fmt(selected.odometer, 0)}
                  hint="km"
                  color="#ea580c"
                />
                <StatCard
                  label="Coolant Temp"
                  value={fmt(selected.coolantTemperature, 1) + "°C"}
                  hint="suhu coolant"
                  color="#dc2626"
                />
                <StatCard
                  label="Oil Pressure"
                  value={fmt(selected.oilPressure, 1)}
                  hint="MPa"
                  color="#16a34a"
                />
                <StatCard
                  label="Fuel Temp"
                  value={fmt(selected.fuelTemperature, 1) + "°C"}
                  hint="suhu bahan bakar"
                  color="#d97706"
                />
                <StatCard
                  label="Fuel Pressure"
                  value={fmt(selected.fuelPressure, 1)}
                  hint="MPa"
                  color="#0891b2"
                />
                <StatCard
                  label="Payload"
                  value={fmt(selected.actualPayload, 1) + " t"}
                  hint="beban aktual"
                  color="#ea580c"
                />
                <StatCard
                  label="Battery"
                  value={fmt(selected.batteryVoltage, 1) + " V"}
                  hint="tegangan"
                  color="#16a34a"
                />
                <StatCard
                  label="Ambient Temp"
                  value={fmt(selected.ambientAirTemperature, 1) + "°C"}
                  hint="suhu ambien"
                  color="#7c3aed"
                />
                <StatCard
                  label="Load Count"
                  value={fmtInt(selected.loadCount)}
                  hint="jumlah muatan"
                  color="#1d4ed8"
                />
              </div>
            </>
          ) : (
            <div className="fcba-detail-empty">
              <p>Pilih unit HD di kiri untuk melihat detail</p>
            </div>
          )}
        </section>
      </main>

      <footer className="fcba-footer">
        <span>
          API: <code>{apiUrl}</code>
        </span>
        <span>
          HD aktif: <code>{kpiUnitCount}</code>
        </span>
        <span className="fcba-footer-time">
          {new Date().toLocaleTimeString("id-ID")}
        </span>
      </footer>
    </div>
  );
}

/**
 * Detail panel untuk unit yg gak ada live cache — cuma bisa lihat historical
 * chart via range picker. Compact version.
 */
interface StaleUnitDetailProps {
  cn: string;
  rangeMode: RangeMode;
  setRangeMode: (m: RangeMode) => void;
  customFrom: string;
  setCustomFrom: (v: string) => void;
  customTo: string;
  setCustomTo: (v: string) => void;
  chartData: FuelConsumptionBaPayload[];
  historyLoading: boolean;
  historyError: string | null;
}
function StaleUnitDetail({
  cn,
  rangeMode,
  setRangeMode,
  customFrom,
  setCustomFrom,
  customTo,
  setCustomTo,
  chartData,
  historyLoading,
  historyError,
}: StaleUnitDetailProps) {
  return (
    <>
      <div className="fcba-tbar">
        <div className="fcba-tbar-id">{cn}</div>
        <span className="fcba-tbar-stale">NO LIVE DATA</span>
        <div className="fcba-tbar-spacer" />
        <div className="fcba-tbar-time fcba-mono fcba-muted">
          pilih range historikal (1h / 6h / 24h / 7d / custom)
        </div>
      </div>

      <div className="fcba-chart-section">
        <div className="fcba-chart-head">
          <div className="fcba-chart-title">Trend Fuel · History</div>
          <div className="fcba-chart-meta">
            {historyLoading
              ? "loading…"
              : `${chartData.length} data point · WIB`}
          </div>
        </div>
        <div className="fcba-range-bar">
          <div className="fcba-range-pills">
            {(["live", "1h", "6h", "24h", "7d", "custom"] as RangeMode[]).map(
              (m) => (
                <button
                  key={m}
                  type="button"
                  className={`fcba-range-pill${
                    rangeMode === m ? " fcba-range-pill-active" : ""
                  }`}
                  onClick={() => setRangeMode(m)}
                >
                  {m === "live" ? "Live" : m}
                </button>
              ),
            )}
          </div>
          {rangeMode === "custom" && (
            <div className="fcba-range-custom">
              <label className="fcba-range-label">
                From
                <input
                  type="datetime-local"
                  className="fcba-range-input"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                />
              </label>
              <label className="fcba-range-label">
                To
                <input
                  type="datetime-local"
                  className="fcba-range-input"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                />
              </label>
            </div>
          )}
          {historyError && (
            <span className="fcba-range-error">{historyError}</span>
          )}
        </div>

        <div className="fcba-chart-grid">
          <MetricChart
            title="Fuel Level (%)"
            data={chartData}
            accessor={(r) => r.fuelLevel ?? null}
            color="#0891b2"
            unit="%"
            fixedScale={{ yMin: 0, yMax: 100 }}
            defaultScaleMode="auto"
          />
          <MetricChart
            title="Fuel Rate (L/h)"
            data={chartData}
            accessor={(r) => r.fuelRate ?? null}
            color="#ea580c"
            unit=" L/h"
          />
          <MetricChart
            title="Total Fuel Consumption (L)"
            data={chartData}
            accessor={(r) => r.totalFuelConsum ?? null}
            color="#7c3aed"
            unit=" L"
            stepMode
          />
        </div>
      </div>
    </>
  );
}

interface KpiTileProps {
  label: string;
  value: string;
  hint: string;
  color: string;
}
function KpiTile({ label, value, hint, color }: KpiTileProps) {
  return (
    <div
      className="fcba-kpi"
      style={{ "--kpi-color": color } as React.CSSProperties}
    >
      <div className="fcba-kpi-bar" />
      <div className="fcba-kpi-body">
        <div className="fcba-kpi-label">{label}</div>
        <div className="fcba-kpi-value">{value}</div>
        <div className="fcba-kpi-hint">{hint}</div>
      </div>
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: string;
  hint: string;
  color: string;
}
function StatCard({ label, value, hint, color }: StatCardProps) {
  return (
    <div
      className="fcba-stat"
      style={{ "--stat-color": color } as React.CSSProperties}
    >
      <div className="fcba-stat-label">{label}</div>
      <div className="fcba-stat-value">{value}</div>
      <div className="fcba-stat-hint">{hint}</div>
    </div>
  );
}

interface ScaleToggleProps {
  mode: "auto" | "fixed" | "custom";
  onChange: (m: "auto" | "fixed" | "custom") => void;
  customMin: string;
  customMax: string;
  onCustomMinChange: (v: string) => void;
  onCustomMaxChange: (v: string) => void;
}
function ScaleToggle({
  mode,
  onChange,
  customMin,
  customMax,
  onCustomMinChange,
  onCustomMaxChange,
}: ScaleToggleProps) {
  return (
    <div className="fcba-scale-wrap">
      <div className="fcba-scale-toggle">
        <button
          type="button"
          className={`fcba-scale-btn${
            mode === "auto" ? " fcba-scale-btn-active" : ""
          }`}
          onClick={() => onChange("auto")}
        >
          Auto
        </button>
        <button
          type="button"
          className={`fcba-scale-btn${
            mode === "fixed" ? " fcba-scale-btn-active" : ""
          }`}
          onClick={() => onChange("fixed")}
        >
          0–100
        </button>
        <button
          type="button"
          className={`fcba-scale-btn${
            mode === "custom" ? " fcba-scale-btn-active" : ""
          }`}
          onClick={() => onChange("custom")}
        >
          Custom
        </button>
      </div>
      {mode === "custom" && (
        <div className="fcba-scale-custom">
          <input
            type="number"
            className="fcba-scale-input"
            value={customMin}
            onChange={(e) => onCustomMinChange(e.target.value)}
            placeholder="min"
          />
          <span className="fcba-scale-sep">–</span>
          <input
            type="number"
            className="fcba-scale-input"
            value={customMax}
            onChange={(e) => onCustomMaxChange(e.target.value)}
            placeholder="max"
          />
        </div>
      )}
    </div>
  );
}

function FuelGauge({ value }: { value: number | null }) {
  const pct =
    value !== null && Number.isFinite(value)
      ? Math.max(0, Math.min(100, value))
      : 0;
  const color = fuelColor(value);
  return (
    <div className="fcba-gauge">
      <div className="fcba-gauge-value">
        <span className="fcba-gauge-number">{fmt(value, 1)}</span>
        <span className="fcba-gauge-unit">%</span>
      </div>
      <div className="fcba-gauge-track">
        <div
          className="fcba-gauge-fill"
          style={{ width: pct + "%", background: color }}
        />
      </div>
      <div className="fcba-gauge-scale">
        <span>0</span>
        <span>25</span>
        <span>50</span>
        <span>75</span>
        <span>100</span>
      </div>
    </div>
  );
}

/**
 * SVG line/step chart untuk metrik numerik. Skip null values gracefully.
 *
 * `fixedScale` (optional): kalau di-pass, render toggle "Auto | Fixed"
 * di header. Auto = min/max data + padding. Fixed = pakai `fixedScale`.
 */
interface MetricChartProps {
  title: string;
  data: FuelConsumptionBaPayload[];
  accessor: (r: FuelConsumptionBaPayload) => number | null;
  color: string;
  unit: string;
  yMin?: number;
  yMax?: number;
  stepMode?: boolean;
  fixedScale?: { yMin: number; yMax: number };
  defaultScaleMode?: "auto" | "fixed";
}
function MetricChart({
  title,
  data,
  accessor,
  color,
  unit,
  yMin: yMinOverride,
  yMax: yMaxOverride,
  stepMode,
  fixedScale,
  defaultScaleMode = "fixed",
}: MetricChartProps) {
  const [scaleMode, setScaleMode] = useState<"auto" | "fixed" | "custom">(
    defaultScaleMode,
  );
  const [customMin, setCustomMin] = useState<string>(
    fixedScale ? String(fixedScale.yMin) : "0",
  );
  const [customMax, setCustomMax] = useState<string>(
    fixedScale ? String(fixedScale.yMax) : "100",
  );
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  let effectiveYMin: number | undefined = yMinOverride;
  let effectiveYMax: number | undefined = yMaxOverride;
  if (fixedScale && scaleMode === "fixed") {
    effectiveYMin = fixedScale.yMin;
    effectiveYMax = fixedScale.yMax;
  } else if (fixedScale && scaleMode === "custom") {
    const parsedMin = parseFloat(customMin);
    const parsedMax = parseFloat(customMax);
    if (
      Number.isFinite(parsedMin) &&
      Number.isFinite(parsedMax) &&
      parsedMin < parsedMax
    ) {
      effectiveYMin = parsedMin;
      effectiveYMax = parsedMax;
    }
  }
  const points = useMemo(() => {
    // Data comes newest-first; reverse for oldest→newest chart axis
    const asc = [...data].reverse();
    return asc
      .map((r) => ({ t: parseWib(r.dateTime), v: accessor(r) }))
      .filter(
        (p): p is { t: number; v: number } =>
          Number.isFinite(p.t) && p.v !== null && Number.isFinite(p.v),
      );
  }, [data, accessor]);

  if (points.length < 2) {
    return (
      <div className="fcba-metric-chart">
        <div className="fcba-metric-head">
          <div className="fcba-metric-title">{title}</div>
          {fixedScale && (
            <ScaleToggle
              mode={scaleMode}
              onChange={setScaleMode}
              customMin={customMin}
              customMax={customMax}
              onCustomMinChange={setCustomMin}
              onCustomMaxChange={setCustomMax}
            />
          )}
        </div>
        <div className="fcba-chart-empty">
          Belum cukup data (butuh ≥2 point)
        </div>
      </div>
    );
  }

  const W = 1200;
  const H = 274;
  const PAD = { top: 16, right: 64, bottom: 44, left: 16 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const ts = points.map((p) => p.t);
  const vs = points.map((p) => p.v);
  const tMin = ts[0];
  const tMax = ts[ts.length - 1];
  const tRange = Math.max(1, tMax - tMin);
  const minV = effectiveYMin ?? Math.min(...vs);
  const maxV = effectiveYMax ?? Math.max(...vs);
  const range = maxV - minV || 1;
  const pad = range * 0.08;
  const yMin = effectiveYMin ?? minV - pad;
  const yMax = effectiveYMax ?? maxV + pad;
  const yRange = yMax - yMin || 1;

  const xScale = (t: number) => PAD.left + ((t - tMin) / tRange) * innerW;
  const yScale = (v: number) =>
    PAD.top + innerH - ((v - yMin) / yRange) * innerH;

  const path = points
    .map((p, i) => {
      const x = xScale(p.t);
      const y = yScale(p.v);
      if (i === 0) return `M ${x.toFixed(1)} ${y.toFixed(1)}`;
      if (stepMode) {
        const yPrev = yScale(points[i - 1].v);
        return `L ${x.toFixed(1)} ${yPrev.toFixed(1)} L ${x.toFixed(1)} ${y.toFixed(1)}`;
      }
      return `L ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");

  const yTicks = Array.from({ length: 5 }, (_, i) => yMin + (yRange * i) / 4);
  // X ticks: distribusi by TIME supaya gak clustering saat data padat di ujung
  const N = 6;
  const xTickTimes = Array.from(
    { length: N },
    (_, k) => tMin + (tRange * k) / (N - 1),
  );

  const latestPt = points[points.length - 1];

  return (
    <div className="fcba-metric-chart">
      <div className="fcba-metric-head">
        <div className="fcba-metric-title">{title}</div>
        {fixedScale && (
          <ScaleToggle
            mode={scaleMode}
            onChange={setScaleMode}
            customMin={customMin}
            customMax={customMax}
            onCustomMinChange={setCustomMin}
            onCustomMaxChange={setCustomMax}
          />
        )}
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        className="fcba-metric-svg"
      >
        {yTicks.map((t, i) => (
          <g key={`y-${i}`}>
            <line
              x1={PAD.left}
              x2={PAD.left + innerW}
              y1={yScale(t)}
              y2={yScale(t)}
              stroke="#e1e6ec"
              strokeDasharray="2 3"
            />
            <text
              x={PAD.left + innerW + 4}
              y={yScale(t) + 3}
              fontSize="9.5"
              fill="#64748b"
              fontFamily="monospace"
            >
              {t.toFixed(t > 100 ? 0 : 1)}
              {unit.trim()}
            </text>
          </g>
        ))}
        <line
          x1={PAD.left}
          x2={PAD.left + innerW}
          y1={PAD.top + innerH}
          y2={PAD.top + innerH}
          stroke="#c4ccd5"
        />
        {xTickTimes.map((t, k) => {
          // Shift +7h → WIB display (toISOString returns UTC by default)
          const wibIso = new Date(t + 7 * 60 * 60 * 1000).toISOString();
          const anchor =
            k === 0 ? "start" : k === xTickTimes.length - 1 ? "end" : "middle";
          const x = xScale(t);
          return (
            <text
              key={`x-${k}`}
              x={x}
              y={PAD.top + innerH + 14}
              textAnchor={anchor}
              fontSize="9.5"
              fill="#64748b"
              fontFamily="monospace"
            >
              <tspan x={x} dy="0">
                {wibIso.slice(5, 10)}
              </tspan>
              <tspan x={x} dy="12">
                {wibIso.slice(11, 19)}
              </tspan>
            </text>
          );
        })}
        <path d={path} fill="none" stroke={color} strokeWidth="1.6" />

        {/* Data dots (kecil di semua point, membesar saat hover) */}
        {points.map((p, i) => (
          <circle
            key={`d-${i}`}
            cx={xScale(p.t)}
            cy={yScale(p.v)}
            r={hoveredIdx === i ? 3.5 : 1.8}
            fill={color}
          />
        ))}

        <circle
          cx={xScale(latestPt.t)}
          cy={yScale(latestPt.v)}
          r="3.5"
          fill={color}
          stroke="#fff"
          strokeWidth="1"
        >
          <animate
            attributeName="r"
            values="3.5;5;3.5"
            dur="1.4s"
            repeatCount="indefinite"
          />
        </circle>

        {/* Hover hit-targets */}
        {points.map((p, i) => (
          <circle
            key={`hit-${i}`}
            cx={xScale(p.t)}
            cy={yScale(p.v)}
            r="9"
            fill="transparent"
            style={{ cursor: "crosshair" }}
            onMouseEnter={() => setHoveredIdx(i)}
            onMouseLeave={() => setHoveredIdx(null)}
          />
        ))}

        {/* Tooltip */}
        {hoveredIdx !== null &&
          (() => {
            const p = points[hoveredIdx];
            const cx = xScale(p.t);
            const cy = yScale(p.v);
            const wibIso = new Date(p.t + 7 * 60 * 60 * 1000).toISOString();
            const timeLine = wibIso.slice(0, 10) + " " + wibIso.slice(11, 19);
            const valueLine = `${p.v.toFixed(p.v > 100 ? 0 : 2)}${unit.trim()}`;
            const boxW = 172;
            const boxH = 40;
            let boxX = cx + 10;
            if (boxX + boxW > PAD.left + innerW) boxX = cx - boxW - 10;
            let boxY = cy - boxH - 8;
            if (boxY < PAD.top) boxY = cy + 10;
            return (
              <g pointerEvents="none">
                <rect
                  x={boxX}
                  y={boxY}
                  width={boxW}
                  height={boxH}
                  rx="4"
                  fill="#0f172a"
                  opacity="0.94"
                />
                <text
                  x={boxX + 8}
                  y={boxY + 15}
                  fontSize="10"
                  fill="#e2e8f0"
                  fontFamily="monospace"
                >
                  {timeLine}
                </text>
                <text
                  x={boxX + 8}
                  y={boxY + 30}
                  fontSize="11"
                  fill={color}
                  fontFamily="monospace"
                  fontWeight="600"
                >
                  {valueLine}
                </text>
              </g>
            );
          })()}
      </svg>
    </div>
  );
}
