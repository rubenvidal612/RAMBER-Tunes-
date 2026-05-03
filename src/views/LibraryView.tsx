import { useEffect, useState } from 'react';
import { type LibraryTab, type SongItem, type VibeItem } from '@/types';
import { cn } from '@/lib/utils';
import { Sparkles, Plus, Image as ImageIcon, ChevronDown, Play, Pause, ThumbsUp, Settings2, Search, MoreVertical, Share2, Download, Trash2, Flag, Pencil, AudioLines, Repeat2, Sparkle, MessageCircle, AppWindow, Music2, FileText } from 'lucide-react';
import { ensureAnonSession, getAccessToken, supabaseBrowser } from '@/lib/supabaseBrowser';

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
}

export function LibraryView({ canciones, cancionesEliminadas, vibes, onAddVibe, onPlaySong, onDeleteSong, onRestoreSong, onRefreshSongs, activeSongId, isPlaying }: LibraryViewProps) {
  const [activeTab, setActiveTab] = useState<LibraryTab>('canciones');
  const [isCreateVibeOpen, setIsCreateVibeOpen] = useState(false);
  const [isCreateListOpen, setIsCreateListOpen] = useState(false);
  const [menuSong, setMenuSong] = useState<SongItem | null>(null);
  const [showTrash, setShowTrash] = useState(false);
  const [pendingTasks, setPendingTasks] = useState<Array<{ taskId: string; kind: string; startedAt: number; providerStatus?: string; progressPct?: number }>>([]);

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

  const expectedTracksForKind = (kind: string) => {
    const k = (kind || '').toLowerCase();
    if (k === 'generate') return 2;
    return 1;
  };
  
  const tabs: {id: LibraryTab, label: string}[] = [
    { id: 'canciones', label: 'Canciones' },
    { id: 'video', label: 'Video' },
    { id: 'vibes', label: 'Vibes' },
    { id: 'listas', label: 'Listas' },
  ];

  return (
    <div className="flex-1 flex flex-col pt-2 relative">
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
            <button className="flex-shrink-0 bg-white/5 border border-white/10 text-white px-4 py-2 rounded-full text-sm hover:bg-white/10 transition-colors flex items-center gap-2">
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

      <div className="flex-1 overflow-y-auto">
        {activeTab === 'video' && (
          <div className="h-full flex flex-col items-center justify-center p-6 text-center mt-[-40px]">
            <div className="w-24 h-24 mb-6 text-slate-500 opacity-50 relative flex items-center justify-center">
              <div className="w-16 h-12 border-2 border-current rounded-t-md border-b-0 space-y-1 p-2">
                 <div className="w-2 h-0.5 bg-current rounded-full" />
              </div>
              <div className="absolute top-0 flex gap-2">
                <div className="w-1 h-3 bg-current rounded-full rotate-[-30deg] -ml-4" />
                <div className="w-1 h-4 bg-current rounded-full -mt-2" />
                <div className="w-1 h-3 bg-current rounded-full rotate-[30deg] -mr-4" />
              </div>
            </div>
            <p className="text-slate-400 font-medium text-sm mb-6 max-w-[240px]">
              Aún no tienes proyectos. ¡Comienza a crear tu primer MV!
            </p>
            <button className="bg-gradient-to-r from-indigo-500 to-purple-600 hover:opacity-90 active:scale-95 transition-all text-white font-bold uppercase tracking-wider text-sm px-8 py-3.5 rounded-full flex items-center gap-2 shadow-lg shadow-indigo-500/20">
              <Sparkles className="w-4 h-4 text-white" strokeWidth={2} />
              Crear Ahora
            </button>
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
                 placeholder="Buscar por nombre de canci" 
                 className="w-full bg-white/5 border border-white/5 rounded-full py-2.5 pl-10 pr-4 text-sm text-white placeholder:text-slate-500 outline-none focus:border-white/20 transition-colors"
               />
            </div>

            {pendingTasks.length > 0 && !showTrash && (
              <div className="space-y-3">
                <div className="glass-card rounded-2xl p-4 border border-white/10">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-white font-bold truncate">
                        {(() => {
                          const first = pendingTasks[0];
                          const n = expectedTracksForKind(first?.kind || 'generate');
                          return n > 1 ? `Se están generando ${n} canciones…` : 'Se está generando tu canción…';
                        })()}
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
                  const pctBase = pctFromProvider !== null ? Math.max(3, Math.min(99, pctFromProvider)) : simulated;
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

            {(() => {
              const list = showTrash ? (cancionesEliminadas || []) : canciones;
              const fmt = (iso?: string) => {
                if (!iso) return '';
                const d = new Date(iso);
                if (Number.isNaN(d.getTime())) return '';
                return d.toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: '2-digit' });
              };

              if (list.length === 0) {
                return (
                  <div className="p-6 text-center text-slate-500 text-sm mt-10">
                    {showTrash ? 'No hay canciones eliminadas' : 'No hay canciones'}
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
                      <div className="absolute top-1 left-1 bg-white/10 px-1 rounded text-[8px] font-bold">{song.isCover ? 'COVER' : 'AI'}</div>
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
                          <button className="bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-1 rounded-full text-xs text-slate-200 transition-colors">
                            Publicar
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
            <button className="glass-card rounded-full px-4 py-2 flex items-center gap-2 text-sm text-slate-200 hover:bg-white/10 transition-colors w-max">
              <ThumbsUp className="w-4 h-4" /> Me gusta
            </button>
            
            <div className="grid grid-cols-2 gap-4">
              <div 
                onClick={() => setIsCreateListOpen(true)}
                className="w-full aspect-square border border-dashed border-white/20 rounded-2xl flex items-center justify-center cursor-pointer hover:bg-white/5 transition-colors glass-card"
              >
                <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
                  <Plus className="w-5 h-5 text-slate-300" />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {isCreateVibeOpen && (
        <CreateVibeModal onClose={() => setIsCreateVibeOpen(false)} canciones={canciones} onAddVibe={onAddVibe} />
      )}
      
      {isCreateListOpen && (
        <CreateListModal onClose={() => setIsCreateListOpen(false)} />
      )}

      {menuSong && (
        <SongOptionsSheet
          song={menuSong}
          onClose={() => setMenuSong(null)}
          isDeleted={showTrash}
          onPlay={() => onPlaySong(menuSong)}
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
    </div>
  );
}

function SongOptionsSheet({
  song,
  onClose,
  isDeleted,
  onPlay,
  onRestore,
  onDelete,
}: {
  song: SongItem;
  onClose: () => void;
  isDeleted: boolean;
  onPlay: () => void;
  onRestore: () => void;
  onDelete: () => void;
}) {
  const [isBusy, setIsBusy] = useState(false);
  const [published, setPublished] = useState(false);
  const [showPersonaSave, setShowPersonaSave] = useState(false);
  const [showLyrics, setShowLyrics] = useState(false);
  const [personaName, setPersonaName] = useState('');
  const [personaPhoto, setPersonaPhoto] = useState<File | null>(null);
  const fmt = (iso?: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: '2-digit' });
  };

  const share = async () => {
    const url = (song.audioUrl || '').toString();
    const title = (song.title || 'Canción').toString();
    try {
      if (navigator.share) {
        await navigator.share({ title, text: title, url: url || undefined });
        return;
      }
    } catch {
    }
    if (url) {
      try {
        await navigator.clipboard.writeText(url);
        alert('Copiado al portapapeles.');
      } catch {
        alert(url);
      }
      return;
    }
    alert('No hay link para compartir.');
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
      window.open(url, '_blank');
    } finally {
      setIsBusy(false);
    }
  };

  const compressImage = async (file: File) => {
    const bitmap = await createImageBitmap(file);
    const max = 256;
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
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No pude convertir imagen'))), 'image/webp', 0.78);
    });
    return blob;
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

  return (
    <div className="fixed inset-0 z-[120] flex items-end md:items-center justify-center bg-black/60">
      <button className="absolute inset-0 w-full h-full" onClick={onClose} aria-label="Cerrar" />
      <div className="relative w-full md:max-w-[520px] bg-[#0b0f16] border border-white/10 rounded-t-3xl md:rounded-3xl overflow-hidden shadow-[0_-20px_60px_rgba(0,0,0,0.6)]">
        <div className="flex justify-center py-3">
          <div className="w-12 h-1 bg-white/20 rounded-full" />
        </div>

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
            <button className="glass-card rounded-2xl p-4 text-left hover:bg-white/10 transition-colors" onClick={() => alert('Próximamente')}>
              <div className="flex items-center gap-3">
                <AppWindow className="w-5 h-5 text-slate-200" />
                <div className="text-slate-200 font-semibold text-sm">Agregar a apps</div>
              </div>
            </button>
            <button className="glass-card rounded-2xl p-4 text-left hover:bg-white/10 transition-colors" onClick={() => alert('Próximamente')}>
              <div className="flex items-center gap-3">
                <ThumbsUp className="w-5 h-5 text-slate-200" />
                <div className="text-slate-200 font-semibold text-sm">Me gusta</div>
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
            <button className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors" onClick={() => alert('Cover: Próximamente')}>
              <div className="flex items-center gap-3 text-slate-200 font-semibold">
                <AudioLines className="w-5 h-5 text-slate-300" /> Cover
              </div>
              <div className="text-slate-400 text-sm">V3.0</div>
            </button>
            <button className="w-full flex items-center gap-3 p-4 hover:bg-white/5 transition-colors border-t border-white/5" onClick={() => alert('Extender: Próximamente')}>
              <Pencil className="w-5 h-5 text-slate-300" /> <span className="text-slate-200 font-semibold">Extender</span>
            </button>
            <button className="w-full flex items-center gap-3 p-4 hover:bg-white/5 transition-colors border-t border-white/5" onClick={() => alert('Reutilizar: Próximamente')}>
              <Repeat2 className="w-5 h-5 text-slate-300" /> <span className="text-slate-200 font-semibold">Reutilizar</span>
            </button>
            <button className="w-full flex items-center gap-3 p-4 hover:bg-white/5 transition-colors border-t border-white/5" onClick={() => alert('Próximamente')}>
              <Sparkle className="w-5 h-5 text-slate-300" /> <span className="text-slate-200 font-semibold">Usar como inspiración</span>
              <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full bg-emerald-500 text-black font-extrabold">NUEVO</span>
            </button>
            <button className="w-full flex items-center gap-3 p-4 hover:bg-white/5 transition-colors border-t border-white/5" onClick={() => alert('Próximamente')}>
              <Music2 className="w-5 h-5 text-slate-300" /> <span className="text-slate-200 font-semibold">Samplear esta canción</span>
              <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full bg-emerald-500 text-black font-extrabold">NUEVO</span>
            </button>
            <button
              className="w-full flex items-center gap-3 p-4 hover:bg-white/5 transition-colors border-t border-white/5"
              onClick={() => setShowPersonaSave(true)}
              disabled={isBusy || isDeleted}
            >
              <Sparkles className="w-5 h-5 text-slate-300" /> <span className="text-slate-200 font-semibold">Persona</span>
            </button>
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
              <button className="w-full flex items-center gap-3 p-4 hover:bg-white/5 transition-colors border-t border-white/5" onClick={download} disabled={isBusy}>
                <Download className="w-5 h-5 text-slate-300" /> <span className="text-slate-200 font-semibold">Descargar</span>
              </button>
            )}
            <button className="w-full flex items-center gap-3 p-4 hover:bg-white/5 transition-colors border-t border-white/5" onClick={() => alert('Reporte enviado.')} disabled={isBusy}>
              <Flag className="w-5 h-5 text-slate-300" /> <span className="text-slate-200 font-semibold">Reportar</span>
            </button>
            {!isDeleted && (
              <button className="w-full flex items-center justify-between gap-3 p-4 hover:bg-white/5 transition-colors border-t border-white/5" onClick={() => setPublished(!published)} disabled={isBusy}>
              <div className="flex items-center gap-3">
                <Pencil className="w-5 h-5 text-slate-300" /> <span className="text-slate-200 font-semibold">Publicar</span>
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
            <div className="p-4">
              <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-sm text-slate-100 whitespace-pre-wrap max-h-[60vh] overflow-y-auto">
                {song.lyrics ? song.lyrics : 'Esta canción no tiene letra guardada.'}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
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

function CreateListModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  
  return (
    <div className="absolute inset-x-0 bottom-0 top-10 glass-panel border-t border-white/10 rounded-t-[2rem] overflow-y-auto z-50 animate-in slide-in-from-bottom-full duration-300 shadow-[0_-20px_50px_rgba(0,0,0,0.5)] flex flex-col pb-safe">
      <div className="flex justify-center py-4 sticky top-0 bg-transparent z-10 backdrop-blur-xl border-b border-white/5">
        <div className="w-12 h-1 bg-white/20 rounded-full" />
      </div>
      
      <div className="p-6 flex-1 flex flex-col gap-6">
        <h2 className="text-2xl font-bold text-white mb-2">Crear lista de reproducción</h2>

        <div className="space-y-3">
          <label className="text-sm font-bold text-slate-200 block uppercase tracking-wider">Nombre</label>
          <div className="relative">
            <input 
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ingresa el nombre de tu lista de reprodu..."
              className="w-full glass-card rounded-xl px-4 py-4 text-sm text-white placeholder:text-slate-500 outline-none focus:border-indigo-500/50 transition-colors"
            />
            <div className="text-right mt-1 text-xs text-slate-400">{name.length}/50</div>
          </div>
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
              (Mejor tamaño 175*175 px, máx. 500 KB)
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <label className="text-sm font-bold text-slate-200 block uppercase tracking-wider">Descripción</label>
          <div className="relative">
            <textarea 
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="Ingresa la descripción de tu lista de reproducción..."
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
          onClick={onClose}
          disabled={!name}
          className="flex-1 py-4 rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/20 text-white hover:opacity-90 font-bold flex items-center justify-center transition-all disabled:opacity-50 disabled:from-slate-700 disabled:to-slate-800 disabled:shadow-none"
        >
          Crear
        </button>
      </div>
    </div>
  );
}
