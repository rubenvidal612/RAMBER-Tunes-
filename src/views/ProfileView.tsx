import { Component, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { Edit2, Forward, MoreVertical, Share2, XCircle, Search, ArrowLeft } from 'lucide-react';
import { EditProfileView } from './EditProfileView';
import { UserProfileView } from './UserProfileView';
import { getAccessToken, supabaseBrowser } from '@/lib/supabaseBrowser';
import type { SongItem } from '@/types';

class ViewErrorBoundary extends Component<{ onBack: () => void; title: string; children: any }, { hasError: boolean; message: string }> {
  declare props: Readonly<{ onBack: () => void; title: string; children: any }>;
  state: { hasError: boolean; message: string } = { hasError: false, message: '' };
  static getDerivedStateFromError(err: any) {
    const msg = err instanceof Error ? err.message : String(err || '');
    return { hasError: true, message: msg || 'Error inesperado' };
  }
  componentDidCatch() {
  }
  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="fixed inset-0 z-[400] bg-[#0a0a0a] text-white p-5 pb-safe">
        <div className="text-xl font-extrabold">No se pudo abrir</div>
        <div className="mt-2 text-sm text-slate-300">{this.props.title}</div>
        <div className="mt-4 bg-white/5 border border-white/10 rounded-2xl p-3 text-xs text-slate-300 break-words">
          {this.state.message}
        </div>
        <div className="mt-5 flex gap-3">
          <button onClick={this.props.onBack} className="flex-1 h-[46px] rounded-full bg-white/5 hover:bg-white/10 border border-white/10 font-extrabold">
            Regresar
          </button>
          <button
            onClick={() => {
              try {
                window.location.reload();
              } catch {
              }
            }}
            className="flex-1 h-[46px] rounded-full bg-yellow-400 hover:bg-yellow-300 text-black font-extrabold"
          >
            Recargar
          </button>
        </div>
      </div>
    );
  }
}

export function ProfileView({
  onGoStudio,
  songs,
  onPlaySong,
}: {
  onGoStudio?: () => void;
  songs?: SongItem[];
  onPlaySong?: (song: SongItem) => void;
}) {
  const [activeTab, setActiveTab] = useState<'canciones' | 'listas'>('canciones');
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [userId, setUserId] = useState('');
  const [userName, setUserName] = useState('Usuario');
  const [userInitial, setUserInitial] = useState('U');
  const [username, setUsername] = useState('');
  const [userAvatarUrl, setUserAvatarUrl] = useState('');
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
  const [userCoverUrl, setUserCoverUrl] = useState('');
  const [coverLoadFailed, setCoverLoadFailed] = useState(false);
  const [country, setCountry] = useState('');
  const [city, setCity] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [bio, setBio] = useState('');
  const [pinnedSongIds, setPinnedSongIds] = useState<string[]>([]);
  const [pinnedSongsFull, setPinnedSongsFull] = useState<Array<{ id: string; title: string; audioUrl: string; coverUrl?: string }>>([]);
  const [menuSong, setMenuSong] = useState<SongItem | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{ id: string; full_name: string; last_name: string; username: string; avatar_url: string }>>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [viewingUserId, setViewingUserId] = useState<string | null>(null);

  const normalizeR2PublicToProxy = (raw: any) => {
    const url = (raw || '').toString().trim();
    if (!url) return '';
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

  const applyUserToState = (user: any) => {
    const id = (user?.id || '').toString();
    const meta: any = user?.user_metadata || {};
    const name = (meta?.full_name || meta?.name || '').toString().trim();
    const uname = (meta?.username || '').toString().trim();
    const display = (name || 'Usuario').toString().trim();
    setUserId(id);
    setUsername(uname);
    setUserName(display);
    setUserInitial(display.slice(0, 1).toUpperCase() || 'U');
    setAvatarLoadFailed(false);
    setCoverLoadFailed(false);
    setUserAvatarUrl(normalizeR2PublicToProxy(meta?.avatar_url || ''));
    setUserCoverUrl(normalizeR2PublicToProxy(meta?.cover_url || ''));
    setCountry((meta?.country || '').toString());
    setCity((meta?.city || '').toString());
    setContactEmail((meta?.contact_email || '').toString());
    setContactPhone((meta?.contact_phone || '').toString());
    setBio((meta?.bio || '').toString());
  };

  useEffect(() => {
    if (!supabaseBrowser) return;
    let alive = true;
    const loadUser = async () => {
      const { data } = await supabaseBrowser.auth.getUser();
      const user = data?.user;
      if (!alive) return;
      applyUserToState(user);
    };
    loadUser().catch(() => {});
    const { data: sub } = supabaseBrowser.auth.onAuthStateChange(() => {
      loadUser().catch(() => {});
    });
    return () => {
      alive = false;
      try {
        sub?.subscription?.unsubscribe?.();
      } catch {
      }
    };
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const t = await getAccessToken();
      if (!t.ok) {
        if (!alive) return;
        setPinnedSongIds([]);
        setPinnedSongsFull([]);
        return;
      }
      const r = await fetch('/api/profile/pins-full', { headers: { authorization: `Bearer ${t.token}` } });
      const out = await r.json().catch(() => ({}));
      if (!r.ok || out?.ok === false) {
        const msg = (out?.error || 'No pude cargar tu perfil.').toString();
        const hint = (out?.hint || '').toString();
        if (msg) alert([msg, hint].filter(Boolean).join('\n\n'));
        if (!alive) return;
        setPinnedSongIds([]);
        setPinnedSongsFull([]);
        return;
      }
      const items = Array.isArray(out?.items) ? out.items : [];
      const mapped = items
        .map((x: any) => ({
          id: String(x?.id || '').trim(),
          title: String(x?.title || 'Canción').trim(),
          audioUrl: String(x?.audioUrl || x?.audio_url || '').trim(),
          coverUrl: String(x?.coverUrl || x?.cover_url || '').trim() || undefined,
        }))
        .filter((x: any) => x.id && x.audioUrl);
      if (!alive) return;
      setPinnedSongsFull(mapped);
      setPinnedSongIds(mapped.map((x) => x.id));
    })().catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const shareFromProfile = async () => {
    const uid = (userId || '').toString().trim();
    if (!uid) {
      alert('Aún estoy cargando tu perfil. Intenta de nuevo.');
      return;
    }
    const url = `${window.location.origin}/u/${encodeURIComponent(uid)}`;
    try {
      if (navigator.share && url) {
        await navigator.share({
          title: 'RAMBER Tunes',
          text: 'Mira mi perfil en RAMBER Tunes',
          url,
        });
        return;
      }
    } catch {}
    try {
      await navigator.clipboard.writeText(url);
      alert('Copiado al portapapeles.');
      return;
    } catch {}
    alert(url);
  };

  const shareSong = async (song: SongItem) => {
    const title = (song?.title || 'Canción').toString().trim();
    const url = song?.id ? `${window.location.origin}/share/${encodeURIComponent(song.id)}` : '';
    if (!url) {
      alert('No hay link para compartir.');
      return;
    }
    try {
      if (navigator.share) {
        await navigator.share({ title: `RAMBER Tunes - ${title}`, url });
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

  const removeFromProfile = async (song: SongItem) => {
    const sid = (song?.id || '').toString().trim();
    if (!sid) return;
    try {
      const t = await getAccessToken();
      if (!t.ok) {
        alert(t.error || 'No se pudo iniciar sesión.');
        return;
      }
      const r = await fetch('/api/profile/pin', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${t.token}` },
        body: JSON.stringify({ songId: sid, pin: false }),
      });
      const out = await r.json().catch(() => ({}));
      if (!r.ok || out?.ok === false) {
        alert((out?.error || out?.detail || 'No pude quitarla del perfil.').toString());
        return;
      }
      setPinnedSongIds((prev) => prev.filter((x) => x !== sid));
      setMenuSong(null);
    } catch {
      alert('No pude quitarla del perfil.');
    }
  };

  if (showEditProfile) {
    return (
      <ViewErrorBoundary title="Editar perfil" onBack={() => setShowEditProfile(false)}>
        <EditProfileView
          onClose={() => {
            setShowEditProfile(false);
            try {
              supabaseBrowser?.auth
                .getUser()
                .then(({ data }) => applyUserToState(data?.user))
                .catch(() => {});
            } catch {
            }
          }}
        />
      </ViewErrorBoundary>
    );
  }

  const pinnedSongs = pinnedSongsFull.length
    ? pinnedSongsFull.map((x) => ({ id: x.id, title: x.title, audioUrl: x.audioUrl, coverUrl: x.coverUrl } as any as SongItem))
    : (() => {
        const allSongs = Array.isArray(songs) ? songs : [];
        const pinnedSet = new Set(pinnedSongIds);
        return allSongs.filter((s) => pinnedSet.has(String(s?.id || '')));
      })();
  const searchUsers = async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    
    setIsSearching(true);
    try {
      const t = await getAccessToken();
      if (!t.ok) {
        alert(t.error || 'No se pudo iniciar sesión.');
        return;
      }
      
      const response = await fetch(`/api/social/search?q=${encodeURIComponent(query)}`, {
        headers: { authorization: `Bearer ${t.token}` }
      });
      
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        alert(error?.error || 'No se pudo buscar usuarios.');
        return;
      }
      
      const data = await response.json();
      setSearchResults(Array.isArray(data?.users) ? data.users : []);
    } catch (error) {
      alert('Error al buscar usuarios.');
    } finally {
      setIsSearching(false);
    }
  };

  const location = [city, country].map((x) => String(x || '').trim()).filter(Boolean).join(', ');
  const hasInfo = Boolean(location || String(contactEmail || '').trim() || String(contactPhone || '').trim() || String(bio || '').trim());

  if (viewingUserId) {
    return (
      <div className="flex-1 flex flex-col pt-4 overflow-y-auto w-full relative z-10">
        <div className="px-6 mb-4">
          <button
            onClick={() => setViewingUserId(null)}
            className="flex items-center gap-2 text-slate-300 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>Volver a mi perfil</span>
          </button>
        </div>
        <UserProfileView userId={viewingUserId} onPlaySong={onPlaySong} />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col pt-4 overflow-y-auto w-full relative z-10">
      {/* Search Bar */}
      <div className="px-6 mb-6">
        <div className="relative">
          <div className="absolute left-4 top-1/2 transform -translate-y-1/2">
            <Search className="w-5 h-5 text-slate-400" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              searchUsers(e.target.value);
            }}
            placeholder="Buscar usuarios por nombre, apellido o usuario..."
            className="w-full bg-white/5 border border-white/10 rounded-full py-3 pl-12 pr-4 text-white placeholder:text-slate-400 outline-none focus:border-indigo-500/50 transition-colors"
          />
          {isSearching && (
            <div className="absolute right-4 top-1/2 transform -translate-y-1/2">
              <div className="w-5 h-5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin"></div>
            </div>
          )}
        </div>
      </div>

      {/* Search Results */}
      {searchResults.length > 0 && (
        <div className="px-6 mb-6">
          <div className="glass-card rounded-3xl border border-white/10 p-4">
            <div className="text-white font-extrabold mb-4">Resultados de búsqueda</div>
            <div className="space-y-3">
              {searchResults.map((user) => (
                <div key={user.id} className="flex items-center gap-3 p-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 transition-colors cursor-pointer">
                  <div className="w-12 h-12 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center overflow-hidden shrink-0">
                    {user.avatar_url ? (
                      <img
                        src={normalizeR2PublicToProxy(user.avatar_url)}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-lg font-bold text-indigo-300">
                        {(user.full_name || 'U').slice(0, 1).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-white font-bold truncate">
                      {user.full_name} {user.last_name}
                    </div>
                    <div className="text-xs text-slate-300/80 truncate">@{user.username}</div>
                  </div>
                  <button
                    className="px-4 py-2 rounded-full bg-indigo-500 hover:bg-indigo-400 text-white font-semibold text-sm transition-colors"
                    onClick={() => setViewingUserId(user.id)}
                  >
                    Ver perfil
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="px-6 mb-6">
        <div className="relative w-full aspect-[1610/720] rounded-3xl overflow-hidden border border-white/10">
          <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/20 via-fuchsia-500/10 to-yellow-500/10" />
          {userCoverUrl && !coverLoadFailed ? (
            <img
              src={userCoverUrl}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
              onError={() => setCoverLoadFailed(true)}
            />
          ) : null}
        </div>
        <div className="mt-4 flex items-center gap-4 min-w-0">
          <div className="w-16 h-16 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-2xl font-bold text-indigo-300 overflow-hidden shrink-0">
            {userAvatarUrl && !avatarLoadFailed ? (
              <img
                src={userAvatarUrl}
                alt=""
                className="w-full h-full object-cover"
                onError={() => setAvatarLoadFailed(true)}
              />
            ) : (
              userInitial
            )}
          </div>
          <div className="min-w-0">
            <h2 className="text-2xl font-bold text-white truncate">{userName}</h2>
            {username ? <div className="text-xs text-slate-300/80 truncate">@{username}</div> : null}
          </div>
        </div>
      </div>

      {/* Stats */}
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

      {/* Action Buttons */}
      <div className="flex gap-4 px-6 mb-8">
        <button 
          onClick={() => setShowEditProfile(true)}
          className="flex-1 py-2.5 rounded-full glass-card border border-indigo-500/50 text-indigo-300 font-semibold flex items-center justify-center gap-2 hover:bg-indigo-500/10 transition-colors text-sm"
        >
          <Edit2 className="w-4 h-4" /> Editar perfil
        </button>
        <button
          onClick={() => shareFromProfile().catch(() => {})}
          className="flex-1 py-2.5 rounded-full glass-card border border-white/10 text-slate-200 font-semibold flex items-center justify-center gap-2 hover:bg-white/5 transition-colors text-sm"
        >
          <Forward className="w-4 h-4" /> Compartir
        </button>
      </div>

      {hasInfo && (
        <div className="px-6 mb-8 space-y-3">
          <div className="glass-card rounded-3xl border border-white/10 p-4">
            <div className="text-white font-extrabold">Información</div>
            {location ? <div className="mt-2 text-sm text-slate-300">{location}</div> : null}
            {contactEmail ? <div className="mt-2 text-sm text-slate-300">{String(contactEmail)}</div> : null}
            {contactPhone ? <div className="mt-1 text-sm text-slate-300">{String(contactPhone)}</div> : null}
            {bio ? <div className="mt-3 text-sm text-slate-200 whitespace-pre-wrap">{String(bio)}</div> : null}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex px-6 border-b border-white/10 space-x-6 mb-6">
        {(['canciones', 'listas'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "py-3 text-sm font-semibold capitalize relative transition-colors",
              activeTab === tab ? "text-slate-100" : "text-slate-500"
            )}
          >
            {tab}
            {activeTab === tab && (
              <div className="absolute bottom-0 left-0 w-full h-[2px] bg-gradient-to-r from-indigo-400 to-purple-400 rounded-t-full" />
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'canciones' ? (
        pinnedSongs.length > 0 ? (
          <div className="px-6 pb-8 mt-[-10px]">
            <div className="text-slate-200 font-extrabold">Canciones en tu perfil</div>
            <div className="mt-3 space-y-2">
              {pinnedSongs.map((s) => (
                <div key={s.id} className="w-full glass-card rounded-2xl p-4 flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl overflow-hidden bg-white/5 border border-white/10 shrink-0">
                    <img
                      src={(s.coverUrl || `https://picsum.photos/seed/${s.id}/150/150`).toString()}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <button onClick={() => onPlaySong?.(s)} className="text-left w-full">
                      <div className="text-white font-extrabold truncate">{s.title || 'Pista sin título'}</div>
                    </button>
                    <div className="text-slate-400 text-xs truncate">{s.genre || ' '}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMenuSong(s)}
                    className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-200 hover:bg-white/10 transition-colors shrink-0"
                    aria-label="Opciones"
                    title="Opciones"
                  >
                    <MoreVertical className="w-5 h-5" />
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-4 text-[11px] text-slate-400">
              Para agregar más, ve a Biblioteca → 3 puntitos → “Añadir a mi perfil”.
            </div>
          </div>
        ) : (
          <div className="flex-1 px-6 flex flex-col items-center justify-center text-center pb-8 mt-[-30px]">
            <div className="w-24 h-24 mb-6 text-slate-600 opacity-50 relative flex items-center justify-center">
              <div className="w-16 h-12 border-2 border-current rounded-t-md border-b-0 space-y-1 p-2">
                <div className="w-2 h-0.5 bg-current rounded-full" />
              </div>
              <div className="absolute top-0 flex gap-2">
                <div className="w-1 h-3 bg-current rounded-full rotate-[-30deg] -ml-4" />
                <div className="w-1 h-4 bg-current rounded-full -mt-2" />
                <div className="w-1 h-3 bg-current rounded-full rotate-[30deg] -mr-4" />
              </div>
            </div>
            <div className="mb-6 max-w-[320px]">
              <div className="text-base font-extrabold tracking-tight leading-tight bg-gradient-to-r from-yellow-300 via-amber-200 to-fuchsia-200 bg-clip-text text-transparent drop-shadow-[0_0_18px_rgba(250,204,21,0.12)]">
                Haz que Escuchen Tus Canciones en TODO EL MUNDO!
              </div>
              <div className="mt-2 text-slate-300 font-semibold text-sm">
                ¡es hora de hacer <span className="text-white font-extrabold">HISTORIA</span>!
              </div>
            </div>
            <button
              onClick={() => onGoStudio?.()}
              className="bg-gradient-to-r from-indigo-500 to-purple-600 hover:opacity-90 transition-all text-white font-bold text-sm px-6 py-2.5 rounded-full shadow-lg shadow-indigo-500/20"
            >
              ¡Comenzar ahora!
            </button>
          </div>
        )
      ) : (
        <div className="flex-1 px-6 flex flex-col items-center justify-center text-center pb-8 mt-[-30px]">
          <div className="text-slate-300 font-extrabold">Playlists (próximamente)</div>
          <div className="mt-2 text-sm text-slate-400">Aquí van a salir tus listas.</div>
        </div>
      )}

      {menuSong && (
        <div className="fixed inset-0 z-[250] bg-black/70 flex items-end md:items-center justify-center">
          <button className="absolute inset-0 w-full h-full" onClick={() => setMenuSong(null)} aria-label="Cerrar" />
          <div className="relative w-full md:max-w-[520px] bg-[#0a0a0a] border border-white/10 rounded-t-3xl md:rounded-3xl overflow-hidden mb-[92px] md:mb-0">
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <div className="text-white font-extrabold truncate">{(menuSong.title || 'Canción').toString()}</div>
              <button
                onClick={() => setMenuSong(null)}
                className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-200"
              >
                ✕
              </button>
            </div>
            <div className="p-4 space-y-2">
              <button
                className="w-full flex items-center gap-3 p-4 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-left transition-colors"
                onClick={() => shareSong(menuSong).catch(() => {})}
              >
                <Share2 className="w-5 h-5 text-slate-200" />
                <div className="text-slate-100 font-extrabold">Compartir canción</div>
              </button>
              <button
                className="w-full flex items-center gap-3 p-4 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-left transition-colors"
                onClick={() => removeFromProfile(menuSong).catch(() => {})}
              >
                <XCircle className="w-5 h-5 text-slate-200" />
                <div className="text-slate-100 font-extrabold">Quitar de mi perfil</div>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
