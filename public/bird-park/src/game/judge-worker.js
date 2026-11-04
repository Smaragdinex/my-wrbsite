// 老闆的 AI 在背景執行緒跑（WebLLM，專門為瀏覽器 WebGPU 調校的推論引擎；Apple、NVIDIA、AMD 顯示卡都穩）。
// 主程式那邊用 CreateWebWorkerMLCEngine 連過來，這裡只要把訊息交給 handler。
import { WebWorkerMLCEngineHandler } from 'https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.79/lib/index.js'

const handler = new WebWorkerMLCEngineHandler()
onmessage = (msg) => handler.onmessage(msg)
