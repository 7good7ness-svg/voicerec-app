import { monthRange } from '../utils/date.js';
import { money } from '../utils/format.js';
import { totalByKind } from '../db/repositories.js';

// 所得税の速算表（課税所得, 税率, 控除額）
const BRACKETS: Array<[number, number, number]> = [
  [1_950_000, 0.05, 0],
  [3_300_000, 0.1, 97_500],
  [6_950_000, 0.2, 427_500],
  [9_000_000, 0.23, 636_000],
  [18_000_000, 0.33, 1_536_000],
  [40_000_000, 0.4, 2_796_000],
  [Infinity, 0.45, 4_796_000],
];

function incomeTax(taxable: number): number {
  if (taxable <= 0) return 0;
  for (const [upper, rate, deduction] of BRACKETS) {
    if (taxable <= upper) return Math.floor(taxable * rate - deduction);
  }
  return 0;
}

/**
 * 年初〜現在までの収支から、所得税・消費税の【概算】を出す。
 * ※あくまで目安。青色申告特別控除65万＋基礎控除48万を仮定。正式な申告は税理士へ。
 */
export function taxEstimate(userId: number, year: number): string {
  const [start] = monthRange(year, 1);
  const [, end] = monthRange(year, 12);
  const income = totalByKind(userId, 'income', start, end);
  const expense = totalByKind(userId, 'expense', start, end);
  const businessIncome = income - expense; // 事業所得（控除前）

  const BLUE_DEDUCTION = 650_000; // 青色申告特別控除（仮定）
  const BASIC_DEDUCTION = 480_000; // 基礎控除
  const taxable = Math.max(0, businessIncome - BLUE_DEDUCTION - BASIC_DEDUCTION);
  const it = incomeTax(taxable);
  const reconstructionTax = Math.floor(it * 0.021); // 復興特別所得税 2.1%

  const lines: string[] = [];
  lines.push(`🧮 *${year}年 税金の概算*（年初〜現在の記録ベース）`);
  lines.push('');
  lines.push(`売上・収入　: ${money(income)}`);
  lines.push(`必要経費　　: ${money(expense)}`);
  lines.push(`事業所得　　: ${money(businessIncome)}`);
  lines.push(`課税所得(概算): ${money(taxable)}`);
  lines.push(`　（青色65万＋基礎48万控除を仮定）`);
  lines.push('');
  lines.push(`所得税(概算)　: ${money(it)}`);
  lines.push(`復興特別所得税: ${money(reconstructionTax)}`);
  lines.push(`合計(概算)　　: ${money(it + reconstructionTax)}`);
  lines.push('');
  if (income >= 10_000_000) {
    lines.push('※ 課税売上1,000万円超のため消費税の課税事業者に該当する可能性があります。');
  } else {
    lines.push('※ 消費税は課税売上1,000万円以下のため今回は概算に含めていません（インボイス登録時は別途）。');
  }
  lines.push('⚠️ これは目安です。住民税・国民健康保険・各種控除は未反映。正式な申告は税理士にご相談ください。');
  return lines.join('\n');
}
