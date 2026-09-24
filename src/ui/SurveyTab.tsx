import { useEffect, useState } from 'react';

import type { EvacuationIndex, EvacuationSite } from '../core/evacuation';
import { type SurveyData, type SurveyEntry, loadSurvey, saveSurveyEntry } from './storage';

type GeoState =
  | { kind: 'pending' }
  | { kind: 'ok'; lat: number; lng: number }
  | { kind: 'denied' }
  | { kind: 'error' };

type TriBool = true | false | null;

const DEV_POS = { lat: 35.7130, lng: 139.7770 };

export function SurveyTab({
  evacuation,
  devMode,
  onSurveyUpdated,
}: {
  evacuation: EvacuationIndex | null;
  devMode?: boolean;
  onSurveyUpdated?: () => void;
}) {
  const [geo, setGeo] = useState<GeoState>({ kind: 'pending' });
  const [site, setSite] = useState<EvacuationSite | null>(null);
  const [surveyData, setSurveyData] = useState<SurveyData>(() => loadSurvey());
  const [submitted, setSubmitted] = useState(false);

  // 位置情報取得（開発者モードは仮置き）
  useEffect(() => {
    if (devMode) {
      setGeo({ kind: 'ok', lat: DEV_POS.lat, lng: DEV_POS.lng });
      return;
    }
    if (!navigator.geolocation) { setGeo({ kind: 'error' }); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => setGeo({ kind: 'ok', lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => setGeo(err.code === err.PERMISSION_DENIED ? { kind: 'denied' } : { kind: 'error' }),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }, [devMode]);

  // 位置から避難場所を特定
  useEffect(() => {
    if (geo.kind !== 'ok' || !evacuation) return;
    const answer = evacuation.lookup(geo.lat, geo.lng);
    if (answer.kind === 'evacuate') setSite(answer.site);
  }, [geo, evacuation]);

  const existing = site ? surveyData[site.no] : null;

  const [nursing, setNursing] = useState<TriBool>(null);
  const [allergy, setAllergy] = useState<TriBool>(null);
  const [bed, setBed] = useState<TriBool>(null);

  // 既存データがあればデフォルトにセット
  useEffect(() => {
    if (!existing) return;
    setNursing(existing.nursing);
    setAllergy(existing.allergy);
    setBed(existing.bed);
  }, [existing]);

  const handleSubmit = () => {
    if (!site) return;
    const entry: SurveyEntry = {
      nursing,
      allergy,
      bed,
      updatedAt: new Date().toISOString(),
    };
    saveSurveyEntry(site.no, entry);
    setSurveyData(loadSurvey());
    onSurveyUpdated?.();
    setSubmitted(true);
  };

  const anyAnswered = nursing !== null || allergy !== null || bed !== null;

  if (geo.kind === 'pending') {
    return <div className="survey-status">位置情報を取得しています…</div>;
  }
  if (geo.kind === 'denied') {
    return (
      <div className="survey-status survey-status--warn">
        位置情報の許可が必要です。ブラウザの設定から許可してください。
      </div>
    );
  }
  if (geo.kind === 'error') {
    return <div className="survey-status survey-status--warn">位置情報の取得に失敗しました。</div>;
  }
  if (!evacuation) {
    return <div className="survey-status">データを読み込み中…</div>;
  }

  const answer = evacuation.lookup(geo.lat, geo.lng);
  if (answer.kind === 'stay') {
    return (
      <div className="survey-status">
        この地区は<strong>地区内残留地区</strong>のため、広域避難場所の指定がありません。
        アンケートの対象外です。
      </div>
    );
  }
  if (answer.kind === 'unknown') {
    return (
      <div className="survey-status">
        現在地が東京都の避難場所指定範囲外のため、アンケートに回答できません。
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="survey-done">
        <div className="survey-done__icon">✓</div>
        <div className="survey-done__msg">ありがとうございました！</div>
        <p className="note">「{site?.name}」についての情報を記録しました。</p>
        <button className="btn" style={{ marginTop: 16 }} onClick={() => setSubmitted(false)}>
          もう一度回答する
        </button>
      </div>
    );
  }

  return (
    <div className="survey">
      <h2 className="survey__title">避難所の実情を教えてください</h2>
      <p className="survey__desc">
        公式データには載っていない「授乳スペースがあるか」「アレルギー食があるか」などの
        情報を、実際に利用した方から集めています。
      </p>

      <div className="survey__site">
        <div className="survey__site-label">対象の避難場所</div>
        <div className="survey__site-name">{answer.site.name}</div>
        <div className="survey__site-note">
          現在地に割り当てられた避難場所（東京都の公式指定）
        </div>
      </div>

      {existing && (
        <div className="survey__existing">
          前回の回答があります（{new Date(existing.updatedAt).toLocaleDateString('ja-JP')}）。
          上書きして送信できます。
        </div>
      )}

      <TriQuestion
        label="授乳・おむつ替えスペース"
        desc="授乳室や仕切りのあるおむつ替えスペースがありましたか？"
        value={nursing}
        onChange={setNursing}
      />
      <TriQuestion
        label="アレルギー対応食"
        desc="アレルギーのある方向けの食事が提供されていましたか？"
        value={allergy}
        onChange={setAllergy}
      />
      <TriQuestion
        label="簡易ベッド・段ボールベッド"
        desc="床に直接寝ずに済む簡易ベッドや段ボールベッドがありましたか？"
        value={bed}
        onChange={setBed}
      />

      <button
        className="btn btn--primary"
        style={{ marginTop: 24 }}
        onClick={handleSubmit}
        disabled={!anyAnswered}
      >
        回答を送信する
      </button>
    </div>
  );
}

function TriQuestion({
  label,
  desc,
  value,
  onChange,
}: {
  label: string;
  desc: string;
  value: TriBool;
  onChange: (v: TriBool) => void;
}) {
  return (
    <div className="tri-q">
      <div className="tri-q__label">{label}</div>
      <div className="tri-q__desc">{desc}</div>
      <div className="tri-q__options">
        <TriBtn active={value === true} onClick={() => onChange(value === true ? null : true)}>
          あった
        </TriBtn>
        <TriBtn active={value === false} onClick={() => onChange(value === false ? null : false)}>
          なかった
        </TriBtn>
        <TriBtn active={value === null} variant="neutral" onClick={() => onChange(null)}>
          わからない
        </TriBtn>
      </div>
    </div>
  );
}

function TriBtn({
  children,
  active,
  variant,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  variant?: 'neutral';
  onClick: () => void;
}) {
  return (
    <button
      className={`tri-btn${active ? ` tri-btn--active${variant === 'neutral' ? ' tri-btn--neutral' : ''}` : ''}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/** アンケート結果のバッジを表示するコンポーネント（RankingTab内のカードで使う） */
export function SurveyBadges({ siteNo, surveyData }: { siteNo: number; surveyData: SurveyData }) {
  const entry = surveyData[siteNo];
  if (!entry) return null;

  const badges: { label: string; ok: boolean }[] = [];
  if (entry.nursing !== null) badges.push({ label: '授乳', ok: entry.nursing });
  if (entry.allergy !== null) badges.push({ label: 'アレルギー食', ok: entry.allergy });
  if (entry.bed !== null) badges.push({ label: '簡易ベッド', ok: entry.bed });

  if (badges.length === 0) return null;

  return (
    <div className="survey-badges">
      {badges.map(({ label, ok }) => (
        <span key={label} className={`survey-badge ${ok ? 'survey-badge--ok' : 'survey-badge--no'}`}>
          {ok ? '✓' : '✗'} {label}
        </span>
      ))}
    </div>
  );
}
