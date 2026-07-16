import { config } from '../config.js';
import type { Transaction } from '../types.js';

/** 金額を通貨表記に整形（例: ¥1,200） */
export function money(amount: number, currency = config.currency): string {
  try {
    return new Intl.NumberFormat('ja-JP', {
      style: 'currency',
      currency,
      maximumFractionDigits: currency === 'JPY' ? 0 : 2,
    }).format(amount);
  } catch {
    return `${amount.toLocaleString('ja-JP')} ${currency}`;
  }
}

const KIND_ICON: Record<string, string> = { expense: '💸', income: '💰' };

/** 1件の取引を1行に整形 */
export function txLine(tx: Transaction): string {
  const icon = KIND_ICON[tx.kind] ?? '•';
  const vendor = tx.vendor ? ` ${tx.vendor}` : '';
  const memo = tx.memo ? `（${tx.memo}）` : '';
  return `${icon} ${tx.occurred_on} ${tx.category}${vendor} ${money(tx.amount, tx.currency)}${memo}`;
}

/** バーグラフ（テキスト）を生成 */
export function bar(value: number, max: number, width = 10): string {
  if (max <= 0) return '─'.repeat(width);
  const filled = Math.max(0, Math.min(width, Math.round((value / max) * width)));
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}
