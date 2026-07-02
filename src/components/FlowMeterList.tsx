import type { FlowMeterPayload } from "../hooks/useFlowMeterApi";

interface FlowMeterSummary {
  fm_id: string;
  latest: FlowMeterPayload;
  count: number;
  isActive: boolean; // received within last 10s
}

interface FlowMeterListProps {
  summaries: FlowMeterSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  isDummy: boolean;
}

function formatK(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + " M";
  if (n >= 1_000) return (n / 1_000).toFixed(2) + " K";
  return n.toFixed(2);
}

export type { FlowMeterSummary };

export default function FlowMeterList({ summaries, selectedId, onSelect, isDummy }: FlowMeterListProps) {
  return (
    <aside className="fm-sidebar">
      <div className="fm-sidebar-header">
        <span className="fm-sidebar-title">Flow Meters</span>
        <span className="fm-sidebar-count">{summaries.length} unit</span>
      </div>

      {summaries.length === 0 ? (
        <div className="fm-sidebar-empty">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#334155" strokeWidth="1.5">
            <circle cx="12" cy="12" r="9" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <p>No flow meters detected</p>
        </div>
      ) : (
        <ul className="fm-list">
          {summaries.map((fm) => (
            <li key={fm.fm_id}>
              <button
                id={`fm-card-${fm.fm_id}`}
                className={`fm-card ${selectedId === fm.fm_id ? "fm-card-selected" : ""}`}
                onClick={() => onSelect(fm.fm_id)}
              >
                {/* Active indicator */}
                <div
                  className="fm-active-dot"
                  style={{ background: fm.isActive ? "#22c55e" : "#475569" }}
                  title={fm.isActive ? "Active" : "Idle"}
                />

                <div className="fm-card-body">
                  <div className="fm-card-top">
                    <span className="fm-id">{fm.fm_id}</span>
                    {isDummy && (
                      <span className="fm-demo-tag">DEMO</span>
                    )}
                  </div>
                  <div className="fm-card-middle">
                    <span className="fm-sloc">{fm.latest.slocn}</span>
                    <span className="fm-plant">{fm.latest.plant_id}</span>
                  </div>
                  <div className="fm-card-bottom">
                    <span className="fm-tota">{formatK(fm.latest.totalisator)}</span>
                    <span className="fm-tota-unit">L</span>
                    <span className="fm-msg-count">{fm.count} msgs</span>
                  </div>
                </div>

                {/* Selected indicator bar */}
                {selectedId === fm.fm_id && <div className="fm-selected-bar" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
