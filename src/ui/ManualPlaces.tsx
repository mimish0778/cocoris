import { useState } from 'react';

import type { ChoChomeIndex } from '../core/chochome';
import { manualPlaceMinutes, validateManualPlace, type ManualPlace } from '../core/manual';
import { MapPicker } from './MapPicker';

/**
 * 手動での場所登録（handoff §3 の入力経路②、§8 設定タブ）。
 *
 * タイムラインが取りこぼした滞在を人手で補うための画面。
 * 実際、Googleが移動と滞在を分解できず、外出先の滞在が丸ごと消えた例を実測している。
 */

const DAY_LABEL = ['日', '月', '火', '水', '木', '金', '土'];

const PRESETS: { label: string; days: number[] }[] = [
  { label: '平日', days: [1, 2, 3, 4, 5] },
  { label: '土日', days: [0, 6] },
  { label: '毎日', days: [0, 1, 2, 3, 4, 5, 6] },
];

interface Draft {
  name: string;
  lat: number | null;
  lng: number | null;
  days: number[];
  startHour: number;
  endHour: number;
}

const EMPTY: Draft = { name: '', lat: null, lng: null, days: [1, 2, 3, 4, 5], startHour: 9, endHour: 18 };

export function ManualPlaces({
  index,
  places,
  onChange,
}: {
  index: ChoChomeIndex | null;
  places: ManualPlace[];
  onChange: (places: ManualPlace[]) => void;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);

  const picked = draft?.lat != null && draft.lng != null ? { lat: draft.lat, lng: draft.lng } : null;
  const pickedChoChome = picked && index ? index.lookup(picked.lat, picked.lng) : null;

  const save = () => {
    if (!draft) return;
    const err = validateManualPlace({ ...draft, lat: draft.lat ?? undefined, lng: draft.lng ?? undefined });
    if (err) {
      setError(err);
      return;
    }
    onChange([
      ...places,
      {
        id: `m${Date.now().toString(36)}`,
        name: draft.name.trim(),
        lat: draft.lat!,
        lng: draft.lng!,
        days: [...draft.days].sort(),
        startHour: draft.startHour,
        endHour: draft.endHour,
      },
    ]);
    setDraft(null);
    setError(null);
  };

  return (
    <>
      <div className="section-title">手動で登録した場所（{places.length}件）</div>

      {places.length === 0 && !draft && (
        <p className="note">
          まだありません。タイムラインが取りこぼした場所や、履歴を使いたくない場合はここから登録できます。
        </p>
      )}

      {places.map((p) => {
        const c = index?.lookup(p.lat, p.lng) ?? null;
        return (
          <div className="card" key={p.id}>
            <div className="card__top">
              <span className="card__name">{p.name}</span>
              <button
                className="linkbtn"
                onClick={() => onChange(places.filter((x) => x.id !== p.id))}
              >
                削除
              </button>
            </div>
            <div className="card__meta">
              <span>{c ? `${c.city}${c.town}` : '対象範囲外'}</span>
              <span>{p.days.map((d) => DAY_LABEL[d]).join('・')}</span>
              <span>
                {p.startHour}時〜{p.endHour}時（{Math.round(manualPlaceMinutes(p) / 60)}時間）
              </span>
            </div>
          </div>
        );
      })}

      {!draft ? (
        <button className="btn btn--primary" style={{ textAlign: 'center' }} onClick={() => setDraft(EMPTY)}>
          場所を追加
        </button>
      ) : (
        <div className="card">
          <div className="rowgroup__title">場所を追加</div>

          <label className="field">
            <span className="field__label">名前</span>
            <input
              className="field__input"
              value={draft.name}
              placeholder="自宅 / 職場 / 大学 など"
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </label>

          <div className="field__label" style={{ marginTop: 10 }}>
            位置（地図をタップ）
          </div>
          <MapPicker
            index={index}
            value={picked}
            onPick={(lat, lng) => setDraft({ ...draft, lat, lng })}
          />
          <p className="note">
            {picked
              ? pickedChoChome
                ? `選択中: ${pickedChoChome.city}${pickedChoChome.town}`
                : '選択中: 東京都の地域危険度の対象範囲外です（都外か、市街化区域外）'
              : '位置が未選択です。'}
          </p>

          <div className="field__label">曜日</div>
          <div className="segmented">
            {PRESETS.map((p) => (
              <button key={p.label} onClick={() => setDraft({ ...draft, days: p.days })}>
                {p.label}
              </button>
            ))}
          </div>
          <div className="segmented">
            {DAY_LABEL.map((label, d) => (
              <button
                key={d}
                aria-pressed={draft.days.includes(d)}
                style={{ minWidth: 0 }}
                onClick={() =>
                  setDraft({
                    ...draft,
                    days: draft.days.includes(d)
                      ? draft.days.filter((x) => x !== d)
                      : [...draft.days, d],
                  })
                }
              >
                {label}
              </button>
            ))}
          </div>

          <div className="field__label" style={{ marginTop: 10 }}>
            時間帯（終了が開始より前なら翌日にまたぎます）
          </div>
          <div className="hours">
            <HourSelect
              value={draft.startHour}
              onChange={(h) => setDraft({ ...draft, startHour: h })}
            />
            <span>〜</span>
            <HourSelect value={draft.endHour} onChange={(h) => setDraft({ ...draft, endHour: h })} />
          </div>

          {error && <p className="note" style={{ color: 'var(--risk-5)' }}>{error}</p>}

          <div className="sheet__actions">
            <button className="btn btn--primary" style={{ textAlign: 'center' }} onClick={save}>
              登録する
            </button>
            <button
              className="btn"
              style={{ textAlign: 'center' }}
              onClick={() => {
                setDraft(null);
                setError(null);
              }}
            >
              やめる
            </button>
          </div>
        </div>
      )}

      <p className="note">
        登録した場所はこの端末の中だけに保存されます（送信しません）。
        直近4週間ぶんの滞在として扱い、指数減衰の重み付けはタイムラインの履歴と同じです。
      </p>
    </>
  );
}

function HourSelect({ value, onChange }: { value: number; onChange: (h: number) => void }) {
  return (
    <select
      className="field__input"
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      aria-label="時刻"
    >
      {Array.from({ length: 24 }, (_, h) => (
        <option key={h} value={h}>
          {String(h).padStart(2, '0')}:00
        </option>
      ))}
    </select>
  );
}
