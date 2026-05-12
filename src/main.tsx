import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

try {
  const ua = (navigator.userAgent || '').toString();
  if (/android/i.test(ua)) {
    document.documentElement.classList.add('android');
  }
} catch {}

const isProd = Boolean((import.meta as unknown as { env?: { PROD?: boolean } }).env?.PROD);
if ('serviceWorker' in navigator && isProd) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
