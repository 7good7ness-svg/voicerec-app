import type { Telegraf, Context } from 'telegraf';
import { Input } from 'telegraf';
import { upsertUser, recentTransactions } from '../../db/repositories.js';
import { monthlyReport } from '../../services/reportService.js';
import { taxEstimate } from '../../services/taxService.js';
import { exportCsv } from '../../services/exportService.js';
import { listBudgets } from '../../db/repositories.js';
import { currentYearMonth } from '../../utils/date.js';
import { money, txLine } from '../../utils/format.js';
import { mainMenu } from '../keyboards.js';

const HELP = [
  '🤖 *Kairos — 経費管理AI秘書*',
  '',
  'メッセージを送るだけで記録できます:',
  '・`ランチ 1200円` → 会議費として記録',
  '・`タクシー 3000 打合せ` → 旅費交通費',
  '・`売上 50000` → 収入として記録',
  '・レシート写真を送ると自動で読み取り📸',
  '',
  '質問もできます:',
  '・`今月の交通費は？`',
  '・`先月いくら使った？`',
  '',
  '設定・確認:',
  '・`通信費の予算を1万円に` → 予算設定',
  '・/report 今月のまとめ',
  '・/tax 税金の概算',
  '・/export CSV出力',
  '・/recent 直近の記録',
].join('\n');

function userId(ctx: Context): number {
  return ctx.from?.id ?? 0;
}

export function registerCommands(bot: Telegraf): void {
  bot.start(async (ctx) => {
    upsertUser(ctx.from.id, ctx.from.first_name ?? '');
    await ctx.reply(
      `はじめまして、AI秘書のKairosです。\n${ctx.from.first_name ?? ''}さんの経費と収入を、送るだけで記録します。\n\n下のメニュー、または自由なメッセージでどうぞ。`,
      mainMenu,
    );
    await ctx.reply(HELP, { parse_mode: 'Markdown' });
  });

  bot.help((ctx) => ctx.reply(HELP, { parse_mode: 'Markdown', ...mainMenu }));

  bot.command('report', async (ctx) => {
    const { year, month } = currentYearMonth();
    await ctx.reply(monthlyReport(userId(ctx), year, month), { parse_mode: 'Markdown' });
  });

  bot.command('tax', async (ctx) => {
    const { year } = currentYearMonth();
    await ctx.reply(taxEstimate(userId(ctx), year), { parse_mode: 'Markdown' });
  });

  bot.command('recent', async (ctx) => {
    const rows = recentTransactions(userId(ctx), 15);
    if (rows.length === 0) {
      await ctx.reply('まだ記録がありません。「ランチ 1200円」のように送ってみてください。');
      return;
    }
    await ctx.reply('🧾 直近の記録\n' + rows.map(txLine).join('\n'));
  });

  bot.command('budget', async (ctx) => {
    const budgets = listBudgets(userId(ctx));
    if (budgets.length === 0) {
      await ctx.reply(
        '🎯 予算は未設定です。\n「通信費の予算を1万円に」のように送ると設定できます。',
      );
      return;
    }
    const text = budgets.map((b) => `・${b.category}: ${money(b.monthly_limit)}/月`).join('\n');
    await ctx.reply('🎯 現在の予算\n' + text + '\n\n変更は「通信費の予算を2万円に」のように送ってください。');
  });

  bot.command('export', async (ctx) => {
    const { year } = currentYearMonth();
    const path = exportCsv(userId(ctx), year);
    await ctx.replyWithDocument(Input.fromLocalFile(path), {
      caption: `📤 ${year}年の帳簿データ（CSV）です。税理士連携や会計ソフト取込にどうぞ。`,
    });
  });
}
