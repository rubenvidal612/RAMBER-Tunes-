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
import { getAccessToken, signInWithGoogle, supabaseBrowser } from './lib/supabaseBrowser';
import { CREDIT_COSTS } from './lib/credits';

import { Banner } from './components/Banner';
import { Sidebar } from './components/Sidebar';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

export default function App() {
  const [currentTab, setCurrentTab] = useState<ViewTab>('studio');
  const [canciones, setCanciones] = useState<SongItem[]>([]);
  const [cancionesEliminadas, setCancionesEliminadas] = useState<SongItem[]>([]);
  const [vibes, setVibes] = useState<VibeItem[]>([]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [personaPickerNonce, setPersonaPickerNonce] = useState(0);
  const [toast, setToast] = useState<string>('');
  const toastTimerRef = useRef<number | null>(null);
  const [providerCredits, setProviderCredits] = useState<number | null>(null);
  const [isPricingOpen, setIsPricingOpen] = useState(false);
  const [isBalanceOpen, setIsBalanceOpen] = useState(false);
  const [balanceData, setBalanceData] = useState<any>(null);
  const [isBalanceLoading, setIsBalanceLoading] = useState(false);
  const [balanceError, setBalanceError] = useState<string>('');
  const [isStartingLogin, setIsStartingLogin] = useState(false);
  const [authEmail, setAuthEmail] = useState('');
  
  const [activeSong, setActiveSong] = useState<SongItem | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const { credits, refreshCredits } = useUserCredits();
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [installPromptEvent, setInstallPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const pendingListKey = 'ramber.pendingSunoTasks_v1';
  const pendingLegacyKey = 'ramber.pendingSunoTask';

  const showToast = (message: string) => {
    setToast(message);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(''), 4500);
  };

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

  useEffect(() => {
    const p = (window.location?.pathname || '').toString();
    const m = p.match(/^\/(share|s)\/([^/?#]+)/i);
    if (!m) return;
    const rawId = m[2] || '';
    const id = decodeURIComponent(rawId).trim();
    if (!id) return;
    fetch(`/api/share/song?id=${encodeURIComponent(id)}`, { method: 'GET' })
      .then((r) => r.json().catch(() => ({})).then((out) => ({ r, out })))
      .then(({ r, out }) => {
        if (!r.ok) {
          showToast((out?.error || 'No pude abrir el link compartido.').toString());
          return;
        }
        const url = (out?.audioUrl || out?.audio_url || '').toString().trim();
        if (!url) {
          showToast('Este link no tiene audio.');
          return;
        }
        window.location.replace(url);
      })
      .catch(() => {
        showToast('No pude abrir el link compartido.');
      });
  }, []);

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

  const refreshBalance = async () => {
    setIsBalanceLoading(true);
    setBalanceError('');
    try {
      const t = await getAccessToken();
      if (!t.ok) {
        setBalanceError(t.error || 'No se pudo iniciar sesión.');
        return;
      }
      const r = await fetch('/api/account/balance?source=provider', { headers: { authorization: `Bearer ${t.token}` } });
      const out = await r.json().catch(() => ({}));
      if (!r.ok) {
        setBalanceError((out?.error || 'No pude consultar tu saldo.').toString());
        return;
      }
      setBalanceData(out);
      const c = Number(out?.credits);
      if (Number.isFinite(c)) setProviderCredits(c);
    } finally {
      setIsBalanceLoading(false);
    }
  };

  useEffect(() => {
    if (!isAuthed) return;
    refreshProviderCredits().catch(() => {});
    const interval = window.setInterval(() => refreshProviderCredits().catch(() => {}), 20000);
    return () => window.clearInterval(interval);
  }, [isAuthed]);

  useEffect(() => {
    if (!isAuthed) return;
    const onVis = () => {
      if (document.visibilityState !== 'visible') return;
      refreshCredits().catch(() => {});
      refreshProviderCredits().catch(() => {});
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onVis);
    };
  }, [isAuthed, refreshCredits]);

  useEffect(() => {
    if (!isBalanceOpen) return;
    refreshBalance().catch(() => {});
  }, [isBalanceOpen]);

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
    else showToast((a.error || 'No pude cargar tu biblioteca.').toString());
    const d = await loadSongs(true);
    if (d.ok) setCancionesEliminadas(d.songs);
    if (a.ok && a.cleanupDeleted && a.cleanupDeleted > 0) {
      showToast(`Se eliminaron automáticamente ${a.cleanupDeleted} canciones (plan gratis: 15 días).`);
    }
  };

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
        await fetch('/api/account/bootstrap-profile', {
          method: 'POST',
          headers: { authorization: `Bearer ${t.token}` },
        }).catch(() => {});
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
      refreshProviderCredits().catch(() => {});
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error guardando en biblioteca');
    }
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
      return (Array.isArray(list) ? list : []).map((track: any) => {
        const audioUrl = (track?.audio_url || track?.audioUrl || track?.streamAudioUrl || '').toString();
        const audioId = (track?.id || '').toString();
        const title = (track?.title || '').toString();
        const coverUrl = (track?.image_url || track?.imageUrl || '').toString();
        return { audioUrl, audioId, title, coverUrl };
      });
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
          const tracks = extractTracks(data).filter((x) => x && x.audioUrl);
          if (tracks.length === 0) {
            return;
          }
          const draft = pending.draft ?? {};
          const baseTitle = String(draft?.title || 'Canción');
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
              lyrics: typeof draft?.lyrics === 'string' && draft.lyrics.trim() ? draft.lyrics : undefined,
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

  if (!isAuthed) {
    return (
      <div className="h-[100dvh] w-full bg-black text-white flex flex-col items-center justify-center px-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-yellow-400 text-black flex items-center justify-center font-light text-4xl shadow-[0_0_18px_rgba(250,204,21,0.35)]">
          R
        </div>
        <div className="mt-4 text-xl font-extrabold">RAMBER Tunes</div>
        <div className="mt-2 text-sm text-slate-300">Para usar la app necesitas entrar con tu cuenta Gmail.</div>
        <div className="mt-2 text-xs text-slate-500">Supabase: {supabaseBrowser ? 'conectado' : 'no configurado'}</div>
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
    <div className="h-[100dvh] w-full text-white flex flex-col font-sans overflow-hidden relative">
      <TopBar
        className="flex-shrink-0"
        onMenuClick={() => setIsSettingsOpen(true)}
        onCreditsClick={() => setIsBalanceOpen(true)}
        credits={displayCredits}
      />
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
              <div className="text-xs text-slate-200/90 leading-tight">Ponla en tu App en tu Celular</div>
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
      
      <main className="flex-1 overflow-hidden flex w-full h-full relative">
        {/* Mobile View Switching */}
        <div className="flex-1 flex flex-col md:hidden pb-[76px] relative overflow-hidden">
           {currentTab === 'inicio' && <div className="flex-1 flex items-center justify-center text-slate-500">Inicio (Próximamente)</div>}
           {currentTab === 'studio' && <CreateView onSongCreated={addCancion} credits={displayCredits} openPersonaPickerSignal={personaPickerNonce} onGoLibrary={() => setCurrentTab('biblioteca')} onOpenBalance={() => setIsBalanceOpen(true)} />}
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
                 <CreateView onSongCreated={addCancion} credits={displayCredits} openPersonaPickerSignal={personaPickerNonce} onGoLibrary={() => setCurrentTab('biblioteca')} onOpenBalance={() => setIsBalanceOpen(true)} />
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
                  <div className="text-slate-200 text-sm font-semibold">Separar Instrumentos y Voces</div>
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
