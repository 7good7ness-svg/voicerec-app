// 収益化KPI。
// 「10万再生を1本出した」で止まらないように、90日/300万再生の必要ペースを常に見せる。

export const YPP_SHORTS = { windowDays: 90, targetViews: 3_000_000, targetSubs: 1000 };

const DAY = 86400000;

function toDate(s) {
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * @param {Array<{date:string, title?:string, views?:number}>} posts
 * @param {{today?:string, windowDays?:number, targetViews?:number, subs?:number, targetSubs?:number}} opts
 */
export function computeKpi(posts = [], opts = {}) {
  const windowDays = opts.windowDays || YPP_SHORTS.windowDays;
  const targetViews = opts.targetViews || YPP_SHORTS.targetViews;
  const targetSubs = opts.targetSubs || YPP_SHORTS.targetSubs;
  const today = toDate(opts.today || new Date().toISOString().slice(0, 10)) || new Date();

  const from = new Date(today.getTime() - (windowDays - 1) * DAY);
  const valid = posts.filter((p) => toDate(p.date));
  const inWindow = valid.filter((p) => {
    const d = toDate(p.date);
    return d >= from && d <= today;
  });

  const windowViews = inWindow.reduce((s, p) => s + (Number(p.views) || 0), 0);
  const totalViews = valid.reduce((s, p) => s + (Number(p.views) || 0), 0);
  const posted = inWindow.length;

  // 実際に投稿を始めてからの経過日数（最大 windowDays）
  const firstDate = valid.length ? valid.map((p) => toDate(p.date)).sort((a, b) => a - b)[0] : today;
  const elapsed = Math.min(windowDays, Math.max(1, Math.round((today - firstDate) / DAY) + 1));

  const perDay = windowViews / elapsed;
  const requiredPerDay = targetViews / windowDays;
  const projected = Math.round(perDay * windowDays);
  const progress = Math.min(1, windowViews / targetViews);

  const cadencePerDay = posted / elapsed || 0;
  const remainingDays = Math.max(0, windowDays - elapsed);
  const remainingViews = Math.max(0, targetViews - windowViews);
  const requiredPerVideo = cadencePerDay > 0 && remainingDays > 0
    ? Math.round(remainingViews / (cadencePerDay * remainingDays))
    : null;

  const avgViews = posted ? Math.round(windowViews / posted) : 0;
  const median = medianOf(inWindow.map((p) => Number(p.views) || 0));
  const best = inWindow.reduce((m, p) => ((Number(p.views) || 0) > (Number(m?.views) || 0) ? p : m), null);

  let level = 'stop';
  let verdict = '今のペースでは収益化に届かない。ネタの選び方から見直す。';
  if (projected >= targetViews) {
    level = 'go';
    verdict = 'このペースなら90日で到達する。投稿を止めないことが最優先。';
  } else if (projected >= targetViews * 0.5) {
    level = 'warn';
    verdict = '半分は見えている。当たったネタの型を複製して本数を増やす。';
  }
  // 数日分の記録で「到達する」と出すのは嘘になる。7日未満は判定を保留する。
  if (elapsed < 7 && level === 'go') {
    level = 'warn';
    verdict = `まだ${elapsed}日分の記録。着地の予測は7日以上ためてから見る。`;
  }

  return {
    windowDays, targetViews, targetSubs,
    windowViews, totalViews, posted, elapsed,
    perDay: Math.round(perDay),
    requiredPerDay: Math.round(requiredPerDay),
    projected, progress,
    avgViews, median,
    best: best ? { title: best.title || '(無題)', views: Number(best.views) || 0, date: best.date } : null,
    requiredPerVideo,
    cadencePerWeek: Math.round(cadencePerDay * 7 * 10) / 10,
    subs: Number(opts.subs) || 0,
    subsProgress: Math.min(1, (Number(opts.subs) || 0) / targetSubs),
    level, verdict,
  };
}

function medianOf(nums) {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

/** 当たった動画と外れた動画の差分。次に何を複製するか。 */
export function compareHitsAndMisses(posts = []) {
  const withViews = posts.filter((p) => Number(p.views) > 0);
  if (withViews.length < 3) return null;
  const sorted = [...withViews].sort((a, b) => b.views - a.views);
  const topN = Math.max(1, Math.round(sorted.length * 0.25));
  const hits = sorted.slice(0, topN);
  const misses = sorted.slice(-topN);
  const hitAvg = Math.round(hits.reduce((s, p) => s + p.views, 0) / hits.length);
  const missAvg = Math.round(misses.reduce((s, p) => s + p.views, 0) / misses.length);
  return {
    hits, misses, hitAvg, missAvg,
    ratio: missAvg > 0 ? Math.round((hitAvg / missAvg) * 10) / 10 : null,
  };
}
