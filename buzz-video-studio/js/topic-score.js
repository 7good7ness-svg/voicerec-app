// ネタ強度スコア。
// 「AIだけではネタが弱い / 何を題材にするかだけは人間が決める」を採点で強制する。

const SOURCE_SCORE = {
  clip: 25,   // 今伸びている人物・動画の切り抜き（記事で11万再生した動画の作り方）
  trend: 22,  // 今伸びている動画を見て流行を確認してから作る
  news: 18,   // 直近のニュース・出来事
  own: 14,    // 自分の体験・一次情報
  ai: 4,      // AIにネタごと考えさせた（＝平均1500再生ルート）
};

const SATURATION_SCORE = { low: 15, mid: 8, high: 0 };

// フックの具体性を測るシグナル
const NUMBER_RE = /[0-9０-９]/;
const SURPRISE_RE = /(実は|なぜ|理由|やめ|禁止|失敗|ヤバ|やば|衝撃|知らない|嘘|本当|最強|最悪|閲覧注意|後悔|1位|ランキング)/;
const SECOND_PERSON_RE = /(あなた|君|きみ|お前|みんな|全員|人は)/;

export const SOURCE_LABELS = {
  clip: '今伸びている人物・動画の切り抜き',
  trend: '伸びている動画を見て流行を確認',
  news: '直近のニュース・出来事',
  own: '自分の体験・一次情報',
  ai: 'AIにネタから考えさせた',
};

export const SATURATION_LABELS = { low: 'まだ少ない', mid: 'そこそこ出ている', high: '出尽くしている' };

/**
 * @param {object} topic
 * @returns {{total:number, verdict:string, level:'go'|'warn'|'stop', breakdown:Array}}
 */
export function scoreTopic(topic = {}) {
  const b = [];

  // 1. ネタの出どころ（配点25）— ここが記事の一番の分岐点
  const src = SOURCE_SCORE[topic.sourceType] ?? 4;
  b.push({
    label: 'ネタの出どころ',
    score: src,
    max: 25,
    note:
      topic.sourceType === 'ai'
        ? 'AIにネタごと任せると平均再生に落ちる。題材だけは自分で探す。'
        : `${SOURCE_LABELS[topic.sourceType] || '未選択'}。人間が題材を選べている。`,
  });

  // 2. 参照した「伸びている動画」の実績（配点20）
  const views = Number(topic.referenceViews) || 0;
  let refScore = 0;
  if (views >= 1_000_000) refScore = 20;
  else if (views >= 300_000) refScore = 16;
  else if (views >= 100_000) refScore = 12;
  else if (views >= 30_000) refScore = 7;
  else if (views > 0) refScore = 3;
  b.push({
    label: '参照元の再生数',
    score: refScore,
    max: 20,
    note: views ? `${views.toLocaleString()}回の実績あり` : '伸びている参照動画を1本は必ず見つける',
  });

  // 3. 鮮度（配点10）
  const days = topic.referenceDaysAgo === '' || topic.referenceDaysAgo == null ? null : Number(topic.referenceDaysAgo);
  let freshScore = 0;
  if (days == null) freshScore = 0;
  else if (days <= 7) freshScore = 10;
  else if (days <= 30) freshScore = 7;
  else if (days <= 90) freshScore = 4;
  else freshScore = 1;
  b.push({
    label: '鮮度',
    score: freshScore,
    max: 10,
    note: days == null ? '参照動画の投稿時期を確認する' : `${days}日前の流行`,
  });

  // 4. ジャンル一貫性（配点20）— 「別ジャンルとして認識されていた」失敗の防止
  const ch = (topic.genre || '').trim();
  const tg = (topic.topicGenre || '').trim();
  let genreScore = 0;
  let genreNote = 'チャンネルのジャンルとネタのジャンルを両方入力する';
  if (ch && tg) {
    if (ch === tg) {
      genreScore = 20;
      genreNote = 'チャンネルの軸と一致。YouTubeに同ジャンルと認識されやすい。';
    } else {
      genreScore = 4;
      genreNote = `「${ch}」のチャンネルに「${tg}」のネタ。別ジャンル判定でおすすめが止まる危険。`;
    }
  }
  b.push({ label: 'ジャンル一貫性', score: genreScore, max: 20, note: genreNote });

  // 5. 飽和度（配点15）
  const sat = SATURATION_SCORE[topic.saturation] ?? 8;
  b.push({
    label: '二番煎じ度',
    score: sat,
    max: 15,
    note:
      topic.saturation === 'high'
        ? '出尽くしたやり方をそのまま真似しても厳しい。切り口を1つずらす。'
        : SATURATION_LABELS[topic.saturation] || '',
  });

  // 6. フックの具体性（配点10）
  const hook = (topic.hook || '').trim();
  let hookScore = 0;
  const hookHits = [];
  if (hook.length >= 8) { hookScore += 3; hookHits.push('長さOK'); }
  if (NUMBER_RE.test(hook)) { hookScore += 3; hookHits.push('数字あり'); }
  if (SURPRISE_RE.test(hook)) { hookScore += 2; hookHits.push('意外性ワードあり'); }
  if (SECOND_PERSON_RE.test(hook)) { hookScore += 2; hookHits.push('視聴者に向いている'); }
  if (hook.length > 30) { hookScore = Math.max(0, hookScore - 3); hookHits.push('長すぎ（2秒で言い切れない）'); }
  b.push({
    label: '冒頭2秒のフック',
    score: Math.min(10, hookScore),
    max: 10,
    note: hook ? hookHits.join(' / ') : '最初の2秒で言い切る一文を書く',
  });

  const total = Math.round(b.reduce((s, x) => s + x.score, 0));
  let level = 'stop';
  let verdict = 'このまま作ると平均再生で終わる。ネタを選び直す。';
  if (total >= 75) {
    level = 'go';
    verdict = '勝負できるネタ。このまま台本へ。';
  } else if (total >= 50) {
    level = 'warn';
    verdict = '悪くないが伸び切らない。赤い項目を1つ直してから作る。';
  }
  return { total, verdict, level, breakdown: b };
}
