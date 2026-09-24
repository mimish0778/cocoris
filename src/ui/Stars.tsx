/**
 * ★の意味はアプリ全体で1種類に統一する（handoff §8）。
 * 行動側の★＝「あなたの中での相対値」、リスク側の★＝「都内5,192町丁目の中での相対値」。
 * 出自が違うので、並べるときは必ず見出しで区切ること。混ぜると★4の意味が2種類になる。
 *
 * 文字の「★」は使わない。フォント依存で字面と大きさが揃わず、未装飾に見えるため。
 */

const STAR_PATH =
  'M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.4 6.2 20.5l1.1-6.5L2.6 9.4l6.5-.9L12 2.6z';

export function Stars({ value, label }: { value: number; label?: string }) {
  const n = Math.min(5, Math.max(1, Math.round(value)));
  return (
    <span className="stars" role="img" aria-label={label ? `${label} ${n}／5` : `${n}／5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <svg key={i} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path className={i <= n ? 'stars__on' : 'stars__off'} d={STAR_PATH} />
        </svg>
      ))}
    </span>
  );
}
