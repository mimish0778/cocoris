import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import type { ChoChomeIndex } from '../core/chochome';
import type { EvacuationIndex } from '../core/evacuation';
import { walkMinutes } from '../core/evacuation';
import { currentSeason, explainRisk, seasonLabel } from '../core/explain';
import { dangerPercentile, toStars } from '../core/scoring';
import type { PlaceScore } from '../core/scoring';
import { EvacuationMap, HAS_ORS_TOKEN, type RouteState } from './EvacuationMap';
import { GeminiComment } from './GeminiComment';
import { RiskLevel } from './RiskIcon';

export function PlaceSheet({
  score,
  index,
  evacuation,
  onClose,
}: {
  score: PlaceScore;
  index: ChoChomeIndex | null;
  evacuation: EvacuationIndex | null;
  onClose: () => void;
}) {
  const { place, hoursPerWeek, hazard } = score;
  const c = place.choChome;
  const season = useMemo(() => currentSeason(), []);
  const answer = evacuation?.lookup(place.lat, place.lng) ?? { kind: 'unknown' as const };
  const [route, setRoute] = useState<RouteState>({ kind: 'none' });
  const [closing, setClosing] = useState(false);
  const touchStartY = useRef(0);

  const handleClose = () => {
    setClosing(true);
  };

  const handleAnimationEnd = () => {
    if (closing) onClose();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div
      className={`sheet-backdrop${closing ? ' sheet-backdrop--closing' : ''}`}
      onClick={handleClose}
      role="presentation"
    >
      <div
        className={`sheet${closing ? ' sheet--closing' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={`${place.name} の詳細`}
        onClick={(e) => e.stopPropagation()}
        onAnimationEnd={handleAnimationEnd}
      >
        {/* ドラッグハンドル — ここを下に引くと閉じる */}
        <div
          className="sheet__handle"
          onTouchStart={(e) => { touchStartY.current = e.touches[0].clientY; }}
          onTouchMove={(e) => {
            if (e.touches[0].clientY - touchStartY.current > 60) handleClose();
          }}
        >
          <div className="sheet__handle-bar" />
        </div>

        <div className="sheet__head">
          <h2 className="sheet__title">{place.name}</h2>
          {c ? (
            <RiskLevel value={toStars(hazard.overall)} />
          ) : (
            <span className="row__na">データなし</span>
          )}
        </div>
        <p className="sheet__sub">
          {c ? `${c.city}${c.town}／地盤 ${c.ground ?? '不明'}` : '地域危険度の対象範囲外'}
          　週{hoursPerWeek < 1 ? hoursPerWeek.toFixed(1) : Math.round(hoursPerWeek)}時間
        </p>

        <EvacuationMap
          index={index}
          evacuation={evacuation}
          lat={place.lat}
          lng={place.lng}
          answer={answer}
          onRouteState={setRoute}
        />

        <div className="evacbox">
          {answer.kind === 'stay' && (
            <>
              <div className="evacbox__head evacbox__head--stay">この地区は逃げなくてよい</div>
              <p className="evacbox__body">
                <strong>{answer.areaName}</strong> は東京都が指定する<strong>地区内残留地区</strong>です。
                不燃化が進んでいて、大規模な延焼火災のおそれが小さいため、広域避難の必要がありません。
              </p>
            </>
          )}
          {answer.kind === 'evacuate' && (
            <>
              <div className="evacbox__head">{answer.site.name} へ</div>
              <p className="evacbox__body">
                {route.kind === 'walking' ? (
                  <>
                    徒歩でおよそ<strong>{route.minutes}分</strong>（{route.meters.toLocaleString()}m）。
                    地図の線は歩行者向けの経路です。
                  </>
                ) : (
                  <>
                    直線で<strong>{Math.round(answer.distanceM).toLocaleString()}m</strong>、
                    徒歩の目安<strong>{walkMinutes(answer.distanceM)}分</strong>。
                    地図の点線は直線であり、実際の道のりではありません。
                  </>
                )}
              </p>
            </>
          )}
          {answer.kind === 'unknown' && (
            <>
              <div className="evacbox__head evacbox__head--none">避難場所の指定範囲外</div>
              <p className="evacbox__body">
                東京都の避難場所の指定は区部が中心で、多摩地域や都外は対象外です。
                お住まいの自治体の案内を確認してください。
              </p>
            </>
          )}
          <p className="note">
            東京都「震災時火災における避難場所及び避難道路等の指定（第9回・令和4年9月適用）」。
            <strong>最寄りではなく、東京都が地区ごとに割り当てた避難場所</strong>です。
          </p>
        </div>

        <hr />

        <div className="section-label">リスク概要</div>
        <div className="why">{explainRisk(c, season)}</div>
        {c && (
          <>
            <div className="section-label section-label--ai">AIアドバイス ✦</div>
            <GeminiComment c={c} season={season} />
          </>
        )}

        {c && (
          <>
            <hr />
            <div className="rowgroup__title">危険度の内訳（5段階）</div>
            <Row label="建物倒壊">
              <RiskLevel value={toStars(hazard.collapse)} />
            </Row>
            <Row label="火災（延焼）">
              <RiskLevel value={toStars(hazard.fire)} />
            </Row>
            <Row label={`出火（${seasonLabel(season)}）`}>
              {(() => {
                const rank = season === 'winterEve' ? c.shukkaWinterEve : c.shukkaSummerNoon;
                return rank == null
                  ? <span className="row__na">データなし</span>
                  : <RiskLevel value={rank} />;
              })()}
            </Row>
            <Row label="救助困難">
              <RiskLevel value={toStars(dangerPercentile(c.difficultyOrder))} />
            </Row>
          </>
        )}

        {!HAS_ORS_TOKEN && (
          <p className="note">経路は直線表示です（経路探索の鍵が未設定）。</p>
        )}

        <div className="sheet__actions">
          <button className="btn btn--primary" style={{ flex: 1 }} onClick={handleClose}>
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children?: ReactNode }) {
  return (
    <div className="row">
      <span className="row__label">{label}</span>
      {children}
    </div>
  );
}
