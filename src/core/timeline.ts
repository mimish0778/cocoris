import type { StayPoint } from './types';

/**
 * Googleタイムラインのインポート。
 *
 * 2025年6月9日までに保存先がクラウドから端末内へ移行し、Web版タイムラインも廃止された。
 * Google Takeout では取れず（Timeline Edits.json という編集履歴しか出ない）、
 * スマホアプリからのエクスポートだけが経路になる。古い記事のJSON構造は通用しない。
 *
 * 実物（iPhone / Googleマップアプリ）で確認した構造:
 *
 *   [
 *     {
 *       "startTime": "2026-08-17T12:52:24.682+09:00",
 *       "endTime":   "2026-08-17T14:18:19.093+09:00",
 *       "visit": {
 *         "hierarchyLevel": "0",
 *         "probability": "0.739111",
 *         "topCandidate": {
 *           "probability": "0.401909",
 *           "semanticType": "Searched Address",
 *           "placeID": "ChIJ...",
 *           "placeLocation": "geo:35.617330,139.521283"
 *         }
 *       }
 *     },
 *     {
 *       "startTime": "2026-08-17T03:00:00.000Z",
 *       "endTime":   "2026-08-17T05:00:00.000Z",
 *       "timelinePath": [
 *         { "point": "geo:35.617210,139.521238",
 *           "durationMinutesOffsetFromStartTime": "52" }
 *       ]
 *     }
 *   ]
 *
 * 押さえるべき点:
 *   - トップレベルは**配列**。Android版では `{ semanticSegments: [...] }` のように
 *     オブジェクトで包まれる場合があるので、両方受ける
 *   - 数値がすべて**文字列**で入っている。probability も offset も
 *   - 時刻は ISO8601 だが `+09:00` と `Z` が混在する。Date に素直に食わせれば両方通る
 *   - 座標は `"geo:緯度,経度"` という1本の文字列
 *   - **場所の名前は入っていない**（placeID だけ）。表示名は町丁目名で代用する
 *
 * 滞在判定は自前で実装しない。タイムラインが既に「どこに、何時から何時まで」に
 * 整形済みなので、`visit` を持つ要素をそのまま StayPoint に写すだけでよい。
 * `timelinePath` と `activity` は移動なので捨てる。
 */

export class TimelineParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimelineParseError';
  }
}

/**
 * 訪問の確からしさの下限。これを下回る visit は捨てる。
 *
 * ⚠️ 1日分の実データしか見られていないため、この閾値は暫定。
 *    複数日のデータが溜まったら、誤検出がどれだけ落ちるかを見て調整すること。
 */
export const MIN_VISIT_PROBABILITY = 0.3;

/** 極端に短い滞在は通過とみなす。信号待ちや駅の乗換を生活圏に入れないため */
export const MIN_STAY_MINUTES = 5;

interface RawVisit {
  probability?: string;
  topCandidate?: {
    probability?: string;
    semanticType?: string;
    placeID?: string;
    placeLocation?: string;
  };
}

interface RawEntry {
  startTime?: string;
  endTime?: string;
  visit?: RawVisit;
}

/**
 * semanticType の既知の値だけ日本語名にする。
 * 不明な値は名前を付けない（町丁目名で代用されるほうが正確）。
 */
const SEMANTIC_LABEL: Record<string, string> = {
  Home: '自宅',
  InferredHome: '自宅（推定）',
  Work: '職場',
  InferredWork: '職場（推定）',
  School: '学校',
};

/** `"geo:35.617330,139.521283"` → `{ lat, lng }` */
export function parseGeoUri(s: string): { lat: number; lng: number } | null {
  const m = /^geo:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/.exec(s.trim());
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

/** トップレベルが配列でない書き出しにも耐える */
function toEntries(json: unknown): RawEntry[] {
  if (Array.isArray(json)) return json as RawEntry[];
  if (json && typeof json === 'object') {
    for (const v of Object.values(json as Record<string, unknown>)) {
      if (Array.isArray(v)) return v as RawEntry[];
    }
  }
  throw new TimelineParseError(
    'タイムラインのJSONとして読めませんでした。訪問の配列が見つかりません。',
  );
}

export interface ParseResult {
  stays: StayPoint[];
  /** 何をどれだけ捨てたか。UIで「◯件のうち◯件を読み込みました」を出すのに使う */
  stats: {
    total: number;
    visits: number;
    skippedLowProbability: number;
    skippedTooShort: number;
    skippedInvalid: number;
  };
}

export function parseTimelineDetailed(json: unknown): ParseResult {
  const entries = toEntries(json);
  const stays: StayPoint[] = [];
  const stats = {
    total: entries.length,
    visits: 0,
    skippedLowProbability: 0,
    skippedTooShort: 0,
    skippedInvalid: 0,
  };

  entries.forEach((e, i) => {
    // visit を持たない要素は移動（timelinePath / activity）。滞在ではない
    if (!e.visit) return;
    stats.visits++;

    const loc = e.visit.topCandidate?.placeLocation;
    if (!loc || !e.startTime || !e.endTime) {
      stats.skippedInvalid++;
      return;
    }
    const geo = parseGeoUri(loc);
    if (!geo) {
      stats.skippedInvalid++;
      return;
    }

    const startTime = new Date(e.startTime);
    const endTime = new Date(e.endTime);
    if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) {
      stats.skippedInvalid++;
      return;
    }

    const minutes = (endTime.getTime() - startTime.getTime()) / 60000;
    if (minutes <= 0) {
      stats.skippedInvalid++;
      return;
    }

    // 数値が文字列で入っている
    const probability = Number(e.visit.probability ?? '1');
    if (Number.isFinite(probability) && probability < MIN_VISIT_PROBABILITY) {
      stats.skippedLowProbability++;
      return;
    }

    if (minutes < MIN_STAY_MINUTES) {
      stats.skippedTooShort++;
      return;
    }

    const semanticType = e.visit.topCandidate?.semanticType;
    stays.push({
      id: `timeline-${i}`,
      lat: geo.lat,
      lng: geo.lng,
      startTime,
      endTime,
      name: semanticType ? SEMANTIC_LABEL[semanticType] : undefined,
    });
  });

  if (stays.length === 0) {
    throw new TimelineParseError(
      `読み込める滞在がありませんでした（${stats.total}件中、訪問は${stats.visits}件）。` +
        'タイムラインをオンにした直後だと、まだ記録が溜まっていないことがあります。',
    );
  }

  return { stays, stats };
}

export function parseTimeline(json: unknown): StayPoint[] {
  return parseTimelineDetailed(json).stays;
}

/**
 * ファイルをブラウザ内で直接読む。アップロードはしない。
 *
 * File API で読むので、位置履歴はネットワークに出ない。
 * 設定画面の「位置情報は端末から出ません」がここで実装として成立する。
 */
export async function readTimelineFile(file: File): Promise<ParseResult> {
  const text = await file.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new TimelineParseError('JSONとして読めませんでした。');
  }
  return parseTimelineDetailed(json);
}
