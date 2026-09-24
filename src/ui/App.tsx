import { useEffect, useMemo, useState } from 'react';

import { ChoChomeIndex, loadChoChomeIndex } from '../core/chochome';
import { EvacuationIndex, loadEvacuation } from '../core/evacuation';
import { expandManualPlaces, type ManualPlace } from '../core/manual';
import { buildPlaces, filterLifeArea } from '../core/places';
import { buildExposureProfile, rankPlaces } from '../core/scoring';
import { readTimelineFile, TimelineParseError } from '../core/timeline';
import type { StayPoint } from '../core/types';
import { generateSampleStays } from '../data/sample';
import { ManualPlaces } from './ManualPlaces';
import { MapHome } from './MapHome';
import { Mark } from './Mark';
import { PlaceSheet } from './PlaceSheet';
import { RankingTab } from './RankingTab';
import { StocklistTab } from './StocklistTab';
import { loadSurvey, type SurveyData, clearAll as clearAllStorage, saveManualPlaces, loadDevMode, saveDevMode } from './storage';
import { SurveyTab } from './SurveyTab';

type Screen = 'map' | 'ranking' | 'survey' | 'stock';

// アイコン SVG（インライン）
function IconMap() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="24" height="24">
      <polygon points="3,6 9,3 15,6 21,3 21,18 15,21 9,18 3,21" />
      <line x1="9" y1="3" x2="9" y2="18" />
      <line x1="15" y1="6" x2="15" y2="21" />
    </svg>
  );
}
function IconRanking() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="24" height="24">
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}
function IconSurvey() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="24" height="24">
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  );
}
function IconStock() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="24" height="24">
      <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <path d="M16 10a4 4 0 01-8 0" />
    </svg>
  );
}
function IconSettings() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="22" height="22">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

export function App() {
  const [index, setIndex] = useState<ChoChomeIndex | null>(null);
  const [evacuation, setEvacuation] = useState<EvacuationIndex | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [screen, setScreen] = useState<Screen>('map');
  const [showSettings, setShowSettings] = useState(false);

  const [entered, setEntered] = useState(false);
  const [importedStays, setImportedStays] = useState<StayPoint[]>([]);
  const [manualPlaces, setManualPlaces] = useState<ManualPlace[]>([]);
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [importNote, setImportNote] = useState<string | null>(null);
  const [surveyData, setSurveyData] = useState<SurveyData>(() => loadSurvey());
  const [devMode, setDevMode] = useState<boolean>(() => loadDevMode());

  const now = useMemo(() => new Date(), []);

  // 開発者モードをONにしたとき、サンプルデータを自動ロード
  useEffect(() => {
    if (devMode && !entered) {
      setImportedStays(generateSampleStays('parent', now));
      setEntered(true);
    }
  }, [devMode]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadChoChomeIndex()
      .then(setIndex)
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : String(e)));
    loadEvacuation().then(setEvacuation);
  }, []);

  const stays = useMemo(
    () => [...importedStays, ...expandManualPlaces(manualPlaces, now)],
    [importedStays, manualPlaces, now],
  );

  const allPlaces = useMemo(() => {
    if (!index || stays.length === 0) return [];
    return filterLifeArea(buildPlaces(stays, index), now);
  }, [stays, index, now]);

  const places = useMemo(
    () => allPlaces.filter((p) => !excluded.has(p.id)),
    [allPlaces, excluded],
  );

  const profile = useMemo(() => buildExposureProfile(places, now), [places, now]);
  const result = useMemo(() => rankPlaces(places, profile, now), [places, profile, now]);
  const all = useMemo(
    () => (result.home ? [result.home, ...result.ranked] : result.ranked),
    [result],
  );
  const selected = all.find((s) => s.place.id === selectedId) ?? null;

  const handleImport = async (file: File) => {
    if (!index) {
      setImportNote(
        loadError
          ? `ハザードデータを読み込めていません: ${loadError}`
          : 'データを読み込み中です。数秒おいて再試行してください。',
      );
      return;
    }
    try {
      const { stays: parsed, stats } = await readTimelineFile(file);
      const covered = parsed.filter((s) => index.covers(s.lat, s.lng)).length;
      if (covered === 0) {
        setImportNote(
          stats.visits <= 2
            ? `訪問が${stats.visits}件しかありませんでした。データが少ないと場所を抽出できません。数週間分のタイムラインをエクスポートしてお試しください。`
            : `${stats.visits}件の訪問を読み込みましたが、東京都の地域危険度データの対象範囲外でした。対象は都内の一部地域に限られます。`,
        );
        return;
      }
      setImportNote(
        covered < parsed.length
          ? `${parsed.length}件中${covered}件が東京都内でした。都外は評価対象外です。`
          : null,
      );
      setImportedStays(parsed);
      setEntered(true);
      setShowSettings(false);
    } catch (e) {
      setImportNote(
        e instanceof TimelineParseError
          ? e.message
          : `読み込めませんでした: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  };

  const updateManual = (next: ManualPlace[]) => {
    setManualPlaces(next);
    saveManualPlaces(next);
  };

  const navItems: { id: Screen; label: string; icon: React.ReactNode }[] = [
    { id: 'map', label: '現在地', icon: <IconMap /> },
    { id: 'ranking', label: '危険度', icon: <IconRanking /> },
    { id: 'survey', label: 'アンケート', icon: <IconSurvey /> },
    { id: 'stock', label: '備蓄', icon: <IconStock /> },
  ];

  return (
    <div className={`app${screen === 'map' ? ' app--map' : ''}`}>
      <header className="app__header">
        <div className="brand">
          <Mark className="brand__mark" />
          <div>
            <div className="brand__name">ココリス</div>
          </div>
        </div>
        <button
          className="settings-btn"
          onClick={() => setShowSettings(true)}
          aria-label="設定"
        >
          <IconSettings />
        </button>
      </header>

      {loadError && <p className="note" style={{ margin: '8px 16px 0' }}>ハザードデータを読み込めませんでした: {loadError}</p>}

      <main className="app__body">
        {/* display で切り替えて DOM を保持 → MapLibre の再初期化フラッシュを防ぐ */}
        <div style={{ display: screen === 'map' ? 'contents' : 'none' }}>
          <MapHome index={index} evacuation={evacuation} surveyData={surveyData} devMode={devMode} />
        </div>
        <div style={{ display: screen === 'ranking' ? 'block' : 'none', flex: 1, overflowY: 'auto', padding: '0 16px' }}>
          {entered ? (
            <RankingTab
              home={result.home}
              ranked={result.ranked}
              evacuation={evacuation}
              surveyData={surveyData}
              onSelect={(s) => setSelectedId(s.place.id)}
              onGoSettings={() => setShowSettings(true)}
            />
          ) : (
            <div style={{ padding: '24px 0' }}>
              {importNote && <p className="note" style={{ margin: '0 0 16px' }}>{importNote}</p>}
              <div className="empty">
                <h2>位置履歴を読み込んでください</h2>
                <p>Google タイムラインの JSON ファイルを読み込むと、<br />よく行く場所のリスク順が表示されます。</p>
                <button className="btn btn--primary" onClick={() => setShowSettings(true)} style={{ textAlign: 'center' }}>
                  データを読み込む
                </button>
              </div>
            </div>
          )}
        </div>
        <div style={{ display: screen === 'survey' ? 'block' : 'none', flex: 1, overflowY: 'auto', padding: '0 16px 16px' }}>
          <SurveyTab
            evacuation={evacuation}
            devMode={devMode}
            onSurveyUpdated={() => setSurveyData(loadSurvey())}
          />
        </div>
        <div style={{ display: screen === 'stock' ? 'block' : 'none', flex: 1, minWidth: 0, overflowY: 'auto', padding: '0 16px' }}>
          <StocklistTab />
        </div>
      </main>

      <nav className="bottom-nav">
        {navItems.map(({ id, label, icon }) => (
          <button
            key={id}
            className={`fab ${screen === id ? 'fab--active' : ''}`}
            onClick={() => setScreen(id)}
            aria-label={label}
          >
            <div className="fab__circle">{icon}</div>
            <span className="fab__label">{label}</span>
          </button>
        ))}
      </nav>

      {showSettings && (
        <SettingsOverlay
          index={index}
          manualPlaces={manualPlaces}
          importNote={importNote}
          allPlaces={allPlaces}
          excluded={excluded}
          devMode={devMode}
          onDevModeChange={(on) => {
            setDevMode(on);
            saveDevMode(on);
          }}
          onImportFile={handleImport}
          onManualChange={updateManual}
          onToggleExclude={(id) => {
            const next = new Set(excluded);
            if (next.has(id)) next.delete(id); else next.add(id);
            setExcluded(next);
          }}
          onReset={() => {
            setImportedStays([]);
            setManualPlaces([]);
            clearAllStorage();
            setExcluded(new Set());
            setImportNote(null);
            setEntered(false);
            setSurveyData({});
          }}
          onClose={() => setShowSettings(false)}
        />
      )}

      {selected && (
        <PlaceSheet
          score={selected}
          index={index}
          evacuation={evacuation}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}

function SettingsOverlay({
  index,
  manualPlaces,
  importNote,
  allPlaces,
  excluded,
  devMode,
  onDevModeChange,
  onImportFile,
  onManualChange,
  onToggleExclude,
  onReset,
  onClose,
}: {
  index: ChoChomeIndex | null;
  manualPlaces: ManualPlace[];
  importNote: string | null;
  allPlaces: import('../core/types').Place[];
  excluded: ReadonlySet<string>;
  devMode: boolean;
  onDevModeChange: (on: boolean) => void;
  onImportFile: (f: File) => void;
  onManualChange: (places: ManualPlace[]) => void;
  onToggleExclude: (id: string) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  return (
    <div className="sheet-backdrop" onClick={onClose} role="presentation">
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label="設定"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet__head" style={{ marginBottom: 16 }}>
          <h2 className="sheet__title">設定</h2>
          <button className="linkbtn" onClick={onClose}>閉じる</button>
        </div>

        {importNote && <p className="note" style={{ marginBottom: 12 }}>{importNote}</p>}

        <div className="section-title">位置履歴の読み込み</div>
        <p className="note" style={{ marginBottom: 8 }}>
          Google タイムラインの JSON ファイルを読み込むと、自動でよく行く場所を抽出します。
          ファイルはこの端末内で処理され、外部に送信されません。
        </p>
        <label className="btn" style={{ cursor: 'pointer' }}>
          ファイルを選択
          <input
            type="file"
            accept=".json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onImportFile(f);
            }}
          />
        </label>
        <ManualPlaces index={index} places={manualPlaces} onChange={onManualChange} />

        {allPlaces.length > 0 && (
          <>
            <div className="section-title" style={{ marginTop: 24 }}>場所の除外</div>
            <p className="note" style={{ marginBottom: 8 }}>除外した場所は危険度ランキングに表示されません。</p>
            {allPlaces.map((p) => (
              <div key={p.id} className="exclude-row">
                <span className={`exclude-row__name${excluded.has(p.id) ? ' exclude-row__name--off' : ''}`}>{p.name}</span>
                <button
                  className={`btn btn--sm${excluded.has(p.id) ? '' : ' btn--ghost'}`}
                  onClick={() => onToggleExclude(p.id)}
                >
                  {excluded.has(p.id) ? '戻す' : '除外'}
                </button>
              </div>
            ))}
          </>
        )}

        <div className="section-title" style={{ marginTop: 24 }}>プライバシー</div>
        <div className="privacy-note">
          <strong>位置履歴はこの端末から出ません。</strong>
          <br />
          滞在の抽出・ハザード判定・避難場所割当はすべてブラウザ内で完結。
          地図背景（地理院タイル）は表示範囲が、経路探索は座標が外部に渡ります。
        </div>

        <div className="section-title" style={{ marginTop: 24 }}>データの出典</div>
        <div className="source-note">
          <p>
            「地震に関する地域危険度測定調査（第9回）」（東京都、
            <a href="https://creativecommons.org/licenses/by/4.0/deed.ja" target="_blank" rel="noreferrer">CC BY 4.0</a>
            ）を<strong>加工して作成</strong>。
            公表の5段階ランクではなく、危険量と都内順位から独自にスコアを算出しています。
          </p>
          <p>
            「東京都の地震時における地域別出火危険度測定（第10回）」（東京消防庁）を
            <strong>加工して作成</strong>。町丁目名を正規化して上記データに結合しています。
          </p>
          <p>
            「震災時火災における避難場所等の一覧」（東京都都市整備局、
            <a href="https://creativecommons.org/licenses/by/4.0/deed.ja" target="_blank" rel="noreferrer">CC BY 4.0</a>
            ）。第9回指定・令和4年9月1日適用。
          </p>
          <p>「妊産婦・乳幼児を守る災害対策ガイドライン」（東京都福祉局）</p>
          <p>
            背景地図：
            <a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noreferrer">地理院タイル</a>
            （国土地理院）／経路探索：
            <a href="https://openrouteservice.org/" target="_blank" rel="noreferrer">openrouteservice</a>
            、©{' '}
            <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>
            {' '}contributors（ODbL）
          </p>
        </div>

        <div className="section-title" style={{ marginTop: 24 }}>開発者モード</div>
        <label className="dev-toggle">
          <div className="dev-toggle__text">
            <div className="dev-toggle__label">開発者モード</div>
            <div className="dev-toggle__desc">現在地を東京内に仮置き・サンプルデータを自動ロード</div>
          </div>
          <div
            className={`toggle-switch ${devMode ? 'toggle-switch--on' : ''}`}
            onClick={() => onDevModeChange(!devMode)}
            role="switch"
            aria-checked={devMode}
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' || e.key === ' ' ? onDevModeChange(!devMode) : null}
          >
            <div className="toggle-switch__thumb" />
          </div>
        </label>

        <button
          className="btn"
          style={{ marginTop: 16 }}
          onClick={() => {
            if (confirm('読み込んだ履歴、手動登録、除外設定、アンケート、備蓄チェックをすべて削除します。よろしいですか？'))
              onReset();
          }}
        >
          すべてのデータを削除
          <span className="btn__sub">アンケート・備蓄チェックも含めて消えます</span>
        </button>
      </div>
    </div>
  );
}
