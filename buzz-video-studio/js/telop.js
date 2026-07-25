// テロップ（字幕）の生成と検証。
// AIは「文字の大きさ・位置・色」を勝手には決められないので、ここで数値として固定する。
// また「ナレーション全文を字幕にする」失敗を、文字数上限で機械的に止める。

import { estimateDurationSec } from './mora.js';

export const CANVAS = { w: 1080, h: 1920 };

// YouTube ショートのUIが被る領域（実測ベースの安全マージン）
export const SAFE = { top: 220, bottom: 480, right: 200, left: 40 };

export const ALIGN = { top: 8, middle: 5, bottom: 2 };

export const TELOP_PRESETS = {
  punch: {
    name: 'パンチ（切り抜き向け）',
    fontName: 'Noto Sans JP',
    fontSize: 104,
    bold: true,
    primary: '#FFFFFF',
    outlineColor: '#000000',
    outlineWidth: 9,
    shadow: 3,
    align: ALIGN.middle,
    marginV: 0,
    maxChars: 13,
    highlight: '#FFE14D',
  },
  clean: {
    name: 'クリーン（解説向け）',
    fontName: 'Noto Sans JP',
    fontSize: 84,
    bold: true,
    primary: '#FFFFFF',
    outlineColor: '#101010',
    outlineWidth: 6,
    shadow: 2,
    align: ALIGN.bottom,
    marginV: 560,
    maxChars: 16,
    highlight: '#4DD2FF',
  },
  news: {
    name: 'ニュース（帯・上部）',
    fontName: 'Noto Sans JP',
    fontSize: 76,
    bold: true,
    primary: '#FFFFFF',
    outlineColor: '#C1121F',
    outlineWidth: 5,
    shadow: 0,
    align: ALIGN.top,
    marginV: 260,
    maxChars: 18,
    highlight: '#FFD166',
  },
};

/** #RRGGBB → ASS の &HAABBGGRR */
export function hexToAss(hex, alpha = 0) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  const rgb = m ? m[1] : 'FFFFFF';
  const r = rgb.slice(0, 2);
  const g = rgb.slice(2, 4);
  const b = rgb.slice(4, 6);
  const a = Math.max(0, Math.min(255, Math.round(alpha))).toString(16).padStart(2, '0');
  return `&H${a}${b}${g}${r}`.toUpperCase();
}

/** ビートに開始・終了時刻を割り当てる */
export function buildTimeline(beats, moraPerSec = 8.5) {
  let t = 0;
  return beats.map((b, i) => {
    const dur = Math.max(0.6, estimateDurationSec(b.narration, moraPerSec));
    const item = { ...b, index: i, start: Math.round(t * 100) / 100, end: Math.round((t + dur) * 100) / 100, duration: Math.round(dur * 100) / 100 };
    t += dur;
    return item;
  });
}

function srtTime(sec) {
  const s = Math.max(0, sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = Math.floor(s % 60);
  const ms = Math.round((s - Math.floor(s)) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

function assTime(sec) {
  const s = Math.max(0, sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = s - h * 3600 - m * 60;
  return `${h}:${String(m).padStart(2, '0')}:${rest.toFixed(2).padStart(5, '0')}`;
}

/** 読み上げ用の全文字幕ではなく、テロップ（要点のみ）を書き出す */
export function toSRT(timed) {
  return timed
    .filter((t) => (t.telop || '').trim())
    .map((t, i) => `${i + 1}\n${srtTime(t.start)} --> ${srtTime(t.end)}\n${t.telop.trim()}\n`)
    .join('\n');
}

export function toASS(timed, style) {
  const st = { ...TELOP_PRESETS.punch, ...style };
  const marginV = st.align === ALIGN.middle ? 0 : st.marginV;
  const header = [
    '[Script Info]',
    'Title: buzz-video-studio telop',
    'ScriptType: v4.00+',
    'WrapStyle: 2',
    'ScaledBorderAndShadow: yes',
    `PlayResX: ${CANVAS.w}`,
    `PlayResY: ${CANVAS.h}`,
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    [
      'Style: Main',
      st.fontName,
      st.fontSize,
      hexToAss(st.primary),
      hexToAss(st.highlight),
      hexToAss(st.outlineColor),
      hexToAss('#000000', 160),
      st.bold ? -1 : 0,
      0, 0, 0, 100, 100, 0, 0,
      1,
      st.outlineWidth,
      st.shadow,
      st.align,
      SAFE.left,
      SAFE.right,
      Math.round(marginV),
      1,
    ].join(','),
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ].join('\n');

  const events = timed
    .filter((t) => (t.telop || '').trim())
    .map((t) => {
      let text = t.telop.trim().replace(/\r?\n/g, '\\N');
      if (t.emphasis) {
        // 強調語だけ色を変える（全文を装飾しない）
        const esc = t.emphasis.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        text = text.replace(
          new RegExp(esc),
          `{\\c${hexToAss(st.highlight)}\\fs${Math.round(st.fontSize * 1.15)}}${t.emphasis}{\\c${hexToAss(st.primary)}\\fs${st.fontSize}}`
        );
      }
      const fade = '{\\fad(80,80)}';
      return `Dialogue: 0,${assTime(t.start)},${assTime(t.end)},Main,,0,0,0,,${fade}${text}`;
    })
    .join('\n');

  return `${header}\n${events}\n`;
}

/** テロップ設計の検証。記事の失敗（全字幕・UI被り・読めない時間）を潰す。 */
export function validateTelop(timed, style) {
  const st = { ...TELOP_PRESETS.punch, ...style };
  const warnings = [];

  const withTelop = timed.filter((t) => (t.telop || '').trim());
  if (timed.length && withTelop.length === timed.length && timed.length > 6) {
    warnings.push({ level: 'warn', msg: '全カットにテロップが入っている。読ませたい所だけに削ると視線が残る。' });
  }

  for (const t of withTelop) {
    const len = t.telop.replace(/\s/g, '').length;
    if (len > st.maxChars) {
      warnings.push({ level: 'error', msg: `#${t.index + 1} テロップ${len}文字（上限${st.maxChars}）。ナレーション全文を貼っている可能性。`, index: t.index });
    }
    if (t.duration < 0.9 && len > 6) {
      warnings.push({ level: 'warn', msg: `#${t.index + 1} 表示${t.duration}秒で${len}文字は読み切れない。`, index: t.index });
    }
  }

  // 画面下部のUI被り
  if (st.align === ALIGN.bottom && st.marginV < SAFE.bottom) {
    warnings.push({ level: 'error', msg: `下寄せの余白が${st.marginV}px。ショートのUIに隠れる（${SAFE.bottom}px以上必要）。` });
  }
  if (st.align === ALIGN.top && st.marginV < SAFE.top) {
    warnings.push({ level: 'error', msg: `上寄せの余白が${st.marginV}px。上部UIに隠れる（${SAFE.top}px以上必要）。` });
  }
  if (st.fontSize < 64) {
    warnings.push({ level: 'warn', msg: `文字サイズ${st.fontSize}px はスマホで小さい。1080px幅なら72px以上。` });
  }
  if (st.outlineWidth < 4) {
    warnings.push({ level: 'warn', msg: '縁取りが細い。背景が明るいと白文字が消える。' });
  }
  return warnings;
}
