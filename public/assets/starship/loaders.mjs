// 全站共用一個 glTF / Draco 載入器(原本戰艦、大廳、通道、房間各開一個,每個最多 4 個解碼背景執行緒 → 最多 16 個,
// 每個都有自己的記憶體;舊 iPad 的 Safari 受不了)。行動裝置只開 1~2 個執行緒。
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { quality } from './quality.mjs?v=9';

const draco = new DRACOLoader();
draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
draco.setWorkerLimit(quality.lean ? 1 : quality.assets === 'mobile' ? 2 : 4);
let gl = null;
export const gltf = () => { if (!gl) { gl = new GLTFLoader(); gl.setDRACOLoader(draco); } return gl; };
