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
      text: '一座玻璃圓頂下的熱帶雨林：中央是一座雲霧山，山上垂下瀑布，空中步道一路繞到山頂。往下滑動，先跟著鏡頭逛一圈園區，再去認識住在這裡的鳥。',
      pos: V(-64, 13, 14), target: V(8, 13, -6),
    },
    {
      title: '入口大道', tag: '棕櫚區',
      text: '從入口一進來，兩旁是一株株棕櫚。棕櫚沒有分枝，所有葉子都從樹幹頂端的生長點長出來；老葉枯掉脫落，樹幹上就留下一圈圈葉痕。',
      pos: ground(-71.5, 0.6, 1.7), target: V(-50, 5.5, 0),
    },
    {
      title: '雨林巨樹', tag: '上層樹冠',
      text: '雨林裡最高的一層，大樹把枝葉撐到二十公尺以上，搶最多的陽光。樹上垂下的藤蔓和成串的附生植物，是熱帶雨林典型的樣子。',
      pos: jungleCam, target: J.clone().add(V(0, 9, 0)),
    },
    {
      title: '林下植物', tag: '龜背芋・香蕉・火鶴',
      text: '大樹底下光線只剩一小部分，林下植物多半長著又大又薄的葉子，盡量接住從縫隙漏下來的光。龜背芋葉片上的裂孔，讓大葉子不容易被風雨撕破。',
      pos: understoryCam, target: U.clone().add(V(0.4, 0.9, 0.3)),
    },
    {
      title: '瀑布與水池', tag: '雲霧山腳',
      text: '瀑布從三十公尺高的山壁沿著峽谷落下，打進山腳的水池。水花和水氣讓周圍保持潮濕，蕨類和苔蘚在這裡長得特別茂盛。',
      pos: ground(fallX - 16, MTN.z + 3.5, 1.9), target: V(fallX - 1, 5.5, MTN.z),
    },
    {
      title: '雲霧山', tag: '園區中央',
      text: '仿照熱帶高山上的雲霧林：山頂常年被雲霧包圍，空氣涼爽潮濕。整座山壁長滿蕨類、鳳梨科和觀葉植物，空中步道沿著山的外圈一路往上繞。',
      pos: V(-34, 6, 20), target: V(MTN.x, 15, MTN.z),
    },
    {
      title: '山壁上的附生植物', tag: '空中步道・低段',
      text: '附生植物把根抓在岩壁和樹幹上，不用長在土裡。鳳梨科植物的葉子排成一圈，中間像杯子一樣能接住雨水；這小小的水池，也是許多小生物的家。',
      pos: ramp1.pos, target: ramp1.target, ramp: { s: 0.3, off: RAMP_W - 0.35 },
    },
    {
      title: '空中步道', tag: '環山而上',
      text: '步道繞著雲霧山轉兩圈多，一路爬到二十四公尺高。越往上越接近樹冠層，走在半空中可以看到平常從地面看不到的枝葉和花。',
      pos: walkPos, target: walkTarget, ramp: { s: 0.55, off: RAMP_W / 2 },
    },
    {
      title: '山頂觀景台', tag: '24 公尺高',
      text: '從觀景台往下看，整座溫室的樹冠都在腳下：高大的雨林樹、一叢叢棕櫚，和被步道分成一塊塊的林地。接下來，就到這些樹冠和草地間找找園區裡的鳥。',
      pos: deckPos, target: deckTarget, ramp: { s: 1, off: RAMP_W / 2 }, deck: true,
    },
  ]
}
