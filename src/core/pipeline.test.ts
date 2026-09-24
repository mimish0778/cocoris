import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { ChoChomeIndex } from './chochome';
import { decayWeight, RETENTION_DAYS } from './decay';
import { buildPlaces, durationMinutes, filterLifeArea } from './places';
import {
  buildExposureProfile,
  dangerPercentile,
  dayTypeOf,
  detectHome,
  rankPlaces,
  toStars,
} from './scoring';
import { generateSampleStays } from '../data/sample';

const GEOJSON = fileURLToPath(new URL('../../public/data/chochome.json', import.meta.url));
const index = new ChoChomeIndex(JSON.parse(readFileSync(GEOJSON, 'utf-8')));

/** 生成したサンプルの「今」。曜日が固定されるようテストでは固定日を使う */
const NOW = new Date('2026-08-17T21:00:00');

describe('座標 → 町丁目', () => {
  // scripts/verify_lookup.py と同じ座標。Python(shapely) と TS で同じ答えが出ること
  it.each([
    ['渋谷駅', 35.658034, 139.701636, '渋谷区', '渋谷２丁目'],
    ['東京駅', 35.681236, 139.767125, '千代田区', '丸の内１丁目'],
    ['新宿駅', 35.690921, 139.700258, '新宿区', '新宿３丁目'],
    ['北千住駅', 35.749286, 139.804709, '足立区', '千住旭町'],
    ['三軒茶屋駅', 35.643391, 139.668726, '世田谷区', '太子堂４丁目'],
    ['町屋駅', 35.744206, 139.782631, '荒川区', '町屋１丁目'],
    ['八王子駅', 35.655645, 139.338998, '八王子市', '旭町'],
  ])('%s', (_name, lat, lng, city, town) => {
    const c = index.lookup(lat, lng);
    expect(c).not.toBeNull();
    expect(c!.city).toBe(city);
    expect(c!.town).toBe(town);
  });

  it('市街化区域外・海上は null', () => {
    expect(index.lookup(35.5, 139.9)).toBeNull();
    // 都外（横浜）
    expect(index.lookup(35.4437, 139.638)).toBeNull();
  });

  it('5,192町丁目すべて読み込めている', () => {
    expect(index.size).toBe(5192);
  });

  it('順位1位は荒川区荒川6丁目（第9回 総合危険度ワースト1）', () => {
    // 荒川6丁目の中の一点
    const c = index.lookup(35.7391, 139.7869);
    expect(c?.city).toBe('荒川区');
  });
});

describe('指数減衰', () => {
  it('半減期14日で半分になる', () => {
    expect(decayWeight(0)).toBe(1);
    expect(decayWeight(14)).toBeCloseTo(0.5, 6);
    expect(decayWeight(7)).toBeCloseTo(0.707, 3);
    expect(decayWeight(30)).toBeCloseTo(0.226, 3);
    expect(decayWeight(60)).toBeCloseTo(0.051, 3);
  });

  it('保持期間は約3か月', () => {
    // 重みが0.01を下回るまで。設定画面の「保持期間90日」の根拠
    expect(RETENTION_DAYS).toBe(94);
  });
});

describe('危険度の百分位と★', () => {
  it('1位が1.0、最下位が0.0', () => {
    expect(dangerPercentile(1)).toBe(1);
    expect(dangerPercentile(5192)).toBe(0);
    expect(dangerPercentile(2596)).toBeCloseTo(0.5, 2);
  });

  it('★は1〜5に収まる', () => {
    expect(toStars(1)).toBe(5);
    expect(toStars(0)).toBe(1);
    expect(toStars(0.5)).toBe(3);
  });
});

describe('曜日区分', () => {
  it('土日は休日', () => {
    expect(dayTypeOf(new Date('2026-08-17T12:00:00'))).toBe('weekday'); // 月
    expect(dayTypeOf(new Date('2026-08-16T12:00:00'))).toBe('weekend'); // 日
  });

  it('祝日を外から与えられる', () => {
    const holidays = new Set(['2026-08-17']);
    expect(dayTypeOf(new Date('2026-08-17T12:00:00'), holidays)).toBe('holiday');
  });
});

describe('サンプルデータのパイプライン（親御さん）', () => {
  const stays = generateSampleStays('parent', NOW);
  const places = filterLifeArea(buildPlaces(stays, index), NOW);
  const profile = buildExposureProfile(places, NOW);

  it('複数の場所にまとまる', () => {
    expect(places.length).toBeGreaterThanOrEqual(2);
    expect(places.map((p) => p.name)).toContain('自宅');
  });

  it('全ての場所が町丁目に当たる', () => {
    for (const p of places) expect(p.choChome).not.toBeNull();
  });

  it('自宅は木密地域（荒川区町屋1丁目）', () => {
    const home = places.find((p) => p.id === detectHome(profile));
    expect(home?.name).toBe('自宅');
    expect(home?.choChome?.town).toBe('町屋１丁目');
    expect(home?.choChome?.fireRank).toBe(5);
  });

  it('自宅は別枠になり、ランキングからは外れる', () => {
    const result = rankPlaces(places, profile, NOW);
    expect(result.home?.place.name).toBe('自宅');
    expect(result.ranked.map((r) => r.place.name)).not.toContain('自宅');
  });

  it('週あたりの滞在時間が実態と合う', () => {
    const r = rankPlaces(places, profile, NOW);
    // 自宅は毎日21時〜翌8時。週70時間前後になるはず
    expect(r.home!.hoursPerWeek).toBeGreaterThan(55);
    expect(r.home!.hoursPerWeek).toBeLessThan(90);
  });

  it('リスク時間の降順に並ぶ', () => {
    const r = rankPlaces(places, profile, NOW);
    for (let i = 1; i < r.ranked.length; i++) {
      expect(r.ranked[i - 1].riskHoursPerWeek).toBeGreaterThanOrEqual(r.ranked[i].riskHoursPerWeek);
    }
  });

  it('リスク時間は滞在時間を超えない（重みは0-1のため）', () => {
    const r = rankPlaces(places, profile, NOW);
    for (const s of [r.home!, ...r.ranked]) {
      expect(s.riskHoursPerWeek).toBeLessThanOrEqual(s.hoursPerWeek + 1e-9);
    }
  });

  it('滞在時間が現実的な範囲に収まる', () => {
    for (const s of stays) {
      const min = durationMinutes(s);
      expect(min, `${s.name} が ${Math.round(min)} 分`).toBeGreaterThan(0);
      expect(min, `${s.name} が ${Math.round(min)} 分`).toBeLessThanOrEqual(14 * 60);
    }
  });
});
