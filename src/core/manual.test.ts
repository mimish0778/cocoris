import { describe, expect, it } from 'vitest';
import { expandManualPlaces, manualPlaceMinutes, validateManualPlace } from './manual';
import type { ManualPlace } from './manual';

const NOW = new Date('2026-08-19T22:00:00');

const base: ManualPlace = {
  id: 'p1',
  name: '大学',
  lat: 35.7127,
  lng: 139.762,
  days: [2], // 火曜
  startHour: 13,
  endHour: 20,
};

describe('手動登録の展開', () => {
  it('指定した曜日の分だけ滞在が作られる', () => {
    const stays = expandManualPlaces([base], NOW, 4);
    expect(stays).toHaveLength(4); // 直近28日に火曜は4回
    for (const s of stays) expect(s.startTime.getDay()).toBe(2);
    expect(stays[0].name).toBe('大学');
  });

  it('滞在時間が指定どおり', () => {
    const [s] = expandManualPlaces([base], NOW, 1);
    expect((s.endTime.getTime() - s.startTime.getTime()) / 60000).toBe(7 * 60);
  });

  it('日をまたぐ登録を扱える', () => {
    const night = { ...base, startHour: 22, endHour: 8 };
    expect(manualPlaceMinutes(night)).toBe(10 * 60);
    const [s] = expandManualPlaces([night], NOW, 1);
    expect(s.startTime.getHours()).toBe(22);
    expect(s.endTime.getDate()).toBe(s.startTime.getDate() + 1);
  });

  it('未来にはみ出す分は切る', () => {
    // 今日(水)の 21時〜23時。NOW は 22時なので 1時間で切られる
    const today = { ...base, days: [3], startHour: 21, endHour: 23 };
    const stays = expandManualPlaces([today], NOW, 0);
    expect(stays).toHaveLength(1);
    expect((stays[0].endTime.getTime() - stays[0].startTime.getTime()) / 60000).toBe(60);
  });

  it('開始と終了が同じ登録は展開しない（24時間滞在になるため）', () => {
    expect(expandManualPlaces([{ ...base, startHour: 9, endHour: 9 }], NOW)).toHaveLength(0);
  });
});

describe('入力の検証', () => {
  it('揃っていれば null', () => {
    expect(validateManualPlace(base)).toBeNull();
  });

  it.each([
    [{ ...base, name: '  ' }, '名前'],
    [{ ...base, lat: undefined }, '地図'],
    [{ ...base, days: [] }, '曜日'],
    [{ ...base, endHour: 13 }, '別に'],
  ])('不足を検出する (%#)', (p, expected) => {
    expect(validateManualPlace(p as Partial<ManualPlace>)).toContain(expected);
  });
});
