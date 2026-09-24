import type { StayPoint } from './types';

/**
 * 手動で登録した場所（handoff §3 の入力経路②）。
 *
 * タイムラインが使えない人のための経路。実際、Googleは移動と滞在の分解に失敗することがある
 * （20.4kmの移動が10.6時間の activity 1件にまとまり、その間の滞在が消えた例を実測している）。
 * そういう取りこぼしを人手で補えるようにしておく。
 *
 * 住所検索は使わない。ジオコーディングAPIに住所を投げること自体が位置情報の送信になり、
 * 「位置情報は端末から出ない」が崩れるため。位置は地図をタップして選ぶ。
 */
export interface ManualPlace {
  id: string;
  name: string;
  lat: number;
  lng: number;
  /** 0=日 … 6=土 */
  days: number[];
  /** 0-23。endHour < startHour なら翌日にまたぐ */
  startHour: number;
  endHour: number;
}

/** 手動登録から滞在を作るときに遡る週数。指数減衰の半減期14日に対して十分 */
export const MANUAL_WEEKS = 4;

export function manualPlaceMinutes(p: ManualPlace): number {
  const span = p.endHour > p.startHour ? p.endHour - p.startHour : 24 - p.startHour + p.endHour;
  return span * 60;
}

/**
 * 「毎週この曜日のこの時間帯にいる」という登録を、過去 weeks 週分の滞在に展開する。
 *
 * タイムラインから来た滞在と同じ StayPoint に落とすので、以降の処理は経路を区別しない。
 */
export function expandManualPlaces(
  places: ManualPlace[],
  now: Date,
  weeks = MANUAL_WEEKS,
): StayPoint[] {
  const stays: StayPoint[] = [];

  for (const p of places) {
    if (p.days.length === 0) continue;
    // startHour === endHour は「24時間」なのか「一瞬」なのか決まらない。登録側で弾く
    if (p.startHour === p.endHour) continue;

    const minutes = manualPlaceMinutes(p);

    for (let back = weeks * 7; back >= 0; back--) {
      const day = new Date(now);
      day.setDate(day.getDate() - back);
      day.setHours(0, 0, 0, 0);
      if (!p.days.includes(day.getDay())) continue;

      const start = new Date(day);
      start.setHours(p.startHour, 0, 0, 0);
      const end = new Date(start.getTime() + minutes * 60000);
      if (start >= now) continue;

      stays.push({
        id: `manual-${p.id}-${back}`,
        name: p.name,
        lat: p.lat,
        lng: p.lng,
        startTime: start,
        // 未来にはみ出す分は切る。今日の予定を先取りして数えない
        endTime: end > now ? now : end,
      });
    }
  }
  return stays;
}

/** 入力の妥当性。UIのエラー表示に使う */
export function validateManualPlace(p: Partial<ManualPlace>): string | null {
  if (!p.name?.trim()) return '場所の名前を入れてください。';
  if (p.lat == null || p.lng == null) return '地図をタップして位置を選んでください。';
  if (!p.days?.length) return '曜日を1つ以上選んでください。';
  if (p.startHour == null || p.endHour == null) return '時間帯を選んでください。';
  if (p.startHour === p.endHour) return '開始と終了の時刻を別にしてください。';
  return null;
}
