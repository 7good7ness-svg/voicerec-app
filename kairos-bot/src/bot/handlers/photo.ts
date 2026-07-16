import type { Telegraf } from 'telegraf';
import { message } from 'telegraf/filters';
import { extractReceipt } from '../../ai/parser.js';
import { recordAndReply } from './shared.js';

export function registerPhoto(bot: Telegraf): void {
  bot.on(message('photo'), async (ctx) => {
    const userId = ctx.from?.id ?? 0;
    // 最も解像度の高い写真を選ぶ
    const photos = ctx.message.photo;
    const largest = photos[photos.length - 1];
    if (!largest) return;

    await ctx.sendChatAction('typing');
    await ctx.reply('📸 レシートを読み取っています…');

    try {
      const link = await ctx.telegram.getFileLink(largest.file_id);
      const resp = await fetch(link.href);
      if (!resp.ok) throw new Error(`download failed: ${resp.status}`);
      const buf = Buffer.from(await resp.arrayBuffer());
      const base64 = buf.toString('base64');

      const item = await extractReceipt(base64, 'image/jpeg');
      if (!item) {
        await ctx.reply(
          'レシートから金額を読み取れませんでした。手入力（例:「スーパー 1580円」）でも記録できます。',
        );
        return;
      }
      await recordAndReply(ctx, userId, [item]);
    } catch (err) {
      console.error('receipt error:', err);
      await ctx.reply('画像の処理中にエラーが発生しました。もう一度お試しください。');
    }
  });
}
