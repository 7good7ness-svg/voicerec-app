import { Markup } from 'telegraf';

/** 常設のメインメニュー（リプライキーボード） */
export const mainMenu = Markup.keyboard([
  ['📊 今月のまとめ', '📁 直近の記録'],
  ['🧮 税金の概算', '📤 CSV出力'],
  ['🎯 予算', '❓ 使い方'],
]).resize();

/** 記録直後に表示する「取消」インラインボタン */
export function undoButton(txId: number) {
  return Markup.inlineKeyboard([
    Markup.button.callback('↩️ この記録を取り消す', `del:${txId}`),
  ]);
}
