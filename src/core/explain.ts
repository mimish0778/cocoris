import { TOTAL_CHOCHOME } from './scoring';
import type { ChoChome, Season } from './types';

/** 現実の月から夏/冬を判定。12〜2月=冬、それ以外=夏 */
export function currentSeason(): Season {
  const m = new Date().getMonth() + 1;
  return m >= 11 || m <= 2 ? 'winterEve' : 'summerNoon';
}

export function seasonLabel(s: Season): string {
  return s === 'winterEve' ? '冬' : '夏';
}

/**
 * 「なぜ危険か」の1文要約。
 *
 * 絶対確率は出さない（handoff §6-5）。地域危険度は町丁目単位の相対評価なので、
 * 「倒壊確率37%」は根拠のない数字になる。言えるのは相対的な位置と、その理由だけ。
 *
 *   ❌ この建物の倒壊確率は37%です
 *   ✅ あなたの生活圏の中で、この場所が相対的に最も危険です（理由：…）
 *
 * 理由は建物属性と地盤分類の組み合わせをパターン分類して定型文にする。
 * 都自身が「揺れが増幅されやすい沖積低地等の地盤で、古い木造や軽量鉄骨造の建物が
 * 密集している地域」と説明しているので、その分解に沿わせる。
 */

/** 地盤分類を、揺れやすさの説明に変換する */
function groundPhrase(ground: string | null): string | null {
  if (!ground) return null;
  if (ground.startsWith('沖積低地')) return '揺れが増幅されやすい沖積低地';
  if (ground.startsWith('谷底低地')) return '揺れが増幅されやすい谷底低地';
  if (ground.startsWith('台地')) return '比較的揺れにくい台地';
  if (ground === '丘陵') return '比較的揺れにくい丘陵';
  if (ground === '山地') return '揺れにくい山地';
  return ground;
}

/** 都内順位を日本語の位置づけに変換する */
function positionPhrase(order: number, total = TOTAL_CHOCHOME): string {
  const pct = (order / total) * 100;
  if (pct <= 2) return '都内でも最上位';
  if (pct <= 10) return '都内上位10%';
  if (pct <= 25) return '都内上位25%';
  if (pct <= 50) return '都内で平均より高い';
  return '都内では低いほう';
}

export function explainRisk(c: ChoChome | null, season: Season): string {
  if (!c) return '東京都の地域危険度の対象範囲外のため、データがありません。都外か、都内の市街化区域外です。';

  const parts: string[] = [];
  const ground = groundPhrase(c.ground);
  const shukka = season === 'winterEve' ? c.shukkaWinterEve : c.shukkaSummerNoon;
  const seasonLabel = season === 'winterEve' ? '冬の夕方' : '夏の昼';

  const collapseHigh = c.collapseOrder / TOTAL_CHOCHOME <= 0.25;
  const fireHigh = c.fireOrder / TOTAL_CHOCHOME <= 0.25;

  if (collapseHigh && fireHigh) {
    parts.push(
      `${ground ?? 'この地盤'}に建物が密集し、倒壊と延焼の両方の危険量が${positionPhrase(c.totalOrder)}です`,
    );
  } else if (collapseHigh) {
    parts.push(`${ground ?? 'この地盤'}で、建物倒壊の危険量が${positionPhrase(c.collapseOrder)}です`);
  } else if (fireHigh) {
    parts.push(`建物が密集しており、延焼による火災の危険量が${positionPhrase(c.fireOrder)}です`);
  } else {
    parts.push(`${ground ?? 'この地盤'}で、建物倒壊・火災とも危険量は${positionPhrase(c.totalOrder)}水準です`);
  }

  if (shukka != null && shukka >= 4) {
    parts.push(`${seasonLabel}の出火危険度はランク${shukka}（5段階）と高めです`);
  }

  if (c.difficultyOrder / TOTAL_CHOCHOME <= 0.25) {
    parts.push('道路が狭く、消防や救急の活動が難しい地域です');
  }

  return parts.join('。') + '。';
}

/** 出火危険度が冬夕と夏昼でどれだけ違うかの一言。時間帯仮説の説明に使う */
export function explainSeasonGap(c: ChoChome | null): string | null {
  if (!c || c.shukkaWinterEve == null || c.shukkaSummerNoon == null) return null;
  const gap = c.shukkaWinterEve - c.shukkaSummerNoon;
  if (gap <= 0) return null;
  return `同じ場所でも、出火危険度は夏の昼はランク${c.shukkaSummerNoon}、冬の夕方はランク${c.shukkaWinterEve}。時間帯で${gap}段階変わります。`;
}
