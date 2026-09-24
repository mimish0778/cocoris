import type { StayPoint } from '../core/types';

/**
 * デモ用サンプルデータ。
 *
 * ペルソナ: 都内在住・生後6ヶ月の子を持つ親御さん。
 * 木密地域を含む荒川区在住。保育所・公園・小児科など育児に伴う行動パターン。
 *
 * 木密地域を意図的に選んでいる。ランキングが全部★2だとデモとして成立しないため。
 */

export type PersonaId = 'parent';

interface ScheduleEntry {
  name: string;
  lat: number;
  lng: number;
  /** 0=日 … 6=土 */
  days: number[];
  startHour: number;
  endHour: number;
  minutes?: number;
  probability?: number;
}

export interface Persona {
  id: PersonaId;
  label: string;
  description: string;
  schedule: ScheduleEntry[];
}

export const PERSONAS: Persona[] = [
  {
    id: 'parent',
    label: '乳幼児の親',
    description: '荒川区在住。子と一緒に毎日公園へ、週2で小児科や支援センターへ通う',
    schedule: [
      // 荒川区町屋1丁目。総合危険度 都内100位 / 火災ランク5 / 沖積低地 / 冬夕出火ランク4 → 危険度高
      { name: '自宅', lat: 35.7442, lng: 139.7826, days: [0, 1, 2, 3, 4, 5, 6], startHour: 21, endHour: 8 },
      // 近所の公園（毎日の散歩）荒川区西尾久 → 危険度高〜中
      { name: '近所の公園', lat: 35.7500, lng: 139.7730, days: [0, 1, 2, 3, 4, 5, 6], startHour: 10, endHour: 12, probability: 0.85 },
      // スーパー。北千住（足立区千住旭町）→ 危険度中
      { name: 'スーパー', lat: 35.7493, lng: 139.8047, days: [1, 3, 5], startHour: 14, endHour: 15, probability: 0.8 },
      // 子育て支援センター。文京区千石 → 台地・危険度低め
      { name: '区の子育て支援センター', lat: 35.7272, lng: 139.7406, days: [2, 4], startHour: 10, endHour: 12, probability: 0.75 },
      // 小児科。上野（台東区上野公園）→ 危険度中低
      { name: '小児科', lat: 35.7130, lng: 139.7770, days: [1, 4], startHour: 14, endHour: 16, probability: 0.4 },
    ],
  },
];

/** 再現性のある乱数。デモが毎回同じ絵になるようにする */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateSampleStays(personaId: PersonaId, now: Date, days = 45): StayPoint[] {
  const persona = PERSONAS.find((p) => p.id === personaId);
  if (!persona) throw new Error(`未知のペルソナ: ${personaId}`);

  const rand = mulberry32(20260823);
  const stays: StayPoint[] = [];
  let seq = 0;

  for (let back = days; back >= 0; back--) {
    const day = new Date(now);
    day.setDate(day.getDate() - back);
    day.setHours(0, 0, 0, 0);

    for (const e of persona.schedule) {
      if (!e.days.includes(day.getDay())) continue;
      if (rand() > (e.probability ?? 1)) continue;

      const start = new Date(day);
      start.setHours(e.startHour, Math.floor(rand() * 30), 0, 0);

      if (e.minutes == null && e.endHour === e.startHour) {
        throw new Error(`${e.name}: startHour と endHour が同じ場合は minutes を指定すること`);
      }
      const end = new Date(start);
      const spanMinutes =
        e.minutes ??
        (e.endHour > e.startHour ? e.endHour - e.startHour : 24 - e.startHour + e.endHour) * 60;
      const minutes = Math.max(5, spanMinutes + Math.floor(rand() * 40) - 20);
      end.setTime(start.getTime() + minutes * 60000);
      if (end > now) continue;

      stays.push({
        id: `${personaId}-${seq++}`,
        name: e.name,
        lat: e.lat + (rand() - 0.5) * 0.0007,
        lng: e.lng + (rand() - 0.5) * 0.0007,
        startTime: start,
        endTime: end,
      });
    }
  }
  return stays;
}
