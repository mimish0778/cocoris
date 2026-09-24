import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';

import { PolygonIndex } from './spatial';
import type { ChoChome } from './types';

/**
 * 座標 → 町丁目 の逆引き。
 *
 * ハザードデータ（gzip 約0.84MB）をクライアントに同梱しているので、この判定は
 * ブラウザ内で完結する。サーバーへ座標も町丁目コードも送らない。
 */
export class ChoChomeIndex {
  private index: PolygonIndex<ChoChome>;
  /** 地図レイヤがそのまま食えるように、元のFeatureCollectionを保持する */
  readonly featureCollection: FeatureCollection<Polygon | MultiPolygon, ChoChome>;

  constructor(fc: FeatureCollection<Polygon | MultiPolygon, ChoChome>) {
    this.featureCollection = fc;
    this.index = new PolygonIndex(fc);
  }

  get size(): number {
    return this.index.size;
  }

  /**
   * 緯度経度が属する町丁目を返す。
   * null になるのは、都外・都内の市街化区域外・海上。
   * この3つは矩形では区別できないので、呼び出し側では「対象範囲外」とだけ言うこと
   * （町田市が南へ張り出しているため、川崎市は東京都の外接矩形の内側に入る）。
   */
  lookup(lat: number, lng: number): ChoChome | null {
    return this.index.lookup(lat, lng);
  }

  covers(lat: number, lng: number): boolean {
    return this.index.lookup(lat, lng) !== null;
  }
}

let cached: Promise<ChoChomeIndex> | null = null;

/** アプリ起動時に1回だけ読む。以降は同じインスタンスを返す。 */
export function loadChoChomeIndex(url = '/data/chochome.json'): Promise<ChoChomeIndex> {
  if (!cached) {
    cached = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`町丁目データを読めませんでした: ${r.status}`);
        return r.json();
      })
      .then((fc) => new ChoChomeIndex(fc))
      // 失敗をキャッシュすると、以降のリトライが全て同じエラーを返してしまう
      .catch((e: unknown) => {
        cached = null;
        throw e;
      });
  }
  return cached;
}
