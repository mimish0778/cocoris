import maplibregl from 'maplibre-gl';
import { useEffect, useRef, useState } from 'react';

import type { ChoChomeIndex } from '../core/chochome';
import type { EvacuationAnswer, EvacuationIndex, EvacuationSite } from '../core/evacuation';
import { TOTAL_CHOCHOME } from '../core/scoring';
import type { SurveyData } from './storage';

const ORS_TOKEN: string | undefined = import.meta.env.VITE_ORS_TOKEN;

/** 開発者モード用の仮置き座標（東京・上野） */
const DEV_POS = { lat: 35.7130, lng: 139.7770 };

type GeoState =
  | { kind: 'pending' }
  | { kind: 'ok'; lat: number; lng: number }
  | { kind: 'denied' }
  | { kind: 'error'; msg: string };

type RouteState =
  | { kind: 'none' }
  | { kind: 'straight'; distanceM: number }
  | { kind: 'ok'; meters: number; minutes: number };

export function MapHome({
  index,
  evacuation,
  surveyData,
  devMode,
}: {
  index: ChoChomeIndex | null;
  evacuation: EvacuationIndex | null;
  surveyData: SurveyData;
  devMode: boolean;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const destMarkerRef = useRef<maplibregl.Marker | null>(null);
  const [geo, setGeo] = useState<GeoState>({ kind: 'pending' });
  const [ready, setReady] = useState(false);
  const [filterNursing, setFilterNursing] = useState(false);
  const [filterAllergy, setFilterAllergy] = useState(false);
  const [filterBed, setFilterBed] = useState(false);
  const [routeState, setRouteState] = useState<RouteState>({ kind: 'none' });

  // 地図初期化
  useEffect(() => {
    if (!container.current || map.current) return;
    const m = new maplibregl.Map({
      container: container.current,
      center: [139.6917, 35.6895],
      zoom: 11,
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
          chochome: {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
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
              'fill-opacity': 0.4,
            },
          },
          {
            id: 'route-halo',
            type: 'line',
            source: 'route',
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: { 'line-color': '#ffffff', 'line-width': 8, 'line-opacity': 0.85 },
          },
          {
            id: 'route',
            type: 'line',
            source: 'route',
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: {
              'line-color': '#c2185b',
              'line-width': 4,
              'line-dasharray': ORS_TOKEN ? [1, 0] : [2, 1.6],
            },
          },
        ],
      },
    });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    m.on('load', () => setReady(true));
    map.current = m;
    return () => {
      setReady(false);
      markerRef.current?.remove();
      destMarkerRef.current?.remove();
      m.remove();
      map.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // chochome index 更新
  useEffect(() => {
    if (!ready || !map.current || !index) return;
    (map.current.getSource('chochome') as maplibregl.GeoJSONSource)?.setData(index.featureCollection);
  }, [ready, index]);

  // 位置情報取得
  useEffect(() => {
    if (devMode) {
      setGeo({ kind: 'ok', lat: DEV_POS.lat, lng: DEV_POS.lng });
      return;
    }
    if (!navigator.geolocation) {
      setGeo({ kind: 'error', msg: 'このブラウザは位置情報に対応していません' });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setGeo({ kind: 'ok', lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => setGeo(err.code === err.PERMISSION_DENIED ? { kind: 'denied' } : { kind: 'error', msg: err.message }),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }, [devMode]);

  // 現在地ピン
  useEffect(() => {
    const m = map.current;
    if (!m || !ready || geo.kind !== 'ok') return;
    const { lat, lng } = geo;
    markerRef.current?.remove();
    const el = document.createElement('div');
    el.className = 'home-pin';
    el.innerHTML = '<div class="home-pin__pulse"></div><div class="home-pin__dot"></div>';
    markerRef.current = new maplibregl.Marker({ element: el, anchor: 'center' })
      .setLngLat([lng, lat]).addTo(m);
    m.flyTo({ center: [lng, lat], zoom: 14, duration: 800 });
  }, [ready, geo]);

  const answer = geo.kind === 'ok' && evacuation
    ? evacuation.lookup(geo.lat, geo.lng)
    : null;

  const dest = answer?.kind === 'evacuate' ? answer.site : null;

  // 避難所ピン・画角
  useEffect(() => {
    const m = map.current;
    if (!m || !ready || geo.kind !== 'ok') return;
    destMarkerRef.current?.remove();
    destMarkerRef.current = null;
    if (!dest) return;

    const el = document.createElement('div');
    el.className = 'pin';
    el.innerHTML = '<span class="pin__dot pin__dot--dest"></span><span class="pin__label"></span>';
    el.querySelector('.pin__label')!.textContent = dest.name;
    destMarkerRef.current = new maplibregl.Marker({ element: el, anchor: 'bottom' })
      .setLngLat([dest.lng, dest.lat]).addTo(m);

    m.fitBounds(
      [[Math.min(geo.lng, dest.lng) - 0.002, Math.min(geo.lat, dest.lat) - 0.002],
       [Math.max(geo.lng, dest.lng) + 0.002, Math.max(geo.lat, dest.lat) + 0.002]],
      { padding: 60, maxZoom: 16, duration: 600 },
    );
  }, [ready, geo, dest]); // eslint-disable-line react-hooks/exhaustive-deps

  // 経路（徒歩のみ）
  useEffect(() => {
    const m = map.current;
    if (!m || !ready || geo.kind !== 'ok') return;
    const src = m.getSource('route') as maplibregl.GeoJSONSource | undefined;
    if (!src) return;

    if (!dest) {
      src.setData({ type: 'FeatureCollection', features: [] });
      setRouteState({ kind: 'none' });
      return;
    }

    const { lat, lng } = geo;
    // まず直線でフォールバック表示
    src.setData({
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: [[lng, lat], [dest.lng, dest.lat]] },
        properties: {},
      }],
    });
    setRouteState({ kind: 'straight', distanceM: answer?.kind === 'evacuate' ? answer.distanceM : 0 });

    if (!ORS_TOKEN) return;
    let cancelled = false;

    fetch('https://api.openrouteservice.org/v2/directions/foot-walking/geojson', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8', Authorization: ORS_TOKEN },
      body: JSON.stringify({ coordinates: [[lng, lat], [dest.lng, dest.lat]] }),
    })
      .then((r) => (r.ok ? r.json() : r.json().then((e) => Promise.reject(e))))
      .then((geojson: GeoRouteResponse) => {
        if (cancelled) return;
        const feature = geojson.features?.[0];
        const summary = feature?.properties?.summary;
        if (!feature || !summary) return;
        src.setData({ type: 'FeatureCollection', features: [feature] });
        setRouteState({ kind: 'ok', meters: Math.round(summary.distance), minutes: Math.max(1, Math.round(summary.duration / 60)) });
      })
      .catch((e: unknown) => { console.error('[maphome] ORS failed', e); });

    return () => { cancelled = true; };
  }, [ready, geo, dest]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="map-home">
      <div ref={container} className="map-home__map" />

      {/* フィルタトグル */}
      {dest && (
        <div className="map-home__controls">
          <div className="map-home__toggle-row">
            <ToggleChip active={filterNursing} onClick={() => setFilterNursing((v) => !v)}>
              授乳・おむつ替え
            </ToggleChip>
            <ToggleChip active={filterAllergy} onClick={() => setFilterAllergy((v) => !v)}>
              アレルギー対応食
            </ToggleChip>
            <ToggleChip active={filterBed} onClick={() => setFilterBed((v) => !v)}>
              簡易ベッド
            </ToggleChip>
          </div>
        </div>
      )}

      {/* 下部カード */}
      <div className="map-home__card">
        {geo.kind === 'pending' && (
          <div className="map-home__status">現在地を取得中…</div>
        )}
        {geo.kind === 'denied' && (
          <div className="map-home__status map-home__status--warn">
            位置情報の許可が必要です。ブラウザの設定から許可してください。
          </div>
        )}
        {geo.kind === 'error' && (
          <div className="map-home__status map-home__status--warn">{geo.msg}</div>
        )}
        {geo.kind === 'ok' && !answer && (
          <div className="map-home__status">避難場所データを読み込み中…</div>
        )}
        {geo.kind === 'ok' && answer && (
          <EvacuationBanner
            answer={answer}
            dest={dest}
            routeState={routeState}
            filterNursing={filterNursing}
            filterAllergy={filterAllergy}
            filterBed={filterBed}
            surveyData={surveyData}
            devMode={devMode}
          />
        )}
      </div>
    </div>
  );
}

function ToggleChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button className={`map-chip ${active ? 'map-chip--active' : ''}`} onClick={onClick}>
      {children}
    </button>
  );
}

function EvacuationBanner({
  answer, dest, routeState, filterNursing, filterAllergy, filterBed, surveyData, devMode,
}: {
  answer: EvacuationAnswer;
  dest: EvacuationSite | null;
  routeState: RouteState;
  filterNursing: boolean;
  filterAllergy: boolean;
  filterBed: boolean;
  surveyData: SurveyData;
  devMode: boolean;
}) {
  if (answer.kind === 'stay') {
    return (
      <div className="evacbanner evacbanner--stay">
        {devMode && <div className="evacbanner__dev-badge">開発者モード（仮置き位置）</div>}
        <div className="evacbanner__label">現在地の避難区分</div>
        <div className="evacbanner__main">この地区は逃げなくてよい</div>
        <div className="evacbanner__sub">{answer.areaName}（地区内残留地区）</div>
      </div>
    );
  }

  if (answer.kind === 'evacuate' && dest) {
    const survey = surveyData[dest.no] ?? null;
    const nursingOk = survey?.nursing ?? null;
    const allergyOk = survey?.allergy ?? null;
    const bedOk = survey?.bed ?? null;

    const nursingAlert = filterNursing && nursingOk !== true;
    const allergyAlert = filterAllergy && allergyOk !== true;
    const bedAlert = filterBed && bedOk !== true;
    const anyAlert = nursingAlert || allergyAlert || bedAlert;
    const anyFilterActive = filterNursing || filterAllergy || filterBed;
    const anyData = nursingOk !== null || allergyOk !== null || bedOk !== null;

    return (
      <div className="evacbanner evacbanner--go">
        {devMode && <div className="evacbanner__dev-badge">開発者モード（仮置き位置）</div>}
        <div className="evacbanner__label">現在地の避難場所</div>
        <div className="evacbanner__main">{dest.name}</div>
        <div className="evacbanner__route">
          {routeState.kind === 'ok'
            ? `徒歩で約${routeState.minutes}分（${routeState.meters.toLocaleString()}m）`
            : routeState.kind === 'straight'
            ? `直線 ${Math.round(routeState.distanceM).toLocaleString()}m`
            : '経路計算中…'}
        </div>

        {(anyData || anyFilterActive) && (
          <div className="evacbanner__amenities">
            {(nursingOk !== null || filterNursing) && (
              <AmenityBadge label="授乳・おむつ替え" value={nursingOk} alert={nursingAlert} />
            )}
            {(allergyOk !== null || filterAllergy) && (
              <AmenityBadge label="アレルギー対応食" value={allergyOk} alert={allergyAlert} />
            )}
            {(bedOk !== null || filterBed) && (
              <AmenityBadge label="簡易ベッド" value={bedOk} alert={bedAlert} />
            )}
          </div>
        )}

        {anyAlert && (
          <div className="evacbanner__alert">
            条件を満たす情報が未収集です。アンケートタブで情報を追加できます。
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="evacbanner">
      {devMode && <div className="evacbanner__dev-badge">開発者モード（仮置き位置）</div>}
      <div className="evacbanner__label">現在地の避難場所</div>
      <div className="evacbanner__main" style={{ color: 'var(--text-dim)', fontWeight: 400 }}>
        指定範囲外（都外・多摩地域）
      </div>
    </div>
  );
}

function AmenityBadge({ label, value, alert }: { label: string; value: boolean | null; alert: boolean }) {
  const cls = value === true ? 'amenity-badge--ok'
    : value === false ? 'amenity-badge--no'
    : 'amenity-badge--unknown';
  const prefix = value === true ? 'あり' : value === false ? 'なし' : '未調査';
  return (
    <span className={`amenity-badge ${cls} ${alert ? 'amenity-badge--alert' : ''}`}>
      {prefix} {label}
    </span>
  );
}

interface GeoRouteResponse {
  features?: {
    type: 'Feature';
    geometry: { type: 'LineString'; coordinates: [number, number][] };
    properties: { summary?: { distance: number; duration: number } };
  }[];
}
