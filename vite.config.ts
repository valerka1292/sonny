import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  const enableHmr = env.VITE_ENABLE_HMR === 'true';
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // Keep disabled by default for AI Studio sessions; enable locally with VITE_ENABLE_HMR=true.
      hmr: enableHmr,
    },
  };
});
