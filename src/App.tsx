import { useState, useEffect, useRef } from 'react';
import { TopBar } from './components/TopBar';
import { BottomNav } from './components/BottomNav';
import { MiniPlayer } from './components/MiniPlayer';
import { CreateView } from './views/CreateView';
import { LibraryView } from './views/LibraryView';
import { ProfileView } from './views/ProfileView';
import { SettingsView } from './views/SettingsView';
import { PricingView } from './views/PricingView';
import { useUserCredits } from './hooks/useUserCredits';
import { type ViewTab, type SongItem, type VibeItem } from './types';
import { store } from './lib/store';
import { cn } from './lib/utils';
import { ensureAnonSession, getAccessToken, signInWithGoogle, supabaseBrowser } from './lib/supabaseBrowser';
import { CREDIT_COSTS } from './lib/credits';

import { Banner } from './components/Banner';
import { Sidebar } from './components/Sidebar';
import { ArrowRight, BadgeCheck, Copy, Download, Music2, Rocket, Shield, Share2, Sparkles, Wand2 } from 'lucide-react';

const APP_UPDATES: Array<{ date: string; title: string; detail: string }> = [
  { date: '2026-05-04', title: 'Mejoras en Biblioteca', detail: 'Carpetas, filtros por fecha y mejoras de scroll en PC.' },
  { date: '2026-05-04', title: 'Compartir canciones', detail: 'Los links compartidos ahora abren un reproductor dentro de RAMBER Tunes.' },
];

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

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
          <text x="26" y="-34" fill="rgba(255,255,255,0.92)" font-family="ui-sans-serif,system-ui" font-size="28" font-weight="800">RAMBER Tunes</text>
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
              Genera canciones con 2 versiones (A y B), guarda todo en tu biblioteca y mejora resultados con letras,
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
                <div className="mt-1 text-white font-extrabold">5 canciones</div>
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
                <div className="mt-1 text-white font-extrabold">Créditos</div>
                <div className="mt-1 text-[11px] text-slate-400">Saldo y costos</div>
              </div>
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-6 bg-gradient-to-br from-cyan-400/10 via-indigo-500/10 to-purple-500/10 blur-2xl rounded-[48px]" />
            <div className="relative bg-white/5 border border-white/10 rounded-[32px] overflow-hidden shadow-[0_30px_90px_rgba(0,0,0,0.55)]">
              <img src={heroImage} alt="RAMBER Tunes" className="w-full h-auto block" />
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
              Empieza con 5 canciones. Cuando necesites descargar, compra un plan y listo.
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

function InicioSocial({
  onPlaySong,
  onGoStudio,
}: {
  onPlaySong: (s: SongItem) => void;
  onGoStudio: () => void;
}) {
  const [tab, setTab] = useState<'canciones' | 'listas' | 'generos'>('canciones');
  const [items, setItems] = useState<SongItem[]>([]);
  const [genres, setGenres] = useState<Array<{ genre: string; count: number; coverUrl?: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [cursor, setCursor] = useState<string | null>(null);
  const [activeGenre, setActiveGenre] = useState('');

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
          <div className="text-white font-extrabold text-lg">Inicio</div>
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
              <button
                key={s.id}
                onClick={() => onPlaySong(s)}
                className="w-full flex items-center gap-3 bg-white/5 border border-white/10 rounded-2xl p-3 hover:bg-white/10 transition-colors text-left"
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

export default function App() {
  const [currentTab, setCurrentTab] = useState<ViewTab>('studio');
  const [canciones, setCanciones] = useState<SongItem[]>([]);
  const [cancionesEliminadas, setCancionesEliminadas] = useState<SongItem[]>([]);
  const [vibes, setVibes] = useState<VibeItem[]>([]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [personaPickerNonce, setPersonaPickerNonce] = useState(0);
  const [studioPrefillNonce, setStudioPrefillNonce] = useState(0);
  const [studioPrefill, setStudioPrefill] = useState<null | { type: 'cover'; song: SongItem }>(null);
  const [toast, setToast] = useState<string>('');
  const toastTimerRef = useRef<number | null>(null);
  const [isPricingOpen, setIsPricingOpen] = useState(false);
  const [isBalanceOpen, setIsBalanceOpen] = useState(false);
  const [balanceData, setBalanceData] = useState<any>(null);
  const [isBalanceLoading, setIsBalanceLoading] = useState(false);
  const [balanceError, setBalanceError] = useState<string>('');
  const [isStartingLogin, setIsStartingLogin] = useState(false);
  const [authEmail, setAuthEmail] = useState('');
  const [isProfileSetupOpen, setIsProfileSetupOpen] = useState(false);
  const [profileFirstName, setProfileFirstName] = useState('');
  const [profileLastName, setProfileLastName] = useState('');
  const [profileBirthdate, setProfileBirthdate] = useState('');
  const [profileSetupBusy, setProfileSetupBusy] = useState(false);
  const [profileUsername, setProfileUsername] = useState('');
  const [profileAvatarMode, setProfileAvatarMode] = useState<'male' | 'female' | 'photo'>('male');
  const [profileAvatarFile, setProfileAvatarFile] = useState<File | null>(null);
  const [profileAvatarUrl, setProfileAvatarUrl] = useState<string>('');
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  
  const [activeSong, setActiveSong] = useState<SongItem | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playerTime, setPlayerTime] = useState(0);
  const [playerDuration, setPlayerDuration] = useState(0);
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
  const [updatesSeenKey, setUpdatesSeenKey] = useState(() => {
    try {
      return (window.localStorage.getItem('ramber.updates_seen_v1') || '').toString();
    } catch {
      return '';
    }
  });

  const showToast = (message: string) => {
    setToast(message);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(''), 4500);
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
    if (!supabaseBrowser) return '';
    const s = await ensureAnonSession();
    if (!s.ok) return '';
    const blob = await compressAvatarToBlob(file);
    const path = `avatars/${userId}/avatar_${Date.now()}.webp`;
    const up = await supabaseBrowser.storage.from('ramber-tunes').upload(path, blob, {
      upsert: true,
      contentType: 'image/webp',
      cacheControl: '31536000',
    });
    if (up.error) return '';
    const { data: pub } = supabaseBrowser.storage.from('ramber-tunes').getPublicUrl(path);
    const url = (pub?.publicUrl || '').toString().trim();
    return url;
  };

  const saveProfileSetup = async () => {
    if (!supabaseBrowser) return;
    const first = (profileFirstName || '').toString().trim();
    const last = (profileLastName || '').toString().trim();
    const birth = (profileBirthdate || '').toString().trim();
    if (!first || !last) {
      showToast('Escribe tu nombre y apellidos.');
      return;
    }
    if (!birth) {
      showToast('Selecciona tu fecha de nacimiento.');
      return;
    }
    setProfileSetupBusy(true);
    try {
      const full_name = `${first} ${last}`.trim().slice(0, 120);
      const { data: ud } = await supabaseBrowser.auth.getUser().catch(() => ({ data: null as any }));
      const user = ud?.user;
      const uid = (user?.id || '').toString().trim();
      const currentMeta: any = user?.user_metadata || {};
      const rawUsername = (profileUsername || '').toString().trim().replace(/\s+/g, '');
      const username =
        (rawUsername || (currentMeta?.username || '').toString().trim() || (uid ? uid.slice(0, 8) : '') || 'usuario')
          .slice(0, 20);

      let avatar_url = profileAvatarMode === 'photo' ? '' : (profileAvatarUrl || '').toString().trim();
      if (profileAvatarMode === 'photo' && profileAvatarFile && uid) {
        const uploaded = await uploadProfileAvatar(profileAvatarFile, uid).catch(() => '');
        if (uploaded) avatar_url = uploaded;
      }
      if (!avatar_url) {
        const base = full_name || username || 'Usuario';
        avatar_url = makeAvatarSvgUrl(profileAvatarMode === 'female' ? 'female' : 'male', base);
      }

      const r = await supabaseBrowser.auth
        .updateUser({ data: { full_name, birthdate: birth, username, avatar_url, profile_ready: true } })
        .catch(() => null as any);
      const err = (r as any)?.error;
      if (err) {
        showToast('No pude guardar tu perfil.');
        return;
      }
      setIsProfileSetupOpen(false);
      showToast('Listo. Guardé tu información.');
    } finally {
      setProfileSetupBusy(false);
    }
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
    return () => window.removeEventListener('ramber:openPricing', onOpenPricing as any);
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
    if (!supabaseBrowser) return;
    let alive = true;
    let signingOut = false;
    const setFromSession = (session: any) => {
      if (!session) {
        if (!alive) return;
        setAuthEmail('');
        return;
      }
      const email = (session?.user?.email || '').toString().trim().toLowerCase();
      const ok = email && (email.endsWith('@gmail.com') || email.endsWith('@googlemail.com'));
      if (!ok) {
        if (signingOut) return;
        signingOut = true;
        try {
          supabaseBrowser.auth.signOut().catch(() => {});
        } catch {}
        if (!alive) return;
        setAuthEmail('');
        return;
      }
      if (!alive) return;
      setAuthEmail(email);
    };
    supabaseBrowser.auth
      .getSession()
      .then(({ data }) => setFromSession(data?.session))
      .catch(() => {
        if (!alive) return;
        setAuthEmail('');
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
  const didProfileSetupRef = useRef(false);

  const [shareRouteId] = useState(() => {
    const p = (window.location?.pathname || '').toString();
    const m = p.match(/^\/(share|s)\/([^/?#]+)/i);
    if (!m) return '';
    const rawId = m[2] || '';
    const id = decodeURIComponent(rawId).trim();
    return id;
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
              pendingReloadRef.current = true;
              latestVersionRef.current = v;
              if (wasHiddenRef.current) {
                wasHiddenRef.current = false;
                forceReload(v);
                return;
              }
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
              pendingReloadRef.current = true;
              latestVersionRef.current = v;
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
    const out = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false as const, error: out?.error || 'No pude cargar tu biblioteca.' };
    const list = Array.isArray(out?.songs) ? out.songs : [];
    const songs = list.map(mapSongRow).filter((s: SongItem) => s.id);
    return { ok: true as const, songs, cleanupDeleted: Number(out?.cleanup_deleted || 0) };
  };

  const refreshLibrary = async () => {
    const a = await loadSongs(false);
    if (a.ok) setCanciones(a.songs);
    else showToast((a.error || 'No pude cargar tu biblioteca.').toString());
    const d = await loadSongs(true);
    if (d.ok) setCancionesEliminadas(d.songs);
    if (a.ok && a.cleanupDeleted && a.cleanupDeleted > 0) {
      showToast(`Se eliminaron automáticamente ${a.cleanupDeleted} canciones (plan gratis: 15 días).`);
    }
  };

  const refreshAppVersion = async () => {
    try {
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
          pendingReloadRef.current = true;
          latestVersionRef.current = v;
        }
      } catch {
      }
    });
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
              pendingReloadRef.current = true;
              latestVersionRef.current = v.trim();
              showToast('Actualización lista. Sal de la app y vuelve a entrar.');
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
    if (!isAuthed) return;
    if (didBootstrapRef.current) return;
    didBootstrapRef.current = true;
    getAccessToken()
      .then(async (t) => {
        if (!t.ok) return;
        const r = await fetch('/api/account/bootstrap-profile', {
          method: 'POST',
          headers: { authorization: `Bearer ${t.token}` },
        }).catch(() => {});
        let out: any = null;
        try {
          out = r && typeof (r as any).json === 'function' ? await (r as any).json().catch(() => null) : null;
        } catch {
          out = null;
        }
        if (out?.welcome_granted) {
          showToast('Listo: se activó tu saldo de bienvenida (5 canciones).');
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
    if (!isAuthed) {
      didProfileSetupRef.current = false;
      setIsProfileSetupOpen(false);
      return;
    }
    const isAdminAccount =
      (authEmail || '').toString().trim().toLowerCase() === 'rubenfiverr612@gmail.com' ||
      (authEmail || '').toString().trim().toLowerCase() === 'rubenvidal612@gmail.com';
    if (isAdminAccount) {
      setIsProfileSetupOpen(false);
      return;
    }
    if (didProfileSetupRef.current) return;
    didProfileSetupRef.current = true;
    if (!supabaseBrowser) return;
    supabaseBrowser.auth
      .getUser()
      .then(({ data }) => {
        const user = data?.user;
        const meta: any = user?.user_metadata || {};
        const isReady = Boolean(meta?.profile_ready);
        const full = (meta?.full_name || meta?.name || '').toString().trim();
        const birth = (meta?.birthdate || meta?.birthday || meta?.dob || '').toString().trim();
        if (isReady) return;
        const parts = full ? full.split(/\s+/g) : [];
        const first = parts.length ? parts[0] : '';
        const last = parts.length > 1 ? parts.slice(1).join(' ') : '';
        setProfileFirstName(first);
        setProfileLastName(last);
        setProfileBirthdate(birth);
        setProfileUsername((meta?.username || '').toString().trim());
        const existingAvatar = (meta?.avatar_url || meta?.avatarUrl || '').toString().trim();
        if (existingAvatar) {
          setProfileAvatarUrl(existingAvatar);
          setProfileAvatarMode(existingAvatar.startsWith('http') ? 'photo' : 'male');
        } else {
          const base = full || (user?.email || '').toString().split('@')[0] || 'Usuario';
          setProfileAvatarUrl(makeAvatarSvgUrl('male', base));
          setProfileAvatarMode('male');
        }
        setProfileAvatarFile(null);
        setIsProfileSetupOpen(true);
      })
      .catch(() => {});
  }, [isAuthed]);

  useEffect(() => {
    const isStandalone =
      window.matchMedia?.('(display-mode: standalone)')?.matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    const isMobile = window.matchMedia?.('(max-width: 768px)')?.matches ?? false;

    if (isMobile && !isStandalone) {
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
      await installPromptEvent.prompt();
      const choice = await installPromptEvent.userChoice;
      setInstallPromptEvent(null);
      if (choice.outcome === 'accepted') {
        setShowInstallBanner(false);
      }
      return;
    }
    setShowIosHelp(true);
  };

  const addVibe = async (vibe: VibeItem) => {
    const updatedVibes = [vibe, ...vibes];
    setVibes(updatedVibes);
    await store.saveData({ canciones, vibes: updatedVibes });
  };

  const openPersonaPicker = () => {
    setCurrentTab('studio');
    setPersonaPickerNonce((n) => n + 1);
  };

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
    const url = (song?.audioUrl || '').toString().trim();
    if (!url) {
      alert('Esta canción no tiene audio para hacer cover.');
      return;
    }
    setStudioPrefill({ type: 'cover', song });
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
          (typeof track?.text === 'string' ? track.text : '') ||
          (typeof track?.prompt === 'string' ? track.prompt : '');
        const s = (direct || '').toString().trim();
        return s || undefined;
      };
      return (Array.isArray(list) ? list : []).map((track: any) => {
        const audioUrl = pickUrl(track);
        const audioId = pickAudioId(track);
        const title = cleanStr(track?.title || '');
        const coverUrl = cleanStr(track?.image_url || track?.imageUrl || '');
        const lyrics = pickLyrics(track);
        return { audioUrl, audioId, title, coverUrl, lyrics };
      });
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
            await addCancion({
              id: track.audioId || `${pending.taskId}_${i + 1}`,
              title: finalTitle,
              description: String(draft?.description || ''),
              lyrics: draftLyrics ? draftLyrics : (typeof track?.lyrics === 'string' && track.lyrics.trim() ? track.lyrics : undefined),
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
          showToast(msg);
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
    return () => window.clearInterval(id);
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

  const playSong = async (song: SongItem) => {
    if (activeSong?.id === song.id) {
      togglePlay();
      return;
    }
    setActiveSong(song);
    setIsPlaying(false);
    setPlayerTime(0);
    setPlayerDuration(0);
    
    const tryPlay = async (url: string) => {
      if (!audioRef.current) return false;
      const nextUrl = (url || '').toString().trim();
      if (!nextUrl) return false;
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
        return true;
      } catch (e) {
        alert(e instanceof Error ? e.message : 'No pude reproducir esta canción.');
        return false;
      }
    };

    const directUrl = (song.audioUrl || '').toString().trim();
    if (/^https?:\/\//i.test(directUrl)) {
      const ok = await tryPlay(directUrl);
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
            const tracks = (Array.isArray(list) ? list : [])
              .map((track: any) => ({ audioUrl: pickUrl(track), audioId: pickAudioId(track) }))
              .filter((x) => x.audioUrl);
            if (tracks.length > 0) {
              const wantsB = /\sB$/i.test((song.title || '').toString().trim());
              const chosen = wantsB && tracks.length > 1 ? tracks[1] : tracks[0];
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

  const displayCredits = credits;

  if (shareRouteId) {
    return <SharedSongPage shareId={shareRouteId} />;
  }

  if (!isAuthed) {
    return (
      <div className="h-[100dvh] w-full text-white flex flex-col items-center justify-center px-6 text-center bg-gradient-to-b from-[#0b1224] via-[#070a12] to-black/80">
        <div className="w-16 h-16 rounded-2xl bg-yellow-400 text-black flex items-center justify-center font-light text-4xl shadow-[0_0_18px_rgba(250,204,21,0.35)]">
          R
        </div>
        <div className="mt-4 text-xl font-extrabold">RAMBER Tunes</div>
        <div className="mt-2 text-sm text-slate-300">Para usar la app necesitas entrar con tu cuenta Gmail.</div>
        <button
          onClick={() => {
            if (isStartingLogin) return;
            setIsStartingLogin(true);
            signInWithGoogle()
              .then((r) => {
                if (!r.ok) alert(r.error);
              })
              .catch(() => alert('No pude iniciar sesión con Google.'))
              .finally(() => setIsStartingLogin(false));
          }}
          disabled={isStartingLogin || !supabaseBrowser}
          className="mt-6 bg-white text-black px-6 py-3 rounded-full font-extrabold text-sm disabled:opacity-70"
        >
          {isStartingLogin ? 'Abriendo Google…' : 'Entrar con Google'}
        </button>
        {!supabaseBrowser && <div className="mt-3 text-xs text-red-200">Falta configurar SUPABASE_URL y SUPABASE_ANON_KEY en Vercel (y redeploy).</div>}
      </div>
    );
  }

  return (
    <div ref={appRootRef} className="h-[100dvh] w-full text-white flex flex-col font-sans overflow-hidden relative">
      <TopBar
        className="flex-shrink-0"
        onMenuClick={() => setIsSettingsOpen(true)}
        onCreditsClick={() => setIsBalanceOpen(true)}
        credits={displayCredits}
        bankCredits={internalCredits}
        showBank={false}
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
              R
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-white leading-tight">RAMBER Tunes</div>
              <div className="text-xs text-slate-200/90 leading-tight">Descarga tu App en tu Celular</div>
            </div>
            <button
              onClick={onInstallClick}
              className="shrink-0 bg-white text-black px-4 py-2 rounded-full text-xs font-extrabold"
            >
              DESCARGAR
            </button>
          </div>
        </div>
      )}
      <Banner />
      
      <main className="flex-1 min-h-0 overflow-hidden flex w-full h-full relative">
        {/* Mobile View Switching */}
        <div className="flex-1 flex flex-col md:hidden pb-[76px] relative overflow-hidden">
           {currentTab === 'inicio' && (
             isAuthed ? (
               <InicioSocial onPlaySong={playSong} onGoStudio={() => setCurrentTab('studio')} />
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
           {currentTab === 'studio' && <CreateView onSongCreated={addCancion} credits={displayCredits} openPersonaPickerSignal={personaPickerNonce} onGoLibrary={() => setCurrentTab('biblioteca')} onOpenBalance={() => setIsBalanceOpen(true)} prefill={studioPrefill || undefined} prefillNonce={studioPrefillNonce} />}
           {currentTab === 'biblioteca' && <LibraryView canciones={canciones} cancionesEliminadas={cancionesEliminadas} vibes={vibes} onAddVibe={addVibe} onPlaySong={playSong} onDeleteSong={deleteCancion} onRestoreSong={restoreCancion} onRefreshSongs={refreshLibrary} activeSongId={activeSong?.id} isPlaying={isPlaying} onStartCover={startCoverFromSong} />}
           {currentTab === 'perfil' && <ProfileView onGoStudio={() => setCurrentTab('studio')} />}
           
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
        <div className="hidden md:flex flex-1 min-h-0 overflow-hidden">
           {/* Sidebar */}
           <div className="w-[200px] lg:w-[240px] shrink-0 border-r border-white/10 bg-gradient-to-b from-[#0b1224]/70 via-[#070a12]/60 to-black/40 backdrop-blur-2xl flex flex-col">
             <Sidebar currentTab={currentTab} onChange={setCurrentTab} />
           </div>

           {currentTab === 'inicio' ? (
             <div className="flex-1 bg-gradient-to-b from-indigo-950/25 via-black/10 to-black/30">
              {isAuthed ? (
                <InicioSocial onPlaySong={playSong} onGoStudio={() => setCurrentTab('studio')} />
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
           ) : (
             <>
               {/* Create View (Middle) */}
              <div className="w-[340px] lg:w-[420px] shrink-0 border-r border-white/10 bg-gradient-to-b from-indigo-950/25 via-black/10 to-black/30 backdrop-blur-xl flex flex-col relative z-0 shadow-[10px_0_30px_-10px_rgba(0,0,0,0.5)]">
                 <CreateView onSongCreated={addCancion} credits={displayCredits} openPersonaPickerSignal={personaPickerNonce} onGoLibrary={() => setCurrentTab('biblioteca')} onOpenBalance={() => setIsBalanceOpen(true)} prefill={studioPrefill || undefined} prefillNonce={studioPrefillNonce} />
               </div>

               {/* Library / Results View (Right) */}
               <div className="flex-1 min-h-0 flex flex-col bg-gradient-to-b from-indigo-950/20 via-black/10 to-black/30 relative z-10 w-full min-w-[300px]">
                {currentTab === 'perfil' ? <ProfileView onGoStudio={() => setCurrentTab('studio')} /> : <LibraryView canciones={canciones} cancionesEliminadas={cancionesEliminadas} vibes={vibes} onAddVibe={addVibe} onPlaySong={playSong} onDeleteSong={deleteCancion} onRestoreSong={restoreCancion} onRefreshSongs={refreshLibrary} activeSongId={activeSong?.id} isPlaying={isPlaying} onStartCover={startCoverFromSong} />}
               </div>
             </>
           )}
        </div>
      </main>

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
        <BottomNav currentTab={currentTab} onChange={setCurrentTab} />
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

      {isProfileSetupOpen && (
        <div className="fixed inset-0 z-[260] bg-black/70 flex items-end md:items-center justify-center">
          <div className="relative w-full md:max-w-[560px] bg-[#0b0f16] border border-white/10 rounded-t-3xl md:rounded-3xl overflow-hidden shadow-[0_-20px_60px_rgba(0,0,0,0.6)]">
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <div className="text-white font-extrabold">Completa tu perfil</div>
              <button
                onClick={() => setIsProfileSetupOpen(false)}
                className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-200"
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <div className="text-[11px] text-slate-400 font-semibold">Nombre(s)</div>
                <input
                  value={profileFirstName}
                  onChange={(e) => setProfileFirstName(e.target.value)}
                  className="mt-2 w-full bg-black/20 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-slate-500 outline-none focus:border-white/20"
                  placeholder="Ej: Juan"
                />
              </div>
              <div>
                <div className="text-[11px] text-slate-400 font-semibold">Apellidos</div>
                <input
                  value={profileLastName}
                  onChange={(e) => setProfileLastName(e.target.value)}
                  className="mt-2 w-full bg-black/20 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-slate-500 outline-none focus:border-white/20"
                  placeholder="Ej: Pérez López"
                />
              </div>
              <div>
                <div className="text-[11px] text-slate-400 font-semibold">Fecha de nacimiento</div>
                <input
                  type="date"
                  value={profileBirthdate}
                  onChange={(e) => setProfileBirthdate(e.target.value)}
                  className="mt-2 w-full bg-black/20 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-slate-500 outline-none focus:border-white/20"
                />
              </div>
              <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
                <div className="text-[11px] text-slate-400 font-semibold">Foto / Avatar</div>
                <div className="mt-3 flex items-center gap-3">
                  <div className="w-16 h-16 rounded-full bg-indigo-500/20 border border-indigo-500/30 overflow-hidden flex items-center justify-center text-white font-extrabold">
                    {profileAvatarUrl ? (
                      <img src={profileAvatarUrl} className="w-full h-full object-cover" />
                    ) : (
                      'U'
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-slate-200 font-extrabold truncate">Tu foto se verá cuando publiques</div>
                    <div className="text-[11px] text-slate-500 truncate">Puedes subir una foto o usar un avatar.</div>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    onClick={() => avatarInputRef.current?.click()}
                    className="bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 text-xs font-extrabold px-4 py-2 rounded-full"
                    type="button"
                  >
                    Subir / Tomar foto
                  </button>
                  <button
                    onClick={() => {
                      const base = `${(profileFirstName || '').toString().trim()} ${(profileLastName || '').toString().trim()}`.trim() || 'Usuario';
                      setProfileAvatarMode('male');
                      setProfileAvatarFile(null);
                      setProfileAvatarUrl(makeAvatarSvgUrl('male', base));
                    }}
                    className={cn(
                      "border text-xs font-extrabold px-4 py-2 rounded-full",
                      profileAvatarMode === 'male' ? "bg-indigo-500/20 border-indigo-500/30 text-indigo-200" : "bg-white/5 hover:bg-white/10 border-white/10 text-slate-200"
                    )}
                    type="button"
                  >
                    Avatar hombre
                  </button>
                  <button
                    onClick={() => {
                      const base = `${(profileFirstName || '').toString().trim()} ${(profileLastName || '').toString().trim()}`.trim() || 'Usuario';
                      setProfileAvatarMode('female');
                      setProfileAvatarFile(null);
                      setProfileAvatarUrl(makeAvatarSvgUrl('female', base));
                    }}
                    className={cn(
                      "border text-xs font-extrabold px-4 py-2 rounded-full",
                      profileAvatarMode === 'female' ? "bg-fuchsia-500/20 border-fuchsia-500/30 text-fuchsia-200" : "bg-white/5 hover:bg-white/10 border-white/10 text-slate-200"
                    )}
                    type="button"
                  >
                    Avatar mujer
                  </button>
                </div>
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  capture="user"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0] || null;
                    e.currentTarget.value = '';
                    if (!f) return;
                    setProfileAvatarMode('photo');
                    setProfileAvatarFile(f);
                    try {
                      const url = URL.createObjectURL(f);
                      setProfileAvatarUrl(url);
                    } catch {}
                  }}
                />
              </div>
              <div>
                <div className="text-[11px] text-slate-400 font-semibold">Nombre de usuario (opcional)</div>
                <input
                  value={profileUsername}
                  onChange={(e) => setProfileUsername(e.target.value)}
                  className="mt-2 w-full bg-black/20 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-slate-500 outline-none focus:border-white/20"
                  placeholder="Ej: ramberjuan"
                />
                <div className="mt-2 text-[11px] text-slate-500">Se usa para identificarte cuando publiques canciones.</div>
              </div>
              <button
                onClick={() => saveProfileSetup().catch(() => {})}
                disabled={profileSetupBusy}
                className="mt-2 w-full bg-emerald-500 hover:bg-emerald-400 text-black h-[46px] rounded-full font-extrabold text-sm transition-colors disabled:opacity-60"
              >
                {profileSetupBusy ? 'Guardando…' : 'Guardar'}
              </button>
              <div className="text-[11px] text-slate-500">
                Tu foto/nombre se usan para mostrar autor en Inicio. La fecha de nacimiento solo la ve el admin en OFICINA.
              </div>
            </div>
          </div>
        </div>
      )}

      {isSettingsOpen && <SettingsView onClose={() => setIsSettingsOpen(false)} onOpenPricing={() => setIsPricingOpen(true)} onOpenUpdates={() => openUpdates()} />}
      {isPricingOpen && (
        <PricingView
          onClose={() => {
            setIsPricingOpen(false);
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
              <div className="text-slate-300 text-sm">
                Créditos:{' '}
                <span className="text-white font-extrabold">{Number(balanceData?.credits ?? displayCredits ?? 0).toString()}</span>
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
                      { k: 'lyrics', label: 'Generar letra', cost: CREDIT_COSTS.lyrics },
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
              <div className="mt-4 flex items-center justify-between gap-3">
                <div className="text-slate-400 text-sm">Se descuenta al usar cada opción.</div>
                <button
                  onClick={() => {
                    setIsBalanceOpen(false);
                    setIsPricingOpen(true);
                  }}
                  className="bg-white text-black px-5 py-2.5 rounded-full font-extrabold text-sm"
                >
                  Obtener créditos
                </button>
              </div>
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
      {showIosHelp && (
        <div className="fixed inset-0 z-[300] bg-black/70 flex items-end md:hidden">
          <div className="w-full bg-[#0a0a0a] rounded-t-3xl p-5 border-t border-white/10">
            <div className="flex items-center justify-between">
              <div className="text-base font-bold text-white">Instalar como app</div>
              <button
                onClick={() => setShowIosHelp(false)}
                className="w-9 h-9 rounded-full bg-white/5 border border-white/10 text-slate-200 flex items-center justify-center"
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>
            <div className="mt-3 text-sm text-slate-300 space-y-2">
              <div>1) Toca el botón Compartir (cuadrado con flecha)</div>
              <div>2) Elige “Agregar a pantalla de inicio”</div>
              <div>3) Confirma “Agregar”</div>
            </div>
            <button
              onClick={() => setShowIosHelp(false)}
              className="mt-4 w-full bg-emerald-500 hover:bg-emerald-400 text-black h-[46px] rounded-full font-extrabold text-sm transition-colors"
            >
              Listo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SharedSongPage({ shareId }: { shareId: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState<{ id: string; title: string; audioUrl: string; coverUrl?: string } | null>(null);

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
        const title = (out?.title || 'Canción').toString();
        const audioUrl = (out?.audioUrl || out?.audio_url || '').toString().trim();
        const coverUrl = (out?.coverUrl || out?.cover_url || '').toString().trim();
        if (!audioUrl) {
          setError('Este link no tiene audio para reproducir.');
          return;
        }
        setData({ id: (out?.id || shareId).toString(), title, audioUrl, coverUrl: coverUrl || undefined });
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

  const shareThis = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: data?.title ? `RAMBER Tunes - ${data.title}` : 'RAMBER Tunes', url });
        return;
      }
    } catch {
    }
    try {
      await navigator.clipboard.writeText(url);
      alert('Link copiado al portapapeles.');
    } catch {
      alert(url);
    }
  };

  return (
    <div className="min-h-[100dvh] w-full bg-black text-white flex flex-col">
      <div className="px-4 py-4 border-b border-white/10 flex items-center justify-between gap-3">
        <a href="/" className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-yellow-400 text-black flex items-center justify-center font-light text-2xl">R</div>
          <div className="min-w-0">
            <div className="font-extrabold leading-tight truncate">RAMBER Tunes</div>
            <div className="text-[11px] text-slate-400 leading-tight truncate">Reproductor oficial</div>
          </div>
        </a>
        <div className="flex items-center gap-2">
          <button
            onClick={() => shareThis().catch(() => {})}
            className="h-10 px-4 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-slate-100 font-extrabold text-sm flex items-center gap-2"
          >
            <Share2 className="w-4 h-4" /> Compartir
          </button>
          <a href="/" className="h-10 px-4 rounded-full bg-white text-black font-extrabold text-sm flex items-center justify-center">
            Abrir app
          </a>
        </div>
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
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(shareId);
                    alert('ID copiado.');
                  } catch {
                    alert(shareId);
                  }
                }}
                className="h-10 px-4 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-slate-100 font-extrabold text-sm flex items-center gap-2"
              >
                <Copy className="w-4 h-4" /> Copiar ID
              </button>
            </div>
          </div>
        ) : data ? (
          <div className="p-5 max-w-[980px] mx-auto w-full">
            <div className="flex flex-col md:flex-row gap-5">
              <div className="w-full md:w-[360px] shrink-0">
                <div className="relative rounded-3xl overflow-hidden border border-white/10 bg-white/5 aspect-square">
                  {data.coverUrl ? (
                    <img src={data.coverUrl} alt="Cover" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-400">Sin portada</div>
                  )}
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-2xl md:text-3xl font-extrabold break-words">{data.title}</div>
                <div className="mt-1 text-sm text-slate-400">Disponible en RAMBER Tunes</div>

                <div className="mt-5 bg-white/5 border border-white/10 rounded-3xl p-4">
                  <audio controls preload="metadata" src={data.audioUrl} className="w-full" />
                  <div className="mt-3 text-[11px] text-slate-500 break-words">ID: {data.id}</div>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
