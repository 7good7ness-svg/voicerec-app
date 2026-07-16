import { db } from './database.js';
import type {
  Budget,
  NewTransaction,
  Recurring,
  Transaction,
} from '../types.js';

// ===== ユーザー =====
export function upsertUser(id: number, displayName: string): void {
  db.prepare(
    `INSERT INTO users (id, display_name) VALUES (?, ?)
     ON CONFLICT(id) DO UPDATE SET display_name = excluded.display_name`,
  ).run(id, displayName);
}

// ===== 取引 =====
export function insertTransaction(tx: NewTransaction): Transaction {
  const info = db
    .prepare(
      `INSERT INTO transactions
        (user_id, kind, amount, category, vendor, memo, currency, occurred_on)
       VALUES (@user_id, @kind, @amount, @category, @vendor, @memo, @currency, @occurred_on)`,
    )
    .run(tx);
  return getTransaction(Number(info.lastInsertRowid))!;
}

export function getTransaction(id: number): Transaction | undefined {
  return db
    .prepare('SELECT * FROM transactions WHERE id = ?')
    .get(id) as Transaction | undefined;
}

export function deleteTransaction(userId: number, id: number): boolean {
  const info = db
    .prepare('DELETE FROM transactions WHERE id = ? AND user_id = ?')
    .run(id, userId);
  return info.changes > 0;
}

export function recentTransactions(userId: number, limit = 10): Transaction[] {
  return db
    .prepare(
      `SELECT * FROM transactions WHERE user_id = ?
       ORDER BY occurred_on DESC, id DESC LIMIT ?`,
    )
    .all(userId, limit) as Transaction[];
}

export function transactionsInRange(
  userId: number,
  start: string,
  end: string,
): Transaction[] {
  return db
    .prepare(
      `SELECT * FROM transactions
       WHERE user_id = ? AND occurred_on BETWEEN ? AND ?
       ORDER BY occurred_on ASC, id ASC`,
    )
    .all(userId, start, end) as Transaction[];
}

export interface CategorySum {
  category: string;
  total: number;
  count: number;
}

export function sumByCategory(
  userId: number,
  kind: 'expense' | 'income',
  start: string,
  end: string,
): CategorySum[] {
  return db
    .prepare(
      `SELECT category, SUM(amount) AS total, COUNT(*) AS count
       FROM transactions
       WHERE user_id = ? AND kind = ? AND occurred_on BETWEEN ? AND ?
       GROUP BY category ORDER BY total DESC`,
    )
    .all(userId, kind, start, end) as CategorySum[];
}

export function totalByKind(
  userId: number,
  kind: 'expense' | 'income',
  start: string,
  end: string,
): number {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM transactions
       WHERE user_id = ? AND kind = ? AND occurred_on BETWEEN ? AND ?`,
    )
    .get(userId, kind, start, end) as { total: number };
  return row.total;
}

// ===== 予算 =====
export function setBudget(
  userId: number,
  category: string,
  monthlyLimit: number,
): void {
  db.prepare(
    `INSERT INTO budgets (user_id, category, monthly_limit) VALUES (?, ?, ?)
     ON CONFLICT(user_id, category) DO UPDATE SET monthly_limit = excluded.monthly_limit`,
  ).run(userId, category, monthlyLimit);
}

export function getBudget(
  userId: number,
  category: string,
): Budget | undefined {
  return db
    .prepare('SELECT * FROM budgets WHERE user_id = ? AND category = ?')
    .get(userId, category) as Budget | undefined;
}

export function listBudgets(userId: number): Budget[] {
  return db
    .prepare('SELECT * FROM budgets WHERE user_id = ? ORDER BY category')
    .all(userId) as Budget[];
}

// ===== 定期支出 =====
export function insertRecurring(
  r: Omit<Recurring, 'id' | 'active'>,
): Recurring {
  const info = db
    .prepare(
      `INSERT INTO recurring (user_id, amount, category, vendor, memo, day_of_month)
       VALUES (@user_id, @amount, @category, @vendor, @memo, @day_of_month)`,
    )
    .run(r);
  return db
    .prepare('SELECT * FROM recurring WHERE id = ?')
    .get(Number(info.lastInsertRowid)) as Recurring;
}

export function listRecurring(userId: number): Recurring[] {
  return db
    .prepare('SELECT * FROM recurring WHERE user_id = ? AND active = 1 ORDER BY day_of_month')
    .all(userId) as Recurring[];
}
