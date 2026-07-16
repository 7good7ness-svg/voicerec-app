import { config } from '../config.js';

/** タイムゾーンを考慮した「今日」を YYYY-MM-DD で返す */
export function today(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: config.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** 現在の年月を { year, month } で返す（monthは1-12） */
export function currentYearMonth(): { year: number; month: number } {
  const ymd = today();
  const parts = ymd.split('-');
  return { year: Number(parts[0]), month: Number(parts[1]) };
}

/** 指定年月の [開始日, 終了日] を YYYY-MM-DD で返す */
export function monthRange(year: number, month: number): [string, string] {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  // 翌月0日 = 当月末日
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return [start, end];
}

/** YYYY-MM-DD が妥当かチェック */
export function isValidDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime());
}
