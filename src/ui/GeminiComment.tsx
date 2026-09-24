import { useEffect, useRef, useState } from 'react';

import type { Season } from '../core/types';
import { TOTAL_CHOCHOME } from '../core/scoring';
import { seasonLabel } from '../core/explain';
import type { ChoChome } from '../core/types';

const TOKEN = import.meta.env.VITE_GEMINI_TOKEN as string | undefined;
const API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent';

function buildPrompt(c: ChoChome, season: Season): string {
  const sl = seasonLabel(season);
  const shukka = season === 'winterEve' ? c.shukkaWinterEve : c.shukkaSummerNoon;
  const shukkaOther = season === 'winterEve' ? c.shukkaSummerNoon : c.shukkaWinterEve;
  const otherLabel = season === 'winterEve' ? '夏の昼' : '冬の夕方';

  return `あなたは東京都の防災アドバイザーです。
赤ちゃん（乳幼児）を連れた親御さんに向けて、以下のデータが示す危険性を2〜3文で説明してください。

## データ
- 地域: ${c.city}${c.town}
- 地盤: ${c.ground ?? '不明'}
- 建物倒壊量: 都内${c.collapseOrder}位（全${TOTAL_CHOCHOME}町丁目中）
- 延焼量: 都内${c.fireOrder}位
- 出火危険度（${sl}）: ${shukka != null ? `ランク${shukka}/5` : 'データなし'}${shukkaOther != null ? `、（${otherLabel}はランク${shukkaOther}/5）` : ''}
- 消防活動困難度: 都内${c.difficultyOrder}位

## 指示
- 「どういうことか」と「赤ちゃん連れとしてどうすればよいか」が伝わるよう書く
- 絶対的な確率（○%など）は使わない。都内での相対的な位置づけで表現する
- 出火危険度が季節で変わる場合はその旨を一言触れる
- 専門用語は避け、読みやすい日本語で
- 2〜3文、箇条書きにしない、語尾は「です・ます調」`;
}

async function fetchOnce(c: ChoChome, season: Season): Promise<{ text?: string; status: number }> {
  if (!TOKEN) return { status: 0 };
  const res = await fetch(`${API_URL}?key=${TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: buildPrompt(c, season) }] }],
      generationConfig: { maxOutputTokens: 300, temperature: 0.4 },
    }),
  });
  if (!res.ok) return { status: res.status };
  const json = await res.json();
  return { text: json.candidates?.[0]?.content?.parts?.[0]?.text ?? '', status: 200 };
}

async function fetchComment(c: ChoChome, season: Season): Promise<string> {
  if (!TOKEN) throw new Error('no token');
  const first = await fetchOnce(c, season);
  if (first.status === 200 && first.text !== undefined) return first.text;
  if (first.status === 429) {
    // レート制限 → 3秒待ってリトライ
    await new Promise((r) => setTimeout(r, 3000));
    const retry = await fetchOnce(c, season);
    if (retry.status === 200 && retry.text !== undefined) return retry.text;
    if (retry.status === 429) throw new Error('rate_limit');
    throw new Error(`Gemini ${retry.status}`);
  }
  throw new Error(`Gemini ${first.status}`);
}

/** Gemini によるAIコメント。choChome が変わるたびに再生成する */
export function GeminiComment({ c, season }: { c: ChoChome; season: Season }) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cacheRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    if (!TOKEN) return;
    const key = `${c.id}-${season}`;
    const cached = cacheRef.current.get(key);
    if (cached) { setText(cached); return; }

    setText(null);
    setError(null);
    fetchComment(c, season)
      .then((t) => {
        cacheRef.current.set(key, t);
        setText(t);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [c.id, season]);

  if (!TOKEN) return null;
  if (error === 'rate_limit') return <div className="why why--loading">AIが混み合っています。しばらくすると表示されます。</div>;
  if (error) return null;
  if (!text) {
    return (
      <div className="why why--accent why--loading">
        AIがこの地域を分析しています…
      </div>
    );
  }
  return <div className="why why--accent">{text}</div>;
}
