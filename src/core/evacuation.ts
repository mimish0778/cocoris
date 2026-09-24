import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';

import { PolygonIndex } from './spatial';

/**
 * 「結局どこへ逃げればいいのか」に、東京都の公式指定で答える。
 *
 * ⚠️ **最寄りの避難場所を計算してはいけない。**
 * 東京都は町丁目・町会単位で避難場所を1箇所ずつ割り当てている
 * （避難距離3km未満、輻射熱を考慮して避難計画人口1人あたり1㎡以上を確保する前提の計画）。
 * 最寄りとは限らない。
 *
 * さらに**地区内残留地区**がある。不燃化が進み広域避難そのものが不要な区域で、
 * 23区の面積の約19%を占める（渋谷・丸の内などが該当）。
 * ここで「最寄りへ逃げてください」と出すのは誤った指示になる。
 *
 * なお国土地理院「指定緊急避難場所」の災害種別◎は
 * 「その場所自体が輻射熱の影響を受けない」という意味であって
 * 「そこへ行くべき」ではない。混同しないこと。
 */

export interface EvacuationArea {
  /** 避難場所NO。301〜340 は地区内残留地区 */
  no: number;
  name: string;
  /** true なら広域避難が不要（地区内残留地区） */
  stay: boolean;
}

export interface EvacuationSite {
  no: number;
  name: string;
  /** 代表点。経路の目的地に使う */
  lat: number;
  lng: number;
}

export interface EvacuationData {
  source: string;
  designation: string;
  note: string;
  areas: FeatureCollection<Polygon | MultiPolygon, EvacuationArea>;
  sites: FeatureCollection<Polygon | MultiPolygon, EvacuationSite>;
}

/** 座標に対する答え。3通りしかない */
export type EvacuationAnswer =
  | { kind: 'stay'; areaName: string }
  | { kind: 'evacuate'; site: EvacuationSite; distanceM: number }
  | { kind: 'unknown' };

const EARTH_R = 6378137;

function distanceM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const latRad = ((aLat + bLat) / 2) * (Math.PI / 180);
  const dx = (bLng - aLng) * (Math.PI / 180) * Math.cos(latRad) * EARTH_R;
  const dy = (bLat - aLat) * (Math.PI / 180) * EARTH_R;
  return Math.hypot(dx, dy);
}

export class EvacuationIndex {
  private areas: PolygonIndex<EvacuationArea>;
  private byNo = new Map<number, EvacuationSite>();
  readonly meta: { source: string; designation: string; note: string };
  readonly sites: FeatureCollection<Polygon | MultiPolygon, EvacuationSite>;

  constructor(data: EvacuationData) {
    this.areas = new PolygonIndex(data.areas);
    this.sites = data.sites;
    for (const f of data.sites.features) this.byNo.set(f.properties.no, f.properties);
    this.meta = { source: data.source, designation: data.designation, note: data.note };
  }

  /**
   * 座標に対して「逃げなくてよい」「ここへ逃げる」「対象外」のいずれかを返す。
   *
   * 対象は区部が中心で、多摩地域は指定の対象外なので unknown になる。
   */
  lookup(lat: number, lng: number): EvacuationAnswer {
    const area = this.areas.lookup(lat, lng);
    if (!area) return { kind: 'unknown' };
    if (area.stay) return { kind: 'stay', areaName: area.name };

    const site = this.byNo.get(area.no);
    if (!site) return { kind: 'unknown' };
    return { kind: 'evacuate', site, distanceM: distanceM(lat, lng, site.lat, site.lng) };
  }
}

let cached: Promise<EvacuationIndex | null> | null = null;

/**
 * 避難データは無くてもランキングは成立するので、失敗しても null を返す。
 */
export function loadEvacuation(url = '/data/evacuation.json'): Promise<EvacuationIndex | null> {
  if (!cached) {
    cached = fetch(url)
      .then((r) => (r.ok ? (r.json() as Promise<EvacuationData>) : null))
      .then((d) => (d ? new EvacuationIndex(d) : null))
      .catch(() => {
        cached = null;
        return null;
      });
  }
  return cached;
}

/** 徒歩の所要時間の目安。分速80mは不動産表示の慣行値 */
export function walkMinutes(distanceM: number): number {
  return Math.max(1, Math.round(distanceM / 80));
}
