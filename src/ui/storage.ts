import type { ManualPlace } from '../core/manual';

/**
 * localStorage ラッパー。
 * core/ ではなく ui/ に置いているのは localStorage が React Native に無いため。
 * 移植時はここだけを AsyncStorage 等に差し替える。
 */

// ---- 手動登録 -------------------------------------------------------

const MANUAL_KEY = 'cocoris.manualPlaces.v1';

export function loadManualPlaces(): ManualPlace[] {
  try {
    const raw = localStorage.getItem(MANUAL_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ManualPlace[]) : [];
  } catch {
    return [];
  }
}

export function saveManualPlaces(places: ManualPlace[]): void {
  try {
    localStorage.setItem(MANUAL_KEY, JSON.stringify(places));
  } catch { /* 容量超過やプライベートモード */ }
}

export function clearManualPlaces(): void {
  try {
    localStorage.removeItem(MANUAL_KEY);
  } catch { /* 無視 */ }
}

// ---- 赤ちゃんの誕生月 -----------------------------------------------

const BABY_KEY = 'cocoris.babyBirth.v1';

/** YYYY-MM 形式で保存 */
export function loadBabyBirth(): string | null {
  try {
    return localStorage.getItem(BABY_KEY);
  } catch {
    return null;
  }
}

export function saveBabyBirth(yyyyMM: string): void {
  try {
    localStorage.setItem(BABY_KEY, yyyyMM);
  } catch { /* 無視 */ }
}

export function clearBabyBirth(): void {
  try {
    localStorage.removeItem(BABY_KEY);
  } catch { /* 無視 */ }
}

// ---- 避難所アンケート ------------------------------------------------

export type SurveyEntry = {
  /** 授乳・おむつ替えスペース */
  nursing: boolean | null;
  /** アレルギー対応食 */
  allergy: boolean | null;
  /** 簡易ベッド */
  bed: boolean | null;
  updatedAt: string;
};

export type SurveyData = Record<number, SurveyEntry>; // keyed by site.no

const SURVEY_KEY = 'cocoris.survey.v1';

export function loadSurvey(): SurveyData {
  try {
    const raw = localStorage.getItem(SURVEY_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as SurveyData;
  } catch {
    return {};
  }
}

export function saveSurveyEntry(siteNo: number, entry: SurveyEntry): void {
  try {
    const data = loadSurvey();
    data[siteNo] = entry;
    localStorage.setItem(SURVEY_KEY, JSON.stringify(data));
  } catch { /* 無視 */ }
}

export function clearSurvey(): void {
  try {
    localStorage.removeItem(SURVEY_KEY);
  } catch { /* 無視 */ }
}

// ---- 備蓄チェックリスト ---------------------------------------------

const STOCK_KEY = 'cocoris.stockChecked.v1';

export function loadStockChecked(): Set<string> {
  try {
    const raw = localStorage.getItem(STOCK_KEY);
    if (!raw) return new Set();
    const arr: unknown = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? (arr as string[]) : []);
  } catch {
    return new Set();
  }
}

export function saveStockChecked(checked: Set<string>): void {
  try {
    localStorage.setItem(STOCK_KEY, JSON.stringify([...checked]));
  } catch { /* 無視 */ }
}

// ---- 開発者モード ---------------------------------------------------

const DEV_KEY = 'cocoris.devMode.v1';

export function loadDevMode(): boolean {
  try {
    return localStorage.getItem(DEV_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveDevMode(on: boolean): void {
  try {
    if (on) localStorage.setItem(DEV_KEY, '1');
    else localStorage.removeItem(DEV_KEY);
  } catch { /* 無視 */ }
}

export function clearAll(): void {
  clearManualPlaces();
  clearBabyBirth();
  clearSurvey();
  try {
    localStorage.removeItem(STOCK_KEY);
  } catch { /* 無視 */ }
}
