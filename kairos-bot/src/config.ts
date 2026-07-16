import 'dotenv/config';

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `環境変数 ${name} が設定されていません。.env.example を参考に .env を作成してください。`,
    );
  }
  return v;
}

export const config = {
  telegramToken: required('TELEGRAM_BOT_TOKEN'),
  anthropicApiKey: required('ANTHROPIC_API_KEY'),
  // 既定は Anthropic の最新 Opus。コスト重視なら .env で claude-haiku-4-5 等に変更可。
  claudeModel: process.env.CLAUDE_MODEL ?? 'claude-opus-4-8',
  databasePath: process.env.DATABASE_PATH ?? './data/kairos.db',
  timezone: process.env.TZ ?? 'Asia/Tokyo',
  currency: process.env.DEFAULT_CURRENCY ?? 'JPY',
} as const;

export type AppConfig = typeof config;
