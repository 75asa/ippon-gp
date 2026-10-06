import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const web = (p: string) => resolve(import.meta.dirname, 'web', p);

export default defineConfig({
  root: 'web',
  // GitHub Pages のサブパス（/ippon-gp/）でも動くよう、相対パスで出力する
  base: './',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: web('index.html'),
        main: web('main/index.html'),
        host: web('host/index.html'),
        admin: web('admin/index.html'),
        camera: web('camera/index.html'),
        judge: web('judge/index.html'),
      },
      // Firebase SDK は npm 化するまで CDN の URL import のまま（src/shared/firebase.js）
      external: [/^https:\/\//],
    },
  },
});
