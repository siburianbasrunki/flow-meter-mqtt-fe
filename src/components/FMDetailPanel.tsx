import { useEffect } from "react";
import type { FlowMeterPayload } from "../hooks/useFlowMeterApi";

interface FMDetailPanelProps {
  fmId: string;
  latest: FlowMeterPayload | null;
  history: FlowMeterPayload[]; // newest-first
  onClose: () => void;
}

function fmt(n: number) {
  return new Intl.NumberFormat("id-ID", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export default function FMDetailPanel({
  fmId,
  latest,
  history,
  onClose,
}: FMDetailPanelProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <div className="fmd-backdrop" onClick={onClose} />
      <aside className="fmd-panel" role="dialog" aria-label={`Detail ${fmId}`}>
        <header className="fmd-header">
          <div>
            <div className="fmd-title">{fmId}</div>
            <div className="fmd-sub">{latest?.company ?? "—"}</div>
          </div>
          <button
            className="fmd-close"
            onClick={onClose}
            aria-label="Close detail panel"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </header>

        {/* Latest payload */}
        <section className="fmd-section">
          <h4 className="fmd-section-title">Latest payload</h4>
          <div className="fmd-kv">
            <div className="fmd-kv-row">
              <span>fm_id</span>
              <span className="fmd-mono">{latest?.fm_id ?? "—"}</span>
            </div>
            <div className="fmd-kv-row">
              <span>plant_id</span>
              <span className="fmd-mono">{latest?.plant_id ?? "—"}</span>
            </div>
            <div className="fmd-kv-row">
              <span>slocn</span>
              <span className="fmd-mono">{latest?.slocn ?? "—"}</span>
            </div>
            <div className="fmd-kv-row">
              <span>company</span>
              <span>{latest?.company ?? "—"}</span>
            </div>
            <div className="fmd-kv-row">
              <span>datetime</span>
              <span className="fmd-mono">{latest?.datetime ?? "—"}</span>
            </div>
            <div className="fmd-kv-row">
              <span>totalisator</span>
              <span className="fmd-mono fmd-strong">
                {latest ? `${fmt(latest.totalisator)} L` : "—"}
              </span>
            </div>
          </div>
        </section>

        {/* History list — raw payload records */}
        <section className="fmd-section fmd-section-grow">
          <h4 className="fmd-section-title">
            History <span className="fmd-count">({history.length})</span>
          </h4>
          <div className="fmd-table-wrap">
            <table className="fmd-table">
              <thead>
                <tr>
                  <th>datetime</th>
                  <th className="fmd-num">totalisator (L)</th>
                </tr>
              </thead>
              <tbody>
                {history.length === 0 && (
                  <tr>
                    <td colSpan={2} className="fmd-empty">
                      Belum ada data
                    </td>
                  </tr>
                )}
                {history.map((msg, i) => (
                  <tr key={`${msg.datetime}-${i}`}>
                    <td className="fmd-mono fmd-time">{msg.datetime}</td>
                    <td className="fmd-num fmd-mono">{fmt(msg.totalisator)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </aside>
    </>
  );
}
