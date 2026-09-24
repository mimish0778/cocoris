import type { EvacuationAnswer, EvacuationIndex } from '../core/evacuation';
import { walkMinutes } from '../core/evacuation';
import { toStars } from '../core/scoring';
import type { PlaceScore } from '../core/scoring';
import type { SurveyData } from './storage';
import { SurveyBadges } from './SurveyTab';
import { RiskLevel } from './RiskIcon';

export function RankingTab({
  home,
  ranked,
  evacuation,
  surveyData,
  onSelect,
  onGoSettings,
}: {
  home: PlaceScore | null;
  ranked: PlaceScore[];
  evacuation: EvacuationIndex | null;
  surveyData: SurveyData;
  onSelect: (s: PlaceScore) => void;
  onGoSettings: () => void;
}) {
  if (!home && ranked.length === 0) {
    return (
      <div className="empty">
        <h2>まだ場所が登録されていません</h2>
        <p>
          よく行く場所を登録すると、そこのリスクと避難先が出ます。
          <br />
          位置履歴の読み込みでもかまいません。
        </p>
        <button className="btn btn--primary" onClick={onGoSettings} style={{ textAlign: 'center' }}>
          場所を登録する
        </button>
      </div>
    );
  }

  return (
    <>
      {home && (
        <>
          <div className="section-title">あなたの拠点</div>
          <PlaceCard score={home} evacuation={evacuation} surveyData={surveyData} onSelect={onSelect} />
        </>
      )}

      <div className="section-title">よく行く場所</div>
      {ranked.map((s, i) => (
        <PlaceCard
          key={s.place.id}
          score={s}
          rank={i + 1}
          evacuation={evacuation}
          surveyData={surveyData}
          onSelect={onSelect}
        />
      ))}
      {ranked.length === 0 && (
        <p className="note">自宅以外に、よく行く場所がまだ見つかっていません。</p>
      )}

      <p className="note">
        並び順は「1週間あたり、危険度で重み付けした滞在時間」です。
        長くいる場所ほど、そして危険度の高い場所ほど上に来ます。
      </p>
    </>
  );
}

export function EvacuationLine({ answer, surveyData }: { answer: EvacuationAnswer; surveyData?: SurveyData }) {
  if (answer.kind === 'stay') {
    return <span className="evac evac--stay">この地区は広域避難の必要なし</span>;
  }
  if (answer.kind === 'evacuate') {
    return (
      <>
        <span className="evac evac--go">
          {answer.site.name} へ 徒歩{walkMinutes(answer.distanceM)}分
        </span>
        {surveyData && <SurveyBadges siteNo={answer.site.no} surveyData={surveyData} />}
      </>
    );
  }
  return <span className="evac evac--none">避難場所の指定範囲外</span>;
}

function PlaceCard({
  score,
  rank,
  evacuation,
  surveyData,
  onSelect,
}: {
  score: PlaceScore;
  rank?: number;
  evacuation: EvacuationIndex | null;
  surveyData: SurveyData;
  onSelect: (s: PlaceScore) => void;
}) {
  const { place, hazard, hoursPerWeek, isHome } = score;
  const answer = evacuation?.lookup(place.lat, place.lng) ?? { kind: 'unknown' as const };

  return (
    <button
      className={isHome ? 'card card--home' : 'card'}
      onClick={() => onSelect(score)}
      aria-label={`${place.name} の詳細`}
    >
      <div className="card__top">
        {rank != null && <span className="card__rank">{rank}</span>}
        {isHome && <span className="badge badge--home">自宅</span>}
        <span className="card__name">{place.name}</span>
        {place.choChome ? (
          <RiskLevel value={toStars(hazard.overall)} />
        ) : (
          <span className="row__na">データなし</span>
        )}
      </div>

      <div className="card__meta">
        <span>
          {place.choChome ? `${place.choChome.city}${place.choChome.town}` : '対象範囲外'}
        </span>
        <span>週{hoursPerWeek < 1 ? hoursPerWeek.toFixed(1) : Math.round(hoursPerWeek)}時間</span>
      </div>

      <EvacuationLine answer={answer} surveyData={surveyData} />
    </button>
  );
}
