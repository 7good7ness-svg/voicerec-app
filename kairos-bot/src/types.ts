// 取引の種類
export type TxKind = 'expense' | 'income';

// 経費カテゴリ（確定申告の勘定科目に対応）
export const EXPENSE_CATEGORIES = [
  '旅費交通費',
  '接待交際費',
  '会議費',
  '通信費',
  '消耗品費',
  '新聞図書費',
  '広告宣伝費',
  '外注費',
  '地代家賃',
  '水道光熱費',
  '租税公課',
  '支払手数料',
  '福利厚生費',
  '雑費',
  'その他',
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

// 収入カテゴリ
export const INCOME_CATEGORIES = ['売上', '報酬', '雑収入', 'その他'] as const;
export type IncomeCategory = (typeof INCOME_CATEGORIES)[number];

// DB上の取引レコード
export interface Transaction {
  id: number;
  user_id: number;
  kind: TxKind;
  amount: number;
  category: string;
  vendor: string | null;
  memo: string | null;
  currency: string;
  occurred_on: string; // YYYY-MM-DD
  created_at: string; // ISO8601
}

// 新規取引の入力
export interface NewTransaction {
  user_id: number;
  kind: TxKind;
  amount: number;
  category: string;
  vendor: string | null;
  memo: string | null;
  currency: string;
  occurred_on: string;
}

// 予算（カテゴリ別・月次上限）
export interface Budget {
  id: number;
  user_id: number;
  category: string;
  monthly_limit: number;
}

// 定期支出（家賃・サブスクなど）
export interface Recurring {
  id: number;
  user_id: number;
  amount: number;
  category: string;
  vendor: string | null;
  memo: string | null;
  day_of_month: number; // 1-28
  active: number; // 0/1
}
