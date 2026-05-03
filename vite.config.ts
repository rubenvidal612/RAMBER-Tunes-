import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.SUPABASE_URL': JSON.stringify(env.SUPABASE_URL || env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL),
      'process.env.SUPABASE_ANON_KEY': JSON.stringify(
        env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      ),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      proxy: {
        '/api/suno/credits': {
          target: env.SUNO_API_BASE_URL || 'https://api.sunoapi.org',
          changeOrigin: true,
          rewrite: (path) => '/api/v1/generate/credit',
          configure: (proxy, options) => {
            proxy.on('proxyReq', (proxyReq, req, res) => {
              proxyReq.setHeader('Authorization', `Bearer ${env.SUNO_API_KEY}`);
            });
          },
        },
        '/api/account/balance': {
          target: env.SUNO_API_BASE_URL || 'https://api.sunoapi.org',
          changeOrigin: true,
          rewrite: (path) => '/api/v1/generate/credit',
          configure: (proxy, options) => {
            proxy.on('proxyReq', (proxyReq, req, res) => {
              proxyReq.setHeader('Authorization', `Bearer ${env.SUNO_API_KEY}`);
            });
            proxy.on('proxyRes', (proxyRes, req, res) => {
              let body = '';
              proxyRes.on('data', (chunk) => { body += chunk; });
              proxyRes.on('end', () => {
                try {
                  const data = JSON.parse(body);
                  // Transform Suno format to our app format
                  const credits = data.data || 0;
                  const transformed = {
                    credits: credits,
                    song_balance: Math.floor(credits / 12),
                    downloads_allowed: true,
                    source: 'provider_proxy'
                  };
                  res.writeHead(200, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify(transformed));
                } catch (e) {
                  // If transformation fails, just send original
                  res.end(body);
                }
              });
            });
          },
          selfHandleResponse: true
        },
      },
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
