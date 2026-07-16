import { currentYearMonth, monthRange } from '../utils/date.js';
import { bar, money } from '../utils/format.js';
import {
  listBudgets,
  recentTransactions,
  sumByCategory,
  totalByKind,
} from '../db/repositories.js';

/** 月次レポートを整形して返す */
export function monthlyReport(userId: number, year: number, month: number): string {
  const [start, end] = monthRange(year, month);
  const expense = totalByKind(userId, 'expense', start, end);
  const income = totalByKind(userId, 'income', start, end);
  const balance = income - expense;

  const expenseByCat = sumByCategory(userId, 'expense', start, end);
  const maxCat = expenseByCat[0]?.total ?? 0;

  const lines: string[] = [];
  lines.push(`📊 *${year}年${month}月のサマリ*`);
  lines.push('');
  lines.push(`収入　: ${money(income)}`);
  lines.push(`経費　: ${money(expense)}`);
  lines.push(`収支　: ${balance >= 0 ? '＋' : '－'}${money(Math.abs(balance))}`);

  if (expenseByCat.length > 0) {
    lines.push('');
    lines.push('*経費内訳*');
    for (const c of expenseByCat) {
      lines.push(`${bar(c.total, maxCat)} ${c.category} ${money(c.total)} (${c.count}件)`);
    }
  }

  // 予算の進捗
  const budgets = listBudgets(userId);
  if (budgets.length > 0) {
    lines.push('');
    lines.push('*予算の進捗*');
    for (const b of budgets) {
      const spent = expenseByCat.find((c) => c.category === b.category)?.total ?? 0;
      const ratio = Math.round((spent / b.monthly_limit) * 100);
      const mark = ratio >= 100 ? '🚨' : ratio >= 80 ? '⚠️' : '✅';
      lines.push(`${mark} ${b.category}: ${money(spent)} / ${money(b.monthly_limit)} (${ratio}%)`);
    }
  }

  if (expenseByCat.length === 0 && income === 0) {
    lines.push('');
    lines.push('まだ記録がありません。「ランチ 1200円」のように送ってみてください。');
  }
  return lines.join('\n');
}

/** クエリ回答用に、当月＋前月の帳簿データをテキスト化した文脈を返す */
export function queryContext(userId: number): string {
  const { year, month } = currentYearMonth();
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;

  const blocks: string[] = [];
  for (const [y, m, label] of [
    [year, month, '今月'],
    [prevYear, prevMonth, '先月'],
  ] as const) {
    const [start, end] = monthRange(y, m);
    const income = totalByKind(userId, 'income', start, end);
    const expense = totalByKind(userId, 'expense', start, end);
    const byCat = sumByCategory(userId, 'expense', start, end);
    blocks.push(
      `# ${label}（${y}年${m}月）\n収入合計: ${income}円 / 経費合計: ${expense}円\n` +
        (byCat.length
          ? byCat.map((c) => `- ${c.category}: ${c.total}円 (${c.count}件)`).join('\n')
          : '- 経費記録なし'),
    );
  }

  const recent = recentTransactions(userId, 15);
  blocks.push(
    `# 直近の明細\n` +
      recent
        .map(
          (t) =>
            `- ${t.occurred_on} ${t.kind === 'expense' ? '経費' : '収入'} ${t.category} ${t.amount}円${t.vendor ? ' @' + t.vendor : ''}`,
        )
        .join('\n'),
  );
  return blocks.join('\n\n');
}
