// 2026-11-17 從 walkway.js 搬出來（花園螺旋步道 structures.js 也要用；structures ↔ walkway ↔ alpine 會循環引用）
// 2026-11-11 使用者：木棧道的燈光要更好、更寫實。以前借公園夜燈的白色點光源：木板上一圈圈過曝的白光、邊緣硬。
// 改成在材質裡自己算每盞矮燈的光：琥珀色（2200 K）、照度照距離平方衰減（近的亮、慢慢淡到 4 m 外）、燈上面有遮罩所以只往下往外照、
// 木板的法線貼圖吃得到光（木紋、板縫有明暗），欄杆柱朝燈的那面亮、背面暗。不加真的光源，全公園其他材質不受影響
import * as THREE from 'three'
export const LAMP_MAX = 40
export const LAMP_U = { uLampP: { value: Array.from({ length: LAMP_MAX }, () => new THREE.Vector3(0, -999, 0)) }, uLampOn: { value: 0 } }
export function lampLit(mat) {
  const prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey?.bind(mat)
  mat.onBeforeCompile = (sh, r) => {
    prev?.call(mat, sh, r)
    sh.uniforms.uLampP = LAMP_U.uLampP; sh.uniforms.uLampOn = LAMP_U.uLampOn
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vLampW;').replace('#include <project_vertex>', `#include <project_vertex>
      { vec4 lw = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          lw = instanceMatrix * lw;
        #endif
        vLampW = (modelMatrix * lw).xyz; }`)
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vLampW; uniform vec3 uLampP[${LAMP_MAX}]; uniform float uLampOn;`).replace('#include <opaque_fragment>', `
      if (uLampOn > 0.003) {
        float lampE = 0.0;
        for (int i = 0; i < ${LAMP_MAX}; i++) {
          vec3 d = uLampP[i] - vLampW; float r2 = dot(d, d);
          if (r2 > 25.0) continue;
          float r = sqrt(r2); vec3 l = (viewMatrix * vec4(d / r, 0.0)).xyz;
          float nl = max(dot(normal, l), 0.0) * 0.85 + 0.15;
          float att = 0.16 / (0.05 + r2) * smoothstep(5.0, 1.2, r);
          float shield = smoothstep(-0.12, 0.2, d.y);                       // 燈罩：燈的高度以上照不到
          lampE += nl * att * shield;
        }
        lampE = lampE / (1.0 + 0.35 * lampE);                               // 燈正下方不要過曝成一片白
        outgoingLight += diffuseColor.rgb * vec3(1.0, 0.5, 0.2) * lampE * uLampOn * 5.5;
      }
      #include <opaque_fragment>`)
  }
  mat.customProgramCacheKey = () => (prevKey?.() ?? '') + 'lampLit'
  return mat
}
// 別的地方的燈（[x, y, z, nx, nz]：光源點、燈面朝向的反方向）登記在這裡，walkway.js 挑離鏡頭最近的 LAMP_MAX 盞時一起算
export const EXTRA_LAMPS = []
