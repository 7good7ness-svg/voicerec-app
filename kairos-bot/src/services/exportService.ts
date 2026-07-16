import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { config } from '../config.js';
import { monthRange } from '../utils/date.js';
import { transactionsInRange } from '../db/repositories.js';

function csvEscape(value: string | number | null): string {
  const s = value === null ? '' : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * 指定年（month省略時は通年）の取引をCSVファイルに書き出し、パスを返す。
 * 税理士連携・freee/マネーフォワード取込を想定した素直な形式。
 */
export function exportCsv(userId: number, year: number, month?: number): string {
  const [start] = monthRange(year, month ?? 1);
  const [, end] = monthRange(year, month ?? 12);
  const rows = transactionsInRange(userId, start, end);

  const header = ['日付', '種別', 'カテゴリ', '金額', '支払先', 'メモ', '通貨'];
  const body = rows.map((t) =>
    [
      t.occurred_on,
      t.kind === 'expense' ? '経費' : '収入',
      t.category,
      t.amount,
      t.vendor,
      t.memo,
      t.currency,
    ]
      .map(csvEscape)
      .join(','),
  );
  // Excelで文字化けしないよう BOM を付与
  const content = '﻿' + [header.join(','), ...body].join('\r\n') + '\r\n';

  const suffix = month ? `${year}-${String(month).padStart(2, '0')}` : `${year}`;
  const outPath = join(
    dirname(config.databasePath),
    'exports',
    `kairos_${userId}_${suffix}.csv`,
  );
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, content, 'utf8');
  return outPath;
}
