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
import { ensureAnonSession, getAccessToken, supabaseBrowser } from './lib/supabaseBrowser';

import { Banner } from './components/Banner';
import { Sidebar } from './components/Sidebar';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

export default function App() {
  const [currentTab, setCurrentTab] = useState<ViewTab>('inicio');
  const [canciones, setCanciones] = useState<SongItem[]>([]);
  const [cancionesEliminadas, setCancionesEliminadas] = useState<SongItem[]>([]);
  const [vibes, setVibes] = useState<VibeItem[]>([]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [personaPickerNonce, setPersonaPickerNonce] = useState(0);
  const [toast, setToast] = useState<string>('');
  const toastTimerRef = useRef<number | null>(null);
  const [providerCredits, setProviderCredits] = useState<number | null>(null);
  const [isPricingOpen, setIsPricingOpen] = useState(false);
  
  const [activeSong, setActiveSong] = useState<SongItem | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const { credits, refreshCredits } = useUserCredits();
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [installPromptEvent, setInstallPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const pendingKey = 'ramber.pendingSunoTask';

  const showToast = (message: string) => {
    setToast(message);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(''), 4500);
  };

  useEffect(() => {
    store.getData().then(data => {
      setVibes(data.vibes || []);
    });
  }, []);

  useEffect(() => {
    ensureAnonSession()
      .then((r) => {
        if (!r.ok) showToast(r.error);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    };
  }, []);

  const refreshProviderCredits = async () => {
    const r = await fetch('/api/suno/credits');
    const out = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = (out?.error || 'No pude consultar créditos.').toString();
      if (msg) showToast(msg);
      return;
    }
    const c = Number(out?.credits ?? out?.data);
    if (Number.isFinite(c)) setProviderCredits(c);
  };

  useEffect(() => {
    refreshProviderCredits().catch(() => {});
    const interval = window.setInterval(() => refreshProviderCredits().catch(() => {}), 20000);
    return () => window.clearInterval(interval);
  }, []);

  const mapSongRow = (row: any): SongItem => ({
    id: String(row?.id || ''),
    title: String(row?.title || 'Pista sin título'),
    description: typeof row?.description === 'string' ? row.description : undefined,
    lyrics: typeof row?.lyrics === 'string' ? row.lyrics : undefined,
    genre: typeof row?.gender === 'string' ? row.gender : undefined,
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
    const d = await loadSongs(true);
    if (d.ok) setCancionesEliminadas(d.songs);
    if (a.ok && a.cleanupDeleted && a.cleanupDeleted > 0) {
      showToast(`Se eliminaron automáticamente ${a.cleanupDeleted} canciones (plan gratis: 15 días).`);
    }
  };

  useEffect(() => {
    refreshLibrary().catch(() => {});
  }, []);

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
      refreshProviderCredits().catch(() => {});
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error guardando en biblioteca');
    }
  };

  useEffect(() => {
    let busy = false;
    const readPending = () => {
      try {
        const raw = window.localStorage.getItem(pendingKey);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        const taskId = typeof parsed?.taskId === 'string' ? parsed.taskId.trim() : '';
        if (!taskId) return null;
        const kind = typeof parsed?.kind === 'string' ? parsed.kind.trim() : 'generate';
        const draft = parsed?.draft ?? null;
        return { taskId, kind, draft };
      } catch {
        return null;
      }
    };

    const extractTrack = (payload: any) => {
      const d = payload?.data || payload?.data?.data || payload;
      const list =
        (Array.isArray(d?.response?.data) && d.response.data) ||
        (Array.isArray(d?.response?.sunoData) && d.response.sunoData) ||
        [];
      const track = list[0] || null;
      const audioUrl = (track?.audio_url || track?.audioUrl || track?.streamAudioUrl || '').toString();
      const audioId = (track?.id || '').toString();
      const title = (track?.title || '').toString();
      const coverUrl = (track?.image_url || track?.imageUrl || '').toString();
      return { audioUrl, audioId, title, coverUrl };
    };

    const tick = async () => {
      if (busy) return;
      const pending = readPending();
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

        if (status === 'SUCCESS') {
          const track = extractTrack(data);
          if (!track.audioUrl) {
            showToast('Se generó, pero no recibí el audio.');
            window.localStorage.removeItem(pendingKey);
            return;
          }
          const draft = pending.draft ?? {};
          await addCancion({
            id: track.audioId || pending.taskId,
            title: track.title || String(draft?.title || 'Canción'),
            description: String(draft?.description || ''),
            lyrics: typeof draft?.lyrics === 'string' && draft.lyrics.trim() ? draft.lyrics : undefined,
            genre: typeof draft?.genre === 'string' ? draft.genre : undefined,
            audioUrl: track.audioUrl,
            coverUrl: track.coverUrl || undefined,
            sunoTaskId: pending.taskId,
            sunoAudioId: track.audioId || null,
            isCover: Boolean(draft?.isCover),
          });
          window.localStorage.removeItem(pendingKey);
          showToast('Listo: se guardó en tu Biblioteca.');
          return;
        }

        if (status === 'FAILED' || status === 'CREATE_TASK_FAILED' || status === 'GENERATE_AUDIO_FAILED') {
          const msg =
            (data?.data?.errorMessage || data?.data?.error_message || data?.errorMessage || data?.error_message || 'Error en la generación').toString();
          window.localStorage.removeItem(pendingKey);
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
  }, []);

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
    
    if (song.audioUrl && audioRef.current) {
      audioRef.current.src = song.audioUrl;
      await audioRef.current.play();
      setIsPlaying(true);
      return;
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

  const displayCredits = Number.isFinite(Number(providerCredits)) ? Number(providerCredits) : credits;

  return (
    <div className="h-[100dvh] w-full text-white flex flex-col font-sans overflow-hidden relative">
      <TopBar
        className="flex-shrink-0"
        onMenuClick={() => setIsSettingsOpen(true)}
        onCreditsClick={() => setIsPricingOpen(true)}
        credits={displayCredits}
      />
      {showInstallBanner && (
        <div className="md:hidden px-3 pt-3">
          <div className="bg-gradient-to-r from-emerald-700/40 to-teal-600/20 border border-emerald-400/15 rounded-2xl px-3 py-3 flex items-center gap-3">
            <button
              onClick={() => setShowInstallBanner(false)}
              className="shrink-0 w-8 h-8 rounded-full bg-black/30 border border-white/10 text-slate-200 flex items-center justify-center"
              aria-label="Cerrar"
            >
              ✕
            </button>
            <div className="shrink-0 w-10 h-10 rounded-xl bg-black/40 border border-white/10 flex items-center justify-center font-extrabold text-white">
              R
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-white leading-tight">RAMBER Tunes</div>
              <div className="text-xs text-slate-200/90 leading-tight">Ponla como app en tu celular</div>
            </div>
            <button
              onClick={onInstallClick}
              className="shrink-0 bg-white text-black px-4 py-2 rounded-full text-xs font-extrabold"
            >
              VER
            </button>
          </div>
        </div>
      )}
      <Banner />
      
      <main className="flex-1 overflow-hidden flex w-full h-full relative">
        {/* Mobile View Switching */}
        <div className="flex-1 flex flex-col md:hidden pb-[76px] relative overflow-hidden">
           {currentTab === 'inicio' && <div className="flex-1 flex items-center justify-center text-slate-500">Inicio (Próximamente)</div>}
           {currentTab === 'studio' && <CreateView onSongCreated={addCancion} credits={displayCredits} openPersonaPickerSignal={personaPickerNonce} onGoLibrary={() => setCurrentTab('biblioteca')} />}
           {currentTab === 'biblioteca' && <LibraryView canciones={canciones} cancionesEliminadas={cancionesEliminadas} vibes={vibes} onAddVibe={addVibe} onPlaySong={playSong} onDeleteSong={deleteCancion} onRestoreSong={restoreCancion} onRefreshSongs={refreshLibrary} activeSongId={activeSong?.id} isPlaying={isPlaying} />}
           {currentTab === 'perfil' && <ProfileView credits={credits} />}
           
           {/* Placeholders */}
           {currentTab === 'mv' && <div className="flex-1 flex items-center justify-center text-slate-500">Music Videos (Próximamente)</div>}
        </div>
        {/* Desktop 3-column layout */}
        <div className="hidden md:flex flex-1 overflow-hidden">
           {/* Sidebar */}
           <div className="w-[200px] lg:w-[240px] shrink-0 border-r border-white/5 bg-black flex flex-col">
             <Sidebar currentTab={currentTab} onChange={setCurrentTab} />
           </div>

           {currentTab === 'inicio' ? (
             <div className="flex-1 flex items-center justify-center text-slate-500 bg-[#050505]">
               Inicio (Próximamente)
             </div>
           ) : (
             <>
               {/* Create View (Middle) */}
               <div className="w-[340px] lg:w-[420px] shrink-0 border-r border-white/5 bg-[#0a0a0a] flex flex-col relative z-20 shadow-[10px_0_30px_-10px_rgba(0,0,0,0.5)]">
                 <CreateView onSongCreated={addCancion} credits={displayCredits} openPersonaPickerSignal={personaPickerNonce} onGoLibrary={() => setCurrentTab('biblioteca')} />
               </div>

               {/* Library / Results View (Right) */}
               <div className="flex-1 flex flex-col bg-[#050505] relative z-10 w-full min-w-[300px]">
                {currentTab === 'perfil' ? <ProfileView credits={credits} /> : <LibraryView canciones={canciones} cancionesEliminadas={cancionesEliminadas} vibes={vibes} onAddVibe={addVibe} onPlaySong={playSong} onDeleteSong={deleteCancion} onRestoreSong={restoreCancion} onRefreshSongs={refreshLibrary} activeSongId={activeSong?.id} isPlaying={isPlaying} />}
               </div>
             </>
           )}
        </div>
      </main>

      <MiniPlayer 
        song={activeSong} 
        isPlaying={isPlaying} 
        onPlayPause={togglePlay}
        onClose={() => setActiveSong(null)}
        placement={currentTab === 'studio' ? 'aboveCreate' : 'default'}
      />
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
        className="hidden" 
      />

      {isSettingsOpen && <SettingsView onClose={() => setIsSettingsOpen(false)} onOpenPricing={() => setIsPricingOpen(true)} />}
      {isPricingOpen && <PricingView onClose={() => setIsPricingOpen(false)} />}
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
