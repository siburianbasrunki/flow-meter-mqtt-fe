import { useCallback, useEffect, useMemo, useState } from "react";
import type { FlowMeterPayload } from "../hooks/useFlowMeterApi";
import "./history.css";

const COMPANY = "PT Putra Perkasa Abadi";

function normalizeBaseUrl(raw: string): string {
  const trimmed = raw.replace(/\/$/, "").trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

const API_URL = normalizeBaseUrl(
  (import.meta as unknown as { env: Record<string, string> }).env
    ?.VITE_FLOW_METER_API_URL ?? "http://localhost:3020",
);

type RangeMode = "live" | "1h" | "6h" | "24h" | "7d" | "custom";
const PRESET_HOURS: Record<Exclude<RangeMode, "live" | "custom">, number> = {
  "1h": 1,
  "6h": 6,
  "24h": 24,
  "7d": 24 * 7,
};

const WINDOW_PRESETS = [10, 20, 30, 60, 120, 300, 600];

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

function parseWibMs(s: string | undefined | null): number {
  if (!s) return NaN;
  const cleaned = s.includes("T") ? s : s.replace(" ", "T");
  const hasTz = /[Zz]|[+-]\d{2}:?\d{2}$/.test(cleaned);
  const candidate = hasTz ? cleaned : cleaned + "+07:00";
  return new Date(candidate).getTime();
}

function fmtWib(tsMs: number): string {
  const d = new Date(tsMs + 7 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 19).replace("T", " ");
}

interface AggBucket {
  bucketKey: number;
  startAt: string;
  endAt: string;
  startTotal: number;
  endTotal: number;
  delta: number;
  rowCount: number;
  avgFlowRate: number | null;
  fmId: string;
  slocn: string;
  plantId: string;
}

export default function HistoryAggregatedPage() {
  const [fmIds, setFmIds] = useState<string[]>([]);
  const [selectedFmId, setSelectedFmId] = useState<string>("");
  const [rangeMode, setRangeMode] = useState<RangeMode>("24h");
  const [customFrom, setCustomFrom] = useState<string>(() =>
    toLocalInput(new Date(Date.now() - 24 * 60 * 60 * 1000)),
  );
  const [customTo, setCustomTo] = useState<string>(() =>
    toLocalInput(new Date()),
  );
  const [hourFrom, setHourFrom] = useState<string>("");
  const [hourTo, setHourTo] = useState<string>("");
  const [windowSec, setWindowSec] = useState<number>(10);
  const [rows, setRows] = useState<FlowMeterPayload[]>([]);
  const [source, setSource] = useState<"db" | "cache" | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    fetch(`${API_URL}/iot/flow-meter/latest`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.statusText)))
      .then(
        (body: { data: { slocn?: string | null; fm_id?: string }[] }) => {
          const list = Array.isArray(body.data)
            ? body.data
                .map((r) => r.slocn ?? r.fm_id ?? "")
                .filter((s) => s.length > 0)
            : [];
          const unique = Array.from(new Set(list)).sort();
          setFmIds(unique);
          setSelectedFmId((prev) => prev || unique[0] || "");
        },
      )
      .catch((err) => console.warn("[history-agg] latest fetch failed:", err));
  }, []);

  useEffect(() => {
    if (!selectedFmId) return;

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
      slocn: selectedFmId,
      limit: "10000",
    });
    if (fromDate && toDate) {
      params.set("from", fromDate.toISOString());
      params.set("to", toDate.toISOString());
    }

    setLoading(true);
    setError(null);
    fetch(`${API_URL}/iot/flow-meter/history?${params.toString()}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.statusText)))
      .then(
        (body: {
          data: FlowMeterPayload[];
          source?: "db" | "cache";
        }) => {
          setRows(Array.isArray(body.data) ? body.data : []);
          setSource(body.source ?? null);
        },
      )
      .catch((err) => {
        if (err?.name === "AbortError") return;
        console.warn("[history-agg] fetch failed:", err);
        setError(String(err));
        setRows([]);
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [selectedFmId, rangeMode, customFrom, customTo, refreshTick]);

  // Filter jam-of-day (HH:MM) — sama seperti HistoryPage
  const hourFilteredRows = useMemo(() => {
    if (!hourFrom && !hourTo) return rows;
    const parseHm = (s: string): number | null => {
      const m = /^(\d{2}):(\d{2})$/.exec(s.trim());
      if (!m) return null;
      const h = Number(m[1]);
      const min = Number(m[2]);
      if (h > 23 || min > 59) return null;
      return h * 60 + min;
    };
    const fromMin = hourFrom ? parseHm(hourFrom) : 0;
    const toMin = hourTo ? parseHm(hourTo) : 24 * 60 - 1;
    if (fromMin === null || toMin === null) return rows;
    return rows.filter((r) => {
      const dt = r.datetime ?? "";
      const hm = dt.slice(11, 16);
      const cur = parseHm(hm);
      if (cur === null) return false;
      if (fromMin <= toMin) return cur >= fromMin && cur <= toMin;
      return cur >= fromMin || cur <= toMin;
    });
  }, [rows, hourFrom, hourTo]);

  // Aggregate ke bucket per windowSec.
  // Input rows newest-first → kelompokkan by Math.floor(ts / (windowSec*1000)).
  // Untuk tiap bucket: startAt = oldest row, endAt = newest row.
  // Sisi output diurut newest-first (bucket paling baru di atas).
  const bucketRows = useMemo<AggBucket[]>(() => {
    if (windowSec <= 0 || hourFilteredRows.length === 0) return [];
    const winMs = windowSec * 1000;
    const buckets = new Map<number, FlowMeterPayload[]>();
    for (const r of hourFilteredRows) {
      const ts = parseWibMs(r.datetime);
      if (!Number.isFinite(ts)) continue;
      const key = Math.floor(ts / winMs);
      const arr = buckets.get(key);
      if (arr) arr.push(r);
      else buckets.set(key, [r]);
    }
    const keys = Array.from(buckets.keys()).sort((a, b) => b - a);
    return keys.map((key) => {
      const group = buckets.get(key)!;
      // Group ordering: input newest-first; sort asc for start/end determinism
      const asc = [...group].sort(
        (a, b) => parseWibMs(a.datetime) - parseWibMs(b.datetime),
      );
      const first = asc[0];
      const last = asc[asc.length - 1];
      const flowRates = asc
        .map((r) => r.flow_rate)
        .filter(
          (v): v is number => typeof v === "number" && Number.isFinite(v),
        );
      const avgFlow =
        flowRates.length > 0
          ? flowRates.reduce((s, v) => s + v, 0) / flowRates.length
          : null;
      return {
        bucketKey: key,
        startAt: first.datetime ?? "",
        endAt: last.datetime ?? "",
        startTotal: first.totalisator,
        endTotal: last.totalisator,
        delta: last.totalisator - first.totalisator,
        rowCount: asc.length,
        avgFlowRate: avgFlow,
        fmId: last.fm_id,
        slocn: last.slocn ?? "",
        plantId: last.plant_id ?? "",
      };
    });
  }, [hourFilteredRows, windowSec]);

  const summary = useMemo(() => {
    if (bucketRows.length === 0) return null;
    const newest = bucketRows[0];
    const oldest = bucketRows[bucketRows.length - 1];
    const totalDelta = newest.endTotal - oldest.startTotal;
    return {
      buckets: bucketRows.length,
      startAt: oldest.startAt,
      endAt: newest.endAt,
      startTotal: oldest.startTotal,
      endTotal: newest.endTotal,
      totalDelta,
      rawRows: hourFilteredRows.length,
    };
  }, [bucketRows, hourFilteredRows.length]);

  const handleExportCsv = useCallback(() => {
    if (bucketRows.length === 0) return;
    const header = [
      "no",
      "bucket_start_wib",
      "bucket_end_wib",
      "window_seconds",
      "fm_id",
      "slocn",
      "plant_id",
      "row_count",
      "start_totalisator",
      "end_totalisator",
      "kenaikan",
      "avg_flow_rate",
    ];
    const lines = [header.join(",")];
    bucketRows.forEach((b, i) => {
      lines.push(
        [
          i + 1,
          b.startAt,
          b.endAt,
          windowSec,
          b.fmId,
          b.slocn,
          b.plantId,
          b.rowCount,
          b.startTotal,
          b.endTotal,
          b.delta,
          b.avgFlowRate ?? "",
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
    a.download = `flow-meter-agg-${selectedFmId}-${windowSec}s-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [bucketRows, selectedFmId, windowSec]);

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
            >
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
              <circle cx="18" cy="18" r="3" fill="#1a56db" />
            </svg>
          </div>
          <div>
            <h1 className="hist-header-title">History FM · Aggregated</h1>
            <p className="hist-header-sub">
              {COMPANY} · SPT Dashboard · 1 row = agregat per {windowSec}s
            </p>
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
            <span className="hist-field-label">FM</span>
            <select
              className="hist-select"
              value={selectedFmId}
              onChange={(e) => setSelectedFmId(e.target.value)}
            >
              {fmIds.length === 0 && <option value="">(no FM units)</option>}
              {fmIds.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </label>

          <div className="hist-field">
            <span className="hist-field-label">Range</span>
            <div className="hist-pills">
              {(["live", "1h", "6h", "24h", "7d", "custom"] as RangeMode[]).map(
                (m) => (
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
                ),
              )}
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

          <div className="hist-custom">
            <label className="hist-field">
              <span className="hist-field-label">Jam Dari</span>
              <input
                type="time"
                className="hist-input"
                value={hourFrom}
                onChange={(e) => setHourFrom(e.target.value)}
              />
            </label>
            <label className="hist-field">
              <span className="hist-field-label">Jam Sampai</span>
              <input
                type="time"
                className="hist-input"
                value={hourTo}
                onChange={(e) => setHourTo(e.target.value)}
              />
            </label>
            {(hourFrom || hourTo) && (
              <button
                type="button"
                className="hist-btn"
                onClick={() => {
                  setHourFrom("");
                  setHourTo("");
                }}
              >
                Clear Jam
              </button>
            )}
          </div>

          <div className="hist-custom">
            <label className="hist-field">
              <span className="hist-field-label">Window (detik)</span>
              <div className="hist-pills">
                {WINDOW_PRESETS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={`hist-pill${
                      windowSec === s ? " hist-pill-active" : ""
                    }`}
                    onClick={() => setWindowSec(s)}
                  >
                    {s < 60 ? `${s}s` : `${s / 60}m`}
                  </button>
                ))}
              </div>
            </label>
            <label className="hist-field">
              <span className="hist-field-label">Custom</span>
              <input
                type="number"
                min={1}
                step={1}
                className="hist-input"
                style={{ width: 90 }}
                value={windowSec}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (Number.isFinite(v) && v >= 1) setWindowSec(Math.floor(v));
                }}
              />
            </label>
          </div>

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
              disabled={bucketRows.length === 0}
            >
              Export CSV
            </button>
          </div>
        </div>

        {error && <div className="hist-error">{error}</div>}
      </section>

      {summary && (
        <section className="hist-summary">
          <div className="hist-summary-item">
            <div className="hist-summary-label">Total Kenaikan</div>
            <div
              className={`hist-summary-value hist-summary-delta${
                summary.totalDelta > 0 ? " hist-delta-pos" : ""
              }`}
            >
              {(summary.totalDelta > 0 ? "+" : "") +
                fmt(summary.totalDelta) +
                " L"}
            </div>
          </div>
          <div className="hist-summary-item">
            <div className="hist-summary-label">Start (L)</div>
            <div className="hist-summary-value">
              {fmt(summary.startTotal)} L
            </div>
            <div className="hist-summary-sub">{summary.startAt}</div>
          </div>
          <div className="hist-summary-item">
            <div className="hist-summary-label">End (L)</div>
            <div className="hist-summary-value">
              {fmt(summary.endTotal)} L
            </div>
            <div className="hist-summary-sub">{summary.endAt}</div>
          </div>
          <div className="hist-summary-item">
            <div className="hist-summary-label">Buckets / Raw Rows</div>
            <div className="hist-summary-value">
              {summary.buckets} / {summary.rawRows}
            </div>
            <div className="hist-summary-sub">Window {windowSec}s</div>
          </div>
        </section>
      )}

      <main className="hist-main">
        <div className="hist-table-wrap">
          <table className="hist-table">
            <thead>
              <tr>
                <th className="hist-num">#</th>
                <th>Bucket Start (WIB)</th>
                <th>Bucket End (WIB)</th>
                <th className="hist-num">Rows</th>
                <th>FM ID</th>
                <th>Sloc</th>
                <th className="hist-num">Start (L)</th>
                <th className="hist-num">End (L)</th>
                <th className="hist-num">Kenaikan (L)</th>
                <th className="hist-num">Avg Flow Rate</th>
              </tr>
            </thead>
            <tbody>
              {bucketRows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="hist-empty">
                    {loading
                      ? "Loading…"
                      : "Belum ada data untuk range ini"}
                  </td>
                </tr>
              ) : (
                bucketRows.map((b, i) => (
                  <tr key={`${b.fmId}-${b.bucketKey}`}>
                    <td className="hist-num hist-mono">{i + 1}</td>
                    <td className="hist-mono">
                      {b.startAt || fmtWib(b.bucketKey * windowSec * 1000)}
                    </td>
                    <td className="hist-mono">{b.endAt}</td>
                    <td className="hist-num hist-mono">{b.rowCount}</td>
                    <td className="hist-mono">{b.fmId}</td>
                    <td className="hist-mono">{b.slocn || "—"}</td>
                    <td className="hist-num hist-mono">
                      {fmt(b.startTotal)}
                    </td>
                    <td className="hist-num hist-mono">{fmt(b.endTotal)}</td>
                    <td
                      className={`hist-num hist-mono${
                        b.delta > 0 ? " hist-delta-pos" : ""
                      }`}
                    >
                      {(b.delta > 0 ? "+" : "") + fmt(b.delta)}
                    </td>
                    <td className="hist-num hist-mono">
                      {b.avgFlowRate === null ? "—" : fmt(b.avgFlowRate)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </main>

      <footer className="hist-footer">
        <span>
          Buckets: <code>{bucketRows.length}</code> · Raw:{" "}
          <code>{hourFilteredRows.length}</code>
          {rows.length !== hourFilteredRows.length && (
            <> / {rows.length} (jam filter aktif)</>
          )}
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
