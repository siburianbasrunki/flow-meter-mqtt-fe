import type { FlowMeterPayload } from "../hooks/useFlowMeterApi";

interface TotalisatorChartProps {
  history: FlowMeterPayload[]; // oldest first
  fmId: string;
}

function formatK(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toFixed(0);
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function TotalisatorChart({ history, fmId }: TotalisatorChartProps) {
  if (history.length < 2) {
    return (
      <div className="chart-empty">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#334155" strokeWidth="1.5">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
        <p>Collecting data…</p>
      </div>
    );
  }

  const W = 400;
  const H = 110;
  const PAD = { top: 14, right: 12, bottom: 28, left: 48 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const values = history.map((h) => h.totalisator);
  const times = history.map((h) => h.received_at ?? h.datetime);

  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const range = maxVal - minVal || 1;

  const xScale = (i: number) => PAD.left + (i / (history.length - 1)) * innerW;
  const yScale = (v: number) => PAD.top + innerH - ((v - minVal) / range) * innerH;

  // Build path
  const points = history.map((h, i) => [xScale(i), yScale(h.totalisator)] as [number, number]);
  const linePath = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const areaPath =
    `${linePath} L${points[points.length - 1][0].toFixed(1)},${(PAD.top + innerH).toFixed(1)} L${PAD.left.toFixed(1)},${(PAD.top + innerH).toFixed(1)} Z`;

  // Flow rate (last interval)
  const last = history[history.length - 1];
  const prev = history[history.length - 2];
  const deltaLiter = last.totalisator - prev.totalisator;
  const deltaMs =
    new Date(last.received_at ?? last.datetime).getTime() -
    new Date(prev.received_at ?? prev.datetime).getTime();
  const flowRate = deltaMs > 0 ? (deltaLiter / (deltaMs / 1000 / 60)).toFixed(1) : "—";

  // Y-axis labels (3 ticks)
  const yTicks = [minVal, minVal + range * 0.5, maxVal];

  // X-axis labels (first, middle, last)
  const xLabels = [
    { i: 0, label: formatTime(times[0]) },
    { i: Math.floor((history.length - 1) / 2), label: formatTime(times[Math.floor((history.length - 1) / 2)]) },
    { i: history.length - 1, label: formatTime(times[history.length - 1]) },
  ];

  return (
    <div className="chart-wrapper">
      <div className="chart-header">
        <span className="chart-title">Totalisator — {fmId}</span>
        <div className="chart-meta">
          <span className="chart-flow-rate">
            <span className="chart-rate-dot" />
            {flowRate} L/min
          </span>
          <span className="chart-total">{formatK(last.totalisator)} L total</span>
        </div>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        style={{ display: "block", overflow: "visible" }}
        aria-label={`Totalisator chart for ${fmId}`}
      >
        <defs>
          <linearGradient id={`area-grad-${fmId}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ff6d00" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#ff6d00" stopOpacity="0" />
          </linearGradient>
          <filter id="glow-line">
            <feGaussianBlur stdDeviation="1.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Grid lines */}
        {yTicks.map((tick, i) => (
          <line
            key={i}
            x1={PAD.left}
            x2={PAD.left + innerW}
            y1={yScale(tick)}
            y2={yScale(tick)}
            stroke="rgba(255,255,255,0.05)"
            strokeWidth="1"
            strokeDasharray="4 4"
          />
        ))}

        {/* Y-axis labels */}
        {yTicks.map((tick, i) => (
          <text
            key={i}
            x={PAD.left - 6}
            y={yScale(tick) + 4}
            textAnchor="end"
            fontSize="9"
            fill="#9ca3af"
          >
            {formatK(tick)}
          </text>
        ))}

        {/* X-axis labels */}
        {xLabels.map(({ i, label }) => (
          <text
            key={i}
            x={xScale(i)}
            y={PAD.top + innerH + 16}
            textAnchor={i === 0 ? "start" : i === history.length - 1 ? "end" : "middle"}
            fontSize="9"
            fill="#9ca3af"
          >
            {label}
          </text>
        ))}

        {/* Area fill */}
        <path d={areaPath} fill={`url(#area-grad-${fmId})`} />

        {/* Line */}
        <path
          d={linePath}
          fill="none"
          stroke="#ff6d00"
          strokeWidth="1.8"
          strokeLinejoin="round"
          strokeLinecap="round"
          filter="url(#glow-line)"
        />

        {/* Latest point dot */}
        <circle
          cx={points[points.length - 1][0]}
          cy={points[points.length - 1][1]}
          r="4"
          fill="#ff6d00"
          stroke="#fff"
          strokeWidth="1.5"
        />
        <circle
          cx={points[points.length - 1][0]}
          cy={points[points.length - 1][1]}
          r="8"
          fill="rgba(255,109,0,0.15)"
        />
      </svg>
    </div>
  );
}
