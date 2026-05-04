import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { type LibraryTab, type SongItem, type VibeItem } from '@/types';
import { cn } from '@/lib/utils';
import { Sparkles, Plus, Image as ImageIcon, ChevronDown, Play, Pause, ThumbsUp, Settings2, Search, MoreVertical, Share2, Download, Trash2, Flag, Pencil, AudioLines, Repeat2, Sparkle, MessageCircle, AppWindow, Music2, FileText, Video, BadgeCheck, Shield } from 'lucide-react';
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
          onStartCover={() => onStartCover?.(menuSong)}
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
    </div>
  );
}

function SongOptionsSheet({
  song,
  onClose,
  isDeleted,
  onPlay,
  onStartCover,
  onRestore,
  onDelete,
  onRefreshSongs,
}: {
  song: SongItem;
  onClose: () => void;
  isDeleted: boolean;
  onPlay: () => void;
  onStartCover?: () => void;
  onRestore: () => void;
  onDelete: () => void;
  onRefreshSongs?: () => void;
}) {
  const [isBusy, setIsBusy] = useState(false);
  const [published, setPublished] = useState(false);
  const [showPersonaSave, setShowPersonaSave] = useState(false);
  const [showLyrics, setShowLyrics] = useState(false);
  const [showStems, setShowStems] = useState(false);
  const [showMp4, setShowMp4] = useState(false);
  const [mp4Author, setMp4Author] = useState('');
  const [mp4WatermarkDisabled, setMp4WatermarkDisabled] = useState(false);
  const [showLicense, setShowLicense] = useState(false);
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

  const sanitizeFileName = (s: string) => (s || '').toString().replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 80);
  const closeLicenseModal = () => {
    if (licensePdfUrl) URL.revokeObjectURL(licensePdfUrl);
    setLicensePdfUrl('');
    setLicensePdfName('');
    setLicensePdfError('');
    setShowLicense(false);
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

      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(1);
      doc.rect(margin, margin, boxW, pageH - margin * 2);

      doc.setFillColor(250, 204, 21);
      doc.roundedRect(margin + 14, margin + 14, 40, 40, 10, 10, 'F');
      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(22);
      doc.text('R', margin + 34, margin + 44, { align: 'center' });

      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.text('RAMBER Tunes', margin + 64, margin + 36);
      doc.setFontSize(10);
      doc.setTextColor(160, 160, 160);
      doc.text('Commercial License Certificate', margin + 64, margin + 52);

      y = margin + 78;
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.text('CERTIFICADO DE LICENCIA COMERCIAL - RAMBER TUNES AI MUSIC', margin + 14, y);

      y += 18;
      doc.setDrawColor(80, 80, 80);
      doc.setLineWidth(0.5);
      doc.line(margin + 14, y, margin + 14 + boxW - 28, y);

      y += 20;
      const kv = (label: string, value: string) => {
        doc.setTextColor(180, 180, 180);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.text(label, margin + 14, y);
        doc.setTextColor(255, 255, 255);
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
        doc.setFontSize(isHeading ? 11 : 10.5);
        doc.setTextColor(isHeading ? 255 : 220, isHeading ? 255 : 220, isHeading ? 255 : 220);
        const lines = doc.splitTextToSize(text, boxW - 28);
        for (const line of lines) {
          if (y > pageH - margin - 70) {
            doc.addPage();
            doc.setDrawColor(200, 200, 200);
            doc.setLineWidth(1);
            doc.rect(margin, margin, boxW, pageH - margin * 2);
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

      if (y > pageH - margin - 90) {
        doc.addPage();
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(1);
        doc.rect(margin, margin, boxW, pageH - margin * 2);
        y = margin + 60;
      }

      doc.setDrawColor(120, 120, 120);
      doc.setLineWidth(0.8);
      doc.line(margin + 14, y + 24, margin + 250, y + 24);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(200, 200, 200);
      doc.text('Authorized by RAMBER Tunes Digital Signature.', margin + 14, y + 40);
      doc.text('Documento generado electrónicamente por RAMBER Tunes AI Music', margin + 14, y + 56);
      doc.text('Villahermosa, Tabasco, México.', margin + 14, y + 72);

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
      if (navigator.share) {
        await navigator.share({
          title: `RAMBER Tunes - ${title}`,
          text: `Escucha "${title}" en RAMBER Tunes`,
          url: shareUrl || undefined,
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
      if (!song.sunoTaskId || !song.sunoAudioId) {
        alert('Esta canción no tiene taskId/audioId para convertir a WAV.');
        return;
      }

      const start = await fetch('/api/suno/wav', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${t.token}` },
        body: JSON.stringify({ taskId: song.sunoTaskId, audioId: song.sunoAudioId }),
      });
      const startedOut = await start.json().catch(() => ({}));
      if (!start.ok) {
        alert((startedOut?.detail || startedOut?.error || 'No pude iniciar la conversión a WAV.').toString());
        return;
      }
      const wavTaskId = String(startedOut?.taskId || '').trim();
      if (!wavTaskId) {
        alert('No recibí taskId de conversión WAV.');
        return;
      }
      try {
        await navigator.clipboard.writeText(wavTaskId);
        alert(`Listo. Ya empecé la conversión.\n\nTaskId del WAV (copiado):\n${wavTaskId}\n\nNo lo compartas.`);
      } catch {
        alert(`Listo. Ya empecé la conversión.\n\nTaskId del WAV:\n${wavTaskId}\n\nNo lo compartas.`);
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
        window.open(wavUrl, '_blank');
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
      if (!song.sunoTaskId || !song.sunoAudioId) {
        alert('Esta canción no tiene taskId/audioId para separar voces.');
        return;
      }

      const start = await fetch('/api/suno/separate', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${t.token}` },
        body: JSON.stringify({ taskId: song.sunoTaskId, audioId: song.sunoAudioId, type }),
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
      try {
        await navigator.clipboard.writeText(sepTaskId);
        alert(`Listo. Ya empecé.\n\nTaskId (copiado):\n${sepTaskId}\n\nNo lo compartas.`);
      } catch {
        alert(`Listo. Ya empecé.\n\nTaskId:\n${sepTaskId}\n\nNo lo compartas.`);
      }

      const startedAt = Date.now();
      while (Date.now() - startedAt < 240_000) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        const tr = await fetch(`/api/suno/task?kind=vocal-removal&taskId=${encodeURIComponent(sepTaskId)}`, {
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

        if (
          status === 'FAILED' ||
          status === 'CREATE_TASK_FAILED' ||
          status === 'GENERATE_AUDIO_FAILED' ||
          status === 'CALLBACK_EXCEPTION'
        ) {
          alert('No se pudo separar la canción.');
          return;
        }
        if (status !== 'SUCCESS') continue;

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
            'Vocals': 'Voz',
            'Instrumental': 'Instrumental (Karaoke)',
            'Backing Vocals': 'Coros',
            'Drums': 'Batería',
            'Bass': 'Bajo',
            'Guitar': 'Guitarra',
            'Keyboard': 'Teclado',
            'Percussion': 'Percusión',
            'Strings': 'Cuerdas',
            'Synth': 'Synth',
            'FX': 'FX',
            'Brass': 'Metales',
            'Woodwinds': 'Vientos',
            'Original': 'Original',
          };
          if (map2[base]) return map2[base];
          return base || 'Pista';
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

        if (entries.length === 0) {
          alert('Terminó, pero no recibí links de stems.');
          return;
        }

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
        const items = entries
          .map(([k, v, audioId]) => ({ key: normalizeKey(k), label: labelForKey(k), url: v, audioId: audioId || undefined }))
          .sort((a, b) => rank(a.key) - rank(b.key) || a.label.localeCompare(b.label));
        setStemsItems(items);
        setStemsMeta({ taskId: sepTaskId, type });
        setShowStems(true);
        return;
      }

      alert('Está tardando la separación. Intenta de nuevo en unos segundos.');
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
            <button className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors" onClick={generateCoverImage} disabled={isBusy || isDeleted}>
              <div className="flex items-center gap-3 text-slate-200 font-semibold">
                <ImageIcon className="w-5 h-5 text-slate-300" /> Portada
              </div>
            </button>
            {!isDeleted && (
              <>
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
          {!isDeleted && (
            <button
              className="w-full flex items-center justify-between gap-3 p-4 hover:bg-white/5 transition-colors border-t border-white/5"
              onClick={() => setShowLicense(true)}
              disabled={isBusy}
            >
              <div className="flex items-center gap-3">
                <BadgeCheck className="w-5 h-5 text-slate-300" /> <span className="text-slate-200 font-semibold">Licencia Comercial</span>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500 text-black font-extrabold">CERTIFICADO</span>
            </button>
          )}
            <button className="w-full flex items-center gap-3 p-4 hover:bg-white/5 transition-colors" onClick={share} disabled={isBusy}>
              <Share2 className="w-5 h-5 text-slate-300" /> <span className="text-slate-200 font-semibold">Compartir</span>
            </button>
            {!isDeleted && (
              <button className="w-full flex items-center gap-3 p-4 hover:bg-white/5 transition-colors border-t border-white/5" onClick={download} disabled={isBusy}>
                <Download className="w-5 h-5 text-slate-300" /> <span className="text-slate-200 font-semibold">Descargar</span>
              </button>
            )}
            {!isDeleted && (
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
