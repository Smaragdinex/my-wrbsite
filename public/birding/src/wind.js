// 植物隨風擺動：在材質的 vertex shader 插一段位移
export const windUniforms = { uTime: { value: 0 } }

export function addWind(mat, strength = 0.08) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = windUniforms.uTime
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec3 wp = instanceMatrix[3].xyz;
      #else
        vec3 wp = vec3(0.0);
      #endif
      float wh = abs(transformed.y);
      float ww = sin(uTime * 1.3 + wp.x * 0.35 + wp.z * 0.27) + 0.45 * sin(uTime * 2.9 + wp.x * 0.9 - wp.z * 0.5);
      transformed.x += ww * ${strength.toFixed(4)} * wh * wh;
      transformed.z += ww * ${(strength * 0.6).toFixed(4)} * wh * wh;`
    )
  }
  mat.customProgramCacheKey = () => 'wind' + strength
  return mat
}
