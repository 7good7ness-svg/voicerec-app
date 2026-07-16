# Kairos Bot 🤖 — AI秘書型 経費管理ボット

[kairos.ac](https://kairos.ac/ja) 風の **AI秘書型 経費管理・記録ボット** を、Telegram + Claude API で実装したものです。
チャットに「ランチ 1200円」と送るだけ、レシート写真を送るだけで、AIが勘定科目を判定して帳簿に記録します。

## ✨ 特長・機能

| 機能 | 説明 |
|------|------|
| 💬 **自然文で記録** | `ランチ 1200円` `タクシー 3000 打合せ` `売上 5万` を送るだけ。Claudeが金額・カテゴリ・支払先を抽出 |
| 📸 **レシートOCR** | レシート写真を送ると Claude Vision が合計・店名・日付を自動読取り |
| 🏷️ **勘定科目 自動仕分け** | 旅費交通費・接待交際費・通信費など、確定申告の科目に自動分類 |
| 💰 **収入も管理** | 売上・報酬・雑収入を記録し、収支を可視化 |
| ❓ **自然文で質問** | `今月の交通費は？` `先月いくら使った？` にAIが帳簿データだけを根拠に回答 |
| 📊 **月次レポート** | 収入・経費・収支・カテゴリ内訳をテキストバーグラフで表示 |
| 🎯 **予算アラート** | `通信費の予算を1万円に` で設定。80%到達・超過時に自動警告 |
| 🧮 **税金の概算** | 事業所得から所得税・復興特別所得税をざっくり試算（目安） |
| 📤 **CSV出力** | 税理士連携・会計ソフト取込用のCSV（BOM付き）をファイル送信 |
| ↩️ **ワンタップ取消** | 記録直後の「取り消す」ボタンで即削除 |

> さらに便利に: レシートOCR / 予算アラート / 税金概算 / CSV出力 は元サービスにない拡張機能です。

## 🏗️ 技術構成

- **Node.js 20+ / TypeScript**（ESM）
- **[Telegraf](https://telegraf.js.org/)** — Telegram Bot フレームワーク
- **[@anthropic-ai/sdk](https://www.npmjs.com/package/@anthropic-ai/sdk)** — Claude（既定 `claude-opus-4-8`）
- **better-sqlite3** — ローカル完結の軽量DB
- **zod** — 構造化出力の実行時バリデーション

```
src/
├─ index.ts            # 起動エントリ
├─ config.ts           # 環境変数
├─ types.ts            # 型・カテゴリ定義
├─ db/                 # SQLite + リポジトリ
├─ ai/                 # Claude連携（意図分類・OCR・QA）
├─ services/           # 記録 / レポート / 予算 / 税 / CSV
├─ bot/                # Telegraf 本体
│  ├─ handlers/        # commands / text / photo / callbacks
│  └─ keyboards.ts
└─ utils/              # 日付・整形
```

## 🚀 セットアップ

### 1. Telegram Bot トークンを取得
Telegram で [@BotFather](https://t.me/BotFather) に `/newbot` を送り、表示された **Bot Token** を控えます。

### 2. Anthropic API キーを取得
[console.anthropic.com](https://console.anthropic.com/) でAPIキーを発行します。

### 3. 環境変数を設定
```bash
cd kairos-bot
cp .env.example .env
# .env を編集して TELEGRAM_BOT_TOKEN と ANTHROPIC_API_KEY を記入
```

### 4. 依存インストール & 起動
```bash
npm install
npm run dev      # 開発（tsx watch）
# または
npm run build && npm start   # 本番
```

起動後、Telegram で作成した Bot に話しかけてください。まずは `/start`。

## 💡 使い方の例

```
あなた: スタバ 580 打合せ
Kairos: ✅ 記録しました
        💸 2026-07-16 会議費 スタバ ¥580（打合せ）

あなた: 通信費の予算を1万円に
Kairos: 🎯 予算を設定しました。通信費: ¥10,000/月

あなた: 今月の交際費いくら？
Kairos: 今月の接待交際費は ¥12,400（3件）です。

あなた: （レシート写真を送信）
Kairos: 📸 レシートを読み取っています…
        ✅ 記録しました
        💸 2026-07-16 消耗品費 ○○ストア ¥1,580
```

## 💸 コストについて
既定モデルは高精度な `claude-opus-4-8` です。メッセージ量が多くコストを抑えたい場合は、
`.env` の `CLAUDE_MODEL=claude-haiku-4-5` に変更すると安価・高速になります。

## 🔌 LINE 対応について
現状は Telegram 実装です。ロジック（`ai/` `services/` `db/`）はメッセージ基盤に依存しないため、
`bot/` 相当の LINE Messaging API アダプタを追加すれば LINE でも動かせます。

## ⚠️ 免責
税金の概算はあくまで目安です（住民税・国保・各種控除は未反映）。正式な申告は税理士にご相談ください。
