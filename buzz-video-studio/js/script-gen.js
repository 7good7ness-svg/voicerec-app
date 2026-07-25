// 台本生成。
// 台本はAIに書かせる。ただし「構成・尺・禁止表現」はこちらが固定する。
// APIキーが無くてもテンプレートで下書きが出る（オフライン動作）。

export const STRUCTURES = {
  clip: {
    name: '切り抜き型',
    desc: '海外・話題の人物の発言を軸に、結論→根拠→反転で持っていく',
    beats: ['フック', '発言の提示', '背景', '反転', '締め'],
  },
  contrarian: {
    name: '逆張り型',
    desc: '常識を否定して引きを作る。飽和ジャンルで刺さる',
    beats: ['フック', '常識の提示', '否定', '根拠', '締め'],
  },
  ranking: {
    name: 'ランキング型',
    desc: '最後まで見せる力が強い。1位は最後',
    beats: ['フック', '3位', '2位', '1位', '締め'],
  },
  story: {
    name: '実話型',
    desc: '一人称の体験。AIっぽさが最も出にくい',
    beats: ['フック', '状況', '事件', '結果', '学び'],
  },
};

export const BANNED = [
  'いかがでしたでしょうか',
  '最後までご覧いただき',
  '皆さん',
  '近年',
  '〜と言えるでしょう',
  '重要なポイント',
];

/** LLMに投げるプロンプト。台本の質はここで決まる。 */
export function buildScriptPrompt(topic = {}, opts = {}) {
  const targetSec = opts.targetSec || 40;
  const structure = STRUCTURES[opts.structure] || STRUCTURES.clip;
  const beatCount = structure.beats.length;

  return `あなたはYouTubeショートの構成作家です。以下の条件で日本語の台本を書いてください。

# 題材（人間が選んだもの。変更禁止）
- チャンネルのジャンル: ${topic.genre || '未設定'}
- 題材: ${topic.subject || '未設定'}
- なぜ今か: ${topic.whyNow || '未設定'}
- 冒頭2秒で言いたいこと: ${topic.hook || '未設定'}
- 使う映像: ${topic.footage || '話題の人物の切り抜き'}

# 構成（${structure.name}：${structure.desc}）
${structure.beats.map((b, i) => `${i + 1}. ${b}`).join('\n')}

# 制約
- 全体の読み上げ尺は${targetSec}秒。1ビートあたり ${Math.round((targetSec / beatCount) * 10) / 10} 秒前後。
- 最初の2秒で結論か違和感を出す。前置き・挨拶・自己紹介は禁止。
- 話し言葉。1文は最長でも25文字。短い文と長い文を混ぜる。
- 敬体だけで通さない。体言止めと常体を3割混ぜる。
- 数字・固有名詞を最低2つ入れる。
- 次の表現は使用禁止: ${BANNED.join('、')}
- telop はナレーションの要約ではなく、画面に出す「キーワード13文字以内」。全文を入れない。
- emphasis は telop の中で色を変える1語（無ければ空文字）。

# 出力形式（JSONのみ。前後に文章を付けない）
{
  "title": "動画タイトル（28文字以内・数字か固有名詞を含む）",
  "beats": [
    {"role": "フック", "narration": "読み上げる文", "telop": "13文字以内", "emphasis": "強調する1語", "broll": "この区間に映す素材の指示"}
  ],
  "description": "概要欄（100文字以内）",
  "hashtags": ["#shorts", "..."]
}`;
}

/** LLM応答からJSONを取り出す */
export function parseScriptResponse(text) {
  const raw = String(text || '');
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : raw;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('JSONが見つかりません');
  const parsed = JSON.parse(body.slice(start, end + 1));
  if (!Array.isArray(parsed.beats) || parsed.beats.length === 0) throw new Error('beats が空です');
  parsed.beats = parsed.beats.map((b) => ({
    role: b.role || '',
    narration: b.narration || '',
    telop: b.telop || '',
    emphasis: b.emphasis || '',
    broll: b.broll || '',
  }));
  return parsed;
}

/** APIキー無しでも動く下書き。構成の型を体で覚えるためのもの。 */
export function draftScript(topic = {}, opts = {}) {
  const subject = topic.subject || 'この話題';
  const genre = topic.genre || 'このジャンル';
  const hook = topic.hook || `${subject}、実はもう終わってます`;
  const why = topic.whyNow || '今この瞬間に伸びているから';
  const structure = opts.structure || 'clip';

  const tables = {
    clip: [
      { role: 'フック', narration: `${hook}。`, telop: cut(hook, 13), emphasis: firstWord(subject), broll: `${subject}の切り抜き。一番表情が動く箇所を頭出し。` },
      { role: '発言の提示', narration: `${subject}はこう言いました。`, telop: '本人の発言', emphasis: '発言', broll: '発言部分を等倍で。字幕は原文のまま。' },
      { role: '背景', narration: `理由は単純です。${why}。`, telop: '理由は1つ', emphasis: '1つ', broll: '関連するグラフか資料を1枚。' },
      { role: '反転', narration: `でも、ここからが違いました。`, telop: 'ここから逆転', emphasis: '逆転', broll: 'カット切り替え。効果音を1つ入れる。' },
      { role: '締め', narration: `${genre}をやるなら、ここだけは押さえてください。`, telop: 'これだけは', emphasis: 'これだけ', broll: '静止画で3秒止める。' },
    ],
    contrarian: [
      { role: 'フック', narration: `${hook}。`, telop: cut(hook, 13), emphasis: firstWord(subject), broll: '結論のテキストをフルスクリーンで。' },
      { role: '常識の提示', narration: `${genre}では、こう言われています。`, telop: '常識', emphasis: '常識', broll: '一般論の引用を画面に出す。' },
      { role: '否定', narration: `これ、逆です。`, telop: '逆です', emphasis: '逆', broll: '画面を反転。効果音。' },
      { role: '根拠', narration: `${why}。数字を見れば分かります。`, telop: '数字で見る', emphasis: '数字', broll: '数値の比較を1画面で。' },
      { role: '締め', narration: `やるかどうかは、あなた次第です。`, telop: 'あなた次第', emphasis: 'あなた', broll: '無音1秒で止める。' },
    ],
    ranking: [
      { role: 'フック', narration: `${subject}のヤバいやつ、3つ。`, telop: 'ヤバい3つ', emphasis: '3つ', broll: '3カットを0.3秒ずつ先出し。' },
      { role: '3位', narration: `3位。これは知ってる人も多いはず。`, telop: '第3位', emphasis: '3', broll: '該当素材。' },
      { role: '2位', narration: `2位。ここから空気が変わります。`, telop: '第2位', emphasis: '2', broll: '該当素材。' },
      { role: '1位', narration: `そして1位。${why}。`, telop: '第1位', emphasis: '1', broll: '一番強い素材をここに置く。' },
      { role: '締め', narration: `知らなかった人、コメントで教えてください。`, telop: '知ってた？', emphasis: '知ってた', broll: 'コメント誘導を画面下に。' },
    ],
    story: [
      { role: 'フック', narration: `${hook}。`, telop: cut(hook, 13), emphasis: firstWord(subject), broll: '当時の画面録画かスクショ。' },
      { role: '状況', narration: `最初は、全部うまくいくと思っていました。`, telop: '最初は順調', emphasis: '順調', broll: '作業画面。' },
      { role: '事件', narration: `でも、結果は全然でした。`, telop: '結果は', emphasis: '全然', broll: '数字のスクショ。モザイクでも可。' },
      { role: '結果', narration: `${why}。それだけが違いました。`, telop: '違いは1つ', emphasis: '1つ', broll: '比較画面。' },
      { role: '学び', narration: `同じことをやろうとしてる人、先に言っときます。`, telop: '先に言う', emphasis: '先に', broll: '正面カット。' },
    ],
  };

  const beats = tables[structure] || tables.clip;
  return {
    title: cut(`${subject}が${genre}で一番ヤバい理由`, 28),
    beats: beats.map((b) => ({ ...b })),
    description: `${subject}について。${why}`.slice(0, 100),
    hashtags: ['#shorts', `#${(genre || 'AI').replace(/\s/g, '')}`, '#切り抜き'],
    _draft: true,
  };
}

function cut(s, n) {
  const t = String(s || '').replace(/[。、]/g, '');
  return t.length > n ? t.slice(0, n) : t;
}
function firstWord(s) {
  return String(s || '').slice(0, 4);
}

/** Gemini API（ブラウザから直接。キーは端末のlocalStorageにのみ保存） */
export async function callGemini(apiKey, prompt, model = 'gemini-2.5-flash') {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 1.0, responseMimeType: 'application/json' },
    }),
  });
  if (!res.ok) throw new Error(`Gemini API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = await res.json();
  const text = json?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
  if (!text) throw new Error('空の応答が返りました');
  return text;
}
