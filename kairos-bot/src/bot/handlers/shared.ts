import type { Context } from 'telegraf';
import { recordTransactions, budgetAlert } from '../../services/expenseService.js';
import { txLine } from '../../utils/format.js';
import { undoButton } from '../keyboards.js';
import type { ParsedTransaction } from '../../ai/parser.js';

/** 解析済み明細を記録し、確認メッセージ＋予算警告＋取消ボタンを返信する */
export async function recordAndReply(
  ctx: Context,
  userId: number,
  items: ParsedTransaction[],
): Promise<void> {
  const saved = recordTransactions(userId, items);
  if (saved.length === 0) {
    await ctx.reply('記録できる明細が見つかりませんでした。');
    return;
  }

  const header = saved.length === 1 ? '✅ 記録しました' : `✅ ${saved.length}件 記録しました`;
  const body = saved.map(txLine).join('\n');

  // 予算警告（経費のみ、重複カテゴリはまとめる）
  const alerts = new Set<string>();
  for (const tx of saved) {
    if (tx.kind !== 'expense') continue;
    const a = budgetAlert(userId, tx.category);
    if (a) alerts.add(a);
  }
  const alertText = alerts.size ? '\n\n' + [...alerts].join('\n') : '';

  // 1件のときだけ取消ボタンを付ける
  if (saved.length === 1 && saved[0]) {
    await ctx.reply(`${header}\n${body}${alertText}`, undoButton(saved[0].id));
  } else {
    await ctx.reply(`${header}\n${body}${alertText}`);
  }
}
