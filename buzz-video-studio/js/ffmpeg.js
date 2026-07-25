// 編集指示の書き出し。
// 「AIに編集を覚えさせる」の実体はこれ。毎回同じ数値で焼き込めるコマンドを吐く。

import { CANVAS } from './telop.js';

const DEFAULTS = {
  broll: 'broll.mp4',
  voice: 'voice.wav',
  bgm: 'bgm.mp3',
  ass: 'telop.ass',
  out: 'short.mp4',
  fps: 30,
  bgmGain: 0.10,
  crf: 18,
};

/** 単発コマンド（縦1080x1920に整形＋テロップ焼き込み＋音声ミックス） */
export function buildFfmpegCommand(opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const useBgm = !!o.bgm;

  const vchain =
    `[0:v]scale=${CANVAS.w}:${CANVAS.h}:force_original_aspect_ratio=increase,` +
    `crop=${CANVAS.w}:${CANVAS.h},fps=${o.fps},ass=${o.ass}[v]`;

  const achain = useBgm
    ? `[1:a]loudnorm=I=-14:TP=-1.5:LRA=11[voice];` +
      `[2:a]volume=${o.bgmGain},afade=t=out:st=${Math.max(0, (o.duration || 40) - 1.5)}:d=1.5[bg];` +
      `[voice][bg]sidechaincompress=threshold=0.05:ratio=6:attack=5:release=250[a]`
    : `[1:a]loudnorm=I=-14:TP=-1.5:LRA=11[a]`;

  const inputs = [`-i ${o.broll}`, `-i ${o.voice}`, useBgm ? `-i ${o.bgm}` : null].filter(Boolean).join(' \\\n  ');

  return [
    'ffmpeg -y \\',
    `  ${inputs} \\`,
    `  -filter_complex "${vchain};${achain}" \\`,
    '  -map "[v]" -map "[a]" \\',
    `  -c:v libx264 -profile:v high -pix_fmt yuv420p -crf ${o.crf} -preset medium \\`,
    '  -c:a aac -b:a 192k -ar 48000 \\',
    `  -movflags +faststart -shortest ${o.out}`,
  ].join('\n');
}

/** ビートごとのカット表。素材を切る場所を人間に渡す。 */
export function buildShotList(timed) {
  return timed
    .map(
      (t, i) =>
        `#${i + 1} ${t.start.toFixed(1)}s - ${t.end.toFixed(1)}s (${t.duration.toFixed(1)}s) [${t.role}]\n` +
        `   映像: ${t.broll || '未指定'}\n` +
        `   テロップ: ${t.telop || '（なし）'}\n` +
        `   読み: ${t.narration}`
    )
    .join('\n\n');
}

/** ビート単位で素材を切り出して結合する版（素材が複数ファイルある場合） */
export function buildSegmentScript(timed, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const lines = [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    '# buzz-video-studio が生成したレンダースクリプト',
    '# 事前に clips/01.mp4 ... を用意する（カット表の順番と対応）',
    'mkdir -p build',
    '',
  ];

  timed.forEach((t, i) => {
    const n = String(i + 1).padStart(2, '0');
    lines.push(
      `ffmpeg -y -i clips/${n}.mp4 -t ${t.duration.toFixed(2)} ` +
        `-vf "scale=${CANVAS.w}:${CANVAS.h}:force_original_aspect_ratio=increase,crop=${CANVAS.w}:${CANVAS.h},fps=${o.fps},setsar=1" ` +
        `-an -c:v libx264 -crf ${o.crf} -preset veryfast build/seg${n}.mp4`
    );
  });

  lines.push('');
  lines.push('printf "%s\\n" ' + timed.map((_, i) => `"file 'seg${String(i + 1).padStart(2, '0')}.mp4'"`).join(' ') + ' > build/list.txt');
  lines.push('ffmpeg -y -f concat -safe 0 -i build/list.txt -c copy build/joined.mp4');
  lines.push('');
  lines.push(buildFfmpegCommand({ ...o, broll: 'build/joined.mp4' }).replace(/\n/g, '\n'));
  return lines.join('\n');
}

/** 読み上げ音声の作り方（無料〜低コストの選択肢） */
export function buildTtsHints(text) {
  const escaped = text.replace(/"/g, '\\"').slice(0, 400);
  return [
    '# VOICEVOX（ローカル・無料・日本語が自然）',
    'curl -s -X POST "127.0.0.1:50021/audio_query?speaker=3" --get --data-urlencode "text=' + escaped.slice(0, 120) + '" > q.json',
    'curl -s -X POST "127.0.0.1:50021/synthesis?speaker=3" -H "Content-Type: application/json" -d @q.json > voice.wav',
    '',
    '# 自分の声で録る（記事の結論：ここだけ人間に戻すと印象が変わる）',
    'ffmpeg -f avfoundation -i ":0" -ar 48000 -ac 1 voice.wav   # macOS',
    'ffmpeg -f alsa -i default -ar 48000 -ac 1 voice.wav        # Linux',
  ].join('\n');
}
