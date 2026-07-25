// 日本語テキストの読み上げ尺を推定する。
// TTS の実測に合わせて「モーラ数 ÷ 話速」で秒数を出す。

const SMALL_KANA = /[ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮ]/;
const KANA = /[ぁ-んァ-ヶー]/;
const KANJI = /[一-鿿々]/;
const LATIN = /[A-Za-z]/;
const DIGIT = /[0-9０-９]/;

// 漢字1文字あたりの平均モーラ数（音読み2モーラ・訓読み2〜3モーラの実測平均）
const MORA_PER_KANJI = 1.9;
// 数字は「いち」「にじゅう」など読みが伸びる
const MORA_PER_DIGIT = 2.0;
// アルファベットは略語読み（NASA=ナサ など）を想定して低めに
const MORA_PER_LATIN = 1.1;

/** テキストの推定モーラ数 */
export function estimateMora(text) {
  if (!text) return 0;
  let mora = 0;
  for (const ch of String(text)) {
    if (SMALL_KANA.test(ch)) {
      // 拗音（ゃゅょ）は直前と合わせて1モーラ、促音・長音は1モーラ
      mora += /[ゃゅょャュョ]/.test(ch) ? 0 : 1;
    } else if (KANA.test(ch)) {
      mora += 1;
    } else if (KANJI.test(ch)) {
      mora += MORA_PER_KANJI;
    } else if (DIGIT.test(ch)) {
      mora += MORA_PER_DIGIT;
    } else if (LATIN.test(ch)) {
      mora += MORA_PER_LATIN;
    }
    // 句読点・記号・空白は0（間はポーズで別途加算）
  }
  return Math.round(mora * 10) / 10;
}

/** 句読点による「間」。読点0.15秒、句点0.35秒。 */
export function estimatePause(text) {
  if (!text) return 0;
  let pause = 0;
  for (const ch of String(text)) {
    if (ch === '、' || ch === ',') pause += 0.15;
    else if (ch === '。' || ch === '.' || ch === '！' || ch === '？' || ch === '!' || ch === '?') pause += 0.35;
  }
  return Math.round(pause * 100) / 100;
}

/**
 * 読み上げ秒数の推定。
 * @param {string} text
 * @param {number} moraPerSec 話速（TTS標準 ≒ 7.5、ショート向けの早口 ≒ 9）
 */
export function estimateDurationSec(text, moraPerSec = 8.5) {
  const speed = moraPerSec > 0 ? moraPerSec : 8.5;
  const sec = estimateMora(text) / speed + estimatePause(text);
  return Math.round(sec * 100) / 100;
}

/** 台本全体の尺 */
export function totalDurationSec(beats, moraPerSec = 8.5) {
  return Math.round(
    beats.reduce((sum, b) => sum + estimateDurationSec(b.narration, moraPerSec), 0) * 100
  ) / 100;
}

/** 秒 → 0:00.0 表記 */
export function fmtSec(sec) {
  const s = Math.max(0, sec);
  const m = Math.floor(s / 60);
  const rest = s - m * 60;
  return `${m}:${rest.toFixed(1).padStart(4, '0')}`;
}
