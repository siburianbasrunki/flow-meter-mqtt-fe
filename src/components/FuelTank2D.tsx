interface FuelTank2DProps {
  fillLevel: number; // 0–1
  isReceiving?: boolean;
  size?: number; // width in px
}

export default function FuelTank2D({
  fillLevel,
  isReceiving,
  size = 140,
}: FuelTank2DProps) {
  const W = size;
  const H = size * 1.3;
  const rx = size * 0.1; // corner radius
  const cap = size * 0.12; // cap width
  const capH = size * 0.06; // cap height
  const border = 3;

  // tank inner area
  const tx = border;
  const ty = capH + border;
  const tw = W - border * 2;
  const th = H - capH - border * 2;

  // fill height (bottom-up)
  const fillH = th * Math.max(0, Math.min(1, fillLevel));
  const fillY = ty + th - fillH;
  const pct = Math.round(fillLevel * 100);

  // water color: orange-amber for fuel
  const waterColor = "#4a90d9";
  const waterColorDark = "#2563eb";

  return (
    <svg
      width={W}
      height={H + capH}
      viewBox={`0 0 ${W} ${H + capH}`}
      style={{ display: "block", overflow: "visible" }}
    >
      <defs>
        {/* Clip to tank inner area */}
        <clipPath id={`tank-clip-${size}`}>
          <rect x={tx} y={ty} width={tw} height={th} rx={rx} ry={rx} />
        </clipPath>

        {/* Gradient for water */}
        <linearGradient id={`water-grad-${size}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={waterColor} />
          <stop offset="100%" stopColor={waterColorDark} />
        </linearGradient>

        {/* Overlay gradient (glass effect) */}
        <linearGradient id={`glass-grad-${size}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="white" stopOpacity="0.18" />
          <stop offset="40%" stopColor="white" stopOpacity="0.05" />
          <stop offset="100%" stopColor="white" stopOpacity="0.0" />
        </linearGradient>
      </defs>

      {/* Cap (top nozzle) */}
      <rect
        x={(W - cap) / 2}
        y={0}
        width={cap}
        height={capH + rx}
        rx={rx * 0.4}
        fill="#c8cdd6"
      />

      {/* Tank body background (empty/air) */}
      <rect
        x={tx}
        y={ty}
        width={tw}
        height={th}
        rx={rx}
        ry={rx}
        fill="#e8edf5"
        stroke="#c8cdd6"
        strokeWidth={border}
      />

      {/* Water fill group (clipped to tank) */}
      <g clipPath={`url(#tank-clip-${size})`}>
        {/* Solid water fill */}
        <rect
          x={tx}
          y={fillY}
          width={tw}
          height={fillH}
          fill={`url(#water-grad-${size})`}
          style={{ transition: "y 1.2s ease, height 1.2s ease" }}
        />

        {/* Wave on top of water */}
        {fillLevel > 0.02 && (
          <g
            style={{
              transform: `translateY(${fillY - 10}px)`,
              transition: "transform 1.2s ease",
            }}
          >
            <svg
              x={0}
              y={0}
              width={tw + tx * 2}
              height={20}
              viewBox={`0 0 ${tw} 20`}
              overflow="visible"
            >
              <path
                fill={waterColor}
                opacity="0.85"
                d={`M0,10 C${tw * 0.15},0 ${tw * 0.35},20 ${tw * 0.5},10 C${tw * 0.65},0 ${tw * 0.85},20 ${tw},10 L${tw},20 L0,20 Z`}
              >
                <animateTransform
                  attributeName="transform"
                  type="translate"
                  from={`-${tw} 0`}
                  to={`0 0`}
                  dur="2.5s"
                  repeatCount="indefinite"
                />
              </path>
              <path
                fill={waterColorDark}
                opacity="0.5"
                d={`M0,12 C${tw * 0.2},2 ${tw * 0.4},22 ${tw * 0.6},12 C${tw * 0.8},2 ${tw},18 ${tw},12 L${tw},20 L0,20 Z`}
              >
                <animateTransform
                  attributeName="transform"
                  type="translate"
                  from={`0 0`}
                  to={`${tw} 0`}
                  dur="3.2s"
                  repeatCount="indefinite"
                />
              </path>
            </svg>
          </g>
        )}

        {/* Glass highlight */}
        <rect
          x={tx}
          y={ty}
          width={tw * 0.45}
          height={th}
          fill={`url(#glass-grad-${size})`}
        />
      </g>

      {/* Tank border (drawn on top) */}
      <rect
        x={tx}
        y={ty}
        width={tw}
        height={th}
        rx={rx}
        ry={rx}
        fill="none"
        stroke="#b0b8c9"
        strokeWidth={border}
      />

      {/* Tick marks (right side) */}
      {[0.25, 0.5, 0.75].map((t) => (
        <line
          key={t}
          x1={tx + tw - 10}
          y1={ty + th * (1 - t)}
          x2={tx + tw - 3}
          y2={ty + th * (1 - t)}
          stroke="#b0b8c9"
          strokeWidth={1.5}
        />
      ))}

      {/* Percentage text */}
      <text
        x={W / 2}
        y={fillLevel > 0.45 ? fillY + fillH / 2 + 7 : ty + th / 2 + 7}
        textAnchor="middle"
        fontSize={size * 0.18}
        fontWeight="700"
        fontFamily="Inter, system-ui, sans-serif"
        fill={fillLevel > 0.45 ? "white" : "#4a90d9"}
        style={{ transition: "y 1.2s ease" }}
      >
        {pct}%
      </text>

      {/* Receiving pulse dot */}
      {isReceiving && (
        <circle cx={tx + tw - 12} cy={ty + 12} r={5} fill="#22c55e">
          <animate
            attributeName="opacity"
            values="1;0.2;1"
            dur="0.8s"
            repeatCount="indefinite"
          />
        </circle>
      )}
    </svg>
  );
}
