import { config } from '../config.js';
import { today, currentYearMonth, monthRange } from '../utils/date.js';
import { money } from '../utils/format.js';
import {
  getBudget,
  insertTransaction,
  sumByCategory,
} from '../db/repositories.js';
import type { Transaction } from '../types.js';
import type { ParsedTransaction } from '../ai/parser.js';

/** 解析済み明細をDBへ記録する */
export function recordTransactions(
  userId: number,
  items: ParsedTransaction[],
): Transaction[] {
  const saved: Transaction[] = [];
  for (const it of items) {
    const occurred = /^\d{4}-\d{2}-\d{2}$/.test(it.occurred_on)
      ? it.occurred_on
      : today();
    saved.push(
      insertTransaction({
        user_id: userId,
        kind: it.kind,
        amount: Math.round(it.amount),
        category: it.category,
        vendor: it.vendor ?? null,
        memo: it.memo ?? null,
        currency: config.currency,
        occurred_on: occurred,
      }),
    );
  }
  return saved;
}

/**
 * 記録直後に、その経費カテゴリの当月予算超過をチェックし、
 * 警告メッセージ（超過見込み時）を返す。問題なければ null。
 */
export function budgetAlert(userId: number, category: string): string | null {
  const budget = getBudget(userId, category);
  if (!budget) return null;

  const { year, month } = currentYearMonth();
  const [start, end] = monthRange(year, month);
  const sums = sumByCategory(userId, 'expense', start, end);
  const spent = sums.find((s) => s.category === category)?.total ?? 0;
  const ratio = spent / budget.monthly_limit;

  if (ratio >= 1) {
    return `🚨 「${category}」が予算オーバー！ ${money(spent)} / ${money(budget.monthly_limit)}（${Math.round(ratio * 100)}%）`;
  }
  if (ratio >= 0.8) {
    return `⚠️ 「${category}」が予算の${Math.round(ratio * 100)}%に到達。 ${money(spent)} / ${money(budget.monthly_limit)}`;
  }
  return null;
}
