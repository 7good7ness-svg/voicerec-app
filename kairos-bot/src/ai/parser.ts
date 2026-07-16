import { z } from 'zod';
import { anthropic, MODEL } from './claude.js';
import { config } from '../config.js';
import { today } from '../utils/date.js';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '../types.js';

// ===== 解析結果のスキーマ（実行時バリデーション用） =====
const TransactionItem = z.object({
  kind: z.enum(['expense', 'income']),
  amount: z.number().finite().positive(),
  category: z.string().min(1),
  vendor: z.string().nullable().optional().default(null),
  memo: z.string().nullable().optional().default(null),
  occurred_on: z.string(),
});
export type ParsedTransaction = z.infer<typeof TransactionItem>;

const ParseResult = z.object({
  action: z.enum(['record', 'query', 'report', 'set_budget', 'help', 'unknown']),
  transactions: z.array(TransactionItem).default([]),
  budget: z
    .object({ category: z.string(), monthly_limit: z.number() })
    .nullable()
    .optional()
    .default(null),
  query_text: z.string().nullable().optional().default(null),
  reply: z.string().nullable().optional().default(null),
});
export type ParseResult = z.infer<typeof ParseResult>;

// Claude に渡す submit ツール（構造化出力を強制）
const SUBMIT_TOOL = {
  name: 'submit',
  description: 'ユーザーメッセージの解析結果を構造化して返す。',
  input_schema: {
    type: 'object' as const,
    properties: {
      action: {
        type: 'string',
        enum: ['record', 'query', 'report', 'set_budget', 'help', 'unknown'],
        description:
          'record=収支の記録, query=データへの質問, report=月次サマリ要求, set_budget=予算設定, help=使い方, unknown=不明',
      },
      transactions: {
        type: 'array',
        description: 'action=record のとき、記録する収支明細（複数可）',
        items: {
          type: 'object',
          properties: {
            kind: { type: 'string', enum: ['expense', 'income'] },
            amount: { type: 'number', description: '金額（正の数、円）' },
            category: { type: 'string', description: '勘定科目カテゴリ' },
            vendor: { type: ['string', 'null'], description: '店名・支払先' },
            memo: { type: ['string', 'null'], description: '補足メモ' },
            occurred_on: {
              type: 'string',
              description: '発生日 YYYY-MM-DD。指定なければ今日。',
            },
          },
          required: ['kind', 'amount', 'category', 'occurred_on'],
          additionalProperties: false,
        },
      },
      budget: {
        type: ['object', 'null'],
        description: 'action=set_budget のとき、設定する予算',
        properties: {
          category: { type: 'string' },
          monthly_limit: { type: 'number' },
        },
      },
      query_text: {
        type: ['string', 'null'],
        description: 'action=query のとき、質問文をそのまま',
      },
      reply: {
        type: ['string', 'null'],
        description: 'action=help/unknown のとき、ユーザーへの短い返信',
      },
    },
    required: ['action', 'transactions'],
    additionalProperties: false,
  },
};

function systemPrompt(): string {
  return [
    'あなたはフリーランス・個人事業主向けの経費管理AI秘書「Kairos」です。',
    'ユーザーの日本語メッセージを解析し、必ず submit ツールを1回だけ呼び出してください。',
    '',
    `本日の日付は ${today()} です（タイムゾーン ${config.timezone}）。`,
    '',
    '【判定ルール】',
    '- 「ランチ 1200円」「タクシー 3000」「スタバ ¥580 打合せ」のような金額を含む記録 → action=record, kind=expense',
    '- 「売上 50000」「報酬 入金 10万」など収入 → action=record, kind=income',
    '- 「今月の交通費は？」「先月いくら使った？」など質問 → action=query（query_textに原文）',
    '- 「今月のまとめ」「レポート」→ action=report',
    '- 「通信費の予算を1万円に」→ action=set_budget',
    '- 記録も質問も当てはまらない → action=help か unknown（replyに案内文）',
    '',
    '【経費カテゴリ（必ずこの中から最も近いものを選ぶ）】',
    EXPENSE_CATEGORIES.join(' / '),
    '【収入カテゴリ】',
    INCOME_CATEGORIES.join(' / '),
    '',
    '【金額の解釈】',
    '- 「1200円」「1,200」「¥1200」→ 1200。「1万」→ 10000、「1.5万」→ 15000。',
    '- 1メッセージに複数明細があれば transactions に複数入れる。',
    '- 日付が「昨日」「3/5」等で示されたら occurred_on に反映。なければ今日。',
  ].join('\n');
}

/** テキストメッセージを解析して意図と明細を返す */
export async function parseMessage(text: string): Promise<ParseResult> {
  const res = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: systemPrompt(),
    tools: [SUBMIT_TOOL],
    tool_choice: { type: 'tool', name: 'submit' },
    messages: [{ role: 'user', content: text }],
  });

  const block = res.content.find((b) => b.type === 'tool_use');
  if (!block || block.type !== 'tool_use') {
    return { action: 'unknown', transactions: [], budget: null, query_text: null, reply: null };
  }
  const parsed = ParseResult.safeParse(block.input);
  if (!parsed.success) {
    return { action: 'unknown', transactions: [], budget: null, query_text: null, reply: null };
  }
  return parsed.data;
}

/** レシート画像を解析して経費明細を1件抽出する */
export async function extractReceipt(
  imageBase64: string,
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif',
): Promise<ParsedTransaction | null> {
  const res = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system:
      systemPrompt() +
      '\n\n画像はレシート／領収書です。合計金額・店名・日付を読み取り、action=record・kind=expense の transactions を1件だけ返してください。',
    tools: [SUBMIT_TOOL],
    tool_choice: { type: 'tool', name: 'submit' },
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: imageBase64 },
          },
          { type: 'text', text: 'このレシートを経費として記録して。' },
        ],
      },
    ],
  });

  const block = res.content.find((b) => b.type === 'tool_use');
  if (!block || block.type !== 'tool_use') return null;
  const parsed = ParseResult.safeParse(block.input);
  if (!parsed.success || parsed.data.transactions.length === 0) return null;
  return parsed.data.transactions[0] ?? null;
}

/** ユーザーの質問に、与えられたデータ文脈をもとに自然言語で回答する */
export async function answerQuery(
  question: string,
  dataContext: string,
): Promise<string> {
  const res = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 700,
    system:
      'あなたは経費管理AI秘書「Kairos」です。以下のユーザーの帳簿データだけを根拠に、質問へ簡潔に日本語で答えてください。' +
      'データにない事は「記録がありません」と答え、推測で金額を作らないこと。金額は「¥1,200」形式で。',
    messages: [
      {
        role: 'user',
        content: `【帳簿データ】\n${dataContext}\n\n【質問】\n${question}`,
      },
    ],
  });
  const text = res.content
    .filter((b) => b.type === 'text')
    .map((b) => (b.type === 'text' ? b.text : ''))
    .join('')
    .trim();
  return text || 'うまく回答できませんでした。もう一度お試しください。';
}
