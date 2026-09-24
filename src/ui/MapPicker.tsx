import maplibregl from 'maplibre-gl';
import { useEffect, useRef } from 'react';

import type { ChoChomeIndex } from '../core/chochome';

/**
 * 位置を地図から選ぶ。
 *
 * 住所検索は使わない。ジオコーディングAPIに住所を投げること自体が位置情報の送信になり、
 * 「位置情報は端末から出ない」が崩れるため。タップで選べば通信は地図タイルだけで済む。
 *
 * ハザードの塗りも出す。選びながら「このあたりは赤い」と分かるほうが意味がある。
 */
export function MapPicker({
  index,
  value,
  onPick,
}: {
  index: ChoChomeIndex | null;
  value: { lat: number; lng: number } | null;
  onPick: (lat: number, lng: number) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const marker = useRef<maplibregl.Marker | null>(null);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  useEffect(() => {
    if (!container.current || !index || map.current) return;

    const m = new maplibregl.Map({
      container: container.current,
      center: value ? [value.lng, value.lat] : [139.7671, 35.6812],
      zoom: value ? 14 : 10,
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
              '<a href="https://maps.gsi.go.jp/development/ichiran.html">地理院タイル</a>｜地域危険度: 東京都（CC BY 4.0）を加工',
          },
          chochome: { type: 'geojson', data: index.featureCollection },
        },
        layers: [
          { id: 'bg', type: 'background', paint: { 'background-color': '#eceae7' } },
          { id: 'gsi', type: 'raster', source: 'gsi' },
          {
            id: 'hazard-fill',
            type: 'fill',
            source: 'chochome',
            paint: {
              'fill-color': [
                'interpolate', ['linear'], ['/', ['get', 'totalOrder'], 5192],
                0, '#b2372c', 0.05, '#d1662f', 0.15, '#d99a3e', 0.35, '#b0b04e', 1, '#6aa06a',
              ],
              'fill-opacity': 0.4,
            },
          },
        ],
      },
    });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    m.on('error', (e) => console.error('[picker]', e.error));
    m.on('click', (e) => onPickRef.current(e.lngLat.lat, e.lngLat.lng));

    map.current = m;
    return () => {
      marker.current = null;
      m.remove();
      map.current = null;
    };
  }, [index]); // eslint-disable-line react-hooks/exhaustive-deps

  // 選択位置のピン
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (!value) {
      marker.current?.remove();
      marker.current = null;
      return;
    }
    if (!marker.current) {
      const el = document.createElement('div');
      el.className = 'pin';
      el.innerHTML = '<span class="pin__dot"></span>';
      marker.current = new maplibregl.Marker({ element: el, anchor: 'bottom' });
    }
    marker.current.setLngLat([value.lng, value.lat]).addTo(m);
  }, [value]);

  return <div ref={container} className="map map--picker" />;
}
