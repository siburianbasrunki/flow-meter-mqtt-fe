import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  Fs02Health,
  Fs02Kind,
  Fs02Transaction,
} from "../hooks/useFs02Api";
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

function fmt(n: number | null | undefined, digits = 2) {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("id-ID", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n);
}

function fmtWib(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const wib = new Date(d.getTime() + 7 * 3600 * 1000);
  return wib.toISOString().slice(0, 19).replace("T", " ");
}

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export default function HistoryFs02Page() {
  const [kind, setKind] = useState<Fs02Kind>("prod");
  const [rows, setRows] = useState<(Fs02Transaction | Fs02Health)[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [hourFrom, setHourFrom] = useState<string>("");
  const [hourTo, setHourTo] = useState<string>("");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetch(
      `${API_URL}/iot/fs02/history?kind=${encodeURIComponent(kind)}&limit=1000`,
      { signal: controller.signal, cache: "no-store" },
    )
      .then((r) => (r.ok ? r.json() : Promise.reject(r.statusText)))
      .then((body: { data: (Fs02Transaction | Fs02Health)[] }) => {
        setRows(Array.isArray(body.data) ? body.data : []);
      })
      .catch((err) => {
        if (err?.name === "AbortError") return;
        console.warn("[history-fs02] fetch failed:", err);
        setError(String(err));
        setRows([]);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [kind, refreshTick]);

  const hourFilteredRows = useMemo(() => {
    if (!hourFrom && !hourTo) return rows;
    const parseHm = (s: string): number | null => {
      const m = /^(\d{2}):(\d{2})$/.exec(s.trim());
      if (!m) return null;
      return Number(m[1]) * 60 + Number(m[2]);
    };
    const fromMin = hourFrom ? parseHm(hourFrom) : 0;
    const toMin = hourTo ? parseHm(hourTo) : 24 * 60 - 1;
    if (fromMin === null || toMin === null) return rows;
    return rows.filter((r) => {
      const wib = new Date(new Date(r.dateTime).getTime() + 7 * 3600 * 1000);
      const cur = wib.getUTCHours() * 60 + wib.getUTCMinutes();
      if (fromMin <= toMin) return cur >= fromMin && cur <= toMin;
      return cur >= fromMin || cur <= toMin;
    });
  }, [rows, hourFrom, hourTo]);

  const summary = useMemo(() => {
    if (kind !== "prod") return null;
    const txs = hourFilteredRows as Fs02Transaction[];
    if (txs.length === 0) return null;
    const totalVolume = txs.reduce((s, t) => s + (t.volume ?? 0), 0);
    const totalDuration = txs.reduce(
      (s, t) => s + (t.durationSeconds ?? 0),
      0,
    );
    return {
      count: txs.length,
      totalVolume,
      totalDuration,
    };
  }, [hourFilteredRows, kind]);

  const handleExportCsv = useCallback(() => {
    if (hourFilteredRows.length === 0) return;
    let header: string[];
    let makeRow: (r: Fs02Transaction | Fs02Health) => (string | number)[];
    if (kind === "prod") {
      header = [
        "no",
        "ticket_number",
        "type",
        "start_time_wib",
        "finish_time_wib",
        "duration_s",
        "volume_l",
        "gross_volume_l",
        "compensated_l",
        "totalizer_start",
        "totalizer_end",
      ];
      makeRow = (r) => {
        const t = r as Fs02Transaction;
        return [
          "",
          t.ticketNumber,
          t.transactionType ?? "",
          fmtWib(t.startTime),
          fmtWib(t.finishTime),
          t.durationSeconds ?? "",
          t.volume ?? "",
          t.grossVolume ?? "",
          t.compensated ?? "",
          t.totalizerStart ?? "",
          t.totalizerEnd ?? "",
        ];
      };
    } else {
      header = [
        "no",
        "datetime_wib",
        "totalizer",
        "flow_rate_lpm",
        "temperature_c",
        "volume_unrounded",
        "gross_volume",
        "compensated_volume",
      ];
      makeRow = (r) => {
        const h = r as Fs02Health;
        return [
          "",
          fmtWib(h.dateTime),
          h.totalizer ?? "",
          h.flowRate ?? "",
          h.temperature ?? "",
          h.volumeUnrounded ?? "",
          h.grossVolume ?? "",
          h.compensatedVolume ?? "",
        ];
      };
    }
    const lines = [header.join(",")];
    hourFilteredRows.forEach((r, i) => {
      const row = makeRow(r);
      row[0] = i + 1;
      lines.push(row.map(csvEscape).join(","));
    });
    const blob = new Blob([lines.join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fs02-${kind}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [hourFilteredRows, kind]);

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
            </svg>
          </div>
          <div>
            <h1 className="hist-header-title">History FS02</h1>
            <p className="hist-header-sub">
              {COMPANY} · SPT Dashboard · Fuel Station 02
            </p>
          </div>
        </div>
      </header>

      <section className="hist-filters">
        <div className="hist-filter-row">
          <div className="hist-field">
            <span className="hist-field-label">Kind</span>
            <div className="hist-pills">
              {(["prod", "machHealth", "liveLocations"] as Fs02Kind[]).map(
                (k) => (
                  <button
                    key={k}
                    type="button"
                    className={`hist-pill${
                      kind === k ? " hist-pill-active" : ""
                    }`}
                    onClick={() => setKind(k)}
                  >
                    {k === "prod"
                      ? "Transactions"
                      : k === "machHealth"
                        ? "Health"
                        : "Location"}
                  </button>
                ),
              )}
            </div>
          </div>

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
              disabled={hourFilteredRows.length === 0}
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
            <div className="hist-summary-label">Total Transactions</div>
            <div className="hist-summary-value">{summary.count}</div>
          </div>
          <div className="hist-summary-item">
            <div className="hist-summary-label">Total Volume</div>
            <div className="hist-summary-value hist-summary-delta hist-delta-pos">
              {fmt(summary.totalVolume)} L
            </div>
          </div>
          <div className="hist-summary-item">
            <div className="hist-summary-label">Total Duration</div>
            <div className="hist-summary-value">{summary.totalDuration}s</div>
          </div>
          <div className="hist-summary-item">
            <div className="hist-summary-label">Rata-rata Volume</div>
            <div className="hist-summary-value">
              {fmt(summary.totalVolume / Math.max(1, summary.count))} L
            </div>
          </div>
        </section>
      )}

      <main className="hist-main">
        <div className="hist-table-wrap">
          {kind === "prod" ? (
            <ProdTable rows={hourFilteredRows as Fs02Transaction[]} loading={loading} />
          ) : kind === "machHealth" ? (
            <HealthTable rows={hourFilteredRows as Fs02Health[]} loading={loading} />
          ) : (
            <LocationTable rows={hourFilteredRows as (Fs02Health & Record<string, unknown>)[]} loading={loading} />
          )}
        </div>
      </main>

      <footer className="hist-footer">
        <span>
          Rows: <code>{hourFilteredRows.length}</code>
          {(hourFrom || hourTo) && rows.length !== hourFilteredRows.length && (
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

function ProdTable({
  rows,
  loading,
}: {
  rows: Fs02Transaction[];
  loading: boolean;
}) {
  return (
    <table className="hist-table">
      <thead>
        <tr>
          <th className="hist-num">#</th>
          <th className="hist-num">Ticket</th>
          <th>Type</th>
          <th>Start (WIB)</th>
          <th>Finish (WIB)</th>
          <th className="hist-num">Duration (s)</th>
          <th className="hist-num">Volume (L)</th>
          <th className="hist-num">Gross (L)</th>
          <th className="hist-num">Comp (L)</th>
          <th className="hist-num">Totalizer Start</th>
          <th className="hist-num">Totalizer End</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={11} className="hist-empty">
              {loading ? "Loading…" : "Belum ada transaction"}
            </td>
          </tr>
        ) : (
          rows.map((t, i) => (
            <tr key={`${t.ticketNumber}-${i}`}>
              <td className="hist-num hist-mono">{i + 1}</td>
              <td className="hist-num hist-mono">{t.ticketNumber}</td>
              <td className="hist-mono">{t.transactionType ?? "—"}</td>
              <td className="hist-mono">{fmtWib(t.startTime)}</td>
              <td className="hist-mono">{fmtWib(t.finishTime)}</td>
              <td className="hist-num hist-mono">
                {t.durationSeconds ?? "—"}
              </td>
              <td className="hist-num hist-mono hist-delta-pos">
                {fmt(t.volume)}
              </td>
              <td className="hist-num hist-mono">{fmt(t.grossVolume)}</td>
              <td className="hist-num hist-mono">{fmt(t.compensated)}</td>
              <td className="hist-num hist-mono">{fmt(t.totalizerStart)}</td>
              <td className="hist-num hist-mono">{fmt(t.totalizerEnd)}</td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

function HealthTable({
  rows,
  loading,
}: {
  rows: Fs02Health[];
  loading: boolean;
}) {
  return (
    <table className="hist-table">
      <thead>
        <tr>
          <th className="hist-num">#</th>
          <th>Datetime (WIB)</th>
          <th className="hist-num">Totalizer</th>
          <th className="hist-num">Flow (L/min)</th>
          <th className="hist-num">Temp (°C)</th>
          <th className="hist-num">Volume Unrounded</th>
          <th className="hist-num">Gross</th>
          <th className="hist-num">Compensated</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={8} className="hist-empty">
              {loading ? "Loading…" : "Belum ada data health"}
            </td>
          </tr>
        ) : (
          rows.map((h, i) => (
            <tr key={`${h.dateTime}-${i}`}>
              <td className="hist-num hist-mono">{i + 1}</td>
              <td className="hist-mono">{fmtWib(h.dateTime)}</td>
              <td className="hist-num hist-mono">{fmt(h.totalizer)}</td>
              <td className="hist-num hist-mono">{fmt(h.flowRate)}</td>
              <td className="hist-num hist-mono">{fmt(h.temperature, 1)}</td>
              <td className="hist-num hist-mono">
                {fmt(h.volumeUnrounded)}
              </td>
              <td className="hist-num hist-mono">{fmt(h.grossVolume)}</td>
              <td className="hist-num hist-mono">
                {fmt(h.compensatedVolume)}
              </td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

interface LocationRow {
  dateTime: string;
  lat?: number | null;
  lng?: number | null;
  alt?: number | null;
  spd?: number | null;
  hdg?: number | null;
  rssi?: number | null;
  gpsValid?: boolean | null;
  deliveryActive?: boolean | null;
  flowActive?: boolean | null;
}

function LocationTable({
  rows,
  loading,
}: {
  rows: LocationRow[];
  loading: boolean;
}) {
  return (
    <table className="hist-table">
      <thead>
        <tr>
          <th className="hist-num">#</th>
          <th>Datetime (WIB)</th>
          <th className="hist-num">Lat</th>
          <th className="hist-num">Lng</th>
          <th className="hist-num">Alt (m)</th>
          <th className="hist-num">Spd</th>
          <th className="hist-num">Hdg</th>
          <th className="hist-num">RSSI</th>
          <th>GPS</th>
          <th>Delivery</th>
          <th>Flow</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={11} className="hist-empty">
              {loading ? "Loading…" : "Belum ada data location"}
            </td>
          </tr>
        ) : (
          rows.map((l, i) => (
            <tr key={`${l.dateTime}-${i}`}>
              <td className="hist-num hist-mono">{i + 1}</td>
              <td className="hist-mono">{fmtWib(l.dateTime)}</td>
              <td className="hist-num hist-mono">{fmt(l.lat, 6)}</td>
              <td className="hist-num hist-mono">{fmt(l.lng, 6)}</td>
              <td className="hist-num hist-mono">{fmt(l.alt, 1)}</td>
              <td className="hist-num hist-mono">{fmt(l.spd, 1)}</td>
              <td className="hist-num hist-mono">{fmt(l.hdg, 0)}</td>
              <td className="hist-num hist-mono">{l.rssi ?? "—"}</td>
              <td className="hist-mono">{l.gpsValid ? "ok" : "off"}</td>
              <td className="hist-mono">
                {l.deliveryActive ? "active" : "idle"}
              </td>
              <td className="hist-mono">{l.flowActive ? "flow" : "—"}</td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}
