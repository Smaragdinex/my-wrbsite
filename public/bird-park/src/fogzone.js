// 山區的霧：全場景共用一個 FogExp2，這裡改 three 的霧 shader，讓霧的濃度看位置：
// 熱帶花園照原本；越往東進山區越濃，而且是「低處濃、高處淡」（山谷、水池那邊一片白，爬到山頂會在雲海上面）。
// 濃度用「鏡頭和這個點的平均」：從花園看山區是霧茫茫的一片，走進山區、回頭看花園也一樣隔著霧。
// 要在任何材質編譯前 import（world.js 第一行）。
import * as THREE from 'three'

export const FOG_ZONE = { x0: 66, x1: 100, base: 0.8, valley: 2.4, fall: 8 }

const C = THREE.ShaderChunk
const patch = (name, a, b) => {
  if (!C[name].includes(a)) { console.warn('fogzone: three 的霧 shader 變了，沒套上', name); return }
  C[name] = C[name].replace(a, b)
}
patch('fog_pars_vertex', 'varying float vFogDepth;', 'varying float vFogDepth;\n\tvarying vec3 vFogWorld;')
// 世界座標：view 矩陣是剛體，反過來不用 inverse()
patch('fog_vertex', 'vFogDepth = - mvPosition.z;', 'vFogDepth = - mvPosition.z;\n\tvFogWorld = transpose( mat3( viewMatrix ) ) * ( mvPosition.xyz - viewMatrix[ 3 ].xyz );')
patch('fog_pars_fragment', 'varying float vFogDepth;', 'varying float vFogDepth;\n\tvarying vec3 vFogWorld;')
const f = (v) => v.toFixed(3)
patch('fog_fragment', 'float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );', `
		float fogZone = 0.5 * ( smoothstep( ${f(FOG_ZONE.x0)}, ${f(FOG_ZONE.x1)}, vFogWorld.x ) + smoothstep( ${f(FOG_ZONE.x0)}, ${f(FOG_ZONE.x1)}, cameraPosition.x ) );
		float fogY = 0.5 * ( vFogWorld.y + cameraPosition.y );
		float fogD = fogDensity * ( 1.0 + fogZone * ( ${f(FOG_ZONE.base)} + ${f(FOG_ZONE.valley)} * exp( - max( fogY - 1.0, 0.0 ) / ${f(FOG_ZONE.fall)} ) ) );
		float fogFactor = 1.0 - exp( - fogD * fogD * vFogDepth * vFogDepth );`)
