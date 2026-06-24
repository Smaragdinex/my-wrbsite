import { defineConfig } from 'astro/config';

// xarts.games 官網 — 純靜態輸出,部署到 GitHub Pages + Cloudflare。
// build.format='file' → 輸出 support.html / privacy.html(而非 support/index.html),
// 保留原始 URL,不破壞 App Store 隱私連結與既有書籤。
export default defineConfig({
  site: 'https://xarts.games',
  build: {
    format: 'file',
  },
});
