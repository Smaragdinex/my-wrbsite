// 多館切換：圓頂（主館）＋附屬館（高山館 alpine.js、海岸館 coast.js…）。每個附屬館都是「圓頂 → 玻璃通道 → 緩衝室兩道門 → 館」。
// 同一時間只畫玩家所在的那一館：圓頂裡面（植物、鳥、水池、相機行…）在玩家走進某個附屬館（過了緩衝室中間、靠圓頂那道門也關了）時整批藏起來；
// 附屬館的館內只有玩家在館裡、或靠館那道門開著時才畫。圓頂外殼、地面、天空、各館外殼永遠都畫（便宜，從別館看得到）。
// 在附屬館裡：太陽陰影的範圍移到那一館的中心（陰影貼圖只蓋得到一館）、霧換成那一館的濃度。
export function createHalls({ scene, sun, halls }) {
  const fog0 = scene.fog.density
  let domeObjs = null, mode = ''
  const keep = new Set(['domeShell', 'ground'])
  function collectDome() {
    const annex = new Set(halls.flatMap((h) => [h.shell, h.interior]))
    domeObjs = scene.children.filter((o) => !o.isLight && o !== sun.target && !annex.has(o) && !keep.has(o.name) && !(o.isMesh && o.geometry?.parameters?.radius >= 800))
  }
  // 館內的 build() 可能是非同步的（海岸館要先下載模型）：載入畫面等全部蓋好
  const prebuild = () => Promise.all(halls.map((h) => h.build()))
  function tick(t, dt, camera) {
    const p = camera.position
    for (const h of halls) { if (h.approach(p)) h.build(); h.doors(t, dt, p) }
    // 每一館要不要畫
    const showH = halls.map((h) => !!h.interior && (h.inside(p) || h.farOpen()))
    const showDome = halls.every((h) => !h.inside(p) || h.nearOpen())
    const m = showH.map((v) => (v ? 1 : 0)).join('') + (showDome ? 'D' : '')
    if (m !== mode) {
      mode = m
      if (!domeObjs) collectDome()
      halls.forEach((h, i) => { if (h.interior) h.interior.visible = showH[i] })
      for (const o of domeObjs) o.visible = showDome
      const only = !showDome && halls.find((h, i) => showH[i])
      sun.target.position.set(only ? only.center.x : 0, 0, only ? only.center.z : 0)
      scene.fog.density = only ? only.fog : fog0
    }
    halls.forEach((h, i) => { if (showH[i]) h.animate(t, dt) })
  }
  return { tick, prebuild, halls, get mode() { return mode } }
}
