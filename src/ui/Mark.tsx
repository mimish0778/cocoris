/**
 * ココリスのマーク（栗鼠）。
 *
 * 絵文字（🐿）は環境ごとに絵柄が変わり、仮置きに見えるので使わない。
 * 小さく表示しても栗鼠と分かるよう、巻いた尻尾を主役にしている。
 * 色は currentColor なので、置いた場所の文字色に追随する。
 */
export function Mark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 32 32"
      fill="none"
      role="img"
      aria-label="ココリス"
    >
      <path
        d="M12 28c-6.5-.5-9.5-6-8-11.5C5.3 11.6 9.5 8.8 13.6 9.8"
        stroke="currentColor"
        strokeWidth="4.6"
        strokeLinecap="round"
      />
      <path
        d="M14 28c-1.2-6.4 1-11.2 5.6-12.2 4.4-1 7.4 2.3 7.6 8 .1 2 0 3.4-.2 4.2z"
        fill="currentColor"
      />
      <circle cx="22.4" cy="9.6" r="5.1" fill="currentColor" />
      <path d="M19.6 5.2c-.5-2.3.2-3.4 2-2.2 1.1.8 1.6 1.7 1.4 2.6z" fill="currentColor" />
      <circle cx="24.3" cy="9.2" r="1.15" fill="var(--surface)" />
    </svg>
  );
}
