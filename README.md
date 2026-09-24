# ココリス（cocoris）

> あなたのいつもの場所を、覚えている。

災害の種類も見るべき地図も多すぎる。ココリスは**あなたがよく行く場所だけ**を1枚にまとめ、
**逃げるならどこへ行くのか**まで出すWebアプリ。時刻も災害種別も選ばせない。

都知事杯オープンデータ・ハッカソン 2026 提出作品。

## 動かす

```bash
npm install
npm run dev
```

```bash
npm test
```

同梱データ（`public/data/`）はリポジトリに含まれている。作り直す場合のみ以下:

```bash
python scripts/build_dataset.py     # 町丁目とハザード
python scripts/build_evacuation.py  # 避難場所の割当
```

## 避難経路（OpenRouteService の設定）

経路を道なりで描くには OpenRouteService（ORS、HeiGIT運営・非営利）の鍵が要る。
**無くても動く**（直線を点線で描き、「実際の道のりではありません」と画面に明示する）。

Mapbox ではなく ORS を使っている。Mapbox はトークン発行にクレジットカード登録が必須だが、
ORS はメールアドレスだけで無料枠（1日2,500件）が使える。カードを登録していないので、
鍵が漏れても金銭被害が発生しない。

1. https://openrouteservice.org/dev/#/signup でサインアップ（カード不要）
2. メール認証後、https://openrouteservice.org/dev/#/home でトークンを発行（プランは Standard）
3. プロジェクト直下に `.env.local` を作る

```bash
VITE_ORS_TOKEN=ここに鍵
VITE_GEMINI_TOKEN=ここにGemini鍵
```

`VITE_GEMINI_TOKEN` は Google AI Studio（aistudio.google.com）で発行する。
無くても動く（AIアドバイス欄が非表示になるだけ）。
無料枠は 15 RPM なので、連続でタップすると 429 になる場合がある。

4. 開発サーバーを**再起動**する（環境変数は起動時にしか読まれない）

`VITE_` の接頭辞は必須。これが付いた変数だけが Vite でクライアントに露出する。

### 鍵は隠せない

静的サイトなので、ビルド成果物に埋め込んだ文字列は必ず読める。難読化は無意味。
ORS の鍵に Mapbox のような URL制限機能は無いため、鍵は露出したままになる。
ただしカード未登録なので、悪用されても上限（1日2,500件）に達して経路が出なくなるだけで、
その場合は自動で直線表示にフォールバックする。金銭被害は発生しない。

完全に隠すにはプロキシ（Cloudflare Pages Functions 等）が要るが、
バックエンドができるので**「サーバーはありません」が言えなくなる**。
差し替えるなら `src/ui/EvacuationMap.tsx` の fetch 先を変えるだけで済むようにしてある。

⚠️ 経路探索を使う間、**その場所と避難場所の座標が openrouteservice に渡る**。
起動画面と設定画面に明記済み。「位置情報は端末から出ません」と無条件には言わないこと。

元データの取得元とライセンスは [docs/opendata.md](docs/opendata.md)、
実測した中身は [docs/data-findings.md](docs/data-findings.md) を見ること。

## 位置情報の扱い

**位置履歴は端末から出ない。** 位置履歴はブラウザが File API で直接読み、滞在の抽出も
町丁目の判定もブラウザ内で完結する。ハザードデータ（都内5,192町丁目、gzip 約0.84MB）を
アプリに同梱しているため、座標も町丁目コードもサーバーへ送らない。バックエンドは無い。

ただし外部に伝わるものが2つある。地図の背景（地理院タイル）は**表示中の地図範囲**が、
避難経路の探索は**その場所と避難場所の座標**が、それぞれの提供元に渡る。
起動画面と設定画面に明記してある。「位置情報は端末から出ません」と無条件には言わないこと。

## 構成

```
src/core/    DOM非依存の純TS。ロジックは全てここ（localStorage も使わない）
src/ui/      React。ネイティブ移植時はここだけ差し替える
src/data/    サンプルデータ（乳幼児の親ペルソナ）
scripts/     元データの取得・検証・変換（Python）
public/data/ 同梱するハザードデータ
docs/        引き継ぎ・実測結果・提出用資料
```

`src/core/` に `document` / `window` / React を持ち込まないこと。
将来 React Native へ移植する際、そのまま持っていける状態を保つため。

## デプロイ

静的サイトなので `npm run build` の出力（`dist/`）をそのまま置くだけ。
バックエンドは無く、Cloudflare の有料機能も使っていないので**無料プランで足りる**
（5ファイル / 6.0MB、最大ファイル4.65MB）。ハッカソン特典が切れても運用は続く。

```bash
npm run build
npx wrangler pages deploy dist --project-name cocoris
```

初回は Cloudflare アカウントでのログインが必要。
gitリポジトリは不要（`dist/` を直接アップロードする）。
そのため**位置履歴を含むリポジトリを外部に置かずに済む**。

### 配信で気をつけること

- ハザードデータの拡張子は **`.geojson` ではなく `.json`**。`application/geo+json` は
  CDNの圧縮対象MIMEタイプに含まれないことがあり、4.65MBが無圧縮で配信される恐れがある。
  `.json` なら `application/json` として確実に圧縮される（4.65MB → gzip 0.84MB）
- 実転送量は合計およそ 1.3MB（町丁目0.84 + 避難0.08 + JS 0.36 + CSS）
- サブパス配信にすると `/data/chochome.json` の絶対パスが壊れる。
  ドメイン直下に置くか、`vite.config.ts` の `base` を設定すること

## 現状

実装状況・設計判断・未解決事項は [docs/status.md](docs/status.md)。
