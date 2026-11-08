// 導覽的每一站：卡片文字＋鏡頭位置（pos）與注視點（target）
// 之後鳥放進來，每種鳥再加一站
import * as THREE from 'three'
import { MTN, POOL, DECK, RAMP, rampSample, mtnR, terrainHeight } from './layout.js'

const RAMP_W = RAMP.width

const V = (x, y, z) => new THREE.Vector3(x, y, z)
// 步道上第 s（0～1）、離內緣 off 公尺處，眼睛高度 eye 的位置
export function rampPoint(s, off, eye = 1.65) {
  const p = rampSample(Math.min(1, Math.max(0, s)))
  const r = p.ri + off
  return V(MTN.x + r * Math.cos(p.th), p.y + eye, MTN.z + r * Math.sin(p.th))
}
// 環山步道上第 s（0～1）的位置：站在外側欄杆邊、朝山壁看
function onRamp(s, { out = 1.2, eye = 1.65, look = 0, lookUp = 0.8 } = {}) {
  const p = rampSample(s)
  const r = p.ro - out
  const pos = V(MTN.x + r * Math.cos(p.th), p.y + eye, MTN.z + r * Math.sin(p.th))
  const th = p.th + look
  const rt = mtnR(th, p.y + 1)
  const target = V(MTN.x + rt * Math.cos(th), p.y + eye + lookUp, MTN.z + rt * Math.sin(th))
  return { pos, target }
}

export function buildStops(heroes) {
  const J = heroes.jungle, U = heroes.understory
  // 主角大樹：從步道邊斜仰拍，樹幹到樹冠都入鏡
  const jungleDir = V(-0.55, 0, 0.83).normalize()
  // 站在地面上：鏡頭高度從該點的地形算
  const ground = (x, z, eye) => V(x, terrainHeight(x, z) + eye, z)
  const jc = J.clone().addScaledVector(jungleDir, 17), jungleCam = ground(jc.x, jc.z, 1.7)
  const understoryCam = ground(U.x - 4.6, U.z - 3.2, 2.3)

  const fallX = MTN.x - mtnR(Math.PI, 0)
  const ramp1 = onRamp(0.3, { out: 0.35, look: 0.28, lookUp: 2.2 })
  // 空中步道：站在步道上順著走的方向看（步道在山的外圈往上繞）
  const rs = rampSample(0.55), rs2 = rampSample(0.62)
  const mid = (rs.ri + rs.ro) / 2, mid2 = (rs2.ri + rs2.ro) / 2
  const walkPos = V(MTN.x + mid * Math.cos(rs.th), rs.y + 1.65, MTN.z + mid * Math.sin(rs.th))
  const walkTarget = V(MTN.x + (mid2 + 1.5) * Math.cos(rs2.th), rs2.y + 1.2, MTN.z + (mid2 + 1.5) * Math.sin(rs2.th))
  // 山頂觀景台：站在平台外緣，往下看整片樹冠
  const deckDir = V(Math.cos(DECK.th), 0, Math.sin(DECK.th))
  const deckPos = V(DECK.x, DECK.y + 1.75, DECK.z).addScaledVector(deckDir, 3.2)
  const deckTarget = deckPos.clone().addScaledVector(deckDir, 30).add(V(0, -12, 0))

  return [
    {
      cover: true,
      title: '鳥類生態園',
      text: '一座玻璃圓頂下的熱帶雨林：中央是一座雲霧山，山上垂下瀑布，空中步道一路繞到山頂。往下滑動，跟著鏡頭去認識住在這裡的鳥。',
      pos: V(-64, 13, 14), target: V(8, 13, -6),
    },
  ]
}
