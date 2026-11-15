// 2026-11-16 使用者：「高度每 1000（英尺）溫度減 2 度；紅杉林那邊清晨、或溫度跟露點很接近時，要很濃的霧、能見度很低」
// 簡單的氣象模型（每格算一次，給 world.js 調霧、給 HUD 顯示）：
//   平地（花園）的氣溫照時間走：清晨 6 點最低 16°C、下午 2 點半最高 26°C；露點一天裡變化不大（13°C），下雨時空氣接近飽和、大太陽時比較乾。
//   往上走：氣溫每 1000 m 降 6.5°C（＝每 1000 英尺約 2°C，乾空氣上升冷卻的平均值）；露點每 1000 m 只降約 2°C。
//   → 越高，氣溫和露點越接近；兩者差（溫度露點差）小於 2～3°C 就起霧，差 0 就是飽和、一片白。
//   所以清晨（氣溫最低）高處的紅杉林最容易被霧包住；中午氣溫升高、霧就散了。
// 遊戲的山被壓縮過（地形最高才 60 m），換算成「真實海拔」：花園約 150 m，山區每 1 m 地形算 40 m（紅杉林大約 800～2300 m，像阿里山）
import * as THREE from 'three'

const { smoothstep, lerp, clamp } = THREE.MathUtils
export const CLIMATE = { base: 150, scale: 40, ground0: 2, lapse: 6.5, dewLapse: 2.0, tMean: 21, tAmp: 5, dew: 13 }

export const elevationOf = (groundY) => CLIMATE.base + Math.max(0, groundY - CLIMATE.ground0) * CLIMATE.scale

// 平地氣溫：6 點最低、14.5 點最高（升溫 8.5 小時、降溫 15.5 小時）
export function seaTemp(h, amp = CLIMATE.tAmp) {
  const C = CLIMATE
  let f
  if (h >= 6 && h <= 14.5) f = -Math.cos(Math.PI * (h - 6) / 8.5)
  else { const hh = h < 6 ? h + 24 : h; f = Math.cos(Math.PI * (hh - 14.5) / 15.5) }
  return C.tMean + amp * f
}

// 給一個海拔、時間、天氣（rain 0～1、sunny 0～1）→ 氣溫、露點、溫度露點差、霧（0～1）、能見度（公尺）
export function climateAt(elev, hour, { rain = 0, sunny = 0 } = {}) {
  const C = CLIMATE, km = elev / 1000
  // 晴朗的夜裡地面輻射冷卻，清晨更冷、下午更熱（日夜溫差大）→ 晴天的清晨反而最容易起霧；下雨空氣溼、露點高
  const t0 = seaTemp(hour, C.tAmp + 2 * sunny - 2 * rain) - 1.5 * rain
  let td0 = C.dew + 2.5 * rain
  td0 = Math.min(td0, t0)
  const T = t0 - C.lapse * km
  const Td = Math.min(T, td0 - C.dewLapse * km)   // 露點不會比氣溫高（多的水氣凝結成霧）
  const spread = T - Td
  const fog = 1 - smoothstep(spread, 0.3, 3.2)   // 差 3°C 開始有薄霧、差 0.3°C 以下最濃
  const vis = 22 * Math.pow(5000 / 22, 1 - fog)   // 能見度：霧 0.5 約 330 m、0.8 約 65 m、1（飽和）約 20 m
  return { elev, T, Td, spread, fog, vis }
}

export const fmtClimate = (c) => `${Math.round(c.T)}°C／露點 ${Math.round(c.Td)}°C${c.fog > 0.15 ? `／能見度 ${c.vis < 1000 ? Math.round(c.vis / 10) * 10 + ' m' : (c.vis / 1000).toFixed(1) + ' km'}` : ''}`
export { clamp }
