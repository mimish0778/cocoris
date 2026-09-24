import { weightAt } from './decay';
import { durationMinutes } from './places';
import type { ChoChome, DayType, Place, TimeContext } from './types';

/**
 * スコアリング。
 *
 * 災害リスク学の標準的な分解に揃える（handoff §4）:
 *
 *     個人リスク = ハザード × 曝露 × 脆弱性
 *
 * 場所固有のハザード（建物の耐震性）は昼夜で変わらない。時間で変わるのは
 * 曝露と脆弱性のほう。「夜はこの場所が危険」ではなく
 * 「夜にこの場所にいるあなたにとってのリスクが高い」と言えるのはこの分解による。
 */

/** 地域危険度（第9回）の対象町丁目数。順位を百分位に直す分母 */
export const TOTAL_CHOCHOME = 5192;

/** 順位（1 = 最も危険）を 0-1 の危険度に直す。1位 → 1.0、最下位 → 0.0 */
export function dangerPercentile(order: number, total = TOTAL_CHOCHOME): number {
  return 1 - (order - 1) / (total - 1);
}

/** 0-1 の値を★1〜5に。★の意味はアプリ全体で1種類に統一する（handoff §8） */
export function toStars(value01: number): number {
  return Math.min(5, Math.max(1, Math.ceil(value01 * 5) || 1));
}

// ---------------------------------------------------------------- 曜日区分

/**
 * 祝日は外から与える（YYYY-MM-DD の集合）。内蔵の暦は持たない。
 * 与えられなければ土日のみを休日として扱う。
 */
export type HolidaySet = ReadonlySet<string>;

export function isoDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function dayTypeOf(d: Date, holidays?: HolidaySet): DayType {
  if (holidays?.has(isoDate(d))) return 'holiday';
  const w = d.getDay();
  return w === 0 || w === 6 ? 'weekend' : 'weekday';
}

// ---------------------------------------------------------------- 曝露

/** 曜日区分 × 時刻 ごとの、減衰重み付き滞在分数 */
export type HourGrid = Record<DayType, number[]>;

function emptyGrid(): HourGrid {
  return {
    weekday: new Array(24).fill(0),
    weekend: new Array(24).fill(0),
    holiday: new Array(24).fill(0),
  };
}

export interface ExposureProfile {
  /** 場所ごとの滞在分数グリッド */
  byPlace: Map<string, HourGrid>;
  /** 分母。曜日区分ごとの「観測された日数」（減衰重み付き） */
  observedDays: Record<DayType, number>;
}

/**
 * 滞在を「曜日区分 × 時刻」のグリッドに展開する。
 *
 * 1件の滞在を時刻ごとに切り分けて足すので、日をまたぐ滞在も自然に扱える。
 */
export function buildExposureProfile(
  places: Place[],
  now: Date,
  holidays?: HolidaySet,
): ExposureProfile {
  const byPlace = new Map<string, HourGrid>();
  /**
   * 観測された日付の集合。曝露の分母になる。
   * 重みは日付そのものから計算する。滞在から取ると、同じ日でも
   * どの場所を先に走査したかで分母が変わってしまう。
   */
  const seenDays = new Set<string>();

  for (const place of places) {
    const grid = emptyGrid();
    for (const stay of place.stays) {
      const w = weightAt(stay.startTime, now);
      let cursor = new Date(stay.startTime);
      const end = stay.endTime;

      while (cursor < end) {
        // 次の正時、または滞在終了のうち早いほう
        const nextHour = new Date(cursor);
        nextHour.setMinutes(0, 0, 0);
        nextHour.setHours(nextHour.getHours() + 1);
        const sliceEnd = nextHour < end ? nextHour : end;

        const minutes = (sliceEnd.getTime() - cursor.getTime()) / 60000;
        const dt = dayTypeOf(cursor, holidays);
        grid[dt][cursor.getHours()] += minutes * w;

        seenDays.add(isoDate(cursor));

        cursor = sliceEnd;
      }
    }
    byPlace.set(place.id, grid);
  }

  const observedDays: Record<DayType, number> = { weekday: 0, weekend: 0, holiday: 0 };
  for (const key of seenDays) {
    // その日の 00:00 を基準に重みを出す。滞在の開始時刻に依らず一意に決まる
    const day = new Date(`${key}T00:00:00`);
    observedDays[dayTypeOf(day, holidays)] += weightAt(day, now);
  }

  return { byPlace, observedDays };
}

/**
 * 「その曜日区分のその時刻に、この場所にいる確率」を 0-1 で返す。
 * これが曝露(exposure)。GPS履歴から推定できる唯一の項。
 */
export function exposureAt(
  profile: ExposureProfile,
  placeId: string,
  ctx: TimeContext,
): number {
  const grid = profile.byPlace.get(placeId);
  if (!grid) return 0;

  // 祝日の暦を与えていなければ、履歴側に祝日は1日も存在しない。
  // そのまま計算すると分母が0になり、全ての場所が0%になってしまうので休日で代用する。
  // 代用したことは UI 側で明示すること（黙って別の日の値を出さない）。
  const dayType = usesWeekendFallback(profile, ctx.dayType) ? 'weekend' : ctx.dayType;

  const denom = profile.observedDays[dayType] * 60;
  if (denom <= 0) return 0;
  return Math.min(1, grid[dayType][ctx.hour] / denom);
}

/** 祝日を休日のデータで代用しているかどうか。UIの但し書きの出し分けに使う。 */
export function usesWeekendFallback(profile: ExposureProfile, dayType: DayType): boolean {
  return dayType === 'holiday' && profile.observedDays.holiday <= 0;
}

// ---------------------------------------------------------------- 行動スコア

export interface BehaviorScore {
  /** 減衰重み付きの訪問回数 */
  weightedVisits: number;
  /** 1回あたり平均滞在（分）。減衰重み付き */
  avgMinutes: number;
  /** 直近28日の実訪問回数から出した週あたり回数。UIに出す「週2.5回」はこれ */
  visitsPerWeek: number;
  /** 最終訪問からの経過日数 */
  daysSinceLast: number;
  /** 生活圏スコア。頻度と1回の長さの掛け合わせ */
  score: number;
}

/** 平均滞在をこの分数で頭打ちにする。8時間いれば十分「長い」 */
const DURATION_CAP_MIN = 480;

/** 「週◯回」を出すための集計窓。減衰と違い、こちらは表示のための素朴な実測値 */
const RECENT_WINDOW_DAYS = 28;

/**
 * 生活圏スコア = f(訪問回数, 1回あたり平均滞在, 直近性)。
 *
 * 累積時間だけで並べない（handoff §6-2）。累積時間ソートだと自宅が常に1位で固定され、
 * 画面が動かなくなる。「毎週20分のスーパー」は累積時間では下位でも防災的に意味がある。
 *
 * 直近性は個々の訪問に掛かる減衰重みとして既に効いているので、ここでは別項にしない。
 */
export function behaviorScore(place: Place, now: Date): BehaviorScore {
  let weightedVisits = 0;
  let weightedMinutes = 0;
  let lastEnd = 0;
  let recentVisits = 0;
  const recentCutoff = now.getTime() - RECENT_WINDOW_DAYS * 86400000;

  for (const stay of place.stays) {
    const w = weightAt(stay.startTime, now);
    weightedVisits += w;
    weightedMinutes += w * durationMinutes(stay);
    lastEnd = Math.max(lastEnd, stay.endTime.getTime());
    if (stay.startTime.getTime() >= recentCutoff) recentVisits++;
  }

  const avgMinutes = weightedVisits > 0 ? weightedMinutes / weightedVisits : 0;
  // 頻度は逓減させる。1回と2回の差は大きく、10回と11回の差は小さい
  const freq = Math.log2(1 + weightedVisits);
  // 長さも逓減させる。20分 → 0.20、45分 → 0.31、8時間 → 1.00
  const dur = Math.sqrt(Math.min(avgMinutes, DURATION_CAP_MIN) / DURATION_CAP_MIN);

  return {
    weightedVisits,
    avgMinutes,
    visitsPerWeek: recentVisits / (RECENT_WINDOW_DAYS / 7),
    daysSinceLast: (now.getTime() - lastEnd) / 86400000,
    score: freq * dur,
  };
}

// ---------------------------------------------------------------- ハザード

export interface HazardScore {
  /** いずれも 0-1。都内5,192町丁目の中での相対位置 */
  collapse: number;
  fire: number;
  /** 冬の夕方の出火危険度。5段階しか無いので粒度は粗い */
  shukka: number | null;
  /** 合成。総合危険度の順位をそのまま使う */
  overall: number;
}

/**
 * 出火危険度は**冬の夕方**で固定する。
 *
 * 季節を選ばせない。東京消防庁自身が夏昼・冬夕の両方を測定した上で
 * 「冬の夕方が最も高い」として以降の結果を冬夕中心に示している。
 * 最悪ケースを既定にするのが防災の作法であり、つまみを1つ減らせる。
 * 夏昼との差は「時間でリスクが変わる」事実として詳細画面に出す。
 */
export function hazardScore(c: ChoChome | null): HazardScore {
  if (!c) return { collapse: 0, fire: 0, shukka: null, overall: 0 };
  const rank = c.shukkaWinterEve;
  return {
    collapse: dangerPercentile(c.collapseOrder),
    fire: dangerPercentile(c.fireOrder),
    // 区画整理による時点差で22町丁目は元データに存在しない
    shukka: rank == null ? null : rank / 5,
    overall: dangerPercentile(c.totalOrder),
  };
}

// ---------------------------------------------------------------- 脆弱性

/**
 * 脆弱性 = 逃げにくさ・帰りにくさ。
 *
 * 土台は災害時活動困難係数（消防や救急が入りにくい＝助けが来にくい町丁目ほど高い）で、
 * これは場所固有かつ時間非依存。そこに時間帯の係数を掛ける。
 *
 * ⚠️ 時間帯係数は仮の値。裏付けとなる公開データを当てていない。
 *    JARTIC の交通量で帰宅困難側を実データにできないか検討したが、都内の観測点は
 *    一般国道の32か所だけで都心には存在せず、生活圏の16%しかカバーできないため断念した。
 *    プレゼンでは「この係数は仮置きで、今後実データで較正する」と明言すること。
 */
export const VULNERABILITY_ASSUMPTIONS = {
  /** 就寝中は覚知・初期消火・避難が遅れる。23時〜5時 */
  sleepingHours: [23, 0, 1, 2, 3, 4, 5] as const,
  sleepingFactor: 1.3,
  /** 自宅から離れている時間帯は帰宅困難が乗る。平日8〜21時 */
  awayFromHomeFactor: 1.2,
} as const;

export function vulnerability(
  c: ChoChome | null,
  ctx: TimeContext,
  isHome: boolean,
): number {
  const base = c ? dangerPercentile(c.difficultyOrder) : 0;
  let factor = 1;
  if ((VULNERABILITY_ASSUMPTIONS.sleepingHours as readonly number[]).includes(ctx.hour)) {
    factor *= VULNERABILITY_ASSUMPTIONS.sleepingFactor;
  }
  if (!isHome && ctx.dayType === 'weekday' && ctx.hour >= 8 && ctx.hour <= 21) {
    factor *= VULNERABILITY_ASSUMPTIONS.awayFromHomeFactor;
  }
  return Math.min(1, base * factor);
}

// ---------------------------------------------------------------- 合成

export interface PlaceScore {
  place: Place;
  behavior: BehaviorScore;
  hazard: HazardScore;
  /** 週あたりの滞在時間（減衰重み付き） */
  hoursPerWeek: number;
  /**
   * 週あたりの「リスク時間」= Σ（滞在時間 × ハザード × 逃げにくさ）。
   *
   * 時刻ごとに切り出して見せるのではなく、全時間帯を積分して1つの数字にする。
   * 24時間ぶんのランキングを順に見るのは手間で実用的でないため。
   * 時間軸は消えていない。内部でここに畳み込まれている。
   */
  riskHoursPerWeek: number;
  isHome: boolean;
}

export interface RankingResult {
  /** 別枠で常時表示する自宅。滞在が長く、対策の内容も他と違うため */
  home: PlaceScore | null;
  /** 自宅以外。リスク時間の降順 */
  ranked: PlaceScore[];
}

/**
 * 深夜にいる時間が最も長い場所を自宅とみなす。
 * 0〜5時の滞在分数で決める素朴な方法だが、実用上ほぼ外さない。
 */
export function detectHome(profile: ExposureProfile): string | null {
  let bestId: string | null = null;
  let best = 0;
  for (const [id, grid] of profile.byPlace) {
    let night = 0;
    for (const dt of ['weekday', 'weekend', 'holiday'] as DayType[]) {
      for (let h = 0; h <= 5; h++) night += grid[dt][h];
    }
    if (night > best) {
      best = night;
      bestId = id;
    }
  }
  return bestId;
}

/**
 * 全時間帯を積分して、場所ごとに1つのリスクを出す。
 *
 * 脆弱性は時間帯ごとに違う（就寝中は覚知が遅れる、平日日中の外出先は帰りにくい）ので、
 * セルごとに評価してから足す。合計を観測週数で割るので「週あたり」になる。
 */
export function rankPlaces(
  places: Place[],
  profile: ExposureProfile,
  now: Date,
  holidays?: HolidaySet,
): RankingResult {
  const homeId = detectHome(profile);
  const observedDays =
    profile.observedDays.weekday + profile.observedDays.weekend + profile.observedDays.holiday;
  const weeks = observedDays > 0 ? observedDays / 7 : 1;
  void holidays;

  const scores = places.map<PlaceScore>((place) => {
    const isHome = place.id === homeId;
    const behavior = behaviorScore(place, now);
    const hazard = hazardScore(place.choChome);
    const grid = profile.byPlace.get(place.id);

    let minutes = 0;
    let riskMinutes = 0;
    if (grid) {
      for (const dayType of ['weekday', 'weekend', 'holiday'] as DayType[]) {
        for (let hour = 0; hour < 24; hour++) {
          const m = grid[dayType][hour];
          if (m <= 0) continue;
          minutes += m;
          riskMinutes += m * hazard.overall * vulnerability(place.choChome, { dayType, hour }, isHome);
        }
      }
    }

    return {
      place,
      behavior,
      hazard,
      hoursPerWeek: minutes / 60 / weeks,
      riskHoursPerWeek: riskMinutes / 60 / weeks,
      isHome,
    };
  });

  return {
    home: scores.find((s) => s.isHome) ?? null,
    ranked: scores
      .filter((s) => !s.isHome)
      .sort((a, b) => b.riskHoursPerWeek - a.riskHoursPerWeek),
  };
}

