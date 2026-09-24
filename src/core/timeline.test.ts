import { describe, expect, it } from 'vitest';

import {
  MIN_STAY_MINUTES,
  parseGeoUri,
  parseTimeline,
  parseTimelineDetailed,
  TimelineParseError,
} from './timeline';

/**
 * 実物のエクスポートと同じ形の**合成データ**。
 *
 * 本物の位置履歴（data/samples/）はテストに使わない。自宅・職場の座標そのものなので
 * リポジトリに入れてはいけない（.gitignore で除外済み）。
 * 構造だけを写して、座標は公開データから取った町丁目（荒川区町屋）に置き換えている。
 */
const SAMPLE = [
  {
    // 自宅と判定された滞在
    endTime: '2026-08-17T08:10:00.000+09:00',
    startTime: '2026-08-16T22:30:00.000+09:00',
    visit: {
      hierarchyLevel: '0',
      topCandidate: {
        probability: '0.912345',
        semanticType: 'Home',
        placeID: 'ChIJexample1',
        placeLocation: 'geo:35.744206,139.782631',
      },
      probability: '0.884000',
    },
  },
  {
    // 移動の軌跡。滞在ではないので捨てられること
    endTime: '2026-08-17T09:00:00.000Z',
    startTime: '2026-08-17T08:30:00.000Z',
    timelinePath: [
      { point: 'geo:35.740000,139.780000', durationMinutesOffsetFromStartTime: '12' },
    ],
  },
  {
    // 確からしさが低い訪問
    endTime: '2026-08-17T12:00:00.000+09:00',
    startTime: '2026-08-17T11:00:00.000+09:00',
    visit: {
      topCandidate: {
        probability: '0.1',
        semanticType: 'Searched Address',
        placeLocation: 'geo:35.700000,139.700000',
      },
      probability: '0.11',
    },
  },
  {
    // 1分だけの通過
    endTime: '2026-08-17T13:01:00.000+09:00',
    startTime: '2026-08-17T13:00:00.000+09:00',
    visit: {
      topCandidate: { placeLocation: 'geo:35.690921,139.700258' },
      probability: '0.9',
    },
  },
  {
    // 座標が壊れている
    endTime: '2026-08-17T15:00:00.000+09:00',
    startTime: '2026-08-17T14:00:00.000+09:00',
    visit: { topCandidate: { placeLocation: 'not-a-geo-uri' }, probability: '0.9' },
  },
];

describe('geo URI', () => {
  it('緯度経度を取り出す', () => {
    expect(parseGeoUri('geo:35.617330,139.521283')).toEqual({ lat: 35.61733, lng: 139.521283 });
  });

  it('負の値も読める', () => {
    expect(parseGeoUri('geo:-33.8688,-151.2093')).toEqual({ lat: -33.8688, lng: -151.2093 });
  });

  it('形式が違えば null', () => {
    expect(parseGeoUri('35.6,139.7')).toBeNull();
    expect(parseGeoUri('geo:abc,def')).toBeNull();
    expect(parseGeoUri('')).toBeNull();
  });
});

describe('タイムラインのパース', () => {
  const result = parseTimelineDetailed(SAMPLE);

  it('visit だけを滞在として拾う', () => {
    expect(result.stats.total).toBe(5);
    expect(result.stats.visits).toBe(4); // timelinePath の1件は数えない
    expect(result.stays).toHaveLength(1);
  });

  it('捨てた理由を数えている', () => {
    expect(result.stats.skippedLowProbability).toBe(1);
    expect(result.stats.skippedTooShort).toBe(1);
    expect(result.stats.skippedInvalid).toBe(1);
  });

  it('日をまたぐ滞在の時刻が正しい', () => {
    const s = result.stays[0];
    expect(s.startTime.toISOString()).toBe('2026-08-16T13:30:00.000Z');
    expect(s.endTime.toISOString()).toBe('2026-08-16T23:10:00.000Z');
    expect((s.endTime.getTime() - s.startTime.getTime()) / 60000).toBe(580);
  });

  it('semanticType から名前を付ける', () => {
    expect(result.stays[0].name).toBe('自宅');
  });

  it('座標を取り出せている', () => {
    expect(result.stays[0].lat).toBeCloseTo(35.744206, 6);
    expect(result.stays[0].lng).toBeCloseTo(139.782631, 6);
  });

  it('MIN_STAY_MINUTES 未満は落ちる', () => {
    expect(MIN_STAY_MINUTES).toBeGreaterThan(1);
  });
});

describe('壊れた入力', () => {
  it('配列でなくても、中の配列を探す（Android版対策）', () => {
    const wrapped = { semanticSegments: SAMPLE };
    expect(parseTimeline(wrapped)).toHaveLength(1);
  });

  it('配列が無ければ TimelineParseError', () => {
    expect(() => parseTimeline({ foo: 'bar' })).toThrow(TimelineParseError);
    expect(() => parseTimeline(42)).toThrow(TimelineParseError);
  });

  it('滞在が1件も無ければ、理由の分かるエラーを出す', () => {
    expect(() => parseTimeline([])).toThrow(/訪問は0件/);
  });
});
