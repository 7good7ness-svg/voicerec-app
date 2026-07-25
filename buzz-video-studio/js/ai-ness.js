// AIっぽさ診断。
// 「AIで作った動画ですよね？」とコメントされる原因を、台本の段階で潰す。

const PHRASE_RULES = [
  { re: /いかがでした(でしょう|でし)ょうか/g, msg: 'まとめの「いかがでしたでしょうか」はAI/量産動画の代名詞', fix: '言い切りで終わる（例：「これが答えです。」）' },
  { re: /最後まで(ご覧|見て)いただき/g, msg: '定型の締め挨拶', fix: '最後の一言は感情か問いかけに変える' },
  { re: /ぜひ(チェック|試して|参考に)/g, msg: 'テンプレのCTA', fix: '「やるかやらないかはあなた次第」など具体の行動に' },
  { re: /皆さん、?/g, msg: '「皆さん」は不特定すぎて刺さらない', fix: '「あなた」に置き換える' },
  { re: /(と言えるでしょう|ではないでしょうか|かもしれません)/g, msg: '断定を避ける言い回し。ショートでは弱い', fix: '断定するか、疑問形で終わらせる' },
  { re: /(重要なポイント|注目すべき点|以下の通り|挙げられます)/g, msg: '説明文調でナレーションに向かない', fix: '話し言葉に崩す' },
  { re: /(近年|昨今|現代社会|私たちの生活)/g, msg: '作文の書き出し。0.5秒で離脱される', fix: '結論・数字・固有名詞から始める' },
  { re: /(まず|次に|最後に)、/g, msg: '手順の接続詞が多いと機械的に聞こえる', fix: '接続詞を消しても意味が通るか確認' },
  { re: /(です|ます)ね。/g, msg: '「〜ですね。」の多用は合成音声感を強める', fix: '体言止め・倒置を混ぜる' },
];

const HUMAN_SIGNALS = [
  { re: /[「『][^」』]{2,}[」』]/, label: 'セリフ・引用がある' },
  { re: /(正直|ぶっちゃけ|マジで|やばい|ヤバい|えぐい|しんどい|ムカつく|嬉しい|怖い)/, label: '感情語がある' },
  { re: /[0-9０-９]/, label: '具体的な数字がある' },
  { re: /(僕|私|俺|自分)(は|が|も)/, label: '一人称の体験がある' },
  { re: /[^。！？\n]{1,12}[。\n]/, label: '短い文がある' },
];

/**
 * @param {string} text 台本のナレーション全文
 * @returns {{score:number, level:'human'|'mixed'|'ai', findings:Array, signals:Array, stats:object}}
 */
export function analyzeAiNess(text) {
  const src = String(text || '');
  const findings = [];

  for (const rule of PHRASE_RULES) {
    const hits = src.match(rule.re);
    if (hits && hits.length) {
      findings.push({ phrase: hits[0], count: hits.length, msg: rule.msg, fix: rule.fix });
    }
  }

  // 文長のばらつき。均一だと機械的に聞こえる。
  const sentences = src.split(/[。！？\n]/).map((s) => s.trim()).filter(Boolean);
  const lens = sentences.map((s) => s.length);
  const mean = lens.length ? lens.reduce((a, c) => a + c, 0) / lens.length : 0;
  const variance = lens.length ? lens.reduce((a, c) => a + (c - mean) ** 2, 0) / lens.length : 0;
  const sd = Math.sqrt(variance);
  const uniform = lens.length >= 4 && sd < 4;
  if (uniform) {
    findings.push({
      phrase: `文長のばらつき σ=${sd.toFixed(1)}`,
      count: 1,
      msg: '全部の文が同じ長さ。棒読みに聞こえる最大の原因',
      fix: '3文字の文と20文字の文を混ぜる',
    });
  }

  // 「です・ます」の連続
  const desumasu = (src.match(/(です|ます)[。、\n]/g) || []).length;
  const desumasuRatio = sentences.length ? desumasu / sentences.length : 0;
  if (desumasuRatio > 0.7 && sentences.length >= 4) {
    findings.push({
      phrase: `敬体率 ${Math.round(desumasuRatio * 100)}%`,
      count: 1,
      msg: '敬体だけで押すと合成音声の平坦さが際立つ',
      fix: '常体・体言止めを3割混ぜる',
    });
  }

  const signals = HUMAN_SIGNALS.map((s) => ({ label: s.label, ok: s.re.test(src) }));
  const missingSignals = signals.filter((s) => !s.ok).length;

  const penalty = findings.reduce((sum, f) => sum + Math.min(3, f.count) * 7, 0) + missingSignals * 6;
  const score = Math.max(0, Math.min(100, penalty)); // 高いほどAIっぽい
  const level = score >= 55 ? 'ai' : score >= 25 ? 'mixed' : 'human';

  return {
    score,
    level,
    findings,
    signals,
    stats: { sentences: sentences.length, meanLen: Math.round(mean * 10) / 10, sd: Math.round(sd * 10) / 10 },
  };
}
