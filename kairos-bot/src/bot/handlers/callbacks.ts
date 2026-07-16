import type { Telegraf } from 'telegraf';
import { deleteTransaction } from '../../db/repositories.js';

export function registerCallbacks(bot: Telegraf): void {
  // 「取消」ボタン: del:<txId>
  bot.action(/^del:(\d+)$/, async (ctx) => {
    const userId = ctx.from?.id ?? 0;
    const txId = Number(ctx.match[1]);
    const ok = deleteTransaction(userId, txId);
    await ctx.answerCbQuery(ok ? '取り消しました' : '取り消せませんでした');
    if (ok) {
      try {
        await ctx.editMessageText('↩️ 記録を取り消しました。');
      } catch {
        /* メッセージが古い等は無視 */
      }
    }
  });
}
