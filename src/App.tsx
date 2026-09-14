import { Component, useState, useEffect, useMemo, useRef } from 'react';
import { TopBar } from './components/TopBar';
import { BottomNav } from './components/BottomNav';
import { MiniPlayer } from './components/MiniPlayer';
import { CreateView } from './views/CreateView';
import { ApprovedCreatePreview, ApprovedCloneVoicePreview } from './ApprovedCreatePreview';
import { LibraryView } from './views/LibraryView';
import { ProfileView } from './views/ProfileView';
import { KaraokeView } from './views/KaraokeView';
import { SettingsView } from './views/SettingsView';
import { PricingView } from './views/PricingView';
import { LucianaBotView } from './views/LucianaBotView';
import { ElencoPresentationView } from './views/ElencoPresentationView';
import { MasterizarView } from './views/MasterizarView';
import { VendorView } from './views/VendorView';
import { HomeLandingView } from './views/HomeLandingView';
import { useUserCredits } from './hooks/useUserCredits';
import { type ViewTab, type SongItem, type VibeItem } from './types';
import { store } from './lib/store';
import { cn } from './lib/utils';
import { isAdminEmail } from './lib/authz';
import { ensureAnonSession, getAccessToken, signInWithGoogle, supabaseBrowser } from './lib/supabaseBrowser';
import { CREDIT_COSTS } from './lib/credits';

import { Sidebar } from './components/Sidebar';
import { ArrowRight, BadgeCheck, Cast, ChevronDown, Copy, Download, MessageCircle, MoreVertical, Music2, Rocket, Shield, Share2, Sparkles, Wand2, Repeat2, Play, Pause, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
const isDev = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

const APP_UPDATES: Array<{ date: string; title: string; detail: string }> = [
  { date: '2026-05-04', title: 'Mejoras en Biblioteca', detail: 'Carpetas, filtros por fecha y mejoras de scroll en PC.' },
  { date: '2026-05-04', title: 'Compartir canciones', detail: 'Los links compartidos ahora abren un reproductor dentro de LucIAna.' },
];

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

class ViewErrorBoundary extends Component<
  { title: string; children: any },
  { hasError: boolean; message: string }
> {
  declare props: Readonly<{ title: string; children: any }>;
  state: { hasError: boolean; message: string } = { hasError: false, message: '' };

  static getDerivedStateFromError(err: any) {
    const msg = err instanceof Error ? err.message : String(err || '');
    return { hasError: true, message: msg || 'Error inesperado' };
  }

  componentDidCatch(error: any, errorInfo: any) {
    try {
      console.error('[DEBUG] ViewErrorBoundary:', this.props.title, error, errorInfo);
    } catch {
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="m-4 rounded-3xl border border-red-500/20 bg-red-500/10 p-5 text-white">
        <div className="text-lg font-extrabold">{this.props.title}</div>
        <div className="mt-2 text-sm text-red-100">Esa parte de la app falló, pero el resto sigue disponible.</div>
        <div className="mt-3 text-xs text-red-200/90 break-words">{this.state.message}</div>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-4 h-10 rounded-full bg-white px-4 text-sm font-extrabold text-black"
        >
          Recargar app
        </button>
      </div>
    );
  }
}

function tabFromPathname(pathname: string): ViewTab {
  const p = (pathname || '/').toString().trim().toLowerCase();
  if (p === '/' || /^\/studio(?:\/|$)/i.test(p) || /^\/crear(?:\/|$)/i.test(p)) return 'studio';
  if (/^\/inicio(?:\/|$)/i.test(p) || /^\/app-inicio(?:\/|$)/i.test(p)) return 'landing';
  if (/^\/canciones(?:\/|$)/i.test(p)) return 'inicio';
  if (/^\/masterizar(?:\/|$)/i.test(p)) return 'masterizar';
  if (/^\/vendedor(?:\/|$)/i.test(p) || /^\/vendor(?:\/|$)/i.test(p)) return 'vendedor';
  if (/^\/biblioteca(?:\/|$)/i.test(p) || /^\/library(?:\/|$)/i.test(p)) return 'biblioteca';
  if (/^\/perfil(?:\/|$)/i.test(p) || /^\/profile(?:\/|$)/i.test(p)) return 'perfil';
  if (/^\/oficina(?:\/|$)/i.test(p) || /^\/office(?:\/|$)/i.test(p)) return 'oficina';
  if (/^\/luciana(?:\/|$)/i.test(p) || /^\/chatbot(?:\/|$)/i.test(p)) return 'luciana';
  if (/^\/clonador(?:\/|$)/i.test(p) || /^\/voces(?:\/|$)/i.test(p)) return 'voces';
  if (/^\/karaoke(?:\/|$)/i.test(p)) return 'karaoke';
  if (/^\/mv(?:\/|$)/i.test(p) || /^\/videos(?:\/|$)/i.test(p)) return 'mv';
  if (/^\/planes(?:\/|$)/i.test(p)) return 'planes';
  return 'studio';
}

function pathnameFromTab(tab: ViewTab): string {
  switch (tab) {
    case 'inicio':
      return '/canciones';
    case 'landing':
      return '/inicio';
    case 'masterizar':
      return '/masterizar';
    case 'vendedor':
      return '/vendedor';
    case 'biblioteca':
      return '/biblioteca';
    case 'perfil':
      return '/perfil';
    case 'oficina':
      return '/oficina';
    case 'luciana':
      return '/chatbot';
    case 'voces':
      return '/clonador';
    case 'karaoke':
      return '/karaoke';
    case 'mv':
      return '/videos';
    case 'planes':
      return '/planes';
    case 'studio':
    default:
      return '/crear';
  }
}

function InicioLanding({
  email,
  onGoStudio,
  onGoLibrary,
  onOpenPlans,
}: {
  email: string;
  onGoStudio: () => void;
  onGoLibrary: () => void;
  onOpenPlans: () => void;
}) {
  const name = (email || '').split('@')[0] || 'aquí';
  const heroImage =
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="720" viewBox="0 0 1200 720">
        <defs>
          <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#22d3ee" stop-opacity="0.35"/>
            <stop offset="0.5" stop-color="#6366f1" stop-opacity="0.35"/>
            <stop offset="1" stop-color="#a855f7" stop-opacity="0.35"/>
          </linearGradient>
          <linearGradient id="w" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stop-color="#22d3ee"/>
            <stop offset="0.5" stop-color="#6366f1"/>
            <stop offset="1" stop-color="#a855f7"/>
          </linearGradient>
        </defs>
        <rect width="1200" height="720" fill="#070a12"/>
        <rect x="48" y="48" width="1104" height="624" rx="40" fill="url(#g)" stroke="rgba(255,255,255,0.12)" stroke-width="2"/>
        <g opacity="0.9">
          <circle cx="260" cy="230" r="90" fill="rgba(34,211,238,0.14)"/>
          <circle cx="900" cy="220" r="130" fill="rgba(168,85,247,0.12)"/>
          <circle cx="760" cy="520" r="120" fill="rgba(99,102,241,0.12)"/>
        </g>
        <g transform="translate(140,305)" opacity="0.95">
          <rect x="0" y="-90" width="520" height="190" rx="26" fill="rgba(0,0,0,0.35)" stroke="rgba(255,255,255,0.14)"/>
          <text x="26" y="-34" fill="rgba(255,255,255,0.92)" font-family="ui-sans-serif,system-ui" font-size="28" font-weight="800">LucIAna</text>
          <text x="26" y="6" fill="rgba(226,232,240,0.9)" font-family="ui-sans-serif,system-ui" font-size="16">Crea canciones con IA en segundos</text>
          <g transform="translate(26,48)">
            <rect width="468" height="10" rx="6" fill="rgba(255,255,255,0.10)"/>
            <rect width="312" height="10" rx="6" fill="url(#w)"/>
          </g>
          <g transform="translate(26,78)" fill="rgba(255,255,255,0.5)">
            <rect x="0" y="0" width="16" height="34" rx="8"/>
            <rect x="24" y="-10" width="16" height="54" rx="8"/>
            <rect x="48" y="6" width="16" height="28" rx="8"/>
            <rect x="72" y="-14" width="16" height="62" rx="8"/>
            <rect x="96" y="2" width="16" height="34" rx="8"/>
            <rect x="120" y="-8" width="16" height="50" rx="8"/>
            <rect x="144" y="8" width="16" height="24" rx="8"/>
            <rect x="168" y="-12" width="16" height="58" rx="8"/>
            <rect x="192" y="0" width="16" height="36" rx="8"/>
            <rect x="216" y="-16" width="16" height="66" rx="8"/>
            <rect x="240" y="6" width="16" height="28" rx="8"/>
            <rect x="264" y="-10" width="16" height="54" rx="8"/>
            <rect x="288" y="2" width="16" height="34" rx="8"/>
            <rect x="312" y="-14" width="16" height="62" rx="8"/>
          </g>
        </g>
        <g transform="translate(720,290)" opacity="0.95">
          <rect x="0" y="-120" width="340" height="420" rx="28" fill="rgba(0,0,0,0.35)" stroke="rgba(255,255,255,0.14)"/>
          <text x="24" y="-72" fill="rgba(255,255,255,0.9)" font-family="ui-sans-serif,system-ui" font-size="18" font-weight="800">Música IA</text>
          <rect x="24" y="-48" width="292" height="56" rx="18" fill="rgba(255,255,255,0.08)"/>
          <rect x="24" y="22" width="292" height="56" rx="18" fill="rgba(255,255,255,0.08)"/>
          <rect x="24" y="92" width="292" height="56" rx="18" fill="rgba(255,255,255,0.08)"/>
          <rect x="24" y="172" width="292" height="56" rx="18" fill="url(#w)" opacity="0.9"/>
          <text x="142" y="208" fill="#0b1224" font-family="ui-sans-serif,system-ui" font-size="16" font-weight="800">CREAR</text>
        </g>
      </svg>`
    );

  return (
    <div className="h-full overflow-y-auto bg-[#050505]">
      <div className="max-w-6xl mx-auto px-4 md:px-8 pt-6 md:pt-10 pb-24 md:pb-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-10 items-center">
          <div>
            <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-3 py-1.5 text-xs text-slate-200">
              <Sparkles className="w-4 h-4 text-indigo-300" strokeWidth={2} />
              <span className="font-semibold">Bienvenido, {name}</span>
              <span className="text-slate-400">•</span>
              <span className="text-slate-300">Crea en segundos</span>
            </div>
            <h1 className="mt-4 text-3xl md:text-5xl font-black tracking-tight leading-tight">
              Crea música con IA para tus ideas, tu negocio o tus clientes
            </h1>
            <p className="mt-4 text-slate-300 text-sm md:text-base leading-relaxed max-w-xl">
              Genera canciones con 2 versiones (A y B), guarda todo en tu biblioteca y mejora resultados con {isDev ? 'letras, ' : ''}
              instrucciones y estilos. En el plan gratis puedes crear, pero las descargas se habilitan al comprar plan.
            </p>
            <div className="mt-6 flex flex-col sm:flex-row sm:flex-wrap gap-3">
              <button
                onClick={onGoStudio}
                className="shrink-0 sm:min-w-[220px] bg-gradient-to-r from-indigo-500 to-purple-600 hover:opacity-95 active:scale-[0.99] transition-all text-white font-extrabold text-sm px-6 py-3.5 rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/25"
              >
                <Rocket className="w-4 h-4" strokeWidth={2} /> Empezar a crear <ArrowRight className="w-4 h-4" />
              </button>
              <button
                onClick={onOpenPlans}
                className="shrink-0 sm:min-w-[170px] bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold text-sm px-6 py-3.5 rounded-2xl flex items-center justify-center gap-2"
              >
                Ver planes <ArrowRight className="w-4 h-4" />
              </button>
              <button
                onClick={onGoLibrary}
                className="shrink-0 sm:min-w-[190px] bg-black/30 hover:bg-black/40 border border-white/10 text-slate-100 font-bold text-sm px-6 py-3.5 rounded-2xl flex items-center justify-center gap-2"
              >
                Ir a biblioteca <Music2 className="w-4 h-4" />
              </button>
            </div>
            <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
                <div className="text-xs text-slate-400 font-semibold">Plan gratis</div>
                <div className="mt-1 text-white font-extrabold">2 canciones</div>
                <div className="mt-1 text-[11px] text-slate-400">10 versiones A/B</div>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
                <div className="text-xs text-slate-400 font-semibold">Rápido</div>
                <div className="mt-1 text-white font-extrabold">1 click</div>
                <div className="mt-1 text-[11px] text-slate-400">Crear y guardar</div>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
                <div className="text-xs text-slate-400 font-semibold">Descargas</div>
                <div className="mt-1 text-white font-extrabold">Con plan</div>
                <div className="mt-1 text-[11px] text-slate-400">WAV / MP4</div>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
                <div className="text-xs text-slate-400 font-semibold">Control</div>
                <div className="mt-1 text-white font-extrabold">Recarga Créditos</div>
                <div className="mt-1 text-[11px] text-slate-400">Saldo y costos</div>
              </div>
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-6 bg-gradient-to-br from-cyan-400/10 via-indigo-500/10 to-purple-500/10 blur-2xl rounded-[48px]" />
            <div className="relative bg-white/5 border border-white/10 rounded-[32px] overflow-hidden shadow-[0_30px_90px_rgba(0,0,0,0.55)]">
              <img src={heroImage} alt="LucIAna" className="w-full h-auto block" />
            </div>
          </div>
        </div>

        <div className="mt-10 md:mt-14">
          <div className="flex items-center justify-between gap-3">
            <div className="text-white font-extrabold text-lg md:text-xl">Cómo funciona</div>
            <div className="text-xs text-slate-400">Diseñado para crear rápido y bonito</div>
          </div>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="bg-gradient-to-br from-indigo-500/15 to-purple-500/10 border border-white/10 rounded-3xl p-5">
              <div className="w-10 h-10 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
                <Wand2 className="w-5 h-5 text-indigo-200" />
              </div>
              <div className="mt-3 text-white font-extrabold">1) Escribe</div>
              <div className="mt-1 text-sm text-slate-300">Pon tu idea o letra. Simple o Personalizado.</div>
            </div>
            <div className="bg-gradient-to-br from-cyan-500/10 to-indigo-500/10 border border-white/10 rounded-3xl p-5">
              <div className="w-10 h-10 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
                <Music2 className="w-5 h-5 text-cyan-200" />
              </div>
              <div className="mt-3 text-white font-extrabold">2) Ajusta</div>
              <div className="mt-1 text-sm text-slate-300">Elige vibe, estilo, instrumental y más.</div>
            </div>
            <div className="bg-gradient-to-br from-purple-500/10 to-fuchsia-500/10 border border-white/10 rounded-3xl p-5">
              <div className="w-10 h-10 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
                <Rocket className="w-5 h-5 text-purple-200" />
              </div>
              <div className="mt-3 text-white font-extrabold">3) Crea</div>
              <div className="mt-1 text-sm text-slate-300">Genera 2 versiones (A y B) y guarda en biblioteca.</div>
            </div>
            <div className="bg-gradient-to-br from-emerald-500/10 to-cyan-500/10 border border-white/10 rounded-3xl p-5">
              <div className="w-10 h-10 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
                <Download className="w-5 h-5 text-emerald-200" />
              </div>
              <div className="mt-3 text-white font-extrabold">4) Entrega</div>
              <div className="mt-1 text-sm text-slate-300">Con plan puedes descargar WAV/MP4 y entregar.</div>
            </div>
          </div>
        </div>

        <div className="mt-10 md:mt-14 grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 bg-white/5 border border-white/10 rounded-3xl p-6">
            <div className="flex items-center gap-2">
              <BadgeCheck className="w-5 h-5 text-indigo-300" />
              <div className="text-white font-extrabold">Hecho para vender y producir</div>
            </div>
            <div className="mt-2 text-slate-300 text-sm leading-relaxed">
              Perfecto para creadores, agencias y negocios: crea demos, jingles, ideas para canciones completas, covers y más.
              Mantén todo ordenado en tu biblioteca y controla los costos por acción con tu saldo.
            </div>
            <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-black/25 border border-white/10 rounded-2xl p-4">
                <div className="text-xs text-slate-400 font-semibold">Biblioteca</div>
                <div className="mt-1 text-white font-extrabold">Todo guardado</div>
              </div>
              <div className="bg-black/25 border border-white/10 rounded-2xl p-4">
                <div className="text-xs text-slate-400 font-semibold">Acciones</div>
                <div className="mt-1 text-white font-extrabold">Voz / stems</div>
              </div>
              <div className="bg-black/25 border border-white/10 rounded-2xl p-4">
                <div className="text-xs text-slate-400 font-semibold">Entrega</div>
                <div className="mt-1 text-white font-extrabold">WAV / MP4</div>
              </div>
            </div>
          </div>
          <div className="bg-gradient-to-b from-indigo-500/12 via-purple-500/10 to-black/20 border border-white/10 rounded-3xl p-6">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-slate-200" />
              <div className="text-white font-extrabold">Gratis y sin riesgo</div>
            </div>
            <div className="mt-2 text-slate-300 text-sm">
              Empieza con 2 canciones. Cuando necesites descargar, compra un plan y listo.
            </div>
            <button
              onClick={onOpenPlans}
              className="mt-5 w-full bg-white text-black px-5 py-3 rounded-2xl font-extrabold text-sm flex items-center justify-center gap-2"
            >
              Ver planes <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={onGoStudio}
              className="mt-3 w-full bg-white/5 border border-white/10 text-white px-5 py-3 rounded-2xl font-extrabold text-sm flex items-center justify-center gap-2 hover:bg-white/10"
            >
              Crear ahora <Sparkles className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function InicioPlaceholder() {
  return (
    <div className="flex-1 flex flex-col overflow-y-auto w-full relative z-10">
      <div className="px-4 pt-4">
        <div className="text-white font-extrabold text-lg">Inicio</div>
      </div>
      <div className="flex-1 flex items-center justify-center px-6 pb-[120px]">
        <div className="w-full max-w-[520px] rounded-3xl border border-white/10 bg-white/5 p-6 text-center">
          <div className="text-white font-extrabold">Próximamente</div>
          <div className="mt-2 text-sm text-slate-400">Aquí más adelante pondremos noticias y la landing page.</div>
        </div>
      </div>
    </div>
  );
}

const AFFILIATE_REF_KEY = 'ramber.affiliate_ref_v1';

function InicioSocial({
  onPlaySong,
  onGoStudio,
  isAdmin,
}: {
  onPlaySong: (s: SongItem) => void;
  onGoStudio: () => void;
  isAdmin: boolean;
}) {
  const [tab, setTab] = useState<'canciones' | 'listas' | 'generos'>('canciones');
  const [items, setItems] = useState<SongItem[]>([]);
  const [genres, setGenres] = useState<Array<{ genre: string; count: number; coverUrl?: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [cursor, setCursor] = useState<string | null>(null);
  const [activeGenre, setActiveGenre] = useState('');
  const [adminBusyId, setAdminBusyId] = useState('');
  const [adminMessage, setAdminMessage] = useState('');

  const removeItemLocally = (songId: string) => {
    setItems((prev) => prev.filter((song) => song.id !== songId));
  };

  const hideFromFeed = async (songId: string) => {
    if (!isAdmin || adminBusyId) return;
    const ok = window.confirm('¿Quieres esconder esta canción de Canciones?');
    if (!ok) return;
    setAdminBusyId(songId);
    setAdminMessage('');
    try {
      const t = await getAccessToken();
      if (!t.ok) {
        setError(t.error || 'No pude validar tu sesión.');
        return;
      }
      const r = await fetch('/api/social/remove', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authorization: `Bearer ${t.token}`,
        },
        body: JSON.stringify({ songId }),
      });
      const out = await r.json().catch(() => ({}));
      if (!r.ok || out?.ok === false) {
        setError((out?.error || out?.detail || 'No pude esconder la canción.').toString());
        return;
      }
      removeItemLocally(songId);
      setAdminMessage('Canción escondida de Canciones.');
    } catch {
      setError('No pude esconder la canción.');
    } finally {
      setAdminBusyId('');
    }
  };

  const deleteSongAsAdmin = async (songId: string) => {
    if (!isAdmin || adminBusyId) return;
    const ok = window.confirm('¿Quieres eliminar esta canción? Se mandará a la papelera.');
    if (!ok) return;
    setAdminBusyId(songId);
    setAdminMessage('');
    try {
      const t = await getAccessToken();
      if (!t.ok) {
        setError(t.error || 'No pude validar tu sesión.');
        return;
      }
      const r = await fetch('/api/library/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authorization: `Bearer ${t.token}`,
        },
        body: JSON.stringify({ id: songId }),
      });
      const out = await r.json().catch(() => ({}));
      if (!r.ok || out?.ok === false) {
        setError((out?.error || out?.detail || 'No pude eliminar la canción.').toString());
        return;
      }
      await fetch('/api/social/remove', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authorization: `Bearer ${t.token}`,
        },
        body: JSON.stringify({ songId }),
      }).catch(() => null);
      removeItemLocally(songId);
      setAdminMessage('Canción enviada a la papelera.');
    } catch {
      setError('No pude eliminar la canción.');
    } finally {
      setAdminBusyId('');
    }
  };

  const loadFeed = async (mode: 'reset' | 'more') => {
    setLoading(true);
    setError('');
    try {
      const qs = new URLSearchParams();
      qs.set('limit', '30');
      if (activeGenre) qs.set('genre', activeGenre);
      if (mode === 'more' && cursor) qs.set('cursor', cursor);
      const r = await fetch(`/api/social/feed?${qs.toString()}`, { method: 'GET', cache: 'no-store' });
      const out = await r.json().catch(() => ({}));
      if (!r.ok || out?.ok === false) {
        setError((out?.error || out?.detail || 'No pude cargar el inicio.').toString());
        return;
      }
      const list = Array.isArray(out?.items) ? out.items : [];
      const mapped: SongItem[] = list
        .map((x: any) => ({
          id: String(x?.id || ''),
          title: String(x?.title || 'Canción'),
          audioUrl: typeof x?.audioUrl === 'string' ? x.audioUrl : undefined,
          coverUrl: typeof x?.coverUrl === 'string' ? x.coverUrl : undefined,
          authorName: typeof x?.authorName === 'string' ? x.authorName : undefined,
          authorAvatarUrl: typeof x?.authorAvatarUrl === 'string' ? x.authorAvatarUrl : undefined,
          isPublic: true,
          publicGenre: typeof x?.publicGenre === 'string' ? x.publicGenre : x?.publicGenre ?? null,
          publishedAt: typeof x?.publishedAt === 'string' ? x.publishedAt : x?.publishedAt ?? null,
        }))
        .filter((s: SongItem) => s.id && s.audioUrl);
      const next = typeof out?.next_cursor === 'string' ? out.next_cursor : null;
      setCursor(next);
      setItems((prev) => (mode === 'more' ? [...prev, ...mapped] : mapped));
    } catch {
      setError('No pude cargar el inicio.');
    } finally {
      setLoading(false);
    }
  };

  const loadGenres = async () => {
    setLoading(true);
    setError('');
    try {
      const r = await fetch('/api/social/genres', { method: 'GET', cache: 'no-store' });
      const out = await r.json().catch(() => ({}));
      if (!r.ok || out?.ok === false) {
        setError((out?.error || out?.detail || 'No pude cargar géneros.').toString());
        return;
      }
      const list = Array.isArray(out?.items) ? out.items : [];
      setGenres(
        list
          .map((x: any) => ({
            genre: String(x?.genre || '').trim(),
            count: Number(x?.count || 0),
            coverUrl: typeof x?.coverUrl === 'string' ? x.coverUrl : undefined,
          }))
          .filter((x: any) => x.genre)
      );
    } catch {
      setError('No pude cargar géneros.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tab !== 'canciones') return;
    loadFeed('reset').catch(() => {});
  }, [tab, activeGenre]);

  useEffect(() => {
    if (tab !== 'generos') return;
    loadGenres().catch(() => {});
  }, [tab]);

  return (
    <div className="flex-1 flex flex-col overflow-y-auto w-full relative z-10">
      <div className="px-4 pt-4">
        <div className="flex items-center justify-between">
          <div className="text-white font-extrabold text-lg">Canciones</div>
          <button onClick={onGoStudio} className="bg-emerald-500 hover:bg-emerald-400 text-black rounded-full px-4 py-2 text-xs font-extrabold">
            Crear
          </button>
        </div>
        <div className="mt-4 flex items-center gap-2">
          {[
            { key: 'canciones', label: 'Canciones' },
            { key: 'listas', label: 'Listas' },
            { key: 'generos', label: 'Géneros' },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key as any)}
              className={cn(
                'px-4 py-2 rounded-full text-sm font-semibold border transition-colors',
                tab === (t.key as any) ? 'bg-white text-black border-white' : 'bg-white/5 text-slate-200 border-white/10 hover:bg-white/10'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {error ? <div className="px-4 mt-4 text-sm text-red-200 bg-red-500/10 border border-red-500/20 rounded-2xl p-3">{error}</div> : null}
      {adminMessage ? <div className="px-4 mt-4 text-sm text-emerald-200 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-3">{adminMessage}</div> : null}

      {tab === 'listas' ? (
        <div className="px-4 mt-6">
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-slate-200">
            <div className="font-extrabold">Listas</div>
            <div className="mt-1 text-sm text-slate-400">Próximamente</div>
          </div>
        </div>
      ) : null}

      {tab === 'generos' ? (
        <div className="px-4 mt-4 pb-[120px]">
          <div className="grid grid-cols-2 gap-3">
            {genres.map((g) => (
              <button
                key={g.genre}
                onClick={() => {
                  setActiveGenre(g.genre);
                  setTab('canciones');
                }}
                className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 h-[140px] text-left"
              >
                {g.coverUrl ? (
                  <img src={g.coverUrl} className="absolute inset-0 w-full h-full object-cover opacity-80" />
                ) : null}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
                <div className="absolute left-3 top-3 bg-black/50 border border-white/10 text-white text-xs font-extrabold px-3 py-1.5 rounded-full">
                  {g.genre}
                </div>
                <div className="absolute left-3 bottom-3 text-[11px] text-slate-200/90">{g.count} canciones</div>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {tab === 'canciones' ? (
        <div className="px-4 mt-4 pb-[120px]">
          {activeGenre ? (
            <div className="mb-3 flex items-center justify-between bg-white/5 border border-white/10 rounded-2xl p-3">
              <div className="text-slate-200 text-sm font-extrabold truncate">{activeGenre}</div>
              <button onClick={() => setActiveGenre('')} className="text-xs font-extrabold text-slate-200 bg-white/5 border border-white/10 px-3 py-1.5 rounded-full">
                Quitar
              </button>
            </div>
          ) : null}

          <div className="space-y-3">
            {items.map((s) => (
              <div
                key={s.id}
                className="w-full bg-white/5 border border-white/10 rounded-2xl p-3 hover:bg-white/10 transition-colors"
              >
                {isAdmin ? (
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-amber-200/90">Control de administrador</div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => hideFromFeed(s.id)}
                        disabled={adminBusyId === s.id}
                        className="rounded-full border border-amber-400/30 bg-amber-500/10 px-3 py-1.5 text-[11px] font-extrabold text-amber-100 disabled:opacity-60"
                      >
                        Esconder
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteSongAsAdmin(s.id)}
                        disabled={adminBusyId === s.id}
                        className="rounded-full border border-red-400/30 bg-red-500/10 px-3 py-1.5 text-[11px] font-extrabold text-red-100 disabled:opacity-60"
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={() => onPlaySong(s)}
                  className="w-full flex items-center gap-3 text-left"
                >
                <div className="w-16 h-16 rounded-xl bg-white/5 border border-white/10 overflow-hidden shrink-0">
                  {s.coverUrl ? <img src={s.coverUrl} className="w-full h-full object-cover" /> : null}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-white font-extrabold truncate">{s.title}</div>
                  <div className="mt-1 flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-indigo-500/20 border border-indigo-500/30 overflow-hidden flex items-center justify-center text-[10px] font-extrabold text-indigo-200 shrink-0">
                      {s.authorAvatarUrl ? <img src={s.authorAvatarUrl} className="w-full h-full object-cover" /> : (s.authorName || 'U').slice(0, 1).toUpperCase()}
                    </div>
                    <div className="text-xs text-slate-300 truncate">{s.authorName || 'Usuario'}</div>
                    {s.publicGenre ? (
                      <div className="text-[10px] text-slate-200 bg-white/5 border border-white/10 px-2 py-0.5 rounded-full truncate max-w-[140px]">
                        {s.publicGenre}
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="shrink-0 w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-200 font-extrabold">
                  ▶
                </div>
                </button>
              </div>
            ))}
          </div>

          {loading ? (
            <div className="mt-4 text-center text-sm text-slate-400">Cargando…</div>
          ) : cursor ? (
            <button onClick={() => loadFeed('more').catch(() => {})} className="mt-4 w-full bg-white/5 hover:bg-white/10 border border-white/10 rounded-full py-3 text-slate-200 font-extrabold">
              Cargar más
            </button>
          ) : null}
        </div>
      ) : null}

    </div>
  );
}

const CHATGPT_OAUTH_CALLBACK_URL = "https://chat.openai.com/aip/g-6aa75d9e076081918b49ba962297c64c/oauth/callback";
const CHATGPT_OAUTH_STATE_KEY = "ramber.chatgpt_oauth_state_v1";
const CHATGPT_OAUTH_REDIRECT_URI_KEY = "ramber.chatgpt_oauth_redirect_uri_v1";
const CHATGPT_OAUTH_REDIRECT_URI_ALLOWED_RE = /^https:\/\/chat\.openai\.com\/aip\/g-[A-Za-z0-9_-]+\/oauth\/callback\/?$/i;
const CHATGPT_OAUTH_REDIRECT_URI_ALLOWED_RE_ALT = /^https:\/\/chatgpt\.com\/aip\/g-[A-Za-z0-9_-]+\/oauth\/callback\/?$/i;

function isValidChatgptRedirectUri(s: string): boolean {
  if (typeof s !== "string" || !s) return false;
  const t = s.trim();
  if (!t) return false;
  try {
    const u = new URL(t);
    const hp = `${u.protocol}//${u.host}${u.pathname}`;
    return CHATGPT_OAUTH_REDIRECT_URI_ALLOWED_RE.test(hp) || CHATGPT_OAUTH_REDIRECT_URI_ALLOWED_RE_ALT.test(hp);
  } catch {
    return false;
  }
}

function ChatgptAuthScreen() {
  const [state, setState] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    try {
      const u = new URL(window.location.href);
      let v = u.searchParams.get('state') || '';
      if (v) {
        try { v = decodeURIComponent(v); } catch {}
      }
      return v.toString();
    } catch {
      return '';
    }
  });
  const [localState, setLocalState] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    try {
      return (window.localStorage.getItem(CHATGPT_OAUTH_STATE_KEY) || '').toString();
    } catch {
      return '';
    }
  });
  const [redirectUri, setRedirectUri] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    try {
      const u = new URL(window.location.href);
      let raw =
        u.searchParams.get('redirect_uri') ||
        u.searchParams.get('redirectUri') ||
        u.searchParams.get('redirect_url') ||
        u.searchParams.get('callback_url') ||
        '';
      if (raw) {
        try { raw = decodeURIComponent(raw); } catch {}
        raw = raw.trim();
        if (isValidChatgptRedirectUri(raw)) return raw;
      }
      return '';
    } catch {
      return '';
    }
  });
  const [localRedirectUri, setLocalRedirectUri] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    try {
      const v = (window.localStorage.getItem(CHATGPT_OAUTH_REDIRECT_URI_KEY) || '').toString().trim();
      return isValidChatgptRedirectUri(v) ? v : '';
    } catch {
      return '';
    }
  });
  const [sessionToken, setSessionToken] = useState<string>('');
  const [ready, setReady] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [startingLogin, setStartingLogin] = useState<boolean>(false);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      if (!supabaseBrowser) {
        if (alive) {
          setError('Falta configurar SUPABASE_URL y SUPABASE_ANON_KEY.');
          setReady(true);
        }
        return;
      }
      try {
        const s = new URL(window.location.href);
        let qState = (s.searchParams.get('state') || '').toString();
        if (qState) {
          try { qState = decodeURIComponent(qState); } catch {}
          qState = qState.trim();
          setState(qState);
          try { window.localStorage.setItem(CHATGPT_OAUTH_STATE_KEY, qState); } catch {}
          setLocalState(qState);
        }
        let qRedirectUri =
          s.searchParams.get('redirect_uri') ||
          s.searchParams.get('redirectUri') ||
          s.searchParams.get('redirect_url') ||
          s.searchParams.get('callback_url') ||
          '';
        if (qRedirectUri) {
          try { qRedirectUri = decodeURIComponent(qRedirectUri); } catch {}
          qRedirectUri = qRedirectUri.trim();
          if (isValidChatgptRedirectUri(qRedirectUri)) {
            setRedirectUri(qRedirectUri);
            try { window.localStorage.setItem(CHATGPT_OAUTH_REDIRECT_URI_KEY, qRedirectUri); } catch {}
            setLocalRedirectUri(qRedirectUri);
          }
        }
        const ses = await supabaseBrowser.auth.getSession();
        const token = String((ses?.data?.session?.access_token) as any || '').trim();
        const email = String((ses?.data?.session?.user?.email) as any || '').trim().toLowerCase();
        const validEmail = email && (email.endsWith('@gmail.com') || email.endsWith('@googlemail.com'));
        if (!alive) return;
        if (token && validEmail) {
          setSessionToken(token);
          const finalState = (qState || state || localState || '').toString().trim();
          const finalRedirectUri =
            (isValidChatgptRedirectUri(qRedirectUri) && qRedirectUri) ||
            (isValidChatgptRedirectUri(redirectUri) && redirectUri) ||
            (isValidChatgptRedirectUri(localRedirectUri) && localRedirectUri) ||
            CHATGPT_OAUTH_CALLBACK_URL;
          if (finalState) {
            try {
              const redir = new URL(finalRedirectUri);
              redir.searchParams.set('code', token);
              redir.searchParams.set('state', finalState);
              try { window.localStorage.removeItem(CHATGPT_OAUTH_STATE_KEY); } catch {}
              try { window.localStorage.removeItem(CHATGPT_OAUTH_REDIRECT_URI_KEY); } catch {}
              setReady(true);
              window.location.replace(redir.toString());
              return;
            } catch (e) {
              setError(e instanceof Error ? e.message : 'No pude redirigir a ChatGPT.');
            }
          } else {
            setError('Falta el parámetro state en el enlace. Abre este link desde ChatGPT.');
          }
        }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'Error de sesión.');
      } finally {
        if (alive) setReady(true);
      }
    };
    tick();
    let sub: any = null;
    try {
      const subData = supabaseBrowser?.auth?.onAuthStateChange?.(() => { tick().catch(() => {}); });
      sub = subData?.data?.subscription || null;
    } catch {}
    return () => {
      alive = false;
      try { sub?.unsubscribe?.(); } catch {}
    };
  }, [localState, localRedirectUri, state, redirectUri]);

  const baseRaw = (typeof window !== 'undefined' ? window.location.origin.toString().trim() : '');
  const base = /^https?:\/\//i.test(baseRaw) ? baseRaw : `https://${baseRaw.replace(/^\/+/, '')}`;
  const redirectTo = `${base.replace(/\/+$/, '')}/auth/chatgpt`;

  const startGoogleLogin = async () => {
    if (!supabaseBrowser) return;
    setStartingLogin(true);
    setError('');
    try {
      const r = await supabaseBrowser.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo, skipBrowserRedirect: true },
      });
      if (r?.error) throw new Error(r.error.message || 'No pude iniciar sesión con Google.');
      const url = (r as any)?.data?.url ? String((r as any).data.url).trim() : '';
      if (url) {
        window.location.href = url;
        return;
      }
      const r2 = await supabaseBrowser.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
      if (r2?.error) throw new Error(r2.error.message || 'No pude iniciar sesión con Google.');
    } catch (e) {
      setStartingLogin(false);
      setError(e instanceof Error ? e.message : 'No pude iniciar sesión con Google.');
    }
  };

  return (
    <div className="h-[100dvh] w-full text-white flex flex-col items-center justify-center px-6 text-center bg-gradient-to-b from-[#0b1224] via-[#070a12] to-black/80">
      <div className="w-16 h-16 rounded-2xl bg-yellow-400 text-black flex items-center justify-center font-light text-4xl shadow-[0_0_18px_rgba(250,204,21,0.35)]">
        L
      </div>
      <div className="mt-4 text-xl font-extrabold">Conectar ChatGPT con LucIAna</div>
      {!ready ? (
        <div className="mt-2 text-sm text-slate-300">Cargando…</div>
      ) : sessionToken ? (
        <>
          <div className="mt-2 text-sm text-slate-300">Sesión lista. Redirigiendo a ChatGPT…</div>
          {error ? <div className="mt-3 text-xs text-red-200 max-w-md break-words">{error}</div> : null}
        </>
      ) : (
        <>
          <div className="mt-2 text-sm text-slate-300 max-w-md">
            Autoriza con tu cuenta Gmail de LucIAna Music para que ChatGPT use tus créditos y genere canciones.
          </div>
          <button
            type="button"
            onClick={startGoogleLogin}
            disabled={startingLogin || !supabaseBrowser}
            className="mt-6 bg-white text-black px-6 py-3 rounded-full font-extrabold text-sm disabled:opacity-70"
          >
            {startingLogin ? 'Abriendo Google…' : 'Continuar con Google'}
          </button>
          {error ? <div className="mt-3 text-xs text-red-200 max-w-md break-words">{error}</div> : null}
          {!supabaseBrowser ? (
            <div className="mt-3 text-xs text-red-200">Falta configurar SUPABASE_URL y SUPABASE_ANON_KEY en Vercel (y redeploy).</div>
          ) : null}
        </>
      )}
    </div>
  );
}

function SubirGptScreen() {
  const [step, setStep] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [fileName, setFileName] = useState('');
  const [fileSize, setFileSize] = useState<number>(0);
  const [audioUrl, setAudioUrl] = useState('');
  const [r2Key, setR2Key] = useState('');
  const [copied, setCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  const reset = () => {
    try { xhrRef.current?.abort?.(); } catch {}
    xhrRef.current = null;
    setStep('idle');
    setProgress(0);
    setFileName('');
    setFileSize(0);
    setAudioUrl('');
    setR2Key('');
    setCopied(false);
    setErrorMsg('');
    if (inputRef.current) inputRef.current.value = '';
  };

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const fsize = Number(f.size || 0);
    if (fsize > 25 * 1024 * 1024) {
      setStep('error');
      setErrorMsg('El MP3 es demasiado pesado. Máximo 25 MB.');
      return;
    }
    setFileName(f.name || 'audio.mp3');
    setFileSize(fsize);
    uploadFile(f);
  };

  const uploadFile = async (file: File) => {
    setStep('uploading');
    setProgress(0);
    setErrorMsg('');
    const token = typeof window !== 'undefined' ? (await getAccessToken().catch(() => '') || '') : '';
    const url = '/api/gpt/upload-audio';
    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;
    xhr.open('POST', url, true);
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.onprogress = (evt) => {
      if (evt.lengthComputable) {
        const p = Math.round((evt.loaded / evt.total) * 100);
        setProgress(p);
      }
    };
    xhr.onload = () => {
      let body: any = null;
      try { body = JSON.parse(xhr.responseText || '{}'); } catch {}
      if (xhr.status >= 200 && xhr.status < 300 && body?.success && typeof body?.url === 'string' && body.url) {
        setAudioUrl(String(body.url));
        setR2Key(String(body.r2_key || ''));
        setProgress(100);
        setStep('done');
        return;
      }
      let msg = (body?.error && typeof body?.message === 'string') ? body.message : '';
      if (!msg) msg = (typeof body?.message === 'string' ? body.message : `Error HTTP ${xhr.status}. Inténtalo de nuevo.`);
      if (xhr.status === 401) msg = 'Necesitas iniciar sesión con Google primero en LucIAna Music.';
      if (xhr.status === 413) msg = 'El archivo excede el límite de 25 MB.';
      if (xhr.status === 415) msg = 'Formato no permitido. Solo se aceptan archivos MP3.';
      setStep('error');
      setErrorMsg(msg);
    };
    xhr.onerror = () => {
      setStep('error');
      setErrorMsg('No se pudo subir el archivo. Revisa tu conexión e inténtalo de nuevo.');
    };
    xhr.onabort = () => {
      if (step !== 'done') {
        setStep('error');
        setErrorMsg('Subida cancelada.');
      }
    };
    const fd = new FormData();
    fd.append('file', file, file.name || 'audio.mp3');
    xhr.send(fd);
  };

  const copyUrl = async () => {
    const u = audioUrl.trim();
    if (!u) return;
    try {
      await navigator.clipboard.writeText(u);
      setCopied(true);
      try {
        if (typeof navigator !== 'undefined' && (navigator as any)?.vibrate) (navigator as any).vibrate(22);
      } catch {}
      setTimeout(() => setCopied(false), 2200);
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = u;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        setCopied(true);
        setTimeout(() => setCopied(false), 2200);
      } catch {
        setStep('error');
        setErrorMsg('No se pudo copiar al portapapeles. Copia manualmente: ' + u);
      }
    }
  };

  const sizeText = () => {
    const sz = Number(fileSize || 0);
    if (!sz) return '';
    if (sz < 1024) return `${sz} B`;
    if (sz < 1024 * 1024) return `${(sz / 1024).toFixed(1)} KB`;
    return `${(sz / 1024 / 1024).toFixed(2)} MB`;
  };

  return (
    <div className="h-[100dvh] w-full text-white flex flex-col items-center justify-start pt-14 px-5 bg-gradient-to-b from-[#0b1224] via-[#070a12] to-black/85 overflow-y-auto">
      <div className="w-full max-w-md flex flex-col items-center">
        <div className="w-16 h-16 rounded-2xl bg-yellow-400 text-black flex items-center justify-center font-light text-4xl shadow-[0_0_22px_rgba(250,204,21,0.35)] shrink-0">
          L
        </div>
        <div className="mt-5 text-2xl font-extrabold tracking-tight text-center leading-snug">
          Sube tu audio MP3<br />para LucIAna Music
        </div>
        <div className="mt-2 text-sm text-slate-300 text-center max-w-xs">
          Selecciona tu canción MP3 y al terminar de subirla, toca el botón para copiar el enlace y pégalo en el chat con LucIAna Music.
        </div>

        {step === 'idle' ? (
          <div className="mt-8 w-full">
            <label
              className="block w-full cursor-pointer rounded-3xl border-2 border-dashed border-white/20 hover:border-yellow-400/60 transition-colors bg-white/[0.04] hover:bg-white/[0.07] px-6 py-12 text-center">
              <div className="text-5xl mb-3">🎵</div>
              <div className="text-lg font-extrabold">Toca para elegir tu MP3</div>
              <div className="mt-1 text-xs text-slate-400">Solo archivos .mp3 · Máximo 25 MB</div>
              <input
                ref={inputRef}
                type="file"
                accept="audio/mpeg, .mp3"
                className="hidden"
                onChange={onPickFile}
              />
            </label>
            <div className="mt-4 flex items-center justify-center gap-2 text-[11px] text-slate-400">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Subida a almacenamiento privado · No se comparte con nadie más que tú
            </div>
          </div>
        ) : null}

        {step === 'uploading' ? (
          <div className="mt-8 w-full">
            <div className="rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-4 w-full">
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 shrink-0 rounded-xl bg-yellow-400/15 border border-yellow-400/30 text-yellow-300 flex items-center justify-center text-xl">
                  ⬆️
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-sm truncate">{fileName || 'Subiendo audio…'}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{sizeText()} · Subiendo a LucIAna Music…</div>
                </div>
              </div>
              <div className="mt-4 h-3 w-full rounded-full bg-white/10 overflow-hidden border border-white/10">
                <div
                  className="h-full bg-gradient-to-r from-yellow-400 via-amber-300 to-yellow-400 transition-[width] duration-150 ease-out"
                  style={{ width: `${Math.max(1, Math.min(100, progress))}%` }}
                />
              </div>
              <div className="mt-2 flex justify-between text-[11px] text-slate-400">
                <span>Progreso</span>
                <span className="font-bold text-slate-200">{progress}%</span>
              </div>
              <button
                type="button"
                onClick={reset}
                className="mt-4 w-full text-xs text-slate-400 hover:text-slate-200 underline underline-offset-2"
              >
                Cancelar y subir otro archivo
              </button>
            </div>
          </div>
        ) : null}

        {step === 'done' ? (
          <div className="mt-8 w-full">
            <div className="rounded-3xl border border-emerald-400/25 bg-emerald-400/[0.05] px-5 py-5 w-full">
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 shrink-0 rounded-xl bg-emerald-400/20 border border-emerald-400/40 text-emerald-300 flex items-center justify-center text-xl">
                  ✅
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-extrabold">¡Subida completada!</div>
                  <div className="mt-1 text-sm text-emerald-200/90 leading-snug">
                    Tu MP3 está listo. Ahora cópialo al chat de LucIAna Music para hacer el cover.
                  </div>
                  <div className="mt-3 text-[11px] break-all text-slate-300 bg-black/30 rounded-xl px-3 py-2 border border-white/5">
                    {fileName ? <span className="font-semibold text-slate-100">{fileName}</span> : null}
                    {sizeText() ? <span className="text-slate-400"> · {sizeText()}</span> : null}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={copyUrl}
                className={`mt-5 w-full rounded-2xl font-extrabold text-lg px-6 py-4 shadow-[0_8px_30px_rgba(250,204,21,0.22)] transition-all active:scale-[0.985] ${
                  copied
                    ? 'bg-emerald-400 text-black border border-emerald-500/40'
                    : 'bg-yellow-400 hover:bg-yellow-300 text-black border border-yellow-300/50'
                }`}
              >
                {copied ? '✅ ¡Enlace copiado! Pégalo en tu chat con LucIAna Music' : '📋 Copiar enlace para el chat'}
              </button>

              <div className="mt-4 rounded-2xl bg-black/40 border border-white/5 px-4 py-3">
                <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-1">Enlace público</div>
                <div className="text-[11px] break-all text-slate-200 select-all">{audioUrl}</div>
              </div>

              <button
                type="button"
                onClick={reset}
                className="mt-4 w-full text-xs text-slate-400 hover:text-slate-200 underline underline-offset-2"
              >
                Subir otro audio
              </button>
            </div>
          </div>
        ) : null}

        {step === 'error' ? (
          <div className="mt-8 w-full">
            <div className="rounded-3xl border border-red-400/30 bg-red-400/[0.05] px-5 py-5 w-full">
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 shrink-0 rounded-xl bg-red-400/15 border border-red-400/40 text-red-300 flex items-center justify-center text-xl">
                  ⚠️
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-extrabold">No se pudo completar la subida</div>
                  <div className="mt-1 text-sm text-red-200/90 leading-snug break-words">
                    {errorMsg || 'Inténtalo de nuevo.'}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={reset}
                className="mt-5 w-full rounded-2xl font-extrabold text-base px-6 py-3 bg-white text-black hover:bg-slate-100 active:scale-[0.985] transition-all border border-white/10"
              >
                Intentar de nuevo
              </button>
            </div>
          </div>
        ) : null}

        <div className="mt-10 mb-10 text-[11px] text-slate-500 text-center">
          {r2Key ? `Identificador de archivo: ${r2Key}` : 'Tu archivo se guarda en tu carpeta personal de LucIAna Music.'}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  // #region debug-point app-mount
  console.log('[DEBUG] App component mounting...');
  console.log('[DEBUG] Window available:', typeof window !== 'undefined');
  if (typeof window !== 'undefined') {
    console.log('[DEBUG] Location:', window.location.href);
    console.log('[DEBUG] User agent:', navigator.userAgent);
    console.log('[DEBUG] Screen size:', window.innerWidth, 'x', window.innerHeight);
  }
  // #endregion

  const [currentTab, setCurrentTab] = useState<ViewTab>(() => {
    if (typeof window === 'undefined') return 'studio';
    return tabFromPathname(window.location.pathname || '/');
  });
  const [canciones, setCanciones] = useState<SongItem[]>([]);
  const [cancionesEliminadas, setCancionesEliminadas] = useState<SongItem[]>([]);
  const [vibes, setVibes] = useState<VibeItem[]>([]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [personaPickerNonce, setPersonaPickerNonce] = useState(0);
  const [studioPrefillNonce, setStudioPrefillNonce] = useState(0);
  const [studioPrefill, setStudioPrefill] = useState<null | { type: 'cover'; song: SongItem }>(null);
  const [toast, setToast] = useState<string>('');
  const toastTimerRef = useRef<number | null>(null);
  const [alertQueue, setAlertQueue] = useState<Array<{ id: string; message: string; title?: string; tone?: 'error' | 'success' | 'warning' | 'info'; actions?: Array<{ id: string; label: string; kind?: 'cancel' | 'primary' | 'danger' }> }>>([]);
  const alertActionHandlersRef = useRef<Record<string, () => void>>({});
  const [isPricingOpen, setIsPricingOpen] = useState(false);
  const pricingPrevUrlRef = useRef<string | null>(null);
  const [isBalanceOpen, setIsBalanceOpen] = useState(false);
  const [balanceData, setBalanceData] = useState<any>(null);
  const [isBalanceLoading, setIsBalanceLoading] = useState(false);
  const [balanceError, setBalanceError] = useState<string>('');
  const [isStartingLogin, setIsStartingLogin] = useState(false);
  const [isAuthBooting, setIsAuthBooting] = useState(true);
  const [authEmail, setAuthEmail] = useState('');
  const [authUserId, setAuthUserId] = useState('');
  
  const [activeSong, setActiveSong] = useState<SongItem | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playerTime, setPlayerTime] = useState(0);
  const [playerDuration, setPlayerDuration] = useState(0);

  const [nowPlayingOpen, setNowPlayingOpen] = useState(false);
  const [nowPlayingMode, setNowPlayingMode] = useState<'normal' | 'elenco'>('normal');
  const [isElencoMenuOpen, setIsElencoMenuOpen] = useState(false);
  const [isLyricsEditorOpen, setIsLyricsEditorOpen] = useState(false);
  const [lyricsDraft, setLyricsDraft] = useState('');
  const [isLyricsSaving, setIsLyricsSaving] = useState(false);
  const [isConnectingToDevice, setIsConnectingToDevice] = useState(false);
  const [availableDevices, setAvailableDevices] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  const [presentationConnection, setPresentationConnection] = useState<any>(null);
  const lyricsWrapRef = useRef<HTMLDivElement | null>(null);
  const lyricLineRefs = useRef<Array<HTMLDivElement | null>>([]);
  const lastActiveLyricRef = useRef<number>(-1);
  const { credits, internalCredits, isAdmin, refreshCredits, error: creditsError } = useUserCredits();
  const lastCreditsErrorRef = useRef<string>('');
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [installPromptEvent, setInstallPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const pendingListKey = 'ramber.pendingSunoTasks_v1';
  const pendingLegacyKey = 'ramber.pendingSunoTask';
  const [isUpdatesOpen, setIsUpdatesOpen] = useState(false);
  const appRootRef = useRef<HTMLDivElement | null>(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [isPullRefreshing, setIsPullRefreshing] = useState(false);
  const pullDistanceRef = useRef(0);
  const pullRefreshingRef = useRef(false);
  const pullStartXRef = useRef(0);
  const pullStartYRef = useRef(0);
  const pullTrackingRef = useRef(false);
  const pullAllowedRef = useRef(false);
  const pullLastRefreshAtRef = useRef(0);
  const pendingReloadRef = useRef(false);
  const latestVersionRef = useRef('');
  const wasHiddenRef = useRef(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateVersion, setUpdateVersion] = useState('');
  const [updateNote, setUpdateNote] = useState('');
  const isLocalNetworkHost = (h: string) => {
    const host = (h || '').toString().trim().toLowerCase();
    if (!host) return false;
    if (host === 'localhost' || host === '127.0.0.1') return true;
    if (/^192\.168\./.test(host)) return true;
    if (/^10\./.test(host)) return true;
    if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host)) return true;
    return false;
  };
  const [updatesSeenKey, setUpdatesSeenKey] = useState(() => {
    try {
      return (window.localStorage.getItem('ramber.updates_seen_v1') || '').toString();
    } catch {
      return '';
    }
  });

  const hardRefreshNow = async (nextVersion?: string | null) => {
    try {
      const v = (nextVersion || '').toString().trim();
      if (v) window.localStorage.setItem('ramber.app_version_v1', v);
    } catch {}
    try {
      if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.allSettled(regs.map((r) => r.unregister()));
      }
    } catch {}
    try {
      if (typeof window !== 'undefined' && 'caches' in window) {
        const keys = await caches.keys();
        await Promise.allSettled(keys.map((k) => caches.delete(k)));
      }
    } catch {}
    try {
      const u = new URL(window.location.href);
      u.searchParams.set('__refresh', String(Date.now()));
      window.location.replace(u.toString());
      return;
    } catch {}
    try {
      window.location.reload();
    } catch {}
  };

  const markUpdateAvailable = (v: string, note?: string) => {
    const ver = (v || '').toString().trim();
    if (!ver) return;
    pendingReloadRef.current = true;
    latestVersionRef.current = ver;
    setUpdateAvailable(true);
    setUpdateVersion(ver);
    if (note) setUpdateNote(note);
  };

  const showToast = (message: string) => {
    const text = String(message || '').trim();
    if (!text) return;
    const lower = text.toLowerCase();
    const isError =
      lower.includes('error') ||
      lower.includes('no pude') ||
      lower.includes('no se pudo') ||
      lower.includes('fall') ||
      lower.includes('inválid') ||
      lower.includes('insuficient') ||
      lower.includes('deneg') ||
      lower.includes('expir');
    if (isError) {
      showStyledAlert(text);
      return;
    }
    setToast(text);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(''), 4500);
  };

  const showStyledAlert = (input: string | { title?: string; message: string; tone?: 'error' | 'success' | 'warning' | 'info'; actions?: Array<{ label: string; kind?: 'cancel' | 'primary' | 'danger'; onPress?: () => void }> }) => {
    const obj = typeof input === 'string' ? { message: input } : (input || { message: '' });
    const text = String(obj.message || '').trim();
    if (!text) return;
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const title = obj.title ? String(obj.title || '').trim() : '';
    const tone = obj.tone;
    const rawActions = Array.isArray((obj as any).actions) ? (obj as any).actions : [];
    const actions = rawActions
      .filter((a: any) => a && typeof a === 'object' && String(a.label || '').trim())
      .slice(0, 3)
      .map((a: any, idx: number) => {
        const actionId = `${id}_a${idx}`;
        const onPress = typeof a.onPress === 'function' ? a.onPress : null;
        if (onPress) alertActionHandlersRef.current[actionId] = onPress;
        return { id: actionId, label: String(a.label || '').trim(), kind: a.kind };
      });
    setAlertQueue((prev) => [...prev, { id, message: text, title: title || undefined, tone, actions: actions.length ? actions : undefined }]);
  };

  const closeStyledAlert = () => {
    setAlertQueue((prev) => {
      const head = prev[0];
      if (head?.actions && Array.isArray(head.actions)) {
        for (const a of head.actions) {
          if (a?.id && alertActionHandlersRef.current[a.id]) delete alertActionHandlersRef.current[a.id];
        }
      }
      return prev.slice(1);
    });
  };

  const activeAlert = alertQueue[0] || null;
  const activeAlertText = (activeAlert?.message || '').trim();
  const activeAlertLower = activeAlertText.toLowerCase();
  const activeAlertTone = activeAlert?.tone
    ? activeAlert.tone
    : activeAlertLower.includes('error') ||
        activeAlertLower.includes('no pude') ||
        activeAlertLower.includes('fall') ||
        activeAlertLower.includes('inválid') ||
        activeAlertLower.includes('insuficient')
      ? 'error'
      : activeAlertLower.includes('listo') ||
          activeAlertLower.includes('copiado') ||
          activeAlertLower.includes('guardad') ||
          activeAlertLower.includes('actualiz')
        ? 'success'
        : activeAlertLower.includes('importante') ||
            activeAlertLower.includes('necesita') ||
            activeAlertLower.includes('primero') ||
            activeAlertLower.includes('espera')
          ? 'warning'
          : 'info';

  const alertMeta = activeAlertTone === 'error'
    ? {
        title: 'Algo salió mal',
        Icon: AlertTriangle,
        ring: 'shadow-[0_0_35px_rgba(248,113,113,0.22)]',
        iconBg: 'bg-red-500/15 text-red-300 border-red-400/20',
        button: 'bg-gradient-to-r from-red-500 to-fuchsia-500 text-white',
      }
    : activeAlertTone === 'success'
      ? {
          title: 'Listo',
          Icon: CheckCircle2,
          ring: 'shadow-[0_0_35px_rgba(74,222,128,0.18)]',
          iconBg: 'bg-emerald-500/15 text-emerald-300 border-emerald-400/20',
          button: 'bg-gradient-to-r from-emerald-500 to-cyan-500 text-white',
        }
      : activeAlertTone === 'warning'
        ? {
            title: 'Atención',
            Icon: AlertTriangle,
            ring: 'shadow-[0_0_35px_rgba(250,204,21,0.2)]',
            iconBg: 'bg-yellow-500/15 text-yellow-200 border-yellow-400/20',
            button: 'bg-gradient-to-r from-yellow-400 to-amber-500 text-black',
          }
        : {
            title: 'LucIAna Music',
            Icon: Info,
            ring: 'shadow-[0_0_35px_rgba(96,165,250,0.2)]',
            iconBg: 'bg-cyan-500/15 text-cyan-200 border-cyan-400/20',
            button: 'bg-gradient-to-r from-cyan-500 to-indigo-500 text-white',
          };
  const alertTitle = (activeAlert?.title || '').toString().trim() || alertMeta.title;

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
    }
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', 'true');
      ta.style.position = 'fixed';
      ta.style.top = '0';
      ta.style.left = '0';
      ta.style.opacity = '0';
      try { document.body.appendChild(ta); } catch {}
      ta.focus();
      ta.select();
      const ok = document.execCommand('copy');
      try { if (ta.parentNode) ta.parentNode.removeChild(ta); } catch {}
      return ok;
    } catch {
      return false;
    }
  };

  const toProxyMediaUrl = (raw: any) => {
    const url = (raw || '').toString().trim();
    if (!url) return '';
    if (url.startsWith('blob:') || url.startsWith('data:')) return url;
    const keyish = url.replace(/^\/+/, '');
    const allowed = ['avatars/', 'profile-covers/', 'personas/', 'covers/'];
    if (!/^https?:\/\//i.test(url) && allowed.some((p) => keyish.startsWith(p))) {
      return `${window.location.origin}/api/r2/object?key=${encodeURIComponent(keyish)}`;
    }
    try {
      const u = new URL(url);
      const host = (u.hostname || '').toLowerCase();
      const isR2 =
        host.includes('.r2.cloudflarestorage.com') ||
        host.endsWith('.r2.dev') ||
        host.includes('.r2') ||
        url.includes('.r2.cloudflarestorage.com/');
      if (!isR2) return url;
      const key = (u.pathname || '').replace(/^\/+/, '');
      if (!key) return url;
      return `${window.location.origin}/api/r2/object?key=${encodeURIComponent(key)}`;
    } catch {
      return url;
    }
  };

  const makeAvatarSvgUrl = (variant: 'male' | 'female', label: string) => {
    const seed = (label || 'U').toString().trim().slice(0, 30);
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    const hue = h % 360;
    const bg1 = `hsl(${hue}, 85%, 52%)`;
    const bg2 = `hsl(${(hue + 40) % 360}, 85%, 48%)`;
    const fg = 'rgba(255,255,255,0.95)';
    const hair = variant === 'female' ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.85)';
    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <defs>
    <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="${bg1}"/>
      <stop offset="1" stop-color="${bg2}"/>
    </linearGradient>
  </defs>
  <rect width="256" height="256" rx="128" fill="url(#g)"/>
  <circle cx="128" cy="104" r="44" fill="${fg}" opacity="0.95"/>
  <path d="M52 226c10-50 44-78 76-78s66 28 76 78" fill="${fg}" opacity="0.95"/>
  ${variant === 'female'
    ? `<path d="M84 78c10-22 30-34 44-34s34 12 44 34c-10-6-22-10-44-10s-34 4-44 10z" fill="${hair}" opacity="0.8"/>`
    : `<path d="M86 84c8-18 26-30 42-30s34 12 42 30c-10-5-22-8-42-8s-32 3-42 8z" fill="${hair}" opacity="0.75"/>`}
</svg>`;
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg.trim());
  };

  const compressAvatarToBlob = async (file: File) => {
    const bitmap = await createImageBitmap(file);
    const max = 512;
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No pude procesar la imagen');
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob: Blob | null = await new Promise((resolve) => {
      try {
        canvas.toBlob((b) => resolve(b), 'image/webp', 0.9);
      } catch {
        resolve(null);
      }
    });
    if (blob) return blob;
    const fallback: Blob | null = await new Promise((resolve) => {
      try {
        canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.9);
      } catch {
        resolve(null);
      }
    });
    if (!fallback) throw new Error('No pude procesar la imagen');
    return fallback;
  };

  const uploadProfileAvatar = async (file: File, userId: string) => {
    const t = await getAccessToken();
    if (!t.ok) return '';
    
    const blob = await compressAvatarToBlob(file);
    const arrayBuffer = await blob.arrayBuffer();
    const fileArray = Array.from(new Uint8Array(arrayBuffer));
    const path = `avatars/${userId}/avatar_${Date.now()}.webp`;
    
    const response = await fetch('/api/account/upload-profile-image', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'authorization': `Bearer ${t.token}`,
      },
      body: JSON.stringify({
        path,
        data: fileArray,
        contentType: 'image/webp',
      }),
    });
    
    if (response.ok) {
      const result = await response.json();
      const url = result.url;
      return typeof url === 'string' ? url.trim() : '';
    }
    
    return '';
  };



  const updatesSorted = APP_UPDATES.slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const latestUpdateKey = updatesSorted.length ? `${updatesSorted[0].date}::${updatesSorted[0].title}` : '';
  const unreadUpdatesCount = (() => {
    if (!updatesSorted.length) return 0;
    const seen = (updatesSeenKey || '').toString().trim();
    if (!seen) return updatesSorted.length;
    const idx = updatesSorted.findIndex((u) => `${u.date}::${u.title}` === seen);
    if (idx < 0) return updatesSorted.length;
    return idx;
  })();

  useEffect(() => {
    const onOpenPricing = () => {
      setIsPricingOpen(true);
    };
    window.addEventListener('ramber:openPricing', onOpenPricing as any);
    return () => {
      window.removeEventListener('ramber:openPricing', onOpenPricing as any);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const originalAlert = window.alert.bind(window);
    (window as any).__nativeAlert = originalAlert;
    window.alert = ((message?: any) => {
      showStyledAlert(String(message ?? ''));
    }) as typeof window.alert;
    return () => {
      window.alert = originalAlert;
      if ((window as any).__nativeAlert === originalAlert) {
        delete (window as any).__nativeAlert;
      }
    };
  }, []);

  useEffect(() => {
    const msg = (creditsError || '').toString();
    if (!msg) {
      lastCreditsErrorRef.current = '';
      return;
    }
    if (lastCreditsErrorRef.current === msg) return;
    lastCreditsErrorRef.current = msg;
    showToast(msg);
  }, [creditsError]);
  useEffect(() => {
    // #region debug-point auth-init
    console.log('[DEBUG] Auth useEffect running...');
    console.log('[DEBUG] supabaseBrowser available:', !!supabaseBrowser);
    // #endregion
    
    if (!supabaseBrowser) {
      setIsAuthBooting(false);
      return;
    }
    let alive = true;
    let signingOut = false;
    const setFromSession = (session: any) => {
      if (!session) {
        if (!alive) return;
        setAuthEmail('');
        setAuthUserId('');
        setIsAuthBooting(false);
        return;
      }
      const email = (session?.user?.email || '').toString().trim().toLowerCase();
      const nextUserId = (session?.user?.id || '').toString().trim();
      const ok = email && (email.endsWith('@gmail.com') || email.endsWith('@googlemail.com'));
      if (!ok) {
        if (signingOut) return;
        signingOut = true;
        try {
          supabaseBrowser.auth.signOut().catch(() => {});
        } catch {}
        if (!alive) return;
        setAuthEmail('');
        setAuthUserId('');
        setIsAuthBooting(false);
        return;
      }
      if (!alive) return;
      setAuthEmail(email);
      setAuthUserId(nextUserId);
      setIsAuthBooting(false);
    };
    supabaseBrowser.auth
      .getSession()
      .then(({ data }) => setFromSession(data?.session))
      .catch(() => {
        if (!alive) return;
        setAuthEmail('');
        setIsAuthBooting(false);
      });
    const { data: sub } = supabaseBrowser.auth.onAuthStateChange((_evt, session) => {
      setFromSession(session);
    });
    return () => {
      alive = false;
      try {
        sub?.subscription?.unsubscribe?.();
      } catch {
      }
    };
  }, []);

  const isAuthed = Boolean(authEmail);
  const didBootstrapRef = useRef(false);

  const [shareRouteId] = useState(() => {
    const p = (window.location?.pathname || '').toString();
    const m = p.match(/^\/(share|s)\/([^/?#]+)/i);
    if (!m) return '';
    const rawId = m[2] || '';
    const id = decodeURIComponent(rawId).trim();
    return id;
  });

  const [previewRouteId] = useState(() => {
    const p = (window.location?.pathname || '').toString();
    const m = p.match(/^\/preview\/([^/?#]+)/i);
    if (!m) return '';
    return decodeURIComponent(m[1] || '').trim();
  });

  const [profileRouteId] = useState(() => {
    const p = (window.location?.pathname || '').toString();
    const m = p.match(/^\/(u|perfil|profile|p)\/([^/?#]+)/i);
    if (!m) return '';
    const raw = m[2] || '';
    return decodeURIComponent(raw).trim();
  });

  const [elencoPresentationRoute] = useState(() => {
    const p = (window.location?.pathname || '').toString();
    const m = p.match(/^\/elenco-presentation/i);
    if (!m) return false;
    return true;
  });

  useEffect(() => {
    store.getData().then(data => {
      setVibes(data.vibes || []);
    });
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    };
  }, []);

  const refreshBalance = async () => {
    setIsBalanceLoading(true);
    setBalanceError('');
    try {
      const t = await getAccessToken();
      if (!t.ok) {
        setBalanceError(t.error || 'No se pudo iniciar sesión.');
        return null;
      }
      const r = await fetch('/api/account/balance', { headers: { authorization: `Bearer ${t.token}` } });
      const out = await r.json().catch(() => ({}));
      if (!r.ok) {
        setBalanceError((out?.error || 'No pude consultar tu saldo.').toString());
        return null;
      }
      setBalanceData(out);
      return out;
    } finally {
      setIsBalanceLoading(false);
    }
  };

  useEffect(() => {
    if (!isAuthed) return;
    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        wasHiddenRef.current = true;
        return;
      }
      if (document.visibilityState !== 'visible') return;
      refreshCredits().catch(() => {});
      refreshAppVersion()
        .then((v) => {
          if (!v) return;
          try {
            const prev = (window.localStorage.getItem('ramber.app_version_v1') || '').toString().trim();
            if (prev && prev !== v) {
              if (wasHiddenRef.current) {
                wasHiddenRef.current = false;
                markUpdateAvailable(v, 'Hay una actualización lista.');
                showToast('Actualización lista. Toca “ACTUALIZAR”.');
                return;
              }
              markUpdateAvailable(v, 'Hay una actualización lista.');
            }
          } catch {
          }
        })
        .catch(() => {});
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onVis);
    };
  }, [isAuthed, refreshCredits]);

  useEffect(() => {
    if (!isAuthed) return;
    let alive = true;
    const tick = () => {
      refreshAppVersion()
        .then((v) => {
          if (!alive) return;
          if (!v) return;
          try {
            const prev = (window.localStorage.getItem('ramber.app_version_v1') || '').toString().trim();
            if (prev && prev !== v) {
              markUpdateAvailable(v, 'Hay una actualización lista.');
            }
          } catch {
          }
        })
        .catch(() => {});
    };
    const id = window.setInterval(tick, 25000);
    tick();
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [isAuthed]);

  useEffect(() => {
    if (!isBalanceOpen) return;
    refreshBalance().catch(() => {});
  }, [isBalanceOpen]);

  useEffect(() => {
    if (!isAuthed) return;
    refreshBalance().catch(() => {});
  }, [isAuthed]);

  const mapSongRow = (row: any): SongItem => ({
    id: String(row?.id || ''),
    title: String(row?.title || 'Pista sin título'),
    description: typeof row?.description === 'string' ? row.description : undefined,
    lyrics: typeof row?.lyrics === 'string' ? row.lyrics : undefined,
    sunoModel: typeof row?.suno_model === 'string' ? row.suno_model : undefined,
    genre: typeof row?.gender === 'string' ? row.gender : undefined,
    isPublic: Boolean(row?.is_public),
    publicGenre: typeof row?.public_genre === 'string' ? row.public_genre : row?.public_genre ?? null,
    publishedAt: typeof row?.published_at === 'string' ? row.published_at : row?.published_at ?? null,
    audioUrl: typeof row?.audio_url === 'string' ? row.audio_url : undefined,
    coverUrl: typeof row?.cover_url === 'string' ? row.cover_url : undefined,
    createdAt: typeof row?.created_at === 'string' ? row.created_at : undefined,
    deletedAt: typeof row?.deleted_at === 'string' ? row.deleted_at : row?.deleted_at ?? null,
    deletedReason: typeof row?.deleted_reason === 'string' ? row.deleted_reason : row?.deleted_reason ?? null,
    sunoTaskId: typeof row?.suno_task_id === 'string' ? row.suno_task_id : row?.suno_task_id ?? null,
    sunoAudioId: typeof row?.suno_audio_id === 'string' ? row.suno_audio_id : row?.suno_audio_id ?? null,
    isCover: Boolean(row?.is_cover),
  });

  const loadSongs = async (deleted: boolean) => {
    const t = await getAccessToken();
    if (!t.ok) return { ok: false as const, error: t.error };
    const r = await fetch(`/api/library/list?deleted=${deleted ? '1' : '0'}`, {
      headers: { authorization: `Bearer ${t.token}` },
    });
    const rawText = await r.text().catch(() => '');
    const out = (() => {
      try {
        return rawText ? JSON.parse(rawText) : {};
      } catch {
        return {};
      }
    })();
    if (!r.ok) {
      const detail = (out?.detail || out?.error || rawText || '').toString().trim().replace(/\s+/g, ' ').slice(0, 220);
      const reason = detail ? `HTTP ${r.status}: ${detail}` : `HTTP ${r.status}`;
      return {
        ok: false as const,
        error: `No pude cargar tu biblioteca. ${reason}`.trim(),
        debugSummary: (out?.debug_summary || '').toString().trim(),
      };
    }
    const list = Array.isArray(out?.songs) ? out.songs : [];
    const songs = list.map(mapSongRow).filter((s: SongItem) => s.id);
    return {
      ok: true as const,
      songs,
      cleanupDeleted: Number(out?.cleanup_deleted || 0),
      debugSummary: (out?.debug_summary || '').toString().trim(),
    };
  };

  const refreshLibrary = async () => {
    const a = await loadSongs(false);
    if (a.ok) setCanciones(a.songs);
    else showToast((a.error || 'No pude cargar tu biblioteca.').toString());
    if (a.debugSummary) {
      showToast(a.debugSummary);
    }
    const d = await loadSongs(true);
    if (d.ok) setCancionesEliminadas(d.songs);
    if (a.ok && a.cleanupDeleted && a.cleanupDeleted > 0) {
      showToast(`Se eliminaron automáticamente ${a.cleanupDeleted} canciones (plan gratis: 15 días).`);
    }
  };

  const refreshAppVersion = async () => {
    try {
      if (typeof window !== 'undefined' && isLocalNetworkHost(window.location.hostname)) return null;
      const r = await fetch('/api/app/version', {
        method: 'GET',
        cache: 'no-store',
        headers: { 'cache-control': 'no-cache' },
      });
      const out = await r.json().catch(() => ({}));
      if (!r.ok || out?.ok === false) return null;
      const v = (out?.version || '').toString().trim();
      return v || null;
    } catch {
      return null;
    }
  };

  const forceReload = (nextVersion?: string | null) => {
    try {
      const v = (nextVersion || '').toString().trim();
      if (v) window.localStorage.setItem('ramber.app_version_v1', v);
    } catch {}
    try {
      const u = new URL(window.location.href);
      u.searchParams.set('__refresh', String(Date.now()));
      window.location.href = u.toString();
      return;
    } catch {}
    try {
      window.location.reload();
    } catch {}
  };

  const openUpdates = () => {
    if (latestUpdateKey) {
      try {
        window.localStorage.setItem('ramber.updates_seen_v1', latestUpdateKey);
      } catch {
      }
      setUpdatesSeenKey(latestUpdateKey);
    }
    setIsUpdatesOpen(true);
  };

  useEffect(() => {
    refreshAppVersion().then((v) => {
      if (!v) return;
      try {
        const prev = (window.localStorage.getItem('ramber.app_version_v1') || '').toString().trim();
        if (!prev) {
          window.localStorage.setItem('ramber.app_version_v1', v);
          latestVersionRef.current = v;
          return;
        }
        if (prev !== v) {
          markUpdateAvailable(v, 'Hay una actualización lista.');
        }
      } catch {
      }
    });
  }, []);

  useEffect(() => {
    const onErr = (e: any) => {
      const msg = String(e?.message || e?.error?.message || '').trim();
      const lower = msg.toLowerCase();
      const looksLikeChunk =
        lower.includes('chunkloaderror') ||
        lower.includes('loading chunk') ||
        lower.includes('importing a module script failed') ||
        lower.includes('failed to fetch dynamically imported module');
      if (!looksLikeChunk) return;
      setUpdateNote('La app necesita actualizarse para seguir funcionando.');
      setUpdateAvailable(true);
    };
    const onRej = (e: any) => {
      const reason = (e && 'reason' in e ? (e as any).reason : null) as any;
      const msg = String(reason?.message || reason || '').trim();
      const lower = msg.toLowerCase();
      const looksLikeChunk =
        lower.includes('chunkloaderror') ||
        lower.includes('loading chunk') ||
        lower.includes('importing a module script failed') ||
        lower.includes('failed to fetch dynamically imported module');
      if (!looksLikeChunk) return;
      setUpdateNote('La app necesita actualizarse para seguir funcionando.');
      setUpdateAvailable(true);
    };
    window.addEventListener('error', onErr);
    window.addEventListener('unhandledrejection', onRej);
    return () => {
      window.removeEventListener('error', onErr);
      window.removeEventListener('unhandledrejection', onRej);
    };
  }, []);

  useEffect(() => {
    if (!isAuthed) return;
    const el = appRootRef.current;
    if (!el) return;

    const findScrollableParent = (node: any) => {
      try {
        let cur: HTMLElement | null = node instanceof HTMLElement ? node : null;
        while (cur && cur !== el) {
          const style = window.getComputedStyle(cur);
          const oy = (style?.overflowY || '').toString();
          const canScroll = (oy === 'auto' || oy === 'scroll') && cur.scrollHeight > cur.clientHeight + 2;
          if (canScroll) return cur;
          cur = cur.parentElement;
        }
      } catch {
      }
      return null;
    };

    const onTouchStart = (e: TouchEvent) => {
      if (pullRefreshingRef.current) return;
      if (!e.touches || e.touches.length !== 1) return;
      const t = e.touches[0];
      pullStartXRef.current = t.clientX;
      pullStartYRef.current = t.clientY;
      pullTrackingRef.current = true;
      try {
        const scrollParent = findScrollableParent(e.target);
        const atTop = scrollParent ? scrollParent.scrollTop <= 0 : (document.scrollingElement?.scrollTop || 0) <= 0;
        pullAllowedRef.current = atTop && t.clientY <= 160;
      } catch {
        pullAllowedRef.current = t.clientY <= 160;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!pullTrackingRef.current) return;
      if (!pullAllowedRef.current) return;
      if (pullRefreshingRef.current) return;
      if (!e.touches || e.touches.length !== 1) return;
      const t = e.touches[0];
      const dx = t.clientX - pullStartXRef.current;
      const dy = t.clientY - pullStartYRef.current;
      if (dy <= 0) {
        if (pullDistanceRef.current) {
          pullDistanceRef.current = 0;
          setPullDistance(0);
        }
        return;
      }
      if (Math.abs(dy) < Math.abs(dx) * 1.25) return;
      const capped = Math.max(0, Math.min(120, Math.round(dy)));
      if (capped > 8) {
        try {
          e.preventDefault();
        } catch {}
      }
      pullDistanceRef.current = capped;
      setPullDistance(capped);
    };

    const onTouchEnd = () => {
      pullTrackingRef.current = false;
      pullAllowedRef.current = false;
      const dist = pullDistanceRef.current;
      pullDistanceRef.current = 0;
      setPullDistance(0);
      if (pullRefreshingRef.current) return;
      if (dist < 70) return;
      const now = Date.now();
      if (now - pullLastRefreshAtRef.current < 2500) return;
      pullLastRefreshAtRef.current = now;
      setIsPullRefreshing(true);
      pullRefreshingRef.current = true;
      Promise.allSettled([refreshLibrary(), refreshCredits(), refreshBalance(), refreshAppVersion()]).then((results) => {
        pullRefreshingRef.current = false;
        setIsPullRefreshing(false);
        const v = results.length ? (results[results.length - 1] as any)?.value : null;
        if (typeof v === 'string' && v.trim()) {
          try {
            const prev = (window.localStorage.getItem('ramber.app_version_v1') || '').toString().trim();
            if (prev && prev !== v.trim()) {
              markUpdateAvailable(v.trim(), 'Hay una actualización lista.');
              showToast('Actualización lista. Toca “ACTUALIZAR”.');
              return;
            }
            if (!prev) window.localStorage.setItem('ramber.app_version_v1', v.trim());
          } catch {
          }
        }
        showToast('Actualizado.');
      });
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('touchcancel', onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onTouchStart as any);
      el.removeEventListener('touchmove', onTouchMove as any);
      el.removeEventListener('touchend', onTouchEnd as any);
      el.removeEventListener('touchcancel', onTouchEnd as any);
    };
  }, [isAuthed, refreshCredits]);

  useEffect(() => {
    if (!isAuthed) return;
    refreshLibrary().catch(() => {});
  }, [isAuthed]);

  useEffect(() => {
    try {
      const u = new URL(window.location.href);
      const ref = (u.searchParams.get('ref') || u.searchParams.get('af') || u.searchParams.get('affiliate') || '').toString().trim();
      if (ref) {
        localStorage.setItem(AFFILIATE_REF_KEY, ref);
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (!isAuthed) return;
    if (didBootstrapRef.current) return;
    didBootstrapRef.current = true;
    getAccessToken()
      .then(async (t) => {
        if (!t.ok) return;
        let referralCode = '';
        try {
          referralCode = (localStorage.getItem(AFFILIATE_REF_KEY) || '').toString().trim();
        } catch {}
        const r = await fetch('/api/account/bootstrap-profile', {
          method: 'POST',
          headers: { authorization: `Bearer ${t.token}`, 'content-type': 'application/json' },
          body: JSON.stringify({ referralCode: referralCode || undefined }),
        }).catch(() => {});
        let out: any = null;
        try {
          out = r && typeof (r as any).json === 'function' ? await (r as any).json().catch(() => null) : null;
        } catch {
          out = null;
        }
        if (out?.referral_attached) {
          try {
            localStorage.removeItem(AFFILIATE_REF_KEY);
          } catch {}
        }
        if (out?.welcome_granted) {
          showToast('Listo: se activó tu saldo de bienvenida (2 canciones).');
        }
        if (out?.welcome_error) {
          showToast(String(out.welcome_error));
        }
        await refreshCredits().catch(() => {});
        await refreshBalance().catch(() => {});
      })
      .catch(() => {});
  }, [isAuthed]);



  useEffect(() => {
    const isStandalone =
      window.matchMedia?.('(display-mode: standalone)')?.matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    const isMobile = window.matchMedia?.('(max-width: 768px)')?.matches ?? false;
    const ua = (navigator.userAgent || '').toString();
    const isIos = /iphone|ipad|ipod/i.test(ua);
    const isInApp = /(wv|fbav|fban|instagram|whatsapp)/i.test(ua);

    if (isMobile && !isStandalone && (isIos || isInApp)) {
      setShowInstallBanner(true);
    }

    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setInstallPromptEvent(e as BeforeInstallPromptEvent);
      setShowInstallBanner(true);
    };

    const onAppInstalled = () => {
      setShowInstallBanner(false);
      setInstallPromptEvent(null);
      setShowIosHelp(false);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt as EventListener);
    window.addEventListener('appinstalled', onAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt as EventListener);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  const onInstallClick = async () => {
    if (installPromptEvent) {
      try {
        await installPromptEvent.prompt();
        const choice = await installPromptEvent.userChoice;
        setInstallPromptEvent(null);
        if (choice.outcome === 'accepted') {
          setShowInstallBanner(false);
          return;
        }
        showToast('Si no se instaló, abre el menú ⋮ del navegador y toca “Instalar app”.');
        return;
      } catch (e: any) {
        const msg = (e instanceof Error ? e.message : String(e || '')).toString().trim();
        setInstallPromptEvent(null);
        showToast(msg ? `No pude abrir la instalación.\n\nDetalle: ${msg}` : 'No pude abrir la instalación. Abre el menú ⋮ del navegador y toca “Instalar app”.');
        return;
      }
    }

    try {
      const ua = (navigator.userAgent || '').toString();
      const isIos = /iphone|ipad|ipod/i.test(ua);
      if (isIos) {
        setShowIosHelp(true);
        return;
      }
      const isInApp = /(wv|fbav|fban|instagram|whatsapp)/i.test(ua);
      if (isInApp) {
        showToast('Para instalar: abre esta página en Chrome (no dentro de WhatsApp/Facebook/Instagram). Luego menú ⋮ → “Instalar app”.');
        return;
      }
      showToast('Si no aparece el botón de instalar: abre el menú ⋮ del navegador y toca “Instalar app” o “Agregar a pantalla principal”.');
    } catch {
      showToast('Si no aparece el botón de instalar: abre el menú ⋮ del navegador y toca “Instalar app”.');
    }
  };

  const addVibe = async (vibe: VibeItem) => {
    const updatedVibes = [vibe, ...vibes];
    setVibes(updatedVibes);
    await store.saveData({ canciones, vibes: updatedVibes });
  };

  const handleTabChange = (tab: ViewTab) => {
    setCurrentTab(tab);
    try {
      const nextPath = pathnameFromTab(tab);
      if (window.location.pathname !== nextPath) {
        window.history.pushState({}, '', nextPath);
      }
    } catch {
    }
  };

  const openPricingModal = () => {
    try {
      if (typeof window !== 'undefined') {
        if (!pricingPrevUrlRef.current) {
          pricingPrevUrlRef.current = `${window.location.pathname || ''}${window.location.search || ''}${window.location.hash || ''}` || '/';
        }
        const next = '/planes';
        const now = `${window.location.pathname || ''}${window.location.search || ''}${window.location.hash || ''}` || '/';
        if (now !== next) window.history.replaceState({}, '', next);
      }
    } catch {
    }
    setIsPricingOpen(true);
  };

  const closePricingModal = () => {
    setIsPricingOpen(false);
    try {
      if (typeof window !== 'undefined') {
        const prev = pricingPrevUrlRef.current;
        pricingPrevUrlRef.current = null;
        if (prev) {
          const now = `${window.location.pathname || ''}${window.location.search || ''}${window.location.hash || ''}` || '/';
          if (now !== prev) window.history.replaceState({}, '', prev);
        }
      }
    } catch {
    }
  };

  useEffect(() => {
    const onPopState = () => {
      try {
        setCurrentTab(tabFromPathname(window.location.pathname || '/'));
      } catch {
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
    };
  }, []);

  const addCancion = async (cancion: SongItem) => {
    try {
      const t = await getAccessToken();
      if (!t.ok) {
        alert(t.error || 'No se pudo iniciar sesión.');
        return;
      }
      const r = await fetch('/api/library/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${t.token}` },
        body: JSON.stringify({
          title: cancion.title,
          description: cancion.description || '',
          lyrics: cancion.lyrics || null,
          sunoModel: cancion.sunoModel || null,
          gender: cancion.genre || null,
          audioUrl: cancion.audioUrl || null,
          coverUrl: cancion.coverUrl || null,
          sunoTaskId: cancion.sunoTaskId || null,
          sunoAudioId: cancion.sunoAudioId || null,
          isCover: Boolean(cancion.isCover),
        }),
      });
      const out = await r.json().catch(() => ({}));
      if (!r.ok) {
        alert(out?.error || 'No pude guardar en tu biblioteca.');
        return;
      }
      const row = out?.song;
      const saved = mapSongRow(row);
      if (saved.id) {
        setCanciones((prev) => [saved, ...prev.filter((x) => x.id !== saved.id)]);
      }
      refreshCredits().catch(() => {});
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error guardando en biblioteca');
    }
  };

  const startCoverFromSong = (song: SongItem) => {
    const songId = (song?.id || '').toString().trim();
    const rawUrl = (song?.audioUrl || '').toString().trim();
    const deriveAudioPath = (value: string) => {
      const src = (value || '').toString().trim();
      if (!src) return '';
      const normalizeKey = (raw: string) => {
        const key = (raw || '').toString().trim().replace(/^\/+/, '');
        if (!key) return '';
        const prefixes = ['uploads/audio/', 'uploads/', 'imports/'];
        for (const prefix of prefixes) {
          const idx = key.indexOf(prefix);
          if (idx >= 0) return key.slice(idx);
        }
        return '';
      };
      try {
        const parsed = new URL(src, window.location.origin);
        const keyFromQuery = normalizeKey((parsed.searchParams.get('key') || '').toString());
        if (keyFromQuery) return keyFromQuery;
        const host = (parsed.hostname || '').toLowerCase();
        const isR2 =
          host.includes('.r2.cloudflarestorage.com') ||
          host.endsWith('.r2.dev') ||
          host.includes('.r2') ||
          src.includes('.r2.cloudflarestorage.com/');
        if (!isR2) return '';
        return normalizeKey(parsed.pathname || '');
      } catch {
        return '';
      }
    };
    const audioPath = deriveAudioPath(rawUrl) || (song?.audioPath || '').toString().trim();
    const proxyUrl = songId ? `/api/share/song/audio?id=${encodeURIComponent(songId)}&t=${Date.now()}` : '';
    const url = proxyUrl || rawUrl;
    if (!url) {
      alert('Esta canción no tiene audio para hacer cover.');
      return;
    }
    setStudioPrefill({ type: 'cover', song: { ...song, audioUrl: url, audioPath } });
    setStudioPrefillNonce((n) => n + 1);
    setCurrentTab('studio');
  };

  useEffect(() => {
    if (!isAuthed) return;
    let busy = false;
    const readList = () => {
      try {
        const raw = window.localStorage.getItem(pendingListKey);
        const parsed = raw ? JSON.parse(raw) : null;
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    };

    const completedDownloadsKey = 'ramber.completedSunoDownloads_v1';
    const readCompleted = () => {
      try {
        const raw = window.localStorage.getItem(completedDownloadsKey);
        const parsed = raw ? JSON.parse(raw) : null;
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    };
    const writeCompleted = (list: any[]) => {
      try {
        if (!Array.isArray(list) || list.length === 0) {
          window.localStorage.removeItem(completedDownloadsKey);
          return;
        }
        window.localStorage.setItem(completedDownloadsKey, JSON.stringify(list));
      } catch {
      }
    };
    const pushCompleted = (item: any) => {
      try {
        const list = readCompleted();
        const next = Array.isArray(list) ? [item, ...list] : [item];
        writeCompleted(next.slice(0, 50));
      } catch {
      }
    };

    const migrateLegacyIfNeeded = () => {
      try {
        const existing = readList();
        if (existing.length > 0) return existing;
        const legacyRaw = window.localStorage.getItem(pendingLegacyKey);
        if (!legacyRaw) return existing;
        const legacy = JSON.parse(legacyRaw);
        const taskId = typeof legacy?.taskId === 'string' ? legacy.taskId.trim() : '';
        if (!taskId) return existing;
        const kind = typeof legacy?.kind === 'string' ? legacy.kind.trim() : 'generate';
        const startedAt = Number(legacy?.startedAt || 0);
        const draft = legacy?.draft ?? null;
        const next = [{ taskId, kind, startedAt: Number.isFinite(startedAt) ? startedAt : Date.now(), draft }];
        window.localStorage.setItem(pendingListKey, JSON.stringify(next));
        window.localStorage.removeItem(pendingLegacyKey);
        return next;
      } catch {
        return readList();
      }
    };

    const writeList = (list: any[]) => {
      try {
        if (!Array.isArray(list) || list.length === 0) {
          window.localStorage.removeItem(pendingListKey);
          return;
        }
        window.localStorage.setItem(pendingListKey, JSON.stringify(list));
      } catch {
      }
    };

    const patchTask = (taskId: string, patch: any) => {
      try {
        const list = migrateLegacyIfNeeded();
        const next = Array.isArray(list)
          ? list.map((x: any) => {
              const id = typeof x?.taskId === 'string' ? x.taskId.trim() : '';
              if (!id || id !== taskId) return x;
              return { ...x, ...patch };
            })
          : [];
        writeList(next);
      } catch {
      }
    };

    const bumpTaskError = (taskId: string, errorMsg: string) => {
      try {
        const list = migrateLegacyIfNeeded();
        const next = Array.isArray(list)
          ? list.map((x: any) => {
              const id = typeof x?.taskId === 'string' ? x.taskId.trim() : '';
              if (!id || id !== taskId) return x;
              const prevFail = Number.isFinite(Number(x?.failCount)) ? Number(x.failCount) : 0;
              const failCount = Math.min(999, prevFail + 1);
              const lastError = (errorMsg || '').toString().trim().slice(0, 500);
              const lastErrorAt = Date.now();
              return { ...x, failCount, lastError, lastErrorAt };
            })
          : [];
        writeList(next);
        const it = Array.isArray(next) ? next.find((x: any) => String(x?.taskId || '').trim() === taskId) : null;
        const failCount = Number.isFinite(Number(it?.failCount)) ? Number(it.failCount) : 1;
        if (failCount === 1 || failCount === 4) {
          const msg = (errorMsg || '').toString().trim();
          showToast(
            msg
              ? `No pude actualizar tu canción.\n\nDetalle: ${msg.slice(0, 140)}\n\nTip: toca “Actualizar” otra vez o cierra y abre la app.`
              : 'No pude actualizar tu canción. Toca “Actualizar” otra vez o cierra y abre la app.',
          );
        }
      } catch {
      }
    };

    const readNextPending = () => {
      const list = migrateLegacyIfNeeded();
      const item = Array.isArray(list) && list.length > 0 ? list[0] : null;
      if (!item) return null;
      const taskId = typeof item?.taskId === 'string' ? item.taskId.trim() : '';
      if (!taskId) return null;
      const kind = typeof item?.kind === 'string' ? item.kind.trim() : 'generate';
      const draft = item?.draft ?? null;
      return { taskId, kind, draft };
    };

    const extractTracks = (payload: any) => {
      const d = payload?.data || payload?.data?.data || payload;
      const candidates: any[] = [];
      if (Array.isArray(d?.response?.data)) candidates.push(d.response.data);
      if (Array.isArray(d?.response?.sunoData)) candidates.push(d.response.sunoData);
      if (Array.isArray(d?.response)) candidates.push(d.response);
      if (Array.isArray(d?.data)) candidates.push(d.data);
      if (Array.isArray(d?.data?.data)) candidates.push(d.data.data);
      const list = (candidates.find((x) => Array.isArray(x) && x.length) as any[]) || [];
      const cleanStr = (v: any) => (typeof v === 'string' ? v : v == null ? '' : String(v)).trim();
      const pickUrl = (track: any) => {
        const raw =
          track?.audio_url ||
          track?.audioUrl ||
          track?.streamAudioUrl ||
          track?.stream_audio_url ||
          track?.stream_url ||
          track?.url ||
          '';
        const s = cleanStr(raw);
        
        // #region debug-point P5: Log URL extraction
        console.debug(`[DEBUG-P5] Extracting audio URL:`, {
          rawUrl: raw,
          cleanedUrl: s,
          isValid: /^https?:\/\//i.test(s),
          isSunoUrl: s.includes('suno.ai') || s.includes('cdn.suno'),
          isR2Url: s.includes('r2.cloudflarestorage.com') || s.includes('.r2.dev'),
          trackId: track?.id || 'unknown'
        });
        // #endregion
        
        return /^https?:\/\//i.test(s) ? s : '';
      };
      const pickAudioId = (track: any) => {
        const raw = track?.id || track?.audio_id || track?.audioId || track?.audioID || '';
        const s = cleanStr(raw);
        return s;
      };
      const pickLyrics = (track: any) => {
        const direct =
          (typeof track?.lyrics === 'string' ? track.lyrics : '') ||
          (typeof track?.lyric === 'string' ? track.lyric : '') ||
          (typeof track?.lyrics_text === 'string' ? track.lyrics_text : '') ||
          (typeof track?.lyricsText === 'string' ? track.lyricsText : '') ||
          (typeof track?.gpt_lyrics === 'string' ? track.gpt_lyrics : '') ||
          (typeof track?.gptLyrics === 'string' ? track.gptLyrics : '') ||
          (typeof track?.text === 'string' ? track.text : '') ||
          (typeof track?.prompt === 'string' ? track.prompt : '') ||
          (typeof track?.metadata?.lyrics === 'string' ? track.metadata.lyrics : '') ||
          (typeof track?.metadata?.lyric === 'string' ? track.metadata.lyric : '') ||
          (typeof track?.metadata?.text === 'string' ? track.metadata.text : '') ||
          (typeof track?.metadata?.prompt === 'string' ? track.metadata.prompt : '');
        const s = (direct || '').toString().trim();
        return s || undefined;
      };
      const pickCover = (track: any) =>
        cleanStr(
          track?.image_url ||
            track?.imageUrl ||
            track?.image_large_url ||
            track?.imageLargeUrl ||
            track?.cover_url ||
            track?.coverUrl ||
            track?.thumbnail_url ||
            track?.thumbnailUrl ||
            track?.metadata?.image_url ||
            track?.metadata?.imageUrl ||
            track?.metadata?.image_large_url ||
            track?.metadata?.imageLargeUrl ||
            track?.metadata?.cover_url ||
            track?.metadata?.coverUrl ||
            track?.metadata?.thumbnail_url ||
            track?.metadata?.thumbnailUrl ||
            track?.image?.url ||
            track?.image?.src ||
            track?.cover?.url ||
            track?.cover?.src ||
            ''
        );
      return (Array.isArray(list) ? list : []).map((track: any) => {
        const audioUrl = pickUrl(track);
        const audioId = pickAudioId(track);
        const title = cleanStr(track?.title || '');
        const coverUrl = pickCover(track);
        const lyrics = pickLyrics(track);
        return { audioUrl, audioId, title, coverUrl, lyrics };
      });
    };

    const pickLyricsFromTaskPayload = (payload: any, matchAudioUrl?: string) => {
      const d = payload?.data || payload?.data?.data || payload;
      const candidates: any[] = [];
      if (Array.isArray(d?.response?.data)) candidates.push(d.response.data);
      if (Array.isArray(d?.response?.sunoData)) candidates.push(d.response.sunoData);
      if (Array.isArray(d?.response)) candidates.push(d.response);
      if (Array.isArray(d?.data)) candidates.push(d.data);
      if (Array.isArray(d?.data?.data)) candidates.push(d.data.data);
      const list = (candidates.find((x) => Array.isArray(x) && x.length) as any[]) || [];
      const cleanStr = (v: any) => (typeof v === 'string' ? v : v == null ? '' : String(v)).trim();
      const pickUrl = (track: any) =>
        cleanStr(
          track?.audio_url ||
            track?.audioUrl ||
            track?.streamAudioUrl ||
            track?.stream_audio_url ||
            track?.stream_url ||
            track?.url ||
            ''
        );
      const pickLyrics = (track: any) => {
        const direct =
          (typeof track?.lyrics === 'string' ? track.lyrics : '') ||
          (typeof track?.lyric === 'string' ? track.lyric : '') ||
          (typeof track?.lyrics_text === 'string' ? track.lyrics_text : '') ||
          (typeof track?.lyricsText === 'string' ? track.lyricsText : '') ||
          (typeof track?.gpt_lyrics === 'string' ? track.gpt_lyrics : '') ||
          (typeof track?.gptLyrics === 'string' ? track.gptLyrics : '') ||
          (typeof track?.text === 'string' ? track.text : '') ||
          (typeof track?.prompt === 'string' ? track.prompt : '') ||
          (typeof track?.metadata?.lyrics === 'string' ? track.metadata.lyrics : '') ||
          (typeof track?.metadata?.lyric === 'string' ? track.metadata.lyric : '') ||
          (typeof track?.metadata?.text === 'string' ? track.metadata.text : '') ||
          (typeof track?.metadata?.prompt === 'string' ? track.metadata.prompt : '');
        return cleanStr(direct);
      };

      const wanted = cleanStr(matchAudioUrl || '');
      if (wanted) {
        const match = list.find((t: any) => pickUrl(t) && pickUrl(t) === wanted);
        const m = match ? pickLyrics(match) : '';
        if (m) return m;
      }
      for (const t of list) {
        const l = pickLyrics(t);
        if (l) return l;
      }
      const fallback =
        cleanStr(d?.response?.lyrics) ||
        cleanStr(d?.response?.lyric) ||
        cleanStr(d?.response?.lyricsText) ||
        cleanStr(d?.response?.lyrics_text) ||
        cleanStr(d?.response?.gpt_lyrics) ||
        cleanStr(d?.response?.gptLyrics) ||
        cleanStr(d?.data?.response?.lyrics) ||
        cleanStr(d?.data?.response?.lyric) ||
        cleanStr(d?.data?.response?.lyricsText) ||
        cleanStr(d?.data?.response?.lyrics_text) ||
        cleanStr(d?.lyrics) ||
        cleanStr(d?.lyric) ||
        cleanStr(d?.data?.lyrics) ||
        cleanStr(d?.data?.lyric) ||
        '';
      return fallback;
    };

    const extractVocalRemovalUrls = (payload: any) => {
      const d = payload?.data || payload?.data?.data || payload;
      const root = d?.data || d || {};
      const resp = root?.response || root?.data?.response || root?.data?.data?.response || {};
      const cleanUrl = (raw: any) =>
        String(raw || '')
          .trim()
          .replaceAll('`', '')
          .trim();
      const normalizeKey = (k: string) => {
        const kk = (k || '').trim();
        if (!kk) return '';
        if (kk.endsWith('_url')) return kk.slice(0, -4) + 'Url';
        return kk;
      };
      const direct = new Map<string, string>();
      for (const [k, v] of Object.entries(resp || {})) {
        const key = normalizeKey(String(k || ''));
        const url = cleanUrl(v);
        if (!key || !url.startsWith('http')) continue;
        direct.set(key, url);
      }
      if (Array.isArray(resp?.originData)) {
        for (const row of resp.originData) {
          const label = String(row?.stem_type_group_name || row?.stemTypeGroupName || row?.name || row?.type || '').trim().toLowerCase();
          const url = cleanUrl(row?.audio_url || row?.audioUrl || '');
          if (!url.startsWith('http')) continue;
          if (label.includes('instrumental')) direct.set('instrumentalUrl', url);
          if (label.includes('vocal')) direct.set('vocalUrl', url);
          if (label.includes('vocals')) direct.set('vocalUrl', url);
        }
      }
      const instrumentalUrl = direct.get('instrumentalUrl') || '';
      const vocalUrl = direct.get('vocalUrl') || '';
      return { instrumentalUrl, vocalUrl };
    };

    const tick = async () => {
      if (busy) return;
      const pending = readNextPending();
      if (!pending) return;
      busy = true;
      try {
        const t = await getAccessToken();
        if (!t.ok) return;
        const r = await fetch(`/api/suno/task?taskId=${encodeURIComponent(pending.taskId)}&kind=${encodeURIComponent(pending.kind || "generate")}`, {
          headers: { authorization: `Bearer ${t.token}` },
        });
        const out = await r.json().catch(() => ({}));
        if (!r.ok) {
          const msg = (out?.detail || out?.error || out?.message || `HTTP ${Number(r.status || 0)}`).toString();
          bumpTaskError(pending.taskId, msg);
          return;
        }
        const data = out?.data || out?.data?.data || out?.data;
        const status = String(data?.data?.status || data?.data?.successFlag || data?.status || data?.successFlag || '').toUpperCase();

        if (status) {
          const pct =
            status === 'SUCCESS'
              ? 100
              : status === 'FIRST_SUCCESS'
                ? 70
                : status === 'TEXT_SUCCESS'
                  ? 35
                  : status === 'GENERATING'
                    ? 25
                    : status === 'PENDING'
                      ? 3
                      : null;
          patchTask(pending.taskId, { providerStatus: status, progressPct: typeof pct === 'number' ? pct : undefined });
        }
        patchTask(pending.taskId, { lastError: '', failCount: 0, lastErrorAt: null });

        if (status === 'SUCCESS') {
          const kind = (pending.kind || 'generate').toLowerCase();
          if (kind === 'separate_vocal' || kind === 'split_stem') {
            pushCompleted({
              taskId: pending.taskId,
              kind,
              doneAt: Date.now(),
              draft: pending.draft ?? null,
            });
            const draft = pending.draft ?? {};
            const baseName = String(draft?.title || 'Canción').toString().trim().slice(0, 100);
            const coverUrl = typeof draft?.coverUrl === 'string' ? draft.coverUrl.trim().slice(0, 2000) : '';
            const description = typeof draft?.description === 'string' ? draft.description.trim().slice(0, 2000) : '';
            const { instrumentalUrl, vocalUrl } = extractVocalRemovalUrls(data);
            const toImport: Array<{ key: 'instrumentalUrl' | 'vocalUrl'; label: string; url: string }> = [];
            if (instrumentalUrl) toImport.push({ key: 'instrumentalUrl', label: 'Instrumental (Karaoke)', url: instrumentalUrl });
            if (vocalUrl) toImport.push({ key: 'vocalUrl', label: 'Voz', url: vocalUrl });
            if (toImport.length > 0) {
              for (const it of toImport) {
                try {
                  const externalId = `stem_${pending.taskId}_${it.key}`;
                  const finalTitle = `${baseName} - ${it.label}`.slice(0, 120);
                  await fetch('/api/library/import-audio', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json', authorization: `Bearer ${t.token}` },
                    body: JSON.stringify({
                      sourceUrl: it.url,
                      title: finalTitle,
                      description: description || `${baseName}`.slice(0, 2000),
                      coverUrl,
                      externalId,
                      sunoTaskId: pending.taskId,
                    }),
                  }).catch(() => null as any);
                } catch {
                }
              }
              await refreshLibrary();
            }
            const list = migrateLegacyIfNeeded();
            const rest = Array.isArray(list) ? list.slice(1) : [];
            writeList(rest);
            showToast(toImport.length > 0 ? `Listo: se guardaron ${toImport.length} pistas en tu Biblioteca.` : kind === 'split_stem' ? 'Listo: Stems listos para descargar.' : 'Listo: Karaoke listo para descargar.');
            return;
          }

          const tracks = extractTracks(data).filter((x) => x && x.audioUrl);
          if (tracks.length === 0) {
            return;
          }
          const draft = pending.draft ?? {};
          const baseTitle = String(draft?.title || 'Canción');
          const draftLyrics = typeof draft?.lyrics === 'string' && draft.lyrics.trim() ? String(draft.lyrics) : '';
          const draftPrompt = typeof draft?.prompt === 'string' && draft.prompt.trim() ? String(draft.prompt) : '';
          const draftDescription = typeof draft?.description === 'string' && draft.description.trim() ? String(draft.description) : '';
          const draftModel = typeof draft?.model === 'string' && draft.model.trim() ? String(draft.model).trim() : '';
          for (let i = 0; i < tracks.length; i++) {
            const track = tracks[i];
            const suffix =
              tracks.length === 2 ? (i === 0 ? 'A' : i === 1 ? 'B' : String(i + 1)) : tracks.length > 1 ? String(i + 1) : '';
            const finalTitle = (() => {
              const providerTitle = (track.title || '').toString().trim();
              const chosen = providerTitle || baseTitle;
              if (!suffix) return chosen;
              const hasSuffix = new RegExp(`\\s${suffix}$`, 'i').test(chosen);
              return hasSuffix ? chosen : `${chosen} ${suffix}`;
            })();
            const autoLyrics =
              (typeof track?.lyrics === 'string' ? track.lyrics.trim() : '') ||
              pickLyricsFromTaskPayload(data, track.audioUrl) ||
              (draftLyrics || '').trim() ||
              (draftPrompt || '').trim() ||
              (draftDescription || '').trim() ||
              '';
            await addCancion({
              id: track.audioId || `${pending.taskId}_${i + 1}`,
              title: finalTitle,
              description: String(draft?.description || ''),
              lyrics: autoLyrics ? autoLyrics : undefined,
              sunoModel: draftModel || undefined,
              genre: typeof draft?.genre === 'string' ? draft.genre : undefined,
              audioUrl: track.audioUrl,
              coverUrl: track.coverUrl || undefined,
              sunoTaskId: pending.taskId,
              sunoAudioId: track.audioId || null,
              isCover: Boolean(draft?.isCover),
            });
          }
          const list = migrateLegacyIfNeeded();
          const rest = Array.isArray(list) ? list.slice(1) : [];
          writeList(rest);
          showToast(tracks.length > 1 ? `Listo: se guardaron ${tracks.length} canciones en tu Biblioteca.` : 'Listo: se guardó en tu Biblioteca.');
          return;
        }

        if (status === 'FAILED' || status === 'CREATE_TASK_FAILED' || status === 'GENERATE_AUDIO_FAILED' || status === 'CALLBACK_EXCEPTION' || status === 'SENSITIVE_WORD_ERROR') {
          const msg =
            (data?.data?.errorMessage || data?.data?.error_message || data?.errorMessage || data?.error_message || 'Error en la generación').toString();
          const list = migrateLegacyIfNeeded();
          const rest = Array.isArray(list) ? list.slice(1) : [];
          writeList(rest);
          const raw = String(msg || '').trim();
          const lower = raw.toLowerCase();
          const looksLikeVoiceExpired =
            lower.includes('voice has expired') ||
            (lower.includes('voice') && lower.includes('expired')) ||
            (lower.includes('persona') && lower.includes('expired'));
          if (looksLikeVoiceExpired) {
            try {
              window.localStorage.setItem('ramber.voice_expired_v1', String(Date.now()));
            } catch {}
            showToast('La voz seleccionada expiró. Entra a “Clonador” y elige otra voz (o vuelve a crearla).');
          } else {
            showToast(raw || 'Error en la generación');
          }
          return;
        }
      } finally {
        busy = false;
      }
    };

    const id = window.setInterval(() => {
      tick().catch(() => {});
    }, 4000);
    tick().catch(() => {});
    const onForce = () => tick().catch(() => {});
    window.addEventListener('ramber:forcePendingSync', onForce as any);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('ramber:forcePendingSync', onForce as any);
    };
  }, [isAuthed]);

  const deleteCancion = async (songId: string) => {
    try {
      const t = await getAccessToken();
      if (!t.ok) {
        alert(t.error || 'No se pudo iniciar sesión.');
        return;
      }
      const r = await fetch('/api/library/delete', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${t.token}` },
        body: JSON.stringify({ id: songId }),
      });
      const out = await r.json().catch(() => ({}));
      if (!r.ok) {
        alert(out?.error || 'No pude eliminar.');
        return;
      }
      setCanciones((prev) => prev.filter((song) => song.id !== songId));
      await refreshLibrary();
      if (activeSong?.id === songId) {
        setActiveSong(null);
        setIsPlaying(false);
        if (audioRef.current) audioRef.current.src = '';
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error eliminando');
    }
  };

  const restoreCancion = async (songId: string) => {
    try {
      const t = await getAccessToken();
      if (!t.ok) {
        alert(t.error || 'No se pudo iniciar sesión.');
        return;
      }
      const r = await fetch('/api/library/restore', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${t.token}` },
        body: JSON.stringify({ id: songId }),
      });
      const out = await r.json().catch(() => ({}));
      if (!r.ok) {
        alert(out?.error || 'No pude recuperar.');
        return;
      }
      await refreshLibrary();
      refreshCredits().catch(() => {});
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error recuperando');
    }
  };

  const purgeCancion = async (songId: string) => {
    try {
      const t = await getAccessToken();
      if (!t.ok) {
        alert(t.error || 'No se pudo iniciar sesión.');
        return;
      }
      const r = await fetch('/api/library/purge', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${t.token}` },
        body: JSON.stringify({ id: songId }),
      });
      const out = await r.json().catch(() => ({}));
      if (!r.ok) {
        alert(out?.error || 'No pude eliminar definitivamente.');
        return;
      }
      await refreshLibrary();
      if (activeSong?.id === songId) {
        setActiveSong(null);
        setIsPlaying(false);
        if (audioRef.current) audioRef.current.src = '';
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error eliminando definitivamente');
    }
  };

  const playSong = async (song: SongItem, opts?: { openMode?: 'normal' | 'elenco' | 'none' }) => {
    const openMode = opts?.openMode ?? 'normal';
    
    // #region debug-point P1: Log song playback attempt
    console.debug(`[DEBUG-P1] Attempting to play song:`, {
      songId: song.id,
      title: song.title,
      audioUrl: song.audioUrl,
      sunoTaskId: song.sunoTaskId,
      sunoAudioId: song.sunoAudioId,
      openMode
    });
    // #endregion
    
    if (activeSong?.id === song.id) {
      togglePlay();
      return;
    }
    setActiveSong(song);
    setIsPlaying(false);
    setPlayerTime(0);
    setPlayerDuration(0);
    
    let lastPlayError = '';

    const tryPlay = async (url: string) => {
      if (!audioRef.current) return false;
      const nextUrl = (url || '').toString().trim();
      if (!nextUrl) return false;
      
      // #region debug-point P2: Log URL validation attempt
      console.debug(`[DEBUG-P2] Trying to play URL:`, {
        url: nextUrl,
        isHttp: /^https?:\/\//i.test(nextUrl),
        isProxy: nextUrl.includes('/api/share/song/audio'),
        songId: song.id
      });
      // #endregion
      
      const a = audioRef.current;
      try {
        if (a.src === nextUrl) {
          try {
            a.currentTime = 0;
          } catch {}
        } else {
          a.src = '';
          a.src = nextUrl;
        }
        await a.play();
        setIsPlaying(true);
        if (openMode !== 'none') {
          setNowPlayingMode(openMode === 'elenco' ? 'elenco' : 'normal');
          setNowPlayingOpen(true);
        }
        
        // #region debug-point P3: Log successful playback
        console.debug(`[DEBUG-P3] Successfully started playback:`, {
          url: nextUrl,
          songId: song.id,
          duration: a.duration
        });
        // #endregion
        
        return true;
      } catch (e) {
        lastPlayError = e instanceof Error ? e.message : String(e);
        // #region debug-point P4: Log playback failure
        console.debug(`[DEBUG-P4] Playback failed:`, {
          url: nextUrl,
          songId: song.id,
          error: lastPlayError,
          errorType: e instanceof Error ? e.name : 'Unknown'
        });
        // #endregion
        return false;
      }
    };

    const directUrl = (song.audioUrl || '').toString().trim();
    const hasProviderIds = Boolean((song.sunoTaskId || '').toString().trim() || (song.sunoAudioId || '').toString().trim());
    const playCandidates: string[] = [];
    const addCandidate = (url: string) => {
      const clean = (url || '').toString().trim();
      if (!clean) return;
      if (playCandidates.includes(clean)) return;
      playCandidates.push(clean);
    };

    if (song?.id) {
      addCandidate(`/api/share/song/audio?id=${encodeURIComponent(String(song.id))}&t=${Date.now()}`);
    }
    if (/^https?:\/\//i.test(directUrl) || directUrl.startsWith('/')) {
      addCandidate(directUrl);
    }

    for (const candidate of playCandidates) {
      const ok = await tryPlay(candidate);
      if (ok) return;
    }

    if (song.sunoTaskId) {
      try {
        const t = await getAccessToken();
        if (t.ok) {
          const tr = await fetch(`/api/suno/task?kind=generate&taskId=${encodeURIComponent(song.sunoTaskId)}`, {
            headers: { authorization: `Bearer ${t.token}` },
          });
          const tout = await tr.json().catch(() => ({}));
          if (tr.ok) {
            const provider = tout?.data || {};
            const d = provider?.data || provider?.data?.data || provider;
            const candidates: any[] = [];
            if (Array.isArray(d?.response?.data)) candidates.push(d.response.data);
            if (Array.isArray(d?.response?.sunoData)) candidates.push(d.response.sunoData);
            if (Array.isArray(d?.response)) candidates.push(d.response);
            if (Array.isArray(d?.data)) candidates.push(d.data);
            if (Array.isArray(d?.data?.data)) candidates.push(d.data.data);
            const list = (candidates.find((x) => Array.isArray(x) && x.length) as any[]) || [];
            const cleanStr = (v: any) => (typeof v === 'string' ? v : v == null ? '' : String(v)).trim();
            const pickUrl = (track: any) => {
              const raw =
                track?.audio_url ||
                track?.audioUrl ||
                track?.streamAudioUrl ||
                track?.stream_audio_url ||
                track?.stream_url ||
                track?.url ||
                '';
              const s = cleanStr(raw);
              return /^https?:\/\//i.test(s) ? s : '';
            };
            const pickAudioId = (track: any) => cleanStr(track?.id || track?.audio_id || track?.audioId || track?.audioID || '');
            const pickCover = (track: any) =>
              cleanStr(
                track?.image_url ||
                  track?.imageUrl ||
                  track?.image_large_url ||
                  track?.imageLargeUrl ||
                  track?.cover_url ||
                  track?.coverUrl ||
                  track?.thumbnail_url ||
                  track?.thumbnailUrl ||
                  track?.metadata?.image_url ||
                  track?.metadata?.imageUrl ||
                  track?.metadata?.image_large_url ||
                  track?.metadata?.imageLargeUrl ||
                  track?.metadata?.cover_url ||
                  track?.metadata?.coverUrl ||
                  track?.metadata?.thumbnail_url ||
                  track?.metadata?.thumbnailUrl ||
                  track?.image?.url ||
                  track?.image?.src ||
                  track?.cover?.url ||
                  track?.cover?.src ||
                  ''
              );
            const pickLyrics = (track: any) => {
              const direct =
                (typeof track?.lyrics === 'string' ? track.lyrics : '') ||
                (typeof track?.lyric === 'string' ? track.lyric : '') ||
                (typeof track?.lyrics_text === 'string' ? track.lyrics_text : '') ||
                (typeof track?.lyricsText === 'string' ? track.lyricsText : '') ||
                (typeof track?.gpt_lyrics === 'string' ? track.gpt_lyrics : '') ||
                (typeof track?.gptLyrics === 'string' ? track.gptLyrics : '') ||
                (typeof track?.text === 'string' ? track.text : '') ||
                (typeof track?.prompt === 'string' ? track.prompt : '') ||
                (typeof track?.metadata?.lyrics === 'string' ? track.metadata.lyrics : '') ||
                (typeof track?.metadata?.lyric === 'string' ? track.metadata.lyric : '') ||
                (typeof track?.metadata?.text === 'string' ? track.metadata.text : '') ||
                (typeof track?.metadata?.prompt === 'string' ? track.metadata.prompt : '');
              return cleanStr(direct);
            };
            const tracks = (Array.isArray(list) ? list : [])
              .map((track: any) => ({ audioUrl: pickUrl(track), audioId: pickAudioId(track), coverUrl: pickCover(track), lyrics: pickLyrics(track) }))
              .filter((x) => x.audioUrl);
            if (tracks.length > 0) {
              const wantsB = /\sB$/i.test((song.title || '').toString().trim());
              const chosen = wantsB && tracks.length > 1 ? tracks[1] : tracks[0];
              try {
                const cover = (song.coverUrl || '').toString().trim();
                const nextCover = (chosen.coverUrl || '').toString().trim();
                if (!cover && nextCover) {
                  await fetch('/api/library/set-cover', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json', authorization: `Bearer ${t.token}` },
                    body: JSON.stringify({ id: song.id, fileUrl: nextCover, fileName: 'cover.jpg' }),
                  }).catch(() => null as any);
                  refreshLibrary().catch(() => {});
                }
              } catch {}
              try {
                const l = (song.lyrics || '').toString().trim();
                const nextL = (chosen.lyrics || '').toString().trim();
                if (!l && nextL) {
                  await fetch('/api/library/update-lyrics', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json', authorization: `Bearer ${t.token}` },
                    body: JSON.stringify({ id: song.id, lyrics: nextL }),
                  }).catch(() => null as any);
                  refreshLibrary().catch(() => {});
                }
              } catch {}

              const ok = await tryPlay(chosen.audioUrl);
              if (ok) {
                try {
                  await fetch('/api/library/update-audio', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json', authorization: `Bearer ${t.token}` },
                    body: JSON.stringify({
                      id: song.id,
                      audioUrl: chosen.audioUrl,
                      sunoTaskId: song.sunoTaskId,
                      sunoAudioId: chosen.audioId || song.sunoAudioId || null,
                    }),
                  }).catch(() => null as any);
                } catch {}
                return;
              }
            }
          }
        }
      } catch {}
    }

    if (lastPlayError) {
      alert(lastPlayError);
    } else {
      alert('No pude reproducir esta canción.');
    }
    if (audioRef.current) audioRef.current.src = '';
  };

  const togglePlay = () => {
    if (!audioRef.current || !activeSong) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const discoverDevices = async () => {
    setIsConnectingToDevice(true);
    try {
      if ('presentation' in navigator) {
        const PresentationRequestCtor = (window as any)?.PresentationRequest;
        if (!PresentationRequestCtor) {
          showToast('Tu navegador no soporta Presentation API');
          return;
        }
        const request = new PresentationRequestCtor('/elenco-presentation');
        const availability = await request.getAvailability();
        
        if (availability.value) {
          const receivers = await request.getAvailability();
          const devices = [];
          
          if (receivers && receivers.value) {
            devices.push({ id: 'default', name: 'Pantalla disponible' });
          }
          
          setAvailableDevices(devices);
          showToast('Dispositivos disponibles encontrados');
        } else {
          showToast('No hay dispositivos de presentación disponibles');
        }
      } else {
        showToast('Tu navegador no soporta conexión a dispositivos externos');
      }
    } catch (error) {
      showToast('Error al buscar dispositivos: ' + (error instanceof Error ? error.message : 'Desconocido'));
    } finally {
      setIsConnectingToDevice(false);
    }
  };

  const connectToDevice = async (deviceId: string) => {
    if (!activeSong) {
      showToast('No hay canción activa para conectar');
      return;
    }

    setIsConnectingToDevice(true);
    try {
      if ('presentation' in navigator) {
        const presentationUrl = `/elenco-presentation?songId=${encodeURIComponent(activeSong.id)}`;
        const PresentationRequestCtor = (window as any)?.PresentationRequest;
        if (!PresentationRequestCtor) {
          showToast('Tu navegador no soporta Presentation API');
          return;
        }
        const request = new PresentationRequestCtor(presentationUrl);
        
        const connection = await request.start();
        setPresentationConnection(connection);
        setSelectedDevice(deviceId);
        
        connection.addEventListener('connect', () => {
          showToast('Conectado al dispositivo externo');
          
          const songData = {
            id: activeSong.id,
            title: activeSong.title,
            coverUrl: activeSong.coverUrl,
            lyrics: activeSong.lyrics,
            audioUrl: activeSong.audioUrl,
            isPlaying: isPlaying,
            currentTime: playerTime,
            duration: playerDuration
          };
          
          connection.send(JSON.stringify({
            type: 'songData',
            data: songData
          }));
        });
        
        connection.addEventListener('close', () => {
          showToast('Conexión cerrada');
          setPresentationConnection(null);
          setSelectedDevice(null);
        });
        
        connection.addEventListener('terminate', () => {
          showToast('Conexión terminada');
          setPresentationConnection(null);
          setSelectedDevice(null);
        });
      } else {
        showToast('Tu navegador no soporta conexión a dispositivos externos');
      }
    } catch (error) {
      showToast('Error al conectar: ' + (error instanceof Error ? error.message : 'Desconocido'));
    } finally {
      setIsConnectingToDevice(false);
    }
  };

  const disconnectFromDevice = () => {
    if (presentationConnection) {
      presentationConnection.close();
      setPresentationConnection(null);
      setSelectedDevice(null);
      showToast('Desconectado del dispositivo');
    }
  };

  const updatePresentation = () => {
    if (!presentationConnection || !activeSong) return;
    
    const songData = {
      id: activeSong.id,
      title: activeSong.title,
      coverUrl: activeSong.coverUrl,
      lyrics: activeSong.lyrics,
      audioUrl: activeSong.audioUrl,
      isPlaying: isPlaying,
      currentTime: playerTime,
      duration: playerDuration
    };
    
    try {
      presentationConnection.send(JSON.stringify({
        type: 'songUpdate',
        data: songData
      }));
    } catch (error) {
    }
  };

  useEffect(() => {
    if (nowPlayingMode === 'elenco' && activeSong) {
      updatePresentation();
    }
  }, [isPlaying, playerTime, activeSong?.lyrics]);

  const parsedLyrics = useMemo(() => {
    const raw = (activeSong?.lyrics || '').toString();
    const lines = raw
      .split(/\r?\n/g)
      .map((x) => x.replace(/\s+/g, ' ').trim())
      .filter((x) => x.length > 0);
    const items = lines.map((text) => {
      const weight = Math.max(1, Math.min(180, text.replace(/[^\p{L}\p{N}\s]/gu, '').length || text.length));
      return { text, weight };
    });
    const total = items.reduce((acc, x) => acc + x.weight, 0);
    return { items, total, raw: raw.trim() };
  }, [activeSong?.id, (activeSong as any)?.lyrics]);

  const activeLyricIndex = useMemo(() => {
    const dur = Number.isFinite(Number(playerDuration)) ? Number(playerDuration) : 0;
    const t = Number.isFinite(Number(playerTime)) ? Number(playerTime) : 0;
    if (!dur || !parsedLyrics.items.length || !parsedLyrics.total) return -1;
    const pct = Math.max(0, Math.min(1, t / dur));
    const target = pct * parsedLyrics.total;
    let acc = 0;
    for (let i = 0; i < parsedLyrics.items.length; i++) {
      acc += parsedLyrics.items[i].weight;
      if (acc >= target) return i;
    }
    return parsedLyrics.items.length - 1;
  }, [playerTime, playerDuration, parsedLyrics.items, parsedLyrics.total]);

  useEffect(() => {
    if (!nowPlayingOpen) return;
    if (activeLyricIndex < 0) return;
    if (lastActiveLyricRef.current === activeLyricIndex) return;
    lastActiveLyricRef.current = activeLyricIndex;
    const el = lyricLineRefs.current[activeLyricIndex];
    if (!el) return;
    try {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch {
    }
  }, [nowPlayingOpen, activeLyricIndex]);

  useEffect(() => {
    if (!activeSong) return;
    const next = canciones.find((s) => s.id === activeSong.id);
    if (!next) return;
    const a = (activeSong as any) || {};
    const b = (next as any) || {};
    if (a?.lyrics !== b?.lyrics || a?.coverUrl !== b?.coverUrl || a?.title !== b?.title || a?.audioUrl !== b?.audioUrl) {
      setActiveSong(next);
    }
  }, [canciones, activeSong?.id]);

  const displayCredits = credits;

  // #region debug-point app-render
  console.log('[DEBUG] App rendering...');
  console.log('[DEBUG] isAuthed:', isAuthed);
  console.log('[DEBUG] isAuthBooting:', isAuthBooting);
  console.log('[DEBUG] shareRouteId:', shareRouteId);
  console.log('[DEBUG] profileRouteId:', profileRouteId);
  console.log('[DEBUG] currentTab:', currentTab);
  // #endregion

  if (typeof window !== 'undefined') {
    const p = window.location.pathname.toLowerCase();
    if (p === '/auth/chatgpt' || p.startsWith('/auth/chatgpt/')) {
      return <ChatgptAuthScreen />;
    }
    if (
      p === '/subir' ||
      p.startsWith('/subir/') ||
      p === '/upload' ||
      p.startsWith('/upload/')
    ) {
      return <SubirGptScreen />;
    }
  }

  if (shareRouteId) {
    return <SharedSongPage shareId={shareRouteId} />;
  }
  if (previewRouteId) {
    return <SharedPreviewPage shareId={previewRouteId} />;
  }
  if (profileRouteId) {
    return <SharedProfilePage profileId={profileRouteId} />;
  }
  if (elencoPresentationRoute) {
    return <ElencoPresentationView />;
  }

  if (!isAuthed) {
    const showLoading = isAuthBooting || isStartingLogin;
    return (
      <div className="h-[100dvh] w-full text-white flex flex-col items-center justify-center px-6 text-center bg-gradient-to-b from-[#0b1224] via-[#070a12] to-black/80">
        <div className="w-16 h-16 rounded-2xl bg-yellow-400 text-black flex items-center justify-center font-light text-4xl shadow-[0_0_18px_rgba(250,204,21,0.35)]">
          L
        </div>
        <div className="mt-4 text-xl font-extrabold">LucIAna</div>
        {showLoading ? (
          <div className="mt-2 text-sm text-slate-300">Cargando…</div>
        ) : (
          <>
            <div className="mt-2 text-sm text-slate-300">Para usar la app necesitas entrar con tu cuenta Gmail.</div>
            <button
              onClick={() => {
                if (isStartingLogin) return;
                setIsStartingLogin(true);
                signInWithGoogle()
                  .then((r) => {
                    if (!r.ok) {
                      alert(r.error);
                      setIsStartingLogin(false);
                    }
                  })
                  .catch(() => {
                    alert('No pude iniciar sesión con Google.');
                    setIsStartingLogin(false);
                  });
              }}
              disabled={isStartingLogin || !supabaseBrowser}
              className="mt-6 bg-white text-black px-6 py-3 rounded-full font-extrabold text-sm disabled:opacity-70"
            >
              Entrar con Google
            </button>
          </>
        )}
        {!supabaseBrowser && <div className="mt-3 text-xs text-red-200">Falta configurar SUPABASE_URL y SUPABASE_ANON_KEY en Vercel (y redeploy).</div>}
      </div>
    );
  }

  return (
    <div ref={appRootRef} className="h-[100dvh] w-full text-white flex flex-col font-sans overflow-hidden relative">
      {updateAvailable && !(typeof window !== 'undefined' && isLocalNetworkHost(window.location.hostname)) ? (
        <div className="absolute inset-0 z-[999] bg-black/80 backdrop-blur-sm flex items-center justify-center p-5">
          <div className="w-full max-w-[520px] bg-[#0b0f16] border border-white/10 rounded-3xl p-6 shadow-[0_0_60px_rgba(0,0,0,0.6)]">
            <div className="text-white font-extrabold text-lg">Actualización disponible</div>
            <div className="mt-2 text-sm text-slate-300">
              {updateNote || 'Para evitar pantalla negra, actualiza la app ahora.'}
            </div>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setUpdateNote('Actualizando…');
                  window.setTimeout(() => {
                    try {
                      window.location.reload();
                    } catch {}
                  }, 5000);
                  hardRefreshNow(updateVersion || latestVersionRef.current || null).catch(() => {});
                }}
                className="flex-1 h-[44px] rounded-full font-extrabold text-sm bg-gradient-to-r from-cyan-500 to-indigo-500 shadow-[0_10px_30px_rgba(56,189,248,0.35)]"
                style={{ color: '#ffffff', WebkitTextFillColor: '#ffffff' }}
                aria-label="Actualizar aplicación"
              >
                <span className="inline-block text-white" style={{ color: '#ffffff', WebkitTextFillColor: '#ffffff' }}>
                  ACTUALIZAR
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setUpdateAvailable(false);
                  setUpdateNote('');
                }}
                className="flex-1 bg-white/5 border border-white/10 text-white h-[44px] rounded-full font-extrabold text-sm"
              >
                Más tarde
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {showIosHelp ? (
        <div className="absolute inset-0 z-[999] bg-black/80 backdrop-blur-sm flex items-center justify-center p-5">
          <div className="w-full max-w-[520px] bg-[#0b0f16] border border-white/10 rounded-3xl p-6 shadow-[0_0_60px_rgba(0,0,0,0.6)]">
            <div className="text-white font-extrabold text-lg">Instalar LucIAna</div>
            <div className="mt-2 text-sm text-slate-300">
              En iPhone/iPad no sale el botón automático. Instálala así:
              <div className="mt-3 space-y-2 text-slate-200">
                <div>1) Abre esta página en Safari.</div>
                <div>2) Toca “Compartir” (cuadro con flecha).</div>
                <div>3) Toca “Agregar a pantalla de inicio”.</div>
              </div>
              <div className="mt-4 text-[12px] text-slate-400">
                Si estás dentro de WhatsApp/Facebook/Instagram, primero toca “Abrir en navegador”.
              </div>
            </div>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setShowIosHelp(false)}
                className="flex-1 bg-white text-black h-[44px] rounded-full font-extrabold text-sm"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {activeAlert ? (
        <div className="absolute inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-center justify-center p-5">
          <div className={`w-full max-w-[520px] bg-[#0b0f16] border border-white/10 rounded-3xl p-6 ${alertMeta.ring}`}>
            <div className="flex items-start gap-4">
              <div className={`w-12 h-12 rounded-2xl border flex items-center justify-center shrink-0 ${alertMeta.iconBg}`}>
                <alertMeta.Icon className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-white font-extrabold text-lg">{alertTitle}</div>
                <div className="mt-2 text-sm text-slate-200 whitespace-pre-wrap break-words max-h-[46vh] overflow-auto pr-1">
                  {activeAlertText}
                </div>
              </div>
              <button
                type="button"
                onClick={closeStyledAlert}
                className="shrink-0 w-9 h-9 rounded-full bg-white/5 border border-white/10 text-slate-200 flex items-center justify-center"
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>
            <div className="mt-5 flex flex-col gap-3">
              {Array.isArray(activeAlert?.actions) && activeAlert.actions.length > 0 ? (
                <div className="flex flex-col sm:flex-row gap-3">
                  {activeAlert.actions.map((action) => {
                    const kind = action?.kind || 'primary';
                    const base =
                      kind === 'cancel'
                        ? 'bg-white/5 border border-white/10 text-white'
                        : kind === 'danger'
                          ? 'bg-gradient-to-r from-red-500 to-fuchsia-500 text-white'
                          : alertMeta.button;
                    const onPress = () => {
                      const fn = action?.id ? alertActionHandlersRef.current[action.id] : null;
                      closeStyledAlert();
                      try {
                        if (fn) fn();
                      } catch {
                      }
                    };
                    return (
                      <button
                        key={action.id}
                        type="button"
                        onClick={onPress}
                        className={`flex-1 h-[44px] rounded-full font-extrabold text-sm ${base}`}
                      >
                        {action.label}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={closeStyledAlert}
                  className={`w-full h-[44px] rounded-full font-extrabold text-sm ${alertMeta.button}`}
                >
                  Cerrar
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}
      <TopBar
        className="flex-shrink-0"
        onMenuClick={() => setIsSettingsOpen(true)}
        onCreditsClick={() => handleTabChange('planes')}
        credits={displayCredits}
        bankCredits={internalCredits}
        showBank={false}
        hideMenu
      />
      {pullDistance > 0 || isPullRefreshing ? (
        <div className="md:hidden absolute left-0 right-0 top-14 z-[60] flex justify-center pointer-events-none">
          <div className="bg-black/40 border border-white/10 backdrop-blur-xl rounded-full px-4 py-2 text-[11px] font-extrabold text-slate-100">
            {isPullRefreshing ? 'Actualizando…' : pullDistance >= 70 ? 'Suelta para actualizar' : 'Desliza para actualizar'}
          </div>
        </div>
      ) : null}
      {showInstallBanner && (
        <div className="md:hidden px-3 pt-3">
          <div className="bg-gradient-to-r from-yellow-500/25 to-yellow-400/10 border border-yellow-400/20 rounded-2xl px-3 py-3 flex items-center gap-3">
            <button
              onClick={() => setShowInstallBanner(false)}
              className="shrink-0 w-8 h-8 rounded-full bg-black/30 border border-white/10 text-slate-200 flex items-center justify-center"
              aria-label="Cerrar"
            >
              ✕
            </button>
            <div className="shrink-0 w-11 h-11 rounded-xl bg-yellow-400 border border-yellow-300/40 flex items-center justify-center font-light text-3xl text-black shadow-[0_0_18px_rgba(250,204,21,0.35)]">
              L
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-white leading-tight">LucIAna</div>
              <div className="text-xs text-slate-200/90 leading-tight">Descarga tu App en tu Celular</div>
            </div>
            <button
              onClick={onInstallClick}
              className="shrink-0 bg-white text-black px-4 py-2 rounded-full text-xs font-extrabold"
            >
              {installPromptEvent ? 'INSTALAR' : 'CÓMO INSTALAR'}
            </button>
          </div>
        </div>
      )}
      <main className="flex-1 min-h-0 overflow-hidden flex w-full h-full relative">
        {/* Mobile View Switching */}
        <div className={`${currentTab === 'landing' ? 'home-mobile-layout' : 'flex md:hidden'} flex-1 flex-col pb-[76px] relative overflow-hidden`}>
           {currentTab === 'landing' && (
             <HomeLandingView onGoStudio={() => setCurrentTab('studio')} onOpenPlans={() => setIsPricingOpen(true)} />
           )}
           {currentTab === 'inicio' && (
             isAuthed ? (
                <InicioSocial onPlaySong={playSong} onGoStudio={() => setCurrentTab('studio')} isAdmin={isAdmin} />
             ) : (
               <InicioLanding
                 email={authEmail}
                 onGoStudio={() => setCurrentTab('studio')}
                 onGoLibrary={() => setCurrentTab('biblioteca')}
                 onOpenPlans={() => {
                   setIsPricingOpen(true);
                 }}
               />
             )
           )}
           {currentTab === 'studio' && (
             <div className="flex-1 min-h-0">
              <ApprovedCreatePreview
                 credits={displayCredits}
                 onSongCreated={addCancion}
                 onGoLibrary={() => setCurrentTab('biblioteca')}
                 onGoCloneVoice={() => setCurrentTab('voces')}
                 onOpenBalance={() => handleTabChange('planes')}
                onShowAlert={showStyledAlert}
                authUserId={authUserId}
                 prefill={studioPrefill || undefined}
                 prefillNonce={studioPrefillNonce}
               />
             </div>
           )}
           {currentTab === 'voces' && (
            <ApprovedCloneVoicePreview onClose={() => setCurrentTab('studio')} />
           )}
           {currentTab === 'karaoke' && (
             <div className="flex-1 flex items-center justify-center px-6">
               <div className="w-full max-w-[520px] bg-gradient-to-r from-indigo-500/10 via-white/5 to-fuchsia-500/10 border border-white/10 rounded-3xl p-6 text-center">
                 <div className="text-white font-extrabold">Video Karaoke</div>
                 <div className="mt-2 text-sm text-slate-300">Próximamente</div>
               </div>
             </div>
           )}
           {currentTab === 'luciana' && <LucianaBotView />}
           {currentTab === 'masterizar' && <MasterizarView />}
          {currentTab === 'vendedor' && <VendorView />}
          {currentTab === 'oficina' && (isAdmin ? (
            <SettingsView pageMode initialOffice onClose={() => setCurrentTab('landing')} onOpenPricing={() => openPricingModal()} onOpenUpdates={() => openUpdates()} />
          ) : (
            <div className="flex-1 grid place-items-center p-6 text-center"><div><Shield className="mx-auto h-10 w-10 text-violet-400" /><div className="mt-3 font-extrabold text-white">Área privada</div><div className="mt-1 text-sm text-slate-400">Oficina está disponible únicamente para la cuenta administradora.</div></div></div>
          ))}
          {currentTab === 'biblioteca' && (
            <ViewErrorBoundary title="Biblioteca">
              <LibraryView canciones={canciones} cancionesEliminadas={cancionesEliminadas} vibes={vibes} onAddVibe={addVibe} onPlaySong={playSong} onToast={showToast} onOpenElenco={(s) => playSong(s, { openMode: 'elenco' })} onDeleteSong={deleteCancion} onRestoreSong={restoreCancion} onPurgeSong={purgeCancion} onRefreshSongs={refreshLibrary} activeSongId={activeSong?.id} isPlaying={isPlaying} onStartCover={startCoverFromSong} />
            </ViewErrorBoundary>
          )}
          {currentTab === 'perfil' && <ProfileView onGoStudio={() => setCurrentTab('studio')} songs={canciones} onPlaySong={playSong} onRefreshSongs={refreshLibrary} />}
          {currentTab === 'planes' && (
            <PricingView
              pageMode
              onClose={() => {
                setCurrentTab('studio');
              }}
            />
          )}
           
           {/* Placeholders */}
           {currentTab === 'mv' && (
             <div className="flex-1 flex items-center justify-center px-6">
               <div className="w-full max-w-[520px] bg-gradient-to-r from-indigo-500/10 via-white/5 to-fuchsia-500/10 border border-white/10 rounded-3xl p-6 text-center">
                 <div className="text-white font-extrabold">Music Videos</div>
                 <div className="mt-2 text-sm text-slate-300">Próximamente</div>
               </div>
             </div>
           )}
        </div>
        {/* Desktop 3-column layout */}
        <div className={`${currentTab === 'landing' ? 'home-desktop-layout' : 'hidden md:flex'} flex-1 min-h-0 overflow-hidden`}>
           {/* Sidebar */}
           <div className="w-[200px] lg:w-[240px] shrink-0 border-r border-white/10 bg-gradient-to-b from-[#0b1224]/70 via-[#070a12]/60 to-black/40 backdrop-blur-2xl flex flex-col">
             <Sidebar currentTab={currentTab} onChange={handleTabChange} isAdmin={isAdmin} />
           </div>

            {currentTab === 'landing' ? (
              <div className="flex-1 min-w-0 min-h-0 overflow-hidden flex flex-col bg-gradient-to-b from-indigo-950/25 via-black/10 to-black/30">
                <HomeLandingView onGoStudio={() => setCurrentTab('studio')} onOpenPlans={() => setIsPricingOpen(true)} />
             </div>
            ) : currentTab === 'inicio' ? (
             <div className="flex-1 bg-gradient-to-b from-indigo-950/25 via-black/10 to-black/30">
               {isAuthed ? (
                 <InicioSocial onPlaySong={playSong} onGoStudio={() => setCurrentTab('studio')} isAdmin={isAdmin} />
               ) : (
                 <InicioLanding
                   email={authEmail}
                   onGoStudio={() => setCurrentTab('studio')}
                   onGoLibrary={() => setCurrentTab('biblioteca')}
                   onOpenPlans={() => {
                     setIsPricingOpen(true);
                   }}
                 />
               )}
             </div>
           ) : currentTab === 'studio' ? (
             <div className="flex-1 min-w-0 bg-[#07111d]">
              <ApprovedCreatePreview
                 credits={displayCredits}
                 onSongCreated={addCancion}
                 onGoLibrary={() => setCurrentTab('biblioteca')}
                 onGoCloneVoice={() => setCurrentTab('voces')}
                 onOpenBalance={() => handleTabChange('planes')}
                onShowAlert={showStyledAlert}
                authUserId={authUserId}
                 prefill={studioPrefill || undefined}
                 prefillNonce={studioPrefillNonce}
               />
             </div>
           ) : (
             <>
               {/* Create View (Middle) */}
              {currentTab !== 'karaoke' && currentTab !== 'voces' && currentTab !== 'masterizar' && currentTab !== 'vendedor' && currentTab !== 'oficina' && currentTab !== 'biblioteca' && currentTab !== 'perfil' && currentTab !== 'planes' && currentTab !== 'luciana' && (
                 <div className="w-[340px] lg:w-[420px] shrink-0 border-r border-white/10 bg-gradient-to-b from-indigo-950/25 via-black/10 to-black/30 backdrop-blur-xl flex flex-col relative z-0 shadow-[10px_0_30px_-10px_rgba(0,0,0,0.5)]">
                   <CreateView onSongCreated={addCancion} credits={displayCredits} openPersonaPickerSignal={personaPickerNonce} onOpenCreateVoiceFullScreen={() => setCurrentTab('voces')} onGoLibrary={() => setCurrentTab('biblioteca')} onOpenBalance={() => handleTabChange('planes')} prefill={studioPrefill || undefined} prefillNonce={studioPrefillNonce} />
                 </div>
               )}

               {/* Library / Results View (Right) */}
               <div className={cn(
                 "flex-1 min-h-0 flex flex-col bg-gradient-to-b from-indigo-950/20 via-black/10 to-black/30 relative z-10 w-full min-w-[300px]",
                 currentTab === 'biblioteca' ? "overflow-y-auto" : ""
               )}>
                {currentTab === 'voces' ? (
                 <ApprovedCloneVoicePreview onClose={() => setCurrentTab('studio')} />
                ) : currentTab === 'perfil' ? (
                  <ProfileView onGoStudio={() => setCurrentTab('studio')} songs={canciones} onPlaySong={playSong} onRefreshSongs={refreshLibrary} />
              ) : currentTab === 'karaoke' ? (
                 <div className="flex-1 flex items-center justify-center px-6">
                   <div className="w-full max-w-[520px] bg-gradient-to-r from-indigo-500/10 via-white/5 to-fuchsia-500/10 border border-white/10 rounded-3xl p-6 text-center">
                     <div className="text-white font-extrabold">Video Karaoke</div>
                     <div className="mt-2 text-sm text-slate-300">Próximamente</div>
                   </div>
                 </div>
                ) : currentTab === 'luciana' ? (
                <LucianaBotView />
               ) : currentTab === 'masterizar' ? (
                 <MasterizarView />
               ) : currentTab === 'vendedor' ? (
                 <VendorView />
              ) : currentTab === 'oficina' ? (
                isAdmin ? (
                  <SettingsView pageMode initialOffice onClose={() => setCurrentTab('landing')} onOpenPricing={() => openPricingModal()} onOpenUpdates={() => openUpdates()} />
                ) : (
                  <div className="flex-1 grid place-items-center p-6 text-center"><div><Shield className="mx-auto h-10 w-10 text-violet-400" /><div className="mt-3 font-extrabold text-white">Área privada</div><div className="mt-1 text-sm text-slate-400">Oficina está disponible únicamente para la cuenta administradora.</div></div></div>
                )
              ) : currentTab === 'planes' ? (
                <PricingView
                  pageMode
                  onClose={() => {
                    setCurrentTab('studio');
                  }}
                />
                ) : (
                  <ViewErrorBoundary title="Biblioteca">
                    <LibraryView
                      canciones={canciones}
                      cancionesEliminadas={cancionesEliminadas}
                      vibes={vibes}
                      onAddVibe={addVibe}
                      onPlaySong={playSong}
                      onToast={showToast}
                      onOpenElenco={(s) => playSong(s, { openMode: 'elenco' })}
                      onDeleteSong={deleteCancion}
                      onRestoreSong={restoreCancion}
                      onPurgeSong={purgeCancion}
                      onRefreshSongs={refreshLibrary}
                      activeSongId={activeSong?.id}
                      isPlaying={isPlaying}
                      onStartCover={startCoverFromSong}
                    />
                  </ViewErrorBoundary>
                )}
               </div>
             </>
           )}
        </div>
      </main>

      {nowPlayingOpen && activeSong ? (
        <div className="fixed inset-0 z-[270] bg-black/80">
          <div className="absolute inset-0 overflow-hidden">
            {(() => {
              const cover = toProxyMediaUrl((activeSong.coverUrl || '').toString().trim());
              if (cover) {
                return <img src={cover} alt="" className="w-full h-full object-cover scale-110 blur-2xl opacity-60" />;
              }
              return <div className="w-full h-full bg-gradient-to-b from-indigo-900/40 via-black/70 to-black" />;
            })()}
            <div className="absolute inset-0 bg-black/55" />
          </div>

          <div className="relative h-[100dvh] flex flex-col">
            {nowPlayingMode === 'elenco' ? (
              <div className="absolute right-4 top-1/2 -translate-y-1/2 z-[2] flex flex-col items-center gap-5">
                <button
                  type="button"
                  onClick={() => showToast('Comentarios: próximamente')}
                  className="flex flex-col items-center gap-1 text-white/90"
                >
                  <div className="w-12 h-12 rounded-full bg-black/35 border border-white/10 backdrop-blur-md flex items-center justify-center">
                    <MessageCircle className="w-5 h-5" />
                  </div>
                  <div className="text-[10px] font-semibold">Comentario</div>
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const id = (activeSong?.id || '').toString().trim();
                    if (!id) return;
                    const shareUrl = `https://lucianamusic.app/share/${encodeURIComponent(id)}`;
                    try {
                      if (navigator.share) {
                        await navigator.share({ title: `LucIAna | Music - ${(activeSong.title || 'Canción').toString()}`, url: shareUrl });
                        return;
                      }
                    } catch {
                    }
                    const ok = await copyToClipboard(shareUrl);
                    showToast(ok ? 'Link copiado.' : shareUrl);
                  }}
                  className="flex flex-col items-center gap-1 text-white/90"
                >
                  <div className="w-12 h-12 rounded-full bg-black/35 border border-white/10 backdrop-blur-md flex items-center justify-center">
                    <Share2 className="w-5 h-5" />
                  </div>
                  <div className="text-[10px] font-semibold">Compartir</div>
                </button>
                <button
                  type="button"
                  onClick={() => setIsElencoMenuOpen(true)}
                  className="flex flex-col items-center gap-1 text-white/90"
                >
                  <div className="w-12 h-12 rounded-full bg-black/35 border border-white/10 backdrop-blur-md flex items-center justify-center">
                    <MoreVertical className="w-5 h-5" />
                  </div>
                  <div className="text-[10px] font-semibold">Opciones</div>
                </button>
              </div>
            ) : null}
            <div className="p-4 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setNowPlayingOpen(false)}
                className="w-11 h-11 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-200 hover:bg-white/10 transition-colors shrink-0"
                aria-label="Cerrar"
                title="Cerrar"
              >
                <ChevronDown className="w-6 h-6" />
              </button>

              <div className="min-w-0 flex-1 text-center">
                <div className="text-white font-extrabold truncate">{(activeSong.title || 'Canción').toString()}</div>
                <div className="text-[11px] text-slate-300 truncate">{((activeSong as any)?.authorName || 'LucIAna').toString()}</div>
              </div>

              <button
                type="button"
                onClick={() => setNowPlayingMode((m) => (m === 'elenco' ? 'normal' : 'elenco'))}
                className={cn(
                  'w-11 h-11 rounded-full border flex items-center justify-center transition-colors shrink-0',
                  nowPlayingMode === 'elenco'
                    ? 'bg-amber-500/20 border-amber-500/30 text-amber-200 hover:bg-amber-500/25'
                    : 'bg-white/5 border-white/10 text-slate-200 hover:bg-white/10',
                )}
                aria-label="Elenco"
                title="Elenco"
              >
                <Cast className="w-6 h-6" />
              </button>
            </div>

            <div ref={lyricsWrapRef} className={cn('flex-1 overflow-y-auto overscroll-contain px-6 pb-8', nowPlayingMode === 'elenco' ? 'pt-2' : 'pt-4')}>
              {parsedLyrics.raw ? (
                <div className={cn('space-y-3', nowPlayingMode === 'elenco' ? 'pb-10' : '')}>
                  {parsedLyrics.items.map((line, idx) => {
                    const isActive = idx === activeLyricIndex;
                    return (
                      <div
                        key={`${idx}-${line.text}`}
                        ref={(el) => {
                          lyricLineRefs.current[idx] = el;
                        }}
                        className={cn(
                          'text-[22px] leading-snug font-extrabold transition-all select-none',
                          isActive ? 'text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.6)]' : 'text-white/55',
                        )}
                      >
                        {line.text}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-slate-200 font-semibold">
                  Esta canción todavía no tiene letra guardada.
                  <div className="mt-2 text-sm text-slate-400">Entra a los 3 puntitos de la canción y guarda la letra en “Letra”.</div>
                </div>
              )}
            </div>

            <div className="px-5 pb-6 pt-2">
              <div className="bg-black/30 border border-white/10 rounded-2xl p-4 backdrop-blur-xl">
                <div className="flex items-center justify-between gap-4">
                  <button
                    type="button"
                    onClick={togglePlay}
                    className="w-12 h-12 rounded-full bg-white text-black flex items-center justify-center shadow-lg active:scale-95 transition-transform shrink-0"
                    aria-label={isPlaying ? 'Pausar' : 'Reproducir'}
                    title={isPlaying ? 'Pausar' : 'Reproducir'}
                  >
                    {isPlaying ? <Pause className="w-6 h-6 fill-black" strokeWidth={1} /> : <Play className="w-6 h-6 fill-black ml-0.5" strokeWidth={1} />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <input
                      type="range"
                      min={0}
                      max={Number.isFinite(Number(playerDuration)) ? Number(playerDuration) : 0}
                      step={0.1}
                      value={
                        Number.isFinite(Number(playerDuration)) && Number(playerDuration) > 0
                          ? Math.min(Number.isFinite(Number(playerTime)) ? Number(playerTime) : 0, Number(playerDuration))
                          : 0
                      }
                      disabled={!Number.isFinite(Number(playerDuration)) || Number(playerDuration) <= 0}
                      onChange={(e) => {
                        const a = audioRef.current;
                        if (!a) return;
                        const dur = Number.isFinite(Number(a.duration)) ? Number(a.duration) : 0;
                        const next = Math.max(0, Math.min(Number(e.target.value), dur));
                        try {
                          a.currentTime = next;
                        } catch {
                        }
                        setPlayerTime(next);
                      }}
                      className="w-full accent-yellow-400 disabled:opacity-40"
                    />
                    <div className="mt-1 flex justify-between text-[11px] text-slate-300 tabular-nums">
                      <span>
                        {(() => {
                          const s = Math.max(0, Math.floor(Number.isFinite(Number(playerTime)) ? Number(playerTime) : 0));
                          const m = Math.floor(s / 60);
                          const r = s % 60;
                          return `${m}:${String(r).padStart(2, '0')}`;
                        })()}
                      </span>
                      <span>
                        {(() => {
                          const s = Math.max(0, Math.floor(Number.isFinite(Number(playerDuration)) ? Number(playerDuration) : 0));
                          const m = Math.floor(s / 60);
                          const r = s % 60;
                          return `${m}:${String(r).padStart(2, '0')}`;
                        })()}
                      </span>
                    </div>
                    {nowPlayingMode === 'elenco' ? (
                      <div className="mt-1 text-[10px] text-slate-400">
                        Elenco: pensado para ponerlo en pantalla y que la gente lea la letra mientras suena.
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {isElencoMenuOpen && activeSong ? (
        <div className="fixed inset-0 z-[280] bg-black/70 flex items-end md:items-center justify-center">
          <button className="absolute inset-0 w-full h-full" onClick={() => setIsElencoMenuOpen(false)} aria-label="Cerrar" />
          <div className="relative w-full md:max-w-[520px] bg-[#0b0f16] border border-white/10 rounded-t-3xl md:rounded-3xl overflow-hidden shadow-[0_-20px_60px_rgba(0,0,0,0.6)]">
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <div className="text-white font-extrabold truncate">Opciones</div>
              <button
                onClick={() => setIsElencoMenuOpen(false)}
                className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-200"
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>
            <div className="p-4 space-y-2">
              <button
                type="button"
                className="w-full bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 text-sm font-extrabold px-4 py-3 rounded-2xl text-left"
                onClick={() => {
                  setIsElencoMenuOpen(false);
                  setLyricsDraft((activeSong.lyrics || '').toString());
                  setIsLyricsEditorOpen(true);
                }}
              >
                Letra (ver/editar)
              </button>
              
              {presentationConnection ? (
                <button
                  type="button"
                  className="w-full bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-200 text-sm font-extrabold px-4 py-3 rounded-2xl text-left"
                  onClick={() => {
                    setIsElencoMenuOpen(false);
                    disconnectFromDevice();
                  }}
                  disabled={isConnectingToDevice}
                >
                  {isConnectingToDevice ? 'Desconectando...' : 'Desconectar dispositivo'}
                </button>
              ) : (
                <button
                  type="button"
                  className="w-full bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 text-emerald-200 text-sm font-extrabold px-4 py-3 rounded-2xl text-left"
                  onClick={() => {
                    setIsElencoMenuOpen(false);
                    discoverDevices();
                  }}
                  disabled={isConnectingToDevice}
                >
                  {isConnectingToDevice ? 'Buscando dispositivos...' : 'Conectar a dispositivo externo'}
                </button>
              )}
              
              {availableDevices.length > 0 && !presentationConnection && (
                <div className="space-y-2">
                  <div className="text-xs text-slate-400 font-semibold px-2">Dispositivos disponibles:</div>
                  {availableDevices.map((device) => (
                    <button
                      key={device.id}
                      type="button"
                      className="w-full bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 text-blue-200 text-sm font-extrabold px-4 py-3 rounded-2xl text-left"
                      onClick={() => {
                        setIsElencoMenuOpen(false);
                        connectToDevice(device.id);
                      }}
                      disabled={isConnectingToDevice}
                    >
                      {device.name}
                    </button>
                  ))}
                </div>
              )}
              
              <button
                type="button"
                className="w-full bg-transparent border border-white/10 text-slate-300 text-sm font-extrabold px-4 py-3 rounded-2xl text-left"
                onClick={() => setIsElencoMenuOpen(false)}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isLyricsEditorOpen && activeSong ? (
        <div className="fixed inset-0 z-[285] bg-black/70 flex items-end md:items-center justify-center">
          <button className="absolute inset-0 w-full h-full" onClick={() => setIsLyricsEditorOpen(false)} aria-label="Cerrar" />
          <div className="relative w-full md:max-w-[720px] bg-[#0b0f16] border border-white/10 rounded-t-3xl md:rounded-3xl overflow-hidden shadow-[0_-20px_60px_rgba(0,0,0,0.6)] max-h-[92vh] flex flex-col">
            <div className="p-4 border-b border-white/10 flex items-center justify-between shrink-0">
              <div className="text-white font-extrabold truncate">Letra</div>
              <button
                onClick={() => setIsLyricsEditorOpen(false)}
                className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-200"
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>
            <div className="p-4 space-y-3 flex-1 overflow-y-auto">
              <textarea
                value={lyricsDraft}
                onChange={(e) => setLyricsDraft(e.target.value)}
                placeholder="Pega o escribe aquí la letra para guardarla en tu Biblioteca"
                className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-[15px] text-slate-100 placeholder:text-slate-500 outline-none min-h-[50vh] resize-none"
              />
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setIsLyricsEditorOpen(false)}
                  className="w-full bg-white/5 hover:bg-white/10 border border-white/10 rounded-full h-[46px] text-slate-200 font-extrabold"
                  disabled={isLyricsSaving}
                >
                  Cerrar
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (isLyricsSaving) return;
                    const id = String(activeSong.id || '').trim();
                    const text = String(lyricsDraft || '').trim();
                    if (!text) {
                      showToast('Escribe la letra antes de guardar.');
                      return;
                    }
                    setIsLyricsSaving(true);
                    try {
                      const t = await getAccessToken();
                      if (!t.ok) {
                        showToast(t.error || 'No se pudo iniciar sesión.');
                        return;
                      }
                      const r = await fetch('/api/library/update-lyrics', {
                        method: 'POST',
                        headers: { 'content-type': 'application/json', authorization: `Bearer ${t.token}` },
                        body: JSON.stringify({ id, lyrics: text }),
                      });
                      const out = await r.json().catch(() => ({}));
                      if (!r.ok || out?.ok === false) {
                        showToast((out?.error || out?.detail || 'No pude guardar la letra.').toString());
                        return;
                      }
                      await refreshLibrary();
                      showToast('Listo. Letra guardada.');
                      setIsLyricsEditorOpen(false);
                    } finally {
                      setIsLyricsSaving(false);
                    }
                  }}
                  className="w-full bg-emerald-500 hover:bg-emerald-400 rounded-full h-[46px] text-black font-extrabold"
                  disabled={isLyricsSaving}
                >
                  {isLyricsSaving ? 'Guardando…' : 'Guardar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <MiniPlayer 
        song={activeSong} 
        isPlaying={isPlaying} 
        onPlayPause={togglePlay}
        onClose={() => {
          setActiveSong(null);
          setIsPlaying(false);
          setPlayerTime(0);
          setPlayerDuration(0);
          if (audioRef.current) {
            try {
              audioRef.current.pause();
            } catch {}
            audioRef.current.src = '';
          }
        }}
        placement={currentTab === 'studio' ? 'aboveCreate' : 'default'}
        currentTime={playerTime}
        duration={playerDuration}
        onSeek={(t) => {
          if (!audioRef.current) return;
          const next = Math.max(0, Math.min(Number.isFinite(t) ? t : 0, Number.isFinite(audioRef.current.duration) ? audioRef.current.duration : 0));
          audioRef.current.currentTime = next;
          setPlayerTime(next);
        }}
      />
      {isUpdatesOpen && (
        <div className="fixed inset-0 z-[275] bg-black/70 flex items-end md:items-center justify-center">
          <button className="absolute inset-0 w-full h-full" onClick={() => setIsUpdatesOpen(false)} aria-label="Cerrar" />
          <div className="relative w-full md:max-w-[720px] bg-[#0b0f16] border border-white/10 rounded-t-3xl md:rounded-3xl overflow-hidden shadow-[0_-20px_60px_rgba(0,0,0,0.6)] max-h-[92vh] flex flex-col">
            <div className="p-4 border-b border-white/10 flex items-center justify-between shrink-0">
              <div className="text-white font-extrabold">Actualizaciones</div>
              <button
                onClick={() => setIsUpdatesOpen(false)}
                className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-200"
              >
                ✕
              </button>
            </div>
            <div className="p-5 flex-1 overflow-y-auto">
              {updatesSorted.length === 0 ? (
                <div className="text-slate-400 text-sm">Aún no hay actualizaciones.</div>
              ) : (
                <div className="space-y-3">
                  {updatesSorted.map((u) => {
                    const d = new Date(`${u.date}T00:00:00`);
                    const ds = Number.isNaN(d.getTime()) ? u.date : d.toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: '2-digit' });
                    return (
                      <div key={`${u.date}::${u.title}`} className="bg-white/5 border border-white/10 rounded-2xl p-4">
                        <div className="text-[11px] text-slate-400 font-semibold">{ds}</div>
                        <div className="mt-1 text-white font-extrabold">{u.title}</div>
                        <div className="mt-2 text-sm text-slate-200 whitespace-pre-wrap">{u.detail}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {toast && (
        <div className="fixed left-0 right-0 bottom-[92px] md:bottom-6 z-[260] flex justify-center px-4 pointer-events-none">
          <div className="pointer-events-auto max-w-[520px] w-full bg-[#0b0f16] border border-white/10 rounded-2xl px-4 py-3 text-sm text-slate-100 shadow-[0_20px_60px_rgba(0,0,0,0.55)]">
            {toast}
          </div>
        </div>
      )}
      <div className="md:hidden">
        <BottomNav currentTab={currentTab} onChange={handleTabChange} isAdmin={isAdmin} />
      </div>
      
      <audio 
        ref={audioRef} 
        onEnded={() => setIsPlaying(false)} 
        onPause={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
        onTimeUpdate={() => {
          const a = audioRef.current;
          if (!a) return;
          const t = Number(a.currentTime);
          if (Number.isFinite(t)) setPlayerTime(t);
        }}
        onLoadedMetadata={() => {
          const a = audioRef.current;
          if (!a) return;
          const d = Number(a.duration);
          if (Number.isFinite(d)) setPlayerDuration(d);
        }}
        onDurationChange={() => {
          const a = audioRef.current;
          if (!a) return;
          const d = Number(a.duration);
          if (Number.isFinite(d)) setPlayerDuration(d);
        }}
        className="hidden"
      />

      {isSettingsOpen && <SettingsView onClose={() => setIsSettingsOpen(false)} onOpenPricing={() => openPricingModal()} onOpenUpdates={() => openUpdates()} />}
      {isPricingOpen && (
        <PricingView
          onClose={() => {
            closePricingModal();
          }}
        />
      )}
      {isBalanceOpen && (
        <div className="fixed inset-0 z-[280] bg-black/70 flex items-end md:items-center justify-center">
          <button className="absolute inset-0 w-full h-full" onClick={() => setIsBalanceOpen(false)} aria-label="Cerrar" />
          <div className="relative w-full md:max-w-[620px] bg-[#0b0f16] border border-white/10 rounded-t-3xl md:rounded-3xl overflow-hidden shadow-[0_-20px_60px_rgba(0,0,0,0.6)] max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-white/10 shrink-0">
              <div className="text-white font-extrabold">Saldo</div>
              <button
                onClick={() => setIsBalanceOpen(false)}
                className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-200"
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>
            <div className="p-5 flex-1 overflow-y-auto overscroll-contain pb-[calc(env(safe-area-inset-bottom)+24px)]">
              <div className="rounded-2xl border border-amber-400/20 bg-gradient-to-r from-amber-500/15 via-yellow-500/10 to-orange-500/15 p-4 shadow-[0_12px_40px_rgba(245,158,11,0.12)]">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-white font-extrabold text-base">Obtener créditos</div>
                    <div className="mt-1 text-xs text-amber-100/80">
                      Recarga ahora para seguir creando, descargando y usando todas las herramientas.
                    </div>
                    <div className="mt-2 text-[11px] text-slate-300">
                      Saldo actual: {Number(balanceData?.credits ?? displayCredits ?? 0).toString()} créditos
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setIsBalanceOpen(false);
                      openPricingModal();
                    }}
                    className="shrink-0 rounded-full bg-gradient-to-r from-yellow-300 via-amber-300 to-orange-300 px-5 py-3 text-sm font-extrabold text-black shadow-[0_10px_30px_rgba(251,191,36,0.35)] transition-transform hover:scale-[1.03]"
                  >
                    Obtener créditos
                  </button>
                </div>
              </div>
              <div className="mt-1 text-[11px] text-slate-500">
                Fuente: {(balanceData?.source || '—').toString()}
                {balanceData?.provider_error ? ` · Proveedor: ${(balanceData?.provider_error || '').toString()}` : ''}
              </div>
              {balanceData?.is_admin ? (
                <div className="mt-2 bg-black/20 border border-white/10 rounded-xl px-3 py-2">
                  <div className="text-[10px] text-slate-400 font-semibold">Proveedor (Suno)</div>
                  <div className="text-xs text-white font-extrabold">{balanceData?.provider_credits == null ? '—' : Number(balanceData?.provider_credits ?? 0).toString()}</div>
                </div>
              ) : null}
              <div className="mt-2 text-xs text-slate-500">Se descuenta automáticamente según la acción.</div>
              {balanceError && (
                <div className="mt-3 bg-red-500/10 border border-red-500/20 rounded-2xl p-3 text-sm text-red-200">
                  {balanceError}
                </div>
              )}
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="bg-gradient-to-br from-emerald-500/15 to-transparent border border-emerald-400/15 rounded-2xl p-4">
                  <div className="text-slate-200 text-sm font-semibold">Canciones (A/B)</div>
                  <div className="text-white text-3xl font-extrabold mt-1">{Number(balanceData?.counts?.songs ?? 0)}</div>
                  <div className="mt-1 text-xs text-slate-300/80">{CREDIT_COSTS.generate_music} cr c/u • 2 versiones</div>
                </div>
                <div className="bg-gradient-to-br from-rose-500/15 to-transparent border border-rose-400/15 rounded-2xl p-4">
                  <div className="text-slate-200 text-sm font-semibold">Quitar voz</div>
                  <div className="text-white text-3xl font-extrabold mt-1">{Number(balanceData?.counts?.voice_separate ?? 0)}</div>
                  <div className="mt-1 text-xs text-slate-300/80">{CREDIT_COSTS.separate_vocal} cr c/u</div>
                </div>
                <div className="bg-gradient-to-br from-cyan-500/15 to-transparent border border-cyan-400/15 rounded-2xl p-4">
                  <div className="text-slate-200 text-sm font-semibold">Videos</div>
                  <div className="text-white text-3xl font-extrabold mt-1">{Number(balanceData?.counts?.music_video ?? 0)}</div>
                  <div className="mt-1 text-xs text-slate-300/80">{CREDIT_COSTS.music_video} cr c/u</div>
                </div>
                <div className="bg-gradient-to-br from-violet-500/15 to-transparent border border-violet-400/15 rounded-2xl p-4">
                  <div className="text-slate-200 text-sm font-semibold">STEMS</div>
                  <div className="text-white text-3xl font-extrabold mt-1">{Number(balanceData?.counts?.split_stem ?? 0)}</div>
                  <div className="mt-1 text-xs text-slate-300/80">{CREDIT_COSTS.split_stem} cr c/u</div>
                </div>
              </div>
              <div className="mt-3 bg-white/5 border border-white/10 rounded-2xl p-4">
                <div className="text-slate-200 text-sm font-extrabold">Más acciones</div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {(() => {
                    const counts = balanceData?.counts || {};
                    const items: Array<{ k: string; label: string; cost: number }> = [
                      { k: 'sounds', label: 'Sounds', cost: CREDIT_COSTS.sounds },
                      { k: 'replace_section', label: 'Reemplazar sección', cost: CREDIT_COSTS.replace_section },
                      { k: 'wav', label: 'Convertir a WAV', cost: CREDIT_COSTS.wav },
                      { k: 'timestamped_lyrics', label: 'Letra con tiempo', cost: CREDIT_COSTS.timestamped_lyrics },
                      { k: 'boost_style', label: 'Boost estilo', cost: CREDIT_COSTS.boost_style },
                    ];
                    return items.map((it) => (
                      <div key={it.k} className="flex items-center justify-between bg-black/20 border border-white/10 rounded-xl px-3 py-2">
                        <div className="text-xs text-slate-200 font-semibold">{it.label}</div>
                        <div className="text-xs text-white font-extrabold">
                          {Number((counts as any)?.[it.k] ?? 0)} <span className="text-slate-400 font-semibold">· {it.cost} cr</span>
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              </div>
              <div className="mt-4 text-slate-400 text-sm">Se descuenta al usar cada opción.</div>
              <button
                onClick={() => refreshBalance().catch(() => {})}
                disabled={isBalanceLoading}
                className="mt-4 w-full bg-white/5 border border-white/10 rounded-full py-3 text-slate-200 font-semibold hover:bg-white/10 transition-colors disabled:opacity-60"
              >
                {isBalanceLoading ? 'Actualizando…' : 'Actualizar saldo'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function formatSharedClock(totalSeconds: number) {
  const safe = Math.max(0, Math.floor(Number.isFinite(totalSeconds) ? totalSeconds : 0));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function formatSharedDate(iso?: string | null) {
  const raw = String(iso || '').trim();
  if (!raw) return 'Sin fecha';
  const dt = new Date(raw);
  if (Number.isNaN(dt.getTime())) return 'Sin fecha';
  try {
    return new Intl.DateTimeFormat('es-MX', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(dt);
  } catch {
    return raw;
  }
}

function getCountdownParts(expiresAt?: string | null) {
  const raw = String(expiresAt || '').trim();
  if (!raw) return { days: '00', hours: '00', minutes: '00', seconds: '00', expired: false };
  const end = new Date(raw).getTime();
  if (!Number.isFinite(end)) return { days: '00', hours: '00', minutes: '00', seconds: '00', expired: false };
  const diffMs = Math.max(0, end - Date.now());
  const totalSec = Math.floor(diffMs / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  return {
    days: String(days).padStart(2, '0'),
    hours: String(hours).padStart(2, '0'),
    minutes: String(minutes).padStart(2, '0'),
    seconds: String(seconds).padStart(2, '0'),
    expired: diffMs <= 0,
  };
}

function buildWhatsAppHref(phone?: string | null, songTitle?: string) {
  const digits = String(phone || '').replace(/\D+/g, '');
  if (!digits) return '';
  const text = encodeURIComponent(`Hola, escuché el preview de "${String(songTitle || 'tu canción')}" y quiero más información.`);
  return `https://wa.me/${digits}?text=${text}`;
}

function SharedSongPage({ shareId }: { shareId: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState<{
    id: string;
    title: string;
    audioUrl: string;
    coverUrl?: string;
    description?: string;
    lyrics?: string;
    genre?: string;
    model?: string;
    createdAt?: string | null;
    isPublic?: boolean;
    sellerName?: string;
    sellerPhone?: string;
  } | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playerTime, setPlayerTime] = useState(0);
  const [playerDuration, setPlayerDuration] = useState(0);
  const [toast, setToast] = useState('');
  const toastTimerRef = useRef<number | null>(null);
  const [shareSheetUrl, setShareSheetUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(''), 2600);
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
    }
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', 'true');
      ta.style.position = 'fixed';
      ta.style.top = '0';
      ta.style.left = '0';
      ta.style.opacity = '0';
      try { document.body.appendChild(ta); } catch {}
      ta.focus();
      ta.select();
      const ok = document.execCommand('copy');
      try { if (ta.parentNode) ta.parentNode.removeChild(ta); } catch {}
      return ok;
    } catch {
      return false;
    }
  };

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    setData(null);
    fetch(`/api/share/song?id=${encodeURIComponent(shareId)}`, { method: 'GET' })
      .then((r) => r.json().catch(() => ({})).then((out) => ({ r, out })))
      .then(({ r, out }) => {
        if (!alive) return;
        if (!r.ok) {
          setError((out?.error || 'Este link no existe o ya no está disponible.').toString());
          return;
        }
        const title = String(out?.title || 'Canción');
        const audioUrl = String(out?.audioUrl || out?.audio_url || '').trim();
        const coverUrl = String(out?.coverUrl || out?.cover_url || '').trim();
        if (!audioUrl) {
          setError('Este link no tiene audio para reproducir.');
          return;
        }
        const id = String(out?.id || shareId);
        setData({
          id,
          title,
          audioUrl: `/api/share/song/audio?id=${encodeURIComponent(id)}`,
          coverUrl: coverUrl || undefined,
          description: String(out?.description || '').trim() || undefined,
          lyrics: String(out?.lyrics || '').trim() || undefined,
          genre: String(out?.genre || '').trim() || undefined,
          model: String(out?.model || '').trim() || undefined,
          createdAt: out?.createdAt || null,
          isPublic: Boolean(out?.isPublic),
          sellerName: String(out?.sellerName || '').trim() || undefined,
          sellerPhone: String(out?.sellerPhone || '').trim() || undefined,
        });
      })
      .catch(() => {
        if (!alive) return;
        setError('No pude cargar la canción.');
      })
      .finally(() => {
        if (!alive) return;
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [shareId]);

  useEffect(() => {
    setIsPlaying(false);
    setPlayerTime(0);
    setPlayerDuration(0);
    const a = audioRef.current;
    if (!a) return;
    try {
      a.pause();
    } catch {
    }
    a.src = '';
  }, [data?.audioUrl]);

  const togglePlay = async () => {
    const a = audioRef.current;
    if (!a || !data?.audioUrl) return;
    try {
      const nextSrc = new URL(data.audioUrl, window.location.origin).toString();
      if (a.src !== nextSrc) {
        a.src = '';
        a.src = nextSrc;
      }
      if (isPlaying) {
        a.pause();
        setIsPlaying(false);
        return;
      }
      await a.play();
      setIsPlaying(true);
    } catch {
      try {
        const bust = `${data.audioUrl}${data.audioUrl.includes('?') ? '&' : '?'}t=${Date.now()}`;
        a.src = '';
        a.src = new URL(bust, window.location.origin).toString();
        await a.play();
        setIsPlaying(true);
      } catch {
      }
    }
  };

  const shareThis = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: data?.title ? `LucIAna | Music - ${data.title}` : 'LucIAna | Music', url });
        return;
      }
    } catch {
    }
    const ok = await copyToClipboard(url);
    if (ok) {
      showToast('Link copiado.');
      return;
    }
    setShareSheetUrl(url);
  };

  const whatsappHref = buildWhatsAppHref(data?.sellerPhone, data?.title);
  const infoRows = data ? [
    { label: 'Duración', value: playerDuration > 0 ? formatSharedClock(playerDuration) : 'Cargando...' },
    { label: 'Fecha', value: formatSharedDate(data.createdAt) },
    { label: 'Modelo', value: data.model || 'No especificado' },
    { label: 'Visibilidad', value: data.isPublic ? 'Pública' : 'Privada' },
  ] : [];

  return (
    <div className="min-h-[100dvh] bg-[radial-gradient(circle_at_top,rgba(91,33,182,0.25),transparent_38%),linear-gradient(180deg,#05070f_0%,#04060b_100%)] text-white">
      <div className="sticky top-0 z-20 border-b border-white/10 bg-black/45 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1220px] items-center justify-between gap-3 px-4 py-4">
          <a href="/" className="flex min-w-0 items-center gap-3">
            <img src="/assets/luciana-music-logo.jpeg" alt="Logo de LucIAna Music" className="h-11 w-11 rounded-2xl object-cover shadow-[0_0_18px_rgba(250,204,21,0.25)]" />
            <div className="min-w-0">
              <div className="truncate text-base font-extrabold">LucIAna Music</div>
              <div className="truncate text-[11px] uppercase tracking-[0.28em] text-slate-500">Preview protegido</div>
            </div>
          </a>
          <div className="flex items-center gap-2">
            <button onClick={() => shareThis().catch(() => {})} className="flex h-11 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 text-sm font-extrabold text-slate-100 hover:bg-white/10">
              <Share2 className="h-4 w-4" /> Compartir
            </button>
            <a href="/" className="hidden h-11 items-center justify-center rounded-full bg-white px-4 text-sm font-extrabold text-black md:flex">Abrir app</a>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1220px] px-4 py-6 md:py-8">
        {loading ? (
          <div className="rounded-[32px] border border-white/10 bg-white/[0.03] p-8 text-slate-300">Cargando preview...</div>
        ) : error ? (
          <div className="rounded-[32px] border border-red-500/20 bg-red-500/10 p-8">
            <div className="text-2xl font-extrabold">No se pudo abrir</div>
            <div className="mt-2 text-slate-200">{error}</div>
            <button onClick={() => window.location.reload()} className="mt-5 h-11 rounded-full border border-white/10 bg-white/5 px-5 text-sm font-extrabold text-white">
              Reintentar
            </button>
          </div>
        ) : data ? (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_360px]">
            <div className="rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(13,18,32,0.96),rgba(6,8,15,0.98))] p-5 md:p-6 shadow-[0_30px_90px_rgba(0,0,0,0.45)]">
              <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
                <div className="space-y-4">
                  <div className="aspect-square overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.04]">
                    {data.coverUrl ? (
                      <img src={data.coverUrl} alt={data.title} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-slate-500">Sin portada</div>
                    )}
                  </div>
                  <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
                    <div className="text-[11px] uppercase tracking-[0.28em] text-slate-500">LucIAna Music</div>
                    <div className="mt-2 text-sm text-slate-300">Esta canción está protegida.</div>
                    <div className="mt-1 text-sm text-slate-400">No es posible descargarla desde este enlace.</div>
                  </div>
                </div>

                <div className="min-w-0">
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full border border-fuchsia-500/30 bg-fuchsia-500/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.24em] text-fuchsia-100">Preview público</span>
                    {data.genre ? <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold text-slate-200">{data.genre}</span> : null}
                    {data.model ? <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold text-slate-200">{data.model}</span> : null}
                  </div>

                  <div className="mt-4 text-3xl font-black leading-tight md:text-5xl">{data.title}</div>
                  <div className="mt-3 text-sm text-slate-400">
                    {data.sellerName ? `Compartido por ${data.sellerName}` : 'Disponible para escuchar en LucIAna Music'}
                  </div>

                  <div className="mt-6 rounded-[28px] border border-white/10 bg-white/[0.03] p-4 md:p-5">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                      <button onClick={() => togglePlay().catch(() => {})} className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-r from-fuchsia-500 to-violet-500 text-white shadow-[0_12px_30px_rgba(139,92,246,0.35)]">
                        {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="ml-0.5 h-6 w-6" />}
                      </button>
                      <div className="flex-1">
                        <div className="mb-2 flex items-center justify-between text-xs text-slate-400">
                          <span>{formatSharedClock(playerTime)}</span>
                          <span>{playerDuration > 0 ? formatSharedClock(playerDuration) : '--:--'}</span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={Math.max(playerDuration, 1)}
                          value={Math.min(playerTime, Math.max(playerDuration, 1))}
                          onChange={(e) => {
                            const a = audioRef.current;
                            const next = Number(e.target.value);
                            if (!a || !Number.isFinite(next)) return;
                            try {
                              a.currentTime = next;
                            } catch {
                            }
                            setPlayerTime(next);
                          }}
                          className="h-2 w-full cursor-pointer accent-fuchsia-500"
                        />
                      </div>
                    </div>
                  </div>

                  {data.description ? (
                    <div className="mt-5 rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
                      <div className="text-[11px] uppercase tracking-[0.28em] text-slate-500">Información básica</div>
                      <div className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-200">{data.description}</div>
                    </div>
                  ) : null}

                  <div className="mt-5 rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
                    <div className="flex items-start gap-3">
                      <Shield className="mt-0.5 h-5 w-5 text-violet-300" />
                      <div>
                        <div className="font-extrabold text-white">Solo escucha</div>
                        <div className="mt-1 text-sm leading-6 text-slate-300">
                          Este preview es únicamente para escuchar la canción. No ofrece descarga directa del archivo.
                        </div>
                      </div>
                    </div>
                  </div>

                  {whatsappHref ? (
                    <div className="mt-5 rounded-[24px] border border-emerald-500/20 bg-emerald-500/10 p-4">
                      <div className="text-sm font-bold text-emerald-100">¿Te gustó esta canción?</div>
                      <a href={whatsappHref} target="_blank" rel="noreferrer" className="mt-3 inline-flex h-12 items-center justify-center gap-2 rounded-full bg-emerald-500 px-5 text-sm font-extrabold text-black">
                        <MessageCircle className="h-4 w-4" />
                        Contactar por WhatsApp
                      </a>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-4">
                <div className="text-[11px] uppercase tracking-[0.28em] text-slate-500">Detalles</div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  {infoRows.map((item) => (
                    <div key={item.label} className="rounded-[22px] border border-white/10 bg-black/20 p-4">
                      <div className="text-[10px] uppercase tracking-[0.24em] text-slate-500">{item.label}</div>
                      <div className="mt-2 text-sm font-bold text-white">{item.value}</div>
                    </div>
                  ))}
                </div>
              </div>

              {data.lyrics ? (
                <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.28em] text-slate-500">
                    <Info className="h-4 w-4" />
                    Información adicional
                  </div>
                  <div className="mt-3 line-clamp-6 whitespace-pre-wrap text-sm leading-6 text-slate-300">{data.lyrics}</div>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      <audio
        ref={audioRef}
        preload="metadata"
        onEnded={() => setIsPlaying(false)}
        onPause={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
        onError={() => setIsPlaying(false)}
        onTimeUpdate={() => {
          const a = audioRef.current;
          if (!a) return;
          const t = Number(a.currentTime);
          if (Number.isFinite(t)) setPlayerTime(t);
        }}
        onLoadedMetadata={() => {
          const a = audioRef.current;
          if (!a) return;
          const d = Number(a.duration);
          if (Number.isFinite(d)) setPlayerDuration(d);
        }}
        onDurationChange={() => {
          const a = audioRef.current;
          if (!a) return;
          const d = Number(a.duration);
          if (Number.isFinite(d)) setPlayerDuration(d);
        }}
        className="hidden"
      />

      {toast ? (
        <div className="fixed bottom-6 left-0 right-0 z-[320] flex justify-center px-4 pointer-events-none">
          <div className="rounded-full border border-white/10 bg-black/80 px-4 py-2 text-sm font-semibold text-slate-100 backdrop-blur-md">
            {toast}
          </div>
        </div>
      ) : null}

      {shareSheetUrl ? (
        <div className="fixed inset-0 z-[350] flex items-end justify-center bg-black/80 backdrop-blur-sm md:items-center">
          <button className="absolute inset-0 h-full w-full" onClick={() => setShareSheetUrl(null)} aria-label="Cerrar" />
          <div className="relative w-full overflow-hidden rounded-t-3xl border border-white/10 bg-[#0a0a0a] md:max-w-[520px] md:rounded-3xl">
            <div className="flex items-center justify-between border-b border-white/10 p-4">
              <div className="text-white font-extrabold truncate">Compartir</div>
              <button onClick={() => setShareSheetUrl(null)} className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-200">✕</button>
            </div>
            <div className="space-y-3 p-4">
              <div className="text-sm text-slate-300">Copia este link:</div>
              <div className="break-words rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-slate-100">{shareSheetUrl}</div>
              <button
                className="flex h-[46px] w-full items-center justify-center gap-2 rounded-full bg-white text-sm font-extrabold text-black"
                onClick={async () => {
                  const ok = await copyToClipboard(shareSheetUrl);
                  if (ok) {
                    setShareSheetUrl(null);
                    showToast('Link copiado.');
                  } else {
                    showToast('No pude copiar. Mantén presionado el link para copiarlo.');
                  }
                }}
              >
                <Copy className="h-4 w-4" />
                Copiar enlace
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SharedPreviewPage({ shareId }: { shareId: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState<{
    id: string;
    songId: string;
    title: string;
    audioUrl: string;
    coverUrl?: string;
    hasCountdown: boolean;
    expiresAt?: string | null;
    isPaid: boolean;
    clientLabel?: string;
    description?: string;
    lyrics?: string;
    genre?: string;
    model?: string;
    songCreatedAt?: string | null;
    isPublic?: boolean;
    sellerName?: string;
    sellerPhone?: string;
  } | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playerTime, setPlayerTime] = useState(0);
  const [playerDuration, setPlayerDuration] = useState(0);
  const [toast, setToast] = useState('');
  const [shareSheetUrl, setShareSheetUrl] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [, setTick] = useState(0);

  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(''), 2600);
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
    }
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', 'true');
      ta.style.position = 'fixed';
      ta.style.top = '0';
      ta.style.left = '0';
      ta.style.opacity = '0';
      try { document.body.appendChild(ta); } catch {}
      ta.focus();
      ta.select();
      const ok = document.execCommand('copy');
      try { if (ta.parentNode) ta.parentNode.removeChild(ta); } catch {}
      return ok;
    } catch {
      return false;
    }
  };

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    setData(null);
    fetch(`/api/share/preview?id=${encodeURIComponent(shareId)}`, { method: 'GET' })
      .then((r) => r.json().catch(() => ({})).then((out) => ({ r, out })))
      .then(({ r, out }) => {
        if (!alive) return;
        if (!r.ok) {
          setError((out?.error || 'Este preview no existe o ya no está disponible.').toString());
          return;
        }
        const songId = String(out?.songId || '').trim();
        if (!songId) {
          setError('Este preview no tiene canción para reproducir.');
          return;
        }
        setData({
          id: String(out?.id || shareId),
          songId,
          title: String(out?.title || 'Canción'),
          audioUrl: String(out?.audioUrl || `/api/share/song/audio?id=${encodeURIComponent(songId)}`),
          coverUrl: String(out?.coverUrl || '').trim() || undefined,
          hasCountdown: Boolean(out?.hasCountdown),
          expiresAt: out?.expiresAt || null,
          isPaid: Boolean(out?.isPaid),
          clientLabel: String(out?.clientLabel || '').trim() || undefined,
          description: String(out?.description || '').trim() || undefined,
          lyrics: String(out?.lyrics || '').trim() || undefined,
          genre: String(out?.genre || '').trim() || undefined,
          model: String(out?.model || '').trim() || undefined,
          songCreatedAt: out?.songCreatedAt || null,
          isPublic: Boolean(out?.isPublic),
          sellerName: String(out?.sellerName || '').trim() || undefined,
          sellerPhone: String(out?.sellerPhone || '').trim() || undefined,
        });
      })
      .catch(() => {
        if (!alive) return;
        setError('No pude cargar el preview.');
      })
      .finally(() => {
        if (!alive) return;
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [shareId]);

  useEffect(() => {
    if (!data?.hasCountdown || data?.isPaid) return;
    const timer = window.setInterval(() => setTick((v) => v + 1), 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, [data?.hasCountdown, data?.isPaid]);

  useEffect(() => {
    if (!shareId) return;
    const channel = supabaseBrowser
      ?.channel(`preview_shares:${shareId}`)
      ?.on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'preview_shares',
          filter: `id=eq.${shareId}`,
        },
        (payload) => {
          const newIsPaid = Boolean((payload.new as any)?.is_paid);
          if (newIsPaid) {
            setData((prev) => prev ? { ...prev, isPaid: true } : prev);
          }
        }
      )
      ?.subscribe();
    return () => {
      channel?.unsubscribe();
    };
  }, [shareId]);

  const expiredByTime = (() => {
    if (!data?.hasCountdown || data?.isPaid || !data?.expiresAt) return false;
    const end = new Date(data.expiresAt).getTime();
    if (!Number.isFinite(end)) return false;
    return Date.now() >= end;
  })();
  const isLocked = Boolean(data && !data.isPaid && expiredByTime);

  useEffect(() => {
    if (!isLocked) return;
    const a = audioRef.current;
    if (!a) return;
    try {
      a.pause();
    } catch {
    }
    setIsPlaying(false);
  }, [isLocked]);

  useEffect(() => {
    setIsPlaying(false);
    setPlayerTime(0);
    setPlayerDuration(0);
    const a = audioRef.current;
    if (!a) return;
    try {
      a.pause();
    } catch {
    }
    a.src = '';
  }, [data?.audioUrl]);

  const togglePlay = async () => {
    const a = audioRef.current;
    if (!a || !data?.audioUrl) return;
    if (isLocked) {
      showToast('Este enlace ya no está disponible. Contacta a tu vendedor para continuar.');
      return;
    }
    try {
      const nextSrc = new URL(data.audioUrl, window.location.origin).toString();
      if (a.src !== nextSrc) {
        a.src = '';
        a.src = nextSrc;
      }
      if (isPlaying) {
        a.pause();
        setIsPlaying(false);
        return;
      }
      await a.play();
      setIsPlaying(true);
    } catch {
      try {
        const bust = `${data.audioUrl}${data.audioUrl.includes('?') ? '&' : '?'}t=${Date.now()}`;
        a.src = '';
        a.src = new URL(bust, window.location.origin).toString();
        await a.play();
        setIsPlaying(true);
      } catch {
      }
    }
  };

  const shareThis = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: data?.title ? `LucIAna | Music - ${data.title}` : 'LucIAna | Music', url });
        return;
      }
    } catch {
    }
    const ok = await copyToClipboard(url);
    if (ok) {
      showToast('Link copiado.');
      return;
    }
    setShareSheetUrl(url);
  };

  const countdown = getCountdownParts(data?.expiresAt);
  const whatsappHref = buildWhatsAppHref(data?.sellerPhone, data?.title);
  const infoRows = data ? [
    { label: 'Duración', value: playerDuration > 0 ? formatSharedClock(playerDuration) : 'Cargando...' },
    { label: 'Fecha', value: formatSharedDate(data.songCreatedAt) },
    { label: 'Modelo', value: data.model || 'No especificado' },
    { label: 'Visibilidad', value: data.isPublic ? 'Pública' : 'Privada' },
  ] : [];

  return (
    <div className="min-h-[100dvh] bg-[radial-gradient(circle_at_top,rgba(91,33,182,0.28),transparent_36%),linear-gradient(180deg,#05070f_0%,#04060b_100%)] text-white">
      <div className="sticky top-0 z-20 border-b border-white/10 bg-black/45 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1220px] items-center justify-between gap-3 px-4 py-4">
          <a href="/" className="flex min-w-0 items-center gap-3">
            <img src="/assets/luciana-music-logo.jpeg" alt="Logo de LucIAna Music" className="h-11 w-11 rounded-2xl object-cover shadow-[0_0_18px_rgba(250,204,21,0.25)]" />
            <div className="min-w-0">
              <div className="truncate text-base font-extrabold">LucIAna Music</div>
              <div className="truncate text-[11px] uppercase tracking-[0.28em] text-slate-500">Preview para cliente</div>
            </div>
          </a>
          <div className="flex items-center gap-2">
            <button onClick={() => shareThis().catch(() => {})} className="flex h-11 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 text-sm font-extrabold text-slate-100 hover:bg-white/10">
              <Share2 className="h-4 w-4" /> Compartir
            </button>
            <a href="/" className="hidden h-11 items-center justify-center rounded-full bg-white px-4 text-sm font-extrabold text-black md:flex">Abrir app</a>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1220px] px-4 py-6 md:py-8">
        {loading ? (
          <div className="rounded-[32px] border border-white/10 bg-white/[0.03] p-8 text-slate-300">Cargando preview...</div>
        ) : error ? (
          <div className="rounded-[32px] border border-red-500/20 bg-red-500/10 p-8">
            <div className="text-2xl font-extrabold">No se pudo abrir</div>
            <div className="mt-2 text-slate-200">{error}</div>
          </div>
        ) : data ? (
          <>
            {data.hasCountdown ? (
              <div className={cn(
                "mb-6 overflow-hidden rounded-[32px] border p-5 md:p-6 shadow-[0_24px_80px_rgba(0,0,0,0.4)]",
                isLocked ? "border-red-500/20 bg-red-500/10" : "border-fuchsia-500/20 bg-[linear-gradient(180deg,rgba(109,40,217,0.18),rgba(8,8,16,0.7))]"
              )}>
                <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                  <div>
                    <div className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.24em] text-slate-100 inline-flex items-center gap-2">
                      {isLocked ? <AlertTriangle className="h-3.5 w-3.5" /> : <BadgeCheck className="h-3.5 w-3.5" />}
                      {isLocked ? 'Enlace expirado' : data.isPaid ? 'Acceso autorizado' : 'Cuenta regresiva activa'}
                    </div>
                    <div className="mt-3 text-lg font-extrabold md:text-2xl">
                      {isLocked ? 'Este enlace ya no está disponible.' : 'Este enlace es temporal.'}
                    </div>
                    <div className="mt-2 max-w-2xl text-sm leading-6 text-slate-200/90">
                      {isLocked
                        ? 'Contacta a tu vendedor para continuar.'
                        : 'Escucha el preview mientras el enlace siga activo. Cuando el temporizador termine, dejará de reproducirse.'}
                    </div>
                  </div>
                  {!isLocked ? (
                    <div className="grid grid-cols-4 gap-2 md:gap-3">
                      {[
                        { label: 'Días', value: countdown.days },
                        { label: 'Horas', value: countdown.hours },
                        { label: 'Minutos', value: countdown.minutes },
                        { label: 'Segundos', value: countdown.seconds },
                      ].map((item) => (
                        <div key={item.label} className="min-w-[72px] rounded-[22px] border border-white/10 bg-black/25 px-3 py-3 text-center">
                          <div className="text-2xl font-black">{item.value}</div>
                          <div className="mt-1 text-[10px] uppercase tracking-[0.24em] text-slate-400">{item.label}</div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_360px]">
              <div className="rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(13,18,32,0.96),rgba(6,8,15,0.98))] p-5 md:p-6 shadow-[0_30px_90px_rgba(0,0,0,0.45)]">
                <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
                  <div className="space-y-4">
                    <div className="aspect-square overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.04]">
                      {data.coverUrl ? (
                        <img src={data.coverUrl} alt={data.title} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-slate-500">Sin portada</div>
                      )}
                    </div>
                    <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
                      <div className="text-[11px] uppercase tracking-[0.28em] text-slate-500">Protección</div>
                      <div className="mt-2 text-sm text-slate-300">Esta canción está protegida.</div>
                      <div className="mt-1 text-sm text-slate-400">No es posible descargarla desde este enlace.</div>
                    </div>
                  </div>

                  <div className="min-w-0">
                    <div className="flex flex-wrap gap-2">
                      {data.clientLabel ? <span className="rounded-full border border-fuchsia-500/30 bg-fuchsia-500/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.24em] text-fuchsia-100">{data.clientLabel}</span> : null}
                      {data.genre ? <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold text-slate-200">{data.genre}</span> : null}
                      {data.model ? <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold text-slate-200">{data.model}</span> : null}
                    </div>

                    <div className="mt-4 text-3xl font-black leading-tight md:text-5xl">{data.title}</div>
                    <div className="mt-3 text-sm text-slate-400">
                      {data.sellerName ? `Preview enviado por ${data.sellerName}` : 'Preview para cliente de LucIAna Music'}
                    </div>

                    <div className="mt-6 rounded-[28px] border border-white/10 bg-white/[0.03] p-4 md:p-5">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                        <button
                          onClick={() => togglePlay().catch(() => {})}
                          disabled={isLocked}
                          className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-r from-fuchsia-500 to-violet-500 text-white shadow-[0_12px_30px_rgba(139,92,246,0.35)] disabled:opacity-50"
                        >
                          {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="ml-0.5 h-6 w-6" />}
                        </button>
                        <div className="flex-1">
                          <div className="mb-2 flex items-center justify-between text-xs text-slate-400">
                            <span>{formatSharedClock(playerTime)}</span>
                            <span>{playerDuration > 0 ? formatSharedClock(playerDuration) : '--:--'}</span>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={Math.max(playerDuration, 1)}
                            value={Math.min(playerTime, Math.max(playerDuration, 1))}
                            onChange={(e) => {
                              if (isLocked) return;
                              const a = audioRef.current;
                              const next = Number(e.target.value);
                              if (!a || !Number.isFinite(next)) return;
                              try {
                                a.currentTime = next;
                              } catch {
                              }
                              setPlayerTime(next);
                            }}
                            disabled={isLocked}
                            className="h-2 w-full cursor-pointer accent-fuchsia-500 disabled:cursor-not-allowed disabled:opacity-50"
                          />
                        </div>
                      </div>
                      {isLocked ? (
                        <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                          Este enlace ya no está disponible. Contacta a tu vendedor para continuar.
                        </div>
                      ) : null}
                    </div>

                    {data.description ? (
                      <div className="mt-5 rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
                        <div className="text-[11px] uppercase tracking-[0.28em] text-slate-500">Información básica</div>
                        <div className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-200">{data.description}</div>
                      </div>
                    ) : null}

                    <div className="mt-5 rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
                      <div className="flex items-start gap-3">
                        <Shield className="mt-0.5 h-5 w-5 text-violet-300" />
                        <div>
                          <div className="font-extrabold text-white">Solo escucha</div>
                          <div className="mt-1 text-sm leading-6 text-slate-300">
                            Este preview público es únicamente para escuchar. No ofrece descarga directa ni muestra un precio fijo.
                          </div>
                        </div>
                      </div>
                    </div>

                    {whatsappHref ? (
                      <div className="mt-5 rounded-[24px] border border-emerald-500/20 bg-emerald-500/10 p-4">
                        <div className="text-sm font-bold text-emerald-100">¿Te gustó esta canción?</div>
                        <a href={whatsappHref} target="_blank" rel="noreferrer" className="mt-3 inline-flex h-12 items-center justify-center gap-2 rounded-full bg-emerald-500 px-5 text-sm font-extrabold text-black">
                          <MessageCircle className="h-4 w-4" />
                          Contactar por WhatsApp
                        </a>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-4">
                  <div className="text-[11px] uppercase tracking-[0.28em] text-slate-500">Detalles</div>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    {infoRows.map((item) => (
                      <div key={item.label} className="rounded-[22px] border border-white/10 bg-black/20 p-4">
                        <div className="text-[10px] uppercase tracking-[0.24em] text-slate-500">{item.label}</div>
                        <div className="mt-2 text-sm font-bold text-white">{item.value}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {data.lyrics ? (
                  <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-4">
                    <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.28em] text-slate-500">
                      <Info className="h-4 w-4" />
                      Información adicional
                    </div>
                    <div className="mt-3 line-clamp-6 whitespace-pre-wrap text-sm leading-6 text-slate-300">{data.lyrics}</div>
                  </div>
                ) : null}
              </div>
            </div>
          </>
        ) : null}
      </div>

      <audio
        ref={audioRef}
        preload="metadata"
        onEnded={() => setIsPlaying(false)}
        onPause={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
        onError={() => setIsPlaying(false)}
        onTimeUpdate={() => {
          const a = audioRef.current;
          if (!a) return;
          const t = Number(a.currentTime);
          if (Number.isFinite(t)) setPlayerTime(t);
        }}
        onLoadedMetadata={() => {
          const a = audioRef.current;
          if (!a) return;
          const d = Number(a.duration);
          if (Number.isFinite(d)) setPlayerDuration(d);
        }}
        onDurationChange={() => {
          const a = audioRef.current;
          if (!a) return;
          const d = Number(a.duration);
          if (Number.isFinite(d)) setPlayerDuration(d);
        }}
        className="hidden"
      />

      {toast ? (
        <div className="fixed bottom-6 left-0 right-0 z-[320] flex justify-center px-4 pointer-events-none">
          <div className="rounded-full border border-white/10 bg-black/80 px-4 py-2 text-sm font-semibold text-slate-100 backdrop-blur-md">
            {toast}
          </div>
        </div>
      ) : null}

      {shareSheetUrl ? (
        <div className="fixed inset-0 z-[350] flex items-end justify-center bg-black/80 backdrop-blur-sm md:items-center">
          <button className="absolute inset-0 h-full w-full" onClick={() => setShareSheetUrl(null)} aria-label="Cerrar" />
          <div className="relative w-full overflow-hidden rounded-t-3xl border border-white/10 bg-[#0a0a0a] md:max-w-[520px] md:rounded-3xl">
            <div className="flex items-center justify-between border-b border-white/10 p-4">
              <div className="text-white font-extrabold truncate">Compartir</div>
              <button onClick={() => setShareSheetUrl(null)} className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-200">✕</button>
            </div>
            <div className="space-y-3 p-4">
              <div className="text-sm text-slate-300">Copia este link:</div>
              <div className="break-words rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-slate-100">{shareSheetUrl}</div>
              <button
                className="flex h-[46px] w-full items-center justify-center gap-2 rounded-full bg-white text-sm font-extrabold text-black"
                onClick={async () => {
                  const ok = await copyToClipboard(shareSheetUrl);
                  if (ok) {
                    setShareSheetUrl(null);
                    showToast('Link copiado.');
                  } else {
                    showToast('No pude copiar. Mantén presionado el link para copiarlo.');
                  }
                }}
              >
                <Copy className="h-4 w-4" />
                Copiar enlace
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SharedProfilePage({ profileId }: { profileId: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState<{ profile: any; songs: Array<{ id: string; title: string; audioUrl: string; coverUrl?: string | null }> } | null>(null);
  const [currentSong, setCurrentSong] = useState<null | { id: string; title: string; audioUrl: string; coverUrl?: string | null }>(null);
  const [showPlayer, setShowPlayer] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playerTime, setPlayerTime] = useState(0);
  const [playerDuration, setPlayerDuration] = useState(0);
  const [toast, setToast] = useState('');
  const toastTimerRef = useRef<number | null>(null);
  const [shareSheetUrl, setShareSheetUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(''), 2600);
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
    }
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', 'true');
      ta.style.position = 'fixed';
      ta.style.top = '0';
      ta.style.left = '0';
      ta.style.opacity = '0';
      try { document.body.appendChild(ta); } catch {}
      ta.focus();
      ta.select();
      const ok = document.execCommand('copy');
      try { if (ta.parentNode) ta.parentNode.removeChild(ta); } catch {}
      return ok;
    } catch {
      return false;
    }
  };

  const r2ValueToProxyUrl = (raw: any) => {
    const url = (raw || '').toString().trim();
    if (!url) return '';
    if (url.startsWith('blob:') || url.startsWith('data:')) return url;
    const keyish = url.replace(/^\/+/, '');
    const allowed = ['avatars/', 'profile-covers/', 'personas/', 'covers/'];
    if (!/^https?:\/\//i.test(url) && allowed.some((p) => keyish.startsWith(p))) {
      return `${window.location.origin}/api/r2/object?key=${encodeURIComponent(keyish)}`;
    }
    try {
      const u = new URL(url);
      const host = (u.hostname || '').toLowerCase();
      const isR2 =
        host.includes('.r2.cloudflarestorage.com') ||
        host.endsWith('.r2.dev') ||
        host.includes('.r2') ||
        url.includes('.r2.cloudflarestorage.com/');
      if (!isR2) return url;
      const key = (u.pathname || '').replace(/^\/+/, '');
      if (!key) return url;
      return `${window.location.origin}/api/r2/object?key=${encodeURIComponent(key)}`;
    } catch {
      return url;
    }
  };

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    setData(null);
    fetch(`/api/share/profile?id=${encodeURIComponent(profileId)}`, { method: 'GET' })
      .then((r) => r.json().catch(() => ({})).then((out) => ({ r, out })))
      .then(({ r, out }) => {
        if (!alive) return;
        if (!r.ok || out?.ok === false) {
          setError((out?.error || 'Este perfil no existe o no está disponible.').toString());
          return;
        }
        const profile = out?.profile || {};
        const songs = Array.isArray(out?.songs) ? out.songs : [];
        setData({ profile, songs });
        setCurrentSong(null);
        setShowPlayer(true);
      })
      .catch(() => {
        if (!alive) return;
        setError('No pude cargar el perfil.');
      })
      .finally(() => {
        if (!alive) return;
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [profileId]);

  useEffect(() => {
    setIsPlaying(false);
    setPlayerTime(0);
    setPlayerDuration(0);
    const a = audioRef.current;
    if (!a) return;
    try {
      a.pause();
    } catch {
    }
    a.src = '';
  }, [currentSong?.audioUrl]);

  const shareThis = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'LucIAna | Music - Perfil', url });
        return;
      }
    } catch {
    }
    const ok = await copyToClipboard(url);
    if (ok) {
      showToast('Link copiado.');
      return;
    }
    setShareSheetUrl(url);
  };

  const shareSong = async (s: { id: string; title: string }) => {
    const title = (s?.title || 'Canción').toString().trim();
    const url = s?.id ? `https://lucianamusic.app/share/${encodeURIComponent(s.id)}` : '';
    if (!url) return;
    try {
      if (navigator.share) {
        await navigator.share({ title: `LucIAna | Music - ${title}`, url });
        return;
      }
    } catch {
    }
    const ok = await copyToClipboard(url);
    if (ok) {
      showToast('Link copiado.');
      return;
    }
    setShareSheetUrl(url);
  };

  const ensureAudioSrc = (src: string) => {
    const a = audioRef.current;
    if (!a) return;
    const nextSrc = new URL(src, window.location.origin).toString();
    if (a.src !== nextSrc) {
      a.src = '';
      a.src = nextSrc;
    }
  };

  const playSong = async (s: { id: string; title: string; audioUrl: string; coverUrl?: string | null }) => {
    if (!s?.id) return;
    const safePlayUrl = `/api/share/song/audio?id=${encodeURIComponent(s.id)}`;
    const playUrl = safePlayUrl || (s.audioUrl || '').toString().trim();
    const baseAudio = playUrl;
    setCurrentSong({ id: s.id, title: s.title, audioUrl: playUrl, coverUrl: s.coverUrl });
    setShowPlayer(true);
    try {
      ensureAudioSrc(playUrl);
      await audioRef.current?.play();
      setIsPlaying(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      const isNoSource = String(msg || '').toLowerCase().includes('supported source');
      if (isNoSource) {
        try {
          const bust = `${baseAudio}${baseAudio.includes('?') ? '&' : '?'}t=${Date.now()}`;
          ensureAudioSrc(bust);
          await audioRef.current?.play();
          setIsPlaying(true);
          return;
        } catch {
        }
      }
      try {
        const bust = `${baseAudio}${baseAudio.includes('?') ? '&' : '?'}t=${Date.now()}`;
        ensureAudioSrc(bust);
        await audioRef.current?.play();
        setIsPlaying(true);
        return;
      } catch {
      }
    }
  };

  const togglePlayPause = async () => {
    const a = audioRef.current;
    if (!a || !currentSong?.audioUrl) return;
    try {
      ensureAudioSrc(currentSong.audioUrl);
      if (isPlaying) {
        a.pause();
        setIsPlaying(false);
        return;
      }
      await a.play();
      setIsPlaying(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      const isNoSource = String(msg || '').toLowerCase().includes('supported source');
      if (isNoSource) {
        try {
          const bust = `${currentSong.audioUrl}${currentSong.audioUrl.includes('?') ? '&' : '?'}t=${Date.now()}`;
          ensureAudioSrc(bust);
          await a.play();
          setIsPlaying(true);
          return;
        } catch {
        }
      }
      try {
        const bust = `${currentSong.audioUrl}${currentSong.audioUrl.includes('?') ? '&' : '?'}t=${Date.now()}`;
        ensureAudioSrc(bust);
        await a.play();
        setIsPlaying(true);
        return;
      } catch {
      }
    }
  };

  return (
    <div className="min-h-[100dvh] w-full text-white flex flex-col bg-gradient-to-b from-[#0b1224] via-[#070a12] to-black/80">
      <div className="px-4 py-4 border-b border-white/10 flex items-center justify-between gap-3">
        <a href="/" className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-yellow-400 text-black flex items-center justify-center font-light text-2xl">L</div>
          <div className="min-w-0">
            <div className="font-extrabold leading-tight truncate">LucIAna</div>
            <div className="text-[11px] text-slate-400 leading-tight truncate">Perfil público</div>
          </div>
        </a>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-6 text-slate-300">Cargando…</div>
        ) : error ? (
          <div className="p-6">
            <div className="text-xl font-extrabold">No se pudo abrir</div>
            <div className="mt-2 text-slate-300">{error}</div>
            <div className="mt-5 flex items-center gap-2">
              <button
                onClick={() => window.location.reload()}
                className="h-10 px-4 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-slate-100 font-extrabold text-sm"
              >
                Reintentar
              </button>
            </div>
          </div>
        ) : data ? (
          <div className="w-full pt-4 relative z-10">
            <div className="px-6 mb-6">
              <div className="relative w-full aspect-[1610/720] rounded-3xl overflow-hidden border border-white/10">
                <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/20 via-fuchsia-500/10 to-yellow-500/10" />
                {data.profile?.coverUrl ? (
                  <img
                    src={r2ValueToProxyUrl(data.profile.coverUrl)}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                ) : null}
              </div>
              <div className="mt-4 flex items-center gap-4 min-w-0">
                <div className="w-16 h-16 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-2xl font-bold text-indigo-300 overflow-hidden shrink-0">
                  {data.profile?.avatarUrl ? (
                    <img src={r2ValueToProxyUrl(data.profile.avatarUrl)} alt="" className="w-full h-full object-cover" />
                  ) : (
                    (data.profile?.name || 'U').toString().trim().slice(0, 1).toUpperCase()
                  )}
                </div>
                <div className="min-w-0">
                  <h2 className="text-2xl font-bold text-white truncate">{(data.profile?.name || 'Usuario').toString()}</h2>
                  {data.profile?.username ? <div className="text-xs text-slate-300/80 truncate">@{String(data.profile.username)}</div> : null}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 px-6 mb-6 text-center">
              <div className="flex flex-col items-center">
                <span className="text-lg font-bold text-slate-100">0</span>
                <span className="text-xs text-slate-400">Me gusta</span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-lg font-bold text-slate-100">0</span>
                <span className="text-xs text-slate-400">Seguidores</span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-lg font-bold text-slate-100">0</span>
                <span className="text-xs text-slate-400">Siguiendo</span>
              </div>
            </div>

            <div className="flex gap-4 px-6 mb-8">
              <a
                href="/"
                className="flex-1 py-2.5 rounded-full glass-card border border-indigo-500/50 text-indigo-300 font-semibold flex items-center justify-center gap-2 hover:bg-indigo-500/10 transition-colors text-sm"
              >
                Abrir app
              </a>
              <button
                onClick={() => shareThis().catch(() => {})}
                className="flex-1 py-2.5 rounded-full glass-card border border-white/10 text-slate-200 font-semibold flex items-center justify-center gap-2 hover:bg-white/5 transition-colors text-sm"
              >
                <Share2 className="w-4 h-4" /> Compartir
              </button>
            </div>

            {(() => {
              const city = String(data.profile?.city || '').trim();
              const country = String(data.profile?.country || '').trim();
              const location = [city, country].filter(Boolean).join(', ');
              const contactEmail = String(data.profile?.contactEmail || '').trim();
              const contactPhone = String(data.profile?.contactPhone || '').trim();
              const bio = String(data.profile?.bio || '').trim();
              const hasInfo = Boolean(location || contactEmail || contactPhone || bio);
              if (!hasInfo) return null;
              return (
                <div className="px-6 mb-8 space-y-3">
                  <div className="glass-card rounded-3xl border border-white/10 p-4">
                    <div className="text-white font-extrabold">Información</div>
                    {location ? <div className="mt-2 text-sm text-slate-300">{location}</div> : null}
                    {contactEmail ? <div className="mt-2 text-sm text-slate-300">{contactEmail}</div> : null}
                    {contactPhone ? <div className="mt-1 text-sm text-slate-300">{contactPhone}</div> : null}
                    {bio ? <div className="mt-3 text-sm text-slate-200 whitespace-pre-wrap">{bio}</div> : null}
                  </div>
                </div>
              );
            })()}

            <div className="px-6 pb-8 mt-[-10px]">
              <div className="text-slate-200 font-extrabold">Canciones</div>
              {data.songs.length === 0 ? (
                <div className="mt-2 text-slate-400 text-sm">Este perfil todavía no tiene canciones agregadas.</div>
              ) : (
                <div className="mt-3 space-y-2">
                  {data.songs.map((s) => {
                    const isThis = currentSong?.id === s.id;
                    return (
                      <div key={s.id} className="w-full glass-card rounded-2xl p-4 flex items-center gap-3">
                        <button
                          onClick={() => playSong(s).catch(() => {})}
                          className="w-12 h-12 rounded-xl overflow-hidden bg-white/5 border border-white/10 shrink-0"
                          aria-label="Reproducir"
                        >
                          {s.coverUrl ? <img src={String(s.coverUrl)} alt="" className="w-full h-full object-cover" /> : null}
                        </button>
                        <div className="min-w-0 flex-1">
                          <button onClick={() => playSong(s).catch(() => {})} className="text-left w-full">
                            <div className="text-white font-extrabold truncate">{s.title || 'Pista sin título'}</div>
                          </button>
                          <div className="text-slate-400 text-xs truncate">LucIAna</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => shareSong({ id: s.id, title: s.title }).catch(() => {})}
                          className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-200 hover:bg-white/10 transition-colors shrink-0"
                          aria-label="Compartir"
                          title="Compartir"
                        >
                          <Share2 className="w-5 h-5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => (isThis ? togglePlayPause().catch(() => {}) : playSong(s).catch(() => {}))}
                          className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-200 hover:bg-white/10 transition-colors shrink-0"
                          aria-label="Reproducir"
                          title="Reproducir"
                        >
                          {isThis && isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>

      {showPlayer && currentSong ? (
        <MiniPlayer
          song={{ id: currentSong.id, title: currentSong.title, description: 'Disponible en LucIAna | Music', audioUrl: currentSong.audioUrl, coverUrl: currentSong.coverUrl } as any}
          isPlaying={isPlaying}
          onPlayPause={() => togglePlayPause().catch(() => {})}
          onClose={() => {
            setShowPlayer(false);
            setIsPlaying(false);
            setPlayerTime(0);
            setPlayerDuration(0);
            const a = audioRef.current;
            if (a) {
              try {
                a.pause();
              } catch {
              }
              a.src = '';
            }
          }}
          placement="default"
          currentTime={playerTime}
          duration={playerDuration}
          onSeek={(t) => {
            const a = audioRef.current;
            if (!a) return;
            const dur = Number.isFinite(Number(a.duration)) ? Number(a.duration) : 0;
            const next = Math.max(0, Math.min(Number.isFinite(Number(t)) ? Number(t) : 0, dur));
            try {
              a.currentTime = next;
            } catch {
            }
            setPlayerTime(next);
          }}
        />
      ) : null}

      <audio
        ref={audioRef}
        preload="metadata"
        onEnded={() => setIsPlaying(false)}
        onPause={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
        onError={() => setIsPlaying(false)}
        onTimeUpdate={() => {
          const a = audioRef.current;
          if (!a) return;
          const t = Number(a.currentTime);
          if (Number.isFinite(t)) setPlayerTime(t);
        }}
        onLoadedMetadata={() => {
          const a = audioRef.current;
          if (!a) return;
          const d = Number(a.duration);
          if (Number.isFinite(d)) setPlayerDuration(d);
        }}
        onDurationChange={() => {
          const a = audioRef.current;
          if (!a) return;
          const d = Number(a.duration);
          if (Number.isFinite(d)) setPlayerDuration(d);
        }}
        className="hidden"
      />

      {toast ? (
        <div className="fixed left-0 right-0 bottom-[92px] z-[320] flex justify-center px-4 pointer-events-none">
          <div className="bg-black/80 border border-white/10 backdrop-blur-md text-slate-100 text-sm font-semibold px-4 py-2 rounded-full">
            {toast}
          </div>
        </div>
      ) : null}

      {shareSheetUrl ? (
        <div className="fixed inset-0 z-[350] bg-black/70 flex items-end md:items-center justify-center">
          <button className="absolute inset-0 w-full h-full" onClick={() => setShareSheetUrl(null)} aria-label="Cerrar" />
          <div className="relative w-full md:max-w-[520px] bg-[#0a0a0a] border border-white/10 rounded-t-3xl md:rounded-3xl overflow-hidden mb-[92px] md:mb-0">
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <div className="text-white font-extrabold truncate">Compartir</div>
              <button
                onClick={() => setShareSheetUrl(null)}
                className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-200"
              >
                ✕
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div className="text-slate-300 text-sm">Copia este link:</div>
              <div className="bg-white/5 border border-white/10 rounded-2xl p-3 break-words text-slate-100 text-sm">{shareSheetUrl}</div>
              <button
                className="w-full h-[46px] rounded-full bg-white text-black font-extrabold text-sm"
                onClick={async () => {
                  const ok = await copyToClipboard(shareSheetUrl);
                  if (ok) {
                    setShareSheetUrl(null);
                    showToast('Link copiado.');
                  } else {
                    showToast('No pude copiar. Mantén presionado el link para copiarlo.');
                  }
                }}
              >
                Copiar link
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
