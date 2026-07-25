import test from 'node:test';
import assert from 'node:assert/strict';

import { estimateMora, estimateDurationSec, totalDurationSec, fmtSec } from '../js/mora.js';
import { scoreTopic } from '../js/topic-score.js';
import { analyzeAiNess } from '../js/ai-ness.js';
import { buildTimeline, toSRT, toASS, hexToAss, validateTelop, TELOP_PRESETS, ALIGN } from '../js/telop.js';
import { buildFfmpegCommand, buildShotList, buildSegmentScript } from '../js/ffmpeg.js';
import { computeKpi, compareHitsAndMisses } from '../js/kpi.js';
import { buildScriptPrompt, parseScriptResponse, draftScript, STRUCTURES } from '../js/script-gen.js';

/* ---- mora ---- */
test('モーラ数: かな1文字=1モーラ、拗音は加算しない', () => {
  assert.equal(estimateMora('あいうえお'), 5);
  assert.equal(estimateMora('しゃしゅしょ'), 3);
  assert.equal(estimateMora('がっこう'), 4);
});

test('モーラ数: 記号と空白は数えない', () => {
  assert.equal(estimateMora('あい、うえ。'), 4);
  assert.equal(estimateMora(''), 0);
  assert.equal(estimateMora(null), 0);
});

test('読み上げ尺: 話速を上げると短くなる', () => {
  const slow = estimateDurationSec('これはテストの文章です', 6);
  const fast = estimateDurationSec('これはテストの文章です', 12);
  assert.ok(fast < slow);
  assert.ok(slow > 0);
});

test('読み上げ尺: 句点で間が入る', () => {
  assert.ok(estimateDurationSec('あいうえお。') > estimateDurationSec('あいうえお'));
});

test('合計尺はビートの和', () => {
  const beats = [{ narration: 'あいうえお' }, { narration: 'かきくけこ' }];
  const t = totalDurationSec(beats, 10);
  assert.ok(Math.abs(t - 1.0) < 0.05);
});

test('fmtSec', () => {
  assert.equal(fmtSec(0), '0:00.0');
  assert.equal(fmtSec(65.4), '1:05.4');
});

/* ---- topic score ---- */
const strongTopic = {
  genre: 'AI副業', topicGenre: 'AI副業', subject: '海外起業家X',
  sourceType: 'clip', referenceViews: 1200000, referenceDaysAgo: 3,
  hook: 'この稼ぎ方、実はもう終わってます', whyNow: '先週荒れた', saturation: 'low',
};

test('ネタ強度: 人間が選んだ鮮度の高いネタは高得点', () => {
  const r = scoreTopic(strongTopic);
  assert.ok(r.total >= 75, `total=${r.total}`);
  assert.equal(r.level, 'go');
});

test('ネタ強度: AIにネタごと任せると出どころが最低点', () => {
  const r = scoreTopic({ ...strongTopic, sourceType: 'ai' });
  const src = r.breakdown.find((b) => b.label === 'ネタの出どころ');
  assert.equal(src.score, 4);
  assert.ok(r.total < scoreTopic(strongTopic).total);
});

test('ネタ強度: ジャンル不一致は大きく減点される', () => {
  const r = scoreTopic({ ...strongTopic, topicGenre: '料理' });
  const g = r.breakdown.find((b) => b.label === 'ジャンル一貫性');
  assert.equal(g.score, 4);
  assert.match(g.note, /別ジャンル/);
});

test('ネタ強度: 空のネタは stop 判定', () => {
  const r = scoreTopic({});
  assert.equal(r.level, 'stop');
  assert.ok(r.total < 50);
});

test('ネタ強度: 満点を超えない', () => {
  const r = scoreTopic({ ...strongTopic, hook: 'あなたの1位、実はなぜか失敗します' });
  assert.ok(r.total <= 100);
  for (const b of r.breakdown) assert.ok(b.score <= b.max, b.label);
});

/* ---- AIっぽさ ---- */
test('AIっぽさ: テンプレ表現を検出する', () => {
  const r = analyzeAiNess('皆さん、いかがでしたでしょうか。近年、AIは重要なポイントと言えるでしょう。');
  assert.equal(r.level, 'ai');
  assert.ok(r.findings.length >= 3);
});

test('AIっぽさ: 人間らしい台本は低スコア', () => {
  const r = analyzeAiNess('正直、無理だと思った。\n「これ、終わりました」\n僕は3か月で11万再生まで行った。\nでも収益化はできてない。');
  assert.ok(r.score < 55, `score=${r.score}`);
});

test('AIっぽさ: 文長が均一だと指摘される', () => {
  const r = analyzeAiNess('あいうえおかき。あいうえおかく。あいうえおかけ。あいうえおかこ。');
  assert.ok(r.findings.some((f) => /ばらつき/.test(f.phrase)));
});

test('AIっぽさ: スコアは0-100に収まる', () => {
  const long = '皆さん、いかがでしたでしょうか。'.repeat(20);
  const r = analyzeAiNess(long);
  assert.ok(r.score >= 0 && r.score <= 100);
});

/* ---- telop ---- */
const beats = [
  { role: 'フック', narration: 'この稼ぎ方、もう終わってます。', telop: 'もう終わり', emphasis: '終わり', broll: '切り抜き' },
  { role: '展開', narration: '理由は単純です。', telop: '理由は1つ', emphasis: '1つ', broll: 'グラフ' },
];

test('タイムライン: 連続して隙間なく並ぶ', () => {
  const t = buildTimeline(beats, 8.5);
  assert.equal(t[0].start, 0);
  assert.equal(t[1].start, t[0].end);
  assert.ok(t[0].duration > 0);
});

test('hexToAss: BGR順に変換する', () => {
  assert.equal(hexToAss('#FF0000'), '&H000000FF');
  assert.equal(hexToAss('#00FF00'), '&H0000FF00');
  assert.equal(hexToAss('#123456'), '&H00563412');
});

test('SRT: テロップのみを書き出す', () => {
  const srt = toSRT(buildTimeline([...beats, { narration: 'ナレのみ', telop: '' }], 8.5));
  assert.match(srt, /1\n00:00:00,000 --> /);
  assert.ok(!srt.includes('ナレのみ'));
});

test('ASS: 解像度・スタイル・強調タグを含む', () => {
  const ass = toASS(buildTimeline(beats, 8.5), TELOP_PRESETS.punch);
  assert.match(ass, /PlayResX: 1080/);
  assert.match(ass, /PlayResY: 1920/);
  assert.match(ass, /^Style: Main,Noto Sans JP,104,/m);
  assert.match(ass, /Dialogue: 0,0:00:00\.00,/);
  assert.ok(ass.includes('{\\c&H004DE1FF'), 'emphasis の色指定が入る');
});

test('検証: 下寄せで余白不足はエラー', () => {
  const w = validateTelop(buildTimeline(beats, 8.5), { ...TELOP_PRESETS.clean, marginV: 100 });
  assert.ok(w.some((x) => x.level === 'error' && /隠れる/.test(x.msg)));
});

test('検証: テロップが長すぎるとエラー（全文字幕の防止）', () => {
  const long = [{ ...beats[0], telop: 'この稼ぎ方はもう終わっているという話をこれからします' }];
  const w = validateTelop(buildTimeline(long, 8.5), TELOP_PRESETS.punch);
  assert.ok(w.some((x) => x.level === 'error' && /上限/.test(x.msg)));
});

test('検証: 適正な設定なら警告なし', () => {
  const w = validateTelop(buildTimeline(beats, 8.5), TELOP_PRESETS.punch);
  assert.deepEqual(w, []);
});

test('検証: 中央寄せは余白チェックの対象外', () => {
  const w = validateTelop(buildTimeline(beats, 8.5), { ...TELOP_PRESETS.punch, align: ALIGN.middle, marginV: 0 });
  assert.ok(!w.some((x) => /隠れる/.test(x.msg)));
});

/* ---- ffmpeg ---- */
test('ffmpeg: 縦動画への整形とテロップ焼き込みを含む', () => {
  const cmd = buildFfmpegCommand({ duration: 40 });
  assert.match(cmd, /scale=1080:1920/);
  assert.match(cmd, /crop=1080:1920/);
  assert.match(cmd, /ass=telop\.ass/);
  assert.match(cmd, /loudnorm=I=-14/);
  assert.match(cmd, /sidechaincompress/);
  assert.match(cmd, /-movflags \+faststart/);
});

test('ffmpeg: BGMなしでもコマンドが壊れない', () => {
  const cmd = buildFfmpegCommand({ bgm: '', duration: 30 });
  assert.ok(!cmd.includes('sidechaincompress'));
  assert.ok(!cmd.includes('-i  '));
  assert.match(cmd, /\[1:a\]loudnorm/);
});

test('カット表: 全ビートが時刻付きで並ぶ', () => {
  const list = buildShotList(buildTimeline(beats, 8.5));
  assert.match(list, /#1 0\.0s - /);
  assert.match(list, /#2 /);
  assert.match(list, /映像: 切り抜き/);
});

test('render.sh: セグメント数だけ切り出しコマンドが出る', () => {
  const sh = buildSegmentScript(buildTimeline(beats, 8.5), {});
  assert.match(sh, /clips\/01\.mp4/);
  assert.match(sh, /clips\/02\.mp4/);
  assert.match(sh, /concat -safe 0/);
  assert.match(sh, /^#!\/usr\/bin\/env bash/);
});

/* ---- KPI ---- */
test('KPI: 90日窓の外の投稿は集計しない', () => {
  const posts = [
    { date: '2026-01-01', views: 5_000_000 },
    { date: '2026-07-01', views: 100_000 },
  ];
  const k = computeKpi(posts, { today: '2026-07-25' });
  assert.equal(k.windowViews, 100_000);
  assert.equal(k.totalViews, 5_100_000);
  assert.equal(k.posted, 1);
});

test('KPI: 10万再生1本では収益化ラインに全く届かない', () => {
  const k = computeKpi([{ date: '2026-07-01', views: 110_000 }], { today: '2026-07-25' });
  assert.ok(k.progress < 0.04);
  assert.equal(k.level, 'stop');
  assert.equal(k.requiredPerDay, 33_333);
});

test('KPI: 必要ペースを超えていれば go', () => {
  const posts = Array.from({ length: 25 }, (_, i) => ({
    date: `2026-07-${String(i + 1).padStart(2, '0')}`,
    views: 60_000,
  }));
  const k = computeKpi(posts, { today: '2026-07-25' });
  assert.ok(k.projected >= 3_000_000, `projected=${k.projected}`);
  assert.equal(k.level, 'go');
});

test('KPI: 記録が7日未満なら到達判定を出さない', () => {
  const k = computeKpi([{ date: '2026-07-25', views: 200_000 }], { today: '2026-07-25' });
  assert.ok(k.projected >= 3_000_000);
  assert.equal(k.level, 'warn');
  assert.match(k.verdict, /7日以上/);
});

test('KPI: 投稿ゼロでも落ちない', () => {
  const k = computeKpi([], { today: '2026-07-25' });
  assert.equal(k.windowViews, 0);
  assert.equal(k.posted, 0);
  assert.equal(k.avgViews, 0);
  assert.equal(k.level, 'stop');
});

test('当たり／外れ: 3本未満では null', () => {
  assert.equal(compareHitsAndMisses([{ date: '2026-07-01', views: 100 }]), null);
});

test('当たり／外れ: 上位と下位の平均を比較する', () => {
  const posts = [
    { date: '2026-07-01', title: 'A', views: 110_000 },
    { date: '2026-07-02', title: 'B', views: 2_000 },
    { date: '2026-07-03', title: 'C', views: 1_500 },
    { date: '2026-07-04', title: 'D', views: 1_000 },
  ];
  const hm = compareHitsAndMisses(posts);
  assert.equal(hm.hits[0].title, 'A');
  assert.equal(hm.misses[0].title, 'D');
  assert.ok(hm.ratio > 10);
});

/* ---- script gen ---- */
test('プロンプト: 題材と禁止表現と構成が入る', () => {
  const p = buildScriptPrompt(strongTopic, { structure: 'clip', targetSec: 40 });
  assert.match(p, /海外起業家X/);
  assert.match(p, /いかがでしたでしょうか/);
  assert.match(p, /13文字以内/);
  assert.match(p, /JSONのみ/);
});

test('パース: コードフェンス付きのJSONを読める', () => {
  const res = parseScriptResponse('```json\n{"title":"t","beats":[{"role":"フック","narration":"n"}]}\n```');
  assert.equal(res.title, 't');
  assert.equal(res.beats[0].telop, '');
});

test('パース: beats が無ければ例外', () => {
  assert.throws(() => parseScriptResponse('{"title":"t"}'), /beats/);
  assert.throws(() => parseScriptResponse('文章だけ'), /JSON/);
});

test('下書き: どの構成でもビートが揃う', () => {
  for (const key of Object.keys(STRUCTURES)) {
    const d = draftScript(strongTopic, { structure: key });
    assert.equal(d.beats.length, 5, key);
    assert.ok(d.title.length <= 28, key);
    for (const b of d.beats) {
      assert.ok(b.narration.length > 0, `${key}:narration`);
      assert.ok(b.telop.replace(/\s/g, '').length <= 13, `${key}:telop=${b.telop}`);
    }
  }
});

test('下書き: 生成した台本はそのままテロップ検証を通る', () => {
  const d = draftScript(strongTopic, { structure: 'clip' });
  const w = validateTelop(buildTimeline(d.beats, 8.5), TELOP_PRESETS.punch);
  assert.ok(!w.some((x) => x.level === 'error'), JSON.stringify(w));
});
