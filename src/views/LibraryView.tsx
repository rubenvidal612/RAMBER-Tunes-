import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { type LibraryTab, type SongItem, type VibeItem } from '@/types';
import { cn } from '@/lib/utils';
import { Sparkles, Plus, Image as ImageIcon, ChevronDown, ChevronRight, Play, Pause, ThumbsUp, Settings2, Search, MoreVertical, Share2, Download, Trash2, Flag, Pencil, AudioLines, Repeat2, Sparkle, FileText, Video, BadgeCheck, Shield, ListMusic, FolderPlus, X, Scissors, Cast, Volume2, VolumeX, Lock } from 'lucide-react';
import { ensureAnonSession, getAccessToken, supabaseBrowser } from '@/lib/supabaseBrowser';
import { jsPDF } from 'jspdf';
import { VoiceSelector } from '@/components/VoiceSelector';

const isDev = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
const DOWNLOAD_SOON_TOAST = 'Tu archivo se descargará en un momento.';

interface LibraryViewProps {
  canciones: SongItem[];
  cancionesEliminadas?: SongItem[];
  vibes: VibeItem[];
  onAddVibe: (v: VibeItem) => void;
  onPlaySong: (s: SongItem) => void;
  onToast?: (message: string) => void;
  onOpenElenco?: (s: SongItem) => void;
  onDeleteSong?: (id: string) => void;
  onRestoreSong?: (id: string) => void;
  onPurgeSong?: (id: string) => void;
  onRefreshSongs?: () => void;
  activeSongId?: string;
  isPlaying?: boolean;
  onStartCover?: (song: SongItem) => void;
}

export function LibraryView({ canciones, cancionesEliminadas, vibes, onAddVibe, onPlaySong, onToast, onOpenElenco, onDeleteSong, onRestoreSong, onPurgeSong, onRefreshSongs, activeSongId, isPlaying, onStartCover }: LibraryViewProps) {
  const [activeTab, setActiveTab] = useState<LibraryTab>('canciones');
  const [isCreateVibeOpen, setIsCreateVibeOpen] = useState(false);
  const [isCreateListOpen, setIsCreateListOpen] = useState(false);
  const [menuSong, setMenuSong] = useState<SongItem | null>(null);
  const [showTrash, setShowTrash] = useState(false);
  const [mobileHeaderMenuOpen, setMobileHeaderMenuOpen] = useState(false);
  const mobileHeaderMenuBtnRef = useRef<HTMLButtonElement>(null);
  const mobileHeaderMenuRef = useRef<HTMLDivElement>(null);
  const [mobileFilterSortOpen, setMobileFilterSortOpen] = useState(false);
  const [pendingTasks, setPendingTasks] = useState<Array<{ taskId: string; kind: string; startedAt: number; providerStatus?: string; progressPct?: number; retryPaused?: boolean }>>([]);
  const [pendingSyncBusy, setPendingSyncBusy] = useState(false);
  useEffect(() => {
    const onSync = (event: Event) => setPendingSyncBusy(Boolean((event as CustomEvent).detail?.busy));
    window.addEventListener('ramber:pendingSyncState', onSync);
    return () => window.removeEventListener('ramber:pendingSyncState', onSync);
  }, []);
  const [pendingRvcCovers, setPendingRvcCovers] = useState<Array<{ predictionId: string; startedAt: number; songId?: string; voiceId?: string }>>([]);
  const [pendingRvcCoverUi, setPendingRvcCoverUi] = useState<{
    status: string;
    replicateStatus?: string | null;
    replicateHttpStatus?: number | null;
    replicateCheckedAt?: number | null;
    replicateFetchError?: string | null;
    progressPct: number;
    imported?: boolean;
    importError?: string | null;
    outputUrl?: string | null;
  } | null>(null);
  const [pendingRvcAuthError, setPendingRvcAuthError] = useState<string>('');
  const [completedDownloads, setCompletedDownloads] = useState<Array<{ taskId: string; kind: string; doneAt: number; draft?: any }>>([]);
  const [downloadsModalOpen, setDownloadsModalOpen] = useState(false);
  const [downloadsModalTitle, setDownloadsModalTitle] = useState('');
  const [downloadingSongId, setDownloadingSongId] = useState<string | null>(null);
  const libraryContainerRef = useRef<HTMLDivElement>(null);
  const [selectedSongId, setSelectedSongId] = useState('');
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [selectedDetailTab, setSelectedDetailTab] = useState<'informacion' | 'letra' | 'detalles' | 'estadisticas'>('informacion');

  // Efecto para hacer scroll automático cuando se agregan nuevas canciones
  useEffect(() => {
    if (libraryContainerRef.current && canciones.length > 0) {
      // Hacer scroll hacia arriba para mostrar las canciones nuevas
      libraryContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [canciones.length]);

  const handleDeleteSong = async (song: SongItem | null) => {
    if (!song || !onDeleteSong) return;
    try {
      await onDeleteSong(song.id);
      onRefreshSongs?.();
    } catch (error) {
      console.error('Error al eliminar canción:', error);
      alert('No se pudo eliminar la canción');
    }
  };

  const [downloadsModalTaskId, setDownloadsModalTaskId] = useState('');
  const [downloadsModalKind, setDownloadsModalKind] = useState('');
  const [downloadsModalCoverUrl, setDownloadsModalCoverUrl] = useState('');
  const [downloadsModalSourceSongId, setDownloadsModalSourceSongId] = useState('');
  const [downloadsModalItems, setDownloadsModalItems] = useState<Array<{ key: string; label: string; url: string; audioId?: string }>>([]);
  const [downloadsModalBusy, setDownloadsModalBusy] = useState(false);
  const [downloadsModalError, setDownloadsModalError] = useState('');
  const [downloadsModalSaving, setDownloadsModalSaving] = useState(false);
  const [downloadsModalZipping, setDownloadsModalZipping] = useState(false);
  const [downloadsModalMuted, setDownloadsModalMuted] = useState<Record<string, boolean>>({});
  const [downloadsModalMixing, setDownloadsModalMixing] = useState(false);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [videoTasks, setVideoTasks] = useState<Array<{ taskId: string; createdAt?: string }>>([]);
  const [videoThumbs, setVideoThumbs] = useState<Record<string, string>>({});
  const [videoTitles, setVideoTitles] = useState<Record<string, string>>({});
  const [videoLoading, setVideoLoading] = useState(false);
  const [videoError, setVideoError] = useState('');
  const [openVideoMenuId, setOpenVideoMenuId] = useState<string | null>(null);
  const [searchDraft, setSearchDraft] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [brokenCovers, setBrokenCovers] = useState<Record<string, boolean>>({});
  const [likedSongIds, setLikedSongIds] = useState<Record<string, boolean>>({});
  const [songActionBusy, setSongActionBusy] = useState<Record<string, boolean>>({});
  const didAutoResetDateFiltersRef = useRef(false);
  const [sharePickerSong, setSharePickerSong] = useState<SongItem | null>(null);
  const [countdownShareSong, setCountdownShareSong] = useState<SongItem | null>(null);
  const [countdownClientLabel, setCountdownClientLabel] = useState('');
  const [countdownValue, setCountdownValue] = useState('24');
  const [countdownUnit, setCountdownUnit] = useState<'minutes' | 'hours' | 'days'>('hours');
  const [countdownBusy, setCountdownBusy] = useState(false);
  const [shareResult, setShareResult] = useState<null | {
    url: string;
    title: string;
    description: string;
    isCountdown: boolean;
  }>(null);

  const [songDurationsSec, setSongDurationsSec] = useState<Record<string, number>>(() => {
    try {
      const raw = window.localStorage.getItem('ramber.song_durations_v1');
      const parsed = raw ? JSON.parse(raw) : null;
      const obj = parsed && typeof parsed === 'object' ? parsed : {};
      const out: Record<string, number> = {};
      for (const [k, v] of Object.entries(obj)) {
        const id = String(k || '').trim();
        const n = Number(v);
        if (!id) continue;
        if (!Number.isFinite(n) || n <= 0) continue;
        out[id] = n;
      }
      return out;
    } catch {
      return {};
    }
  });
  const songDurationsRef = useRef<Record<string, number>>({});
  const durationInFlightRef = useRef<Set<string>>(new Set());

  const fmtDuration = (sec: number) => {
    const s = Math.max(0, Math.floor(Number.isFinite(sec) ? sec : 0));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${String(r).padStart(2, '0')}`;
  };

  const normalizeSearchText = (raw: string) => {
    const s = (raw || '').toString().trim().toLowerCase();
    if (!s) return '';
    try {
      return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    } catch {
      return s;
    }
  };

  const activeFilterCount = useMemo(() => {
    const n1 = String(filterFrom || '').trim() ? 1 : 0;
    const n2 = String(filterTo || '').trim() ? 1 : 0;
    const n3 = sortOrder !== 'newest' ? 1 : 0;
    return n1 + n2 + n3;
  }, [filterFrom, filterTo, sortOrder]);

  useEffect(() => {
    if (!mobileHeaderMenuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileHeaderMenuOpen(false);
    };
    const onDown = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      const btn = mobileHeaderMenuBtnRef.current;
      const menu = mobileHeaderMenuRef.current;
      if (btn && btn.contains(t)) return;
      if (menu && menu.contains(t)) return;
      setMobileHeaderMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onDown);
    window.addEventListener('touchstart', onDown, { passive: true } as any);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('touchstart', onDown as any);
    };
  }, [mobileHeaderMenuOpen]);

  const makeFallbackCoverSvgUrl = (seed: string) => {
    const s = (seed || 'cancion').toString().slice(0, 80);
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    const hue1 = h % 360;
    const hue2 = (hue1 + 55) % 360;
    const label = (seed || 'Canción').toString().trim().slice(0, 22);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue1} 85% 55%)"/><stop offset="1" stop-color="hsl(${hue2} 85% 45%)"/></linearGradient></defs><rect width="512" height="512" rx="56" fill="url(#g)"/><rect width="512" height="512" rx="56" fill="rgba(0,0,0,0.28)"/><text x="256" y="290" text-anchor="middle" font-family="system-ui, -apple-system, Segoe UI, Roboto, Arial" font-size="220" font-weight="300" fill="rgba(255,255,255,0.92)">L</text><text x="40" y="468" font-family="system-ui, -apple-system, Segoe UI, Roboto, Arial" font-size="42" font-weight="800" fill="rgba(255,255,255,0.92)">${label.replaceAll('&', 'y').replaceAll('<', '').replaceAll('>', '')}</text></svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  };

  const loadDurationFromUrl = (url: string) =>
    new Promise<number | null>((resolve) => {
      const u = (url || '').toString().trim();
      if (!u) return resolve(null);
      const a = document.createElement('audio');
      a.preload = 'metadata';
      a.muted = true;
      let done = false;
      const finish = (v: number | null) => {
        if (done) return;
        done = true;
        try {
          a.pause();
        } catch {}
        try {
          a.removeAttribute('src');
          a.load();
        } catch {}
        resolve(v);
      };
      const timer = window.setTimeout(() => finish(null), 15000);
      const onMeta = () => {
        const d = Number(a.duration);
        if (!Number.isFinite(d) || d <= 0) return;
        window.clearTimeout(timer);
        finish(d);
      };
      const onErr = () => {
        window.clearTimeout(timer);
        finish(null);
      };
      a.addEventListener('loadedmetadata', onMeta);
      a.addEventListener('durationchange', onMeta);
      a.addEventListener('error', onErr);
      try {
        a.src = u;
        a.load();
      } catch {
        window.clearTimeout(timer);
        finish(null);
      }
    });

  useEffect(() => {
    songDurationsRef.current = songDurationsSec;
    try {
      window.localStorage.setItem('ramber.song_durations_v1', JSON.stringify(songDurationsSec));
    } catch {
    }
  }, [songDurationsSec]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const t = await getAccessToken();
      if (!t.ok) return;
      const r = await fetch('/api/likes/likes', { headers: { authorization: `Bearer ${t.token}` } });
      const out = await r.json().catch(() => ({}));
      if (!r.ok || out?.ok === false) return;
      const items = Array.isArray(out?.items) ? out.items : [];
      const next: Record<string, boolean> = {};
      for (const item of items) {
        const sid = String(item?.songId || item?.song_id || '').trim();
        if (!sid) continue;
        next[sid] = true;
      }
      if (!alive) return;
      setLikedSongIds(next);
    })().catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const list = showTrash ? (Array.isArray(cancionesEliminadas) ? cancionesEliminadas : []) : (Array.isArray(canciones) ? canciones : []);
    const entries = list
      .map((s) => ({
        id: String((s as any)?.id || '').trim(),
        url: String((s as any)?.audioUrl || '').trim(),
      }))
      .filter((s) => s.id);
    const missing = entries.filter((s) => !Number.isFinite(Number(songDurationsRef.current[s.id] || 0)) || Number(songDurationsRef.current[s.id] || 0) <= 0);
    const toQueue = missing.filter((s) => !durationInFlightRef.current.has(s.id));
    if (toQueue.length === 0) return;

    const maxConcurrent = 2;
    let idx = 0;
    let active = 0;

    const next = () => {
      if (cancelled) return;
      while (active < maxConcurrent && idx < toQueue.length) {
        const item = toQueue[idx++];
        const id = item?.id || '';
        const url = item?.url || (id ? `/api/share/song/audio?id=${encodeURIComponent(id)}&t=${Date.now()}` : '');
        if (!id || !url) continue;
        durationInFlightRef.current.add(id);
        active++;
        loadDurationFromUrl(url)
          .then((d) => {
            if (cancelled) return;
            if (!Number.isFinite(Number(d)) || Number(d) <= 0) return;
            setSongDurationsSec((prev) => {
              const cur = Number(prev?.[id] || 0);
              const nextV = Number(d);
              if (Number.isFinite(cur) && cur > 0 && Math.abs(cur - nextV) < 0.25) return prev;
              return { ...prev, [id]: nextV };
            });
          })
          .finally(() => {
            durationInFlightRef.current.delete(id);
            active--;
            next();
          });
      }
    };

    next();
    return () => {
      cancelled = true;
    };
  }, [showTrash, canciones, cancionesEliminadas]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (openVideoMenuId) {
        setOpenVideoMenuId(null);
      }
    };

    if (openVideoMenuId) {
      document.addEventListener('click', handleClickOutside);
    }

    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [openVideoMenuId]);

  type Folder = { id: string; name: string; createdAt: number };
  const [folders, setFolders] = useState<Folder[]>([]);
  const [songFolderId, setSongFolderId] = useState<Record<string, string>>({});
  const [activeFolderId, setActiveFolderId] = useState('');
  const [moveFolderSong, setMoveFolderSong] = useState<SongItem | null>(null);

  useEffect(() => {
    const pendingListKey = 'ramber.pendingSunoTasks_v1';
    const pendingLegacyKey = 'ramber.pendingSunoTask';
    const read = () => {
      try {
        const raw = window.localStorage.getItem(pendingListKey);
        const parsed = raw ? JSON.parse(raw) : null;
        const list = Array.isArray(parsed) ? parsed : [];
        if (list.length > 0) {
          return list
            .map((x: any) => ({
              taskId: typeof x?.taskId === 'string' ? x.taskId.trim() : '',
              kind: typeof x?.kind === 'string' ? x.kind.trim() : 'generate',
              startedAt: Number.isFinite(Number(x?.startedAt || 0)) ? Number(x.startedAt || 0) : 0,
              providerStatus: typeof x?.providerStatus === 'string' ? x.providerStatus.trim() : undefined,
              retryPaused: x?.retryPaused === true,
              progressPct: Number.isFinite(Number(x?.progressPct)) ? Number(x.progressPct) : undefined,
              failCount: Number.isFinite(Number(x?.failCount)) ? Number(x.failCount) : 0,
              lastError: typeof x?.lastError === 'string' ? x.lastError.trim() : '',
              lastErrorAt: Number.isFinite(Number(x?.lastErrorAt)) ? Number(x.lastErrorAt) : 0,
            }))
            .filter((x: any) => x.taskId);
        }

        const legacyRaw = window.localStorage.getItem(pendingLegacyKey);
        if (!legacyRaw) return [];
        const legacy = JSON.parse(legacyRaw);
        const taskId = typeof legacy?.taskId === 'string' ? legacy.taskId.trim() : '';
        if (!taskId) return [];
        const kind = typeof legacy?.kind === 'string' ? legacy.kind.trim() : 'generate';
        const startedAt = Number(legacy?.startedAt || 0);
        const migrated = [{ taskId, kind, startedAt: Number.isFinite(startedAt) ? startedAt : Date.now() }];
        try {
          window.localStorage.setItem(pendingListKey, JSON.stringify(migrated));
          window.localStorage.removeItem(pendingLegacyKey);
        } catch {
        }
        return migrated;
      } catch {
        return [];
      }
    };
    setPendingTasks(read());
    const id = window.setInterval(() => setPendingTasks(read()), 1200);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const key = 'ramber.pendingRvcCovers_v1';
    const read = () => {
      try {
        const raw = window.localStorage.getItem(key);
        const parsed = raw ? JSON.parse(raw) : null;
        const list = Array.isArray(parsed) ? parsed : [];
        return list
          .map((x: any) => ({
            predictionId: typeof x?.predictionId === 'string' ? x.predictionId.trim() : '',
            startedAt: Number.isFinite(Number(x?.startedAt || 0)) ? Number(x.startedAt || 0) : 0,
            songId: typeof x?.songId === 'string' ? x.songId.trim() : undefined,
            voiceId: typeof x?.voiceId === 'string' ? x.voiceId.trim() : undefined,
          }))
          .filter((x: any) => x.predictionId);
      } catch {
        return [];
      }
    };
    setPendingRvcCovers(read());
    const id = window.setInterval(() => setPendingRvcCovers(read()), 1200);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (showTrash) return;
    if (pendingRvcCovers.length === 0) return;
    let alive = true;
    const key = 'ramber.pendingRvcCovers_v1';
    const tick = async () => {
      try {
        const first = pendingRvcCovers[0];
        if (!first?.predictionId) return;
        const t = await getAccessToken();
        if (!t.ok) {
          if (!alive) return;
          setPendingRvcAuthError((t.error || 'Necesitas iniciar sesión otra vez.').toString());
          return;
        }
        if (!alive) return;
        setPendingRvcAuthError('');
        const r = await fetch(`/api/rvc/cover-status?predictionId=${encodeURIComponent(first.predictionId)}`, {
          headers: { authorization: `Bearer ${t.token}` },
        });
        const out = await r.json().catch(() => ({}));
        if (!alive) return;
        if (!r.ok || out?.ok !== true) {
          const msg = [out?.error, out?.detail, out?.hint]
            .map((x: any) => (typeof x === 'string' ? x.trim() : ''))
            .filter(Boolean)
            .join('\n\n');
          const base = msg || `No pude consultar el estado del cover (HTTP ${Number(r.status || 0) || 0}).`;
          setPendingRvcCoverUi((prev) => ({
            status: (prev?.status || 'processing').toString(),
            replicateStatus: prev?.replicateStatus ?? null,
            replicateHttpStatus: Number(r.status || 0) || null,
            replicateCheckedAt: Date.now(),
            replicateFetchError: base,
            progressPct: prev?.progressPct ?? 0,
            imported: Boolean(prev?.imported),
            importError: prev?.importError ?? null,
            outputUrl: prev?.outputUrl ?? null,
          }));
          return;
        }

        const rawStatus = (out?.replicateStatus || out?.status || '').toString().trim().toLowerCase();
        const now = Date.now();
        const base = Math.max(0, Number(first?.startedAt || 0));
        const step = Math.max(0, Math.floor((now - base) / 3500));
        const simulatedBase = Math.min(98, Math.max(3, 5 + step * 2));
        const simulated = (() => {
          if (rawStatus === 'starting') return Math.min(30, simulatedBase);
          if (rawStatus === 'processing') return Math.min(90, simulatedBase);
          if (rawStatus === 'succeeded' || rawStatus === 'completed' || rawStatus === 'ready') return Math.min(99, Math.max(95, simulatedBase));
          return simulatedBase;
        })();
        const pctFromStatus = (() => {
          if (out?.imported) return 100;
          if (rawStatus === 'starting') return 10;
          if (rawStatus === 'processing') return 70;
          if (rawStatus === 'succeeded' || rawStatus === 'completed' || rawStatus === 'ready') return 98;
          if (rawStatus === 'failed' || rawStatus === 'canceled' || rawStatus === 'error') return 100;
          return null;
        })();
        const pctRaw = pctFromStatus == null ? simulated : Math.max(simulated, pctFromStatus);
        const pct = rawStatus === 'processing' ? Math.min(90, pctRaw) : pctRaw;
        setPendingRvcCoverUi({
          status: (out?.status || 'processing').toString(),
          replicateStatus: out?.replicateStatus ?? null,
          replicateHttpStatus: typeof out?.replicateHttpStatus === 'number' ? out.replicateHttpStatus : null,
          replicateCheckedAt: typeof out?.replicateCheckedAt === 'number' ? out.replicateCheckedAt : null,
          replicateFetchError: typeof out?.replicateFetchError === 'string' ? out.replicateFetchError : null,
          progressPct: Math.max(0, Math.min(100, Number(pct))),
          imported: Boolean(out?.imported),
          importError: typeof out?.importError === 'string' ? out.importError : null,
          outputUrl: typeof out?.outputUrl === 'string' ? out.outputUrl : null,
        });

        if (out?.imported) {
          try {
            const raw = window.localStorage.getItem(key);
            const parsed = raw ? JSON.parse(raw) : null;
            const list = Array.isArray(parsed) ? parsed : [];
            const next = list.filter((x: any) => String(x?.predictionId || '').trim() !== first.predictionId);
            if (next.length === 0) window.localStorage.removeItem(key);
            else window.localStorage.setItem(key, JSON.stringify(next.slice(-10)));
          } catch {
          }
          onRefreshSongs?.();
        }
        const status = String(out?.status || '').toLowerCase();
        if (status === 'failed') {
          try {
            window.localStorage.removeItem(key);
          } catch {
          }
        }
      } catch {
      }
    };
    tick().catch(() => {});
    const id = window.setInterval(() => tick().catch(() => {}), 6000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [pendingRvcCovers, onRefreshSongs, showTrash]);

  useEffect(() => {
    const completedKey = 'ramber.completedSunoDownloads_v1';
    const read = () => {
      try {
        const raw = window.localStorage.getItem(completedKey);
        const parsed = raw ? JSON.parse(raw) : null;
        const list = Array.isArray(parsed) ? parsed : [];
        return list
          .map((x: any) => ({
            taskId: typeof x?.taskId === 'string' ? x.taskId.trim() : '',
            kind: typeof x?.kind === 'string' ? x.kind.trim() : '',
            doneAt: Number.isFinite(Number(x?.doneAt || 0)) ? Number(x.doneAt || 0) : 0,
            draft: x?.draft ?? null,
          }))
          .filter((x: any) => x.taskId && x.kind);
      } catch {
        return [];
      }
    };
    setCompletedDownloads(read());
    const id = window.setInterval(() => setCompletedDownloads(read()), 1200);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem('ramber.libraryFilters_v1');
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed && typeof parsed === 'object') {
        const sanitizeFilterDate = (value: unknown) => {
          const rawValue = typeof value === 'string' ? value.trim() : '';
          if (!/^\d{4}-\d{2}-\d{2}$/.test(rawValue)) return '';
          const ms = new Date(`${rawValue}T00:00:00`).getTime();
          return Number.isFinite(ms) ? rawValue : '';
        };
        const from = sanitizeFilterDate(parsed.from);
        const to = sanitizeFilterDate(parsed.to);
        const s = typeof parsed.sort === 'string' ? parsed.sort : '';
        setFilterFrom(from);
        setFilterTo(to);
        setSortOrder(s === 'oldest' ? 'oldest' : 'newest');
      }
    } catch {
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem('ramber.libraryFilters_v1', JSON.stringify({ from: filterFrom, to: filterTo, sort: sortOrder }));
    } catch {
    }
  }, [filterFrom, filterTo, sortOrder]);

  const loadVideos = async () => {
    setVideoLoading(true);
    setVideoError('');
    try {
      const t = await getAccessToken();
      if (!t.ok) {
        setVideoError(t.error || 'No se pudo iniciar sesión.');
        return;
      }
      const r = await fetch('/api/videos/list?limit=60', { headers: { authorization: `Bearer ${t.token}` } });
      const out = await r.json().catch(() => ({}));
      if (!r.ok) {
        setVideoError((out?.detail || out?.error || 'No pude cargar tus videos.').toString());
        return;
      }
      const items = Array.isArray(out?.items) ? out.items : [];
      const list = items
        .map((x: any) => ({ taskId: String(x?.taskId || '').trim(), createdAt: String(x?.created_at || '').trim() }))
        .filter((x: any) => x.taskId);
      setVideoTasks(list);
    } finally {
      setVideoLoading(false);
    }
  };

  const pickFirst = (...values: any[]) => {
    for (const v of values) {
      const s = typeof v === 'string' ? v.trim() : '';
      if (s) return s;
    }
    return '';
  };

  const normalizePublicUrl = (url: string) => {
    const u = (url || '').toString().trim();
    if (!u) return '';
    if (/^https:\/\//i.test(u)) return u;
    if (/^http:\/\//i.test(u)) return u.replace(/^http:\/\//i, 'https://');
    if (/^\/\//.test(u)) return `https:${u}`;
    return u;
  };

  const formatGenderPresentation = (raw: string) => {
    const s = (raw || '').toString().trim();
    const lower = s.toLowerCase();
    if (lower === 'm') return 'Masculino';
    if (lower === 'f') return 'Femenino';
    return s;
  };

  const toastDownloadSoon = () => {
    try {
      onToast?.(DOWNLOAD_SOON_TOAST);
    } catch {}
  };

  const sanitizeFileName = (s: string) =>
    (s || '')
      .toString()
      .replace(/[\\/:*?"<>|]+/g, '_')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120);

  const downloadBlobAsFile = async (blob: Blob, filename: string) => {
    try {
      const obj = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = obj;
      a.download = sanitizeFileName(filename) || 'audio.mp3';
      try { document.body.appendChild(a); } catch {}
      a.click();
      try { if (a.parentNode) a.parentNode.removeChild(a); } catch {}
      window.setTimeout(() => {
        try {
          URL.revokeObjectURL(obj);
        } catch {
        }
      }, 60_000);
      return true;
    } catch {
      return false;
    }
  };

  const downloadToDevice = async (url: string, filename: string) => {
    try {
      toastDownloadSoon();
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = await res.arrayBuffer();
      const blob = new Blob([buf], { type: res.headers.get('content-type') || 'application/octet-stream' });
      await downloadBlobAsFile(blob, filename);
      return true;
    } catch {
      try {
        const a = document.createElement('a');
        a.href = url;
        a.target = '_blank';
        a.rel = 'noreferrer';
        a.download = sanitizeFileName(filename) || 'audio.mp3';
        try { document.body.appendChild(a); } catch {}
        a.click();
        try { if (a.parentNode) a.parentNode.removeChild(a); } catch {}
        return true;
      } catch {
        return false;
      }
    }
  };

  const setSongBusy = (songId: string, busy: boolean) => {
    const sid = String(songId || '').trim();
    if (!sid) return;
    setSongActionBusy((prev) => {
      if (busy) return { ...prev, [sid]: true };
      if (!prev[sid]) return prev;
      const next = { ...prev };
      delete next[sid];
      return next;
    });
  };

  const openSharePicker = (song: SongItem) => {
    setSharePickerSong(song);
  };

  const copyTextToClipboard = async (text: string) => {
    const value = String(text || '').trim();
    if (!value) return false;
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
    }
    try {
      const ta = document.createElement('textarea');
      ta.value = value;
      ta.setAttribute('readonly', 'true');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      ta.style.top = '0';
      try { document.body.appendChild(ta); } catch {}
      ta.focus();
      ta.select();
      ta.setSelectionRange(0, ta.value.length);
      const ok = document.execCommand('copy');
      try { if (ta.parentNode) ta.parentNode.removeChild(ta); } catch {}
      return ok;
    } catch {
    }
    return false;
  };

  const copyCountdownLink = async (text: string) => {
    const value = String(text || '').trim();
    if (!value) return false;
    return copyTextToClipboard(value);
  };

  const openCountdownShare = async (song: SongItem) => {
    setSharePickerSong(null);
    setCountdownShareSong(song);
    setCountdownClientLabel('');
    setCountdownBusy(false);
    setShareResult(null);
    try {
      const t = await getAccessToken();
      if (!t.ok) return;
      const r = await fetch('/api/vendor/settings', {
        headers: { authorization: `Bearer ${t.token}` },
      });
      const out = await r.json().catch(() => ({}));
      const hours = Math.max(1, Number(out?.countdown_default_hours || 24) || 24);
      if (hours % 24 === 0) {
        setCountdownUnit('days');
        setCountdownValue(String(Math.max(1, Math.floor(hours / 24))));
      } else {
        setCountdownUnit('hours');
        setCountdownValue(String(hours));
      }
    } catch {
      setCountdownUnit('hours');
      setCountdownValue('24');
    }
  };

  const showPreviewLink = async (_song: SongItem, shareUrl: string, options?: { isCountdown?: boolean; description?: string }) => {
    const cleanUrl = String(shareUrl || '').trim();
    if (!cleanUrl) {
      alert('No hay link para compartir.');
      return;
    }
    setShareResult({
      url: cleanUrl,
      title: options?.isCountdown ? 'Enlace temporal creado' : 'Enlace creado',
      description: options?.description || (options?.isCountdown
        ? 'Este link abrirá el preview con cuenta regresiva.'
        : 'Este link abrirá el preview público sin cuenta regresiva.'),
      isCountdown: Boolean(options?.isCountdown),
    });
  };

  const createCountdownShare = async () => {
    const song = countdownShareSong;
    if (!song?.id) return;
    const amount = Math.max(1, Math.floor(Number(countdownValue) || 1));
    const hours = countdownUnit === 'days' ? amount * 24 : countdownUnit === 'hours' ? amount : 0;
    const countdownMinutes = countdownUnit === 'minutes' ? amount : 0;
    setCountdownBusy(true);
    try {
      const t = await getAccessToken();
      if (!t.ok) {
        alert(t.error || 'No se pudo iniciar sesión.');
        return;
      }
      const r = await fetch('/api/vendor/create-preview', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${t.token}` },
        body: JSON.stringify({
          songId: song.id,
          clientLabel: countdownClientLabel,
          hasCountdown: true,
          countdown_hours: hours,
          countdown_minutes: countdownMinutes,
          countdown_unit: countdownUnit,
        }),
      });
      const out = await r.json().catch(() => ({}));
      if (!r.ok || out?.ok === false) {
        alert((out?.error || 'No pude crear el link con cuenta regresiva.').toString());
        return;
      }
      const url = String(out?.url || '').trim();
      setCountdownShareSong(null);
      const unitLabel = countdownUnit === 'days' ? 'días' : countdownUnit === 'hours' ? 'horas' : 'minutos';
      await showPreviewLink(song, url, {
        isCountdown: true,
        description: `Listo. El enlace temporal estará activo por ${amount} ${unitLabel}.`,
      });
    } catch (e: any) {
      alert('Error inesperado: ' + (e?.message || String(e)));
    } finally {
      setCountdownBusy(false);
    }
  };

  const shareSongCard = async (song: SongItem) => {
    const shareUrl = song?.id ? `https://lucianamusic.app/share/${encodeURIComponent(song.id)}` : '';
    if (shareUrl) {
      await showPreviewLink(song, shareUrl, {
        isCountdown: false,
        description: 'Compártelo con tu cliente. Este enlace no expira automáticamente.',
      });
      return;
    }
    alert('No hay link para compartir.');
  };

  const toggleLikeForSong = async (song: SongItem) => {
    const sid = String(song?.id || '').trim();
    if (!sid) return;
    setSongBusy(sid, true);
    try {
      const t = await getAccessToken();
      if (!t.ok) {
        alert(t.error || 'No se pudo iniciar sesión.');
        return;
      }
      const next = !Boolean(likedSongIds[sid]);
      const r = await fetch('/api/likes/like', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${t.token}` },
        body: JSON.stringify({ songId: sid, like: next }),
      });
      const out = await r.json().catch(() => ({}));
      if (!r.ok || out?.ok === false) {
        alert((out?.error || out?.detail || 'No pude actualizar el like.').toString());
        return;
      }
      setLikedSongIds((prev) => ({ ...prev, [sid]: next }));
    } catch (e: any) {
      alert('Error inesperado: ' + (e?.message || String(e)));
    } finally {
      setSongBusy(sid, false);
    }
  };

  const downloadSongCard = async (song: SongItem) => {
    const sid = String(song?.id || '').trim();
    if (!sid) return;
    setSongBusy(sid, true);
    setDownloadingSongId(sid);
    try {
      const t = await getAccessToken();
      if (!t.ok) {
        alert(t.error || 'No se pudo iniciar sesión.');
        return;
      }
      const r = await fetch('/api/account/balance', {
        headers: { authorization: `Bearer ${t.token}` },
      });
      const out = await r.json().catch(() => ({}));
      if (!r.ok) {
        alert((out?.error || 'No pude verificar tu plan.').toString());
        return;
      }
      if (!out?.downloads_allowed) {
        alert('Puedes escuchar tu canción sin problema y la tendrás guardada en Biblioteca. Para descargarla, necesitas activar un plan.');
        return;
      }
      const externalId = String(song?.sunoAudioId || '').trim();
      if (/^rvc_/i.test(externalId)) {
        const cr = await fetch('/api/library/charge-download', {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${t.token}` },
          body: JSON.stringify({ id: sid }),
        });
        const cout = await cr.json().catch(() => ({}));
        if (!cr.ok || cout?.ok === false) {
          alert((cout?.error || 'No pude cobrar créditos para esta descarga.').toString());
          return;
        }
      }
      const audioUrl = String(song?.audioUrl || '').trim();
      if (!audioUrl) {
        alert('No hay audio para descargar.');
        return;
      }
      const name = sanitizeFileName(`${song?.title || 'Cancion'}.mp3`) || 'Cancion.mp3';
      const isRelative = !/^https?:\/\//i.test(audioUrl);
      const finalUrl = isRelative
        ? `/api/share/song/audio?id=${encodeURIComponent(sid)}&dl=1&filename=${encodeURIComponent(name)}&t=${Date.now()}`
        : audioUrl;
      await downloadToDevice(finalUrl, name);
    } catch (e: any) {
      alert('Error inesperado: ' + (e?.message || String(e)));
    } finally {
      setSongBusy(sid, false);
      setDownloadingSongId(null);
    }
  };

  let lameFactoryPromise: Promise<any> | null = null;
  const getLameFactory = async () => {
    if (!lameFactoryPromise) {
      lameFactoryPromise = import('lamejs/lame.all.js?raw').then((mod: any) => {
        const source = String(mod?.default || '').trim();
        if (!source) throw new Error('No pude cargar el convertidor MP3.');
        const factory = new Function(`${source}; return lamejs;`)();
        if (!factory?.Mp3Encoder) throw new Error('El convertidor MP3 no quedó disponible.');
        return factory;
      });
    }
    return lameFactoryPromise;
  };

  const encodeAudioBufferToMp3 = async (buffer: AudioBuffer, kbps: number) => {
    const mod: any = await getLameFactory();
    const Mp3Encoder = mod?.Mp3Encoder;
    if (!Mp3Encoder) throw new Error('No pude cargar el convertidor MP3.');

    const sr = Number(buffer.sampleRate || 44100) || 44100;
    const channels = Math.min(2, Math.max(1, Number(buffer.numberOfChannels || 2) || 2));
    const encoder = new Mp3Encoder(channels, sr, Math.max(64, Math.min(320, Math.floor(kbps))));

    const getCh = (i: number) => buffer.getChannelData(Math.min(i, buffer.numberOfChannels - 1));
    const left = getCh(0);
    const right = channels > 1 ? getCh(1) : left;

    const toInt16 = (f32: Float32Array) => {
      const out = new Int16Array(f32.length);
      for (let i = 0; i < f32.length; i++) {
        const s = Math.max(-1, Math.min(1, f32[i] || 0));
        out[i] = s < 0 ? Math.floor(s * 32768) : Math.floor(s * 32767);
      }
      return out;
    };

    const frameSize = 1152;
    const chunks: Uint8Array[] = [];
    for (let i = 0; i < left.length; i += frameSize) {
      const l = toInt16(left.subarray(i, i + frameSize));
      const r = channels > 1 ? toInt16(right.subarray(i, i + frameSize)) : l;
      const mp3buf = encoder.encodeBuffer(l as any, r as any);
      if (mp3buf && mp3buf.length > 0) chunks.push(new Uint8Array(mp3buf));
    }
    const end = encoder.flush();
    if (end && end.length > 0) chunks.push(new Uint8Array(end));
    return new Blob(chunks, { type: 'audio/mpeg' });
  };

  const downloadMixedStemsMp3 = async () => {
    const active = downloadsModalItems.filter((x) => !downloadsModalMuted[String(x?.key || '').trim()]);
    if (active.length === 0) {
      alert('No hay pistas activas para mezclar. Quita el mute a alguna.');
      return;
    }

    const hasGranular = active.some((x) => {
      const k = String(x?.key || '').trim();
      return k && k !== 'originUrl' && k !== 'instrumentalUrl' && k !== 'vocalUrl';
    });
    const list = (hasGranular ? active.filter((x) => String(x?.key || '').trim() !== 'instrumentalUrl') : active).filter(
      (x) => String(x?.key || '').trim() !== 'originUrl'
    );
    if (list.length === 0) {
      alert('No hay pistas activas para mezclar.');
      return;
    }

    setDownloadsModalMixing(true);
    try {
      const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) throw new Error('Tu navegador no soporta mezcla de audio.');
      const ctx: AudioContext = new AudioCtx();
      const decoded: AudioBuffer[] = [];

      for (const it of list) {
        const res = await fetch(it.url);
        if (!res.ok) throw new Error(`No pude descargar "${it.label}" (HTTP ${res.status}).`);
        const ab = await res.arrayBuffer();
        const b = await ctx.decodeAudioData(ab.slice(0) as any);
        decoded.push(b);
      }

      const sr = Number(ctx.sampleRate || 44100) || 44100;
      const maxLen = Math.max(...decoded.map((b) => Number(b.length || 0) || 0));
      if (!Number.isFinite(maxLen) || maxLen <= 0) throw new Error('No pude leer la duración de los stems.');

      const offline = new OfflineAudioContext(2, maxLen, sr);
      for (const b0 of decoded) {
        let b = b0;
        if (b.numberOfChannels === 1) {
          const two = offline.createBuffer(2, b.length, b.sampleRate);
          const ch0 = b.getChannelData(0);
          two.copyToChannel(ch0, 0);
          two.copyToChannel(ch0, 1);
          b = two;
        }
        const src = offline.createBufferSource();
        src.buffer = b;
        src.connect(offline.destination);
        src.start(0);
      }

      const mixed = await offline.startRendering();
      try {
        await ctx.close();
      } catch {
      }

      const base = sanitizeFileName(downloadsModalTitle || 'stems') || 'stems';
      const mp3 = await encodeAudioBufferToMp3(mixed, 192);
      const ok = await downloadBlobAsFile(mp3, `${base} - mezcla.mp3`);
      if (!ok) alert('Tu navegador no permitió la descarga automática. Intenta de nuevo.');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'No pude crear la mezcla en MP3.';
      alert(msg);
    } finally {
      setDownloadsModalMixing(false);
    }
  };

  const importToLibrary = async (params: {
    sourceUrl: string;
    title: string;
    description?: string;
    coverUrl?: string;
    externalId?: string;
    sunoTaskId?: string;
  }) => {
    const t = await getAccessToken();
    if (!t.ok) throw new Error(t.error || 'No se pudo iniciar sesión.');
    const r = await fetch('/api/library/import-audio', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${t.token}` },
      body: JSON.stringify({
        sourceUrl: params.sourceUrl,
        title: params.title,
        description: params.description || '',
        coverUrl: params.coverUrl || '',
        externalId: params.externalId || '',
        sunoTaskId: params.sunoTaskId || '',
      }),
    });
    const out = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((out?.detail || out?.error || 'No pude guardar en Biblioteca.').toString());
    return out?.song ?? null;
  };

  const removeCompletedDownload = (taskId: string) => {
    const completedKey = 'ramber.completedSunoDownloads_v1';
    try {
      const raw = window.localStorage.getItem(completedKey);
      const parsed = raw ? JSON.parse(raw) : null;
      const list = Array.isArray(parsed) ? parsed : [];
      const next = list.filter((x: any) => String(x?.taskId || '').trim() !== taskId);
      if (next.length === 0) window.localStorage.removeItem(completedKey);
      else window.localStorage.setItem(completedKey, JSON.stringify(next));
    } catch {
    }
  };

  const openCompletedDownload = async (item: { taskId: string; kind: string; doneAt: number; draft?: any }) => {
    setDownloadsModalError('');
    setDownloadsModalItems([]);
    setDownloadsModalMuted({});
    setDownloadsModalTaskId(item.taskId);
    setDownloadsModalKind(item.kind);
    setDownloadsModalCoverUrl('');
    setDownloadsModalSourceSongId('');
    setDownloadsModalSaving(false);
    const title = (() => {
      const k = (item.kind || '').toLowerCase();
      const base = k === 'split_stem' ? 'Stems (Instrumentos y voz)' : k === 'separate_vocal' ? 'Karaoke (sin voz)' : 'Descarga';
      const name = (item?.draft?.title || '').toString().trim();
      return name ? `${base}: ${name}` : base;
    })();
    setDownloadsModalTitle(title);
    setDownloadsModalOpen(true);
    setDownloadsModalBusy(true);
    try {
      const t = await getAccessToken();
      if (!t.ok) {
        setDownloadsModalError(t.error || 'No se pudo iniciar sesión.');
        return;
      }
      const r = await fetch(`/api/suno/task?kind=${encodeURIComponent(item.kind)}&taskId=${encodeURIComponent(item.taskId)}`, {
        headers: { authorization: `Bearer ${t.token}` },
      });
      const out = await r.json().catch(() => ({}));
      if (!r.ok) {
        setDownloadsModalError((out?.detail || out?.error || 'No pude cargar la descarga.').toString());
        return;
      }
      const provider = out?.data;
      const items = parseVocalRemovalItems(provider);
      if (items.length === 0) {
        setDownloadsModalError('Terminó, pero no recibí links de stems.');
        return;
      }
      setDownloadsModalItems(items);

      const draftSongId = (item?.draft?.songId || '').toString().trim();
      const draftCover = (item?.draft?.coverUrl || '').toString().trim();
      const draftDesc = (item?.draft?.description || '').toString().trim();
      const source = draftSongId ? canciones.find((s) => s.id === draftSongId) : null;
      const coverUrl = pickFirst(draftCover, source?.coverUrl || '');
      setDownloadsModalCoverUrl(coverUrl);
      setDownloadsModalSourceSongId(draftSongId);

      const wantKeys = new Set(['instrumentalUrl', 'vocalUrl']);
      const pick = items.filter((x) => wantKeys.has((x.key || '').trim()));
      if (pick.length > 0) {
        setDownloadsModalSaving(true);
        try {
          for (const it of pick) {
            const externalId = `stem_${item.taskId}_${it.key}`;
            const baseName = ((item?.draft?.title || '').toString().trim() || 'Canción').slice(0, 100);
            const finalTitle = `${baseName} - ${it.label}`.slice(0, 120);
            await importToLibrary({
              sourceUrl: it.url,
              title: finalTitle,
              description: draftDesc || `${title}`.slice(0, 2000),
              coverUrl,
              externalId,
              sunoTaskId: item.taskId,
            }).catch(() => null);
          }
          onRefreshSongs?.();
        } finally {
          setDownloadsModalSaving(false);
        }
      }
    } catch (e) {
      setDownloadsModalError(e instanceof Error ? e.message : 'Error abriendo descarga');
    } finally {
      setDownloadsModalBusy(false);
    }
  };

  const pickMp4ThumbUrl = (provider: any) => {
    const a = provider?.data?.response || {};
    const b = provider?.data?.data?.response || {};
    const c = provider?.data?.data?.data?.response || {};
    return pickFirst(
      a?.thumbnailUrl,
      b?.thumbnailUrl,
      c?.thumbnailUrl,
      a?.thumbnail_url,
      b?.thumbnail_url,
      c?.thumbnail_url,
      a?.posterUrl,
      b?.posterUrl,
      c?.posterUrl,
      a?.poster_url,
      b?.poster_url,
      c?.poster_url,
      a?.imageUrl,
      b?.imageUrl,
      c?.imageUrl,
      a?.image_url,
      b?.image_url,
      c?.image_url,
      a?.coverUrl,
      b?.coverUrl,
      c?.coverUrl,
      a?.cover_url,
      b?.cover_url,
      c?.cover_url
    );
  };

  const pickMp4AudioId = (provider: any) => {
    const a = provider?.data?.response || {};
    const b = provider?.data?.data?.response || {};
    const c = provider?.data?.data?.data?.response || {};
    return pickFirst(
      a?.audioId,
      b?.audioId,
      c?.audioId,
      a?.audio_id,
      b?.audio_id,
      c?.audio_id,
      a?.sourceAudioId,
      b?.sourceAudioId,
      c?.sourceAudioId,
      a?.source_audio_id,
      b?.source_audio_id,
      c?.source_audio_id,
      a?.musicId,
      b?.musicId,
      c?.musicId,
      a?.music_id,
      b?.music_id,
      c?.music_id
    );
  };

  const pickMp4Title = (provider: any) => {
    const a = provider?.data?.response || {};
    const b = provider?.data?.data?.response || {};
    const c = provider?.data?.data?.data?.response || {};
    return pickFirst(
      a?.title,
      b?.title,
      c?.title,
      a?.songTitle,
      b?.songTitle,
      c?.songTitle,
      a?.song_title,
      b?.song_title,
      c?.song_title,
      a?.musicTitle,
      b?.musicTitle,
      c?.musicTitle,
      a?.music_title,
      b?.music_title,
      c?.music_title
    );
  };

  const preloadVideoThumbs = async (tasks: Array<{ taskId: string }>) => {
    const ids = tasks
      .map((x) => x.taskId)
      .filter((id) => id && (!videoThumbs[id] || !videoTitles[id]))
      .slice(0, 12);
    if (ids.length === 0) return;

    const t = await getAccessToken();
    if (!t.ok) return;

    for (const id of ids) {
      try {
        const tr = await fetch(`/api/suno/task?kind=mp4&taskId=${encodeURIComponent(id)}`, {
          headers: { authorization: `Bearer ${t.token}` },
        });
        const tout = await tr.json().catch(() => ({}));
        if (!tr.ok) continue;
        const provider = tout?.data;
        const thumbUrl = pickMp4ThumbUrl(provider);
        if (thumbUrl) {
          setVideoThumbs((prev) => (prev[id] ? prev : { ...prev, [id]: thumbUrl }));
        }

        let title = '';
        const audioId = pickMp4AudioId(provider);
        if (audioId) {
          const found = (Array.isArray(canciones) ? canciones : []).find((s) => String((s as any)?.sunoAudioId || '').trim() === String(audioId || '').trim());
          title = String((found as any)?.title || '').trim();
        }
        if (!title) title = String(pickMp4Title(provider) || '').trim();
        if (title) {
          setVideoTitles((prev) => (prev[id] === title ? prev : { ...prev, [id]: title }));
        }
      } catch {
      }
    }
  };

  const openVideoByTaskId = async (taskId: string) => {
    const t = await getAccessToken();
    if (!t.ok) {
      alert(t.error || 'No se pudo iniciar sesión.');
      return;
    }
    const tr = await fetch(`/api/suno/task?kind=mp4&taskId=${encodeURIComponent(taskId)}`, {
      headers: { authorization: `Bearer ${t.token}` },
    });
    const tout = await tr.json().catch(() => ({}));
    if (!tr.ok) {
      alert((tout?.detail || tout?.error || 'No pude consultar el video.').toString());
      return;
    }

    const provider = tout?.data;
    const thumbUrl = pickMp4ThumbUrl(provider);
    if (thumbUrl) setVideoThumbs((prev) => (prev[taskId] ? prev : { ...prev, [taskId]: thumbUrl }));
    const status = String(
      provider?.data?.successFlag ||
        provider?.data?.status ||
        provider?.data?.data?.successFlag ||
        provider?.data?.data?.status ||
        ''
    ).toUpperCase();

    if (status === 'FAILED' || status === 'CREATE_TASK_FAILED' || status === 'GENERATE_MP4_FAILED' || status === 'CALLBACK_EXCEPTION') {
      alert('No se pudo generar el video.');
      return;
    }
    if (status !== 'SUCCESS') {
      alert('Tu video aún se está procesando. Intenta de nuevo en un rato.');
      return;
    }

    const videoUrl = String(
      provider?.data?.response?.videoUrl ||
        provider?.data?.data?.response?.videoUrl ||
        provider?.data?.response?.video_url ||
        provider?.data?.data?.response?.video_url ||
        ''
    ).trim();

    if (!videoUrl) {
      alert('El video terminó, pero no recibí el link.');
      return;
    }
    window.open(videoUrl, '_blank');
  };

  const downloadVideoByTaskId = async (taskId: string) => {
    const t = await getAccessToken();
    if (!t.ok) {
      alert(t.error || 'No se pudo iniciar sesión.');
      return;
    }
    const tr = await fetch(`/api/suno/task?kind=mp4&taskId=${encodeURIComponent(taskId)}`, {
      headers: { authorization: `Bearer ${t.token}` },
    });
    const tout = await tr.json().catch(() => ({}));
    if (!tr.ok) {
      alert((tout?.detail || tout?.error || 'No pude consultar el video.').toString());
      return;
    }

    const provider = tout?.data;
    const status = String(
      provider?.data?.successFlag ||
        provider?.data?.status ||
        provider?.data?.data?.successFlag ||
        provider?.data?.data?.status ||
        ''
    ).toUpperCase();

    if (status === 'FAILED' || status === 'CREATE_TASK_FAILED' || status === 'GENERATE_MP4_FAILED' || status === 'CALLBACK_EXCEPTION') {
      alert('No se pudo generar el video.');
      return;
    }
    if (status !== 'SUCCESS') {
      alert('Tu video aún se está procesando. Intenta de nuevo en un rato.');
      return;
    }

    const videoUrl = String(
      provider?.data?.response?.videoUrl ||
        provider?.data?.data?.response?.videoUrl ||
        provider?.data?.response?.video_url ||
        provider?.data?.data?.response?.video_url ||
        ''
    ).trim();

    if (!videoUrl) {
      alert('El video terminó, pero no recibí el link.');
      return;
    }

    const link = document.createElement('a');
    link.href = videoUrl;
    link.download = `video-${taskId.slice(0, 8)}.mp4`;
    try { document.body.appendChild(link); } catch {}
    link.click();
    try { if (link.parentNode) link.parentNode.removeChild(link); } catch {}
  };

  const shareVideoByTaskId = async (taskId: string) => {
    const t = await getAccessToken();
    if (!t.ok) {
      alert(t.error || 'No se pudo iniciar sesión.');
      return;
    }
    const tr = await fetch(`/api/suno/task?kind=mp4&taskId=${encodeURIComponent(taskId)}`, {
      headers: { authorization: `Bearer ${t.token}` },
    });
    const tout = await tr.json().catch(() => ({}));
    if (!tr.ok) {
      alert((tout?.detail || tout?.error || 'No pude consultar el video.').toString());
      return;
    }

    const provider = tout?.data;
    const status = String(
      provider?.data?.successFlag ||
        provider?.data?.status ||
        provider?.data?.data?.successFlag ||
        provider?.data?.data?.status ||
        ''
    ).toUpperCase();

    if (status === 'FAILED' || status === 'CREATE_TASK_FAILED' || status === 'GENERATE_MP4_FAILED' || status === 'CALLBACK_EXCEPTION') {
      alert('No se pudo generar el video.');
      return;
    }
    if (status !== 'SUCCESS') {
      alert('Tu video aún se está procesando. Intenta de nuevo en un rato.');
      return;
    }

    const videoUrl = normalizePublicUrl(
      String(
        provider?.data?.response?.videoUrl ||
          provider?.data?.data?.response?.videoUrl ||
          provider?.data?.response?.video_url ||
          provider?.data?.data?.response?.video_url ||
          ''
      ).trim()
    );

    if (!videoUrl) {
      alert('El video terminó, pero no recibí el link.');
      return;
    }

    try {
      if ((navigator as any).share) {
        await (navigator as any).share({ title: 'LucIAna | Music - Video', url: videoUrl });
        return;
      }
    } catch {
    }
    try {
      await navigator.clipboard.writeText(videoUrl);
      alert('Link copiado al portapapeles.');
    } catch {
      alert(videoUrl);
    }
  };

  useEffect(() => {
    if (activeTab !== 'video') return;
    loadVideos().catch(() => {});
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== 'video') return;
    preloadVideoThumbs(videoTasks).catch(() => {});
  }, [activeTab, videoTasks, canciones]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem('ramber.libraryFolders_v1');
      const parsed = raw ? JSON.parse(raw) : null;
      const list = Array.isArray(parsed?.folders) ? parsed.folders : [];
      const mapped = list
        .map((x: any) => ({
          id: typeof x?.id === 'string' ? x.id : '',
          name: typeof x?.name === 'string' ? x.name : '',
          createdAt: Number.isFinite(Number(x?.createdAt)) ? Number(x.createdAt) : Date.now(),
        }))
        .filter((x: any) => x.id && x.name);
      const map = parsed?.songFolderId && typeof parsed.songFolderId === 'object' ? parsed.songFolderId : {};
      const safeMap: Record<string, string> = {};
      for (const k of Object.keys(map || {})) {
        const v = (map as any)[k];
        if (typeof v === 'string') safeMap[String(k)] = v;
      }
      setFolders(mapped);
      setSongFolderId(safeMap);
    } catch {
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem('ramber.libraryFolders_v1', JSON.stringify({ folders, songFolderId }));
    } catch {
    }
  }, [folders, songFolderId]);

  const expectedTracksForKind = (kind: string) => {
    const k = (kind || '').toLowerCase();
    if (k === 'generate') return 2;
    if (k === 'upload-cover') return 2;
    return 1;
  };

  const pendingTitleForKind = (kind: string) => {
    const k = (kind || '').toLowerCase();
    if (k === 'separate_vocal') return 'Se está eliminando la voz (Karaoke)…';
    if (k === 'split_stem') return 'Se están separando instrumentos y voz (Stems)…';
    const n = expectedTracksForKind(k || 'generate');
    return n > 1 ? `Se están generando ${n} canciones…` : 'Se está generando tu canción…';
  };

  const createFolderQuick = () => {
    const max = folders.reduce((acc, f) => {
      const m = String(f?.name || '')
        .trim()
        .match(/^carpeta\s+(\d+)$/i);
      if (!m) return acc;
      const n = Number(m[1]);
      if (!Number.isFinite(n)) return acc;
      return Math.max(acc, n);
    }, 0);
    const name = `Carpeta ${max + 1}`;
    const id = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    setFolders((prev) => [{ id, name, createdAt: Date.now() }, ...prev]);
    setActiveTab('listas');
    setActiveFolderId(id);
  };
  
  const tabs: {id: LibraryTab, label: string}[] = [
    { id: 'canciones', label: 'Canciones' },
    { id: 'video', label: 'Video' },
    { id: 'listas', label: 'Carpetas' },
  ];

  const fmtSongDate = (iso?: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: '2-digit' });
  };

  const parseSongMs = (iso?: string) => {
    if (!iso) return null;
    const d = new Date(iso);
    const ms = d.getTime();
    return Number.isNaN(ms) ? null : ms;
  };

  const getProviderBadge = (s: SongItem): { label: string; cls: string } => {
    const p = String(s.provider || '').toLowerCase();
    const implicitSuno = !s.provider && (Boolean(s.sunoTaskId) || Boolean(s.sunoModel));
    const m = s.modelVersion || s.sunoModel || '';
    if (p === 'mureka') {
      const short = m === 'auto' ? 'Auto' : m === 'mureka-9' ? 'V9' : m === 'mureka-9.5' ? 'V9.5' : (m || '').replace(/^mureka-?/, '');
      return { label: 'Mureka' + (short ? ` ${short}` : ''), cls: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide' };
    }
    const isSuno = p === 'suno' || implicitSuno;
    const shortSuno = m === 'V6_WILD' ? 'V6 Wild' : m === 'V6_MINI' ? 'V6 Mini' : m === 'V5_5' ? 'V5.5' : m === 'V4_5PLUS' ? 'V4.5+' : m === 'V4_5ALL' ? 'V4.5 All' : m === 'V4_5' ? 'V4.5' : m;
    return { label: 'Suno' + (shortSuno ? ` ${shortSuno}` : ''), cls: 'bg-sky-500/10 text-sky-300 border border-sky-500/30 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide' };
  };

  const formatModelBadge = (song: SongItem) => {
    const raw = (song.sunoModel || '').toString().trim();
    if (!raw) return 'N/D';
    if (raw === 'V5_5') return 'V5.5';
    if (raw === 'V4_5PLUS') return 'V4.5+';
    if (raw === 'V4_5ALL') return 'V4.5 All';
    if (raw === 'V4_5') return 'V4.5';
    return raw;
  };

  const formatSongStatus = (song: SongItem) => {
    if (showTrash) return 'Eliminada';
    const raw = String((song as any)?.status || (song as any)?.providerStatus || '').trim();
    if (raw) return raw;
    if (song.audioUrl) return 'Completa';
    if (song.sunoTaskId || song.sunoAudioId) return 'En producción';
    return song.isPublic ? 'Pública' : 'Privada';
  };

  const folderNameById = useMemo(() => new Map(folders.map((f) => [f.id, f.name])), [folders]);

  const visibleSongs = useMemo(() => {
    const baseList = showTrash ? (cancionesEliminadas || []) : canciones;
    const fromMs = filterFrom ? new Date(`${filterFrom}T00:00:00`).getTime() : null;
    const toMs = filterTo ? new Date(`${filterTo}T23:59:59.999`).getTime() : null;
    const q = normalizeSearchText(searchQuery);
    return baseList
      .filter((song) => {
        if (!filterFrom && !filterTo) return true;
        const ms = parseSongMs(song.createdAt);
        if (fromMs !== null && (ms === null || ms < fromMs)) return false;
        if (toMs !== null && (ms === null || ms > toMs)) return false;
        return true;
      })
      .filter((song) => {
        if (!q) return true;
        const hay = normalizeSearchText(
          [
            song.id,
            song.title,
            song.genre,
            (song as any)?.description,
            (song as any)?.lyrics,
            (song as any)?.publicGenre,
          ]
            .filter(Boolean)
            .join(' ')
        );
        return hay.includes(q);
      })
      .slice()
      .sort((a, b) => {
        const am = parseSongMs(a.createdAt) ?? 0;
        const bm = parseSongMs(b.createdAt) ?? 0;
        if (am !== bm) return sortOrder === 'oldest' ? am - bm : bm - am;
        return String(a.title || '').localeCompare(String(b.title || ''), 'es');
      });
  }, [showTrash, cancionesEliminadas, canciones, filterFrom, filterTo, searchQuery, sortOrder]);

  const baseSongs = useMemo(
    () => (showTrash ? (Array.isArray(cancionesEliminadas) ? cancionesEliminadas : []) : (Array.isArray(canciones) ? canciones : [])),
    [showTrash, cancionesEliminadas, canciones]
  );
  const hasSearchFilter = Boolean(String(searchQuery || '').trim());
  const hasDateFilter = Boolean(String(filterFrom || '').trim() || String(filterTo || '').trim());
  const hasAnyListFilter = hasSearchFilter || hasDateFilter;
  const filtersHideSongs = baseSongs.length > 0 && visibleSongs.length === 0 && hasAnyListFilter;

  useEffect(() => {
    if (didAutoResetDateFiltersRef.current) return;
    if (showTrash) return;
    if (baseSongs.length === 0 || visibleSongs.length > 0) return;
    if (hasSearchFilter) return;
    if (!hasDateFilter) return;
    didAutoResetDateFiltersRef.current = true;
    setFilterFrom('');
    setFilterTo('');
    onToast?.('Quité un filtro de fecha guardado porque estaba ocultando tus canciones.');
  }, [showTrash, baseSongs.length, visibleSongs.length, hasSearchFilter, hasDateFilter, onToast]);

  useEffect(() => {
    if (activeTab !== 'canciones') return;
    if (visibleSongs.length === 0) {
      setSelectedSongId('');
      setMobileDetailOpen(false);
      return;
    }
    if (activeSongId && visibleSongs.some((song) => song.id === activeSongId)) {
      setSelectedSongId(activeSongId);
      return;
    }
    if (selectedSongId && visibleSongs.some((song) => song.id === selectedSongId)) return;
    setSelectedSongId(visibleSongs[0].id);
  }, [activeTab, visibleSongs, activeSongId, selectedSongId]);

  useEffect(() => {
    setSelectedDetailTab('informacion');
  }, [selectedSongId]);

  const selectedSong = useMemo(() => {
    if (!visibleSongs.length) return null;
    return visibleSongs.find((song) => song.id === selectedSongId) || visibleSongs[0] || null;
  }, [visibleSongs, selectedSongId]);

  const openSongDetails = (song: SongItem) => {
    setSelectedSongId(song.id);
    if (typeof window !== 'undefined' && window.innerWidth < 1280) {
      setMobileDetailOpen(true);
    }
  };

  const getSongPrompt = (song: SongItem | null) => {
    if (!song) return '';
    const style = Array.isArray((song as any)?.style)
      ? ((song as any)?.style as string[]).filter(Boolean).join(', ')
      : String((song as any)?.style || '').trim();
    return [
      String((song as any)?.description || '').trim(),
      style ? `Style: ${style}` : '',
      song.genre ? `Género: ${formatGenderPresentation(song.genre)}` : '',
    ].filter(Boolean).join('\n');
  };

  const getSongCoverSrc = (song: SongItem | null) => {
    if (!song) return makeFallbackCoverSvgUrl('Canción');
    const sid = String(song.id || '').trim();
    const broken = Boolean(brokenCovers[sid]);
    const raw = (song.coverUrl || '').toString().trim();
    if (!raw || broken) return makeFallbackCoverSvgUrl(song.title || sid || 'Canción');
    return raw;
  };

  const getSongLyrics = (song: SongItem | null) => String(song?.lyrics || '').trim();

  const getSongSubtitle = (song: SongItem | null) => {
    if (!song) return '';
    const style = Array.isArray((song as any)?.style)
      ? ((song as any)?.style as string[]).filter(Boolean).slice(0, 3).join(', ')
      : String((song as any)?.style || '').trim();
    const gender = song.genre ? formatGenderPresentation(song.genre) : '';
    return [gender, style, (song as any)?.publicGenre].filter(Boolean).join(' · ');
  };

  const renderSongDetailPanel = (song: SongItem, mode: 'desktop' | 'mobile' = 'desktop') => {
    const durationSec = Number(songDurationsSec[song.id] || 0);
    const createdLabel = fmtSongDate(song.createdAt);
    const prompt = getSongPrompt(song);
    const lyrics = getSongLyrics(song);
    const folderName = folderNameById.get(songFolderId[song.id] || '') || '';
    const isMobilePanel = mode === 'mobile';
    const infoRows = [
      { label: 'Duración', value: durationSec > 0 ? fmtDuration(durationSec) : 'Pendiente' },
      { label: 'Fecha de creación', value: createdLabel || 'Sin fecha' },
      { label: 'Versión', value: formatModelBadge(song) },
      { label: 'Modelo', value: formatModelBadge(song) },
      { label: 'Tipo', value: song.isCover ? 'Cover' : 'Completa' },
      { label: 'Visibilidad', value: song.isPublic ? 'Pública' : 'Privada' },
    ];
    const detailRows = [
      { label: 'Estado', value: formatSongStatus(song) },
      { label: 'Carpeta', value: folderName || 'Sin carpeta' },
      { label: 'Género', value: song.genre ? formatGenderPresentation(song.genre) : 'Sin género' },
      { label: 'ID', value: song.id || 'Sin ID' },
    ];
    const lyricLines = lyrics ? lyrics.split(/\r?\n/).filter(Boolean).length : 0;
    const statRows = [
      { label: 'Líneas de letra', value: lyricLines > 0 ? String(lyricLines) : '0' },
      { label: 'Prompt', value: prompt ? 'Disponible' : 'No guardado' },
      { label: 'Audio', value: song.audioUrl ? 'Listo' : 'Pendiente' },
      { label: 'Compartir', value: song.isPublic ? 'Público' : 'Privado' },
    ];
    const tabs = [
      { id: 'informacion', label: 'Información' },
      { id: 'letra', label: 'Letra' },
      { id: 'detalles', label: 'Detalles técnicos' },
      { id: 'estadisticas', label: 'Estadísticas' },
    ] as const;

    const panelContent = (() => {
      if (selectedDetailTab === 'letra') {
        return (
          <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Letra completa</div>
            <div className="mt-3 max-h-[320px] overflow-y-auto pr-2 whitespace-pre-wrap text-sm leading-6 text-slate-300">
              {lyrics || 'Esta canción no tiene letra guardada todavía.'}
            </div>
          </div>
        );
      }
      if (selectedDetailTab === 'detalles') {
        return (
          <div className="space-y-3">
            {detailRows.map((row) => (
              <div key={row.label} className="grid grid-cols-[130px_minmax(0,1fr)] gap-3 rounded-[18px] border border-white/10 bg-white/[0.03] px-4 py-3">
                <div className="text-xs text-slate-500">{row.label}</div>
                <div className="text-sm text-slate-200 break-words">{row.value}</div>
              </div>
            ))}
          </div>
        );
      }
      if (selectedDetailTab === 'estadisticas') {
        return (
          <div className="grid grid-cols-2 gap-3">
            {statRows.map((row) => (
              <div key={row.label} className="rounded-[20px] border border-white/10 bg-white/[0.03] p-4">
                <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{row.label}</div>
                <div className="mt-2 text-lg font-bold text-white">{row.value}</div>
              </div>
            ))}
          </div>
        );
      }
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {infoRows.map((row) => (
              <div key={row.label} className="rounded-[20px] border border-white/10 bg-white/[0.03] p-4">
                <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{row.label}</div>
                <div className="mt-2 text-sm font-semibold text-slate-200 break-words">{row.value}</div>
              </div>
            ))}
          </div>
          <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Prompt utilizado</div>
            <div className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-300">
              {prompt || 'Esta canción no tiene prompt o instrucción musical guardada.'}
            </div>
          </div>
        </div>
      );
    })();

    return (
      <div
        className={cn(
          "rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(6,10,20,0.98),rgba(4,7,14,0.96))] shadow-[0_24px_80px_rgba(0,0,0,0.35)]",
          isMobilePanel ? "max-h-[85vh] overflow-hidden" : "max-h-[calc(100dvh-7.5rem)] overflow-y-auto"
        )}
      >
        <div className="flex min-h-0 flex-col">
          <div className="shrink-0 border-b border-white/10 p-4">
            <div className="flex items-start gap-4">
              <div
                className="h-24 w-24 shrink-0 overflow-hidden rounded-[22px] border border-white/10 bg-white/[0.04]"
                onClick={() => {
                  if (song.audioUrl) onPlaySong(song);
                }}
              >
                <img
                  src={getSongCoverSrc(song)}
                  onError={() => {
                    const sid = String(song.id || '').trim();
                    if (!sid) return;
                    setBrokenCovers((prev) => (prev[sid] ? prev : { ...prev, [sid]: true }));
                  }}
                  alt={song.title || 'Cover'}
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="truncate text-xl font-extrabold text-white">{song.title || 'Pista sin título'}</div>
                      {(() => {
                        const pb = getProviderBadge(song);
                        return (
                          <div className={`${pb.cls} shrink-0`}>
                            {pb.label}
                          </div>
                        );
                      })()}
                    </div>
                    <div className="mt-1 text-xs text-slate-400">{getSongSubtitle(song) || 'Canción en tu biblioteca'}</div>
                  </div>
                  {!isMobilePanel ? (
                    <button
                      type="button"
                      onClick={() => setMenuSong(song)}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-slate-200 transition-colors hover:bg-white/[0.08]"
                      aria-label="Opciones"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-300">{formatSongStatus(song)}</span>
                  {(() => {
                    const pb = getProviderBadge(song);
                    return <span className={`${pb.cls} px-2.5 py-1 text-[11px]`}>{pb.label}</span>;
                  })()}
                  <span className="rounded-full bg-white/[0.06] px-2.5 py-1 text-[11px] font-semibold text-slate-400">{song.isPublic ? 'Público' : 'Privado'}</span>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onPlaySong(song)}
                    disabled={!song.audioUrl}
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-full border transition-colors",
                      song.audioUrl ? "border-white/10 bg-white text-gray-900 shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] ring-1 ring-inset ring-black/10 hover:bg-slate-200" : "border-white/10 bg-white/[0.04] text-slate-500"
                    )}
                    aria-label="Reproducir"
                  >
                    {activeSongId === song.id && isPlaying ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleLikeForSong(song)}
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-full border transition-colors",
                      likedSongIds[song.id] ? "border-fuchsia-400/30 bg-fuchsia-500/15 text-fuchsia-200" : "border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]"
                    )}
                    aria-label="Me gusta"
                  >
                    <ThumbsUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => openSharePicker(song)}
                    className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-slate-300 transition-colors hover:bg-white/[0.08]"
                    aria-label="Compartir"
                  >
                    <Share2 className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setMenuSong(song)}
                    className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-slate-100 transition-colors hover:bg-white/[0.08]"
                  >
                    Opciones
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="shrink-0 border-b border-white/10 px-4">
            <div className="flex gap-5 overflow-x-auto no-scrollbar">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSelectedDetailTab(tab.id)}
                  className={cn(
                    "relative whitespace-nowrap py-3 text-sm transition-colors",
                    selectedDetailTab === tab.id ? "text-fuchsia-300" : "text-slate-400 hover:text-slate-200"
                  )}
                >
                  {tab.label}
                  {selectedDetailTab === tab.id ? (
                    <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-fuchsia-500" />
                  ) : null}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
            {panelContent}
          </div>

          <div className="shrink-0 border-t border-white/10 p-4">
            {song.audioUrl ? (
              <audio controls src={song.audioUrl} className="w-full" />
            ) : (
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-400">
                Esta canción todavía no tiene un audio listo para reproducir.
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div ref={libraryContainerRef} className="flex-1 min-h-0 flex flex-col pt-1 md:pt-2 relative overflow-y-auto">
      <div className="shrink-0 p-3 md:p-4 space-y-3 md:space-y-4">
        {activeTab === 'canciones' && (
          <>
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3 md:gap-4">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.24em] text-purple-400">Biblioteca</div>
                <h1 className="mt-1 md:mt-2 text-white font-extrabold text-2xl">Biblioteca</h1>
                <p className="mt-1 text-[13px] md:text-sm text-slate-400 leading-snug">Todas tus canciones y proyectos en un solo lugar.</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.location.assign('/crear')}
                  className="bg-gradient-to-r from-indigo-500 to-purple-600 hover:opacity-95 text-white rounded-full px-3.5 py-2 md:px-4 md:py-2 text-xs md:text-sm font-extrabold transition-colors flex items-center gap-2 min-h-[44px]"
                >
                  <Plus className="w-4 h-4" /> Nueva canción
                </button>
                <div className="relative md:hidden">
                  <button
                    ref={mobileHeaderMenuBtnRef}
                    type="button"
                    onClick={() => setMobileHeaderMenuOpen((v) => !v)}
                    className="bg-white/5 hover:bg-white/10 border border-white/10 rounded-full px-3.5 py-2 text-xs font-extrabold text-slate-100 transition-colors flex items-center gap-2 min-h-[44px]"
                    aria-haspopup="menu"
                    aria-expanded={mobileHeaderMenuOpen}
                  >
                    <MoreVertical className="w-4 h-4" /> Más opciones
                  </button>
                  {mobileHeaderMenuOpen ? (
                    <div
                      ref={mobileHeaderMenuRef}
                      role="menu"
                      className="absolute right-0 mt-2 w-[220px] rounded-2xl border border-white/10 bg-[#0b0f16] shadow-[0_20px_70px_rgba(0,0,0,0.65)] p-2 z-50"
                    >
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setMobileHeaderMenuOpen(false);
                          onRefreshSongs?.();
                        }}
                        className="w-full text-left px-3 py-2 rounded-xl hover:bg-white/5 text-sm text-slate-100 font-semibold flex items-center gap-2"
                      >
                        <Repeat2 className="w-4 h-4" /> Actualizar
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => setMobileHeaderMenuOpen(false)}
                        className="w-full text-left px-3 py-2 rounded-xl hover:bg-white/5 text-sm text-slate-100 font-semibold flex items-center gap-2"
                      >
                        <BadgeCheck className="w-4 h-4" /> Publicado
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setMobileHeaderMenuOpen(false);
                          setShowTrash((v) => !v);
                          onRefreshSongs?.();
                        }}
                        className={cn(
                          "w-full text-left px-3 py-2 rounded-xl hover:bg-white/5 text-sm text-slate-100 font-semibold flex items-center gap-2",
                          showTrash ? "text-red-200" : ""
                        )}
                      >
                        <Trash2 className="w-4 h-4" /> {showTrash ? "Biblioteca" : "Papelera"}
                      </button>
                      {!showTrash ? (
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setMobileHeaderMenuOpen(false);
                            createFolderQuick();
                          }}
                          className="w-full text-left px-3 py-2 rounded-xl hover:bg-white/5 text-sm text-slate-100 font-semibold flex items-center gap-2"
                        >
                          <FolderPlus className="w-4 h-4" /> Nueva carpeta
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => onRefreshSongs?.()}
                  className="hidden md:flex bg-white/5 hover:bg-white/10 border border-white/10 rounded-full px-4 py-2 text-sm font-semibold text-slate-200 transition-colors items-center gap-2"
                >
                  Actualizar
                </button>
              </div>
            </div>
          </>
        )}
        {/* Top Filters (Me gusta, Publicado, Filtros) */}
        {null}

        {/* Navigation Tabs */}
        <div className="flex border-b border-white/5 space-x-4 md:space-x-6 overflow-x-auto no-scrollbar">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "py-2.5 md:py-3 text-sm font-medium relative whitespace-nowrap transition-colors",
                activeTab === tab.id ? "text-slate-100" : "text-slate-500"
              )}
            >
              {tab.label}
              {activeTab === tab.id && (
                <div className="absolute bottom-0 left-0 w-full h-[2px] bg-gradient-to-r from-indigo-400 to-purple-400 rounded-t-full" />
              )}
            </button>
          ))}
        </div>

        <div className="text-[11px] text-yellow-300">
          Los archivos se conservan durante 14 días.
        </div>
      </div>

      <div className="pb-24">
        {activeTab === 'video' && (
          <div className="p-4 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-white font-extrabold">Videos (MP4)</div>
                <div className="text-xs text-slate-400">
                  Aquí aparecen tus videos. Si acabas de crear uno, presiona Actualizar.
                </div>
              </div>
              <button
                onClick={() => loadVideos().catch(() => {})}
                disabled={videoLoading}
                className="shrink-0 bg-white/5 border border-white/10 rounded-full px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-white/10 transition-colors disabled:opacity-60"
              >
                {videoLoading ? 'Actualizando…' : 'Actualizar'}
              </button>
            </div>

            {videoError ? (
              <div className="glass-card rounded-2xl p-4 border border-red-500/30 text-red-200 text-sm">
                {videoError}
              </div>
            ) : null}

            {videoTasks.length === 0 ? (
              <div className="glass-card rounded-2xl p-4 border border-white/10 text-slate-300 text-sm">
                Aún no tienes videos. Para crear uno: abre una canción → 3 puntitos → Video (MP4).
              </div>
            ) : (
              <div className="space-y-3">
                {videoTasks.map((v) => {
                  const dt = (v.createdAt || '').toString().trim();
                  const dateText = (() => {
                    if (!dt) return '';
                    const d = new Date(dt);
                    if (Number.isNaN(d.getTime())) return '';
                    return d.toLocaleString('es-MX', { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
                  })();
                  const thumb = normalizePublicUrl((videoThumbs[v.taskId] || '').toString().trim());
                  const title = (videoTitles[v.taskId] || '').toString().trim() || 'Video';
                  return (
                    <div key={v.taskId} className="glass-card rounded-2xl p-4 border border-white/10 flex items-center justify-between gap-3">
                      <button
                        onClick={() => openVideoByTaskId(v.taskId).catch(() => {})}
                        className="flex items-center gap-3 min-w-0 text-left"
                      >
                        <div className="w-[84px] h-[56px] rounded-xl overflow-hidden bg-white/5 border border-white/10 shrink-0">
                          {thumb ? (
                            <img src={thumb} alt="Miniatura" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-slate-500">
                              <Video className="w-5 h-5" />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="text-white font-bold truncate">{title}</div>
                          {dateText ? <div className="text-[11px] text-slate-500 mt-1">{dateText}</div> : null}
                        </div>
                      </button>
                      <div className="shrink-0 relative flex items-center gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            downloadVideoByTaskId(v.taskId).catch(() => {});
                          }}
                          className="bg-white/5 border border-white/10 rounded-full p-2 text-slate-200 hover:bg-white/10 transition-colors hidden sm:flex items-center justify-center"
                          title="Descargar"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenVideoMenuId(openVideoMenuId === v.taskId ? null : v.taskId);
                          }}
                          className="bg-white/5 border border-white/10 rounded-full p-2 text-slate-200 hover:bg-white/10 transition-colors flex items-center justify-center"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>
                        {openVideoMenuId === v.taskId && (
                          <div className="absolute right-0 top-full mt-1 w-48 bg-gray-900 border border-white/10 rounded-xl shadow-lg z-50">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                shareVideoByTaskId(v.taskId).catch(() => {});
                                setOpenVideoMenuId(null);
                              }}
                              className="w-full px-4 py-3 text-left text-sm text-slate-200 hover:bg-white/10 flex items-center gap-2"
                            >
                              <Share2 className="w-4 h-4" />
                              Compartir
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                openVideoByTaskId(v.taskId).catch(() => {});
                                setOpenVideoMenuId(null);
                              }}
                              className="w-full px-4 py-3 text-left text-sm text-slate-200 hover:bg-white/10 flex items-center gap-2"
                            >
                              <Video className="w-4 h-4" />
                              Visualizar
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                downloadVideoByTaskId(v.taskId).catch(() => {});
                                setOpenVideoMenuId(null);
                              }}
                              className="w-full px-4 py-3 text-left text-sm text-slate-200 hover:bg-white/10 flex items-center gap-2"
                            >
                              <Download className="w-4 h-4" />
                              Descargar
                            </button>
                            <div className="border-t border-white/5 my-1"></div>
                            <button
                              onClick={async (e) => {
                                e.stopPropagation();
                                const ok = window.confirm('¿Estás seguro de eliminar este video de tu lista? La eliminación solo borra el registro en tu biblioteca (el archivo de Suno no se puede borrar).');
                                if (!ok) return;
                                setOpenVideoMenuId(null);
                                try {
                                  const t = await getAccessToken();
                                  if (!t.ok) {
                                    alert(t.error || 'No se pudo iniciar sesión.');
                                    return;
                                  }
                                  const r = await fetch(`/api/videos/${encodeURIComponent(v.taskId)}`, {
                                    method: 'DELETE',
                                    headers: { authorization: `Bearer ${t.token}` },
                                  });
                                  const out = await r.json().catch(() => ({}));
                                  if (!r.ok) {
                                    alert((out?.error || out?.detail || 'No pude eliminar el video.').toString());
                                    return;
                                  }
                                  await loadVideos().catch(() => {});
                                } catch (e2) {
                                  alert('Error: ' + (e2 instanceof Error ? e2.message : 'Desconocido'));
                                }
                              }}
                              className="w-full px-4 py-3 text-left text-sm text-red-300 hover:bg-red-500/10 flex items-center gap-2"
                            >
                              <Trash2 className="w-4 h-4" />
                              Eliminar
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'canciones' && (
          <div className="p-3 md:p-4 space-y-3 md:space-y-4">
            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_180px_190px] gap-3">
              <div className="relative flex items-center gap-2">
                 <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                 <input
                   type="text"
                   placeholder="Buscar canción por título o estilo..."
                   value={searchDraft}
                   onChange={(e) => setSearchDraft(e.target.value)}
                   onKeyDown={(e) => {
                     if (e.key === 'Enter') {
                       const q = normalizeSearchText(searchDraft);
                       setSearchQuery(q);
                     }
                   }}
                  className="w-full bg-white/5 border border-white/10 rounded-full py-2.5 md:py-3 pl-10 pr-[92px] text-sm text-white placeholder:text-slate-500 outline-none focus:border-white/20 transition-colors"
                 />
                 <button
                   type="button"
                   onClick={() => {
                     const q = normalizeSearchText(searchDraft);
                     setSearchQuery(q);
                   }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/10 hover:bg-white/15 active:bg-white/20 border border-white/10 rounded-full px-3.5 py-2 text-xs font-extrabold text-slate-100 transition-colors"
                 >
                   Buscar
                 </button>
              </div>
              <button
                type="button"
                onClick={() => setMobileFilterSortOpen((v) => !v)}
                className="md:hidden h-[44px] rounded-full border border-white/10 bg-white/[0.04] px-4 text-sm font-semibold text-slate-100 hover:bg-white/[0.08] transition-colors flex items-center justify-center gap-2"
              >
                <Settings2 className="w-4 h-4" /> Filtrar y ordenar
                {activeFilterCount > 0 ? (
                  <span className="ml-1 inline-flex items-center justify-center min-w-[20px] h-[20px] rounded-full bg-fuchsia-500/20 text-fuchsia-100 text-[11px] font-extrabold px-1.5">
                    {activeFilterCount}
                  </span>
                ) : null}
              </button>
              <button
                type="button"
                onClick={() => setIsFiltersOpen(true)}
                className="hidden md:flex h-[50px] rounded-full border border-white/10 bg-white/[0.04] px-4 text-sm font-semibold text-slate-100 hover:bg-white/[0.08] transition-colors items-center justify-center gap-2"
              >
                <Settings2 className="w-4 h-4" /> Filtros
                {activeFilterCount > 0 ? (
                  <span className="ml-1 inline-flex items-center justify-center min-w-[20px] h-[20px] rounded-full bg-fuchsia-500/20 text-fuchsia-100 text-[11px] font-extrabold px-1.5">
                    {activeFilterCount}
                  </span>
                ) : null}
              </button>
              <label className="hidden md:flex h-[50px] rounded-full border border-white/10 bg-white/[0.04] px-4 text-sm text-slate-300 items-center gap-3">
                <span className="shrink-0 text-slate-400">Ordenar por:</span>
                <select
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value === 'oldest' ? 'oldest' : 'newest')}
                  className="min-w-0 flex-1 bg-transparent text-white outline-none"
                >
                  <option value="newest" className="bg-[#0b0f16]">Más recientes</option>
                  <option value="oldest" className="bg-[#0b0f16]">Más antiguas</option>
                </select>
              </label>
            </div>

            {mobileFilterSortOpen ? (
              <div className="md:hidden rounded-2xl border border-white/10 bg-white/[0.03] p-3 space-y-3">
                <button
                  type="button"
                  onClick={() => setIsFiltersOpen(true)}
                  className="w-full h-[44px] rounded-full border border-white/10 bg-white/[0.04] px-4 text-sm font-semibold text-slate-100 hover:bg-white/[0.08] transition-colors flex items-center justify-center gap-2"
                >
                  <Settings2 className="w-4 h-4" /> Filtros
                </button>
                <label className="w-full h-[44px] rounded-full border border-white/10 bg-white/[0.04] px-4 text-sm text-slate-300 flex items-center gap-3">
                  <span className="shrink-0 text-slate-400">Ordenar por:</span>
                  <select
                    value={sortOrder}
                    onChange={(e) => setSortOrder(e.target.value === 'oldest' ? 'oldest' : 'newest')}
                    className="min-w-0 flex-1 bg-transparent text-white outline-none"
                  >
                    <option value="newest" className="bg-[#0b0f16]">Más recientes</option>
                    <option value="oldest" className="bg-[#0b0f16]">Más antiguas</option>
                  </select>
                </label>
              </div>
            ) : null}

            {pendingTasks.length > 0 && !showTrash && (
              <div className="space-y-3">
                <div className="glass-card rounded-2xl p-4 border border-white/10">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-white font-bold truncate">
                        {pendingTitleForKind(pendingTasks[0]?.kind || 'generate')}
                      </div>
                      <div className="text-slate-400 text-xs">
                        {pendingTasks.length > 1 ? `Tareas en cola: ${pendingTasks.length}.` : ' '}
                        {' '}Puedes salir de Biblioteca si quieres; esto seguirá en segundo plano.
                      </div>
                    </div>
                    <div className="shrink-0 flex items-center gap-2">
                      <button
                        onClick={() => {
                          try {
                            window.dispatchEvent(new CustomEvent('ramber:forcePendingSync'));
                          } catch {
                          }
                          onRefreshSongs?.();
                        }}
                        className="bg-white/5 border border-white/10 rounded-full px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-white/10 transition-colors"
                      >
                        {pendingSyncBusy ? 'Consultando…' : 'Actualizar'}
                      </button>
                      <button
                        onClick={() => {
                          try {
                            window.localStorage.removeItem('ramber.pendingSunoTasks_v1');
                            window.localStorage.removeItem('ramber.pendingSunoTask');
                          } catch {
                          }
                          setPendingTasks([]);
                        }}
                        className="bg-white/5 border border-white/10 rounded-full px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-white/10 transition-colors"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                </div>

                {(() => {
                  const first = pendingTasks[0];
                  const showErr = (() => {
                    const msg = (first as any)?.lastError ? String((first as any).lastError).trim() : '';
                    if (!msg) return '';
                    const n = Number.isFinite(Number((first as any)?.failCount)) ? Number((first as any).failCount) : 0;
                    return `${msg}${n > 1 ? ` (intentos: ${n})` : ''}`.slice(0, 220);
                  })();
                  const base = Math.max(0, Number(first?.startedAt || 0));
                  const now = Date.now();
                  const step = Math.max(0, Math.floor((now - base) / 3500));
                  const simulated = Math.min(95, Math.max(3, 3 + step * 2));
                  const pctFromProvider = Number.isFinite(Number(first?.progressPct)) ? Number(first?.progressPct) : null;
                  const pctProvider = pctFromProvider !== null ? Math.max(3, Math.min(99, pctFromProvider)) : 0;
                  const pctBase = Math.max(simulated, pctProvider);
                  const ring = (pct: number) => `conic-gradient(#22c55e ${pct * 3.6}deg, rgba(255,255,255,0.10) 0deg)`;
                  const row = (k: number) => {
                    const pct = Math.min(95, pctBase + k);
                    return (
                      <div key={k} className="flex items-start gap-4 p-2 rounded-xl hover:bg-white/5 transition-colors">
                        <div className="w-16 h-16 rounded-full p-[3px] shrink-0" style={{ background: ring(pct) }}>
                          <div className="w-full h-full rounded-full bg-[#0b0f16] border border-white/10 flex items-center justify-center">
                            <div className="text-sm font-extrabold text-slate-100">{pendingSyncBusy ? '…' : 'En cola'}</div>
                          </div>
                        </div>
                        <div className="flex-1 min-w-0 pt-1">
                          <div className="text-sm text-slate-200" role="status">
                            {pendingSyncBusy ? 'Consultando el estado con el proveedor…' : first?.retryPaused ? 'Consulta pausada por errores. Pulsa Actualizar para reintentar.' : first?.providerStatus === 'SUCCESS' ? 'Recuperando los audios…' : 'Esperando resultado del proveedor…'}
                          </div>
                          {now - base >= 10 * 60 * 1000 && !showErr ? <div className="mt-2 text-xs text-amber-200">Está tardando más de lo habitual. Actualizar consulta esta misma solicitud; no genera ni cobra otra canción.</div> : null}
                          <div className="h-3 w-[90%] bg-white/10 rounded-full mt-3 animate-pulse" />
                          {k === 0 && showErr ? (
                            <div className="mt-3 text-[11px] text-red-200 break-words">{showErr}</div>
                          ) : null}
                        </div>
                      </div>
                    );
                  };
                  const n = expectedTracksForKind(first?.kind || 'generate');
                  return <>{Array.from({ length: n }, (_, i) => i).map(row)}</>;
                })()}
              </div>
            )}

            {pendingRvcCovers.length > 0 && !showTrash && (
              <div className="space-y-3 mt-3">
                <div className="glass-card rounded-2xl p-4 border border-white/10">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-white font-bold truncate">Cover con voz clonada en proceso</div>
                      <div className="text-slate-400 text-xs">
                        Esto puede tardar unos minutos. Cuando termine, aparecerá en tu Biblioteca.
                      </div>
                      <div className="mt-3">
                        <div className="flex items-center justify-between text-[11px] text-slate-300">
                          <div className="truncate">
                            {(() => {
                              const s = (pendingRvcCoverUi?.replicateStatus || pendingRvcCoverUi?.status || 'processing').toString().trim().toLowerCase();
                              if (s === 'starting') return 'Estado: iniciando...';
                              if (s === 'processing') return 'Estado: procesando...';
                              if (s === 'succeeded' || s === 'completed' || s === 'ready') return 'Estado: finalizando...';
                              if (s === 'failed' || s === 'canceled' || s === 'error') return 'Estado: error';
                              return 'Estado: en proceso...';
                            })()}
                          </div>
                          <div className="shrink-0 font-bold text-slate-100">
                            {(() => {
                              const base = Math.max(0, Number(pendingRvcCovers[0]?.startedAt || 0));
                              const step = Math.max(0, Math.floor((Date.now() - base) / 3500));
                              const fallbackPct = Math.min(98, Math.max(3, 5 + step * 2));
                              const pct = pendingRvcCoverUi?.progressPct ?? fallbackPct;
                              const finalPct = Math.max(3, Math.min(100, Number(pct)));
                              return `${Math.round(finalPct)}%`;
                            })()}
                          </div>
                        </div>
                        <div className="mt-2 h-2 w-full rounded-full bg-white/10 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-fuchsia-500 to-emerald-400 transition-all"
                            style={{
                              width: `${(() => {
                                const base = Math.max(0, Number(pendingRvcCovers[0]?.startedAt || 0));
                                const step = Math.max(0, Math.floor((Date.now() - base) / 3500));
                                const fallbackPct = Math.min(98, Math.max(3, 5 + step * 2));
                                const pct = pendingRvcCoverUi?.progressPct ?? fallbackPct;
                                const finalPct = Math.max(3, Math.min(100, Number(pct)));
                                return finalPct;
                              })()}%`,
                            }}
                          />
                        </div>
                        {pendingRvcAuthError ? (
                          <div className="mt-2 text-[11px] text-rose-300">{pendingRvcAuthError}</div>
                        ) : null}
                        <div className="mt-2 text-[11px] text-slate-500">
                          {(() => {
                            const rs = (pendingRvcCoverUi?.replicateStatus || '').toString().trim() || '—';
                            const http = pendingRvcCoverUi?.replicateHttpStatus != null ? `HTTP ${pendingRvcCoverUi.replicateHttpStatus}` : 'HTTP —';
                            let at = '—';
                            try {
                              const ms = Number(pendingRvcCoverUi?.replicateCheckedAt ?? 0);
                              if (ms > 0) {
                                const d = new Date(ms);
                                at = Number.isNaN(d.getTime()) ? '—' : d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                              }
                            } catch {
                            }
                            return `Replicate: ${rs} • ${http} • última consulta: ${at}`;
                          })()}
                        </div>
                        {pendingRvcCoverUi?.replicateFetchError ? (
                          <div className="mt-2 text-[11px] text-amber-200">
                            {pendingRvcCoverUi.replicateFetchError}
                          </div>
                        ) : null}
                        {pendingRvcCoverUi?.importError ? (
                          <div className="mt-2 text-[11px] text-rose-300">
                            {pendingRvcCoverUi.importError}
                          </div>
                        ) : null}
                        {!pendingRvcCoverUi?.imported && pendingRvcCoverUi?.outputUrl ? (
                          <button
                            onClick={() => {
                              try {
                                window.open(pendingRvcCoverUi.outputUrl || '', '_blank', 'noopener,noreferrer');
                              } catch {
                              }
                            }}
                            className="mt-2 inline-flex items-center justify-center bg-white/5 border border-white/10 rounded-full px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-white/10 transition-colors"
                          >
                            Abrir audio (si ya terminó)
                          </button>
                        ) : null}
                        <div className="mt-2 text-[11px] text-slate-500">
                          {(() => {
                            const base = Math.max(0, Number(pendingRvcCovers[0]?.startedAt || 0));
                            const sec = Math.max(0, Math.floor((Date.now() - base) / 1000));
                            const mins = Math.floor(sec / 60);
                            const hrs = Math.floor(mins / 60);
                            const mm = (mins % 60).toString().padStart(2, '0');
                            const ss = (sec % 60).toString().padStart(2, '0');
                            const timeStr = hrs > 0 ? `Tiempo: ${hrs}:${mm}:${ss}` : `Tiempo: ${mm}:${ss}`;
                            
                            // Si el proceso lleva más de 10 minutos y sigue en "processing", mostrar un mensaje de advertencia
                            if (sec > 600 && pendingRvcCoverUi?.replicateStatus === 'processing') {
                              return `${timeStr} - El proceso está tardando más de lo normal. Puedes intentar cancelarlo y volver a intentar.`;
                            }
                            return timeStr;
                          })()}
                        </div>
                      </div>
                      <div className="text-slate-500 text-[11px] truncate">{`ID: ${pendingRvcCovers[0]?.predictionId || ''}`}</div>
                    </div>
                    <div className="shrink-0 flex items-center gap-2">
                      <button
                        onClick={async () => {
                          try {
                            const first = pendingRvcCovers[0];
                            if (first?.predictionId) {
                              const t = await getAccessToken();
                              if (t.ok) {
                                const r = await fetch(
                                  `/api/rvc/cover-status?predictionId=${encodeURIComponent(first.predictionId)}&nocache=1`,
                                  { headers: { authorization: `Bearer ${t.token}` } }
                                );
                                const out = await r.json().catch(() => ({}));
                                if (r.ok && out?.ok === true) {
                                  const rawStatus = (out?.replicateStatus || out?.status || '').toString().trim().toLowerCase();
                                  const now = Date.now();
                                  const base = Math.max(0, Number(first?.startedAt || 0));
                                  const step = Math.max(0, Math.floor((now - base) / 3500));
                                  const simulatedBase = Math.min(98, Math.max(3, 5 + step * 2));
                                  const simulated = (() => {
                                    if (rawStatus === 'starting') return Math.min(30, simulatedBase);
                                    if (rawStatus === 'processing') return Math.min(90, simulatedBase);
                                    if (rawStatus === 'succeeded' || rawStatus === 'completed' || rawStatus === 'ready') return Math.min(99, Math.max(95, simulatedBase));
                                    return simulatedBase;
                                  })();
                                  const pctFromStatus = (() => {
                                    if (out?.imported) return 100;
                                    if (rawStatus === 'starting') return 10;
                                    if (rawStatus === 'processing') return 70;
                                    if (rawStatus === 'succeeded' || rawStatus === 'completed' || rawStatus === 'ready') return 98;
                                    if (rawStatus === 'failed' || rawStatus === 'canceled' || rawStatus === 'error') return 100;
                                    return null;
                                  })();
                                  const pctRaw = pctFromStatus == null ? simulated : Math.max(simulated, pctFromStatus);
                                  const pct = rawStatus === 'processing' ? Math.min(90, pctRaw) : pctRaw;
                                  setPendingRvcCoverUi({
                                    status: (out?.status || 'processing').toString(),
                                    replicateStatus: out?.replicateStatus ?? null,
                                    replicateHttpStatus: typeof out?.replicateHttpStatus === 'number' ? out.replicateHttpStatus : null,
                                    replicateCheckedAt: typeof out?.replicateCheckedAt === 'number' ? out.replicateCheckedAt : null,
                                    replicateFetchError: typeof out?.replicateFetchError === 'string' ? out.replicateFetchError : null,
                                    progressPct: Math.max(0, Math.min(100, Number(pct))),
                                    imported: Boolean(out?.imported),
                                    importError: typeof out?.importError === 'string' ? out.importError : null,
                                    outputUrl: typeof out?.outputUrl === 'string' ? out.outputUrl : null,
                                  });
                                }
                              }
                            }
                          } catch {
                          }
                          onRefreshSongs?.();
                        }}
                        className="bg-white/5 border border-white/10 rounded-full px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-white/10 transition-colors"
                      >
                        Actualizar
                      </button>
                      <button
                        onClick={async () => {
                          try {
                            const first = pendingRvcCovers[0];
                            if (!first?.predictionId) return;
                            const t = await getAccessToken();
                            if (!t.ok) {
                              alert((t.error || 'Necesitas iniciar sesión otra vez.').toString());
                              return;
                            }
                            const r = await fetch(
                              `/api/rvc/cover-status?predictionId=${encodeURIComponent(first.predictionId)}&nocache=1`,
                              { headers: { authorization: `Bearer ${t.token}` } }
                            );
                            const text = await r.text().catch(() => '');
                            const out = (() => {
                              try {
                                return text ? JSON.parse(text) : {};
                              } catch {
                                return {};
                              }
                            })();
                            const lines = [
                              `httpStatus: ${String(Number(r.status || 0) || '')}`,
                              `error: ${String(out?.error || '')}`,
                              `detail: ${String(out?.detail || '')}`,
                              `hint: ${String(out?.hint || '')}`,
                              `status(app): ${String(out?.status || '')}`,
                              `replicateStatus: ${String(out?.replicateStatus || '')}`,
                              `replicateHTTP: ${out?.replicateHttpStatus == null ? '' : String(out.replicateHttpStatus)}`,
                              `replicateError: ${String(out?.replicateFetchError || '')}`,
                              `trackingWarning: ${String(out?.trackingWarning || '')}`,
                              `imported: ${String(Boolean(out?.imported))}`,
                              `importError: ${String(out?.importError || '')}`,
                              `outputUrl: ${String(out?.outputUrl || '')}`,
                              `predictionId: ${String(out?.predictionId || first.predictionId || '')}`,
                            ]
                              .map((s) => s.trim())
                              .filter(Boolean)
                              .join('\n');
                            alert(lines || 'Sin datos de diagnóstico.');
                          } catch {
                            alert('No pude obtener diagnóstico.');
                          }
                        }}
                        className="bg-white/5 border border-white/10 rounded-full px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-white/10 transition-colors"
                      >
                        Diagnóstico
                      </button>
                      <button
                        onClick={async () => {
                          const first = pendingRvcCovers[0];
                          if (!first?.songId || !first?.voiceId) return;
                          try {
                            const cooldownUntil = Number(window.localStorage.getItem('ramber.replicateCooldownUntil_v1') || 0);
                            if (Number.isFinite(cooldownUntil) && cooldownUntil > Date.now()) {
                              const sec = Math.max(1, Math.ceil((cooldownUntil - Date.now()) / 1000));
                              alert(`Espera ${sec} segundos y vuelve a intentar.\n\nReplicate está limitando solicitudes (429).`);
                              return;
                            }
                          } catch {
                          }
                          try {
                            const t = await getAccessToken();
                            if (!t.ok) return;
                            const r = await fetch('/api/suno/create-cover', {
                              method: 'POST',
                              headers: {
                                'Content-Type': 'application/json',
                                Authorization: `Bearer ${t.token}`,
                              },
                              body: JSON.stringify({ songId: first.songId, voiceId: first.voiceId, outputFormat: 'wav' }),
                            });
                            const out = await r.json().catch(() => ({}));
                            if (!r.ok) {
                              const msg = [out?.error, out?.detail, out?.hint]
                                .map((x: any) => (typeof x === 'string' ? x.trim() : ''))
                                .filter(Boolean)
                                .join('\n\n');
                              try {
                                const status = Number(out?.status ?? 0);
                                if (status === 429) {
                                  window.localStorage.setItem('ramber.replicateCooldownUntil_v1', String(Date.now() + 2 * 60 * 1000));
                                }
                              } catch {
                              }
                              alert(msg || 'No pude reintentar el cover');
                              return;
                            }
                            const nextId = (out?.predictionId || out?.coverId || '').toString().trim();
                            if (!nextId) return;
                            try {
                              const key = 'ramber.pendingRvcCovers_v1';
                              const raw = window.localStorage.getItem(key);
                              const parsed = raw ? JSON.parse(raw) : null;
                              const list = Array.isArray(parsed) ? parsed : [];
                              const filtered = list.filter((x: any) => String(x?.predictionId || '').trim() !== String(first.predictionId || '').trim());
                              filtered.push({ predictionId: nextId, startedAt: Date.now(), songId: first.songId, voiceId: first.voiceId });
                              window.localStorage.setItem(key, JSON.stringify(filtered.slice(-10)));
                            } catch {
                            }
                            onRefreshSongs?.();
                          } catch {
                          }
                        }}
                        className="bg-white/5 border border-white/10 rounded-full px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-white/10 transition-colors"
                      >
                        Reintentar
                      </button>
                      <button
                        onClick={() => {
                          try {
                            window.localStorage.removeItem('ramber.pendingRvcCovers_v1');
                          } catch {
                          }
                          setPendingRvcCovers([]);
                        }}
                        className="bg-white/5 border border-white/10 rounded-full px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-white/10 transition-colors"
                      >
                        Ocultar
                      </button>
                      <button
                        onClick={async () => {
                          const first = pendingRvcCovers[0];
                          if (!first?.predictionId) return;
                          try {
                            const t = await getAccessToken();
                            if (!t.ok) return;
                            const r = await fetch(`/api/replicate/predictions/${first.predictionId}/cancel`, {
                              method: 'POST',
                              headers: {
                                'Content-Type': 'application/json',
                                Authorization: `Bearer ${t.token}`,
                              },
                            });
                            if (r.ok) {
                              alert('Cover cancelado en Replicate');
                              try {
                                window.localStorage.removeItem('ramber.pendingRvcCovers_v1');
                              } catch {
                              }
                              setPendingRvcCovers([]);
                            } else {
                              const out = await r.json().catch(() => ({}));
                              alert(out?.error || 'No pude cancelar el cover');
                            }
                          } catch {
                            alert('Error al cancelar');
                          }
                        }}
                        className="bg-red-600 border border-red-700 rounded-full px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 transition-colors"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {completedDownloads.length > 0 && !showTrash && (
              <div className="glass-card rounded-2xl p-4 border border-white/10">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-white font-bold truncate">Listo para descargar</div>
                    <div className="text-slate-400 text-xs">Tus procesos terminaron. Abre para ver los links.</div>
                  </div>
                  <div className="shrink-0 flex items-center gap-2">
                    <button
                      onClick={() => {
                        try {
                          window.localStorage.removeItem('ramber.completedSunoDownloads_v1');
                        } catch {
                        }
                        setCompletedDownloads([]);
                      }}
                      className="bg-white/5 border border-white/10 rounded-full px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-white/10 transition-colors"
                    >
                      Limpiar
                    </button>
                  </div>
                </div>

                <div className="mt-3 space-y-2">
                  {completedDownloads.slice(0, 6).map((it) => {
                    const k = (it.kind || '').toLowerCase();
                    const base = k === 'split_stem' ? 'Stems' : k === 'separate_vocal' ? 'Karaoke' : 'Descarga';
                    const name = (it?.draft?.title || '').toString().trim();
                    const label = name ? `${base}: ${name}` : base;
                    return (
                      <div key={`${it.taskId}:${it.kind}`} className="w-full glass-card rounded-2xl p-3 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-slate-200 font-semibold truncate">{label}</div>
                          <div className="text-slate-500 text-xs truncate">{`TaskId: ${it.taskId}`}</div>
                        </div>
                        <div className="shrink-0 flex items-center gap-2">
                          <button
                            onClick={() => openCompletedDownload(it).catch(() => {})}
                            className="bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-100 border border-indigo-400/20 px-3 py-2 rounded-full text-xs font-semibold transition-colors"
                          >
                            Ver
                          </button>
                          <button
                            onClick={() => removeCompletedDownload(it.taskId)}
                            className="bg-red-500/10 hover:bg-red-500/20 text-red-100 border border-red-400/20 px-3 py-2 rounded-full text-xs font-semibold transition-colors"
                          >
                            Borrar
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {visibleSongs.length === 0 ? (
              <div className="p-6 text-center text-slate-500 text-sm mt-10">
                <div>{filtersHideSongs ? 'No hay resultados con los filtros actuales' : showTrash ? 'No hay canciones eliminadas' : 'No hay canciones'}</div>
                {filtersHideSongs ? (
                  <div className="mt-4 flex items-center justify-center gap-2 flex-wrap">
                    {hasSearchFilter ? (
                      <button
                        onClick={() => {
                          setSearchDraft('');
                          setSearchQuery('');
                        }}
                        className="bg-white/5 hover:bg-white/10 border border-white/10 px-4 py-2 rounded-full text-xs text-slate-200 transition-colors"
                      >
                        Quitar búsqueda
                      </button>
                    ) : null}
                    {hasDateFilter ? (
                      <button
                        onClick={() => {
                          setFilterFrom('');
                          setFilterTo('');
                        }}
                        className="bg-white/5 hover:bg-white/10 border border-white/10 px-4 py-2 rounded-full text-xs text-slate-200 transition-colors"
                      >
                        Quitar filtros
                      </button>
                    ) : null}
                  </div>
                ) : !showTrash && (
                  <button
                    onClick={() => onRefreshSongs?.()}
                    className="mt-4 bg-white/5 hover:bg-white/10 border border-white/10 px-4 py-2 rounded-full text-xs text-slate-200 transition-colors"
                  >
                    Actualizar
                  </button>
                )}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.56fr)_minmax(320px,0.88fr)] gap-4 items-start">
                  <div className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(8,12,24,0.96),rgba(4,6,14,0.98))] min-h-0 flex flex-col overflow-hidden">
                    <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
                      <div>
                        <div className="text-white font-bold">Canciones</div>
                        <div className="text-xs text-slate-500">{visibleSongs.length} resultado(s)</div>
                      </div>
                    </div>

                    <div className="p-3 space-y-3">
                      {visibleSongs.map((song) => {
                        const durationSec = Number(songDurationsSec[song.id] || 0);
                        const folderName = folderNameById.get(songFolderId[song.id] || '') || '';
                        const createdLabel = fmtSongDate(song.createdAt);
                        const isSelected = selectedSong?.id === song.id;
                        const isLiked = Boolean(likedSongIds[song.id]);

                        return (
                          <div
                            key={song.id}
                            onClick={() => openSongDetails(song)}
                            className={cn(
                              "group cursor-pointer rounded-[24px] border px-4 py-3 transition-all",
                              isSelected
                                ? "border-fuchsia-500/40 bg-fuchsia-500/[0.08] shadow-[0_0_0_1px_rgba(168,85,247,0.18)]"
                                : "border-white/10 bg-white/[0.02] hover:bg-white/[0.05]"
                            )}
                          >
                            <div className="flex items-center gap-4">
                              <div
                                className="relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-[18px] border border-white/10 bg-slate-900"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openSongDetails(song);
                                  if (!showTrash && song.audioUrl) onPlaySong(song);
                                }}
                              >
                                <img
                                  src={getSongCoverSrc(song)}
                                  onError={() => {
                                    const sid = String(song.id || '').trim();
                                    if (!sid) return;
                                    setBrokenCovers((prev) => (prev[sid] ? prev : { ...prev, [sid]: true }));
                                  }}
                                  alt={song.title || 'Cover'}
                                  className="h-full w-full object-cover"
                                />
                                {(() => {
                                  const pb = getProviderBadge(song);
                                  return (
                                    <div className={`absolute top-1 left-1 z-10 ${pb.cls}`}>
                                      {pb.label}
                                    </div>
                                  );
                                })()}
                                {durationSec > 0 ? (
                                  <div className="absolute bottom-1 right-1 rounded bg-black/65 px-1.5 py-0.5 text-[10px] font-medium text-white z-10">
                                    {fmtDuration(durationSec)}
                                  </div>
                                ) : null}
                              </div>

                              <div className="min-w-0 flex-1">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="truncate text-sm md:text-[15px] font-extrabold text-white">{song.title || 'Pista sin título'}</div>
                                    <div className="mt-1 truncate text-xs text-slate-400">
                                      {getSongSubtitle(song) || 'Sin información adicional'}
                                    </div>
                                  </div>
                                  <div className="hidden xl:flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (!showTrash) onPlaySong(song);
                                      }}
                                      disabled={showTrash || !song.audioUrl}
                                      className={cn(
                                        "flex h-10 w-10 items-center justify-center rounded-full border transition-colors",
                                        showTrash || !song.audioUrl
                                          ? "border-white/10 bg-white/[0.04] text-slate-600 cursor-not-allowed"
                                          : "border-white/10 bg-white/[0.05] text-slate-100 hover:bg-white/[0.1]"
                                      )}
                                      aria-label="Reproducir"
                                    >
                                      {activeSongId === song.id && isPlaying ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        toggleLikeForSong(song);
                                      }}
                                      className={cn(
                                        "flex h-10 w-10 items-center justify-center rounded-full border transition-colors",
                                        isLiked ? "border-fuchsia-400/30 bg-fuchsia-500/15 text-fuchsia-200" : "border-white/10 bg-white/[0.05] text-slate-300 hover:bg-white/[0.1]"
                                      )}
                                      aria-label="Me gusta"
                                    >
                                      <ThumbsUp className="h-4 w-4" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openSharePicker(song);
                                      }}
                                      disabled={Boolean(songActionBusy[song.id])}
                                      className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-slate-300 hover:bg-white/[0.1] transition-colors"
                                      aria-label="Compartir"
                                    >
                                      <Share2 className="h-4 w-4" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        downloadSongCard(song);
                                      }}
                                      disabled={Boolean(songActionBusy[song.id])}
                                      className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-slate-300 hover:bg-white/[0.1] transition-colors"
                                      aria-label="Descargar"
                                    >
                                      <Download className="h-4 w-4" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setMenuSong(song);
                                      }}
                                      className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-slate-300 hover:bg-white/[0.1] transition-colors"
                                      aria-label="Opciones"
                                    >
                                      <MoreVertical className="h-4 w-4" />
                                    </button>
                                  </div>
                                </div>

                                <div className="mt-3 flex flex-wrap items-center gap-2">
                                  <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-300">{formatSongStatus(song)}</span>
                                  {(() => {
                                    const pb = getProviderBadge(song);
                                    return <span className={`${pb.cls} px-2.5 py-1 text-[11px]`}>{pb.label}</span>;
                                  })()}
                                  <span className="rounded-full bg-white/[0.06] px-2.5 py-1 text-[11px] font-semibold text-slate-400">{song.isPublic ? 'Pública' : 'Privada'}</span>
                                  {folderName ? <span className="rounded-full bg-white/[0.06] px-2.5 py-1 text-[11px] font-semibold text-slate-400">📁 {folderName}</span> : null}
                                </div>

                                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
                                  <span>{createdLabel ? `Creada: ${createdLabel}` : 'Sin fecha'}</span>
                                  <span>{song.id ? `ID: ${song.id}` : 'Sin ID'}</span>
                                </div>

                                <div className="mt-3 flex xl:hidden flex-wrap items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (!showTrash) onPlaySong(song);
                                    }}
                                    disabled={showTrash || !song.audioUrl}
                                    className={cn(
                                      "rounded-full px-3 py-2 text-xs font-semibold border transition-colors",
                                      showTrash || !song.audioUrl
                                        ? "border-white/10 bg-white/[0.04] text-slate-600 cursor-not-allowed"
                                        : "border-white/10 bg-white/[0.05] text-slate-100"
                                    )}
                                  >
                                    Reproducir
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openSharePicker(song);
                                    }}
                                    className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-2 text-xs font-semibold text-slate-200"
                                  >
                                    Compartir
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setMenuSong(song);
                                    }}
                                    className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-2 text-xs font-semibold text-slate-200"
                                  >
                                    Más
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="hidden xl:block xl:sticky xl:top-4 min-h-0">
                    {selectedSong ? renderSongDetailPanel(selectedSong, 'desktop') : null}
                  </div>
                </div>

                {mobileDetailOpen && selectedSong ? (
                  <div className="fixed inset-0 z-[270] bg-black/70 flex items-end xl:hidden">
                    <button
                      className="absolute inset-0 w-full h-full"
                      onClick={() => setMobileDetailOpen(false)}
                      aria-label="Cerrar detalle"
                    />
                    <div className="relative w-full rounded-t-[32px] border border-white/10 bg-[#06090f] shadow-2xl overflow-hidden">
                      <div className="flex items-center justify-between gap-3 px-4 py-4 border-b border-white/10">
                        <div className="min-w-0">
                          <div className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">Detalle</div>
                          <div className="text-white font-extrabold truncate">{selectedSong.title || 'Pista sin título'}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setMobileDetailOpen(false)}
                          className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-200"
                          aria-label="Cerrar"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                      {renderSongDetailPanel(selectedSong, 'mobile')}
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </div>
        )}
        {activeTab === 'listas' && (
          <div className="p-4 space-y-4">
            {activeFolderId ? (
              <>
                <div className="flex items-center justify-between gap-3">
                  <button
                    onClick={() => setActiveFolderId('')}
                    className="bg-white/5 hover:bg-white/10 border border-white/10 px-4 py-2 rounded-full text-sm font-semibold text-slate-200 transition-colors"
                  >
                    ← Carpetas
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setIsCreateListOpen(true)}
                      className="bg-white/5 hover:bg-white/10 border border-white/10 px-4 py-2 rounded-full text-sm font-semibold text-slate-200 transition-colors flex items-center gap-2"
                    >
                      <FolderPlus className="w-4 h-4" /> Nueva carpeta
                    </button>
                    <button
                      onClick={() => {
                        setActiveFolderId('');
                        setActiveTab('canciones');
                      }}
                      className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-200 hover:bg-white/10 transition-colors"
                      aria-label="Cerrar"
                      title="Cerrar"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                <div className="text-white font-extrabold text-lg">
                  {folders.find((f) => f.id === activeFolderId)?.name || 'Carpeta'}
                </div>

                {(() => {
                  const list = canciones.filter((s) => (songFolderId[s.id] || '') === activeFolderId);
                  if (list.length === 0) {
                    return <div className="text-slate-400 text-sm">Esta carpeta está vacía.</div>;
                  }
                  return (
                    <div className="space-y-2">
                      {list.map((song) => (
                        <button
                          key={song.id}
                          onClick={() => onPlaySong(song)}
                          className="w-full glass-card rounded-2xl p-4 flex items-center gap-3 hover:bg-white/10 transition-colors text-left"
                        >
                          <div className="w-12 h-12 rounded-xl overflow-hidden bg-white/5 border border-white/10 shrink-0">
                            <img
                              src={(() => {
                                const sid = String(song.id || '').trim();
                                const broken = Boolean(brokenCovers[sid]);
                                const raw = (song.coverUrl || '').toString().trim();
                                if (!raw || broken) return makeFallbackCoverSvgUrl(song.title || sid);
                                return raw;
                              })()}
                              onError={() => {
                                const sid = String(song.id || '').trim();
                                if (!sid) return;
                                setBrokenCovers((prev) => (prev[sid] ? prev : { ...prev, [sid]: true }));
                              }}
                              alt="Cover"
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-white font-bold truncate">{song.title || 'Pista sin título'}</div>
                            <div className="text-slate-400 text-xs truncate">{formatGenderPresentation(song.genre || '') || ' '}</div>
                          </div>
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setMenuSong(song);
                            }}
                            className={cn(
                              "w-9 h-9 rounded-full border flex items-center justify-center text-slate-200 transition-all active:scale-95",
                              menuSong?.id === song.id ? "bg-white/15 border-white/25" : "bg-white/5 border-white/10 hover:bg-white/10"
                            )}
                            aria-label="Opciones"
                          >
                            <MoreVertical className="w-4 h-4 text-slate-300" />
                          </button>
                        </button>
                      ))}
                    </div>
                  );
                })()}
              </>
            ) : (
              <>
                <div className="flex items-center justify-between gap-3">
                  <div className="text-white font-extrabold text-lg">Carpetas</div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setIsCreateListOpen(true)}
                      className="bg-white/5 hover:bg-white/10 border border-white/10 px-4 py-2 rounded-full text-sm font-semibold text-slate-200 transition-colors flex items-center gap-2"
                    >
                      <FolderPlus className="w-4 h-4" /> Nueva carpeta
                    </button>
                    <button
                      onClick={() => setActiveTab('canciones')}
                      className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-200 hover:bg-white/10 transition-colors"
                      aria-label="Cerrar"
                      title="Cerrar"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={() => setIsCreateListOpen(true)}
                    className="w-full aspect-square border border-dashed border-white/20 rounded-2xl flex items-center justify-center cursor-pointer hover:bg-white/5 transition-colors glass-card"
                  >
                    <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
                      <Plus className="w-5 h-5 text-slate-300" />
                    </div>
                  </button>
                  {folders.map((f) => {
                    const n = canciones.filter((s) => (songFolderId[s.id] || '') === f.id).length;
                    return (
                      <button
                        key={f.id}
                        onClick={() => setActiveFolderId(f.id)}
                        className="w-full aspect-square glass-card rounded-2xl p-4 flex flex-col items-start justify-between text-left hover:bg-white/10 transition-colors"
                      >
                        <div className="w-10 h-10 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
                          <ListMusic className="w-5 h-5 text-slate-200" />
                        </div>
                        <div className="w-full">
                          <div className="text-white font-extrabold truncate">{f.name}</div>
                          <div className="text-slate-400 text-xs">{n} {n === 1 ? 'canción' : 'canciones'}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div className="text-[11px] text-slate-500">Tus canciones siguen en “Canciones”. Las carpetas solo ayudan a ordenar.</div>
              </>
            )}
          </div>
        )}
      </div>

      {isCreateVibeOpen && (
        <CreateVibeModal onClose={() => setIsCreateVibeOpen(false)} canciones={canciones} onAddVibe={onAddVibe} />
      )}
      
      {isCreateListOpen && (
        <CreateListModal
          onClose={() => setIsCreateListOpen(false)}
          onCreate={(name) => {
            const clean = (name || '').toString().trim();
            if (!clean) return;
            const id = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
            setFolders((prev) => [{ id, name: clean.slice(0, 60), createdAt: Date.now() }, ...prev]);
            setIsCreateListOpen(false);
          }}
        />
      )}

      {isFiltersOpen && (
        <FiltersModal
          from={filterFrom}
          to={filterTo}
          sort={sortOrder}
          onClose={() => setIsFiltersOpen(false)}
          onApply={(next) => {
            setFilterFrom(next.from);
            setFilterTo(next.to);
            setSortOrder(next.sort);
            setIsFiltersOpen(false);
          }}
          onClear={() => {
            setFilterFrom('');
            setFilterTo('');
            setSortOrder('newest');
            setIsFiltersOpen(false);
          }}
        />
      )}

      {moveFolderSong && (
        <FolderPickerModal
          songTitle={moveFolderSong.title || 'Pista sin título'}
          folders={folders}
          currentFolderId={songFolderId[moveFolderSong.id] || ''}
          onClose={() => setMoveFolderSong(null)}
          onPick={(folderId) => {
            const sid = moveFolderSong.id;
            setSongFolderId((prev) => {
              const next = { ...prev };
              if (!folderId) delete next[sid];
              else next[sid] = folderId;
              return next;
            });
            setMoveFolderSong(null);
          }}
          onCreateAndPick={(name) => {
            const clean = (name || '').toString().trim();
            if (!clean) return;
            const id = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
            setFolders((prev) => [{ id, name: clean.slice(0, 60), createdAt: Date.now() }, ...prev]);
            const sid = moveFolderSong.id;
            setSongFolderId((prev) => ({ ...prev, [sid]: id }));
            setMoveFolderSong(null);
          }}
        />
      )}

      {sharePickerSong && (
        <div className="fixed inset-0 z-[280] bg-black/80 backdrop-blur-sm flex items-end md:items-center justify-center">
          <button className="absolute inset-0 w-full h-full" onClick={() => setSharePickerSong(null)} aria-label="Cerrar" />
          <div className="relative w-full md:max-w-[640px] bg-[linear-gradient(180deg,rgba(9,12,24,0.98),rgba(5,7,16,0.99))] border border-white/10 rounded-t-3xl md:rounded-3xl overflow-hidden shadow-[0_25px_90px_rgba(0,0,0,0.5)]">
            <div className="p-5 border-b border-white/10 flex items-center justify-between">
              <div>
                <div className="text-white font-extrabold text-xl">Compartir</div>
                <div className="text-slate-400 text-sm truncate">{sharePickerSong.title || 'Canción'}</div>
              </div>
              <button
                onClick={() => setSharePickerSong(null)}
                className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-200"
              >
                ✕
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="rounded-[26px] border border-white/10 bg-white/[0.03] p-4 flex items-center gap-4">
                <div className="w-20 h-20 rounded-2xl overflow-hidden border border-white/10 bg-white/5 shrink-0">
                  {sharePickerSong.coverUrl ? (
                    <img src={sharePickerSong.coverUrl} alt={sharePickerSong.title || 'Canción'} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-500 text-xs">Sin portada</div>
                  )}
                </div>
                <div className="min-w-0">
                  <div className="text-white font-extrabold text-lg truncate">{sharePickerSong.title || 'Canción'}</div>
                  <div className="mt-1 text-slate-400 text-sm">Elige cómo quieres compartir este preview con tu cliente.</div>
                </div>
              </div>
              <button
                onClick={() => openCountdownShare(sharePickerSong).catch(() => {})}
                className="w-full text-left rounded-[26px] border border-fuchsia-500/40 bg-[linear-gradient(180deg,rgba(77,29,149,0.26),rgba(31,10,61,0.3))] px-5 py-5 shadow-[0_0_0_1px_rgba(168,85,247,0.12)]"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-white font-extrabold text-base">Compartir con Cuenta Regresiva</div>
                    <div className="mt-1 text-slate-300 text-sm">El enlace expirará automáticamente y mostrará un contador elegante al cliente.</div>
                  </div>
                  <div className="mt-1 w-4 h-4 rounded-full border-2 border-fuchsia-300 shadow-[0_0_0_4px_rgba(168,85,247,0.18)]" />
                </div>
              </button>
              <button
                onClick={async () => {
                  const currentSong = sharePickerSong;
                  setSharePickerSong(null);
                  if (currentSong) await shareSongCard(currentSong);
                }}
                className="w-full text-left rounded-[26px] border border-white/10 bg-white/[0.03] px-5 py-5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-white font-extrabold text-base">Sin Cuenta Regresiva</div>
                    <div className="mt-1 text-slate-300 text-sm">El enlace no expirará automáticamente y abrirá el preview público normal.</div>
                  </div>
                  <div className="mt-1 w-4 h-4 rounded-full border border-white/40" />
                </div>
              </button>
              <div className="rounded-2xl border border-violet-500/20 bg-violet-500/10 px-4 py-3 text-sm text-violet-100">
                Tus canciones están protegidas. El cliente podrá escuchar el preview, pero no descargarlo desde el enlace público.
              </div>
            </div>
          </div>
        </div>
      )}

      {countdownShareSong && (
        <div className="fixed inset-0 z-[281] bg-black/80 backdrop-blur-sm flex items-end md:items-center justify-center">
          <button className="absolute inset-0 w-full h-full" onClick={() => setCountdownShareSong(null)} aria-label="Cerrar" />
          <div className="relative w-full md:max-w-[640px] bg-[linear-gradient(180deg,rgba(9,12,24,0.98),rgba(5,7,16,0.99))] border border-white/10 rounded-t-3xl md:rounded-3xl overflow-hidden shadow-[0_25px_90px_rgba(0,0,0,0.5)]">
            <div className="p-5 border-b border-white/10 flex items-center justify-between">
              <div>
                <div className="text-white font-extrabold text-xl">Compartir con Cuenta Regresiva</div>
                <div className="text-slate-400 text-sm truncate">{countdownShareSong.title || 'Canción'}</div>
              </div>
              <button
                onClick={() => setCountdownShareSong(null)}
                className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-200"
              >
                ✕
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="rounded-[24px] border border-fuchsia-500/20 bg-fuchsia-500/10 px-4 py-4 text-sm text-fuchsia-100">
                Configura el tiempo real del enlace temporal. Mantengo la lógica actual de expiración y solo estoy mejorando la presentación.
              </div>
              <input
                value={countdownClientLabel}
                onChange={(e) => setCountdownClientLabel(e.target.value)}
                placeholder="Nombre o referencia del cliente"
                className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-white placeholder:text-slate-500 outline-none"
              />
              <div className="grid grid-cols-1 md:grid-cols-[1fr,180px] gap-3">
                <input
                  type="number"
                  min={1}
                  value={countdownValue}
                  onChange={(e) => setCountdownValue(e.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-white outline-none"
                />
                <select
                  value={countdownUnit}
                  onChange={(e) => setCountdownUnit(e.target.value === 'days' ? 'days' : e.target.value === 'minutes' ? 'minutes' : 'hours')}
                  className="luciana-dark-select w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-white outline-none"
                >
                  <option value="minutes">Minutos</option>
                  <option value="hours">Horas</option>
                  <option value="days">Días</option>
                </select>
              </div>
              <button
                onClick={() => createCountdownShare().catch(() => {})}
                disabled={countdownBusy}
                className="w-full h-[52px] rounded-full bg-gradient-to-r from-fuchsia-500 to-violet-500 text-white font-extrabold text-sm disabled:opacity-60"
              >
                {countdownBusy ? 'Creando enlace…' : 'Crear enlace temporal'}
              </button>
            </div>
          </div>
        </div>
      )}

      {shareResult && (
        <div className="fixed inset-0 z-[282] bg-black/80 backdrop-blur-sm flex items-end md:items-center justify-center">
          <button className="absolute inset-0 w-full h-full" onClick={() => setShareResult(null)} aria-label="Cerrar" />
          <div className="relative w-full md:max-w-[640px] bg-[linear-gradient(180deg,rgba(9,12,24,0.98),rgba(5,7,16,0.99))] border border-white/10 rounded-t-3xl md:rounded-3xl overflow-hidden shadow-[0_25px_90px_rgba(0,0,0,0.5)]">
            <div className="p-5 border-b border-white/10 flex items-center justify-between">
              <div>
                <div className="text-white font-extrabold text-xl">{shareResult.title}</div>
                <div className="text-slate-400 text-sm">{shareResult.description}</div>
              </div>
              <button
                onClick={() => setShareResult(null)}
                className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-200"
              >
                ✕
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
                <div className="text-[11px] uppercase tracking-[0.28em] text-slate-500">{shareResult.isCountdown ? 'Enlace temporal' : 'Enlace público'}</div>
                <textarea
                  readOnly
                  value={shareResult.url}
                  onFocus={(e) => e.target.select()}
                  className="mt-3 w-full min-h-[96px] bg-transparent text-slate-100 text-sm outline-none resize-none"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <button
                  onClick={async () => {
                    const done = await copyCountdownLink(shareResult.url);
                    if (done) {
                      setShareResult((prev) => prev ? { ...prev, description: 'Link copiado. Ya puedes enviarlo a tu cliente.' } : prev);
                      return;
                    }
                    setShareResult((prev) => prev ? { ...prev, description: 'No pude copiarlo automático. Mantén presionado el link para copiarlo manualmente.' } : prev);
                  }}
                  className="w-full h-[52px] rounded-full bg-white text-gray-900 shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] ring-1 ring-inset ring-black/10 font-extrabold text-sm"
                >
                  Copiar enlace
                </button>
                <a
                  href={shareResult.url}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full h-[52px] rounded-full bg-white/5 border border-white/10 text-slate-100 font-extrabold text-sm flex items-center justify-center"
                >
                  Abrir preview
                </a>
              </div>
              <div className="rounded-2xl border border-violet-500/20 bg-violet-500/10 px-4 py-3 text-sm text-violet-100">
                Esta canción está protegida. El cliente podrá escuchar el preview, pero no descargarla directamente desde este enlace.
              </div>
            </div>
          </div>
        </div>
      )}

      {menuSong && (
        <SongOptionsSheet
          song={menuSong}
          onClose={() => setMenuSong(null)}
          isDeleted={showTrash}
          coverSrc={(() => {
            const sid = String(menuSong.id || '').trim();
            const broken = Boolean(brokenCovers[sid]);
            const raw = (menuSong.coverUrl || '').toString().trim();
            if (!raw || broken) return makeFallbackCoverSvgUrl(menuSong.title || sid);
            return raw;
          })()}
          onCoverError={() => {
            const sid = String(menuSong.id || '').trim();
            if (!sid) return;
            setBrokenCovers((prev) => (prev[sid] ? prev : { ...prev, [sid]: true }));
          }}
          onPlay={() => onPlaySong(menuSong)}
          onElenco={() => onOpenElenco?.(menuSong)}
          onStartCover={() => onStartCover?.(menuSong)}
          onToast={onToast}
          onOpenLists={() => setActiveTab('listas')}
          onOpenVideos={() => {
            setActiveTab('video');
            loadVideos().catch(() => {});
          }}
          onMoveToFolder={() => {
            setMoveFolderSong(menuSong);
            setMenuSong(null);
          }}
          onShare={() => {
            const currentSong = menuSong;
            setMenuSong(null);
            if (currentSong) openSharePicker(currentSong);
          }}
          onRefreshSongs={onRefreshSongs}
          onRestore={() => {
            const id = menuSong.id;
            setMenuSong(null);
            onRestoreSong?.(id);
          }}
          onDelete={() => {
            const currentSong = menuSong;
            setMenuSong(null);
            handleDeleteSong(currentSong).catch(() => {});
          }}
          onPurge={() => {
            const id = menuSong.id;
            setMenuSong(null);
            onPurgeSong?.(id);
          }}
        />
      )}

      {downloadsModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-end md:items-center justify-center">
          <button
            className="absolute inset-0 w-full h-full"
            onClick={() => {
              setDownloadsModalOpen(false);
              setDownloadsModalItems([]);
              setDownloadsModalError('');
              setDownloadsModalZipping(false);
            }}
            aria-label="Cerrar"
          />
          <div className="relative w-full md:max-w-[720px] bg-[#0b0f16] border border-white/10 rounded-t-3xl md:rounded-3xl overflow-hidden max-h-[92vh] flex flex-col shadow-[0_-20px_60px_rgba(0,0,0,0.65)]">
            <div className="p-4 border-b border-white/10 flex items-center justify-between shrink-0 bg-[#0b0f16]">
              <div className="text-white font-extrabold truncate">{downloadsModalTitle || 'Descarga'}</div>
              <button
                onClick={() => {
                  setDownloadsModalOpen(false);
                  setDownloadsModalItems([]);
                  setDownloadsModalError('');
                  setDownloadsModalZipping(false);
                }}
                className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-200"
              >
                ✕
              </button>
            </div>

            <div className="p-4 flex-1 overflow-y-auto overscroll-contain">
              <div className="text-slate-400 text-xs">{' '}</div>
              <div className="mt-1 text-slate-500 text-xs">{' '}</div>

              {downloadsModalBusy ? (
                <div className="mt-6 text-slate-400 text-sm">Cargando…</div>
              ) : downloadsModalError ? (
                <div className="mt-6 text-red-200 text-sm">{downloadsModalError}</div>
              ) : downloadsModalItems.length === 0 ? (
                <div className="mt-6 text-slate-400 text-sm">No hay pistas para mostrar.</div>
              ) : (
                <>
                  {(() => {
                    const isKaraoke = (downloadsModalKind || '').toLowerCase() === 'separate_vocal';
                    if (!isKaraoke) {
                      const activeCount = downloadsModalItems.filter((x) => !downloadsModalMuted[String(x?.key || '').trim()]).length;
                      const mutedCount = downloadsModalItems.length - activeCount;
                      return (
                        <>
                          <div className="mt-2 text-xs text-slate-400">
                            {mutedCount > 0 ? `Silenciadas: ${mutedCount} • ` : ''}Listas para descargar: {activeCount}
                          </div>
                          <div className="mt-3 flex items-center gap-2 flex-wrap">
                            <button
                              className="bg-white/5 hover:bg-white/10 text-slate-200 border border-white/10 px-4 py-2 rounded-full text-sm font-semibold transition-colors disabled:opacity-50"
                              disabled={downloadsModalItems.length === 0 || downloadsModalZipping || downloadsModalMixing}
                              onClick={() => {
                                const next: Record<string, boolean> = {};
                                downloadsModalItems.forEach((x) => {
                                  const k = String(x?.key || '').trim();
                                  if (!k) return;
                                  next[k] = true;
                                });
                                setDownloadsModalMuted(next);
                              }}
                            >
                              Silenciar todos
                            </button>
                            <button
                              className="bg-white/5 hover:bg-white/10 text-slate-200 border border-white/10 px-4 py-2 rounded-full text-sm font-semibold transition-colors disabled:opacity-50"
                              disabled={downloadsModalItems.length === 0 || downloadsModalZipping || downloadsModalMixing}
                              onClick={() => setDownloadsModalMuted({})}
                            >
                              Activar todos
                            </button>
                            <button
                              className="bg-indigo-600 hover:bg-indigo-500 text-white border border-indigo-400/20 px-4 py-2 rounded-full text-sm font-semibold transition-colors disabled:opacity-50"
                              disabled={downloadsModalItems.filter((x) => !downloadsModalMuted[String(x?.key || '').trim()]).length === 0 || downloadsModalZipping || downloadsModalMixing}
                              onClick={async () => {
                                const list = downloadsModalItems.filter((x) => !downloadsModalMuted[String(x?.key || '').trim()]);
                                const text = list.map((x) => `${x.label}: ${x.url}`).join('\n');
                                try {
                                  await navigator.clipboard.writeText(text);
                                  alert('Copiado al portapapeles.');
                                } catch {
                                  alert(text);
                                }
                              }}
                            >
                              Copiar links
                            </button>
                            <button
                              className="bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-400/20 px-4 py-2 rounded-full text-sm font-semibold transition-colors disabled:opacity-50"
                              disabled={downloadsModalItems.length === 0 || downloadsModalZipping || downloadsModalMixing}
                              onClick={() => {
                                const base = sanitizeFileName(downloadsModalTitle || 'stems');
                                downloadsModalItems.forEach((x) => {
                                  const name = sanitizeFileName(`${base} - ${x.label}.mp3`);
                                  downloadToDevice(x.url, name).catch(() => {});
                                });
                              }}
                            >
                              Descargar todo (archivos)
                            </button>
                            <button
                              className="bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-400/20 px-4 py-2 rounded-full text-sm font-semibold transition-colors disabled:opacity-50"
                              disabled={downloadsModalItems.length === 0 || downloadsModalZipping || downloadsModalMixing}
                              onClick={() => {
                                downloadMixedStemsMp3().catch(() => {});
                              }}
                            >
                              Descargar mezcla (MP3)
                            </button>
                            <button
                              className="bg-slate-800 hover:bg-slate-700 text-slate-100 border border-white/10 px-4 py-2 rounded-full text-sm font-semibold transition-colors disabled:opacity-50"
                              disabled={downloadsModalItems.filter((x) => !downloadsModalMuted[String(x?.key || '').trim()]).length === 0 || downloadsModalZipping || downloadsModalMixing}
                              onClick={async () => {
                                const list = downloadsModalItems.filter((x) => !downloadsModalMuted[String(x?.key || '').trim()]);
                                if (list.length === 0) return;
                                setDownloadsModalZipping(true);
                                try {
                                  const t = await getAccessToken();
                                  if (!t.ok) {
                                    alert(t.error || 'No se pudo iniciar sesión.');
                                    return;
                                  }
                                  const r = await fetch('/api/library/zip-stems', {
                                    method: 'POST',
                                    headers: { 'content-type': 'application/json', authorization: `Bearer ${t.token}` },
                                    body: JSON.stringify({
                                      title: downloadsModalTitle || 'Stems',
                                      items: list.map((x) => ({
                                        label: x.label,
                                        url: x.url,
                                      })),
                                    }),
                                  });
                                  if (!r.ok) {
                                    const out = await r.json().catch(() => ({}));
                                    alert((out?.detail || out?.error || 'No pude preparar el ZIP.').toString());
                                    return;
                                  }
                                  const skipped = Number((r.headers.get('x-ramber-zip-skipped') || '').toString().trim() || '0');
                                  const blob = await r.blob();
                                  const obj = URL.createObjectURL(blob);
                                  const base = sanitizeFileName(downloadsModalTitle || 'stems') || 'stems';
                                  await downloadToDevice(obj, `${base}.zip`);
                                  if (Number.isFinite(skipped) && skipped > 0) {
                                    alert(`Algunas pistas no se pudieron incluir en el ZIP (${skipped}). Vuelve a intentar si las necesitas.`);
                                  }
                                  window.setTimeout(() => {
                                    try {
                                      URL.revokeObjectURL(obj);
                                    } catch {
                                    }
                                  }, 60_000);
                                } catch (e) {
                                  alert(e instanceof Error ? e.message : 'No pude preparar el ZIP.');
                                } finally {
                                  setDownloadsModalZipping(false);
                                }
                              }}
                            >
                              Descargar todo (ZIP)
                            </button>
                            <button
                              className="bg-slate-800 hover:bg-slate-700 text-slate-100 border border-white/10 px-4 py-2 rounded-full text-sm font-semibold transition-colors"
                              onClick={() => removeCompletedDownload(downloadsModalTaskId)}
                              disabled={!downloadsModalTaskId}
                            >
                              Marcar como listo
                            </button>
                          </div>

                          {downloadsModalSaving && <div className="mt-3 text-slate-400 text-xs">Guardando en Biblioteca…</div>}
                          {downloadsModalZipping && <div className="mt-2 text-slate-400 text-xs">Preparando ZIP…</div>}
                          {downloadsModalMixing && <div className="mt-2 text-slate-400 text-xs">Preparando mezcla MP3…</div>}

                          <div className="mt-4 space-y-2">
                            {downloadsModalItems.map((it) => (
                              (() => {
                                const isMuted = Boolean(downloadsModalMuted[String(it?.key || '').trim()]);
                                return (
                              <div
                                key={`${it.key}:${it.url}`}
                                className={cn(
                                  "w-full bg-[#0f1420] border border-white/10 rounded-2xl p-4 flex items-center justify-between gap-3 hover:bg-[#141c2c] transition-colors",
                                  isMuted ? "opacity-60" : ""
                                )}
                              >
                                <div className="min-w-0">
                                  <div className="text-white font-bold truncate flex items-center gap-2">
                                    <span className="truncate">{it.label}</span>
                                    {isMuted ? <span className="shrink-0 text-[10px] px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-slate-200">MUTE</span> : null}
                                  </div>
                                  <div className="text-slate-500 text-xs truncate">{it.url}</div>
                                </div>
                                <div className="shrink-0 flex items-center gap-2">
                                  <button
                                    className={cn(
                                      "bg-white/5 hover:bg-white/10 text-slate-200 border border-white/10 px-3 py-2 rounded-full text-xs font-semibold transition-colors",
                                      isMuted ? "bg-rose-500/10 border-rose-400/20 text-rose-200 hover:bg-rose-500/15" : ""
                                    )}
                                    onClick={() => {
                                      const k = String(it?.key || '').trim();
                                      if (!k) return;
                                      setDownloadsModalMuted((prev) => ({ ...prev, [k]: !Boolean(prev?.[k]) }));
                                    }}
                                    disabled={downloadsModalZipping}
                                    title={isMuted ? 'Quitar mute' : 'Poner mute'}
                                  >
                                    {isMuted ? (
                                      <span className="inline-flex items-center gap-2">
                                        <Volume2 className="w-4 h-4" /> Activar
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-2">
                                        <VolumeX className="w-4 h-4" /> Mute
                                      </span>
                                    )}
                                  </button>
                                  <button
                                    className="bg-indigo-600 hover:bg-indigo-500 text-white border border-indigo-400/20 px-3 py-2 rounded-full text-xs font-semibold transition-colors"
                                    onClick={() => {
                                      const id = `${downloadsModalTaskId || 'stem'}_${it.key}`.replaceAll(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
                                      const title = `${downloadsModalTitle || 'Descarga'} - ${it.label}`.slice(0, 120);
                                      onPlaySong({
                                        id,
                                        title,
                                        description: downloadsModalTitle || undefined,
                                        audioUrl: it.url,
                                        coverUrl: downloadsModalCoverUrl || undefined,
                                        sunoTaskId: downloadsModalTaskId || null,
                                        sunoAudioId: it.audioId || null,
                                        isCover: false,
                                      });
                                    }}
                                  >
                                    Reproducir
                                  </button>
                                  <button
                                    className="bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-400/20 px-3 py-2 rounded-full text-xs font-semibold transition-colors"
                                    onClick={() => {
                                      const base = sanitizeFileName(downloadsModalTitle || 'stems');
                                      const name = sanitizeFileName(`${base} - ${it.label}.mp3`);
                                      downloadToDevice(it.url, name).catch(() => {});
                                    }}
                                    disabled={downloadsModalZipping}
                                  >
                                    Descargar
                                  </button>
                                </div>
                              </div>
                                );
                              })()
                            ))}
                          </div>

                          <div className="mt-4 text-[11px] text-slate-500">Los links pueden expirar. Descárgalos pronto si los vas a guardar.</div>
                        </>
                      );
                    }

                    const instrumental = downloadsModalItems.find((x) => String(x?.key || '').trim() === 'instrumentalUrl') || null;
                    const vocal = downloadsModalItems.find((x) => String(x?.key || '').trim() === 'vocalUrl') || null;
                    const blocks = [
                      instrumental
                        ? {
                            item: instrumental,
                            title: 'Instrumental (Karaoke)',
                            subtitle: 'Pista instrumental sin voz',
                          }
                        : null,
                      vocal
                        ? {
                            item: vocal,
                            title: 'Voz',
                            subtitle: 'Pista con voz original',
                          }
                        : null,
                    ].filter(Boolean) as Array<{ item: any; title: string; subtitle: string }>;

                    return (
                      <>
                        <div className="mt-2 text-xs text-slate-400">Listas para descargar: {blocks.length}</div>
                        <div className="mt-4 space-y-3">
                          {blocks.map(({ item: it, title, subtitle }) => (
                            <div key={`${it.key}:${it.url}`} className="w-full bg-[#0f1420] border border-white/10 rounded-2xl p-4 flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-white font-extrabold truncate">{title}</div>
                                <div className="mt-1 text-slate-400 text-xs truncate">{subtitle}</div>
                              </div>
                              <div className="shrink-0 flex items-center gap-2">
                                <button
                                  className="bg-indigo-600 hover:bg-indigo-500 text-white border border-indigo-400/20 px-3 py-2 rounded-full text-xs font-semibold transition-colors"
                                  onClick={() => {
                                    const id = `${downloadsModalTaskId || 'stem'}_${it.key}`.replaceAll(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
                                    const t = `${downloadsModalTitle || 'Karaoke'} - ${title}`.slice(0, 120);
                                    onPlaySong({
                                      id,
                                      title: t,
                                      description: downloadsModalTitle || undefined,
                                      audioUrl: it.url,
                                      coverUrl: downloadsModalCoverUrl || undefined,
                                      sunoTaskId: downloadsModalTaskId || null,
                                      sunoAudioId: it.audioId || null,
                                      isCover: false,
                                    });
                                  }}
                                >
                                  Reproducir
                                </button>
                                <button
                                  className="bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-400/20 px-3 py-2 rounded-full text-xs font-semibold transition-colors"
                                  onClick={() => {
                                    const base = sanitizeFileName(downloadsModalTitle || 'karaoke');
                                    const name = sanitizeFileName(`${base} - ${title}.mp3`);
                                    downloadToDevice(it.url, name).catch(() => {});
                                  }}
                                >
                                  Descargar
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="mt-4 text-[11px] text-slate-500">Los links pueden expirar. Descárgalos pronto si los vas a guardar.</div>
                      </>
                    );
                  })()}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function parseVocalRemovalItems(provider: any) {
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

  const labelForKey = (k: string) => {
    const kk = normalizeKey(k);
    const map: Record<string, string> = {
      originUrl: 'Original',
      instrumentalUrl: 'Instrumental (Karaoke)',
      vocalUrl: 'Voz',
      backingVocalsUrl: 'Coros',
      drumsUrl: 'Batería',
      bassUrl: 'Bajo',
      guitarUrl: 'Guitarra',
      keyboardUrl: 'Teclado',
      percussionUrl: 'Percusión',
      stringsUrl: 'Cuerdas',
      synthUrl: 'Synth',
      fxUrl: 'FX',
      brassUrl: 'Metales',
      woodwindsUrl: 'Vientos',
    };
    if (map[kk]) return map[kk];
    const base = kk
      .replaceAll(/Url$/g, '')
      .replaceAll(/([a-z])([A-Z])/g, '$1 $2')
      .trim();
    const map2: Record<string, string> = {
      Vocals: 'Voz',
      Instrumental: 'Instrumental (Karaoke)',
      'Backing Vocals': 'Coros',
      Drums: 'Batería',
      Bass: 'Bajo',
      Guitar: 'Guitarra',
      Keyboard: 'Teclado',
      Percussion: 'Percusión',
      Strings: 'Cuerdas',
      Synth: 'Synth',
      FX: 'FX',
      Brass: 'Metales',
      Woodwinds: 'Vientos',
      Original: 'Original',
    };
    if (map2[base]) return map2[base];
    return base || 'Pista';
  };

  const keyFromGroup = (label: string) => {
    const raw = (label || '').trim();
    const norm = raw.replaceAll(/[^a-zA-Z0-9 ]/g, ' ').replaceAll(/\s+/g, ' ').trim();
    const lower = norm.toLowerCase();
    const fixed: Record<string, string> = {
      vocals: 'vocalUrl',
      vocal: 'vocalUrl',
      instrumental: 'instrumentalUrl',
      'backing vocals': 'backingVocalsUrl',
      drums: 'drumsUrl',
      bass: 'bassUrl',
      guitar: 'guitarUrl',
      keyboard: 'keyboardUrl',
      percussion: 'percussionUrl',
      strings: 'stringsUrl',
      synth: 'synthUrl',
      fx: 'fxUrl',
      brass: 'brassUrl',
      woodwinds: 'woodwindsUrl',
      original: 'originUrl',
    };
    if (fixed[lower]) return fixed[lower];
    const words = norm.split(' ').filter(Boolean);
    if (words.length === 0) return '';
    const camel = words
      .map((w, i) => {
        const x = w.toLowerCase();
        if (i === 0) return x;
        return x.slice(0, 1).toUpperCase() + x.slice(1);
      })
      .join('');
    return camel ? `${camel}Url` : '';
  };

  const root = provider?.data || {};
  const resp = root?.response || root?.data?.response || {};
  const directUrlEntries = Object.entries(resp || {})
    .filter(([k, v]) => {
      const kk = String(k || '');
      const vv = cleanUrl(v);
      if (!vv.startsWith('http')) return false;
      return kk.endsWith('Url') || kk.endsWith('_url') || kk.endsWith('url');
    })
    .map(([k, v]) => [normalizeKey(String(k)), cleanUrl(v)] as const);

  const map = new Map<string, { url: string; audioId?: string }>();

  if (Array.isArray(resp?.originData)) {
    for (const row of resp.originData) {
      const label = String(row?.stem_type_group_name || row?.stemTypeGroupName || row?.name || row?.type || '').trim();
      const key = keyFromGroup(label) || `${label}Url`;
      const url = cleanUrl(row?.audio_url || row?.audioUrl || '');
      const audioId = String(row?.id || '').trim();
      if (!key || !url.startsWith('http')) continue;
      map.set(normalizeKey(key), { url, audioId: audioId || undefined });
    }
  }

  for (const [k, v] of directUrlEntries) {
    const prev = map.get(k);
    map.set(k, { url: v, audioId: prev?.audioId });
  }

  const entries = Array.from(map.entries())
    .filter(([_, v]) => typeof v?.url === 'string' && v.url.trim().startsWith('http'))
    .map(([k, v]) => [k, v.url, v.audioId] as const);

  const order = [
    'instrumentalUrl',
    'vocalUrl',
    'backingVocalsUrl',
    'drumsUrl',
    'bassUrl',
    'guitarUrl',
    'keyboardUrl',
    'percussionUrl',
    'stringsUrl',
    'synthUrl',
    'fxUrl',
    'brassUrl',
    'woodwindsUrl',
    'originUrl',
  ];
  const rank = (k: string) => {
    const i = order.indexOf(normalizeKey(k));
    return i >= 0 ? i : 999;
  };

  return entries
    .map(([k, url, audioId]) => ({ key: normalizeKey(k), label: labelForKey(k), url, audioId: audioId || undefined }))
    .sort((a, b) => rank(a.key) - rank(b.key) || a.label.localeCompare(b.label));
}

function SongOptionsSheet({
  song,
  onClose,
  isDeleted,
  coverSrc,
  onCoverError,
  onPlay,
  onElenco,
  onStartCover,
  onToast,
  onOpenLists,
  onOpenVideos,
  onMoveToFolder,
  onShare,
  onRestore,
  onDelete,
  onPurge,
  onRefreshSongs,
}: {
  song: SongItem;
  onClose: () => void;
  isDeleted: boolean;
  coverSrc: string;
  onCoverError?: () => void;
  onPlay: () => void;
  onElenco?: () => void;
  onStartCover?: () => void;
  onToast?: (message: string) => void;
  onOpenLists?: () => void;
  onOpenVideos?: () => void;
  onMoveToFolder?: () => void;
  onShare?: () => void;
  onRestore: () => void;
  onDelete: () => void;
  onPurge: () => void;
  onRefreshSongs?: () => void;
}) {
  const [isBusy, setIsBusy] = useState(false);
  const [published, setPublished] = useState(Boolean((song as any)?.isPublic));
  const [showPublish, setShowPublish] = useState(false);
  const [publishGenre, setPublishGenre] = useState<string>(((song as any)?.publicGenre || '').toString());
  const [isLiked, setIsLiked] = useState(false);
  const [showPersonaSave, setShowPersonaSave] = useState(false);
  const [showLyrics, setShowLyrics] = useState(false);
  const [lyricsText, setLyricsText] = useState<string>(((song as any)?.lyrics || '').toString());
  const [lyricsBusy, setLyricsBusy] = useState(false);
  const [showEditTitle, setShowEditTitle] = useState(false);
  const [titleText, setTitleText] = useState<string>(((song as any)?.title || '').toString());
  const [titleBusy, setTitleBusy] = useState(false);
  const [showStems, setShowStems] = useState(false);
  const [showMp4, setShowMp4] = useState(false);
  const [mp4Author, setMp4Author] = useState('');
  const [mp4WatermarkDisabled, setMp4WatermarkDisabled] = useState(false);
  const [showLicense, setShowLicense] = useState(false);
  const [showLicenseBlocked, setShowLicenseBlocked] = useState(false);
  const [licenseLegalName, setLicenseLegalName] = useState('');
  const [licenseContactEmail, setLicenseContactEmail] = useState('');
  const [licenseAccountEmail, setLicenseAccountEmail] = useState('');
  const [isLicenseBusy, setIsLicenseBusy] = useState(false);
  const [licensePdfUrl, setLicensePdfUrl] = useState('');
  const [licensePdfName, setLicensePdfName] = useState('');
  const [licensePdfError, setLicensePdfError] = useState('');
  const [stemsItems, setStemsItems] = useState<Array<{ key: string; label: string; url: string; audioId?: string }>>([]);
  const [stemsMeta, setStemsMeta] = useState<{ taskId: string; type: 'separate_vocal' | 'split_stem' } | null>(null);
  const [personaName, setPersonaName] = useState('');
  const [personaVocalStart, setPersonaVocalStart] = useState(0);
  const [personaVocalEnd, setPersonaVocalEnd] = useState(30);
  const [personaPhoto, setPersonaPhoto] = useState<File | null>(null);
  const coverPhotoInputRef = useRef<HTMLInputElement | null>(null);
  const isMureka = String(song.provider || '').toLowerCase() === 'mureka';
  const [showCoverUrl, setShowCoverUrl] = useState(false);
  const [coverUrlInput, setCoverUrlInput] = useState('');
  const [showTrim, setShowTrim] = useState(false);
  const [trimStartSec, setTrimStartSec] = useState(0);
  const [trimEndSec, setTrimEndSec] = useState(0);
  const [trimDurationSec, setTrimDurationSec] = useState(0);
  const [trimBusy, setTrimBusy] = useState(false);
  const [trimError, setTrimError] = useState('');
  const [trimIsPlaying, setTrimIsPlaying] = useState(false);
  const trimAudioRef = useRef<HTMLAudioElement | null>(null);
  const trimWrapRef = useRef<HTMLDivElement | null>(null);
  const trimCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [trimWaveSize, setTrimWaveSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [trimPeaks, setTrimPeaks] = useState<number[]>([]);
  const [trimPeaksBusy, setTrimPeaksBusy] = useState(false);
  const [trimPeaksError, setTrimPeaksError] = useState('');
  const [trimDrag, setTrimDrag] = useState<'start' | 'end' | null>(null);
  const trimDragRef = useRef<'start' | 'end' | null>(null);
  const trimPointerIdRef = useRef<number | null>(null);
  const trimRootRef = useRef<HTMLDivElement | null>(null);
  const trimDragOffsetSecRef = useRef<number>(0);
  const trimAudioUrl = (() => {
    const id = (song?.id || '').toString().trim();
    const raw = (song?.audioUrl || '').toString().trim();
    return raw || (id ? `/api/share/song/audio?id=${encodeURIComponent(id)}` : '');
  })();
  const [showVoiceClone, setShowVoiceClone] = useState(false);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>('');
  const [voiceCloneProgress, setVoiceCloneProgress] = useState<string>('');
  const [downloadsAllowed, setDownloadsAllowed] = useState<boolean | null>(null);

  const toastDownloadSoon = () => {
    try {
      onToast?.(DOWNLOAD_SOON_TOAST);
    } catch {}
  };

  useEffect(() => {
    if (!showVoiceClone) setVoiceCloneProgress('');
  }, [showVoiceClone]);

  useEffect(() => {
    setPublished(Boolean((song as any)?.isPublic));
    setPublishGenre(((song as any)?.publicGenre || '').toString());
    setShowPublish(false);
    setShowEditTitle(false);
    setTitleText(((song as any)?.title || '').toString());
  }, [song?.id]);

  useEffect(() => {
    setIsLiked(false);
    let alive = true;
    (async () => {
      if (isDeleted) return;
      const sid = (song?.id || '').toString().trim();
      if (!sid) return;
      const t = await getAccessToken();
      if (!t.ok) return;
      const r = await fetch('/api/likes/likes', { headers: { authorization: `Bearer ${t.token}` } });
      const out = await r.json().catch(() => ({}));
      if (!r.ok || out?.ok === false) return;
      const items = Array.isArray(out?.items) ? out.items : [];
      const liked = items.some((x: any) => String(x?.songId || x?.song_id || '').trim() === sid);
      if (!alive) return;
      setIsLiked(liked);
    })().catch(() => {});
    return () => {
      alive = false;
    };
  }, [song?.id, isDeleted]);

  useEffect(() => {
    let alive = true;
    setDownloadsAllowed(null);
    (async () => {
      const t = await getAccessToken();
      if (!t.ok) return;
      const r = await fetch('/api/account/balance', {
        headers: { authorization: `Bearer ${t.token}` },
      });
      const out = await r.json().catch(() => ({}));
      if (!r.ok) return;
      if (!alive) return;
      setDownloadsAllowed(Boolean(out?.downloads_allowed));
    })().catch(() => {});
    return () => {
      alive = false;
    };
  }, [song?.id]);

  useEffect(() => {
    setLyricsText(((song as any)?.lyrics || '').toString());
  }, [song?.id, (song as any)?.lyrics]);

  const saveLyrics = async () => {
    if (lyricsBusy) return;
    const id = String((song as any)?.id || '').trim();
    const text = String(lyricsText || '').trim();
    if (!id) return;
    if (!text) {
      alert('Escribe la letra antes de guardar.');
      return;
    }
    setLyricsBusy(true);
    try {
      const t = await getAccessToken();
      if (!t.ok) {
        alert(t.error || 'No se pudo iniciar sesión.');
        return;
      }
      const r = await fetch('/api/library/update-lyrics', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${t.token}` },
        body: JSON.stringify({ id, lyrics: text }),
      });
      const out = await r.json().catch(() => ({}));
      if (!r.ok || out?.ok === false) {
        alert((out?.error || out?.detail || 'No pude guardar la letra.').toString());
        return;
      }
      onRefreshSongs?.();
      alert('Listo. Letra guardada.');
    } finally {
      setLyricsBusy(false);
    }
  };

  const saveTitle = async () => {
    if (titleBusy) return;
    if (isDeleted) return;
    const id = String((song as any)?.id || '').trim();
    const text = String(titleText || '').trim().slice(0, 100);
    if (!id) return;
    if (!text) {
      alert('Escribe el nombre antes de guardar.');
      return;
    }
    setTitleBusy(true);
    try {
      const t = await getAccessToken();
      if (!t.ok) {
        alert(t.error || 'No se pudo iniciar sesión.');
        return;
      }
      const r = await fetch('/api/library/update-title', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${t.token}` },
        body: JSON.stringify({ id, title: text }),
      });
      const out = await r.json().catch(() => ({}));
      if (!r.ok || out?.ok === false) {
        alert((out?.error || out?.detail || 'No pude guardar el nombre.').toString());
        return;
      }
      onRefreshSongs?.();
      setShowEditTitle(false);
      onClose();
      alert('Listo. Nombre guardado.');
    } finally {
      setTitleBusy(false);
    }
  };
  useEffect(() => {
    if (!showPersonaSave) return;
    setPersonaVocalStart(0);
    setPersonaVocalEnd(30);
  }, [showPersonaSave]);
  useEffect(() => {
    if (!showMp4) return;
    setMp4Author('');
  }, [showMp4]);
  useEffect(() => {
    if (!showCoverUrl) return;
    setCoverUrlInput('');
  }, [showCoverUrl]);
  useEffect(() => {
    if (!showTrim) return;
    setTrimError('');
    setTrimBusy(false);
    setTrimIsPlaying(false);
    setTrimPeaks([]);
    setTrimPeaksBusy(false);
    setTrimPeaksError('');
    setTrimDrag(null);
    trimDragRef.current = null;
    trimPointerIdRef.current = null;
            trimDragOffsetSecRef.current = 0;
    setTrimStartSec(0);
    setTrimEndSec(0);
    setTrimDurationSec(0);
    const a = trimAudioRef.current;
    if (a) {
      try {
        a.pause();
        a.currentTime = 0;
      } catch {}
    }
  }, [showTrim, song?.id]);
  useEffect(() => {
    if (!showTrim) return;
    const el = trimWrapRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      const w = Math.max(0, Math.floor(r.width));
      const h = Math.max(0, Math.floor(r.height));
      setTrimWaveSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
    };
    let ro: ResizeObserver | null = null;
    if (typeof (window as any).ResizeObserver === 'function') {
      ro = new ResizeObserver(() => update());
      ro.observe(el);
    } else {
      window.addEventListener('resize', update);
    }
    const r = el.getBoundingClientRect();
    setTrimWaveSize({ w: Math.max(0, Math.floor(r.width)), h: Math.max(0, Math.floor(r.height)) });
    return () => {
      try {
        if (ro) ro.disconnect();
      } catch {}
      try {
        window.removeEventListener('resize', update);
      } catch {}
    };
  }, [showTrim]);
  useEffect(() => {
    if (!showTrim) return;
    const a = trimAudioRef.current;
    if (!a) return;
    const onMeta = () => {
      const d = Number(a.duration);
      if (!Number.isFinite(d) || d <= 0) return;
      setTrimDurationSec(d);
      setTrimStartSec(0);
      setTrimEndSec((prev) => {
        const next = Math.min(d, Math.max(5, Math.min(30, d)));
        if (Number.isFinite(prev) && prev > 0) return Math.min(d, Math.max(0, prev));
        return next;
      });
    };
    a.addEventListener('loadedmetadata', onMeta);
    a.addEventListener('durationchange', onMeta);
    return () => {
      a.removeEventListener('loadedmetadata', onMeta);
      a.removeEventListener('durationchange', onMeta);
    };
  }, [showTrim, trimAudioUrl]);
  useEffect(() => {
    if (!showTrim) return;
    const a = trimAudioRef.current;
    if (!a) return;
    const onTime = () => {
      const end = Number(trimEndSec || 0);
      if (!Number.isFinite(end) || end <= 0) return;
      if (a.currentTime >= Math.max(0, end - 0.05)) {
        try {
          a.pause();
        } catch {}
      }
    };
    const onPause = () => setTrimIsPlaying(false);
    const onPlay = () => setTrimIsPlaying(true);
    a.addEventListener('timeupdate', onTime);
    a.addEventListener('pause', onPause);
    a.addEventListener('ended', onPause);
    a.addEventListener('play', onPlay);
    return () => {
      a.removeEventListener('timeupdate', onTime);
      a.removeEventListener('pause', onPause);
      a.removeEventListener('ended', onPause);
      a.removeEventListener('play', onPlay);
    };
  }, [showTrim, trimEndSec]);
  useEffect(() => {
    if (!showTrim) return;
    const w = Number(trimWaveSize.w || 0);
    const h = Number(trimWaveSize.h || 0);
    const peaks = Array.isArray(trimPeaks) ? trimPeaks : [];
    const canvas = trimCanvasRef.current;
    if (!canvas || w <= 0 || h <= 0 || peaks.length === 0) return;
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#0b2f4f';
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = '#21f6a6';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const mid = h / 2;
    const n = peaks.length;
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * w;
      const amp = Math.max(0, Math.min(1, Number(peaks[i] || 0)));
      const y = amp * (h * 0.38);
      ctx.moveTo(x, mid - y);
      ctx.lineTo(x, mid + y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }, [showTrim, trimPeaks, trimWaveSize.w, trimWaveSize.h]);
  useEffect(() => {
    if (!showTrim) return;
    const url = (trimAudioUrl || '').toString().trim();
    const dur = Number(trimDurationSec || 0);
    const w = Number(trimWaveSize.w || 0);
    if (!url || !(dur > 0) || !(w > 0)) return;
    let alive = true;
    const ac = new AbortController();
    const maxBars = Math.max(160, Math.min(560, w));
    setTrimPeaksBusy(true);
    setTrimPeaksError('');
    setTrimPeaks([]);
    (async () => {
      const res = await fetch(url, { signal: ac.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = await res.arrayBuffer();
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      try {
        const decoded = await ctx.decodeAudioData(buf.slice(0));
        const data = decoded.getChannelData(0);
        const len = data.length;
        const step = Math.max(1, Math.floor(len / maxBars));
        const peaks: number[] = [];
        for (let i = 0; i < maxBars; i++) {
          const start = i * step;
          const end = Math.min(len, start + step);
          let m = 0;
          for (let j = start; j < end; j++) {
            const v = Math.abs(data[j] ?? 0);
            if (v > m) m = v;
          }
          peaks.push(m);
        }
        const max = peaks.reduce((a, b) => (b > a ? b : a), 0.00001);
        const norm = peaks.map((p) => Math.max(0, Math.min(1, p / max)));
        if (!alive) return;
        setTrimPeaks(norm);
      } finally {
        try {
          await ctx.close();
        } catch {}
      }
    })()
      .catch((e: any) => {
        if (!alive) return;
        const msg = e instanceof Error ? e.message : 'No pude cargar el audio para ver la onda.';
        setTrimPeaksError(msg);
      })
      .finally(() => {
        if (!alive) return;
        setTrimPeaksBusy(false);
      });
    return () => {
      alive = false;
      try {
        ac.abort();
      } catch {}
    };
  }, [showTrim, trimAudioUrl, trimDurationSec, trimWaveSize.w]);
  useEffect(() => {
    if (!showLicense) return;
    if (licensePdfUrl) URL.revokeObjectURL(licensePdfUrl);
    setLicensePdfUrl('');
    setLicensePdfName('');
    setLicensePdfError('');
    if (!supabaseBrowser) return;
    supabaseBrowser.auth
      .getUser()
      .then(({ data }) => {
        const user = data?.user;
        const email = (user?.email || '').toString().trim();
        const meta: any = user?.user_metadata || {};
        const name = (meta?.full_name || meta?.name || meta?.legal_name || '').toString().trim();
        setLicenseAccountEmail(email);
        setLicenseContactEmail((prev) => (prev ? prev : email));
        setLicenseLegalName((prev) => (prev ? prev : name));
      })
      .catch(() => {});
  }, [showLicense]);
  const fmt = (iso?: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: '2-digit' });
  };

  const fmtLong = (d: Date) => {
    try {
      return d.toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: '2-digit' });
    } catch {
      return d.toISOString().slice(0, 10);
    }
  };

  const canShowWav = (() => {
    if (isDeleted) return false;
    return true;
  })();

  const sanitizeFileName = (s: string) => (s || '').toString().replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 80);
  const closeLicenseModal = () => {
    if (licensePdfUrl) URL.revokeObjectURL(licensePdfUrl);
    setLicensePdfUrl('');
    setLicensePdfName('');
    setLicensePdfError('');
    setShowLicense(false);
  };

  const ensureCommercialPlanOrWarn = async () => {
    setIsBusy(true);
    try {
      const t = await getAccessToken();
      if (!t.ok) {
        alert(t.error || 'No se pudo iniciar sesión.');
        return false;
      }
      const r = await fetch('/api/account/balance', {
        method: 'GET',
        headers: { authorization: `Bearer ${t.token}` },
      });
      const out = await r.json().catch(() => ({}));
      if (!r.ok) {
        alert(out?.error || 'No pude verificar tu plan.');
        return false;
      }
      const isAdmin = Boolean(out?.is_admin);
      const planKey = String(out?.plan_key || '').toLowerCase();
      const ok = isAdmin || planKey === 'inicio' || planKey === 'productor';
      if (!ok) {
        setShowLicenseBlocked(true);
        return false;
      }
      return true;
    } finally {
      setIsBusy(false);
    }
  };

  const generateCommercialLicensePdf = async () => {
    const name = licenseLegalName.trim();
    const contactEmail = licenseContactEmail.trim();
    const accountEmail = (licenseAccountEmail || '').trim();
    if (!name) {
      alert('Pon tu Nombre Legal Completo.');
      return;
    }
    if (!contactEmail) {
      alert('Pon tu Correo Electrónico de Contacto.');
      return;
    }
    setIsLicenseBusy(true);
    try {
      setLicensePdfError('');
      if (licensePdfUrl) URL.revokeObjectURL(licensePdfUrl);
      setLicensePdfUrl('');
      setLicensePdfName('');

      const now = new Date();
      const dateStr = fmtLong(now);
      const songTitle = (song.title || 'Canción').toString().trim();
      const songId = (song.id || '').toString().trim();

      const doc = new jsPDF({ unit: 'pt', format: 'a4' });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const margin = 44;
      const boxW = pageW - margin * 2;
      let y = 64;

      const accent = { r: 18, g: 74, b: 160 };
      const ink = { r: 0, g: 0, b: 0 };
      const muted = { r: 55, g: 55, b: 55 };
      const border = { r: 205, g: 205, b: 205 };

      doc.setTextColor(accent.r, accent.g, accent.b);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.text('LucIAna', margin + 14, margin + 32);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(muted.r, muted.g, muted.b);
      doc.text('Commercial License Certificate', margin + 14, margin + 48);

      y = margin + 84;
      doc.setTextColor(accent.r, accent.g, accent.b);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13.5);
      doc.text('CERTIFICADO DE LICENCIA COMERCIAL - LUCIANA IA', margin + 14, y);

      y += 12;
      doc.setDrawColor(border.r, border.g, border.b);
      doc.setLineWidth(0.8);
      doc.line(margin + 14, y, margin + 14 + boxW - 28, y);

      y += 20;
      const kv = (label: string, value: string) => {
        doc.setTextColor(muted.r, muted.g, muted.b);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.text(label, margin + 14, y);
        doc.setTextColor(ink.r, ink.g, ink.b);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(11);
        const lines = doc.splitTextToSize(value || '—', boxW - 28);
        doc.text(lines, margin + 170, y);
        y += 16 + (lines.length - 1) * 12;
      };

      kv('Nombre Legal:', name);
      kv('Email contacto:', contactEmail);
      kv('Cuenta usuario:', accountEmail || contactEmail);
      kv('Título canción:', songTitle);
      kv('ID único obra:', songId || '—');
      kv('Fecha emisión:', dateStr);

      y += 6;
      const paragraphs = [
        'I. CONCESIÓN DE LICENCIA',
        'LucIAna, en su calidad de Licenciante, otorga al Licenciatario arriba mencionado una licencia comercial mundial, perpetua, no exclusiva e intransferible para utilizar el Contenido Generado (Audio) descrito en este documento. Esta licencia permite la reproducción, distribución, streaming, sincronización y monetización de la obra en todas las plataformas digitales y medios físicos.',
        'II. PROPIEDAD Y DERECHOS DE AUTOR',
        'Letras: El Licenciatario conserva el 100% de la propiedad y los derechos de autor de cualquier letra original proporcionada para la creación de la obra.',
        'Composición de Audio: La composición musical y el archivo de audio generado se otorgan bajo licencia comercial ilimitada, respaldada por la suscripción profesional de LucIAna ante sus plataformas tecnológicas (Suno AI).',
        'III. VALIDEZ Y PERMANENCIA',
        'Esta licencia es legalmente vinculante siempre que el Licenciatario haya mantenido una suscripción activa (Plan Creador, Pro o similar) en la plataforma LucIAna al momento de la creación de la obra. Los derechos comerciales aquí otorgados son permanentes y no expiran aunque el usuario decida cancelar su suscripción en el futuro.',
        'IV. LIMITACIONES',
        'El Licenciatario reconoce que el contenido es generado por Inteligencia Artificial y que LucIAna no garantiza la exclusividad absoluta de las secuencias melódicas ante registros de propiedad intelectual de terceros, aunque se otorga el derecho de uso comercial total sobre el archivo específico generado.',
        'V. FIRMA DIGITAL',
        'Este documento ha sido generado electrónicamente y es válido sin firma manuscrita. Los registros de esta transacción y la validez de la membresía están archivados en los sistemas digitales de LucIAna.',
      ];

      const writePara = (text: string, bold?: boolean) => {
        const isHeading = Boolean(bold);
        doc.setFont('helvetica', isHeading ? 'bold' : 'normal');
        doc.setFontSize(isHeading ? 11.5 : 10.5);
        doc.setTextColor(isHeading ? ink.r : ink.r, isHeading ? ink.g : ink.g, isHeading ? ink.b : ink.b);
        if (isHeading) doc.setTextColor(accent.r, accent.g, accent.b);
        const lines = doc.splitTextToSize(text, boxW - 28);
        for (const line of lines) {
          if (y > pageH - margin - 70) {
            doc.addPage();
            y = margin + 40;
          }
          doc.text(line, margin + 14, y);
          y += isHeading ? 14 : 13;
        }
        y += 6;
      };

      for (const p of paragraphs) {
        const isHeading = /^[IVX]+\.\s/.test(p);
        writePara(p, isHeading);
      }

      if (y > pageH - margin - 170) {
        doc.addPage();
        y = margin + 54;
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(accent.r, accent.g, accent.b);
      doc.text('VII. Firma y Aceptación', margin + 14, y);
      y += 14;
      doc.setDrawColor(border.r, border.g, border.b);
      doc.setLineWidth(0.8);
      doc.line(margin + 14, y, margin + 14 + boxW - 28, y);
      y += 16;

      const tableX = margin + 14;
      const tableW = boxW - 28;
      const rowH = 100;
      doc.setDrawColor(border.r, border.g, border.b);
      doc.setLineWidth(1);
      doc.rect(tableX, y, tableW, rowH);
      const padX = tableX + 12;
      const topY = y + 18;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(ink.r, ink.g, ink.b);
      doc.text('Firma del dueño de la canción (Licenciatario):', padX, topY);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(muted.r, muted.g, muted.b);
      doc.text(`Nombre: ${name}`, padX, topY + 14);

      const signLineY = y + rowH - 28;
      doc.setDrawColor(border.r, border.g, border.b);
      doc.setLineWidth(0.9);
      doc.line(padX, signLineY, tableX + tableW - 12, signLineY);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(muted.r, muted.g, muted.b);
      doc.text('Documento generado electrónicamente por LucIAna', margin + 14, y + rowH + 18);
      doc.text(`Fecha de emisión: ${dateStr}`, margin + 14, y + rowH + 32);

      const file = `Licencia_LucIAna_${sanitizeFileName(songTitle) || 'Cancion'}.pdf`;
      const blob = doc.output('blob');
      const url = URL.createObjectURL(blob);
      setLicensePdfName(file);
      setLicensePdfUrl(url);
    } catch (e: any) {
      const msg = 'No se pudo generar el PDF. Intenta de nuevo.';
      setLicensePdfError(msg);
      try {
        console.error(e);
      } catch {
      }
      alert(msg);
    } finally {
      setIsLicenseBusy(false);
    }
  };

  const share = async () => {
    onShare?.();
  };

  const toggleLike = async () => {
    if (isDeleted) return;
    const sid = (song?.id || '').toString().trim();
    if (!sid) return;
    setIsBusy(true);
    try {
      const t = await getAccessToken();
      if (!t.ok) {
        alert(t.error || 'No se pudo iniciar sesión.');
        return;
      }
      const next = !isLiked;
      const r = await fetch('/api/likes/like', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${t.token}` },
        body: JSON.stringify({ songId: sid, like: next }),
      });
      const out = await r.json().catch(() => ({}));
      if (!r.ok || out?.ok === false) {
        const msg = (out?.error || out?.detail || 'No pude actualizar el like.').toString();
        alert(msg);
        return;
      }
      setIsLiked(next);
      if (next) {
        alert('¡Canción marcada como favorita!');
      } else {
        alert('Like removido.');
      }
    } catch (e: any) {
      alert('Error inesperado: ' + (e?.message || String(e)));
    } finally {
      setIsBusy(false);
    }
  };

  const setSongPublic = async (makePublic: boolean, genre: string) => {
    if (isDeleted) return;
    setIsBusy(true);
    try {
      const t = await getAccessToken();
      if (!t.ok) {
        alert(t.error || 'No se pudo iniciar sesión.');
        return;
      }
      const g = (genre || '').toString().trim();
      if (makePublic && !g) {
        alert('Escribe el género musical primero.');
        return;
      }
      const r = await fetch('/api/social/publish', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${t.token}` },
        body: JSON.stringify({ songId: song.id, publish: makePublic, genre: g }),
      });
      const out = await r.json().catch(() => ({}));
      if (!r.ok || out?.ok === false) {
        const msg = (out?.error || out?.detail || out?.message || 'No pude cambiar la visibilidad.').toString();
        const hint = (out?.hint || '').toString();
        alert([msg, hint].filter(Boolean).join('\n\n'));
        return;
      }
      const next = Boolean(out?.is_public);
      setPublished(next);
      if (next && typeof out?.public_genre === 'string') setPublishGenre(out.public_genre);
      onRefreshSongs?.();
      alert(next ? 'Listo. Tu canción ya es pública.' : 'Listo. Tu canción ya es privada.');
    } finally {
      setIsBusy(false);
    }
  };

  const sanitizeDownloadName = (s: string) =>
    (s || '')
      .toString()
      .replace(/[\\/:*?"<>|]+/g, '_')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120);

  const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
  const fmtClock = (sec: number) => {
    const s = Math.max(0, Math.floor(Number.isFinite(sec) ? sec : 0));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${String(r).padStart(2, '0')}`;
  };
  const fmtClockTenths = (sec: number) => {
    const x = Math.max(0, Number.isFinite(sec) ? sec : 0);
    const s = Math.floor(x);
    const m = Math.floor(s / 60);
    const r = s % 60;
    const t = Math.floor((x - s) * 10 + 1e-6);
    return `${m}:${String(r).padStart(2, '0')}.${t}`;
  };

  const downloadBlobToDevice = async (blob: Blob, filename: string) => {
    try {
      toastDownloadSoon();
      const obj = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = obj;
      a.download = sanitizeDownloadName(filename) || 'audio';
      try { document.body.appendChild(a); } catch {}
      a.click();
      try { if (a.parentNode) a.parentNode.removeChild(a); } catch {}
      URL.revokeObjectURL(obj);
      return true;
    } catch {
      return false;
    }
  };

  const encodeWav = (audioBuffer: AudioBuffer) => {
    const numChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const numSamples = audioBuffer.length;
    const bytesPerSample = 2;
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = numSamples * blockAlign;
    const buf = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buf);
    const writeStr = (offset: number, s: string) => {
      for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
    };
    writeStr(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, 16, true);
    writeStr(36, 'data');
    view.setUint32(40, dataSize, true);
    let offset = 44;
    for (let i = 0; i < numSamples; i++) {
      for (let ch = 0; ch < numChannels; ch++) {
        const data = audioBuffer.getChannelData(ch);
        let s = data[i] ?? 0;
        s = Math.max(-1, Math.min(1, s));
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
        offset += 2;
      }
    }
    return buf;
  };

  const downloadToDevice = async (url: string, filename: string) => {
    try {
      toastDownloadSoon();
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = await res.arrayBuffer();
      const blob = new Blob([buf], { type: res.headers.get('content-type') || 'application/octet-stream' });
      const obj = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = obj;
      a.download = sanitizeDownloadName(filename) || 'audio';
      try { document.body.appendChild(a); } catch {}
      a.click();
      try { if (a.parentNode) a.parentNode.removeChild(a); } catch {}
      URL.revokeObjectURL(obj);
      return true;
    } catch (error) {
      try {
        const a = document.createElement('a');
        a.href = url;
        a.target = '_self';
        a.rel = 'noreferrer';
        a.download = sanitizeDownloadName(filename) || 'audio';
        try { document.body.appendChild(a); } catch {}
        a.click();
        try { if (a.parentNode) a.parentNode.removeChild(a); } catch {}
        return true;
      } catch {
        return false;
      }
    }
  };

  const makeTrimWavBlob = async () => {
    const url = (trimAudioUrl || '').toString().trim();
    if (!url) throw new Error('No hay audio para recortar.');
    const start = clamp(Number(trimStartSec || 0), 0, Number.isFinite(trimDurationSec) && trimDurationSec > 0 ? trimDurationSec : 1e9);
    const end = clamp(Number(trimEndSec || 0), 0, Number.isFinite(trimDurationSec) && trimDurationSec > 0 ? trimDurationSec : 1e9);
    if (!(end > start)) throw new Error('El final debe ser mayor que el inicio.');
    const res = await fetch(url);
    if (!res.ok) throw new Error(`No pude descargar el audio (HTTP ${res.status}).`);
    const buf = await res.arrayBuffer();
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    try {
      const decoded = await ctx.decodeAudioData(buf.slice(0));
      const sr = decoded.sampleRate;
      const s0 = clamp(start, 0, decoded.duration);
      const s1 = clamp(end, 0, decoded.duration);
      const startFrame = Math.floor(s0 * sr);
      const endFrame = Math.floor(s1 * sr);
      const frames = Math.max(1, endFrame - startFrame);
      const out = ctx.createBuffer(decoded.numberOfChannels, frames, sr);
      for (let ch = 0; ch < decoded.numberOfChannels; ch++) {
        const src = decoded.getChannelData(ch);
        const dst = out.getChannelData(ch);
        dst.set(src.subarray(startFrame, startFrame + frames));
      }
      const wav = encodeWav(out);
      return new Blob([wav], { type: 'audio/wav' });
    } finally {
      try {
        await ctx.close();
      } catch {}
    }
  };

  const downloadTrim = async () => {
    if (isDeleted) return;
    setTrimBusy(true);
    setTrimError('');
    try {
      const base = sanitizeDownloadName(song.title || 'Cancion') || 'Cancion';
      const blob = await makeTrimWavBlob();
      await downloadBlobToDevice(blob, `${base}_recorte_${fmtClock(trimStartSec)}-${fmtClock(trimEndSec)}.wav`);
    } catch (e: any) {
      const msg = e instanceof Error ? e.message : 'No se pudo recortar.';
      setTrimError(msg);
      alert(msg);
    } finally {
      setTrimBusy(false);
    }
  };

  const shareTrim = async () => {
    if (isDeleted) return;
    setTrimBusy(true);
    setTrimError('');
    try {
      const base = sanitizeDownloadName(song.title || 'Cancion') || 'Cancion';
      const blob = await makeTrimWavBlob();
      const fileName = `${base}_recorte_${fmtClock(trimStartSec)}-${fmtClock(trimEndSec)}.wav`;
      const file = new File([blob], fileName, { type: 'audio/wav' });
      const can =
        typeof (navigator as any).canShare === 'function' ? (navigator as any).canShare({ files: [file] }) : Boolean((navigator as any).share);
      if ((navigator as any).share && can) {
        await (navigator as any).share({
          title: `LucIAna | Music - ${base} (recorte)`,
          files: [file],
        });
        return;
      }
      const ok = await downloadBlobToDevice(blob, fileName);
      if (!ok) alert('Tu dispositivo no permite compartir este archivo. Ya lo dejé listo para descargar.');
    } catch (e: any) {
      const msg = e instanceof Error ? e.message : 'No se pudo compartir el recorte.';
      setTrimError(msg);
      alert(msg);
    } finally {
      setTrimBusy(false);
    }
  };

  const download = async () => {
    setIsBusy(true);
    try {
      const t = await getAccessToken();
      if (!t.ok) {
        alert(t.error || 'No se pudo iniciar sesión.');
        return;
      }
      const r = await fetch('/api/account/balance', {
        headers: { authorization: `Bearer ${t.token}` },
      });
      const out = await r.json().catch(() => ({}));
      if (!r.ok) {
        alert(out?.error || 'No pude verificar tu plan.');
        return;
      }
      if (!out?.downloads_allowed) {
        alert('Puedes escuchar tu canción sin problema y la tendrás guardada en Biblioteca. Para descargarla, necesitas activar un plan.');
        return;
      }

      const externalId = (song.sunoAudioId || '').toString().trim();
      if (/^rvc_/i.test(externalId)) {
        const cr = await fetch('/api/library/charge-download', {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${t.token}` },
          body: JSON.stringify({ id: song.id }),
        });
        const cout = await cr.json().catch(() => ({}));
        if (!cr.ok || cout?.ok === false) {
          alert(cout?.error || 'No pude cobrar créditos para esta descarga.');
          return;
        }
      }

      const url = (song.audioUrl || '').toString();
      if (!url) {
        alert('No hay audio para descargar.');
        return;
      }
      const base = sanitizeDownloadName(song.title || 'Cancion') || 'Cancion';
      const wantsProxy = (() => {
        if (!song?.id) return false;
        const u = (url || '').toString().trim();
        if (!u) return false;
        return !/^https?:\/\//i.test(u);
      })();
      const filename = `${base}.mp3`;
      const dlUrl = wantsProxy
        ? `/api/share/song/audio?id=${encodeURIComponent(String(song.id))}&dl=1&filename=${encodeURIComponent(filename)}&t=${Date.now()}`
        : url;
      await downloadToDevice(dlUrl, filename);
    } finally {
      setIsBusy(false);
    }
  };

  const downloadWav = async () => {
    setIsBusy(true);
    try {
      const t = await getAccessToken();
      if (!t.ok) {
        alert(t.error || 'No se pudo iniciar sesión.');
        return;
      }
      const r = await fetch('/api/account/balance', {
        headers: { authorization: `Bearer ${t.token}` },
      });
      const out = await r.json().catch(() => ({}));
      if (!r.ok) {
        alert(out?.error || 'No pude verificar tu plan.');
        return;
      }
      if (!out?.downloads_allowed) {
        alert('Puedes escuchar tu canción sin problema y la tendrás guardada en Biblioteca. Para descargar WAV, necesitas activar un plan.');
        return;
      }

      const externalId = (song.sunoAudioId || '').toString().trim();
      if (/^rvc_/i.test(externalId)) {
        const cr = await fetch('/api/library/charge-download', {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${t.token}` },
          body: JSON.stringify({ id: song.id }),
        });
        const cout = await cr.json().catch(() => ({}));
        if (!cr.ok || cout?.ok === false) {
          alert(cout?.error || 'No pude cobrar créditos para esta descarga.');
          return;
        }
      }
      const baseTaskId = (song.sunoTaskId || '').toString().trim();
      let baseAudioId = (song.sunoAudioId || '').toString().trim();
      const looksLikeUuid = (s: string) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test((s || '').trim());
      const resolveAudioIdFromTask = async (taskId: string) => {
        const tr = await fetch(`/api/suno/task?kind=generate&taskId=${encodeURIComponent(taskId)}`, {
          headers: { authorization: `Bearer ${t.token}` },
        });
        const tout = await tr.json().catch(() => ({}));
        if (!tr.ok) return '';
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
          .filter((x) => x.audioUrl && looksLikeUuid(x.audioId));
        if (tracks.length === 0) return '';
        const direct = (song.audioUrl || '').toString().trim();
        if (direct) {
          const match = tracks.find((x) => x.audioUrl === direct);
          if (match?.audioId) return match.audioId;
        }
        const wantsB = /\sB$/i.test((song.title || '').toString().trim());
        const chosen = wantsB && tracks.length > 1 ? tracks[1] : tracks[0];
        return chosen?.audioId || '';
      };

      if (!baseTaskId) {
        alert('Esta canción no tiene taskId para convertir a WAV.');
        return;
      }
      if (!looksLikeUuid(baseAudioId)) {
        const resolved = await resolveAudioIdFromTask(baseTaskId);
        baseAudioId = resolved;
      }
      if (!looksLikeUuid(baseAudioId)) {
        const a = (song.sunoAudioId || '').toString().trim();
        const derivedHint =
          a.startsWith('stem_') || /\s-\s(voz|instrumental)/i.test((song.title || '').toString())
            ? 'Parece que esta es una pista derivada (Voz/Instrumental). Abre la canción original y ahí sí podrás descargar WAV.'
            : 'WAV solo está disponible para canciones generadas dentro de LucIAna.';
        alert(`Este audio no se puede convertir a WAV aquí.\n\n${derivedHint}`);
        return;
      }

      const start = await fetch('/api/suno/wav', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${t.token}` },
        body: JSON.stringify({ taskId: baseTaskId, audioId: baseAudioId }),
      });
      const startedOut = await start.json().catch(() => ({}));
      if (!start.ok) {
        const msg = (startedOut?.detail || startedOut?.error || 'No pude iniciar la conversión a WAV.').toString();
        if (msg.toLowerCase().includes('record does not exist')) {
          alert('Este audio no se puede convertir a WAV (no encontramos el registro de la canción). Prueba con una canción generada dentro de LucIAna o una canción más reciente.');
        } else {
          alert(msg);
        }
        return;
      }
      const wavTaskId = String(startedOut?.taskId || '').trim();
      if (!wavTaskId) {
        alert('No recibí taskId de conversión WAV.');
        return;
      }
      const startedAt = Date.now();
      while (Date.now() - startedAt < 180_000) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        const tr = await fetch(`/api/suno/task?kind=wav&taskId=${encodeURIComponent(wavTaskId)}`, {
          headers: { authorization: `Bearer ${t.token}` },
        });
        const tout = await tr.json().catch(() => ({}));
        if (!tr.ok) continue;

        const provider = tout?.data;
        const rawStatus =
          provider?.data?.status ??
          provider?.data?.successFlag ??
          provider?.data?.data?.status ??
          provider?.data?.data?.successFlag ??
          '';
        const numericStatus = typeof rawStatus === 'number' ? rawStatus : Number(String(rawStatus || '').trim());
        const status =
          numericStatus === 0
            ? 'PENDING'
            : numericStatus === 1
              ? 'SUCCESS'
              : numericStatus === 2
                ? 'CREATE_TASK_FAILED'
                : numericStatus === 3
                  ? 'GENERATE_WAV_FAILED'
                  : String(rawStatus || '').toUpperCase();

        if (
          status === 'FAILED' ||
          status === 'CREATE_TASK_FAILED' ||
          status === 'GENERATE_WAV_FAILED' ||
          status === 'CALLBACK_EXCEPTION'
        ) {
          alert('No se pudo convertir a WAV.');
          return;
        }
        if (status !== 'SUCCESS') continue;

        const wavUrl = String(
          provider?.data?.response?.audioWavUrl ||
            provider?.data?.data?.response?.audioWavUrl ||
            provider?.data?.response?.audio_wav_url ||
            provider?.data?.data?.response?.audio_wav_url ||
            provider?.data?.data?.audioWavUrl ||
            provider?.data?.data?.audio_wav_url ||
            provider?.data?.audioWavUrl ||
            provider?.data?.audio_wav_url ||
            ''
        ).trim();
        if (!wavUrl) {
          alert('La conversión terminó, pero no recibí el link del WAV.');
          return;
        }
        const base = sanitizeDownloadName(song.title || 'Cancion') || 'Cancion';
        let finalWavUrl = wavUrl;
        try {
          const pr = await fetch(`/api/karaoke/proxy-url?src=${encodeURIComponent(wavUrl)}`, {
            headers: { authorization: `Bearer ${t.token}` },
          });
          const pout = await pr.json().catch(() => ({}));
          const proxyUrl = (pout?.url || '').toString().trim();
          if (pr.ok && proxyUrl) finalWavUrl = proxyUrl;
        } catch {
        }
        const ok = await downloadToDevice(finalWavUrl, `${base}.wav`);
        if (!ok) {
          alert('Encontré el archivo WAV, pero tu navegador no pudo descargarlo automáticamente. Intenta otra vez en unos segundos.');
        }
        return;
      }

      alert('El WAV está tardando. Intenta de nuevo en unos segundos.');
    } finally {
      setIsBusy(false);
    }
  };

  const openMp4Modal = async () => {
    setIsBusy(true);
    try {
      const t = await getAccessToken();
      if (!t.ok) {
        alert(t.error || 'No se pudo iniciar sesión.');
        return;
      }
      const r = await fetch('/api/account/balance', {
        headers: { authorization: `Bearer ${t.token}` },
      });
      const out = await r.json().catch(() => ({}));
      if (!r.ok) {
        alert(out?.error || 'No pude verificar tu plan.');
        return;
      }
      if (!out?.downloads_allowed) {
        alert('Tu plan no incluye esta función.');
        return;
      }
      setMp4WatermarkDisabled(Boolean(out?.mp4_watermark_disabled));
      setShowMp4(true);
    } finally {
      setIsBusy(false);
    }
  };

  const createMp4 = async (authorName: string) => {
    setIsBusy(true);
    try {
      const t = await getAccessToken();
      if (!t.ok) {
        alert(t.error || 'No se pudo iniciar sesión.');
        return;
      }
      const r = await fetch('/api/account/balance', {
        headers: { authorization: `Bearer ${t.token}` },
      });
      const out = await r.json().catch(() => ({}));
      if (!r.ok) {
        alert(out?.error || 'No pude verificar tu plan.');
        return;
      }
      if (!out?.downloads_allowed) {
        alert('Tu plan no incluye esta función.');
        return;
      }
      if (!song.sunoTaskId || !song.sunoAudioId) {
        alert('Esta canción no tiene taskId/audioId para crear video.');
        return;
      }

      const start = await fetch('/api/suno/mp4', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${t.token}` },
        body: JSON.stringify({
          taskId: song.sunoTaskId,
          audioId: song.sunoAudioId,
          author: (authorName || '').toString().trim().slice(0, 50),
        }),
      });
      const startedOut = await start.json().catch(() => ({}));
      if (!start.ok) {
        alert((startedOut?.detail || startedOut?.error || 'No pude iniciar el video.').toString());
        return;
      }
      const mp4TaskId = String(startedOut?.taskId || '').trim();
      if (!mp4TaskId) {
        alert('No recibí taskId del video.');
        return;
      }
      toastDownloadSoon();
      try {
        await navigator.clipboard.writeText(mp4TaskId);
        alert(`Listo. El video se está generando en la pestaña "Video".\n\nTaskId (copiado):\n${mp4TaskId}`);
      } catch {
        alert(`Listo. El video se está generando en la pestaña "Video".\n\nTaskId:\n${mp4TaskId}`);
      }

      onOpenVideos?.();
      setIsBusy(false); // Release UI lock while polling in background

      const startedAt = Date.now();
      while (Date.now() - startedAt < 240_000) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        const tr = await fetch(`/api/suno/task?kind=mp4&taskId=${encodeURIComponent(mp4TaskId)}`, {
          headers: { authorization: `Bearer ${t.token}` },
        });
        const tout = await tr.json().catch(() => ({}));
        if (!tr.ok) continue;

        const provider = tout?.data;
        const status = String(
          provider?.data?.successFlag ||
            provider?.data?.status ||
            provider?.data?.data?.successFlag ||
            provider?.data?.data?.status ||
            ''
        ).toUpperCase();

        if (status === 'FAILED' || status === 'CREATE_TASK_FAILED' || status === 'GENERATE_MP4_FAILED' || status === 'CALLBACK_EXCEPTION') {
          alert('No se pudo generar el video.');
          return;
        }
        if (status !== 'SUCCESS') continue;

        const videoUrl = String(
          provider?.data?.response?.videoUrl ||
            provider?.data?.data?.response?.videoUrl ||
            provider?.data?.response?.video_url ||
            provider?.data?.data?.response?.video_url ||
            ''
        ).trim();

        if (!videoUrl) {
          alert('El video terminó, pero no recibí el link.');
          return;
        }
        window.open(videoUrl, '_blank');
        return;
      }

      alert('El video está tardando, pero se sigue generando en la pestaña "Video".');
    } catch (e) {
      alert('Error: ' + (e instanceof Error ? e.message : 'Desconocido'));
    } finally {
      setIsBusy(false);
    }
  };

  const separateStems = async (type: 'separate_vocal' | 'split_stem') => {
    if (isMureka) {
      const msg = 'Próximamente: separación de instrumentos y voz para canciones creadas con Mureka.';
      try { onToast?.(msg); } catch {}
      alert(msg);
      return;
    }
    setIsBusy(true);
    try {
      const t = await getAccessToken();
      if (!t.ok) {
        alert(t.error || 'No se pudo iniciar sesión.');
        return;
      }
      const r = await fetch('/api/account/balance', {
        headers: { authorization: `Bearer ${t.token}` },
      });
      const out = await r.json().catch(() => ({}));
      if (!r.ok) {
        alert(out?.error || 'No pude verificar tu plan.');
        return;
      }
      if (!out?.downloads_allowed) {
        alert('Tu plan no incluye descargas.');
        return;
      }
      if (!song.sunoTaskId && !song.sunoAudioId) {
        alert('Esta canción no tiene información para separar (taskId/audioId). Si es una canción subida o muy vieja, no se puede separar.');
        return;
      }

      const start = await fetch('/api/suno/separate', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${t.token}` },
        body: JSON.stringify({ taskId: song.sunoTaskId || '', audioId: song.sunoAudioId || '', type }),
      });
      const startedOut = await start.json().catch(() => ({}));
      if (!start.ok) {
        alert((startedOut?.detail || startedOut?.error || 'No pude iniciar la separación.').toString());
        return;
      }
      const sepTaskId = String(startedOut?.taskId || '').trim();
      if (!sepTaskId) {
        alert('No recibí taskId de separación.');
        return;
      }
      toastDownloadSoon();
      const pendingListKey = 'ramber.pendingSunoTasks_v1';
      const pendingLegacyKey = 'ramber.pendingSunoTask';
      try {
        const raw = window.localStorage.getItem(pendingListKey);
        const arr = raw ? JSON.parse(raw) : [];
        const list = Array.isArray(arr) ? arr : [];
        list.push({
          taskId: sepTaskId,
          kind: type,
          startedAt: Date.now(),
          draft: {
            title: (song?.title || '').toString(),
            songId: (song?.id || '').toString(),
            coverUrl: (song?.coverUrl || '').toString(),
            description: (song?.description || '').toString(),
          },
        });
        window.localStorage.setItem(pendingListKey, JSON.stringify(list));
        try {
          window.localStorage.removeItem(pendingLegacyKey);
        } catch {
        }
      } catch {
      }
      onClose();
    } finally {
      setIsBusy(false);
    }
  };

  const generateMidi = async (audioId?: string, label?: string) => {
    if (!stemsMeta?.taskId) {
      alert('Primero genera Karaoke/Stems para poder sacar el MIDI.');
      return;
    }
    setIsBusy(true);
    try {
      const t = await getAccessToken();
      if (!t.ok) {
        alert(t.error || 'No se pudo iniciar sesión.');
        return;
      }
      const r = await fetch('/api/account/balance', {
        headers: { authorization: `Bearer ${t.token}` },
      });
      const out = await r.json().catch(() => ({}));
      if (!r.ok) {
        alert(out?.error || 'No pude verificar tu plan.');
        return;
      }
      if (!out?.downloads_allowed) {
        alert('Tu plan no incluye esta función.');
        return;
      }

      const start = await fetch('/api/suno/midi', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${t.token}` },
        body: JSON.stringify({ taskId: stemsMeta.taskId, audioId }),
      });
      const startedOut = await start.json().catch(() => ({}));
      if (!start.ok) {
        alert((startedOut?.detail || startedOut?.error || 'No pude iniciar el MIDI.').toString());
        return;
      }
      const midiTaskId = String(startedOut?.taskId || '').trim();
      if (!midiTaskId) {
        alert('No recibí taskId del MIDI.');
        return;
      }

      const startedAt = Date.now();
      while (Date.now() - startedAt < 240_000) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        const tr = await fetch(`/api/suno/task?kind=midi&taskId=${encodeURIComponent(midiTaskId)}`, {
          headers: { authorization: `Bearer ${t.token}` },
        });
        const tout = await tr.json().catch(() => ({}));
        if (!tr.ok) continue;

        const provider = tout?.data;
        const rawFlag = provider?.data?.data?.successFlag ?? provider?.data?.successFlag ?? provider?.data?.data?.data?.successFlag;
        const flag = typeof rawFlag === 'number' ? rawFlag : Number(String(rawFlag || '').trim());

        if (flag === 2 || flag === 3) {
          alert('No se pudo generar el MIDI.');
          return;
        }
        if (flag !== 1) continue;

        const midiData = provider?.data?.data?.midiData ?? provider?.data?.data?.data?.midiData ?? provider?.data?.midiData ?? null;
        const instruments = Array.isArray(midiData?.instruments) ? midiData.instruments : [];
        const notes = instruments.reduce((acc: number, it: any) => acc + (Array.isArray(it?.notes) ? it.notes.length : 0), 0);

        const json = JSON.stringify(midiData ?? {}, null, 2);
        try {
          await navigator.clipboard.writeText(json);
        } catch {
        }
        try {
          const blob = new Blob([json], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          const safe = (label || 'track').toString().replaceAll(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40);
          a.href = url;
          a.download = `midi_${midiTaskId}_${safe}.json`;
          try { document.body.appendChild(a); } catch {}
          a.click();
          try { if (a.parentNode) a.parentNode.removeChild(a); } catch {}
          URL.revokeObjectURL(url);
        } catch {
        }

        if (!midiData || instruments.length === 0 || notes === 0) {
          alert(
            `La generación MIDI regresó vacía.\n\nPasa a veces (especialmente con split_stem).\n\nPrueba esto:\n1) En la lista de pistas, toca el botón “MIDI” de una pista específica (Voz, Drums, etc.).\n2) Si sigue vacío, intenta con otra canción o un audio más limpio.\n\nYa se descargó el JSON (y se copió si el navegador lo permitió).`
          );
          return;
        }

        alert(`MIDI listo.\n\nInstrumentos: ${instruments.length}\nNotas: ${notes}\n\nSe descargó como JSON y también se copió (si el navegador lo permitió).`);
        return;
      }

      alert('El MIDI está tardando. Intenta de nuevo en unos segundos.');
    } finally {
      setIsBusy(false);
    }
  };

  const generateCoverImage = async () => {
    if (!song.sunoTaskId) {
      alert('Esta canción no tiene taskId para generar portada.');
      return;
    }
    setIsBusy(true);
    try {
      const t = await getAccessToken();
      if (!t.ok) {
        alert(t.error || 'No se pudo iniciar sesión.');
        return;
      }
      const r = await fetch('/api/suno/music-cover', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${t.token}` },
        body: JSON.stringify({ taskId: song.sunoTaskId }),
      });
      const out = await r.json().catch(() => ({}));
      if (!r.ok) {
        alert(out?.error || 'No se pudo generar portada.');
        return;
      }
      alert('Listo. Se está generando tu portada. En unos momentos se actualiza en Biblioteca.');
    } finally {
      setIsBusy(false);
    }
  };

  const compressImage = async (file: File) => {
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
    const blob: Blob = await new Promise((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No pude convertir imagen'))), 'image/webp', 0.85);
    });
    return blob;
  };

  const compressCoverToDataUrl = async (file: File) => {
    const bitmap = await createImageBitmap(file);
    const max = 1024;
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No pude procesar la imagen');
    ctx.drawImage(bitmap, 0, 0, w, h);

    const blobToDataUrl = async (blob: Blob) => {
      const dataUrl: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('No pude leer la imagen'));
        reader.readAsDataURL(blob);
      });
      return dataUrl;
    };

    const tryEncode = async (type: string, quality: number) => {
      const blob: Blob | null = await new Promise((resolve) => {
        try {
          canvas.toBlob((b) => resolve(b), type, quality);
        } catch {
          resolve(null);
        }
      });
      if (!blob) return null;
      const dataUrl = await blobToDataUrl(blob);
      return { dataUrl, size: blob.size };
    };

    const targetBytes = 900_000;
    const type = 'image/jpeg';
    for (const q of [0.9, 0.86, 0.82, 0.78]) {
      const out = await tryEncode(type, q);
      if (!out) continue;
      if (out.size <= targetBytes) return out.dataUrl;
      if (q === 0.78) return out.dataUrl;
    }
    throw new Error('No pude convertir la imagen');
  };

  const uploadCoverPhoto = async (file: File) => {
    setIsBusy(true);
    try {
      const t = await getAccessToken();
      if (!t.ok) {
        alert(t.error || 'No se pudo iniciar sesión.');
        return;
      }
      const dataUrl = await compressCoverToDataUrl(file);
      const r = await fetch('/api/library/set-cover', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${t.token}` },
        body: JSON.stringify({ id: song.id, base64Data: dataUrl, fileName: file.name }),
      });
      const out = await r.json().catch(() => ({}));
      if (!r.ok) {
        alert(out?.hint ? `${out?.error || 'No se pudo guardar la portada.'}\n\n${out.hint}` : (out?.error || 'No se pudo guardar la portada.'));
        return;
      }
      onRefreshSongs?.();
      alert('Listo. Tu portada se guardó y ya no se perderá.');
      onClose();
    } finally {
      setIsBusy(false);
    }
  };

  const uploadCoverFromUrl = async (urlRaw: string) => {
    const url = (urlRaw || '').toString().trim();
    if (!url) {
      alert('Pega un link primero.');
      return;
    }
    if (!(url.startsWith('https://') || url.startsWith('http://'))) {
      alert('El link debe empezar con http:// o https://');
      return;
    }
    setIsBusy(true);
    try {
      const t = await getAccessToken();
      if (!t.ok) {
        alert(t.error || 'No se pudo iniciar sesión.');
        return;
      }
      const r = await fetch('/api/library/set-cover', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${t.token}` },
        body: JSON.stringify({ id: song.id, fileUrl: url }),
      });
      const out = await r.json().catch(() => ({}));
      if (!r.ok) {
        alert(out?.hint ? `${out?.error || 'No se pudo guardar la portada.'}\n\n${out.hint}` : (out?.error || 'No se pudo guardar la portada.'));
        return;
      }
      onRefreshSongs?.();
      alert('Listo. Tu portada se guardó y ya no se perderá.');
      setShowCoverUrl(false);
      onClose();
    } finally {
      setIsBusy(false);
    }
  };

  const savePersona = async () => {
    if (!song.sunoTaskId || !song.sunoAudioId) {
      alert('Esta canción no tiene datos de Suno (taskId/audioId) para crear Persona.');
      return;
    }
    const name = personaName.trim();
    if (!name) {
      alert('Ponle un nombre a la Persona.');
      return;
    }
    setIsBusy(true);
    try {
      const t = await getAccessToken();
      if (!t.ok) {
        alert(t.error || 'No se pudo iniciar sesión.');
        return;
      }
      const r = await fetch('/api/suno/generate-persona', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${t.token}`,
        },
        body: JSON.stringify({
          taskId: song.sunoTaskId,
          audioId: song.sunoAudioId,
          name,
          description: (song.title || name).toString().slice(0, 2000),
          style: (song.description || '').toString().slice(0, 200),
          vocalStart: personaVocalStart,
          vocalEnd: personaVocalEnd,
          saveToLibrary: true,
          coverUrl: song.coverUrl || null,
          audioUrl: song.audioUrl || null,
        }),
      });
      const out = await r.json().catch(() => ({}));
      if (!r.ok) {
        alert(out?.error || 'No se pudo crear la Persona.');
        return;
      }
      const personaId = (out?.personaId || '').toString();
      if (!personaId) {
        alert('No recibí personaId.');
        return;
      }

      if (supabaseBrowser) {
        const s = await ensureAnonSession();
        if (s.ok) {
          const { data } = await supabaseBrowser.auth.getUser();
          const user = data?.user;
          if (user?.id) {
            await supabaseBrowser
              .from('suno_personas')
              .upsert(
                { user_id: user.id, persona_id: personaId, name: name.slice(0, 120) },
                { onConflict: 'persona_id' },
              );
          }
        }
      }

      if (personaPhoto) {
        const t = await getAccessToken();
        if (t.ok) {
          let uid = '';
          try {
            const { data } = await supabaseBrowser?.auth.getUser();
            uid = (data?.user?.id || '').toString().trim();
          } catch {
            uid = '';
          }
          const blob = await compressImage(personaPhoto);
          const base64Str = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.readAsDataURL(blob);
            reader.onload = () => resolve((reader.result as string).split(',')[1] || '');
          });
          const safePersona = (personaId || '').toString().replaceAll(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 120) || 'persona';
          const path = `personas/${uid || 'unknown'}/${safePersona}.webp`;
          
          const response = await fetch('/api/account/upload-profile-image', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'authorization': `Bearer ${t.token}`,
            },
            body: JSON.stringify({
              path,
              data: base64Str,
              contentType: 'image/webp',
            }),
          });
          
          if (response.ok) {
            const result = await response.json();
            const url = result.url;
            if (url && supabaseBrowser) {
              const s = await ensureAnonSession();
              if (s.ok) {
                await supabaseBrowser.from('suno_personas').update({ photo_url: url }).eq('persona_id', personaId);
              }
            }
          }
        }
      }

      alert('Persona guardada.');
      setShowPersonaSave(false);
      setPersonaName('');
      setPersonaPhoto(null);
    } finally {
      setIsBusy(false);
    }
  };

  let sheet: any = null;
  try {
    const genderLabel = (() => {
      const s = (song.genre || '').toString().trim();
      const lower = s.toLowerCase();
      if (lower === 'm') return 'Masculino';
      if (lower === 'f') return 'Femenino';
      return s;
    })();
    const modelLabel = (() => {
      const raw = (song.sunoModel || '').toString().trim();
      const upper = raw.toUpperCase();
      if (!upper) return 'N/D';
      if (upper.includes('V5')) return 'V5';
      if (upper.includes('V4')) return 'V4.5';
      return raw;
    })();
    const statusLabel = song.audioUrl ? (song.isCover ? 'Cover' : 'Completa') : 'En producción';
    const visibilityLabel = song.isPublic ? 'Público' : 'Privado';
    sheet = (
      <div className="fixed inset-0 z-[2147483647] flex items-end lg:items-center justify-center bg-black/60" style={{ zIndex: 2147483647 }}>
        <button className="absolute inset-0 w-full h-full" onClick={onClose} aria-label="Cerrar" />
        <div className="relative w-full lg:max-w-[980px] bg-[#0b0f16] border border-white/10 rounded-t-3xl lg:rounded-3xl overflow-hidden shadow-[0_-20px_60px_rgba(0,0,0,0.6)] max-h-[92vh] flex flex-col">
          <div className="flex justify-center py-3 shrink-0 lg:hidden">
            <div className="w-12 h-1 bg-white/20 rounded-full" />
          </div>

          <div className="flex-1 overflow-y-auto overscroll-contain">
            <div className="shrink-0 border-b border-white/10 px-5 pb-4 pt-2 lg:pt-5">
              <div className="flex items-start gap-4">
                <div className="w-16 h-16 lg:w-20 lg:h-20 rounded-2xl overflow-hidden bg-white/5 border border-white/10 shrink-0">
                  <img src={coverSrc} onError={() => onCoverError?.()} alt="Cover" className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-white font-extrabold text-lg lg:text-xl truncate">{song.title || 'Pista sin título'}</div>
                  {genderLabel ? <div className="mt-1 text-slate-300 text-sm truncate">{genderLabel}</div> : null}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="shrink-0 bg-emerald-500/20 text-emerald-200 text-[10px] font-extrabold px-2 py-0.5 rounded-full">{statusLabel}</span>
                    <span className="shrink-0 bg-white/10 text-slate-200 text-[10px] font-bold px-2 py-0.5 rounded-full">{modelLabel}</span>
                    <span className="shrink-0 bg-white/10 text-slate-200 text-[10px] font-bold px-2 py-0.5 rounded-full">{visibilityLabel}</span>
                  </div>
                </div>
                <button className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-300 hover:bg-white/10 shrink-0" onClick={onClose} type="button">
                  ✕
                </button>
              </div>
            </div>

            <div className="px-5 pb-6 pt-4">
              <div className="lg:hidden">
                {isDeleted ? (
                  <div className="space-y-3">
                    <button className="w-full rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-emerald-200 font-extrabold hover:bg-emerald-500/15 transition-colors" onClick={() => onRestore()} disabled={isBusy}>
                      Recuperar
                    </button>
                    <button
                      className="w-full rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-200 font-extrabold hover:bg-red-500/15 transition-colors"
                      onClick={() => {
                        if (confirm('¿Eliminar definitivamente? Esta acción no se puede deshacer.')) onPurge();
                      }}
                      disabled={isBusy}
                    >
                      Eliminar definitivamente
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <button
                      className="w-full flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-left hover:bg-white/[0.06] transition-colors"
                      onClick={() => coverPhotoInputRef.current?.click()}
                      disabled={isBusy}
                    >
                      <div className="flex items-center gap-3">
                        <ImageIcon className="w-5 h-5 text-slate-200" />
                        <span className="text-slate-100 font-semibold">Subir foto de portada</span>
                      </div>
                      <ChevronRight className="w-5 h-5 text-slate-500" />
                    </button>

                    <button
                      className="w-full flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-left hover:bg-white/[0.06] transition-colors"
                      onClick={() => ensureCommercialPlanOrWarn().then((ok) => ok && setShowLicense(true))}
                      disabled={isBusy}
                    >
                      <div className="flex items-center gap-3">
                        <BadgeCheck className="w-5 h-5 text-slate-200" />
                        <span className="text-slate-100 font-semibold">Licencia Comercial</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500 text-gray-900 shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] ring-1 ring-inset ring-black/10 font-extrabold">CERTIFICADO</span>
                        <ChevronRight className="w-5 h-5 text-slate-500" />
                      </div>
                    </button>

                    <div className="pt-2">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500 font-black">Editar y administrar</div>
                      <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">
                        <button className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-white/[0.05] transition-colors" onClick={() => setShowEditTitle(true)} disabled={isBusy}>
                          <div className="flex items-center gap-3">
                            <Pencil className="w-5 h-5 text-slate-200" />
                            <span className="text-slate-100 font-semibold">Editar nombre</span>
                          </div>
                          <ChevronRight className="w-5 h-5 text-slate-500" />
                        </button>
                        <button className="w-full flex items-center justify-between gap-3 px-4 py-3 border-t border-white/10 hover:bg-white/[0.05] transition-colors" onClick={() => setShowLyrics(true)} disabled={isBusy}>
                          <div className="flex items-center gap-3">
                            <FileText className="w-5 h-5 text-slate-200" />
                            <span className="text-slate-100 font-semibold">Letra</span>
                          </div>
                          <ChevronRight className="w-5 h-5 text-slate-500" />
                        </button>
                        <button className="w-full flex items-center justify-between gap-3 px-4 py-3 border-t border-white/10 hover:bg-white/[0.05] transition-colors" onClick={share} disabled={isBusy}>
                          <div className="flex items-center gap-3">
                            <Share2 className="w-5 h-5 text-slate-200" />
                            <span className="text-slate-100 font-semibold">Compartir</span>
                          </div>
                          <ChevronRight className="w-5 h-5 text-slate-500" />
                        </button>
                        <button className="w-full flex items-center justify-between gap-3 px-4 py-3 border-t border-white/10 hover:bg-white/[0.05] transition-colors" onClick={() => setShowTrim(true)} disabled={isBusy || !(song.audioUrl || '').toString().trim()}>
                          <div className="flex items-center gap-3">
                            <Scissors className="w-5 h-5 text-slate-200" />
                            <span className="text-slate-100 font-semibold">Recortar canción</span>
                          </div>
                          <ChevronRight className="w-5 h-5 text-slate-500" />
                        </button>
                      </div>
                    </div>

                    <div className="pt-2">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500 font-black">Descargar y crear</div>
                      <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">
                        <button className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-white/[0.05] transition-colors" onClick={download} disabled={isBusy}>
                          <div className="flex items-center gap-3">
                            {downloadsAllowed === false ? <Lock className="w-5 h-5 text-amber-300" /> : <Download className="w-5 h-5 text-slate-200" />}
                            <span className="text-slate-100 font-semibold">Descargar MP3</span>
                          </div>
                          <ChevronRight className="w-5 h-5 text-slate-500" />
                        </button>
                        {canShowWav ? (
                          <button className="w-full flex items-center justify-between gap-3 px-4 py-3 border-t border-white/10 hover:bg-white/[0.05] transition-colors" onClick={downloadWav} disabled={isBusy}>
                            <div className="flex items-center gap-3">
                              {downloadsAllowed === false ? <Lock className="w-5 h-5 text-amber-300" /> : <Download className="w-5 h-5 text-slate-200" />}
                              <span className="text-slate-100 font-semibold">Descargar WAV</span>
                            </div>
                            <ChevronRight className="w-5 h-5 text-slate-500" />
                          </button>
                        ) : null}
                        <button className="w-full flex items-center justify-between gap-3 px-4 py-3 border-t border-white/10 hover:bg-white/[0.05] transition-colors" onClick={() => openMp4Modal().catch(() => {})} disabled={isBusy}>
                          <div className="flex items-center gap-3">
                            <Video className="w-5 h-5 text-slate-200" />
                            <span className="text-slate-100 font-semibold">Video (MP4)</span>
                          </div>
                          <ChevronRight className="w-5 h-5 text-slate-500" />
                        </button>
                        {onStartCover ? (
                          <button
                            className="w-full flex items-center justify-between gap-3 px-4 py-3 border-t border-white/10 hover:bg-white/[0.05] transition-colors"
                            onClick={() => {
                              onClose();
                              onStartCover();
                            }}
                            disabled={isBusy}
                          >
                            <div className="flex items-center gap-3">
                              <Sparkles className="w-5 h-5 text-slate-200" />
                              <span className="text-slate-100 font-semibold">Crear Cover</span>
                            </div>
                            <ChevronRight className="w-5 h-5 text-slate-500" />
                          </button>
                        ) : null}
                        <button className={cn("w-full flex items-center justify-between gap-3 px-4 py-3 border-t border-white/10 hover:bg-white/[0.05] transition-colors", isMureka ? "opacity-50 cursor-not-allowed" : "")} onClick={() => separateStems('separate_vocal').catch(() => {})} disabled={isBusy || isMureka} title={isMureka ? "Próximamente disponible para Mureka" : ""}>
                          <div className="flex items-center gap-3">
                            <AudioLines className={cn("w-5 h-5", isMureka ? "text-slate-500" : "text-slate-200")} />
                            <span className={cn("font-semibold", isMureka ? "text-slate-500" : "text-slate-100")}>Eliminar voz / Karaoke</span>
                          </div>
                          <ChevronRight className={cn("w-5 h-5", isMureka ? "text-slate-600" : "text-slate-500")} />
                        </button>
                        <button className={cn("w-full flex items-center justify-between gap-3 px-4 py-3 border-t border-white/10 hover:bg-white/[0.05] transition-colors", isMureka ? "opacity-50 cursor-not-allowed" : "")} onClick={() => separateStems('split_stem').catch(() => {})} disabled={isBusy || isMureka} title={isMureka ? "Próximamente disponible para Mureka" : ""}>
                          <div className="flex items-center gap-3">
                            <AudioLines className={cn("w-5 h-5", isMureka ? "text-slate-500" : "text-slate-200")} />
                            <span className={cn("font-semibold", isMureka ? "text-slate-500" : "text-slate-100")}>STEMS (Pistas separadas)</span>
                          </div>
                          <ChevronRight className={cn("w-5 h-5", isMureka ? "text-slate-600" : "text-slate-500")} />
                        </button>
                      </div>
                    </div>

                    <div className="pt-2">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500 font-black">Más opciones</div>
                      <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">
                        <button
                          className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-white/[0.05] transition-colors"
                          onClick={() => {
                            onClose();
                            onOpenLists?.();
                          }}
                          disabled={isBusy}
                        >
                          <div className="flex items-center gap-3">
                            <ListMusic className="w-5 h-5 text-slate-200" />
                            <span className="text-slate-100 font-semibold">Agregar a lista</span>
                          </div>
                          <ChevronRight className="w-5 h-5 text-slate-500" />
                        </button>
                        <button
                          className="w-full flex items-center justify-between gap-3 px-4 py-3 border-t border-white/10 hover:bg-white/[0.05] transition-colors"
                          onClick={() => {
                            onClose();
                            onMoveToFolder?.();
                          }}
                          disabled={isBusy}
                        >
                          <div className="flex items-center gap-3">
                            <FolderPlus className="w-5 h-5 text-slate-200" />
                            <span className="text-slate-100 font-semibold">Mover a carpeta</span>
                          </div>
                          <ChevronRight className="w-5 h-5 text-slate-500" />
                        </button>
                        {!isDeleted && onElenco ? (
                          <button
                            className="w-full flex items-center justify-between gap-3 px-4 py-3 border-t border-white/10 hover:bg-white/[0.05] transition-colors"
                            onClick={() => {
                              onClose();
                              onElenco();
                            }}
                            disabled={isBusy}
                          >
                            <div className="flex items-center gap-3">
                              <Cast className="w-5 h-5 text-slate-200" />
                              <span className="text-slate-100 font-semibold">Elenco</span>
                            </div>
                            <ChevronRight className="w-5 h-5 text-slate-500" />
                          </button>
                        ) : null}
                        {!isDeleted ? (
                          <button
                            className="w-full flex items-center justify-between gap-3 px-4 py-3 border-t border-white/10 hover:bg-white/[0.05] transition-colors"
                            onClick={() => {
                              if (published) {
                                setSongPublic(false, '').catch(() => {});
                                return;
                              }
                              setShowPublish(true);
                            }}
                            disabled={isBusy}
                          >
                            <div className="flex items-center gap-3">
                              <Shield className="w-5 h-5 text-slate-200" />
                              <span className="text-slate-100 font-semibold">Privado / Público</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-slate-200 font-extrabold">
                                {published ? 'Público' : 'Privado'}
                              </span>
                              <ChevronRight className="w-5 h-5 text-slate-500" />
                            </div>
                          </button>
                        ) : null}
                      </div>
                    </div>

                    <button
                      className="w-full mt-2 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-200 font-extrabold hover:bg-red-500/15 transition-colors flex items-center justify-between"
                      onClick={() => {
                        if (confirm('¿Seguro que quieres eliminar esta canción?')) onDelete();
                      }}
                      disabled={isBusy}
                    >
                      <span>Eliminar canción</span>
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                )}
              </div>

              <div className="hidden lg:block">
                {isDeleted ? (
                  <div className="grid grid-cols-2 gap-3">
                    <button className="rounded-3xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-4 text-emerald-200 font-extrabold hover:bg-emerald-500/15 transition-colors" onClick={() => onRestore()} disabled={isBusy}>
                      Recuperar
                    </button>
                    <button
                      className="rounded-3xl border border-red-500/30 bg-red-500/10 px-4 py-4 text-red-200 font-extrabold hover:bg-red-500/15 transition-colors"
                      onClick={() => {
                        if (confirm('¿Eliminar definitivamente? Esta acción no se puede deshacer.')) onPurge();
                      }}
                      disabled={isBusy}
                    >
                      Eliminar definitivamente
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <button className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 text-left hover:bg-white/[0.06] transition-colors" onClick={() => coverPhotoInputRef.current?.click()} disabled={isBusy}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-2xl bg-fuchsia-500/15 border border-fuchsia-500/20 flex items-center justify-center">
                              <ImageIcon className="w-5 h-5 text-fuchsia-200" />
                            </div>
                            <div className="text-slate-100 font-extrabold">Subir foto de portada</div>
                          </div>
                          <ChevronRight className="w-5 h-5 text-slate-600" />
                        </div>
                        <div className="mt-2 text-sm text-slate-400">Personaliza la portada de tu canción.</div>
                      </button>

                      <button className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 text-left hover:bg-white/[0.06] transition-colors" onClick={() => ensureCommercialPlanOrWarn().then((ok) => ok && setShowLicense(true))} disabled={isBusy}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center">
                              <BadgeCheck className="w-5 h-5 text-emerald-200" />
                            </div>
                            <div>
                              <div className="text-slate-100 font-extrabold">Licencia Comercial</div>
                              <div className="mt-1 text-sm text-slate-400">Tu canción cuenta con licencia comercial.</div>
                            </div>
                          </div>
                          <ChevronRight className="w-5 h-5 text-slate-600" />
                        </div>
                        <div className="mt-3">
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500 text-gray-900 shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] ring-1 ring-inset ring-black/10 font-extrabold">CERTIFICADO</span>
                        </div>
                      </button>
                    </div>

                    <div className="mt-6">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500 font-black">Editar y administrar</div>
                      <div className="mt-3 grid grid-cols-4 gap-3">
                        <button className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 hover:bg-white/[0.06] transition-colors text-left" onClick={() => setShowEditTitle(true)} disabled={isBusy}>
                          <Pencil className="w-5 h-5 text-slate-200" />
                          <div className="mt-3 text-slate-100 font-semibold text-sm">Editar nombre</div>
                        </button>
                        <button className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 hover:bg-white/[0.06] transition-colors text-left" onClick={() => setShowLyrics(true)} disabled={isBusy}>
                          <FileText className="w-5 h-5 text-slate-200" />
                          <div className="mt-3 text-slate-100 font-semibold text-sm">Letra</div>
                        </button>
                        <button className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 hover:bg-white/[0.06] transition-colors text-left" onClick={share} disabled={isBusy}>
                          <Share2 className="w-5 h-5 text-slate-200" />
                          <div className="mt-3 text-slate-100 font-semibold text-sm">Compartir</div>
                        </button>
                        <button className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 hover:bg-white/[0.06] transition-colors text-left" onClick={() => setShowTrim(true)} disabled={isBusy || !(song.audioUrl || '').toString().trim()}>
                          <Scissors className="w-5 h-5 text-slate-200" />
                          <div className="mt-3 text-slate-100 font-semibold text-sm">Recortar canción</div>
                        </button>
                      </div>
                    </div>

                    <div className="mt-6">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500 font-black">Descargar y crear</div>
                      <div className="mt-3 grid grid-cols-3 gap-3">
                        <button className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 hover:bg-white/[0.06] transition-colors text-left" onClick={download} disabled={isBusy}>
                          {downloadsAllowed === false ? <Lock className="w-5 h-5 text-amber-300" /> : <Download className="w-5 h-5 text-slate-200" />}
                          <div className="mt-3 text-slate-100 font-semibold text-sm">Descargar MP3</div>
                        </button>
                        {canShowWav ? (
                          <button className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 hover:bg-white/[0.06] transition-colors text-left" onClick={downloadWav} disabled={isBusy}>
                            {downloadsAllowed === false ? <Lock className="w-5 h-5 text-amber-300" /> : <Download className="w-5 h-5 text-slate-200" />}
                            <div className="mt-3 text-slate-100 font-semibold text-sm">Descargar WAV</div>
                          </button>
                        ) : (
                          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 opacity-40">
                            <Download className="w-5 h-5 text-slate-500" />
                            <div className="mt-3 text-slate-400 font-semibold text-sm">Descargar WAV</div>
                          </div>
                        )}
                        <button className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 hover:bg-white/[0.06] transition-colors text-left" onClick={() => openMp4Modal().catch(() => {})} disabled={isBusy}>
                          <Video className="w-5 h-5 text-slate-200" />
                          <div className="mt-3 text-slate-100 font-semibold text-sm">Video (MP4)</div>
                        </button>
                        {onStartCover ? (
                          <button
                            className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 hover:bg-white/[0.06] transition-colors text-left"
                            onClick={() => {
                              onClose();
                              onStartCover();
                            }}
                            disabled={isBusy}
                          >
                            <Sparkles className="w-5 h-5 text-slate-200" />
                            <div className="mt-3 text-slate-100 font-semibold text-sm">Crear Cover</div>
                          </button>
                        ) : null}
                        <button className={cn("rounded-3xl border border-white/10 bg-white/[0.03] p-4 hover:bg-white/[0.06] transition-colors text-left", isMureka ? "opacity-50 cursor-not-allowed" : "")} onClick={() => separateStems('separate_vocal').catch(() => {})} disabled={isBusy || isMureka} title={isMureka ? "Próximamente disponible para Mureka" : ""}>
                          <AudioLines className={cn("w-5 h-5", isMureka ? "text-slate-500" : "text-slate-200")} />
                          <div className={cn("mt-3 font-semibold text-sm", isMureka ? "text-slate-500" : "text-slate-100")}>Eliminar voz / Karaoke</div>
                        </button>
                        <button className={cn("rounded-3xl border border-white/10 bg-white/[0.03] p-4 hover:bg-white/[0.06] transition-colors text-left", isMureka ? "opacity-50 cursor-not-allowed" : "")} onClick={() => separateStems('split_stem').catch(() => {})} disabled={isBusy || isMureka} title={isMureka ? "Próximamente disponible para Mureka" : ""}>
                          <AudioLines className={cn("w-5 h-5", isMureka ? "text-slate-500" : "text-slate-200")} />
                          <div className={cn("mt-3 font-semibold text-sm", isMureka ? "text-slate-500" : "text-slate-100")}>STEMS</div>
                          <div className={cn("mt-1 text-[12px]", isMureka ? "text-slate-600" : "text-slate-500")}>Pistas separadas</div>
                        </button>
                      </div>
                    </div>

                    <div className="mt-6">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500 font-black">Más opciones</div>
                      <div className="mt-3 grid grid-cols-4 gap-3">
                        <button
                          className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 hover:bg-white/[0.06] transition-colors text-left"
                          onClick={() => {
                            onClose();
                            onOpenLists?.();
                          }}
                          disabled={isBusy}
                        >
                          <ListMusic className="w-5 h-5 text-slate-200" />
                          <div className="mt-3 text-slate-100 font-semibold text-sm">Agregar a lista</div>
                        </button>
                        <button
                          className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 hover:bg-white/[0.06] transition-colors text-left"
                          onClick={() => {
                            onClose();
                            onMoveToFolder?.();
                          }}
                          disabled={isBusy}
                        >
                          <FolderPlus className="w-5 h-5 text-slate-200" />
                          <div className="mt-3 text-slate-100 font-semibold text-sm">Mover a carpeta</div>
                        </button>
                        {!isDeleted && onElenco ? (
                          <button
                            className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 hover:bg-white/[0.06] transition-colors text-left"
                            onClick={() => {
                              onClose();
                              onElenco();
                            }}
                            disabled={isBusy}
                          >
                            <Cast className="w-5 h-5 text-slate-200" />
                            <div className="mt-3 text-slate-100 font-semibold text-sm">Elenco</div>
                          </button>
                        ) : (
                          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 opacity-40">
                            <Cast className="w-5 h-5 text-slate-500" />
                            <div className="mt-3 text-slate-400 font-semibold text-sm">Elenco</div>
                          </div>
                        )}
                        {!isDeleted ? (
                          <button
                            className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 hover:bg-white/[0.06] transition-colors text-left"
                            onClick={() => {
                              if (published) {
                                setSongPublic(false, '').catch(() => {});
                                return;
                              }
                              setShowPublish(true);
                            }}
                            disabled={isBusy}
                          >
                            <Shield className="w-5 h-5 text-slate-200" />
                            <div className="mt-3 text-slate-100 font-semibold text-sm">Privado / Público</div>
                            <div className="mt-1 text-[12px] text-slate-500">{published ? 'Público' : 'Privado'}</div>
                          </button>
                        ) : (
                          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 opacity-40">
                            <Shield className="w-5 h-5 text-slate-500" />
                            <div className="mt-3 text-slate-400 font-semibold text-sm">Privado / Público</div>
                            <div className="mt-1 text-[12px] text-slate-500">No disponible</div>
                          </div>
                        )}
                      </div>
                    </div>

                    <button
                      className="mt-6 w-full rounded-3xl border border-red-500/30 bg-red-500/10 px-5 py-4 text-left hover:bg-red-500/15 transition-colors"
                      onClick={() => {
                        if (confirm('¿Seguro que quieres eliminar esta canción?')) onDelete();
                      }}
                      disabled={isBusy}
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <div className="text-red-200 font-extrabold">Eliminar canción</div>
                          <div className="mt-1 text-sm text-red-200/70">Esta acción no se puede deshacer</div>
                        </div>
                        <Trash2 className="w-5 h-5 text-red-200" />
                      </div>
                    </button>
                  </>
                )}
              </div>

              {!isDeleted ? (
                <input
                  ref={coverPhotoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0] || null;
                    e.currentTarget.value = '';
                    if (!f) return;
                    uploadCoverPhoto(f).catch(() => {});
                  }}
                />
              ) : null}
            </div>
          </div>
      </div>

      {showPersonaSave && (
        <div className="absolute inset-0 bg-black/70 flex items-end md:items-center justify-center">
          <button className="absolute inset-0 w-full h-full" onClick={() => setShowPersonaSave(false)} aria-label="Cerrar" />
          <div className="relative w-full md:max-w-[520px] bg-[#0b0f16] border border-white/10 rounded-t-3xl md:rounded-3xl overflow-hidden">
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <div className="text-white font-extrabold">Guardar Persona</div>
              <button
                onClick={() => setShowPersonaSave(false)}
                className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-200"
              >
                ✕
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div className="text-slate-300 text-sm">Ponle nombre a la voz</div>
              <input
                value={personaName}
                onChange={(e) => setPersonaName(e.target.value)}
                placeholder="Ej: Voz Ruben"
                className="w-full glass-card rounded-xl p-3 text-sm text-white placeholder:text-slate-500 outline-none"
              />
              <div className="text-slate-300 text-sm">Segmento de voz para analizar</div>
              <div className="glass-card rounded-2xl p-3 border border-white/10">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>{personaVocalStart}s</span>
                  <span>{personaVocalEnd}s</span>
                </div>
                <div className="mt-2 space-y-3">
                  <div>
                    <div className="text-[11px] text-slate-400 mb-1">Inicio</div>
                    <input
                      type="range"
                      min={0}
                      max={300}
                      value={personaVocalStart}
                      onChange={(e) => {
                        const nextStart = Math.max(0, Math.min(300, Math.round(Number(e.target.value) || 0)));
                        let nextEnd = personaVocalEnd;
                        if (nextEnd < nextStart + 10) nextEnd = nextStart + 10;
                        if (nextEnd > nextStart + 30) nextEnd = nextStart + 30;
                        setPersonaVocalStart(nextStart);
                        setPersonaVocalEnd(Math.max(0, Math.min(330, Math.round(nextEnd))));
                      }}
                      className="w-full accent-emerald-500"
                    />
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-400 mb-1">Fin</div>
                    <input
                      type="range"
                      min={personaVocalStart + 10}
                      max={personaVocalStart + 30}
                      value={personaVocalEnd}
                      onChange={(e) => {
                        const min = personaVocalStart + 10;
                        const max = personaVocalStart + 30;
                        const nextEnd = Math.max(min, Math.min(max, Math.round(Number(e.target.value) || min)));
                        setPersonaVocalEnd(nextEnd);
                      }}
                      className="w-full accent-emerald-500"
                    />
                  </div>
                </div>
                <div className="mt-2 text-[11px] text-slate-500">Debe durar entre 10 y 30 segundos.</div>
              </div>
              <div className="text-slate-300 text-sm">Foto (opcional)</div>
              <label className="w-full glass-card rounded-xl p-3 text-sm text-slate-200 border border-white/10 flex items-center justify-between cursor-pointer hover:bg-white/10">
                <span className="truncate">{personaPhoto ? personaPhoto.name : 'Seleccionar foto'}</span>
                <span className="text-slate-400">Opcional</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0] || null;
                    setPersonaPhoto(f);
                  }}
                />
              </label>
              <button
                onClick={() => savePersona().catch(() => {})}
                disabled={isBusy}
                className="w-full bg-green-500 hover:bg-green-400 text-[#020617] h-[48px] rounded-full font-extrabold text-sm transition-colors disabled:opacity-60"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {showVoiceClone && (
        <div className="absolute inset-0 bg-black/70 flex items-end md:items-center justify-center">
          <button className="absolute inset-0 w-full h-full" onClick={() => setShowVoiceClone(false)} aria-label="Cerrar" />
          <div className="relative w-full md:max-w-[720px] bg-[#0b0f16] border border-white/10 rounded-t-3xl md:rounded-3xl overflow-hidden">
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <div className="text-white font-extrabold">Clonar voz para: {song.title || 'Canción'}</div>
              <button
                onClick={() => setShowVoiceClone(false)}
                className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-200"
              >
                ✕
              </button>
            </div>
            <div className="p-4">
              <VoiceSelector
                onSelectVoice={(voiceId) => setSelectedVoiceId(voiceId)}
                selectedVoiceId={selectedVoiceId}
                songId={song.id}
                className="mb-4"
              />
              <button
                onClick={() => setShowVoiceClone(false)}
                className="w-full bg-white/5 hover:bg-white/10 border border-white/10 rounded-full py-3 text-slate-200 font-extrabold transition-colors"
              >
                Cancelar
              </button>

              <button
                onClick={async () => {
                  if (!selectedVoiceId) {
                    alert('Selecciona una voz primero');
                    return;
                  }
                  if (!song.sunoTaskId && !song.sunoAudioId) {
                    alert('Esta canción no tiene información para separar (taskId/audioId). Si es una canción subida o muy vieja, no se puede separar.');
                    return;
                  }
                  try {
                    setIsBusy(true);
                    const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
                    const parseStatus = (provider: any) => {
                      const data = provider?.data || provider?.data?.data || provider;
                      const raw = data?.data?.status ?? data?.data?.successFlag ?? data?.status ?? data?.successFlag ?? '';
                      return String(raw || '').toUpperCase();
                    };
                    const mixToWavBlob = async (instUrl: string, vocalUrl: string) => {
                      const r1 = await fetch(instUrl);
                      if (!r1.ok) throw new Error(`No pude descargar instrumental (HTTP ${r1.status}).`);
                      const r2 = await fetch(vocalUrl);
                      if (!r2.ok) throw new Error(`No pude descargar voz clonada (HTTP ${r2.status}).`);
                      const b1 = await r1.arrayBuffer();
                      const b2 = await r2.arrayBuffer();
                      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
                      try {
                        const a1 = await ctx.decodeAudioData(b1.slice(0));
                        const a2 = await ctx.decodeAudioData(b2.slice(0));
                        const sr = a1.sampleRate || 44100;
                        const length = Math.max(a1.length, a2.length);
                        const oc = new OfflineAudioContext(Math.max(1, a1.numberOfChannels || 2), length, sr);
                        const g1 = oc.createGain();
                        g1.gain.value = 1;
                        const g2 = oc.createGain();
                        g2.gain.value = 1;
                        const s1 = oc.createBufferSource();
                        s1.buffer = a1;
                        s1.connect(g1);
                        g1.connect(oc.destination);
                        const s2 = oc.createBufferSource();
                        s2.buffer = a2;
                        s2.connect(g2);
                        g2.connect(oc.destination);
                        s1.start(0);
                        s2.start(0);
                        const rendered = await oc.startRendering();
                        const wav = encodeWav(rendered);
                        return new Blob([wav], { type: 'audio/wav' });
                      } finally {
                        try {
                          await ctx.close();
                        } catch {
                        }
                      }
                    };

                    setVoiceCloneProgress('Separando voz e instrumentos…');
                    const token = await getAccessToken();
                    if (!token.ok) {
                      alert('No se pudo iniciar sesión');
                      return;
                    }
                    const importAudio = async (params: {
                      sourceUrl: string;
                      title: string;
                      description?: string;
                      coverUrl?: string;
                      externalId?: string;
                      sunoTaskId?: string;
                    }) => {
                      const r = await fetch('/api/library/import-audio', {
                        method: 'POST',
                        headers: { 'content-type': 'application/json', authorization: `Bearer ${token.token}` },
                        body: JSON.stringify({
                          sourceUrl: params.sourceUrl,
                          title: params.title,
                          description: params.description || '',
                          coverUrl: params.coverUrl || '',
                          externalId: params.externalId || '',
                          sunoTaskId: params.sunoTaskId || '',
                        }),
                      });
                      const out = await r.json().catch(() => ({}));
                      if (!r.ok) throw new Error((out?.detail || out?.error || 'No pude guardar en Biblioteca.').toString());
                      return out?.song ?? null;
                    };
                    const start = await fetch('/api/suno/separate', {
                      method: 'POST',
                      headers: { 'content-type': 'application/json', authorization: `Bearer ${token.token}` },
                      body: JSON.stringify({ taskId: song.sunoTaskId || '', audioId: song.sunoAudioId || '', type: 'split_stem' }),
                    });
                    const startedOut = await start.json().catch(() => ({}));
                    if (!start.ok) {
                      alert((startedOut?.detail || startedOut?.error || 'No pude iniciar la separación.').toString());
                      return;
                    }
                    const sepTaskId = String(startedOut?.taskId || '').trim();
                    if (!sepTaskId) {
                      alert('No recibí taskId de separación.');
                      return;
                    }

                    let provider: any = null;
                    const startedAt = Date.now();
                    while (Date.now() - startedAt < 30 * 60 * 1000) {
                      await delay(3500);
                      const tr = await fetch(`/api/suno/task?kind=split_stem&taskId=${encodeURIComponent(sepTaskId)}`, {
                        headers: { authorization: `Bearer ${token.token}` },
                      });
                      const tout = await tr.json().catch(() => ({}));
                      if (!tr.ok) continue;
                      provider = tout?.data;
                      const status = parseStatus(provider);
                      if (status === 'FAILED' || status === 'CREATE_TASK_FAILED' || status === 'CALLBACK_EXCEPTION') {
                        alert('No se pudo separar la canción en stems.');
                        return;
                      }
                      if (status === 'SUCCESS') break;
                    }

                    const items = parseVocalRemovalItems(provider);
                    const vocalItem = items.find((x: any) => (x?.key || '').trim() === 'vocalUrl');
                    const instItem = items.find((x: any) => (x?.key || '').trim() === 'instrumentalUrl');
                    if (!vocalItem?.url || !instItem?.url) {
                      alert('Terminó, pero no recibí links de stems (voz/instrumental).');
                      return;
                    }

                    setVoiceCloneProgress('Guardando stems en tu Biblioteca…');
                    const baseName = ((song?.title || '').toString().trim() || 'Canción').slice(0, 100);
                    const desc = ((song?.description || '').toString().trim() || '').slice(0, 2000);
                    const coverUrl = ((song?.coverUrl || '').toString().trim() || '').slice(0, 2000);

                    const instSaved = await importAudio({
                      sourceUrl: instItem.url,
                      title: `${baseName} - Instrumental`.slice(0, 120),
                      description: desc,
                      coverUrl,
                      externalId: `stem_${sepTaskId}_instrumentalUrl`,
                      sunoTaskId: sepTaskId,
                    }).catch(() => null);

                    const vocalSaved = await importAudio({
                      sourceUrl: vocalItem.url,
                      title: `${baseName} - Voz`.slice(0, 120),
                      description: desc,
                      coverUrl,
                      externalId: `stem_${sepTaskId}_vocalUrl`,
                      sunoTaskId: sepTaskId,
                    }).catch(() => null);

                    const vocalInputUrl =
                      (typeof (vocalSaved as any)?.audio_url === 'string' ? String((vocalSaved as any).audio_url).trim() : '') || vocalItem.url;
                    if (!vocalInputUrl) {
                      alert('No pude preparar el audio de voz para clonar.');
                      return;
                    }

                    setVoiceCloneProgress('Clonando solo la voz…');
                    const coverRes = await fetch('/api/suno/create-cover', {
                      method: 'POST',
                      headers: { 'content-type': 'application/json', authorization: `Bearer ${token.token}` },
                      body: JSON.stringify({
                        uploadUrl: vocalInputUrl,
                        voiceId: selectedVoiceId,
                        title: `${baseName} - Voz clonada`.slice(0, 120),
                        outputFormat: 'wav',
                      }),
                    });
                    const coverOut = await coverRes.json().catch(() => ({}));
                    if (!coverRes.ok) {
                      const msg = [coverOut?.error, coverOut?.detail, coverOut?.hint]
                        .map((x: any) => (typeof x === 'string' ? x.trim() : ''))
                        .filter(Boolean)
                        .join('\n\n');
                      alert(msg || 'No pude iniciar el clonado.');
                      return;
                    }
                    const predictionId = String(coverOut?.predictionId || coverOut?.coverId || '').trim();
                    if (!predictionId) {
                      alert('No recibí predictionId del clonador.');
                      return;
                    }

                    let outputUrl = '';
                    const cloneStartedAt = Date.now();
                    while (Date.now() - cloneStartedAt < 45 * 60 * 1000) {
                      await delay(5000);
                      const sr = await fetch(`/api/rvc/cover-status?predictionId=${encodeURIComponent(predictionId)}&nocache=1`, {
                        headers: { authorization: `Bearer ${token.token}` },
                      });
                      const sout = await sr.json().catch(() => ({}));
                      if (!sr.ok) continue;
                      const rawStatus = (sout?.replicateStatus || sout?.status || '').toString().trim().toLowerCase();
                      if (rawStatus === 'failed' || rawStatus === 'canceled' || rawStatus === 'error') {
                        alert((sout?.importError || sout?.replicateFetchError || sout?.error || 'El clonador falló.').toString());
                        return;
                      }
                      const u = typeof sout?.outputUrl === 'string' ? sout.outputUrl.trim() : '';
                      if (u && (rawStatus === 'succeeded' || rawStatus === 'completed' || rawStatus === 'ready')) {
                        outputUrl = u;
                        break;
                      }
                    }
                    if (!outputUrl) {
                      alert('El clonador está tardando demasiado. Intenta más tarde.');
                      return;
                    }

                    setVoiceCloneProgress('Guardando voz clonada…');
                    const clonedSaved = await importAudio({
                      sourceUrl: outputUrl,
                      title: `${baseName} - Voz clonada`.slice(0, 120),
                      description: desc,
                      coverUrl,
                      externalId: `rvc_vocals_${predictionId}`.slice(0, 200),
                    }).catch(() => null);

                    const instId = String((instSaved as any)?.id || '').trim();
                    const vocalsId = String((clonedSaved as any)?.id || '').trim();
                    const instFetchUrl = String((instSaved as any)?.audio_url || (instSaved as any)?.audioUrl || instItem.url || '').trim() || (instId ? `/api/share/song/audio?id=${encodeURIComponent(instId)}&t=${Date.now()}` : '');
                    const vocalFetchUrl = String((clonedSaved as any)?.audio_url || (clonedSaved as any)?.audioUrl || outputUrl || '').trim() || (vocalsId ? `/api/share/song/audio?id=${encodeURIComponent(vocalsId)}&t=${Date.now()}` : '');

                    setVoiceCloneProgress('Mezclando…');
                    const mixed = await mixToWavBlob(instFetchUrl, vocalFetchUrl);

                    setVoiceCloneProgress('Subiendo audio final…');
                    const up = await fetch('/api/upload-audio', {
                      method: 'POST',
                      headers: { 'content-type': 'application/json', authorization: `Bearer ${token.token}` },
                      body: JSON.stringify({ title: `${baseName} (voz clonada)`.slice(0, 120), contentType: 'audio/wav' }),
                    });
                    const upOut = await up.json().catch(() => ({}));
                    if (!up.ok || upOut?.ok !== true || !upOut?.uploadUrl || !upOut?.key) {
                      alert((upOut?.error || 'No pude preparar la subida del audio final.').toString());
                      return;
                    }

                    const put = await fetch(String(upOut.uploadUrl), { method: 'PUT', headers: { 'content-type': 'audio/wav' }, body: mixed });
                    if (!put.ok) {
                      alert('No pude subir el audio final. Si sale un error de CORS, hay que habilitar CORS en Cloudflare R2 (una sola vez).');
                      return;
                    }

                    const created = await fetch('/api/library/create-from-r2', {
                      method: 'POST',
                      headers: { 'content-type': 'application/json', authorization: `Bearer ${token.token}` },
                      body: JSON.stringify({
                        key: String(upOut.key),
                        title: `${baseName} (voz clonada)`.slice(0, 120),
                        description: desc,
                        coverUrl,
                        isCover: true,
                        externalId: `rvc_mix_${predictionId}`.slice(0, 200),
                      }),
                    });
                    const createdOut = await created.json().catch(() => ({}));
                    if (!created.ok) {
                      alert((createdOut?.detail || createdOut?.error || 'No pude guardar el audio final en Biblioteca.').toString());
                      return;
                    }

                    alert('Listo. Ya tienes la versión con voz clonada (mejor calidad) en tu Biblioteca.');
                    setShowVoiceClone(false);
                    onClose();
                    onRefreshSongs?.();
                  } catch (e) {
                    alert(e instanceof Error ? e.message : 'Error creando el cover de mejor calidad.');
                  } finally {
                    setVoiceCloneProgress('');
                    setIsBusy(false);
                  }
                }}
                disabled={isBusy || !selectedVoiceId}
                className="mt-3 w-full bg-purple-600 hover:bg-purple-500 text-white font-extrabold py-3 rounded-full transition-colors disabled:opacity-60"
              >
                {isBusy ? 'Procesando…' : 'Mejor calidad (separar voz + mezclar)'}
              </button>

              {voiceCloneProgress ? <div className="mt-3 text-xs text-slate-300">{voiceCloneProgress}</div> : null}
              
              <div className="mt-4 text-slate-400 text-sm">
                <p className="mb-2">📝 <strong>¿Qué hace esta función?</strong></p>
                <ul className="space-y-1 text-xs">
                  <li>• Toma la canción seleccionada y aplica una voz clonada</li>
                  <li>• Crea una nueva versión con la voz elegida</li>
                  <li>• La nueva canción aparecerá en tu biblioteca</li>
                  <li>• Puedes usar voces que hayas entrenado previamente</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {showPublish && (
        <div className="absolute inset-0 bg-black/70 flex items-end md:items-center justify-center">
          <button className="absolute inset-0 w-full h-full" onClick={() => setShowPublish(false)} aria-label="Cerrar" />
          <div className="relative w-full md:max-w-[520px] bg-[#0b0f16] border border-white/10 rounded-t-3xl md:rounded-3xl overflow-hidden">
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <div className="text-white font-extrabold">Publicar canción</div>
              <button onClick={() => setShowPublish(false)} className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-200">
                ✕
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div className="text-slate-300 text-sm">Género musical (ej: Pop, Rap, EDM)</div>
              <input
                value={publishGenre}
                onChange={(e) => setPublishGenre(e.target.value)}
                placeholder="Ej: Pop"
                className="w-full glass-card rounded-xl p-3 text-sm text-white placeholder:text-slate-500 outline-none"
              />
              <div className="flex flex-wrap gap-2">
                {['Pop', 'Rap', 'Hip Hop', 'EDM', 'Rock', 'Country', 'Reggaetón', 'Regional Mexicano', 'Cumbia'].map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setPublishGenre(g)}
                    className="bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 text-xs font-semibold px-3 py-1.5 rounded-full"
                  >
                    {g}
                  </button>
                ))}
              </div>
              <button
                onClick={() => {
                  const g = (publishGenre || '').toString().trim();
                  if (!g) {
                    alert('Escribe el género musical.');
                    return;
                  }
                  setShowPublish(false);
                  setSongPublic(true, g).catch(() => {});
                }}
                disabled={isBusy}
                className="w-full bg-emerald-500 hover:bg-emerald-400 text-gray-900 shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] ring-1 ring-inset ring-black/10 h-[46px] rounded-full font-extrabold text-sm transition-colors disabled:opacity-60"
              >
                Publicar
              </button>
              <div className="text-[11px] text-slate-500">Por defecto, tus canciones son privadas. Solo se verán en Inicio si las publicas.</div>
            </div>
          </div>
        </div>
      )}

      {showEditTitle && (
        <div className="absolute inset-0 bg-black/70 flex items-end md:items-center justify-center">
          <button className="absolute inset-0 w-full h-full" onClick={() => setShowEditTitle(false)} aria-label="Cerrar" />
          <div className="relative w-full md:max-w-[520px] bg-[#0b0f16] border border-white/10 rounded-t-3xl md:rounded-3xl overflow-hidden">
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <div className="text-white font-extrabold">Editar nombre</div>
              <button
                onClick={() => setShowEditTitle(false)}
                className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-200"
              >
                ✕
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div className="text-slate-300 text-sm">Nombre de la canción</div>
              <input
                value={titleText}
                onChange={(e) => setTitleText(e.target.value)}
                placeholder="Ej: Mi canción"
                className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-[15px] text-slate-100 placeholder:text-slate-500 outline-none"
                maxLength={100}
              />
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setShowEditTitle(false)}
                  className="w-full bg-white/5 hover:bg-white/10 border border-white/10 rounded-full h-[46px] text-slate-200 font-extrabold"
                  disabled={titleBusy}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => saveTitle().catch(() => {})}
                  className="w-full bg-emerald-500 hover:bg-emerald-400 rounded-full h-[46px] text-gray-900 shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] ring-1 ring-inset ring-black/10 font-extrabold"
                  disabled={titleBusy}
                >
                  {titleBusy ? 'Guardando…' : 'Guardar'}
                </button>
              </div>
              <div className="text-[11px] text-slate-500">Máximo 100 caracteres.</div>
            </div>
          </div>
        </div>
      )}

      {showLyrics && (
        <div className="absolute inset-0 bg-black/70 flex items-end md:items-center justify-center">
          <button className="absolute inset-0 w-full h-full" onClick={() => setShowLyrics(false)} aria-label="Cerrar" />
          <div className="relative w-full md:max-w-[720px] bg-[#0b0f16] border border-white/10 rounded-t-3xl md:rounded-3xl overflow-hidden">
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <div className="text-white font-extrabold">Letra</div>
              <button
                onClick={() => setShowLyrics(false)}
                className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-200"
              >
                ✕
              </button>
            </div>
            <div className="p-4 space-y-3">
              <textarea
                value={lyricsText}
                onChange={(e) => setLyricsText(e.target.value)}
                placeholder="Pega o escribe aquí la letra para guardarla en tu Biblioteca"
                className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-[15px] text-slate-100 placeholder:text-slate-500 outline-none min-h-[50vh] resize-none"
              />
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setShowLyrics(false)}
                  className="w-full bg-white/5 hover:bg-white/10 border border-white/10 rounded-full h-[46px] text-slate-200 font-extrabold"
                  disabled={lyricsBusy}
                >
                  Cerrar
                </button>
                <button
                  type="button"
                  onClick={() => saveLyrics().catch(() => {})}
                  className="w-full bg-emerald-500 hover:bg-emerald-400 rounded-full h-[46px] text-gray-900 shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] ring-1 ring-inset ring-black/10 font-extrabold"
                  disabled={lyricsBusy}
                >
                  {lyricsBusy ? 'Guardando…' : 'Guardar letra'}
                </button>
              </div>
              <div className="text-[11px] text-slate-500">
                No generamos letra aquí. Solo guardamos lo que tú escribas/pegues.
              </div>
            </div>
          </div>
        </div>
      )}

      {showTrim && (
        <div className="absolute inset-0 bg-black/70 flex items-end md:items-center justify-center">
          <button className="absolute inset-0 w-full h-full" onClick={() => setShowTrim(false)} aria-label="Cerrar" />
          <div
            ref={trimRootRef}
            className="relative w-full md:max-w-[920px] bg-[#061a2d] border border-white/10 rounded-t-3xl md:rounded-3xl overflow-hidden max-h-[92vh] flex flex-col"
            onPointerMove={(e) => {
              const type = trimDragRef.current;
              if (!type) return;
              if (trimPointerIdRef.current != null && e.pointerId !== trimPointerIdRef.current) return;
              const el = trimWrapRef.current;
              if (!el) return;
              const r = el.getBoundingClientRect();
              const dur = Number(trimDurationSec || 0);
              if (!(dur > 0) || !(r.width > 0)) return;
              const x = clamp(Number(e.clientX) - r.left, 0, r.width);
              const t = clamp((x / r.width) * dur + Number(trimDragOffsetSecRef.current || 0), 0, dur);
              const minGap = 0.25;
              if (type === 'start') {
                const next = clamp(t, 0, Math.max(0, Number(trimEndSec || 0) - minGap));
                setTrimStartSec(next);
              } else {
                const next = clamp(t, Math.min(dur, Number(trimStartSec || 0) + minGap), dur);
                setTrimEndSec(next);
              }
            }}
            onPointerUp={(e) => {
              if (trimPointerIdRef.current != null && e.pointerId !== trimPointerIdRef.current) return;
              trimPointerIdRef.current = null;
              trimDragRef.current = null;
              trimDragOffsetSecRef.current = 0;
              setTrimDrag(null);
            }}
            onPointerCancel={(e) => {
              if (trimPointerIdRef.current != null && e.pointerId !== trimPointerIdRef.current) return;
              trimPointerIdRef.current = null;
              trimDragRef.current = null;
              trimDragOffsetSecRef.current = 0;
              setTrimDrag(null);
            }}
          >
            <div className="p-4 md:p-5 border-b border-white/10 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="bg-white/5 border border-white/10 rounded-full px-4 h-11 flex items-center gap-2">
                  <Scissors className="w-5 h-5 text-white" />
                  <div className="text-white font-extrabold">Recortar</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    const dur = Number(trimDurationSec || 0);
                    if (!(dur > 0)) return;
                    setTrimStartSec(0);
                    setTrimEndSec(dur);
                    try {
                      const a = trimAudioRef.current;
                      if (a) {
                        a.pause();
                        a.currentTime = 0;
                      }
                    } catch {}
                  }}
                  className="bg-white/5 hover:bg-white/10 border border-white/10 rounded-full px-4 h-11 text-slate-100 font-extrabold"
                  disabled={trimBusy || !(Number(trimDurationSec || 0) > 0)}
                >
                  Restablecer
                </button>
                <button
                  onClick={() => setShowTrim(false)}
                  className="w-11 h-11 rounded-full bg-white/10 border border-white/10 flex items-center justify-center text-white hover:bg-white/20"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="p-4 md:p-5 flex-1 overflow-y-auto overscroll-contain">
              <audio ref={trimAudioRef} src={(trimAudioUrl || '').toString()} preload="metadata" className="hidden" />
              {trimError ? (
                <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-3 text-sm text-red-200 mb-4">{trimError}</div>
              ) : null}

              <div className="rounded-3xl overflow-hidden border border-white/10 bg-[#073556]">
                <div className="p-4 md:p-5 flex items-center justify-between">
                  <div className="text-slate-200 font-extrabold truncate">{(song.title || 'Audio').toString()}</div>
                  <div className="text-slate-200 font-extrabold">{fmtClockTenths(trimEndSec)}</div>
                </div>

                <div className="px-4 md:px-5 pb-5">
                  <div
                    ref={trimWrapRef}
                    className="relative w-full h-[170px] md:h-[210px] rounded-2xl overflow-hidden bg-[#0b2f4f] touch-none select-none"
                  >
                    <canvas ref={trimCanvasRef} className="absolute inset-0 w-full h-full" />
                    {trimPeaksBusy ? (
                      <div className="absolute inset-0 flex items-center justify-center text-slate-200 text-sm font-extrabold bg-black/25">
                        Cargando onda…
                      </div>
                    ) : null}
                    {!trimPeaksBusy && trimPeaksError ? (
                      <div className="absolute inset-0 flex items-center justify-center text-slate-200 text-sm font-extrabold bg-black/25 px-4 text-center">
                        No pude mostrar la onda. Igual puedes recortar con los palitos.
                      </div>
                    ) : null}

                    {(() => {
                      const dur = Number(trimDurationSec || 0);
                      const w = Number(trimWaveSize.w || 0);
                      const startX = dur > 0 && w > 0 ? clamp((Number(trimStartSec || 0) / dur) * w, 0, w) : 0;
                      const endX = dur > 0 && w > 0 ? clamp((Number(trimEndSec || 0) / dur) * w, 0, w) : 0;
                      const left = Math.min(startX, endX);
                      const right = Math.max(startX, endX);
                      return (
                        <>
                          <div className="absolute inset-y-0 left-0 bg-black/35" style={{ width: `${left}px` }} />
                          <div className="absolute inset-y-0 bg-black/35" style={{ left: `${right}px`, right: 0 }} />
                          <div
                            className="absolute inset-y-0 border-y border-white/10"
                            style={{
                              left: `${left}px`,
                              width: `${Math.max(0, right - left)}px`,
                              background: 'linear-gradient(90deg, rgba(0,208,255,0.10), rgba(33,246,166,0.08))',
                            }}
                          />

                          <div className="absolute inset-y-0 -translate-x-1/2" style={{ left: `${left}px` }}>
                            <div className={cn("absolute -top-12 left-1/2 -translate-x-1/2 bg-white text-gray-900 shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] ring-1 ring-inset ring-black/10 px-3 py-1 rounded-full font-extrabold text-sm", trimDrag === 'start' ? "opacity-100" : "opacity-0 md:opacity-100")}>
                              {fmtClockTenths(trimStartSec)}
                            </div>
                            <div
                              onPointerDown={(e) => {
                                const dur = Number(trimDurationSec || 0);
                                if (!(dur > 0)) return;
                                const el = trimWrapRef.current;
                                const root = trimRootRef.current;
                                if (el) {
                                  const r = el.getBoundingClientRect();
                                  if (r.width > 0) {
                                    const x = clamp(Number(e.clientX) - r.left, 0, r.width);
                                    const t = clamp((x / r.width) * dur, 0, dur);
                                    trimDragOffsetSecRef.current = Number(trimStartSec || 0) - t;
                                  }
                                }
                                trimPointerIdRef.current = e.pointerId;
                                trimDragRef.current = 'start';
                                setTrimDrag('start');
                                try {
                                  (root as any)?.setPointerCapture?.(e.pointerId);
                                } catch {}
                                try {
                                  const a = trimAudioRef.current;
                                  if (a) a.pause();
                                } catch {}
                                e.preventDefault();
                              }}
                              className="h-full w-10 md:w-12 -ml-5 md:-ml-6 cursor-ew-resize touch-none"
                            >
                              <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-5 md:w-6 bg-cyan-300/95 shadow-[0_0_0_3px_rgba(0,208,255,0.15)]" />
                              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col gap-1">
                                <div className="w-1.5 h-1.5 rounded-full bg-white/90" />
                                <div className="w-1.5 h-1.5 rounded-full bg-white/90" />
                                <div className="w-1.5 h-1.5 rounded-full bg-white/90" />
                              </div>
                            </div>
                          </div>

                          <div className="absolute inset-y-0 -translate-x-1/2" style={{ left: `${right}px` }}>
                            <div className={cn("absolute -top-12 left-1/2 -translate-x-1/2 bg-white text-gray-900 shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] ring-1 ring-inset ring-black/10 px-3 py-1 rounded-full font-extrabold text-sm", trimDrag === 'end' ? "opacity-100" : "opacity-0 md:opacity-100")}>
                              {fmtClockTenths(trimEndSec)}
                            </div>
                            <div
                              onPointerDown={(e) => {
                                const dur = Number(trimDurationSec || 0);
                                if (!(dur > 0)) return;
                                const el = trimWrapRef.current;
                                const root = trimRootRef.current;
                                if (el) {
                                  const r = el.getBoundingClientRect();
                                  if (r.width > 0) {
                                    const x = clamp(Number(e.clientX) - r.left, 0, r.width);
                                    const t = clamp((x / r.width) * dur, 0, dur);
                                    trimDragOffsetSecRef.current = Number(trimEndSec || 0) - t;
                                  }
                                }
                                trimPointerIdRef.current = e.pointerId;
                                trimDragRef.current = 'end';
                                setTrimDrag('end');
                                try {
                                  (root as any)?.setPointerCapture?.(e.pointerId);
                                } catch {}
                                try {
                                  const a = trimAudioRef.current;
                                  if (a) a.pause();
                                } catch {}
                                e.preventDefault();
                              }}
                              className="h-full w-10 md:w-12 -ml-5 md:-ml-6 cursor-ew-resize touch-none"
                            >
                              <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-5 md:w-6 bg-cyan-300/95 shadow-[0_0_0_3px_rgba(0,208,255,0.15)]" />
                              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col gap-1">
                                <div className="w-1.5 h-1.5 rounded-full bg-white/90" />
                                <div className="w-1.5 h-1.5 rounded-full bg-white/90" />
                                <div className="w-1.5 h-1.5 rounded-full bg-white/90" />
                              </div>
                            </div>
                          </div>

                          <div className="absolute bottom-3 left-4 text-cyan-200 font-extrabold text-sm">{fmtClockTenths(trimStartSec)}</div>
                          <div className="absolute bottom-3 right-4 text-cyan-200 font-extrabold text-sm">
                            {fmtClockTenths(Number(trimDurationSec || 0))}
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                <button
                  onClick={() => {
                    const a = trimAudioRef.current;
                    if (!a) return;
                    const dur = Number(trimDurationSec || 0);
                    if (!(dur > 0)) return;
                    const start = clamp(Number(trimStartSec || 0), 0, dur);
                    const end = clamp(Number(trimEndSec || 0), 0, dur);
                    if (!(end > start)) {
                      alert('El final debe ser mayor que el inicio.');
                      return;
                    }
                    if (trimIsPlaying) {
                      try {
                        a.pause();
                      } catch {}
                      return;
                    }
                    try {
                      a.currentTime = start;
                    } catch {}
                    try {
                      a.play();
                    } catch {}
                  }}
                  disabled={trimBusy || !(Number(trimDurationSec || 0) > 0)}
                  className="w-full bg-white/10 hover:bg-white/15 text-white border border-white/10 h-[48px] rounded-full font-extrabold text-sm transition-colors disabled:opacity-60"
                >
                  {trimIsPlaying ? 'Pausar' : 'Escuchar'}
                </button>
                <button
                  onClick={() => downloadTrim().catch(() => {})}
                  disabled={trimBusy || !(Number(trimDurationSec || 0) > 0)}
                  className="w-full bg-gradient-to-r from-yellow-300 to-amber-300 hover:opacity-95 text-gray-900 shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] ring-1 ring-inset ring-black/10 h-[48px] rounded-full font-extrabold text-sm transition-colors disabled:opacity-60"
                >
                  {trimBusy ? 'Preparando…' : 'Descargar'}
                </button>
                <button
                  onClick={() => shareTrim().catch(() => {})}
                  disabled={trimBusy || !(Number(trimDurationSec || 0) > 0)}
                  className="w-full bg-gradient-to-r from-indigo-400 to-fuchsia-400 hover:opacity-95 text-gray-900 shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] ring-1 ring-inset ring-black/10 h-[48px] rounded-full font-extrabold text-sm transition-colors disabled:opacity-60"
                >
                  {trimBusy ? 'Preparando…' : 'Compartir'}
                </button>
              </div>

              <div className="mt-3 text-[11px] text-slate-300/70 text-center">
                No se guarda el recorte. Solo se usa para descargar o compartir.
              </div>
            </div>
          </div>
        </div>
      )}

      {showLicenseBlocked && (
        <div className="absolute inset-0 bg-black/70 flex items-end md:items-center justify-center">
          <button className="absolute inset-0 w-full h-full" onClick={() => setShowLicenseBlocked(false)} aria-label="Cerrar" />
          <div className="relative w-full md:max-w-[520px] bg-[#0b0f16] border border-white/10 rounded-t-3xl md:rounded-3xl overflow-hidden shadow-[0_-20px_60px_rgba(0,0,0,0.6)]">
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <div className="min-w-0">
                <div className="text-white font-extrabold truncate">Licencia Comercial</div>
                <div className="text-[11px] text-slate-400">Acceso disponible solo con plan</div>
              </div>
              <button
                onClick={() => setShowLicenseBlocked(false)}
                className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-200"
              >
                ✕
              </button>
            </div>
            <div className="p-5">
              <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
                <div className="flex items-center gap-2 text-slate-200 font-extrabold">
                  <Shield className="w-5 h-5 text-slate-200" /> Necesitas un plan activo
                </div>
                <div className="mt-2 text-sm text-slate-300">
                  Para generar el certificado de licencia comercial, necesitas tener un plan activo (Inicio o Productor).
                </div>
                <div className="mt-2 text-[11px] text-slate-500">
                  Cuando compres tu plan, vuelve a intentar y podrás descargar tu certificado.
                </div>
              </div>
              <div className="mt-4 flex items-center gap-3">
                <button
                  onClick={() => {
                    setShowLicenseBlocked(false);
                    onClose();
                    window.dispatchEvent(new Event('ramber:openPricing'));
                  }}
                  className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-gray-900 shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] ring-1 ring-inset ring-black/10 h-[46px] rounded-full font-extrabold text-sm transition-colors"
                >
                  Ver planes
                </button>
                <button
                  onClick={() => setShowLicenseBlocked(false)}
                  className="w-[140px] bg-white/5 hover:bg-white/10 text-slate-200 border border-white/10 h-[46px] rounded-full font-extrabold text-sm transition-colors"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showLicense && (
        <div className="absolute inset-0 bg-black/70 flex items-end md:items-center justify-center">
          <button className="absolute inset-0 w-full h-full" onClick={closeLicenseModal} aria-label="Cerrar" />
          <div className="relative w-full md:max-w-[720px] bg-[#0b0f16] border border-white/10 rounded-t-3xl md:rounded-3xl overflow-hidden max-h-[92vh] flex flex-col">
            <div className="p-4 border-b border-white/10 flex items-center justify-between shrink-0">
              <div className="min-w-0">
                <div className="text-white font-extrabold truncate">Certificación de Derechos Comerciales</div>
                <div className="text-[11px] text-slate-400">Sistema de Certificación de Licencia Comercial</div>
              </div>
              <button
                onClick={closeLicenseModal}
                className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-200"
              >
                ✕
              </button>
            </div>

            <div className="p-5 flex-1 overflow-y-auto">
              {!licensePdfUrl ? (
                <>
                  <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
                    <div className="flex items-center gap-2 text-slate-200 font-extrabold">
                      <Shield className="w-5 h-5 text-slate-200" /> Generar Certificado de Licencia
                    </div>
                    <div className="mt-2 text-[11px] text-slate-400">
                      Al generar este documento, confirmas que la letra es de tu autoría y que posees una suscripción activa para el uso comercial de esta obra.
                    </div>
                    <div className="mt-2 text-[11px] text-slate-500">
                      El PDF se genera sin campos editables. Si alguien lo altera, deja de ser válido.
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <div className="text-[11px] text-slate-400 font-semibold">Nombre Legal Completo</div>
                      <input
                        value={licenseLegalName}
                        onChange={(e) => setLicenseLegalName(e.target.value)}
                        placeholder="Ej: Ruben Vidal Hernandez"
                        className="mt-2 w-full bg-black/20 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-slate-500 outline-none focus:border-white/20"
                      />
                    </div>
                    <div>
                      <div className="text-[11px] text-slate-400 font-semibold">Correo Electrónico de Contacto</div>
                      <input
                        value={licenseContactEmail}
                        onChange={(e) => setLicenseContactEmail(e.target.value)}
                        placeholder="correo@gmail.com"
                        className="mt-2 w-full bg-black/20 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-slate-500 outline-none focus:border-white/20"
                      />
                    </div>
                  </div>

                  <div className="mt-4 bg-black/20 border border-white/10 rounded-2xl p-4">
                    <div className="text-[11px] text-slate-400 font-semibold">Confirmación de Obra</div>
                    <div className="mt-2 text-sm text-slate-200 font-extrabold truncate">{(song.title || '').toString() || 'Pista sin título'}</div>
                    <div className="mt-1 text-[11px] text-slate-500 break-words">ID: {(song.id || '').toString()}</div>
                    {licenseAccountEmail ? (
                      <div className="mt-2 text-[11px] text-slate-500 break-words">Cuenta de usuario: {licenseAccountEmail}</div>
                    ) : null}
                  </div>

                  {licensePdfError ? (
                    <div className="mt-4 bg-red-500/10 border border-red-500/20 rounded-2xl p-3 text-sm text-red-200">
                      {licensePdfError}
                    </div>
                  ) : null}
                </>
              ) : (
                <>
                  <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
                    <div className="text-slate-200 font-extrabold">Vista previa del certificado</div>
                    <div className="mt-1 text-[11px] text-slate-500 break-words">{licensePdfName || 'Licencia_LucIAna.pdf'}</div>
                  </div>
                  <div className="mt-4 bg-black/20 border border-white/10 rounded-2xl overflow-hidden">
                    <iframe title="Certificado LucIAna" src={licensePdfUrl} className="w-full h-[62vh] bg-black" />
                  </div>
                  <div className="mt-3 text-[11px] text-slate-500">
                    Si no ves la vista previa, usa el botón de descargar.
                  </div>
                </>
              )}
            </div>

            <div className="p-5 border-t border-white/10 shrink-0">
              {!licensePdfUrl ? (
                <button
                  onClick={() => generateCommercialLicensePdf()}
                  disabled={isLicenseBusy}
                  className="w-full bg-emerald-500 hover:bg-emerald-400 text-gray-900 shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] ring-1 ring-inset ring-black/10 h-[48px] rounded-full font-extrabold text-sm transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {isLicenseBusy ? 'Generando…' : 'Confirmar y Generar'}
                </button>
              ) : (
                <div className="flex items-center gap-3">
                  <a
                    href={licensePdfUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 bg-white/5 hover:bg-white/10 text-slate-200 border border-white/10 h-[48px] rounded-full font-extrabold text-sm transition-colors flex items-center justify-center"
                  >
                    Abrir
                  </a>
                  <a
                    href={licensePdfUrl}
                    download={licensePdfName || undefined}
                    className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-gray-900 shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] ring-1 ring-inset ring-black/10 h-[48px] rounded-full font-extrabold text-sm transition-colors flex items-center justify-center"
                  >
                    Descargar PDF
                  </a>
                  <button
                    onClick={() => {
                      if (licensePdfUrl) URL.revokeObjectURL(licensePdfUrl);
                      setLicensePdfUrl('');
                      setLicensePdfName('');
                      setLicensePdfError('');
                    }}
                    className="w-[140px] bg-white/5 hover:bg-white/10 text-slate-200 border border-white/10 h-[48px] rounded-full font-extrabold text-sm transition-colors"
                  >
                    Editar
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showStems && (
        <div className="absolute inset-0 bg-black/70 flex items-end md:items-center justify-center">
          <button className="absolute inset-0 w-full h-full" onClick={() => setShowStems(false)} aria-label="Cerrar" />
          <div className="relative w-full md:max-w-[720px] bg-[#0b0f16] border border-white/10 rounded-t-3xl md:rounded-3xl overflow-hidden max-h-[92vh] flex flex-col">
            <div className="p-4 border-b border-white/10 flex items-center justify-between shrink-0">
              <div className="text-white font-extrabold">
                {stemsMeta?.type === 'split_stem' ? 'Stems (12 pistas)' : 'Karaoke (sin voz)'}
              </div>
              <button
                onClick={() => setShowStems(false)}
                className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-200"
              >
                ✕
              </button>
            </div>

            <div className="p-4 flex-1 overflow-y-auto overscroll-contain">
              <div className="text-slate-400 text-xs">{stemsMeta?.taskId ? `TaskId: ${stemsMeta.taskId}` : ' '}</div>
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                <button
                  className="bg-white/5 hover:bg-white/10 text-slate-200 border border-white/10 px-4 py-2 rounded-full text-sm font-semibold transition-colors disabled:opacity-50"
                  disabled={stemsItems.length === 0}
                  onClick={async () => {
                    const text = stemsItems.map((x) => `${x.label}: ${x.url}`).join('\n');
                    try {
                      await navigator.clipboard.writeText(text);
                      alert('Copiado al portapapeles.');
                    } catch {
                      alert(text);
                    }
                  }}
                >
                  Copiar links
                </button>
                <button
                  className="bg-white/5 hover:bg-white/10 text-slate-200 border border-white/10 px-4 py-2 rounded-full text-sm font-semibold transition-colors disabled:opacity-50"
                  disabled={stemsItems.length === 0}
                  onClick={() => stemsItems.forEach((x) => window.open(x.url, '_blank'))}
                >
                  Abrir todo
                </button>
                <button
                  className="bg-white/5 hover:bg-white/10 text-slate-200 border border-white/10 px-4 py-2 rounded-full text-sm font-semibold transition-colors disabled:opacity-50"
                  disabled={stemsItems.length === 0 || isBusy}
                  onClick={() => generateMidi(undefined, stemsMeta?.type === 'split_stem' ? 'stems' : 'karaoke').catch(() => {})}
                >
                  Generar MIDI (todo)
                </button>
              </div>

              {stemsItems.length === 0 ? (
                <div className="mt-6 text-slate-400 text-sm">No hay pistas para mostrar.</div>
              ) : (
                <div className="mt-4 space-y-2">
                  {stemsItems.map((it) => (
                    <div
                      key={`${it.key}:${it.url}`}
                      className="w-full glass-card rounded-2xl p-4 flex items-center justify-between gap-3 hover:bg-white/10 transition-colors"
                    >
                      <div className="min-w-0">
                        <div className="text-white font-bold truncate">{it.label}</div>
                        <div className="text-slate-500 text-xs truncate">{it.url}</div>
                      </div>
                      <div className="shrink-0 flex items-center gap-2">
                        <button
                          className="bg-white/5 hover:bg-white/10 text-slate-200 border border-white/10 px-3 py-2 rounded-full text-xs font-semibold transition-colors disabled:opacity-50"
                          onClick={() => window.open(it.url, '_blank')}
                          disabled={isBusy}
                        >
                          Abrir
                        </button>
                        {it.audioId ? (
                          <button
                            className="bg-white/5 hover:bg-white/10 text-slate-200 border border-white/10 px-3 py-2 rounded-full text-xs font-semibold transition-colors disabled:opacity-50"
                            onClick={() => generateMidi(it.audioId, it.label).catch(() => {})}
                            disabled={isBusy}
                          >
                            MIDI
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-4 text-[11px] text-slate-500">Los links pueden expirar. Descárgalos pronto si los vas a guardar.</div>
            </div>
          </div>
        </div>
      )}

      {showMp4 && (
        <div className="absolute inset-0 bg-black/70 flex items-end md:items-center justify-center">
          <button className="absolute inset-0 w-full h-full" onClick={() => setShowMp4(false)} aria-label="Cerrar" />
          <div className="relative w-full md:max-w-[520px] bg-[#0b0f16] border border-white/10 rounded-t-3xl md:rounded-3xl overflow-hidden max-h-[92vh] flex flex-col">
            <div className="p-4 border-b border-white/10 flex items-center justify-between shrink-0">
              <div className="text-white font-extrabold">Video (MP4)</div>
              <button
                onClick={() => setShowMp4(false)}
                className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-200"
              >
                ✕
              </button>
            </div>
            <div className="p-4 flex-1 overflow-y-auto overscroll-contain space-y-3">
              <div className="text-slate-300 text-sm">Autor (opcional)</div>
              <input
                value={mp4Author}
                onChange={(e) => setMp4Author(e.target.value)}
                placeholder="Ej: Ruben Vidal"
                maxLength={50}
                className="w-full glass-card rounded-xl p-3 text-sm text-white placeholder:text-slate-500 outline-none"
              />
              <div className="text-slate-400 text-xs">
                {mp4WatermarkDisabled ? 'Marca de agua: sin LucIAna (Plan Productor).' : 'Marca de agua: LucIAna.'}
              </div>
              <button
                onClick={() => {
                  const a = mp4Author;
                  setShowMp4(false);
                  createMp4(a).catch(() => {});
                }}
                disabled={isBusy}
                className="w-full bg-white text-gray-900 shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] ring-1 ring-inset ring-black/10 h-[48px] rounded-full font-extrabold text-sm transition-colors disabled:opacity-60"
              >
                Crear video
              </button>
              <div className="text-[11px] text-slate-500">El video se guarda 15 días en almacenamiento externo.</div>
            </div>
          </div>
        </div>
      )}

      {showCoverUrl && (
        <div className="absolute inset-0 bg-black/70 flex items-end md:items-center justify-center">
          <button className="absolute inset-0 w-full h-full" onClick={() => setShowCoverUrl(false)} aria-label="Cerrar" />
          <div className="relative w-full md:max-w-[520px] bg-[#0b0f16] border border-white/10 rounded-t-3xl md:rounded-3xl overflow-hidden max-h-[92vh] flex flex-col">
            <div className="p-4 border-b border-white/10 flex items-center justify-between shrink-0">
              <div className="text-white font-extrabold">Pegar link de portada</div>
              <button
                onClick={() => setShowCoverUrl(false)}
                className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-200"
              >
                ✕
              </button>
            </div>
            <div className="p-4 flex-1 overflow-y-auto overscroll-contain space-y-3">
              <div className="text-slate-300 text-sm">Link (URL)</div>
              <input
                value={coverUrlInput}
                onChange={(e) => setCoverUrlInput(e.target.value)}
                placeholder="https://..."
                className="w-full glass-card rounded-xl p-3 text-sm text-white placeholder:text-slate-500 outline-none"
              />
              <button
                onClick={() => uploadCoverFromUrl(coverUrlInput).catch(() => {})}
                disabled={isBusy}
                className="w-full bg-white text-gray-900 shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] ring-1 ring-inset ring-black/10 h-[48px] rounded-full font-extrabold text-sm transition-colors disabled:opacity-60"
              >
                Guardar portada
              </button>
              <div className="text-[11px] text-slate-500">
                El link debe ser público. La app guardará la imagen permanente en LucIAna (bucket covers).
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
    );
  } catch (e) {
    try {
      console.error('SongOptionsSheet render error', e);
    } catch {}
    const detail = (e instanceof Error ? e.message : String(e || '')).toString().trim();
    sheet = (
      <div className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-black/70" style={{ zIndex: 2147483647 }}>
        <button className="absolute inset-0 w-full h-full" onClick={onClose} aria-label="Cerrar" />
        <div className="relative w-full max-w-[520px] bg-[#0b0f16] border border-white/10 rounded-3xl overflow-hidden shadow-[0_-20px_60px_rgba(0,0,0,0.6)]">
          <div className="p-4 border-b border-white/10 flex items-center justify-between">
            <div className="text-white font-extrabold">Opciones</div>
            <button onClick={onClose} className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-200" type="button">
              ✕
            </button>
          </div>
          <div className="p-4 text-slate-200 text-sm">
            No pude abrir el menú de opciones. Recarga la página y vuelve a intentar.
          </div>
          {detail ? (
            <div className="px-4 pb-4 text-[11px] text-slate-400 break-words">
              Detalle: {detail.slice(0, 220)}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  if (typeof document === 'undefined' || !document.body) return sheet;
  try {
    return createPortal(sheet, document.body);
  } catch {
    return sheet;
  }
}

function CreateVibeModal({ onClose, canciones, onAddVibe }: { onClose: () => void, canciones: SongItem[], onAddVibe: (v: VibeItem) => void }) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  
  const handleCreate = () => {
    if (!name) return;
    onAddVibe({
      id: Math.random().toString(),
      name,
      description: desc
    });
    onClose();
  };

  return (
    <div className="absolute inset-x-0 bottom-0 top-10 glass-panel border-t border-white/10 rounded-t-[2rem] overflow-y-auto z-50 animate-in slide-in-from-bottom-full duration-300 shadow-[0_-20px_50px_rgba(0,0,0,0.5)] flex flex-col pb-safe">
      <div className="flex justify-center py-4 sticky top-0 bg-transparent z-10 backdrop-blur-xl border-b border-white/5">
        <div className="w-12 h-1 bg-white/20 rounded-full" />
      </div>
      
      <div className="p-6 flex-1 flex flex-col gap-6">
        <h2 className="text-2xl font-bold text-white mb-2">Crear Vibe</h2>
        
        <div className="space-y-2">
          <div className="glass-card rounded-xl p-4 flex justify-between items-center text-sm text-slate-300 cursor-pointer hover:bg-white/10 transition-colors">
            {canciones.length > 0 ? canciones[0].title : 'Seleccionar una canción'}
            <ChevronDown className="w-4 h-4 text-slate-500" />
          </div>
        </div>

        <div className="space-y-3">
          <label className="text-sm font-bold text-slate-200 block uppercase tracking-wider">Nombre</label>
          <input 
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ingresa el nombre de tu vibe"
            className="w-full glass-card rounded-xl px-4 py-4 text-sm text-white placeholder:text-slate-500 outline-none focus:border-indigo-500/50 transition-colors"
          />
        </div>

        <div className="space-y-3">
          <label className="text-sm font-bold text-slate-200 block uppercase tracking-wider">Imagen</label>
          <div className="flex items-center gap-4">
            <div className="w-24 h-24 rounded-2xl glass-card flex flex-col items-center justify-center gap-1 relative overflow-hidden group cursor-pointer hover:bg-white/10 transition-colors">
              <ImageIcon className="w-6 h-6 text-indigo-400" />
              <div className="absolute bottom-1.5 right-1.5 bg-black/50 p-1.5 rounded-full backdrop-blur">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 text-white"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
              </div>
            </div>
            <p className="text-xs text-slate-500 max-w-[200px] leading-relaxed">
              (Medidas sugeridas: 175x175 px, máximo 500 KB)
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <label className="text-sm font-bold text-slate-200 block uppercase tracking-wider">Descripción</label>
          <div className="relative">
            <textarea 
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="Ingresa la descripción de su vibe..."
              className="w-full glass-card rounded-xl p-4 text-sm text-white placeholder:text-slate-500 outline-none min-h-[140px] resize-none focus:border-indigo-500/50 transition-colors"
            />
            <div className="absolute bottom-4 right-4 text-xs text-slate-400">{desc.length} / 200</div>
          </div>
        </div>
      </div>

      <div className="p-6 flex gap-4 pb-12">
        <button 
          onClick={onClose}
          className="flex-1 py-4 rounded-full glass-card text-white font-semibold flex items-center justify-center transition-colors hover:bg-white/10"
        >
          Cancelar
        </button>
        <button 
          onClick={handleCreate}
          disabled={!name}
          className="flex-1 py-4 rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/20 text-white hover:opacity-90 font-bold flex items-center justify-center transition-all disabled:opacity-50 disabled:from-slate-700 disabled:to-slate-800 disabled:shadow-none"
        >
          Crear
        </button>
      </div>
    </div>
  );
}

function FiltersModal({
  from,
  to,
  sort,
  onClose,
  onApply,
  onClear,
}: {
  from: string;
  to: string;
  sort: 'newest' | 'oldest';
  onClose: () => void;
  onApply: (next: { from: string; to: string; sort: 'newest' | 'oldest' }) => void;
  onClear: () => void;
}) {
  const [localFrom, setLocalFrom] = useState(from);
  const [localTo, setLocalTo] = useState(to);
  const [localSort, setLocalSort] = useState<'newest' | 'oldest'>(sort);

  return (
    <div className="absolute inset-0 bg-black/70 flex items-end md:items-center justify-center">
      <button className="absolute inset-0 w-full h-full" onClick={onClose} aria-label="Cerrar" />
      <div className="relative w-full md:max-w-[520px] bg-[#0b0f16] border border-white/10 rounded-t-3xl md:rounded-3xl overflow-hidden shadow-[0_-20px_60px_rgba(0,0,0,0.6)]">
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <div className="text-white font-extrabold">Filtros</div>
          <button onClick={onClose} className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-200">
            ✕
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <div className="text-[11px] text-slate-400 font-semibold">Desde</div>
              <input
                type="date"
                value={localFrom}
                onChange={(e) => setLocalFrom(e.target.value)}
                className="mt-2 w-full bg-black/20 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white outline-none focus:border-white/20"
              />
            </div>
            <div>
              <div className="text-[11px] text-slate-400 font-semibold">Hasta</div>
              <input
                type="date"
                value={localTo}
                onChange={(e) => setLocalTo(e.target.value)}
                className="mt-2 w-full bg-black/20 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white outline-none focus:border-white/20"
              />
            </div>
          </div>

          <div>
            <div className="text-[11px] text-slate-400 font-semibold">Orden</div>
            <div className="mt-2 flex items-center gap-2">
              <button
                onClick={() => setLocalSort('newest')}
                className={cn(
                  'flex-1 h-[46px] rounded-2xl border border-white/10 font-extrabold text-sm',
                  localSort === 'newest' ? 'bg-white text-gray-900 shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] ring-1 ring-inset ring-black/10' : 'bg-white/5 text-slate-200 hover:bg-white/10'
                )}
              >
                Más nuevo
              </button>
              <button
                onClick={() => setLocalSort('oldest')}
                className={cn(
                  'flex-1 h-[46px] rounded-2xl border border-white/10 font-extrabold text-sm',
                  localSort === 'oldest' ? 'bg-white text-gray-900 shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] ring-1 ring-inset ring-black/10' : 'bg-white/5 text-slate-200 hover:bg-white/10'
                )}
              >
                Más antiguo
              </button>
            </div>
          </div>
        </div>
        <div className="p-5 border-t border-white/10 flex items-center gap-3">
          <button
            onClick={onClear}
            className="w-[140px] bg-white/5 hover:bg-white/10 text-slate-200 border border-white/10 h-[48px] rounded-full font-extrabold text-sm transition-colors"
          >
            Limpiar
          </button>
          <button
            onClick={() => onApply({ from: localFrom, to: localTo, sort: localSort })}
            className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-gray-900 shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] ring-1 ring-inset ring-black/10 h-[48px] rounded-full font-extrabold text-sm transition-colors"
          >
            Aplicar
          </button>
        </div>
      </div>
    </div>
  );
}

function FolderPickerModal({
  songTitle,
  folders,
  currentFolderId,
  onClose,
  onPick,
  onCreateAndPick,
}: {
  songTitle: string;
  folders: Array<{ id: string; name: string }>;
  currentFolderId: string;
  onClose: () => void;
  onPick: (folderId: string) => void;
  onCreateAndPick: (name: string) => void;
}) {
  const [name, setName] = useState('');
  return (
    <div className="absolute inset-0 bg-black/70 flex items-end md:items-center justify-center">
      <button className="absolute inset-0 w-full h-full" onClick={onClose} aria-label="Cerrar" />
      <div className="relative w-full md:max-w-[520px] bg-[#0b0f16] border border-white/10 rounded-t-3xl md:rounded-3xl overflow-hidden shadow-[0_-20px_60px_rgba(0,0,0,0.6)]">
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <div className="min-w-0">
            <div className="text-white font-extrabold truncate">Mover a carpeta</div>
            <div className="text-[11px] text-slate-400 truncate">{songTitle}</div>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-200">
            ✕
          </button>
        </div>
        <div className="p-4 space-y-2 max-h-[60vh] overflow-y-auto">
          <button
            onClick={() => onPick('')}
            className={cn(
              'w-full flex items-center justify-between p-4 rounded-2xl border transition-colors',
              !currentFolderId ? 'bg-white text-gray-900 shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] ring-1 ring-inset ring-black/10 border-white' : 'bg-white/5 text-slate-200 border-white/10 hover:bg-white/10'
            )}
          >
            <div className="font-extrabold">Sin carpeta</div>
            {!currentFolderId ? <div className="text-xs font-extrabold">ACTUAL</div> : null}
          </button>

          {folders.length === 0 ? <div className="text-slate-400 text-sm px-1">No tienes carpetas todavía.</div> : null}

          {folders.map((f) => (
            <button
              key={f.id}
              onClick={() => onPick(f.id)}
              className={cn(
                'w-full flex items-center justify-between p-4 rounded-2xl border transition-colors',
                currentFolderId === f.id ? 'bg-white text-gray-900 shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] ring-1 ring-inset ring-black/10 border-white' : 'bg-white/5 text-slate-200 border-white/10 hover:bg-white/10'
              )}
            >
              <div className="font-extrabold truncate">{f.name}</div>
              {currentFolderId === f.id ? <div className="text-xs font-extrabold">ACTUAL</div> : null}
            </button>
          ))}

          <div className="mt-4 bg-black/20 border border-white/10 rounded-2xl p-4">
            <div className="text-[11px] text-slate-400 font-semibold">Crear carpeta</div>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nombre de la carpeta"
              className="mt-2 w-full bg-black/20 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-slate-500 outline-none focus:border-white/20"
            />
            <button
              onClick={() => onCreateAndPick(name)}
              disabled={!name.trim()}
              className="mt-3 w-full bg-emerald-500 hover:bg-emerald-400 text-gray-900 shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] ring-1 ring-inset ring-black/10 h-[46px] rounded-full font-extrabold text-sm transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            >
              <FolderPlus className="w-4 h-4" /> Crear y mover
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CreateListModal({ onClose, onCreate }: { onClose: () => void; onCreate: (name: string) => void }) {
  const [name, setName] = useState('');

  return (
    <div className="absolute inset-0 bg-black/70 flex items-end md:items-center justify-center">
      <button className="absolute inset-0 w-full h-full" onClick={onClose} aria-label="Cerrar" />
      <div className="relative w-full md:max-w-[520px] glass-panel rounded-t-3xl md:rounded-3xl overflow-hidden shadow-[0_-20px_60px_rgba(0,0,0,0.55)]">
        <div className="p-4 border-b border-white/10 flex items-center justify-between bg-gradient-to-r from-indigo-500/20 via-purple-500/10 to-fuchsia-500/10">
          <div className="text-white font-extrabold">Nueva carpeta</div>
          <button onClick={onClose} className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-200">
            ✕
          </button>
        </div>
        <div className="p-5">
          <div className="text-[11px] text-slate-400 font-semibold">Nombre</div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej: Mis corridos"
            className="mt-2 w-full bg-black/20 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-slate-500 outline-none focus:border-white/20"
          />
        </div>
        <div className="p-5 border-t border-white/10 flex items-center gap-3">
          <button
            onClick={onClose}
            className="w-[140px] bg-white/5 hover:bg-white/10 text-slate-200 border border-white/10 h-[48px] rounded-full font-extrabold text-sm transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={() => onCreate(name)}
            disabled={!name.trim()}
            className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-gray-900 shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] ring-1 ring-inset ring-black/10 h-[48px] rounded-full font-extrabold text-sm transition-colors disabled:opacity-60"
          >
            Crear
          </button>
        </div>
      </div>
    </div>
  );
}
