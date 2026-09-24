/** 警告三角アイコン（テーマカラー対応）。active=塗り、inactive=グレー輪郭 */
function WarnTriangle({ active }: { active: boolean }) {
  // 三角形の重心 y=(6+35+35)/3≈25.3
  return (
    <svg
      viewBox="0 0 40 40"
      width="11"
      height="11"
      aria-hidden="true"
      style={{ display: 'block', flexShrink: 0 }}
    >
      {active ? (
        <>
          <polygon
            points="20,6 37,35 3,35"
            fill="var(--accent)"
            stroke="var(--accent)"
            strokeWidth="7"
            strokeLinejoin="round"
          />
          <text
            x="20"
            y="25"
            textAnchor="middle"
            fontSize="22"
            fontWeight="900"
            fill="white"
            fontFamily="sans-serif"
            dominantBaseline="middle"
          >
            !
          </text>
        </>
      ) : (
        <>
          <polygon
            points="20,6 37,35 3,35"
            fill="none"
            stroke="#c8c8c8"
            strokeWidth="4"
            strokeLinejoin="round"
          />
          <text
            x="20"
            y="25"
            textAnchor="middle"
            fontSize="22"
            fontWeight="900"
            fill="#c8c8c8"
            fontFamily="sans-serif"
            dominantBaseline="middle"
          >
            !
          </text>
        </>
      )}
    </svg>
  );
}

/** 5段階の危険度アイコン列。value = 1〜5 */
export function RiskLevel({ value, max = 5 }: { value: number; max?: number }) {
  const filled = Math.round(Math.max(0, Math.min(max, value)));
  return (
    <span
      className="risk-level"
      aria-label={`危険度${filled}/${max}`}
      style={{ display: 'flex', gap: 3, alignItems: 'center', flexShrink: 0 }}
    >
      {Array.from({ length: max }, (_, i) => (
        <WarnTriangle key={i} active={i < filled} />
      ))}
    </span>
  );
}
