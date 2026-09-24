import maplibregl from 'maplibre-gl';
import { useEffect, useRef, useState } from 'react';

import type { ChoChomeIndex } from '../core/chochome';
import type { EvacuationAnswer, EvacuationIndex } from '../core/evacuation';
import { TOTAL_CHOCHOME } from '../core/scoring';

/**
 * 詳細画面の上部に出す地図。「結局どう避難するのか」を一目で示すのが役目。
 *
 * 出すものを絞る。ハザードの塗り・現在地・避難場所・そこまでの経路だけ。
 * レイヤの選択肢は置かない。「何を見ればいいのか分からない」を再生産しないため。
 */

/**
 * OpenRouteService の鍵。無ければ直線にフォールバックする。
 *
 * Mapbox ではなく ORS を使う。Mapbox はトークン発行にクレジットカード登録が必須だが、
 * ORS（HeiGIT運営、非営利）はメールアドレスだけで無料枠（1日2,500件）が使える。
 * カードを登録していないので、鍵が漏れても金銭被害が発生しない。
 */
const ORS_TOKEN: string | undefined = import.meta.env.VITE_ORS_TOKEN;

type RouteState =
  | { kind: 'none' }
  | { kind: 'straight' }
  | { kind: 'walking'; meters: number; minutes: number };

export function EvacuationMap({
  index,
  evacuation,
  lat,
  lng,
  answer,
  onRouteState,
}: {
  index: ChoChomeIndex | null;
  evacuation: EvacuationIndex | null;
  lat: number;
  lng: number;
  answer: EvacuationAnswer;
  onRouteState?: (s: RouteState) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markers = useRef<maplibregl.Marker[]>([]);
  const [ready, setReady] = useState(false);

  const dest = answer.kind === 'evacuate' ? answer.site : null;

  useEffect(() => {
    if (!container.current || !index || map.current) return;

    const m = new maplibregl.Map({
      container: container.current,
      center: [lng, lat],
      zoom: 14,
      attributionControl: { compact: true },
      style: {
        version: 8,
        sources: {
          gsi: {
            type: 'raster',
            tiles: ['https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png'],
            tileSize: 256,
            maxzoom: 18,
            attribution:
              '<a href="https://maps.gsi.go.jp/development/ichiran.html">地理院タイル</a>｜地域危険度: 東京都（CC BY 4.0）を加工｜避難場所: 東京都（CC BY 4.0）' +
              (ORS_TOKEN
                ? '｜経路: <a href="https://openrouteservice.org/">openrouteservice</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                : ''),
          },
          chochome: { type: 'geojson', data: index.featureCollection },
          sites: {
            type: 'geojson',
            data: evacuation?.sites ?? { type: 'FeatureCollection', features: [] },
          },
          route: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
        },
        layers: [
          { id: 'bg', type: 'background', paint: { 'background-color': '#eceae7' } },
          { id: 'gsi', type: 'raster', source: 'gsi' },
          {
            id: 'hazard',
            type: 'fill',
            source: 'chochome',
            paint: {
              'fill-color': [
                'interpolate', ['linear'], ['/', ['get', 'totalOrder'], TOTAL_CHOCHOME],
                0, '#b2372c', 0.05, '#d1662f', 0.15, '#d99a3e', 0.35, '#b0b04e', 1, '#6aa06a',
              ],
              'fill-opacity': 0.45,
            },
          },
          {
            id: 'site-area',
            type: 'fill',
            source: 'sites',
            paint: { 'fill-color': '#1d6fd0', 'fill-opacity': 0.35 },
          },
          {
            id: 'site-line',
            type: 'line',
            source: 'sites',
            paint: { 'line-color': '#12467f', 'line-width': 1.5 },
          },
          {
            id: 'route-halo',
            type: 'line',
            source: 'route',
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: { 'line-color': '#ffffff', 'line-width': 8, 'line-opacity': 0.9 },
          },
          {
            id: 'route',
            type: 'line',
            source: 'route',
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: {
              'line-color': '#12467f',
              'line-width': 4,
              // 鍵が無いときは点線にして、道なりではないことを見た目でも示す
              'line-dasharray': ORS_TOKEN ? [1, 0] : [2, 1.6],
            },
          },
        ],
      },
    });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    m.on('error', (e) => console.error('[evacmap]', e.error));
    m.on('load', () => setReady(true));

    map.current = m;
    return () => {
      setReady(false);
      for (const mk of markers.current) mk.remove();
      markers.current = [];
      m.remove();
      map.current = null;
    };
  }, [index, evacuation]); // eslint-disable-line react-hooks/exhaustive-deps

  // 現在地と避難場所のピン、および画角
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;

    for (const mk of markers.current) mk.remove();
    markers.current = [];

    const pin = (className: string, label: string, plat: number, plng: number) => {
      const el = document.createElement('div');
      el.className = 'pin';
      el.innerHTML = `<span class="${className}"></span><span class="pin__label"></span>`;
      el.querySelector('.pin__label')!.textContent = label;
      markers.current.push(
        new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([plng, plat]).addTo(m),
      );
    };

    pin('pin__dot', 'この場所', lat, lng);
    if (dest) {
      pin('pin__dot pin__dot--dest', dest.name, dest.lat, dest.lng);
      m.fitBounds(
        [
          [Math.min(lng, dest.lng), Math.min(lat, dest.lat)],
          [Math.max(lng, dest.lng), Math.max(lat, dest.lat)],
        ],
        { padding: 56, maxZoom: 16, duration: 0 },
      );
    } else {
      m.jumpTo({ center: [lng, lat], zoom: 15 });
    }
  }, [ready, lat, lng, dest]);

  // 経路。鍵があれば道なり、無ければ直線
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    const src = m.getSource('route') as maplibregl.GeoJSONSource | undefined;
    if (!src) return;

    if (!dest) {
      src.setData({ type: 'FeatureCollection', features: [] });
      onRouteState?.({ kind: 'none' });
      return;
    }

    const straight = {
      type: 'FeatureCollection' as const,
      features: [
        {
          type: 'Feature' as const,
          geometry: {
            type: 'LineString' as const,
            coordinates: [
              [lng, lat],
              [dest.lng, dest.lat],
            ],
          },
          properties: {},
        },
      ],
    };
    src.setData(straight);
    onRouteState?.({ kind: 'straight' });

    if (!ORS_TOKEN) return;

    let cancelled = false;

    // openrouteservice は api.heigit.org への統合を告知しているが、実測時点で
    // /v2/directions/foot-walking/geojson は 404 だった（旧URLは正常応答）。
    // 移行が完了していないと見て、確認できている旧URLを使う。
    fetch('https://api.openrouteservice.org/v2/directions/foot-walking/geojson', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Authorization: ORS_TOKEN,
      },
      body: JSON.stringify({
        // ORS は [経度, 緯度] の順
        coordinates: [
          [lng, lat],
          [dest.lng, dest.lat],
        ],
      }),
    })
      .then((r) => (r.ok ? r.json() : r.json().then((e) => Promise.reject(e))))
      .then((geojson: GeoRouteResponse) => {
        if (cancelled) return;
        const feature = geojson.features?.[0];
        // properties = { segments, way_points, summary } という並び。実測して確認済み
        const summary = feature?.properties?.summary;
        if (!feature || !summary) return;

        src.setData({ type: 'FeatureCollection', features: [feature] });
        onRouteState?.({
          kind: 'walking',
          meters: Math.round(summary.distance),
          minutes: Math.max(1, Math.round(summary.duration / 60)),
        });
      })
      .catch((e: unknown) => {
        // 経路が取れなくても直線は既に出ている。上限超過やネットワークエラーで落ちても致命的にしない
        console.error('[evacmap] ORS directions failed', e);
      });

    return () => {
      cancelled = true;
    };
  }, [ready, lat, lng, dest]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={container} className="map map--evac" />;
}

/** openrouteservice /v2/directions/{profile}/geojson のレスポンス形（実測して確認済み。使う分だけ） */
interface GeoRouteResponse {
  features?: {
    type: 'Feature';
    geometry: { type: 'LineString'; coordinates: [number, number][] };
    properties: { summary?: { distance: number; duration: number } };
  }[];
}

export const HAS_ORS_TOKEN = Boolean(ORS_TOKEN);
export type { RouteState };
