/**
 * 時間減衰。
 *
 * 「過去30日窓」は使わない。31日目に突然ランキングから消えて唐突だし、
 * 「30日前の1回」と「昨日の1回」が同じ重みなのも直感に反する（handoff §6-3）。
 *
 * 指数減衰なら、引っ越しや転職に自動で追随する。新居は約2週間で旧居を追い抜く。
 */

/** 半減期（日） */
export const HALF_LIFE_DAYS = 14;

/** これ以下の重みは無視してよい。データ保持期間の根拠にもなる */
export const NEGLIGIBLE_WEIGHT = 0.01;

/** 重みが NEGLIGIBLE_WEIGHT を下回るまでの日数。約93日 */
export const RETENTION_DAYS = Math.ceil(HALF_LIFE_DAYS * Math.log2(1 / NEGLIGIBLE_WEIGHT));

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** 経過日数に対する重み。0日=1.00 / 14日=0.50 / 30日=0.23 / 60日=0.05 */
export function decayWeight(daysAgo: number, halfLife = HALF_LIFE_DAYS): number {
  if (daysAgo <= 0) return 1;
  return Math.pow(0.5, daysAgo / halfLife);
}

export function daysBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / MS_PER_DAY;
}

/** 日時に対する重み。未来の日時は 1 として扱う */
export function weightAt(when: Date, now: Date, halfLife = HALF_LIFE_DAYS): number {
  return decayWeight(daysBetween(when, now), halfLife);
}
