import { useEffect, useMemo, useState } from "react";
import {
  useFlowMeterApi,
  type FlowMeterPayload,
} from "../hooks/useFlowMeterApi";
import "./flow-meter.css";

const COMPANY = "PT Putra Perkasa Abadi";

function fmt(n: number, digits = 2) {
  return new Intl.NumberFormat("id-ID", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n);
}

function fmtCompact(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toFixed(0);
}

interface FuelTransaction {
  startAt: string;
  endAt: string;
  startValue: number;
  endValue: number;
  increment: number;
  durationMs: number;
  isOngoing: boolean;
}

function parseWib(s: string): number {
  if (!s) return NaN;
  const cleaned = s.includes("T") ? s : s.replace(" ", "T");
  const hasTz = /[Zz]|[+-]\d{2}:?\d{2}$/.test(cleaned);
  const candidate = hasTz ? cleaned : cleaned + "+07:00";
  return new Date(candidate).getTime();
}

function fmtDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}j ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/**
 * Deteksi sesi pengisian fuel dari history totalizer (oldest-first).
 * Totalizer monotonik naik. Sesi tutup ketika idle ≥ idleMinutes.
 * Sesi terakhir kalau belum idle threshold → flag `isOngoing`.
 */
function detectSessions(
  history: FlowMeterPayload[],
  idleMinutes = 10,
): FuelTransaction[] {
  if (history.length === 0) return [];
  const IDLE_MS = idleMinutes * 60 * 1000;
  const sessions: FuelTransaction[] = [];

  type Active = {
    startAt: string;
    startValue: number;
    endAt: string;
    endValue: number;
    lastIncreaseAt: string;
  };
  let s: Active | null = null;

  for (const row of history) {
    if (!s) {
      s = {
        startAt: row.datetime,
        startValue: row.totalisator,
        endAt: row.datetime,
        endValue: row.totalisator,
        lastIncreaseAt: row.datetime,
      };
      continue;
    }
    if (row.totalisator > s.endValue) {
      s.endAt = row.datetime;
      s.endValue = row.totalisator;
      s.lastIncreaseAt = row.datetime;
    } else {
      const idleDur = parseWib(row.datetime) - parseWib(s.lastIncreaseAt);
      if (Number.isFinite(idleDur) && idleDur >= IDLE_MS) {
        if (s.endValue > s.startValue) {
          sessions.push({
            startAt: s.startAt,
            endAt: s.endAt,
            startValue: s.startValue,
            endValue: s.endValue,
            increment: s.endValue - s.startValue,
            durationMs: parseWib(s.endAt) - parseWib(s.startAt),
            isOngoing: false,
          });
        }
        s = {
          startAt: row.datetime,
          startValue: row.totalisator,
          endAt: row.datetime,
          endValue: row.totalisator,
          lastIncreaseAt: row.datetime,
        };
      }
    }
  }

  if (s && s.endValue > s.startValue) {
    const lastRow = history[history.length - 1];
    const sinceLastIncrease =
      parseWib(lastRow.datetime) - parseWib(s.lastIncreaseAt);
    const idle =
      Number.isFinite(sinceLastIncrease) && sinceLastIncrease >= IDLE_MS;
    sessions.push({
      startAt: s.startAt,
      endAt: s.endAt,
      startValue: s.startValue,
      endValue: s.endValue,
      increment: s.endValue - s.startValue,
      durationMs: parseWib(s.endAt) - parseWib(s.startAt),
      isOngoing: !idle,
    });
  }

  return sessions.reverse(); // newest-first untuk display
}

type RangeMode = "live" | "1h" | "6h" | "24h" | "7d" | "custom";
const PRESET_HOURS: Record<Exclude<RangeMode, "live" | "custom">, number> = {
  "1h": 1,
  "6h": 6,
  "24h": 24,
  "7d": 24 * 7,
};

/**
 * Format Date → "yyyy-MM-ddTHH:mm" (WIB) buat <input type="datetime-local">.
 */
function toLocalInput(d: Date): string {
  const wib = new Date(d.getTime() + 7 * 60 * 60 * 1000);
  return wib.toISOString().slice(0, 16);
}

export default function FlowMeterPage() {
  const { status, messages: apiMessages, apiUrl } = useFlowMeterApi();

  const allMessages = apiMessages;

  const messagesByFm = useMemo(() => {
    const map = new Map<string, FlowMeterPayload[]>();
    for (const msg of allMessages) {
      const list = map.get(msg.fm_id) ?? [];
      map.set(msg.fm_id, [msg, ...list].slice(0, 100));
    }
    return map;
  }, [allMessages]);

  const fmIds = useMemo(
    () => Array.from(messagesByFm.keys()).sort(),
    [messagesByFm],
  );

  const [selectedFmId, setSelectedFmId] = useState<string | null>(null);
  useEffect(() => {
    if (fmIds.length === 0) {
      if (selectedFmId) setSelectedFmId(null);
      return;
    }
    if (!selectedFmId || !messagesByFm.has(selectedFmId)) {
      setSelectedFmId(fmIds[0]);
    }
  }, [fmIds, selectedFmId, messagesByFm]);

  // ── Range filter state ───────────────────────────────────────────
  const [rangeMode, setRangeMode] = useState<RangeMode>("live");
  const [customFrom, setCustomFrom] = useState<string>(() =>
    toLocalInput(new Date(Date.now() - 24 * 60 * 60 * 1000)),
  );
  const [customTo, setCustomTo] = useState<string>(() =>
    toLocalInput(new Date()),
  );
  const [historyData, setHistoryData] = useState<FlowMeterPayload[] | null>(
    null,
  );
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  useEffect(() => {
    if (rangeMode === "live") {
      setHistoryData(null);
      setHistoryError(null);
      return;
    }
    if (!selectedFmId || !apiUrl) return;

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
      fmId: selectedFmId,
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
      limit: "5000",
    });
    setHistoryLoading(true);
    setHistoryError(null);
    fetch(`${apiUrl}/iot/flow-meter/history?${params.toString()}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.statusText)))
      .then((body: { data: FlowMeterPayload[] }) => {
        setHistoryData(Array.isArray(body.data) ? body.data : []);
      })
      .catch((err) => {
        if (err?.name === "AbortError") return;
        console.warn("[api] history fetch failed:", err);
        setHistoryError(String(err));
        setHistoryData([]);
      })
      .finally(() => setHistoryLoading(false));

    return () => controller.abort();
  }, [rangeMode, selectedFmId, customFrom, customTo, apiUrl]);

  const liveMsgs = selectedFmId ? (messagesByFm.get(selectedFmId) ?? []) : [];
  const selectedMsgs =
    rangeMode === "live" ? liveMsgs : (historyData ?? []);
  const selectedLatest = liveMsgs[0] ?? selectedMsgs[0] ?? null;

  const selectedSessions = useMemo(() => {
    const asc = [...selectedMsgs].sort(
      (a, b) => parseWib(a.datetime) - parseWib(b.datetime),
    );
    return detectSessions(asc, 10);
  }, [selectedMsgs]);

  const totalTotalisator = useMemo(() => {
    let sum = 0;
    for (const fmId of fmIds) {
      const latest = messagesByFm.get(fmId)?.[0];
      if (latest) sum += latest.totalisator;
    }
    return sum;
  }, [fmIds, messagesByFm]);

  const totalLastIncrement = useMemo(() => {
    let sum = 0;
    for (const fmId of fmIds) {
      const msgs = messagesByFm.get(fmId) ?? [];
      if (msgs.length === 0) continue;
      const asc = [...msgs].sort(
        (a, b) => parseWib(a.datetime) - parseWib(b.datetime),
      );
      const sessions = detectSessions(asc, 10);
      if (sessions[0]) sum += sessions[0].increment;
    }
    return sum;
  }, [fmIds, messagesByFm]);

  const lastReceived = useMemo(() => {
    let latest: string | null = null;
    for (const msg of allMessages) {
      const ts = msg.received_at ?? msg.datetime;
      if (!ts) continue;
      if (!latest || ts > latest) latest = ts;
    }
    return latest;
  }, [allMessages]);

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
    <div className="fm-dashboard">
      {/* Header */}
      <header className="fm-header">
        <div className="fm-header-left">
          <div className="fm-header-logo">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#1a56db"
              strokeWidth="2"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M3 9h18M9 21V9" />
            </svg>
          </div>
          <div>
            <h1 className="fm-header-title">Flow Meter Monitor</h1>
            <p className="fm-header-sub">{COMPANY} · SPT Dashboard</p>
          </div>
        </div>
        <div className="fm-header-right">
          <div
            className="fm-status-pill"
            style={{ "--status-color": statusColor } as React.CSSProperties}
          >
            <span className="fm-status-dot" />
            <span>{statusLabel}</span>
          </div>
        </div>
      </header>

      {/* KPI tiles */}
      <section className="fm-kpi-row">
        <KpiTile
          label="FM Aktif"
          value={String(fmIds.length)}
          hint="unit terdaftar"
          color="#0891b2"
        />
        <KpiTile
          label="Total Totalisator"
          value={fmt(totalTotalisator, 0)}
          hint="liter (akumulasi terbaru)"
          color="#ea580c"
        />
        <KpiTile
          label="Kenaikan Terakhir"
          value={"+" + fmt(totalLastIncrement, 2) + " L"}
          hint="sesi pengisian terbaru"
          color="#7c3aed"
        />
        <KpiTile
          label="Last Received"
          value={lastReceived?.slice(11, 19) ?? "—"}
          hint={lastReceived?.slice(0, 10) ?? "no data"}
          color="#16a34a"
        />
      </section>

      {/* Main body: FM list + detail */}
      <main className="fm-main">
        {/* Left: FM selector list */}
        <aside className="fm-list-panel">
          <div className="fm-panel-title">FM Units</div>
          <div className="fm-list">
            {fmIds.length === 0 ? (
              <div className="fm-list-empty">Belum ada data</div>
            ) : (
              fmIds.map((id) => {
                const m = messagesByFm.get(id)?.[0];
                const isActive = selectedFmId === id;
                return (
                  <button
                    key={id}
                    className={`fm-list-item${isActive ? " fm-list-item-active" : ""}`}
                    onClick={() => setSelectedFmId(id)}
                  >
                    <div className="fm-list-id">
                      <span className="fm-list-led" />
                      {id}
                    </div>
                    <div className="fm-list-meta">
                      <span className="fm-mono">{m?.slocn ?? "—"}</span>
                      <span className="fm-list-tota">
                        {m ? fmtCompact(m.totalisator) + " L" : "—"}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* Right: detail panel */}
        <section className="fm-detail-panel">
          {selectedLatest ? (
            <>
              {/* Compact title bar */}
              <div className="fm-tbar">
                <div className="fm-tbar-id">{selectedLatest.fm_id}</div>
                <div className="fm-tbar-meta">
                  <span>{selectedLatest.company}</span>
                  <span className="fm-tbar-sep">·</span>
                  <span className="fm-mono">{selectedLatest.plant_id}</span>
                  <span className="fm-tbar-sep">/</span>
                  <span className="fm-mono">{selectedLatest.slocn}</span>
                </div>
                <div className="fm-tbar-spacer" />
                <div className="fm-tbar-time fm-mono">
                  {selectedLatest.datetime}{" "}
                  <span className="fm-muted">WIB</span>
                </div>
              </div>

              {/* Hero stats row: totalisator + kenaikan terakhir side-by-side */}
              <div className="fm-hero-row">
                <div className="fm-hero-cell">
                  <div className="fm-hero-label">TOTALISATOR (LIVE)</div>
                  <div className="fm-hero-value">
                    <span className="fm-hero-number">
                      {fmt(selectedLatest.totalisator)}
                    </span>
                    <span className="fm-hero-unit">L</span>
                  </div>
                </div>
                <div className="fm-hero-divider" />
                <div className="fm-hero-cell fm-hero-cell-secondary">
                  <div className="fm-hero-label">KENAIKAN TERAKHIR</div>
                  <div className="fm-hero-value">
                    <span className="fm-hero-number fm-hero-increment">
                      {selectedSessions[0]
                        ? "+" + fmt(selectedSessions[0].increment)
                        : "—"}
                    </span>
                    <span className="fm-hero-unit">L</span>
                  </div>
                  <div className="fm-hero-sub fm-mono">
                    {selectedSessions[0]
                      ? `${selectedSessions[0].startAt.slice(11, 16)}–${selectedSessions[0].endAt.slice(11, 16)} (${fmtDuration(selectedSessions[0].durationMs)})`
                      : "no fueling session yet"}
                  </div>
                </div>
              </div>

              {/* Step chart full width */}
              <div className="fm-chart-section">
                <div className="fm-chart-head">
                  <div className="fm-chart-title">Trend Totalizer · Step</div>
                  <div className="fm-chart-meta">
                    {historyLoading
                      ? "loading…"
                      : `${selectedMsgs.length} data point · WIB`}
                  </div>
                </div>
                <div className="fm-range-bar">
                  <div className="fm-range-pills">
                    {(
                      ["live", "1h", "6h", "24h", "7d", "custom"] as RangeMode[]
                    ).map((m) => (
                      <button
                        key={m}
                        type="button"
                        className={`fm-range-pill${
                          rangeMode === m ? " fm-range-pill-active" : ""
                        }`}
                        onClick={() => setRangeMode(m)}
                      >
                        {m === "live" ? "Live" : m}
                      </button>
                    ))}
                  </div>
                  {rangeMode === "custom" && (
                    <div className="fm-range-custom">
                      <label className="fm-range-label">
                        From
                        <input
                          type="datetime-local"
                          className="fm-range-input"
                          value={customFrom}
                          onChange={(e) => setCustomFrom(e.target.value)}
                        />
                      </label>
                      <label className="fm-range-label">
                        To
                        <input
                          type="datetime-local"
                          className="fm-range-input"
                          value={customTo}
                          onChange={(e) => setCustomTo(e.target.value)}
                        />
                      </label>
                    </div>
                  )}
                  {historyError && (
                    <span className="fm-range-error">{historyError}</span>
                  )}
                </div>
                <FmStepChart history={selectedMsgs} />
              </div>

              {/* Fuel Transactions table */}
              <div className="fm-tx-section">
                <div className="fm-tx-head">
                  <div className="fm-tx-title">Fuel Transactions</div>
                  <div className="fm-tx-meta">
                    {selectedSessions.length} sesi · idle ≥ 10m = tutup sesi
                  </div>
                </div>
                {selectedSessions.length === 0 ? (
                  <div className="fm-tx-empty">
                    Belum ada sesi pengisian terdeteksi. Tunggu totalizer naik.
                  </div>
                ) : (
                  <div className="fm-tx-table-wrap">
                    <table className="fm-tx-table">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Mulai (WIB)</th>
                          <th>Selesai (WIB)</th>
                          <th className="fm-num">Durasi</th>
                          <th className="fm-num">Start (L)</th>
                          <th className="fm-num">End (L)</th>
                          <th className="fm-num">Kenaikan</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedSessions.map((tx, i) => (
                          <tr
                            key={`${tx.startAt}-${i}`}
                            className={tx.isOngoing ? "fm-tx-ongoing" : ""}
                          >
                            <td className="fm-num fm-mono">
                              {i + 1}
                              {tx.isOngoing && (
                                <span className="fm-tx-pulse" title="ongoing" />
                              )}
                            </td>
                            <td className="fm-mono">{tx.startAt}</td>
                            <td className="fm-mono">{tx.endAt}</td>
                            <td className="fm-num fm-mono">
                              {fmtDuration(tx.durationMs)}
                            </td>
                            <td className="fm-num fm-mono">
                              {fmt(tx.startValue)}
                            </td>
                            <td className="fm-num fm-mono">
                              {fmt(tx.endValue)}
                            </td>
                            <td className="fm-num fm-mono fm-tx-increment">
                              +{fmt(tx.increment)} L
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="fm-detail-empty">
              <p>Pilih unit FM di kiri untuk melihat detail</p>
            </div>
          )}
        </section>
      </main>

      <footer className="fm-footer">
        <span>
          API: <code>{apiUrl}</code>
        </span>
        <span>
          FM aktif: <code>{fmIds.length}</code>
        </span>
        {/* <span>Total pesan: <code>{allMessages.length}</code></span> */}
        <span className="fm-footer-time">
          {new Date().toLocaleTimeString("id-ID")}
        </span>
      </footer>
    </div>
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
      className="fm-kpi"
      style={{ "--kpi-color": color } as React.CSSProperties}
    >
      <div className="fm-kpi-bar" />
      <div className="fm-kpi-body">
        <div className="fm-kpi-label">{label}</div>
        <div className="fm-kpi-value">{value}</div>
        <div className="fm-kpi-hint">{hint}</div>
      </div>
    </div>
  );
}

/**
 * Step chart totalizer: garis horizontal saat idle, naik vertikal saat pengisian.
 * Cocok buat data monotonik kayak totalizer fuel meter.
 */
function FmStepChart({ history: raw }: { history: FlowMeterPayload[] }) {
  // Force oldest-first by datetime
  const history = [...raw].sort(
    (a, b) => parseWib(a.datetime) - parseWib(b.datetime),
  );

  if (history.length < 2) {
    return (
      <div className="fm-chart-empty">
        <svg
          width="36"
          height="36"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#9ca3af"
          strokeWidth="1.5"
        >
          <polyline points="3 17 9 11 13 15 21 7" />
        </svg>
        <p>Belum cukup data untuk chart (butuh ≥2 point)</p>
      </div>
    );
  }

  const W = 720;
  const H = 220;
  const PAD = { top: 16, right: 56, bottom: 36, left: 12 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const ts = history.map((h) => parseWib(h.datetime));
  const values = history.map((h) => h.totalisator);
  const tMin = ts[0];
  const tMax = ts[ts.length - 1];
  const tRange = Math.max(1, tMax - tMin);
  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const range = maxV - minV || 1;
  const pad = range * 0.08;
  const yMin = Math.max(0, minV - pad);
  const yMax = maxV + pad;
  const yRange = yMax - yMin || 1;

  const xScale = (t: number) => PAD.left + ((t - tMin) / tRange) * innerW;
  const yScale = (v: number) =>
    PAD.top + innerH - ((v - yMin) / yRange) * innerH;

  // Step path: horizontal dulu (hold value), baru vertical naik (step) tiap point
  const stepPath = history
    .map((h, i) => {
      const x = xScale(ts[i]);
      const y = yScale(h.totalisator);
      if (i === 0) return `M ${x.toFixed(1)} ${y.toFixed(1)}`;
      const yPrev = yScale(history[i - 1].totalisator);
      return `L ${x.toFixed(1)} ${yPrev.toFixed(1)} L ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");

  // Y ticks
  const yTicks = Array.from({ length: 5 }, (_, i) => yMin + (yRange * i) / 4);
  // X ticks: 5 evenly distributed from data points
  const N = Math.min(5, history.length);
  const xTickIdx = Array.from({ length: N }, (_, k) =>
    Math.round((k * (history.length - 1)) / (N - 1)),
  );

  return (
    <div className="fm-chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="fm-chart-svg">
        {/* Y grid + labels */}
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
              {fmtCompact(t)}
            </text>
          </g>
        ))}

        {/* X baseline */}
        <line
          x1={PAD.left}
          x2={PAD.left + innerW}
          y1={PAD.top + innerH}
          y2={PAD.top + innerH}
          stroke="#c4ccd5"
        />

        {/* X labels (HH:MM) */}
        {xTickIdx.map((idx) => (
          <text
            key={`x-${idx}`}
            x={xScale(ts[idx])}
            y={PAD.top + innerH + 14}
            textAnchor="middle"
            fontSize="9.5"
            fill="#64748b"
            fontFamily="monospace"
          >
            {history[idx].datetime?.slice(11, 16) ?? ""}
          </text>
        ))}

        {/* Step path */}
        <path d={stepPath} fill="none" stroke="#0891b2" strokeWidth="1.6" />

        {/* Dots di tiap data point */}
        {history.map((h, i) => (
          <circle
            key={`d-${i}`}
            cx={xScale(ts[i])}
            cy={yScale(h.totalisator)}
            r="2"
            fill="#0891b2"
          />
        ))}

        {/* Latest marker */}
        <circle
          cx={xScale(ts[ts.length - 1])}
          cy={yScale(values[values.length - 1])}
          r="4"
          fill="#ea580c"
          stroke="#c2410c"
          strokeWidth="1"
        >
          <animate
            attributeName="r"
            values="4;5.5;4"
            dur="1.4s"
            repeatCount="indefinite"
          />
        </circle>
      </svg>
    </div>
  );
}
