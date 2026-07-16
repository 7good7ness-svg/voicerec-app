import type { Telegraf, Context } from 'telegraf';
import { message } from 'telegraf/filters';
import { Input } from 'telegraf';
import { parseMessage, answerQuery } from '../../ai/parser.js';
import { recordAndReply } from './shared.js';
import { monthlyReport, queryContext } from '../../services/reportService.js';
import { taxEstimate } from '../../services/taxService.js';
import { exportCsv } from '../../services/exportService.js';
import { setBudget, listBudgets, recentTransactions } from '../../db/repositories.js';
import { currentYearMonth } from '../../utils/date.js';
import { money, txLine } from '../../utils/format.js';

function uid(ctx: Context): number {
  return ctx.from?.id ?? 0;
}

// メニューボタンのラベル → 対応する処理
async function handleMenu(ctx: Context, text: string): Promise<boolean> {
  const userId = uid(ctx);
  const { year, month } = currentYearMonth();
  switch (text) {
    case '📊 今月のまとめ':
      await ctx.reply(monthlyReport(userId, year, month), { parse_mode: 'Markdown' });
      return true;
    case '📁 直近の記録': {
      const rows = recentTransactions(userId, 15);
      await ctx.reply(
        rows.length ? '🧾 直近の記録\n' + rows.map(txLine).join('\n') : 'まだ記録がありません。',
      );
      return true;
    }
    case '🧮 税金の概算':
      await ctx.reply(taxEstimate(userId, year), { parse_mode: 'Markdown' });
      return true;
    case '📤 CSV出力': {
      const path = exportCsv(userId, year);
      await ctx.replyWithDocument(Input.fromLocalFile(path), {
        caption: `📤 ${year}年の帳簿データ（CSV）です。`,
      });
      return true;
    }
    case '🎯 予算': {
      const budgets = listBudgets(userId);
      await ctx.reply(
        budgets.length
          ? '🎯 現在の予算\n' +
              budgets.map((b) => `・${b.category}: ${money(b.monthly_limit)}/月`).join('\n')
          : '🎯 予算は未設定です。「通信費の予算を1万円に」のように送ってください。',
      );
      return true;
    }
    case '❓ 使い方':
      await ctx.reply('/help で使い方を表示します。まずは「ランチ 1200円」と送ってみてください。');
      return true;
    default:
      return false;
  }
}

export function registerText(bot: Telegraf): void {
  bot.on(message('text'), async (ctx) => {
    const text = ctx.message.text.trim();
    if (text.startsWith('/')) return; // コマンドは別ハンドラ
    if (await handleMenu(ctx, text)) return;

    const userId = uid(ctx);
    let result;
    try {
      result = await parseMessage(text);
    } catch (err) {
      console.error('parseMessage error:', err);
      await ctx.reply('解析中にエラーが発生しました。少し待って再度お試しください。');
      return;
    }

    switch (result.action) {
      case 'record':
        await recordAndReply(ctx, userId, result.transactions);
        break;

      case 'set_budget':
        if (result.budget) {
          setBudget(userId, result.budget.category, Math.round(result.budget.monthly_limit));
          await ctx.reply(
            `🎯 予算を設定しました。\n${result.budget.category}: ${money(result.budget.monthly_limit)}/月`,
          );
        } else {
          await ctx.reply('予算のカテゴリと金額を読み取れませんでした。例:「通信費の予算を1万円に」');
        }
        break;

      case 'query': {
        const question = result.query_text ?? text;
        await ctx.sendChatAction('typing');
        const ctxText = queryContext(userId);
        const answer = await answerQuery(question, ctxText);
        await ctx.reply(answer);
        break;
      }

      case 'report': {
        const { year, month } = currentYearMonth();
        await ctx.reply(monthlyReport(userId, year, month), { parse_mode: 'Markdown' });
        break;
      }

      case 'help':
      case 'unknown':
      default:
        await ctx.reply(
          result.reply ??
            'うまく理解できませんでした。「ランチ 1200円」のように金額を含めて送るか、/help をご覧ください。',
        );
    }
  });
}
