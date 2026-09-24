import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { EvacuationIndex, walkMinutes, type EvacuationData } from './evacuation';

const data: EvacuationData = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../public/data/evacuation.json', import.meta.url)), 'utf-8'),
);
const index = new EvacuationIndex(data);

describe('避難場所の割当', () => {
  it('第9回指定を読み込めている', () => {
    expect(index.meta.designation).toContain('第9回');
    expect(data.areas.features).toHaveLength(261);
    expect(data.sites.features).toHaveLength(221);
  });

  // Python(shapely)で確認した結果と一致すること
  it.each([
    ['荒川区町屋1丁目（デモの自宅）', 35.744206, 139.782631, '都立尾久の原公園一帯'],
    ['文京区本郷7丁目', 35.7127, 139.762, '東京大学'],
    ['新宿駅', 35.690921, 139.700258, '新宿御苑'],
    ['北千住駅', 35.749286, 139.804709, '東京電機大学一帯'],
  ])('%s は指定の避難場所へ', (_n, lat, lng, expected) => {
    const a = index.lookup(lat, lng);
    expect(a.kind).toBe('evacuate');
    if (a.kind !== 'evacuate') return;
    expect(a.site.name).toBe(expected);
    expect(a.distanceM).toBeGreaterThan(0);
    expect(a.distanceM).toBeLessThan(3000); // 都の計画は避難距離3km未満が原則
  });

  it.each([
    ['渋谷区道玄坂2丁目', 35.658034, 139.701636],
    ['千代田区丸の内1丁目', 35.681236, 139.767125],
  ])('%s は地区内残留地区で、逃げなくてよい', (_n, lat, lng) => {
    const a = index.lookup(lat, lng);
    expect(a.kind).toBe('stay');
  });

  it('多摩地域は指定の対象外', () => {
    // 八王子駅。区部中心の指定なので割当が存在しない
    expect(index.lookup(35.655645, 139.338998).kind).toBe('unknown');
  });

  it('都外は対象外', () => {
    expect(index.lookup(35.4437, 139.638).kind).toBe('unknown'); // 横浜
  });

  it('地区内残留地区は40件で、行き先を持たない', () => {
    const stay = data.areas.features.filter((f) => f.properties.stay);
    expect(stay).toHaveLength(40);
    const siteNos = new Set(data.sites.features.map((f) => f.properties.no));
    for (const f of stay) expect(siteNos.has(f.properties.no)).toBe(false);
  });

  it('避難場所を持つ割当は、必ず行き先が引ける', () => {
    const siteNos = new Set(data.sites.features.map((f) => f.properties.no));
    for (const f of data.areas.features) {
      if (!f.properties.stay) expect(siteNos.has(f.properties.no)).toBe(true);
    }
  });
});

describe('徒歩時間の目安', () => {
  it('分速80mで丸める', () => {
    expect(walkMinutes(800)).toBe(10);
    expect(walkMinutes(1000)).toBe(13);
    expect(walkMinutes(10)).toBe(1); // 0分とは言わない
  });
});
