import { Telegraf } from 'telegraf';
import { config } from '../config.js';
import { upsertUser } from '../db/repositories.js';
import { registerCommands } from './handlers/commands.js';
import { registerText } from './handlers/text.js';
import { registerPhoto } from './handlers/photo.js';
import { registerCallbacks } from './handlers/callbacks.js';

export function createBot(): Telegraf {
  const bot = new Telegraf(config.telegramToken);

  // 全メッセージでユーザーを登録（初回のみ実質作用）
  bot.use(async (ctx, next) => {
    if (ctx.from && !ctx.from.is_bot) {
      upsertUser(ctx.from.id, ctx.from.first_name ?? '');
    }
    return next();
  });

  registerCommands(bot);
  registerCallbacks(bot);
  registerPhoto(bot);
  registerText(bot); // テキストは最後（メニュー/自由入力の受け皿）

  bot.catch((err, ctx) => {
    console.error(`Telegraf error for ${ctx.updateType}:`, err);
  });

  return bot;
}
