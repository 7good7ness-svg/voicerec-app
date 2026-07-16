import { migrate } from './db/database.js';
import { createBot } from './bot/bot.js';
import { config } from './config.js';

async function main(): Promise<void> {
  migrate();
  const bot = createBot();

  // Telegram のコマンドメニューを登録
  await bot.telegram.setMyCommands([
    { command: 'start', description: 'はじめる' },
    { command: 'help', description: '使い方' },
    { command: 'report', description: '今月のまとめ' },
    { command: 'recent', description: '直近の記録' },
    { command: 'budget', description: '予算の確認' },
    { command: 'tax', description: '税金の概算' },
    { command: 'export', description: 'CSV出力' },
  ]);

  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));

  console.log(`Kairos bot 起動中… (model=${config.claudeModel}, tz=${config.timezone})`);
  await bot.launch();
}

main().catch((err) => {
  console.error('起動に失敗しました:', err);
  process.exit(1);
});
