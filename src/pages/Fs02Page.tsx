import { useMemo, useState } from "react";
import {
  useFs02Api,
  type Fs02Health,
} from "../hooks/useFs02Api";
import "./flow-meter.css";

const COMPANY = "PT Putra Perkasa Abadi";

function fmt(n: number | null | undefined, digits = 2): string {
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

function parseIsoMs(iso: string | null | undefined): number {
  if (!iso) return NaN;
  return new Date(iso).getTime();
}

export default function Fs02Page() {
  const {
    status,
    location,
    health,
    transaction,
    healthHistory,
    apiUrl,
  } = useFs02Api();

  const statusColor =
    status === "connected"
      ? "#16a34a"
      : status === "connecting"
        ? "#f59e0b"
        : "#ef4444";

  const isDelivering = location?.deliveryActive === true;
  const isFlowing = location?.flowActive === true;

  return (
    <div className="fm-dashboard">
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
            <h1 className="fm-header-title">FS02 · Fuel Station</h1>
            <p className="fm-header-sub">{COMPANY} · SPT Dashboard</p>
          </div>
        </div>
        <div className="fm-header-right">
          <span
            className="fm-source-badge"
            style={{
              background: `${statusColor}22`,
              borderColor: `${statusColor}66`,
              color: statusColor,
            }}
          >
            {status}
          </span>
        </div>
      </header>

      <section className="fm-kpi-row">
        <div className="fm-kpi">
          <div className="fm-kpi-label">Totalizer</div>
          <div className="fm-kpi-value">
            {fmt(health?.totalizer)}{" "}
            <span className="fm-kpi-unit">L</span>
          </div>
          <div className="fm-kpi-sub">{fmtWib(health?.dateTime)} WIB</div>
        </div>
        <div className="fm-kpi">
          <div className="fm-kpi-label">Flow Rate</div>
          <div className="fm-kpi-value">
            {fmt(health?.flowRate)}{" "}
            <span className="fm-kpi-unit">L/min</span>
          </div>
          <div className="fm-kpi-sub">
            {isFlowing ? "flow active" : "idle"}
          </div>
        </div>
        <div className="fm-kpi">
          <div className="fm-kpi-label">Temperature</div>
          <div className="fm-kpi-value">
            {fmt(health?.temperature, 1)}{" "}
            <span className="fm-kpi-unit">°C</span>
          </div>
          <div className="fm-kpi-sub">nozzle sensor</div>
        </div>
        <div className="fm-kpi">
          <div className="fm-kpi-label">Delivery State</div>
          <div className="fm-kpi-value" style={{ fontSize: 20 }}>
            {isDelivering ? "ACTIVE" : "IDLE"}
          </div>
          <div className="fm-kpi-sub">
            {location?.gpsValid ? "GPS ok" : "GPS off"} · rssi{" "}
            {location?.rssi ?? "—"}
          </div>
        </div>
      </section>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 380px",
          gap: 12,
          padding: 12,
          flex: 1,
          minHeight: 0,
          overflow: "auto",
        }}
      >
        {/* Chart */}
        <div
          style={{
            background: "var(--scada-bg)",
            border: "1px solid var(--scada-border)",
            padding: 16,
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: 1,
              color: "var(--scada-dim)",
              marginBottom: 12,
            }}
          >
            [ TOTALIZER TREND · LIVE ]
          </div>
          <TotalizerChart history={healthHistory} />
        </div>

        {/* Right panel: latest transaction + location */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div
            style={{
              background: "var(--scada-bg)",
              border: "1px solid var(--scada-border)",
              padding: 14,
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: 1,
                color: "var(--scada-dim)",
                marginBottom: 10,
              }}
            >
              [ LATEST TRANSACTION ]
            </div>
            {transaction ? (
              <div style={{ display: "grid", gap: 6, fontFamily: "var(--mono)", fontSize: 12 }}>
                <Row label="Ticket #" value={transaction.ticketNumber} />
                <Row label="Type" value={transaction.transactionType ?? "—"} />
                <Row
                  label="Volume"
                  value={`${fmt(transaction.volume)} L`}
                />
                <Row
                  label="Duration"
                  value={
                    transaction.durationSeconds !== null
                      ? `${transaction.durationSeconds}s`
                      : "—"
                  }
                />
                <Row label="Start" value={fmtWib(transaction.startTime)} />
                <Row label="Finish" value={fmtWib(transaction.finishTime)} />
                <Row
                  label="Totalizer"
                  value={`${fmt(transaction.totalizerStart)} → ${fmt(transaction.totalizerEnd)}`}
                />
              </div>
            ) : (
              <div style={{ color: "var(--scada-dim)", fontSize: 12 }}>
                Belum ada transaction
              </div>
            )}
          </div>

          <div
            style={{
              background: "var(--scada-bg)",
              border: "1px solid var(--scada-border)",
              padding: 14,
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: 1,
                color: "var(--scada-dim)",
                marginBottom: 10,
              }}
            >
              [ LOCATION ]
            </div>
            {location ? (
              <div style={{ display: "grid", gap: 6, fontFamily: "var(--mono)", fontSize: 12 }}>
                <Row label="Lat" value={fmt(location.lat, 6)} />
                <Row label="Lng" value={fmt(location.lng, 6)} />
                <Row label="Alt" value={`${fmt(location.alt, 1)} m`} />
                <Row label="Spd" value={`${fmt(location.spd, 1)} km/h`} />
                <Row label="Hdg" value={`${fmt(location.hdg, 0)}°`} />
                <Row label="Firm" value={location.firm ?? "—"} />
                <Row label="Board" value={location.board ?? "—"} />
              </div>
            ) : (
              <div style={{ color: "var(--scada-dim)", fontSize: 12 }}>
                Belum ada location
              </div>
            )}
          </div>
        </div>
      </section>

      <footer className="fm-footer">
        <span>
          API: <code>{apiUrl}</code>
        </span>
        <span className="fm-footer-time">
          {new Date().toLocaleTimeString("id-ID")}
        </span>
      </footer>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
      <span style={{ color: "var(--scada-dim)" }}>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function TotalizerChart({ history }: { history: Fs02Health[] }) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const points = useMemo(() => {
    const asc = [...history].reverse();
    return asc
      .map((r) => ({
        t: parseIsoMs(r.dateTime),
        v: r.totalizer,
        flow: r.flowRate,
      }))
      .filter(
        (p): p is { t: number; v: number; flow: number | null } =>
          Number.isFinite(p.t) && p.v !== null && Number.isFinite(p.v),
      );
  }, [history]);

  if (points.length < 2) {
    return (
      <div
        style={{
          padding: 40,
          textAlign: "center",
          color: "var(--scada-dim)",
          fontSize: 12,
          fontFamily: "var(--mono)",
        }}
      >
        Belum cukup data untuk chart (butuh ≥2 point)
      </div>
    );
  }

  const W = 720;
  const H = 232;
  const PAD = { top: 16, right: 72, bottom: 48, left: 12 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const ts = points.map((p) => p.t);
  const vs = points.map((p) => p.v);
  const tMin = ts[0];
  const tMax = ts[ts.length - 1];
  const tRange = Math.max(1, tMax - tMin);
  const minV = Math.min(...vs);
  const maxV = Math.max(...vs);
  const range = maxV - minV || 1;
  const pad = range * 0.08;
  const yMin = Math.max(0, minV - pad);
  const yMax = maxV + pad;
  const yRange = yMax - yMin || 1;

  const xScale = (t: number) => PAD.left + ((t - tMin) / tRange) * innerW;
  const yScale = (v: number) =>
    PAD.top + innerH - ((v - yMin) / yRange) * innerH;

  // Step path — horizontal hold, vertical step tiap kenaikan (sama kayak FlowMeter)
  const path = points
    .map((p, i) => {
      const x = xScale(p.t);
      const y = yScale(p.v);
      if (i === 0) return `M ${x.toFixed(1)} ${y.toFixed(1)}`;
      const yPrev = yScale(points[i - 1].v);
      return `L ${x.toFixed(1)} ${yPrev.toFixed(1)} L ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");

  const yTicks = Array.from({ length: 5 }, (_, i) => yMin + (yRange * i) / 4);
  const N = 5;
  const xTickTimes = Array.from(
    { length: N },
    (_, k) => tMin + (tRange * k) / (N - 1),
  );

  // Adaptif — kalau range kecil tapi angka jutaan, pakai notasi compact
  // (mis. "9.8166M" instead of "9816655.92") biar label kebaca.
  const fmtY = (v: number): string => {
    const abs = Math.abs(v);
    if (abs >= 1_000_000) {
      const scaled = v / 1_000_000;
      const rangeScaled = yRange / 1_000_000;
      let d = 1;
      if (rangeScaled < 0.001) d = 4;
      else if (rangeScaled < 0.01) d = 3;
      else if (rangeScaled < 0.1) d = 2;
      return scaled.toFixed(d) + "M";
    }
    if (abs >= 1_000) {
      const scaled = v / 1_000;
      const rangeScaled = yRange / 1_000;
      let d = 1;
      if (rangeScaled < 0.01) d = 3;
      else if (rangeScaled < 0.1) d = 2;
      return scaled.toFixed(d) + "K";
    }
    if (yRange < 1) return v.toFixed(2);
    return v.toFixed(0);
  };
  const fmtT = (t: number): { date: string; time: string } => {
    const wib = new Date(t + 7 * 3600 * 1000);
    const iso = wib.toISOString();
    return { date: iso.slice(5, 10), time: iso.slice(11, 19) };
  };

  const latestPt = points[points.length - 1];

  return (
    <div className="fm-chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="fm-chart-svg">
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
              {fmtY(t)}
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
          const anchor =
            k === 0 ? "start" : k === xTickTimes.length - 1 ? "end" : "middle";
          const x = xScale(t);
          const { date, time } = fmtT(t);
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
                {date}
              </tspan>
              <tspan x={x} dy="12">
                {time}
              </tspan>
            </text>
          );
        })}

        <path d={path} fill="none" stroke="#0891b2" strokeWidth="1.6" />

        {points.map((p, i) => (
          <circle
            key={`d-${i}`}
            cx={xScale(p.t)}
            cy={yScale(p.v)}
            r={hoveredIdx === i ? 3.5 : 1.8}
            fill="#0891b2"
          />
        ))}

        <circle
          cx={xScale(latestPt.t)}
          cy={yScale(latestPt.v)}
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

        {hoveredIdx !== null &&
          (() => {
            const p = points[hoveredIdx];
            const cx = xScale(p.t);
            const cy = yScale(p.v);
            const wib = new Date(p.t + 7 * 3600 * 1000).toISOString();
            const timeLine = wib.slice(0, 10) + " " + wib.slice(11, 19);
            const valueLine = `${fmt(p.v)} L${p.flow !== null ? ` · ${fmt(p.flow)} L/min` : ""}`;
            const boxW = 220;
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
                  fill="#67e8f9"
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
