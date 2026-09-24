/**
 * ココリスの内部データ形式。
 *
 * DOM に依存しない純粋な TypeScript として書くこと（src/core/ 全体の規約）。
 * 将来 React Native へ移植する際は src/ui/ だけを差し替え、ここはそのまま持っていく。
 */

/**
 * 滞在1件。すべての入力経路（Googleタイムライン / 手動登録 / サンプル）は
 * まずこの形に変換してから先へ流す。
 */
export interface StayPoint {
  /** 入力経路内で一意なら何でもよい */
  id: string;
  lat: number;
  lng: number;
  /** 滞在開始・終了。ローカル時刻として扱う */
  startTime: Date;
  endTime: Date;
  /** タイムラインが場所名を持っている場合のみ。無くても動く */
  name?: string;
}

/** 町丁目1件のハザード属性。public/data/chochome.json の properties と1対1。 */
export interface ChoChome {
  id: number;
  city: string;
  town: string;
  /** 地盤分類。台地1 / 沖積低地4 / 谷底低地2 など12種 */
  ground: string | null;

  /** 建物倒壊危険量（棟/ha）。5段階ランクではなく、こちらでスコアを作る */
  collapseQty: number;
  /** 都内順位。1 = 最も危険（荒川区荒川6丁目が総合1位） */
  collapseOrder: number;
  /** 相対評価5段階。表示の補助にのみ使い、スコアには使わない */
  collapseRank: number;
  /** 火災危険量（棟/ha） */
  fireQty: number;
  fireOrder: number;
  fireRank: number;
  /** 災害時活動困難係数 */
  difficulty: number;
  /** 元データに順位が無いので build_dataset.py で作っている。1 = 都内で最も厳しい */
  difficultyOrder: number;
  totalQty: number;
  totalOrder: number;
  totalRank: number;

  /** 東京消防庁 出火危険度（第10回）。区画整理による時点差で22町丁目は null */
  shukkaWinterEve: number | null;
  shukkaSummerNoon: number | null;
  shukkaWoodWinterEve: number | null;
  shukkaNonWoodWinterEve: number | null;
}

export type DayType = 'weekday' | 'weekend' | 'holiday';

/**
 * 「いま何時を見ているか」。アプリ全体で1つだけ持つグローバル状態。
 * ランキングと地図がこれを共有していることが、時間軸を扱っている証明になる。
 */
export interface TimeContext {
  dayType: DayType;
  /** 0-23 */
  hour: number;
}

/**
 * リスクを評価する時期。行動パターンの期間とは分離する（handoff §6-4）。
 * 出火危険度が持っているのがこの2つなので、選べるのもこの2つ。
 */
export type Season = 'winterEve' | 'summerNoon';

/** 同じ場所への滞在をまとめたもの。ランキングの単位。 */
export interface Place {
  id: string;
  /** 代表座標（滞在群の重心） */
  lat: number;
  lng: number;
  name: string;
  /** この場所に紐づく滞在。時刻順 */
  stays: StayPoint[];
  /** 重心が属する町丁目。市街化区域外なら null */
  choChome: ChoChome | null;
}
