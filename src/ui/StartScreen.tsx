import { useRef } from 'react';

import { PERSONAS, type PersonaId } from '../data/sample';

/**
 * 起動画面（handoff §10）。
 *
 * 審査員が自分のタイムラインをエクスポートしてくれるわけがない。タイムラインは
 * デフォルトがオフなので、そもそも履歴を持っていない人も多い。
 * 「サンプルデータで試す」を最初に、大きく置く。
 */
export function StartScreen({
  onPickSample,
  onImportFile,
  onManual,
}: {
  onPickSample: (id: PersonaId) => void;
  onImportFile: (file: File) => void;
  onManual: () => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);

  return (
    <div className="start">
      <p className="start__lead">
        災害の種類も、見るべき地図も多すぎます。
        <br />
        ココリスは<strong>あなたがよく行く場所だけ</strong>を1枚にまとめ、
        <strong>逃げるならどこへ行くのか</strong>まで出します。
      </p>

      {PERSONAS.map((p, i) => (
        <button
          key={p.id}
          className={i === 0 ? 'btn btn--primary' : 'btn'}
          onClick={() => onPickSample(p.id)}
        >
          サンプルデータで試す（{p.label}）
          <span className="btn__sub">{p.description}</span>
        </button>
      ))}

      {/*
        アップロードではない。File API でブラウザが直接読むだけで、
        ファイルの中身はネットワークに出ない。
      */}
      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onImportFile(f);
          e.target.value = '';
        }}
      />
      <button className="btn" onClick={() => fileInput.current?.click()}>
        自分の履歴をインポート
        <span className="btn__sub">
          Googleマップのタイムラインをエクスポートした JSON（東京都内の滞在のみ判定できます）
        </span>
      </button>

      <button className="btn" onClick={onManual}>
        手動で場所を登録
        <span className="btn__sub">
          履歴を使わずに、よく行く場所と時間帯を自分で入れる
        </span>
      </button>

      <div className="privacy-note">
        <strong>位置履歴はこの端末から出ません。</strong>
        <br />
        JSONはブラウザが直接読み、滞在の抽出も町丁目の判定も、避難場所の割当も、
        この端末の中で完結します。ハザードデータ（都内5,192町丁目）と
        避難場所の指定はアプリに同梱しているためです。
        <br />
        避難経路を引くときだけ、その場所と避難場所の座標が経路探索の提供元に渡ります。
      </div>
    </div>
  );
}
