/**
 * MapLibre GL JS の読み込み口。地図を使うコンポーネントはここから import する。
 *
 * v6 からワーカーが別ファイル（maplibre-gl-worker.mjs）になり、既定では
 * ライブラリ本体と同じ場所から読み込もうとする。Vite でまとめると本体の場所が
 * 変わって読み込めなくなるため、ワーカーをアセットとして出力し、その URL を渡す。
 */
import * as maplibregl from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';

maplibregl.setWorkerUrl(workerUrl);

export default maplibregl;
