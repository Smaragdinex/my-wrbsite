// 老闆的 AI 在背景執行緒跑（不然 CPU 推論時整個遊戲會卡住好幾秒）。
// 先試顯示卡（WebGPU），用一題真的「評照片」測：有寫出價格、沒有一直重複同一句才算過；不過就改用 CPU（WASM）。
const TJS = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.1'
const MODEL = 'onnx-community/Qwen2.5-0.5B-Instruct'
let gen = null

const looping = (t) => /(.{4,})\1\1/s.test(t)
async function make(T, device, dtype, report) {
  const files = {}
  return T.pipeline('text-generation', MODEL, {
    dtype, device,
    progress_callback: (e) => {
      if (e.status === 'progress' && e.total) {
        files[e.file] = [e.loaded, e.total]
        const v = Object.values(files)
        report(v.reduce((a, x) => a + x[0], 0) / v.reduce((a, x) => a + x[1], 0))
      }
    },
  })
}

onmessage = async (e) => {
  const m = e.data
  if (m.type === 'load') {
    try {
      const T = await import(TJS)
      const report = (p) => postMessage({ type: 'progress', p })
      let device = 'wasm'
      if (m.prefer !== 'wasm' && self.navigator.gpu && await self.navigator.gpu.requestAdapter().catch(() => null)) {
        try {
          gen = await make(T, 'webgpu', 'q4f16', report)
          const o = await gen(m.test, { max_new_tokens: 50, do_sample: false })
          const ans = o[0].generated_text.at(-1).content
          if (/價格[:：]\s*\d/.test(ans) && !looping(ans)) device = 'webgpu'
          else { postMessage({ type: 'log', msg: 'WebGPU 測試沒過：' + ans }); await gen.dispose?.(); gen = null }
        } catch (err) { postMessage({ type: 'log', msg: 'WebGPU 失敗：' + err }); gen = null }
      }
      if (!gen) gen = await make(T, 'wasm', 'q4', report)
      postMessage({ type: 'ready', device })
    } catch (err) {
      postMessage({ type: 'failed', msg: String(err) })
    }
  }
  if (m.type === 'gen') {
    try {
      const o = await gen(m.msgs, m.opts)
      postMessage({ type: 'out', id: m.id, text: o[0].generated_text.at(-1).content })
    } catch (err) {
      postMessage({ type: 'out', id: m.id, error: String(err) })
    }
  }
}
