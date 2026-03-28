import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import type { Plugin } from 'vite';

function swCacheBustPlugin(): Plugin {
  return {
    name: 'sw-cache-bust',
    closeBundle() {
      const swPath = resolve('dist', 'sw.js');
      if (!existsSync(swPath)) return;
      const version = Date.now().toString(36);
      const content = readFileSync(swPath, 'utf-8');
      writeFileSync(swPath, content.replace('__SW_CACHE_VERSION__', version));
    },
  };
}

export default defineConfig({
  plugins: [react(), swCacheBustPlugin()],
});
