import {StrictMode, Component} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import './theme/theme.css';
import {ThemeProvider} from './theme/ThemeProvider';

// #region debug-point error-boundary
class GlobalErrorBoundary extends Component<{children: any}, {hasError: boolean; error: string; stack: string; info: string}> {
  constructor(props: any) {
    super(props);
    this.state = {hasError: false, error: '', stack: '', info: ''};
  }

  static getDerivedStateFromError(error: any) {
    console.error('[DEBUG] GlobalErrorBoundary caught error:', error);
    return {
      hasError: true,
      error: error?.message || String(error),
      stack: error?.stack || '',
      info: ''
    };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error('[DEBUG] Error details:', error, errorInfo);
    const infoText = [
      errorInfo?.componentStack ? ('COMPONENT STACK:\n' + String(errorInfo.componentStack)) : '',
    ].filter(Boolean).join('\n\n');
    this.setState((s) => ({ ...s, info: infoText }));
  }

  render() {
    if (this.state.hasError) {
      const fullBox = [
        this.state.error ? ('ERROR:\n' + this.state.error) : '',
        this.state.stack ? ('\nSTACK:\n' + String(this.state.stack).slice(0, 4000)) : '',
        this.state.info ? ('\n' + this.state.info) : ''
      ].filter(Boolean).join('\n');
      return (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: '#0a0a0a',
          color: 'white',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'flex-start',
          padding: '20px 16px 40px',
          textAlign: 'left',
          zIndex: 9999,
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch'
        }}>
          <div style={{fontSize: 24, fontWeight: 'bold', marginBottom: 10, textAlign: 'center', width: '100%'}}>¡Ups! Algo salió mal</div>
          <div style={{marginBottom: 20, color: '#ccc', textAlign: 'center', width: '100%'}}>La aplicación encontró un error y no puede continuar.</div>
          <div style={{
            backgroundColor: '#1a1a1a',
            padding: 15,
            borderRadius: 10,
            marginBottom: 20,
            maxWidth: 720,
            width: '100%',
            overflow: 'auto',
            fontSize: 12,
            lineHeight: 1.5,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word'
          }}>
            {fullBox || this.state.error}
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{
              backgroundColor: '#3b82f6',
              color: 'white',
              border: 'none',
              padding: '10px 20px',
              borderRadius: 8,
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
            Recargar aplicación
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
// #endregion

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <GlobalErrorBoundary>
        <App />
      </GlobalErrorBoundary>
    </ThemeProvider>
  </StrictMode>,
);

// #region debug-point global-error-handler
try {
  // Listener para errores no capturados
  window.addEventListener('error', (event) => {
    console.error('[DEBUG] Uncaught error:', event.error);
    console.error('[DEBUG] Error at:', event.filename, 'line', event.lineno, 'col', event.colno);
  });

  // Listener para promesas rechazadas no capturadas
  window.addEventListener('unhandledrejection', (event) => {
    console.error('[DEBUG] Unhandled promise rejection:', event.reason);
  });

  const ua = (navigator.userAgent || '').toString();
  if (/android/i.test(ua)) {
    document.documentElement.classList.add('android');
  }
} catch (e) {
  console.error('[DEBUG] Error in global handler setup:', e);
}
// #endregion

const isProd = Boolean((import.meta as unknown as { env?: { PROD?: boolean } }).env?.PROD);
const isLocalDevHost = (() => {
  try {
    const host = (window.location.hostname || '').toString().trim().toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0';
  } catch {
    return false;
  }
})();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    if (isProd && !isLocalDevHost) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
      return;
    }

    navigator.serviceWorker.getRegistrations()
      .then((regs) => Promise.allSettled(regs.map((r) => r.unregister())))
      .catch(() => {});

    if ('caches' in window) {
      caches.keys()
        .then((keys) => Promise.allSettled(keys.map((key) => caches.delete(key))))
        .catch(() => {});
    }
  });
}
