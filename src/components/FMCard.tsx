import type { FlowMeterPayload } from "../hooks/useFlowMeterApi";

interface FMCardProps {
  fmId: string;
  latest: FlowMeterPayload | null;
  /** History terbaru, newest-first. Card nampilin 5 row di bawah live data. */
  history?: FlowMeterPayload[];
  isSelected?: boolean;
  onClick?: () => void;
}

function fmt(n: number) {
  return new Intl.NumberFormat("id-ID", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export default function FMCard({
  fmId,
  latest,
  history = [],
  isSelected,
  onClick,
}: FMCardProps) {
  // Live = posisi 0. History = posisi 1..5 (5 row sebelumnya).
  const previous = history.slice(1, 6);
  return (
    <div
      className={`fm-card-full${isSelected ? " fm-card-selected" : ""}${onClick ? " fm-card-clickable" : ""}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => {
        if (onClick && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <div className="fmc-header">
        <div className="fmc-header-left">
          <span className="fmc-fm-id">{fmId}</span>
        </div>
      </div>

      <div className="fmc-body">
        <div className="fmc-info">
          <div className="fmc-row">
            <span className="fmc-lbl">fm_id</span>
            <span className="fmc-val fmc-mono">{latest?.fm_id ?? "—"}</span>
          </div>
          <div className="fmc-row">
            <span className="fmc-lbl">plant_id</span>
            <span className="fmc-val fmc-mono">{latest?.plant_id ?? "—"}</span>
          </div>
          <div className="fmc-row">
            <span className="fmc-lbl">slocn</span>
            <span className="fmc-val fmc-mono">{latest?.slocn ?? "—"}</span>
          </div>
          <div className="fmc-row">
            <span className="fmc-lbl">company</span>
            <span className="fmc-val">{latest?.company ?? "—"}</span>
          </div>
          <div className="fmc-row">
            <span className="fmc-lbl">datetime</span>
            <span className="fmc-val fmc-mono">{latest?.datetime ?? "—"}</span>
          </div>
        </div>
      </div>

      <div className="fmc-tota-bar">
        <div className="fmc-tota-left">
          <span className="fmc-tota-label">TOTALISATOR (LIVE)</span>
          <span className="fmc-tota-value">
            {latest ? fmt(latest.totalisator) : "—"}
          </span>
          <span className="fmc-tota-unit">L</span>
        </div>
      </div>

      {/* 5 history sebelumnya — payload murni dari MQTT */}
      <div className="fmc-history">
        <div className="fmc-history-title">5 PESAN SEBELUMNYA</div>
        {previous.length === 0 ? (
          <div className="fmc-history-empty">Belum ada history</div>
        ) : (
          <table className="fmc-history-table">
            <thead>
              <tr>
                <th>datetime</th>
                <th className="fmc-num">totalisator (L)</th>
              </tr>
            </thead>
            <tbody>
              {previous.map((m, i) => (
                <tr key={`${m.datetime}-${i}`}>
                  <td className="fmc-mono">{m.datetime || "—"}</td>
                  <td className="fmc-num fmc-mono">{fmt(m.totalisator)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
