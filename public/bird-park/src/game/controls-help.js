// 操作說明：白色高級款鍵盤＋滑鼠（ChatGPT 畫的，鍵帽故意空白：models/raw/ref/controls-keyboard-white.png；舊的素描版 controls-keyboard.png）
// 上面用 SVG 自己標字母、拉引線、寫功能，像 Steam／PlayStation 遊戲的按鍵圖。座標都是原圖像素（1536×1024），量法看 README。
const KEYS = {   // 鍵帽範圍 [x0, x1, 中心 y]，鍵高約 40
  Esc: [63, 108, 373], Tab: [64, 136, 499], Q: [146, 187, 499], W: [198, 240, 499], E: [250, 294, 499],
  A: [160, 203, 551], S: [212, 255, 551], D: [264, 307, 551], Shift: [64, 178, 602], C: [291, 333, 602], Space: [268, 573, 654],
}
// 引線：從哪一點拉到哪裡（標籤的錨點），標籤文字靠哪邊
const CALLOUTS = [
  { from: [86, 354], to: [87, 175], key: 'Esc', text: '暫停・回選單', anchor: 'start', dx: -40 },
  { from: [100, 480], to: [230, 255], key: 'Tab', text: '相簿' },
  { from: [166, 480], to: [400, 250], key: 'Q', text: '換鏡頭' },
  { from: [272, 480], to: [640, 175], key: 'E', text: '互動：買賣、休息；舉著相機時開相機設定' },
  { from: [233, 570], to: [280, 900], key: 'W A S D', text: '走路' },
  { from: [121, 621], to: [100, 820], key: 'Shift', text: '跑步', anchor: 'start', dx: -40 },
  { from: [312, 621], to: [470, 820], key: 'C', text: '按住蹲低、慢慢靠近鳥' },
  { from: [470, 673], to: [720, 900], key: '空白鍵', text: '跳' },
  { from: [1360, 480], to: [1120, 230], key: '左鍵', text: '拍照' },
  { from: [1406, 432], to: [1406, 175], key: '滾輪', text: '變焦' },
  { from: [1455, 480], to: [1300, 900], key: '右鍵', text: '舉起／放下相機' },
  { from: [1406, 640], to: [1060, 820], key: '移動滑鼠', text: '轉頭看' },
]

export function controlsSvg() {
  const keys = Object.entries(KEYS).map(([k, [x0, x1, y]]) => `
    <rect class="k-hi" x="${x0}" y="${y - 19}" width="${x1 - x0}" height="38" rx="6"/>
    <text class="k-cap" x="${(x0 + x1) / 2}" y="${y + 7}">${k === 'Space' ? '' : k}</text>`).join('')
  const lines = CALLOUTS.map(({ from: [x1, y1], to: [x2, y2], key, text, anchor = 'middle', dx = 0 }) => `
    <line class="c-halo" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>
    <line class="c-line" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>
    <circle class="c-dot" cx="${x1}" cy="${y1}" r="7"/>
    <text class="c-label" x="${x2 + dx}" y="${y2 + (y2 < y1 ? -12 : 34)}" text-anchor="${anchor}"><tspan class="c-key">${key}</tspan><tspan dx="12">${text}</tspan></text>`).join('')
  return `<svg class="controls" viewBox="20 110 1516 840" role="img" aria-label="鍵盤滑鼠操作圖">
    <image href="models/controls-keyboard-white.webp?v=1" x="0" y="0" width="1536" height="1024"/>
    ${keys}${lines}</svg>`
}
