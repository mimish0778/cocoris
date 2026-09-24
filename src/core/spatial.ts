import type { Feature, FeatureCollection, MultiPolygon, Polygon, Position } from 'geojson';

/**
 * 緯度経度からポリゴンを引くための索引。
 *
 * 町丁目（5,192件）と避難場所の割当区域（261件）で同じ仕組みを使う。
 * 総当たりでも動くが、滞在が数千件になると効いてくるので経度緯度のグリッドで候補を絞る。
 */

/** グリッドの1辺（度）。約1.1km */
const CELL = 0.01;

interface Entry<P> {
  props: P;
  geometry: Polygon | MultiPolygon;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function cellKey(ix: number, iy: number): string {
  return `${ix},${iy}`;
}

export class PolygonIndex<P> {
  private entries: Entry<P>[] = [];
  private grid = new Map<string, number[]>();

  constructor(fc: FeatureCollection<Polygon | MultiPolygon, P>) {
    for (const feature of fc.features) {
      const i = this.entries.push({
        props: feature.properties,
        geometry: feature.geometry,
        ...bbox(feature.geometry),
      }) - 1;
      const e = this.entries[i];

      for (let ix = Math.floor(e.minX / CELL); ix <= Math.floor(e.maxX / CELL); ix++) {
        for (let iy = Math.floor(e.minY / CELL); iy <= Math.floor(e.maxY / CELL); iy++) {
          const key = cellKey(ix, iy);
          const bucket = this.grid.get(key);
          if (bucket) bucket.push(i);
          else this.grid.set(key, [i]);
        }
      }
    }
  }

  get size(): number {
    return this.entries.length;
  }

  lookup(lat: number, lng: number): P | null {
    const bucket = this.grid.get(cellKey(Math.floor(lng / CELL), Math.floor(lat / CELL)));
    if (!bucket) return null;
    for (const i of bucket) {
      const e = this.entries[i];
      if (lng < e.minX || lng > e.maxX || lat < e.minY || lat > e.maxY) continue;
      if (pointInGeometry(lng, lat, e.geometry)) return e.props;
    }
    return null;
  }

  /** 元のフィーチャを取り出す。地図レイヤに渡すときに使う */
  toFeatures(): Feature<Polygon | MultiPolygon, P>[] {
    return this.entries.map((e) => ({
      type: 'Feature' as const,
      geometry: e.geometry,
      properties: e.props,
    }));
  }
}

function bbox(g: Polygon | MultiPolygon) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  for (const rings of polys) {
    for (const [x, y] of rings[0]) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return { minX, minY, maxX, maxY };
}

function pointInGeometry(x: number, y: number, g: Polygon | MultiPolygon): boolean {
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  return polys.some((rings) => pointInPolygon(x, y, rings));
}

/**
 * even-odd 判定。外環と穴を区別せず全リングを通せば、穴は自動的に外側になる。
 */
function pointInPolygon(x: number, y: number, rings: Position[][]): boolean {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
        inside = !inside;
      }
    }
  }
  return inside;
}
