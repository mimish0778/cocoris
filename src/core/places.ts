import type { ChoChomeIndex } from './chochome';
import type { Place, StayPoint } from './types';

/**
 * 滞在の羅列を「場所」にまとめる。ランキングの単位は場所（handoff §6-2）。
 *
 * Googleタイムラインは既に訪問セグメントに整形されているので、ここでやるのは
 * 「同じスーパーへの5回の訪問」を1つの場所に束ねることだけ。滞在判定そのものは不要。
 */

/** 同一の場所とみなす半径（m）。handoff §6-1 の滞在定義に合わせる */
export const CLUSTER_RADIUS_M = 150;

/** 単発訪問を切り捨てる猶予（日）。これより新しい初訪問は残す */
const SINGLE_VISIT_GRACE_DAYS = 7;

const EARTH_R = 6378137;

/** 150m程度の判定にしか使わないので、平面近似で十分。 */
export function distanceM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const latRad = ((aLat + bLat) / 2) * (Math.PI / 180);
  const dx = (bLng - aLng) * (Math.PI / 180) * Math.cos(latRad) * EARTH_R;
  const dy = (bLat - aLat) * (Math.PI / 180) * EARTH_R;
  return Math.hypot(dx, dy);
}

export function durationMinutes(s: StayPoint): number {
  return (s.endTime.getTime() - s.startTime.getTime()) / 60000;
}

/**
 * 滞在を場所にクラスタリングする。
 *
 * 重心からの距離で貪欲に寄せるだけ。滞在数はせいぜい数千件なので総当たりで足りる。
 */
export function buildPlaces(stays: StayPoint[], index: ChoChomeIndex | null): Place[] {
  const clusters: { lat: number; lng: number; stays: StayPoint[] }[] = [];

  for (const stay of [...stays].sort((a, b) => a.startTime.getTime() - b.startTime.getTime())) {
    let best: (typeof clusters)[number] | null = null;
    let bestD = Infinity;
    for (const c of clusters) {
      const d = distanceM(c.lat, c.lng, stay.lat, stay.lng);
      if (d <= CLUSTER_RADIUS_M && d < bestD) {
        best = c;
        bestD = d;
      }
    }
    if (best) {
      best.stays.push(stay);
      // 重心を更新
      const n = best.stays.length;
      best.lat += (stay.lat - best.lat) / n;
      best.lng += (stay.lng - best.lng) / n;
    } else {
      clusters.push({ lat: stay.lat, lng: stay.lng, stays: [stay] });
    }
  }

  return clusters.map((c, i) => {
    const choChome = index ? index.lookup(c.lat, c.lng) : null;
    return {
      id: `place-${i}`,
      lat: c.lat,
      lng: c.lng,
      name: placeName(c.stays, choChome ? `${choChome.city}${choChome.town}` : '対象範囲外の場所'),
      stays: c.stays,
      choChome,
    };
  });
}

/** タイムラインが場所名を持っていればその最頻値、無ければ町丁目名で代用する。 */
function placeName(stays: StayPoint[], fallback: string): string {
  const counts = new Map<string, number>();
  for (const s of stays) {
    if (s.name) counts.set(s.name, (counts.get(s.name) ?? 0) + 1);
  }
  let name = fallback;
  let max = 0;
  for (const [n, c] of counts) {
    if (c > max) {
      name = n;
      max = c;
    }
  }
  return name;
}

/**
 * 生活圏ではないものを落とす（handoff §6-1）。
 *
 * 絞らないとランキング上位が通過点で埋まり、「生活圏」ではなく「移動経路」になる。
 * 「1回だけ3時間いた初訪問の店」を上位に出さないのはここの仕事で、
 * スコアリング側で無理に潰さない。
 */
export function filterLifeArea(places: Place[], now: Date): Place[] {
  const graceMs = SINGLE_VISIT_GRACE_DAYS * 24 * 60 * 60 * 1000;
  return places.filter((p) => {
    if (p.stays.length > 1) return true;
    const last = p.stays[p.stays.length - 1].endTime.getTime();
    return now.getTime() - last <= graceMs;
  });
}
