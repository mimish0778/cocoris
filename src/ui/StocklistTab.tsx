import { useState } from 'react';

import { loadBabyBirth, loadStockChecked, saveBabyBirth, saveStockChecked } from './storage';

type StockItem = {
  id: string;
  label: string;
  note?: string;
  minMonths?: number;
  maxMonths?: number;
};

const ALWAYS: StockItem[] = [
  { id: 'diaper', label: 'おむつ（7日分）', note: '新生児・S・Mなど月齢に合ったサイズ' },
  { id: 'wipes', label: 'おしりふき（10パック以上）' },
  { id: 'disposal-bag', label: 'ビニール袋（おむつ処理用）' },
  { id: 'changing-pad', label: '携帯用おむつ替えシート' },
  { id: 'boshi', label: '母子手帳のコピーまたはスマホ撮影' },
  { id: 'vaccine', label: 'ワクチン接種記録のコピー' },
  { id: 'thermometer', label: '体温計' },
  { id: 'medicine', label: '処方薬・常備薬（7日分）' },
  { id: 'blanket', label: 'おくるみ・バスタオル（2枚）' },
  { id: 'water', label: '飲料水（1人1日3L×7日分）', note: '調乳用に軟水を別途確保' },
];

const BY_AGE: StockItem[] = [
  // 0-5ヶ月
  { id: 'formula', label: '粉ミルク（7日分）', note: '缶入りの方が長期保存に向く', maxMonths: 11 },
  { id: 'bottle', label: '哺乳瓶（2本以上）', maxMonths: 11 },
  { id: 'pump', label: '搾乳器（授乳中の場合）', maxMonths: 5 },
  { id: 'gauze', label: 'ガーゼ（10枚以上）', maxMonths: 11 },
  { id: 'sterilizer', label: '哺乳瓶の消毒グッズ', maxMonths: 11 },
  // 6-11ヶ月
  { id: 'babyfood-smooth', label: '離乳食・なめらかタイプ（7日分）', minMonths: 6, maxMonths: 11 },
  { id: 'spoon', label: 'ベビースプーン（2本）', minMonths: 6 },
  // 12-23ヶ月
  { id: 'babyfood-soft', label: '幼児用軟らかめ食品（7日分）', minMonths: 12, maxMonths: 23 },
  { id: 'straw-cup', label: 'ストローカップ', minMonths: 12, maxMonths: 23 },
  // 24-36ヶ月
  { id: 'snack-toddler', label: '幼児向けおやつ（3日分）', minMonths: 24, maxMonths: 36 },
  { id: 'potty', label: '携帯用補助便座または簡易トイレ', minMonths: 18, maxMonths: 36 },
];

function calcAgeMonths(birthYYYYMM: string): number {
  const [y, m] = birthYYYYMM.split('-').map(Number);
  const birth = new Date(y, m - 1, 1);
  const now = new Date();
  return (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth());
}

function itemsForAge(ageMonths: number): StockItem[] {
  return BY_AGE.filter((item) => {
    const ok_min = item.minMonths == null || ageMonths >= item.minMonths;
    const ok_max = item.maxMonths == null || ageMonths <= item.maxMonths;
    return ok_min && ok_max;
  });
}

export function StocklistTab() {
  const [birth, setBirth] = useState<string>(() => loadBabyBirth() ?? '');
  const [checked, setChecked] = useState<Set<string>>(() => loadStockChecked());

  const ageMonths = birth ? calcAgeMonths(birth) : null;
  const ageItems = ageMonths != null ? itemsForAge(ageMonths) : [];
  const items = [...ALWAYS, ...ageItems];
  const total = items.length;
  const done = items.filter((i) => checked.has(i.id)).length;

  const toggle = (id: string) => {
    const next = new Set(checked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setChecked(next);
    saveStockChecked(next);
  };

  const handleBirthChange = (val: string) => {
    setBirth(val);
    if (val) saveBabyBirth(val);
  };

  const ageLabel = ageMonths != null
    ? ageMonths < 1 ? '生後1ヶ月未満'
    : ageMonths < 12 ? `生後${ageMonths}ヶ月`
    : `${Math.floor(ageMonths / 12)}歳${ageMonths % 12 > 0 ? `${ageMonths % 12}ヶ月` : ''}`
    : null;

  return (
    <div className="stocklist">
      <div className="stocklist__header">
        <h2 className="stocklist__title">備蓄チェックリスト</h2>
        <p className="stocklist__desc">
          東京都「妊産婦・乳幼児を守る災害対策ガイドライン」をもとに、
          お子さんの月齢に合わせたリストを出します。
        </p>
      </div>

      <div className="stocklist__birth-row">
        <label className="field__label" htmlFor="baby-birth">赤ちゃんの生年月</label>
        <input
          id="baby-birth"
          type="month"
          className="field__input"
          value={birth}
          max={new Date().toISOString().slice(0, 7)}
          onChange={(e) => handleBirthChange(e.target.value)}
        />
        {ageLabel && <p className="stocklist__age">{ageLabel}のリストを表示中</p>}
      </div>

      <div className="stocklist__progress">
        <div className="stocklist__progress-bar">
          <div
            className="stocklist__progress-fill"
            style={{ width: total > 0 ? `${(done / total) * 100}%` : '0%' }}
          />
        </div>
        <span className="stocklist__progress-text">{done} / {total} 完了</span>
      </div>

      <div className="stocklist__section-title">いつでも必要</div>
      {ALWAYS.map((item) => (
        <StockRow key={item.id} item={item} checked={checked.has(item.id)} onToggle={toggle} />
      ))}

      {ageItems.length > 0 && (
        <>
          <div className="stocklist__section-title">月齢に応じて追加</div>
          {ageItems.map((item) => (
            <StockRow key={item.id} item={item} checked={checked.has(item.id)} onToggle={toggle} />
          ))}
        </>
      )}

      {!birth && (
        <p className="note" style={{ marginTop: 12 }}>
          生年月を入力すると、月齢に合わせた品目が追加されます。
        </p>
      )}

      <p className="note" style={{ marginTop: 16 }}>
        出典: 東京都「妊産婦・乳幼児を守る災害対策ガイドライン」
      </p>
    </div>
  );
}

function StockRow({
  item,
  checked,
  onToggle,
}: {
  item: StockItem;
  checked: boolean;
  onToggle: (id: string) => void;
}) {
  return (
    <label className={`stock-row ${checked ? 'stock-row--checked' : ''}`}>
      <input
        type="checkbox"
        className="stock-row__check"
        checked={checked}
        onChange={() => onToggle(item.id)}
      />
      <div className="stock-row__body">
        <span className="stock-row__label">{item.label}</span>
        {item.note && <span className="stock-row__note">{item.note}</span>}
      </div>
    </label>
  );
}
