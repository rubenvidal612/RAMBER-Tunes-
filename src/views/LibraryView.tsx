import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { type LibraryTab, type SongItem, type VibeItem } from '@/types';
import { cn } from '@/lib/utils';
import { Sparkles, Plus, Image as ImageIcon, ChevronDown, Play, Pause, ThumbsUp, Settings2, Search, MoreVertical, Share2, Download, Trash2, Flag, Pencil, AudioLines, Repeat2, Sparkle, MessageCircle, Music2, FileText, Video, BadgeCheck, Shield, ListMusic, FolderPlus, X, Scissors } from 'lucide-react';
import { ensureAnonSession, getAccessToken, supabaseBrowser } from '@/lib/supabaseBrowser';
import { jsPDF } from 'jspdf';

interface LibraryViewProps {
  canciones: SongItem[];
  cancionesEliminadas?: SongItem[];
  vibes: VibeItem[];
  onAddVibe: (v: VibeItem) => void;
  onPlaySong: (s: SongItem) => void;
  onDeleteSong?: (id: string) => void;
  onRestoreSong?: (id: string) => void;
  onRefreshSongs?: () => void;
  activeSongId?: string;
  isPlaying?: boolean;
  onStartCover?: (song: SongItem) => void;
}

export function LibraryView({ canciones, cancionesEliminadas, vibes, onAddVibe, onPlaySong, onDeleteSong, onRestoreSong, onRefreshSongs, activeSongId, isPlaying, onStartCover }: LibraryViewProps) {
  const [activeTab, setActiveTab] = useState<LibraryTab>('canciones');
  const [isCreateVibeOpen, setIsCreateVibeOpen] = useState(false);
  const [isCreateListOpen, setIsCreateListOpen] = useState(false);
  const [menuSong, setMenuSong] = useState<SongItem | null>(null);
  const [showTrash, setShowTrash] = useState(false);
  const [pendingTasks, setPendingTasks] = useState<Array<{ taskId: string; kind: string; startedAt: number; providerStatus?: string; progressPct?: number }>>([]);
  const [completedDownloads, setCompletedDownloads] = useState<Array<{ taskId: string; kind: string; doneAt: number; draft?: any }>>([]);
  const [downloadsModalOpen, setDownloadsModalOpen] = useState(false);
  const [downloadsModalTitle, setDownloadsModalTitle] = useState('');
  const [downloadsModalTaskId, setDownloadsModalTaskId] = useState('');
  const [downloadsModalKind, setDownloadsModalKind] = useState('');
  const [downloadsModalCoverUrl, setDownloadsModalCoverUrl] = useState('');
  const [downloadsModalSourceSongId, setDownloadsModalSourceSongId] = useState('');
  const [downloadsModalItems, setDownloadsModalItems] = useState<Array<{ key: string; label: string; url: string; audioId?: string }>>([]);
  const [downloadsModalBusy, setDownloadsModalBusy] = useState(false);
  const [downloadsModalError, setDownloadsModalError] = useState('');
  const [downloadsModalSaving, setDownloadsModalSaving] = useState(false);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [videoTasks, setVideoTasks] = useState<Array<{ taskId: string; createdAt?: string }>>([]);
  const [videoThumbs, setVideoThumbs] = useState<Record<string, string>>({});
  const [videoLoading, setVideoLoading] = useState(false);
  const [videoError, setVideoError] = useState('');

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
              progressPct: Number.isFinite(Number(x?.progressPct)) ? Number(x.progressPct) : undefined,
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
        const from = typeof parsed.from === 'string' ? parsed.from : '';
        const to = typeof parsed.to === 'string' ? parsed.to : '';
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

  const sanitizeFileName = (s: string) =>
    (s || '')
      .toString()
      .replace(/[\\/:*?"<>|]+/g, '_')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120);

  const downloadToDevice = async (url: string, filename: string) => {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = await res.arrayBuffer();
      const blob = new Blob([buf], { type: res.headers.get('content-type') || 'application/octet-stream' });
      const obj = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = obj;
      a.download = sanitizeFileName(filename) || 'audio.mp3';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(obj);
      return true;
    } catch {
      try {
        const a = document.createElement('a');
        a.href = url;
        a.target = '_blank';
        a.rel = 'noreferrer';
        a.download = sanitizeFileName(filename) || 'audio.mp3';
        document.body.appendChild(a);
        a.click();
        a.remove();
        return true;
      } catch {
        return false;
      }
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
    return pickFirst(
      a?.thumbnailUrl,
      b?.thumbnailUrl,
      a?.thumbnail_url,
      b?.thumbnail_url,
      a?.posterUrl,
      b?.posterUrl,
      a?.poster_url,
      b?.poster_url,
      a?.imageUrl,
      b?.imageUrl,
      a?.image_url,
      b?.image_url,
      a?.coverUrl,
      b?.coverUrl,
      a?.cover_url,
      b?.cover_url
    );
  };

  const preloadVideoThumbs = async (tasks: Array<{ taskId: string }>) => {
    const ids = tasks
      .map((x) => x.taskId)
      .filter((id) => id && !videoThumbs[id])
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

  useEffect(() => {
    if (activeTab !== 'video') return;
    loadVideos().catch(() => {});
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== 'video') return;
    preloadVideoThumbs(videoTasks).catch(() => {});
  }, [activeTab, videoTasks]);

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
    { id: 'vibes', label: 'Vibes' },
    { id: 'listas', label: 'Carpetas' },
  ];

  return (
    <div className="flex-1 min-h-0 flex flex-col pt-2 relative">
      <div className="p-4 space-y-4">
        {/* Top Filters (Me gusta, Publicado, Filtros) */}
        {activeTab === 'canciones' && (
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
            <button className="flex-shrink-0 bg-white/5 border border-white/10 text-white px-4 py-2 rounded-full text-sm hover:bg-white/10 transition-colors">
              Me gusta
            </button>
            <button className="flex-shrink-0 bg-white/5 border border-white/10 text-white px-4 py-2 rounded-full text-sm hover:bg-white/10 transition-colors">
              Publicado
            </button>
            <button
              onClick={() => {
                setActiveTab('video');
                loadVideos().catch(() => {});
              }}
              className="flex-shrink-0 bg-white/5 border border-white/10 text-white px-4 py-2 rounded-full text-sm hover:bg-white/10 transition-colors flex items-center gap-2"
            >
              <Video className="w-4 h-4" /> Video
            </button>
            <button
              onClick={() => setIsFiltersOpen(true)}
              className="flex-shrink-0 bg-white/5 border border-white/10 text-white px-4 py-2 rounded-full text-sm hover:bg-white/10 transition-colors flex items-center gap-2"
            >
              <Settings2 className="w-4 h-4" /> Filtros
            </button>
            <button
              onClick={() => {
                setShowTrash((v) => !v);
                onRefreshSongs?.();
              }}
              className={cn(
                "flex-shrink-0 bg-white/5 border border-white/10 text-white px-4 py-2 rounded-full text-sm hover:bg-white/10 transition-colors flex items-center gap-2",
                showTrash ? "border-red-400/40 text-red-200" : ""
              )}
            >
              <Trash2 className="w-4 h-4" /> {showTrash ? "Biblioteca" : "Papelera"}
            </button>
            {!showTrash && (
              <button
                onClick={() => createFolderQuick()}
                className="flex-shrink-0 bg-gradient-to-r from-indigo-500/20 via-purple-500/10 to-fuchsia-500/10 border border-white/10 text-white px-4 py-2 rounded-full text-sm hover:bg-white/10 transition-colors flex items-center gap-2"
                title="Crear carpeta"
              >
                <FolderPlus className="w-4 h-4" /> + Carpeta
              </button>
            )}
          </div>
        )}

        {/* Navigation Tabs - Mobile mostly, but hidden on desktop since sidebar covers it */}
        <div className="flex md:hidden border-b border-white/5 space-x-6 overflow-x-auto no-scrollbar">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "py-3 text-sm font-medium relative whitespace-nowrap transition-colors",
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
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
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
                  const shortId = v.taskId.length > 18 ? `${v.taskId.slice(0, 10)}…${v.taskId.slice(-6)}` : v.taskId;
                  const thumb = (videoThumbs[v.taskId] || '').toString().trim();
                  return (
                    <div key={v.taskId} className="glass-card rounded-2xl p-4 border border-white/10 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-[84px] h-[56px] rounded-xl overflow-hidden bg-white/5 border border-white/10 shrink-0">
                          {thumb ? (
                            <img src={thumb} alt="Miniatura" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-slate-500">
                              <Video className="w-5 h-5" />
                            </div>
                          )}
                        </div>
                        <div className="text-white font-bold truncate">Video</div>
                        <div className="min-w-0">
                          <div className="text-white font-bold truncate">Video</div>
                          <div className="text-xs text-slate-400 truncate">TaskId: {shortId}</div>
                          {dateText ? <div className="text-[11px] text-slate-500 mt-1">{dateText}</div> : null}
                        </div>
                      </div>
                      <div className="shrink-0 flex items-center gap-2">
                        <button
                          onClick={() => {
                            navigator.clipboard
                              .writeText(v.taskId)
                              .then(() => alert('TaskId copiado.'))
                              .catch(() => alert('No pude copiar el TaskId.'));
                          }}
                          className="bg-white/5 border border-white/10 rounded-full px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/10 transition-colors"
                        >
                          Copiar
                        </button>
                        <button
                          onClick={() => openVideoByTaskId(v.taskId).catch(() => {})}
                          className="bg-emerald-500 hover:bg-emerald-400 text-black rounded-full px-3 py-2 text-xs font-extrabold transition-colors"
                        >
                          Abrir
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'vibes' && (
          <div className="p-4 grid grid-cols-2 gap-4">
            <div 
              onClick={() => setIsCreateVibeOpen(true)}
              className="w-full aspect-square border border-dashed border-white/20 rounded-2xl flex items-center justify-center cursor-pointer hover:bg-white/5 transition-colors glass-card"
            >
              <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
                <Plus className="w-5 h-5 text-slate-300" />
              </div>
            </div>
            {vibes.map(vibe => (
              <div key={vibe.id} className="w-full aspect-square glass-card rounded-2xl p-3 flex flex-col items-center justify-center text-center hover:bg-white/5 transition-colors">
                <div className="w-12 h-12 rounded-full bg-indigo-500/20 mb-3 flex items-center justify-center">
                  <ImageIcon className="w-6 h-6 text-indigo-400" />
                </div>
                <div className="text-sm font-bold text-white truncate w-full">{vibe.name}</div>
                <div className="text-xs text-slate-400 truncate w-full mt-1">{vibe.description}</div>
              </div>
            ))}
          </div>
        )}
        
        {activeTab === 'canciones' && (
          <div className="p-4 space-y-4">
            {/* Search Bar */}
            <div className="relative">
               <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
               <input 
                 type="text" 
                 placeholder="Buscar" 
                 className="w-full bg-white/5 border border-white/5 rounded-full py-2.5 pl-10 pr-4 text-sm text-white placeholder:text-slate-500 outline-none focus:border-white/20 transition-colors"
               />
            </div>

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
                        onClick={() => onRefreshSongs?.()}
                        className="bg-white/5 border border-white/10 rounded-full px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-white/10 transition-colors"
                      >
                        Actualizar
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
                            <div className="text-sm font-extrabold text-slate-100">{pct}%</div>
                          </div>
                        </div>
                        <div className="flex-1 min-w-0 pt-1">
                          <div className="h-3 w-[70%] bg-white/10 rounded-full animate-pulse" />
                          <div className="h-3 w-[90%] bg-white/10 rounded-full mt-3 animate-pulse" />
                        </div>
                      </div>
                    );
                  };
                  const n = expectedTracksForKind(first?.kind || 'generate');
                  return <>{Array.from({ length: n }, (_, i) => i).map(row)}</>;
                })()}
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

            {(() => {
              const baseList = showTrash ? (cancionesEliminadas || []) : canciones;
              const fmt = (iso?: string) => {
                if (!iso) return '';
                const d = new Date(iso);
                if (Number.isNaN(d.getTime())) return '';
                return d.toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: '2-digit' });
              };
              const parseMs = (iso?: string) => {
                if (!iso) return null;
                const d = new Date(iso);
                const ms = d.getTime();
                return Number.isNaN(ms) ? null : ms;
              };
              const fromMs = filterFrom ? new Date(`${filterFrom}T00:00:00`).getTime() : null;
              const toMs = filterTo ? new Date(`${filterTo}T23:59:59.999`).getTime() : null;
              const folderNameById = new Map(folders.map((f) => [f.id, f.name]));
              const list = baseList
                .filter((song) => {
                  if (!filterFrom && !filterTo) return true;
                  const ms = parseMs(song.createdAt);
                  if (fromMs !== null && (ms === null || ms < fromMs)) return false;
                  if (toMs !== null && (ms === null || ms > toMs)) return false;
                  return true;
                })
                .slice()
                .sort((a, b) => {
                  const am = parseMs(a.createdAt) ?? 0;
                  const bm = parseMs(b.createdAt) ?? 0;
                  if (am !== bm) return sortOrder === 'oldest' ? am - bm : bm - am;
                  return String(a.title || '').localeCompare(String(b.title || ''), 'es');
                });

              if (list.length === 0) {
                return (
                  <div className="p-6 text-center text-slate-500 text-sm mt-10">
                    <div>{showTrash ? 'No hay canciones eliminadas' : 'No hay canciones'}</div>
                    {!showTrash && (
                      <button
                        onClick={() => onRefreshSongs?.()}
                        className="mt-4 bg-white/5 hover:bg-white/10 border border-white/10 px-4 py-2 rounded-full text-xs text-slate-200 transition-colors"
                      >
                        Actualizar
                      </button>
                    )}
                  </div>
                );
              }
              return (
                list.map(song => (
                  <div key={song.id} className="flex items-start gap-4 p-2 rounded-xl hover:bg-white/5 transition-colors group">
                    {/* Thumbnail */}
                    <div className="relative w-16 h-16 rounded-md overflow-hidden bg-slate-800 shrink-0 cursor-pointer" onClick={() => !showTrash && onPlaySong(song)}>
                      <img src={(song.coverUrl || `https://picsum.photos/seed/${song.id}/150/150`).toString()} alt="Cover" className="w-full h-full object-cover" />
                      <div className="absolute bottom-1 right-1 bg-black/60 px-1 text-[10px] rounded font-medium">4:22</div>
                      {(() => {
                        const isUploaded =
                          !song.isCover &&
                          !song.sunoTaskId &&
                          !song.sunoAudioId &&
                          Boolean(song.audioUrl) &&
                          String(song.coverUrl || '').startsWith('data:image/svg+xml');
                        if (song.isCover) {
                          return <div className="absolute top-1 left-1 bg-white/10 px-1 rounded text-[8px] font-bold">COVER</div>;
                        }
                        if (isUploaded) {
                          return <div className="absolute top-1 left-1 bg-emerald-500/20 border border-emerald-400/20 px-1 rounded text-[8px] font-bold text-emerald-200">SUBIDO</div>;
                        }
                        return null;
                      })()}
                      {!showTrash && (
                        <div className={cn(
                          "absolute inset-0 bg-black/40 flex items-center justify-center transition-opacity",
                          activeSongId === song.id && isPlaying ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                        )}>
                          {activeSongId === song.id && isPlaying ? (
                            <Pause className="w-6 h-6 text-white" />
                          ) : (
                            <Play className="w-6 h-6 text-white ml-1" />
                          )}
                        </div>
                      )}
                    </div>
                    
                    {/* Info */}
                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-sm font-bold truncate">{song.title}</h3>
                        <span className="shrink-0 bg-green-500/20 text-green-400 text-[9px] font-bold px-1.5 py-0.5 rounded">V5</span>
                        <span className="shrink-0 bg-white/10 text-slate-300 text-[9px] font-medium px-1.5 py-0.5 rounded">{song.isCover ? 'Cover' : 'Canción'}</span>
                        {(() => {
                          const fid = songFolderId[song.id] || '';
                          const name = fid ? folderNameById.get(fid) : '';
                          if (!name) return null;
                          return <span className="shrink-0 bg-white/5 border border-white/10 text-slate-200 text-[9px] font-semibold px-1.5 py-0.5 rounded">📁 {name}</span>;
                        })()}
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs text-slate-400 truncate">{song.genre || ' '} </p>
                        {!showTrash ? (
                          <p className="text-[11px] text-slate-500 shrink-0">{song.createdAt ? `Creada ${fmt(song.createdAt)}` : ''}</p>
                        ) : (
                          <div className="shrink-0 text-right leading-tight">
                            <div className="text-[11px] text-slate-500">{song.createdAt ? `Creada ${fmt(song.createdAt)}` : ''}</div>
                            <div className="text-[11px] text-red-300/80">{song.deletedAt ? `Eliminada ${fmt(song.deletedAt)}` : ''}</div>
                          </div>
                        )}
                      </div>
                      
                      {/* Actions */}
                      {!showTrash && (
                        <div className="flex items-center gap-2 mt-2">
                          <button
                            onClick={() => setMenuSong(song)}
                            className={cn(
                              "border px-3 py-1 rounded-full text-xs transition-colors",
                              song.isPublic
                                ? "bg-emerald-500/15 hover:bg-emerald-500/20 border-emerald-500/20 text-emerald-200"
                                : "bg-white/5 hover:bg-white/10 border-white/10 text-slate-200"
                            )}
                          >
                            {song.isPublic ? 'Público' : 'Privado'}
                          </button>
                          <button className="w-7 h-7 rounded-full flex items-center justify-center bg-white/5 hover:bg-white/10 transition-colors">
                            <ThumbsUp className="w-3.5 h-3.5 text-slate-300" />
                          </button>
                          <button className="w-7 h-7 rounded-full flex items-center justify-center bg-white/5 hover:bg-white/10 transition-colors">
                            <Share2 className="w-3.5 h-3.5 text-slate-300" />
                          </button>
                          <button className="w-7 h-7 rounded-full flex items-center justify-center bg-white/5 hover:bg-white/10 transition-colors">
                            <Download className="w-3.5 h-3.5 text-slate-300" />
                          </button>
                        </div>
                      )}
                    </div>
                    
                    {/* Options Menu */}
                    <button
                      onClick={() => setMenuSong(song)}
                      className="w-8 h-8 rounded-full flex items-center justify-center bg-white/5 hover:bg-white/10 transition-colors shrink-0"
                      aria-label="Opciones"
                    >
                      <MoreVertical className="w-4 h-4 text-slate-400" />
                    </button>
                  </div>
                ))
              );
            })()}
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
                            <img src={(song.coverUrl || `https://picsum.photos/seed/${song.id}/150/150`).toString()} alt="Cover" className="w-full h-full object-cover" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-white font-bold truncate">{song.title || 'Pista sin título'}</div>
                            <div className="text-slate-400 text-xs truncate">{song.genre || ' '}</div>
                          </div>
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setMenuSong(song);
                            }}
                            className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-200 hover:bg-white/10"
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

      {menuSong && (
        <SongOptionsSheet
          song={menuSong}
          onClose={() => setMenuSong(null)}
          isDeleted={showTrash}
          onPlay={() => onPlaySong(menuSong)}
          onStartCover={() => onStartCover?.(menuSong)}
          onOpenLists={() => setActiveTab('listas')}
          onMoveToFolder={() => {
            setMoveFolderSong(menuSong);
            setMenuSong(null);
          }}
          onRefreshSongs={onRefreshSongs}
          onRestore={() => {
            const id = menuSong.id;
            setMenuSong(null);
            onRestoreSong?.(id);
          }}
          onDelete={() => {
            const id = menuSong.id;
            setMenuSong(null);
            onDeleteSong?.(id);
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
            }}
            aria-label="Cerrar"
          />
          <div className="relative w-full md:max-w-[720px] glass-panel rounded-t-3xl md:rounded-3xl overflow-hidden max-h-[92vh] flex flex-col shadow-[0_-20px_60px_rgba(0,0,0,0.55)]">
            <div className="p-4 border-b border-white/10 flex items-center justify-between shrink-0 bg-gradient-to-r from-indigo-500/20 via-purple-500/10 to-fuchsia-500/10">
              <div className="text-white font-extrabold truncate">{downloadsModalTitle || 'Descarga'}</div>
              <button
                onClick={() => {
                  setDownloadsModalOpen(false);
                  setDownloadsModalItems([]);
                  setDownloadsModalError('');
                }}
                className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-200"
              >
                ✕
              </button>
            </div>

            <div className="p-4 flex-1 overflow-y-auto overscroll-contain">
              <div className="text-slate-400 text-xs">{downloadsModalTaskId ? `TaskId: ${downloadsModalTaskId}` : ' '}</div>
              <div className="mt-1 text-slate-500 text-xs">{downloadsModalKind ? `Tipo: ${downloadsModalKind}` : ' '}</div>

              {downloadsModalBusy ? (
                <div className="mt-6 text-slate-400 text-sm">Cargando…</div>
              ) : downloadsModalError ? (
                <div className="mt-6 text-red-200 text-sm">{downloadsModalError}</div>
              ) : downloadsModalItems.length === 0 ? (
                <div className="mt-6 text-slate-400 text-sm">No hay pistas para mostrar.</div>
              ) : (
                <>
                  <div className="mt-3 flex items-center gap-2 flex-wrap">
                    <button
                      className="bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-100 border border-indigo-400/20 px-4 py-2 rounded-full text-sm font-semibold transition-colors disabled:opacity-50"
                      disabled={downloadsModalItems.length === 0}
                      onClick={async () => {
                        const text = downloadsModalItems.map((x) => `${x.label}: ${x.url}`).join('\n');
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
                      className="bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-100 border border-emerald-400/20 px-4 py-2 rounded-full text-sm font-semibold transition-colors disabled:opacity-50"
                      disabled={downloadsModalItems.length === 0}
                      onClick={() => {
                        const base = sanitizeFileName(downloadsModalTitle || 'stems');
                        downloadsModalItems.forEach((x) => {
                          const name = sanitizeFileName(`${base} - ${x.label}.mp3`);
                          downloadToDevice(x.url, name).catch(() => {});
                        });
                      }}
                    >
                      Descargar todo
                    </button>
                    <button
                      className="bg-white/5 hover:bg-white/10 text-slate-200 border border-white/10 px-4 py-2 rounded-full text-sm font-semibold transition-colors"
                      onClick={() => removeCompletedDownload(downloadsModalTaskId)}
                      disabled={!downloadsModalTaskId}
                    >
                      Marcar como listo
                    </button>
                  </div>

                  {downloadsModalSaving && <div className="mt-3 text-slate-400 text-xs">Guardando en Biblioteca…</div>}

                  <div className="mt-4 space-y-2">
                    {downloadsModalItems.map((it) => (
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
                            className="bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-100 border border-indigo-400/20 px-3 py-2 rounded-full text-xs font-semibold transition-colors"
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
                            className="bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-100 border border-emerald-400/20 px-3 py-2 rounded-full text-xs font-semibold transition-colors"
                            onClick={() => {
                              const base = sanitizeFileName(downloadsModalTitle || 'stems');
                              const name = sanitizeFileName(`${base} - ${it.label}.mp3`);
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
  onPlay,
  onStartCover,
  onOpenLists,
  onMoveToFolder,
  onRestore,
  onDelete,
  onRefreshSongs,
}: {
  song: SongItem;
  onClose: () => void;
  isDeleted: boolean;
  onPlay: () => void;
  onStartCover?: () => void;
  onOpenLists?: () => void;
  onMoveToFolder?: () => void;
  onRestore: () => void;
  onDelete: () => void;
  onRefreshSongs?: () => void;
}) {
  const [isBusy, setIsBusy] = useState(false);
  const [published, setPublished] = useState(Boolean((song as any)?.isPublic));
  const [showPublish, setShowPublish] = useState(false);
  const [publishGenre, setPublishGenre] = useState<string>(((song as any)?.publicGenre || '').toString());
  const [isPinnedToProfile, setIsPinnedToProfile] = useState(false);
  const [showPersonaSave, setShowPersonaSave] = useState(false);
  const [showLyrics, setShowLyrics] = useState(false);
  const [lyricsText, setLyricsText] = useState<string>(((song as any)?.lyrics || '').toString());
  const [lyricsBusy, setLyricsBusy] = useState(false);
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
  useEffect(() => {
    setPublished(Boolean((song as any)?.isPublic));
    setPublishGenre(((song as any)?.publicGenre || '').toString());
    setShowPublish(false);
    setIsPinnedToProfile(false);
    let alive = true;
    (async () => {
      if (isDeleted) return;
      const sid = (song?.id || '').toString().trim();
      if (!sid) return;
      const t = await getAccessToken();
      if (!t.ok) return;
      const r = await fetch('/api/profile/pins', { headers: { authorization: `Bearer ${t.token}` } });
      const out = await r.json().catch(() => ({}));
      if (!r.ok || out?.ok === false) return;
      const items = Array.isArray(out?.items) ? out.items : [];
      const pinned = items.some((x: any) => String(x?.songId || x?.song_id || '').trim() === sid);
      if (!alive) return;
      setIsPinnedToProfile(pinned);
    })().catch(() => {});
    return () => {
      alive = false;
    };
  }, [song?.id, isDeleted]);

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
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      const w = Math.max(0, Math.floor(r.width));
      const h = Math.max(0, Math.floor(r.height));
      setTrimWaveSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
    });
    ro.observe(el);
    const r = el.getBoundingClientRect();
    setTrimWaveSize({ w: Math.max(0, Math.floor(r.width)), h: Math.max(0, Math.floor(r.height)) });
    return () => {
      try {
        ro.disconnect();
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
  }, [showTrim, song?.audioUrl]);
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
    const url = (song.audioUrl || '').toString().trim();
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
  }, [showTrim, song?.audioUrl, trimDurationSec, trimWaveSize.w]);
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
    const taskId = (song?.sunoTaskId || '').toString().trim();
    if (!taskId) return false;
    const audioId = (song?.sunoAudioId || '').toString().trim();
    if (audioId.startsWith('stem_')) return false;
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
      doc.text('RAMBER Tunes', margin + 14, margin + 32);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(muted.r, muted.g, muted.b);
      doc.text('Commercial License Certificate', margin + 14, margin + 48);

      y = margin + 84;
      doc.setTextColor(accent.r, accent.g, accent.b);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13.5);
      doc.text('CERTIFICADO DE LICENCIA COMERCIAL - RAMBER TUNES AI MUSIC', margin + 14, y);

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
        'RAMBER Tunes AI Music, en su calidad de Licenciante, otorga al Licenciatario arriba mencionado una licencia comercial mundial, perpetua, no exclusiva e intransferible para utilizar el Contenido Generado (Audio) descrito en este documento. Esta licencia permite la reproducción, distribución, streaming, sincronización y monetización de la obra en todas las plataformas digitales y medios físicos.',
        'II. PROPIEDAD Y DERECHOS DE AUTOR',
        'Letras: El Licenciatario conserva el 100% de la propiedad y los derechos de autor de cualquier letra original proporcionada para la creación de la obra.',
        'Composición de Audio: La composición musical y el archivo de audio generado se otorgan bajo licencia comercial ilimitada, respaldada por la suscripción profesional de RAMBER Tunes ante sus proveedores tecnológicos (Suno AI).',
        'III. VALIDEZ Y PERMANENCIA',
        'Esta licencia es legalmente vinculante siempre que el Licenciatario haya mantenido una suscripción activa (Plan Creador, Pro o similar) en la plataforma RAMBER Tunes al momento de la creación de la obra. Los derechos comerciales aquí otorgados son permanentes y no expiran aunque el usuario decida cancelar su suscripción en el futuro.',
        'IV. LIMITACIONES',
        'El Licenciatario reconoce que el contenido es generado por Inteligencia Artificial y que RAMBER Tunes no garantiza la exclusividad absoluta de las secuencias melódicas ante registros de propiedad intelectual de terceros, aunque se otorga el derecho de uso comercial total sobre el archivo específico generado.',
        'V. FIRMA DIGITAL',
        'Este documento ha sido generado electrónicamente y es válido sin firma manuscrita. Los registros de esta transacción y la validez de la membresía están archivados en los sistemas digitales de RAMBER Tunes.',
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
      doc.text('Documento generado electrónicamente por RAMBER Tunes AI Music', margin + 14, y + rowH + 18);
      doc.text(`Fecha de emisión: ${dateStr}`, margin + 14, y + rowH + 32);

      const file = `Licencia_RAMBER_${sanitizeFileName(songTitle) || 'Cancion'}.pdf`;
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
    const title = (song.title || 'Canción').toString();
    const shareUrl = song.id ? `${window.location.origin}/share/${encodeURIComponent(song.id)}` : '';
    try {
      if (navigator.share && shareUrl) {
        await navigator.share({
          title: `RAMBER Tunes - ${title}`,
          url: shareUrl,
        });
        return;
      }
    } catch {
    }
    if (shareUrl) {
      try {
        await navigator.clipboard.writeText(shareUrl);
        alert('Copiado al portapapeles.');
      } catch {
        alert(shareUrl);
      }
      return;
    }
    alert('No hay link para compartir.');
  };

  const togglePinToProfile = async () => {
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
      const next = !isPinnedToProfile;
      const r = await fetch('/api/profile/pin', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${t.token}` },
        body: JSON.stringify({ songId: sid, pin: next }),
      });
      const out = await r.json().catch(() => ({}));
      if (!r.ok || out?.ok === false) {
        const msg = (out?.error || out?.detail || 'No pude actualizar tu perfil.').toString();
        const hint = (out?.hint || '').toString();
        alert([msg, hint].filter(Boolean).join('\n\n'));
        return;
      }
      setIsPinnedToProfile(next);
      alert(next ? 'Listo. Se agregó a tu perfil.' : 'Listo. Se quitó de tu perfil.');
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
      const obj = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = obj;
      a.download = sanitizeDownloadName(filename) || 'audio';
      document.body.appendChild(a);
      a.click();
      a.remove();
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
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = await res.arrayBuffer();
      const blob = new Blob([buf], { type: res.headers.get('content-type') || 'application/octet-stream' });
      const obj = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = obj;
      a.download = sanitizeDownloadName(filename) || 'audio';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(obj);
      return true;
    } catch {
      try {
        const a = document.createElement('a');
        a.href = url;
        a.target = '_self';
        a.rel = 'noreferrer';
        a.download = sanitizeDownloadName(filename) || 'audio';
        document.body.appendChild(a);
        a.click();
        a.remove();
        return true;
      } catch {
        return false;
      }
    }
  };

  const makeTrimWavBlob = async () => {
    const url = (song.audioUrl || '').toString().trim();
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
          title: `RAMBER Tunes - ${base} (recorte)`,
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
        alert('Tu plan no incluye descargas.');
        return;
      }

      const url = (song.audioUrl || '').toString();
      if (!url) {
        alert('No hay audio para descargar.');
        return;
      }
      const base = sanitizeDownloadName(song.title || 'Cancion') || 'Cancion';
      await downloadToDevice(url, `${base}.mp3`);
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
        alert('Tu plan no incluye descargas.');
        return;
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
            : 'WAV solo está disponible para canciones generadas dentro de RAMBER Tunes.';
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
          alert('Este audio no se puede convertir a WAV (el proveedor no encontró el registro). Prueba con una canción generada dentro de RAMBER Tunes o una canción más reciente.');
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
        const status = String(provider?.data?.successFlag || provider?.data?.status || '').toUpperCase();

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
            ''
        ).trim();
        if (!wavUrl) {
          alert('La conversión terminó, pero no recibí el link del WAV.');
          return;
        }
        const base = sanitizeDownloadName(song.title || 'Cancion') || 'Cancion';
        await downloadToDevice(wavUrl, `${base}.wav`);
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
      try {
        await navigator.clipboard.writeText(mp4TaskId);
        alert(`Listo. Ya empecé el video.\n\nTaskId (copiado):\n${mp4TaskId}\n\nNo lo compartas.`);
      } catch {
        alert(`Listo. Ya empecé el video.\n\nTaskId:\n${mp4TaskId}\n\nNo lo compartas.`);
      }

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

      alert('El video está tardando. Intenta de nuevo en unos segundos.');
    } finally {
      setIsBusy(false);
    }
  };

  const separateStems = async (type: 'separate_vocal' | 'split_stem') => {
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
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(url);
        } catch {
        }

        if (!midiData || instruments.length === 0 || notes === 0) {
          alert(
            `El proveedor regresó MIDI vacío.\n\nPasa a veces (especialmente con split_stem).\n\nPrueba esto:\n1) En la lista de pistas, toca el botón “MIDI” de una pista específica (Voz, Drums, etc.).\n2) Si sigue vacío, intenta con otra canción o un audio más limpio.\n\nYa se descargó el JSON (y se copió si el navegador lo permitió).`
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

      if (personaPhoto && supabaseBrowser) {
        const s = await ensureAnonSession();
        if (s.ok) {
          const { data } = await supabaseBrowser.auth.getUser();
          const user = data?.user;
          if (user?.id) {
            const blob = await compressImage(personaPhoto);
            const path = `personas/${user.id}/${personaId}.webp`;
            const up = await supabaseBrowser.storage.from('ramber-tunes').upload(path, blob, {
              upsert: true,
              contentType: 'image/webp',
              cacheControl: '31536000',
            });
            if (!up.error) {
              const { data: pub } = supabaseBrowser.storage.from('ramber-tunes').getPublicUrl(path);
              const url = (pub?.publicUrl || '').toString();
              if (url) {
                await supabaseBrowser.from('suno_personas').update({ photo_url: url }).eq('persona_id', personaId).eq('user_id', user.id);
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

  const sheet = (
    <div className="fixed inset-0 z-[2147483647] flex items-end md:items-center justify-center bg-black/60" style={{ zIndex: 2147483647 }}>
      <button className="absolute inset-0 w-full h-full" onClick={onClose} aria-label="Cerrar" />
      <div className="relative w-full md:max-w-[520px] bg-[#0b0f16] border border-white/10 rounded-t-3xl md:rounded-3xl overflow-hidden shadow-[0_-20px_60px_rgba(0,0,0,0.6)] max-h-[92vh] flex flex-col">
        <div className="flex justify-center py-3 shrink-0">
          <div className="w-12 h-1 bg-white/20 rounded-full" />
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain pb-6">
        <div className="px-5 pb-4">
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 rounded-xl overflow-hidden bg-white/5 border border-white/10 shrink-0">
              <img src={(song.coverUrl || `https://picsum.photos/seed/${song.id}/200/200`).toString()} alt="Cover" className="w-full h-full object-cover" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-white font-extrabold text-lg truncate">{song.title || 'Pista sin título'}</div>
              <div className="text-slate-400 text-sm truncate">Ruben</div>
              <div className="text-slate-500 text-xs mt-1">{isDeleted ? `Eliminada: ${fmt(song.deletedAt || undefined)}` : `Creada: ${fmt(song.createdAt || undefined)}`}</div>
            </div>
            <button className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-300 hover:bg-white/10" onClick={onClose}>
              ✕
            </button>
          </div>
        </div>

        <div className="px-5 pb-4">
          <div className="grid grid-cols-3 gap-3">
            <button
              className="glass-card rounded-2xl p-4 text-left hover:bg-white/10 transition-colors"
              onClick={() => {
                onClose();
                onOpenLists?.();
              }}
            >
              <div className="flex items-center gap-3">
                <ListMusic className="w-5 h-5 text-slate-200" />
                <div className="text-slate-200 font-semibold text-sm">Agregar a lista</div>
              </div>
            </button>
            <button className="glass-card rounded-2xl p-4 text-left hover:bg-white/10 transition-colors" onClick={() => share().catch(() => {})}>
              <div className="flex items-center gap-3">
                <Share2 className="w-5 h-5 text-slate-200" />
                <div className="text-slate-200 font-semibold text-sm">Compartir</div>
              </div>
            </button>
            <button className="glass-card rounded-2xl p-4 text-left hover:bg-white/10 transition-colors" onClick={() => alert('Próximamente')}>
              <div className="flex items-center gap-3">
                <MessageCircle className="w-5 h-5 text-slate-200" />
                <div className="text-slate-200 font-semibold text-sm">Comentar</div>
              </div>
            </button>
          </div>
        </div>

        <div className="px-5 pb-5">
          <div className="glass-card rounded-2xl overflow-hidden">
            {!isDeleted && (
              <button
                className="w-full flex items-center gap-3 p-4 hover:bg-white/5 transition-colors border-b border-white/5 bg-gradient-to-r from-emerald-500/10 to-transparent"
                onClick={() => {
                  if (!song.audioUrl) {
                    alert('Esta canción no tiene audio para hacer cover.');
                    return;
                  }
                  onClose();
                  onStartCover?.();
                }}
                disabled={isBusy}
              >
                <Music2 className="w-5 h-5 text-emerald-300" /> <span className="text-slate-200 font-extrabold">Cover (nueva versión)</span>
              </button>
            )}
            {!isDeleted && (
              <button
                className="w-full flex items-center gap-3 p-4 hover:bg-white/5 transition-colors border-b border-white/5"
                onClick={() => onMoveToFolder?.()}
                disabled={isBusy}
              >
                <ListMusic className="w-5 h-5 text-slate-300" /> <span className="text-slate-200 font-semibold">Mover a carpeta</span>
              </button>
            )}
            {!isDeleted && (
              <>
                <button
                  className="w-full flex items-center gap-3 p-4 hover:bg-white/5 transition-colors border-t border-white/5 bg-gradient-to-r from-indigo-500/10 to-transparent"
                  onClick={() => generateCoverImage().catch(() => {})}
                  disabled={isBusy || !song.sunoTaskId}
                >
                  <ImageIcon className="w-5 h-5 text-indigo-300" /> <span className="text-slate-200 font-extrabold">Generar portada IA</span>
                </button>
                <button
                  className="w-full flex items-center gap-3 p-4 hover:bg-white/5 transition-colors border-t border-white/5 bg-gradient-to-r from-amber-500/10 to-transparent"
                  onClick={() => coverPhotoInputRef.current?.click()}
                  disabled={isBusy}
                >
                  <ImageIcon className="w-5 h-5 text-amber-300" /> <span className="text-slate-200 font-extrabold">Subir foto de portada</span>
                </button>
                <button
                  className="w-full flex items-center gap-3 p-4 hover:bg-white/5 transition-colors border-t border-white/5"
                  onClick={() => setShowCoverUrl(true)}
                  disabled={isBusy}
                >
                  <ImageIcon className="w-5 h-5 text-slate-300" /> <span className="text-slate-200 font-semibold">Pegar link (URL)</span>
                </button>
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
              </>
            )}
            <button
              className="w-full flex items-center gap-3 p-4 hover:bg-white/5 transition-colors border-t border-white/5"
              onClick={() => setShowPersonaSave(true)}
              disabled={isBusy || isDeleted}
            >
              <Sparkles className="w-5 h-5 text-slate-300" /> <span className="text-slate-200 font-semibold">Persona</span>
            </button>
          {!isDeleted && (
            <button
              className="w-full flex items-center justify-between gap-3 p-4 hover:bg-white/5 transition-colors border-t border-white/5"
              onClick={() => ensureCommercialPlanOrWarn().then((ok) => ok && setShowLicense(true))}
              disabled={isBusy}
            >
              <div className="flex items-center gap-3">
                <BadgeCheck className="w-5 h-5 text-slate-300" /> <span className="text-slate-200 font-semibold">Licencia Comercial</span>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500 text-black font-extrabold">CERTIFICADO</span>
            </button>
          )}
          </div>

          <div className="glass-card rounded-2xl overflow-hidden mt-4">
            <button
              className="w-full flex items-center gap-3 p-4 hover:bg-white/5 transition-colors"
              onClick={() => setShowLyrics(true)}
              disabled={isBusy}
            >
              <FileText className="w-5 h-5 text-slate-300" /> <span className="text-slate-200 font-semibold">Letra</span>
            </button>
            <button className="w-full flex items-center gap-3 p-4 hover:bg-white/5 transition-colors" onClick={share} disabled={isBusy}>
              <Share2 className="w-5 h-5 text-slate-300" /> <span className="text-slate-200 font-semibold">Compartir</span>
            </button>
            {!isDeleted && (
              <button
                className="w-full flex items-center gap-3 p-4 hover:bg-white/5 transition-colors border-t border-white/5"
                onClick={() => togglePinToProfile().catch(() => {})}
                disabled={isBusy}
              >
                <BadgeCheck className="w-5 h-5 text-slate-300" />{' '}
                <span className="text-slate-200 font-semibold">{isPinnedToProfile ? 'Quitar de mi perfil' : 'Añadir a mi perfil'}</span>
              </button>
            )}
            {!isDeleted && (
              <button
                className="w-full flex items-center gap-3 p-4 hover:bg-white/5 transition-colors border-t border-white/5"
                onClick={() => setShowTrim(true)}
                disabled={isBusy || !(song.audioUrl || '').toString().trim()}
              >
                <Scissors className="w-5 h-5 text-slate-300" /> <span className="text-slate-200 font-semibold">Recortar canción</span>
              </button>
            )}
            {!isDeleted && (
              <button className="w-full flex items-center gap-3 p-4 hover:bg-white/5 transition-colors border-t border-white/5" onClick={download} disabled={isBusy}>
                <Download className="w-5 h-5 text-slate-300" /> <span className="text-slate-200 font-semibold">Descargar</span>
              </button>
            )}
            {canShowWav && (
              <button className="w-full flex items-center gap-3 p-4 hover:bg-white/5 transition-colors border-t border-white/5" onClick={downloadWav} disabled={isBusy}>
                <Download className="w-5 h-5 text-slate-300" /> <span className="text-slate-200 font-semibold">Descargar WAV</span>
              </button>
            )}
            {!isDeleted && (
              <button className="w-full flex items-center gap-3 p-4 hover:bg-white/5 transition-colors border-t border-white/5" onClick={() => openMp4Modal().catch(() => {})} disabled={isBusy}>
                <Video className="w-5 h-5 text-slate-300" /> <span className="text-slate-200 font-semibold">Video (MP4)</span>
              </button>
            )}
            {!isDeleted && (
              <button className="w-full flex items-center gap-3 p-4 hover:bg-white/5 transition-colors border-t border-white/5" onClick={() => separateStems('separate_vocal').catch(() => {})} disabled={isBusy}>
                <AudioLines className="w-5 h-5 text-slate-300" /> <span className="text-slate-200 font-semibold">Eliminar voz (Karaoke)</span>
              </button>
            )}
            {!isDeleted && (
              <button className="w-full flex items-center gap-3 p-4 hover:bg-white/5 transition-colors border-t border-white/5" onClick={() => separateStems('split_stem').catch(() => {})} disabled={isBusy}>
                <AudioLines className="w-5 h-5 text-slate-300" /> <span className="text-slate-200 font-semibold">Instrumentos y voces (Stems)</span>
              </button>
            )}
            <button className="w-full flex items-center gap-3 p-4 hover:bg-white/5 transition-colors border-t border-white/5" onClick={() => alert('Reporte enviado.')} disabled={isBusy}>
              <Flag className="w-5 h-5 text-slate-300" /> <span className="text-slate-200 font-semibold">Reportar</span>
            </button>
            {!isDeleted && (
              <button
                className="w-full flex items-center justify-between gap-3 p-4 hover:bg-white/5 transition-colors border-t border-white/5"
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
                  <Pencil className="w-5 h-5 text-slate-300" /> <span className="text-slate-200 font-semibold">{published ? 'Público' : 'Privado'}</span>
                </div>
                <div className={cn("w-12 h-7 rounded-full p-1 transition-colors", published ? "bg-emerald-500" : "bg-white/10")}>
                  <div className={cn("w-5 h-5 rounded-full bg-white transition-transform", published ? "translate-x-5" : "translate-x-0")} />
                </div>
              </button>
            )}
          </div>

          {isDeleted ? (
            <button
              className="w-full mt-4 glass-card rounded-2xl p-4 flex items-center gap-3 text-emerald-300 hover:bg-emerald-500/10 transition-colors"
              onClick={() => onRestore()}
              disabled={isBusy}
            >
              <Repeat2 className="w-5 h-5" /> <span className="font-extrabold">Recuperar</span>
            </button>
          ) : (
            <button
              className="w-full mt-4 glass-card rounded-2xl p-4 flex items-center gap-3 text-red-400 hover:bg-red-500/10 transition-colors"
              onClick={() => {
                if (confirm('¿Seguro que quieres eliminar esta canción?')) onDelete();
              }}
              disabled={isBusy}
            >
              <Trash2 className="w-5 h-5" /> <span className="font-extrabold">Eliminar</span>
            </button>
          )}

          <button
            className="w-full mt-3 bg-white/5 border border-white/10 rounded-full py-3 text-slate-200 font-semibold hover:bg-white/10 transition-colors"
            onClick={onPlay}
            disabled={isBusy}
          >
            Reproducir
          </button>
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
                className="w-full bg-emerald-500 hover:bg-emerald-400 text-black h-[46px] rounded-full font-extrabold text-sm transition-colors disabled:opacity-60"
              >
                Publicar
              </button>
              <div className="text-[11px] text-slate-500">Por defecto, tus canciones son privadas. Solo se verán en Inicio si las publicas.</div>
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
                  className="w-full bg-emerald-500 hover:bg-emerald-400 rounded-full h-[46px] text-black font-extrabold"
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
              <audio ref={trimAudioRef} src={(song.audioUrl || '').toString()} preload="metadata" crossOrigin="anonymous" className="hidden" />
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
                            <div className={cn("absolute -top-12 left-1/2 -translate-x-1/2 bg-white text-black px-3 py-1 rounded-full font-extrabold text-sm", trimDrag === 'start' ? "opacity-100" : "opacity-0 md:opacity-100")}>
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
                            <div className={cn("absolute -top-12 left-1/2 -translate-x-1/2 bg-white text-black px-3 py-1 rounded-full font-extrabold text-sm", trimDrag === 'end' ? "opacity-100" : "opacity-0 md:opacity-100")}>
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
                  className="w-full bg-gradient-to-r from-yellow-300 to-amber-300 hover:opacity-95 text-black h-[48px] rounded-full font-extrabold text-sm transition-colors disabled:opacity-60"
                >
                  {trimBusy ? 'Preparando…' : 'Descargar'}
                </button>
                <button
                  onClick={() => shareTrim().catch(() => {})}
                  disabled={trimBusy || !(Number(trimDurationSec || 0) > 0)}
                  className="w-full bg-gradient-to-r from-indigo-400 to-fuchsia-400 hover:opacity-95 text-black h-[48px] rounded-full font-extrabold text-sm transition-colors disabled:opacity-60"
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
                  className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-black h-[46px] rounded-full font-extrabold text-sm transition-colors"
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
                    <div className="mt-1 text-[11px] text-slate-500 break-words">{licensePdfName || 'Licencia_RAMBER.pdf'}</div>
                  </div>
                  <div className="mt-4 bg-black/20 border border-white/10 rounded-2xl overflow-hidden">
                    <iframe title="Certificado RAMBER Tunes" src={licensePdfUrl} className="w-full h-[62vh] bg-black" />
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
                  className="w-full bg-emerald-500 hover:bg-emerald-400 text-black h-[48px] rounded-full font-extrabold text-sm transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
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
                    className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-black h-[48px] rounded-full font-extrabold text-sm transition-colors flex items-center justify-center"
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
                {mp4WatermarkDisabled ? 'Marca de agua: sin RAMBER Tunes (Plan Productor).' : 'Marca de agua: RAMBER Tunes.'}
              </div>
              <button
                onClick={() => {
                  const a = mp4Author;
                  setShowMp4(false);
                  createMp4(a).catch(() => {});
                }}
                disabled={isBusy}
                className="w-full bg-white text-black h-[48px] rounded-full font-extrabold text-sm transition-colors disabled:opacity-60"
              >
                Crear video
              </button>
              <div className="text-[11px] text-slate-500">El video se guarda 15 días en el proveedor.</div>
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
                className="w-full bg-white text-black h-[48px] rounded-full font-extrabold text-sm transition-colors disabled:opacity-60"
              >
                Guardar portada
              </button>
              <div className="text-[11px] text-slate-500">
                El link debe ser público. La app guardará la imagen permanente en RAMBER Tunes (bucket covers).
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(sheet, document.body);
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
                  localSort === 'newest' ? 'bg-white text-black' : 'bg-white/5 text-slate-200 hover:bg-white/10'
                )}
              >
                Más nuevo
              </button>
              <button
                onClick={() => setLocalSort('oldest')}
                className={cn(
                  'flex-1 h-[46px] rounded-2xl border border-white/10 font-extrabold text-sm',
                  localSort === 'oldest' ? 'bg-white text-black' : 'bg-white/5 text-slate-200 hover:bg-white/10'
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
            className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-black h-[48px] rounded-full font-extrabold text-sm transition-colors"
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
              !currentFolderId ? 'bg-white text-black border-white' : 'bg-white/5 text-slate-200 border-white/10 hover:bg-white/10'
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
                currentFolderId === f.id ? 'bg-white text-black border-white' : 'bg-white/5 text-slate-200 border-white/10 hover:bg-white/10'
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
              className="mt-3 w-full bg-emerald-500 hover:bg-emerald-400 text-black h-[46px] rounded-full font-extrabold text-sm transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
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
            className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-black h-[48px] rounded-full font-extrabold text-sm transition-colors disabled:opacity-60"
          >
            Crear
          </button>
        </div>
      </div>
    </div>
  );
}
