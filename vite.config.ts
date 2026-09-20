import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(({mode}) => {
  const fileEnv = loadEnv(mode, '.', '');
  const env = { ...(process.env || {}), ...(fileEnv || {}) } as Record<string, string | undefined>;
  const apiBase =
    env.API_BASE_URL ||
    env.VITE_API_URL ||
    env.NEXT_PUBLIC_API_URL ||
    env.NEXT_PUBLIC_API_BASE_URL ||
    'https://ramber-tunes.vercel.app';

  const siteUrl = env.NEXT_PUBLIC_SITE_URL || env.VITE_SITE_URL || '';

  console.log('--- Vite Config Environment ---');
  console.log('Mode:', mode);
  console.log('API Base:', apiBase);
  console.log('Site URL:', siteUrl);
  console.log('Supabase URL:', env.SUPABASE_URL ? 'PRESENT' : 'MISSING');
  console.log('Supabase Anon Key:', env.SUPABASE_ANON_KEY ? 'PRESENT' : 'MISSING');
  if (env.NEXT_PUBLIC_VERCEL_URL) console.log('Vercel URL:', env.NEXT_PUBLIC_VERCEL_URL);
  console.log('-------------------------------');

  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.NEXT_PUBLIC_SITE_URL': JSON.stringify(siteUrl || env.NEXT_PUBLIC_VERCEL_URL || ''),
      'process.env.SUPABASE_URL': JSON.stringify(env.SUPABASE_URL),
      'process.env.SUPABASE_ANON_KEY': JSON.stringify(env.SUPABASE_ANON_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
      proxy: {
        '/api': {
          target: apiBase,
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path,
        }
      },
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâ€”file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
