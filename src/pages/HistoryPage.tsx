import { useCallback, useEffect, useMemo, useState } from "react";
import type { FlowMeterPayload } from "../hooks/useFlowMeterApi";
import "./history.css";

const COMPANY = "PT Putra Perkasa Abadi";

const API_URL =
  (import.meta as unknown as { env: Record<string, string> }).env
    ?.VITE_FLOW_METER_API_URL ?? "http://localhost:3020";

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

export default function HistoryPage() {
  const [fmIds, setFmIds] = useState<string[]>([]);
  const [selectedFmId, setSelectedFmId] = useState<string>("");
  const [rangeMode, setRangeMode] = useState<RangeMode>("24h");
  const [customFrom, setCustomFrom] = useState<string>(() =>
    toLocalInput(new Date(Date.now() - 24 * 60 * 60 * 1000)),
  );
  const [customTo, setCustomTo] = useState<string>(() =>
    toLocalInput(new Date()),
  );
  const [rows, setRows] = useState<FlowMeterPayload[]>([]);
  const [source, setSource] = useState<"db" | "cache" | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  // Hydrate FM list
  useEffect(() => {
    fetch(`${API_URL}/iot/flow-meter/list`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.statusText)))
      .then((body: { data: string[] }) => {
        const list = Array.isArray(body.data) ? body.data : [];
        setFmIds(list);
        setSelectedFmId((prev) => prev || list[0] || "");
      })
      .catch((err) => {
        console.warn("[history] list fetch failed:", err);
      });
  }, []);

  // Fetch history when filter changes
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
      fmId: selectedFmId,
      limit: "5000",
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
        console.warn("[history] fetch failed:", err);
        setError(String(err));
        setRows([]);
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [selectedFmId, rangeMode, customFrom, customTo, refreshTick]);

  // Compute delta (kenaikan) — assumes newest-first ordering
  const rowsWithDelta = useMemo(() => {
    return rows.map((r, i) => {
      const next = rows[i + 1];
      const delta =
        next && Number.isFinite(next.totalisator)
          ? r.totalisator - next.totalisator
          : null;
      return { ...r, _delta: delta };
    });
  }, [rows]);

  const handleExportCsv = useCallback(() => {
    if (rows.length === 0) return;
    const header = [
      "no",
      "datetime_wib",
      "fm_id",
      "slocn",
      "plant_id",
      "totalisator",
      "kenaikan",
      "pulse",
      "pulseEQEP",
      "flow_rate",
      "timezone",
      "received_at",
    ];
    const lines = [header.join(",")];
    rowsWithDelta.forEach((r, i) => {
      lines.push(
        [
          i + 1,
          r.datetime,
          r.fm_id,
          r.slocn ?? "",
          r.plant_id ?? "",
          r.totalisator,
          r._delta ?? "",
          r.pulse ?? "",
          r.pulseEQEP ?? "",
          r.flow_rate ?? "",
          r.timezone ?? "",
          r.received_at ?? "",
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
    a.download = `flow-meter-${selectedFmId}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [rows.length, rowsWithDelta, selectedFmId]);

  return (
    <div className="hist-dashboard">
      {/* Header */}
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
            <h1 className="hist-header-title">History Table</h1>
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

      {/* Filters */}
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

      {/* Table */}
      <main className="hist-main">
        <div className="hist-table-wrap">
          <table className="hist-table">
            <thead>
              <tr>
                <th className="hist-num">#</th>
                <th>Datetime (WIB)</th>
                <th>FM ID</th>
                <th>Sloc</th>
                <th>Plant</th>
                <th className="hist-num">Totalisator (L)</th>
                <th className="hist-num">Kenaikan (L)</th>
                <th className="hist-num">Pulse</th>
                <th className="hist-num">pulseEQEP</th>
                <th className="hist-num">Flow Rate</th>
                <th>TZ</th>
                <th>Received (WIB)</th>
              </tr>
            </thead>
            <tbody>
              {rowsWithDelta.length === 0 ? (
                <tr>
                  <td colSpan={12} className="hist-empty">
                    {loading
                      ? "Loading…"
                      : "Belum ada data untuk range ini"}
                  </td>
                </tr>
              ) : (
                rowsWithDelta.map((r, i) => (
                  <tr key={`${r.fm_id}-${r.datetime}-${i}`}>
                    <td className="hist-num hist-mono">{i + 1}</td>
                    <td className="hist-mono">{r.datetime}</td>
                    <td className="hist-mono">{r.fm_id}</td>
                    <td className="hist-mono">{r.slocn ?? "—"}</td>
                    <td className="hist-mono">{r.plant_id ?? "—"}</td>
                    <td className="hist-num hist-mono">{fmt(r.totalisator)}</td>
                    <td
                      className={`hist-num hist-mono${
                        r._delta && r._delta > 0 ? " hist-delta-pos" : ""
                      }`}
                    >
                      {r._delta === null
                        ? "—"
                        : (r._delta > 0 ? "+" : "") + fmt(r._delta)}
                    </td>
                    <td className="hist-num hist-mono">
                      {r.pulse !== null && r.pulse !== undefined
                        ? fmt(r.pulse, 0)
                        : "—"}
                    </td>
                    <td className="hist-num hist-mono">
                      {r.pulseEQEP !== null && r.pulseEQEP !== undefined
                        ? fmt(r.pulseEQEP, 0)
                        : "—"}
                    </td>
                    <td className="hist-num hist-mono">
                      {r.flow_rate !== null && r.flow_rate !== undefined
                        ? fmt(r.flow_rate)
                        : "—"}
                    </td>
                    <td className="hist-mono">{r.timezone ?? "—"}</td>
                    <td className="hist-mono">{r.received_at ?? "—"}</td>
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
