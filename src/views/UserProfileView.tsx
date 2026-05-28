import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { MoreVertical, Share2, UserPlus, UserCheck } from 'lucide-react';
import { getAccessToken } from '@/lib/supabaseBrowser';
import type { SongItem } from '@/types';

function normalizeR2PublicToProxy(raw: any) {
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
}

export function UserProfileView({
  userId,
  onPlaySong,
  onFollowChanged,
}: {
  userId: string;
  onPlaySong?: (song: SongItem) => void;
  onFollowChanged?: (nextFollowing: boolean) => void;
}) {
  const [isLoading, setIsLoading] = useState(true);
  const [userData, setUserData] = useState<{
    id: string;
    full_name: string;
    last_name: string;
    username: string;
    avatar_url: string;
    cover_url: string;
    country: string;
    city: string;
    contact_email: string;
    contact_phone: string;
    bio: string;
  } | null>(null);
  
  const [userSongs, setUserSongs] = useState<SongItem[]>([]);
  const [activeTab, setActiveTab] = useState<'canciones' | 'listas'>('canciones');
  const [isFollowing, setIsFollowing] = useState(false);
  const [isFollowLoading, setIsFollowLoading] = useState(false);
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);

  useEffect(() => {
    if (!userId) return;

    let alive = true;
    (async () => {
      setIsLoading(true);
      try {
        const t = await getAccessToken();
        if (!t.ok) {
          if (!alive) return;
          setUserData(null);
          setUserSongs([]);
          return;
        }

        const r = await fetch(`/api/social/user?id=${encodeURIComponent(userId)}`, { headers: { authorization: `Bearer ${t.token}` } });
        const out = await r.json().catch(() => ({}));
        if (!alive) return;
        if (!r.ok || out?.ok === false) {
          setUserData(null);
          setUserSongs([]);
          return;
        }

        setUserData(out.user || null);
        setUserSongs(Array.isArray(out.songs) ? out.songs : []);

        const fr = await fetch(`/api/social/follow-status?userId=${encodeURIComponent(userId)}`, { headers: { authorization: `Bearer ${t.token}` } });
        const fo = await fr.json().catch(() => ({}));
        if (!alive) return;
        if (fr.ok && fo?.ok !== false) {
          setIsFollowing(Boolean(fo?.is_following));
          setFollowersCount(typeof fo?.followers_count === 'number' ? fo.followers_count : 0);
          setFollowingCount(typeof fo?.following_count === 'number' ? fo.following_count : 0);
        } else {
          setIsFollowing(false);
          setFollowersCount(0);
          setFollowingCount(0);
        }
      } finally {
        if (!alive) return;
        setIsLoading(false);
      }
    })().catch(() => {
      if (!alive) return;
      setIsLoading(false);
    });

    return () => {
      alive = false;
    };
  }, [userId]);

  const shareProfile = async () => {
    if (!userData) return;
    
    const url = `${window.location.origin}/u/${encodeURIComponent(userData.id)}`;
    try {
      if (navigator.share) {
        await navigator.share({
          title: `Perfil de ${userData.full_name}`,
          text: `Mira el perfil de ${userData.full_name} en Luciana AI`,
          url,
        });
        return;
      }
    } catch {}
    
    try {
      await navigator.clipboard.writeText(url);
      alert('URL copiada al portapapeles.');
      return;
    } catch {}
    
    alert(url);
  };

  const handleFollow = async () => {
    if (!userData || isFollowLoading) return;
    
    setIsFollowLoading(true);
    try {
      const token = await getAccessToken();
      if (!token.ok) {
        alert(token.error || 'No se pudo iniciar sesión.');
        return;
      }

      const response = await fetch('/api/social/follow', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authorization: `Bearer ${token.token}`
        },
        body: JSON.stringify({
          targetUserId: userData.id,
          follow: !isFollowing
        })
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        const msg = [
          error?.error,
          error?.hint,
          typeof error?.sql === 'string' && error.sql.trim() ? `SQL (copia y pega en Supabase):\n${error.sql}` : '',
        ]
          .filter(Boolean)
          .join('\n\n');
        alert(msg || 'No se pudo completar la acción.');
        return;
      }

      const data = await response.json();
      if (data.ok) {
        const nextFollowing = typeof data?.following === 'boolean' ? data.following : !isFollowing;
        setIsFollowing(nextFollowing);
        setFollowersCount(prev => (nextFollowing ? prev + 1 : Math.max(0, prev - 1)));
        try {
          onFollowChanged?.(nextFollowing);
        } catch {
        }
      }
    } catch (error) {
      alert('Error al procesar la solicitud.');
    } finally {
      setIsFollowLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col pt-4 overflow-y-auto w-full relative z-10">
        <div className="px-6 mb-6">
          <div className="relative w-full aspect-[1610/720] rounded-3xl overflow-hidden border border-white/10 bg-white/5 animate-pulse" />
          <div className="mt-4 flex items-center gap-4 min-w-0">
            <div className="w-16 h-16 rounded-full bg-white/5 animate-pulse" />
            <div className="min-w-0 flex-1">
              <div className="h-8 bg-white/5 rounded animate-pulse mb-2" />
              <div className="h-4 bg-white/5 rounded animate-pulse w-1/3" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!userData) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center pt-4 overflow-y-auto w-full relative z-10">
        <div className="text-center px-6">
          <div className="text-2xl font-bold text-white mb-2">Usuario no encontrado</div>
          <div className="text-slate-400">El perfil que buscas no existe o ha sido eliminado.</div>
        </div>
      </div>
    );
  }

  const location = [userData.city, userData.country].map((x) => String(x || '').trim()).filter(Boolean).join(', ');
  const hasInfo = Boolean(location || String(userData.contact_email || '').trim() || String(userData.contact_phone || '').trim() || String(userData.bio || '').trim());

  return (
    <div className="flex-1 flex flex-col pt-4 overflow-y-auto w-full relative z-10">
      <div className="px-6 mb-6">
        <div className="relative w-full aspect-[1610/720] rounded-3xl overflow-hidden border border-white/10">
          <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/20 via-fuchsia-500/10 to-yellow-500/10" />
          {userData.cover_url ? (
            <img
              src={normalizeR2PublicToProxy(userData.cover_url)}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : null}
        </div>
        <div className="mt-4 flex items-center gap-4 min-w-0">
          <div className="w-16 h-16 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-2xl font-bold text-indigo-300 overflow-hidden shrink-0">
            {userData.avatar_url ? (
              <img
                src={normalizeR2PublicToProxy(userData.avatar_url)}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-lg font-bold text-indigo-300">
                {(userData.full_name || 'U').slice(0, 1).toUpperCase()}
              </span>
            )}
          </div>
          <div className="min-w-0">
            <h2 className="text-2xl font-bold text-white truncate">
              {userData.full_name} {userData.last_name}
            </h2>
            {userData.username ? <div className="text-xs text-slate-300/80 truncate">@{userData.username}</div> : null}
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
          <span className="text-lg font-bold text-slate-100">{followersCount}</span>
          <span className="text-xs text-slate-400">Seguidores</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-lg font-bold text-slate-100">{followingCount}</span>
          <span className="text-xs text-slate-400">Siguiendo</span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-4 px-6 mb-8">
        <button
          onClick={handleFollow}
          disabled={isFollowLoading}
          className={cn(
            "flex-1 py-2.5 rounded-full glass-card border font-semibold flex items-center justify-center gap-2 transition-colors text-sm",
            isFollowing
              ? "border-emerald-500/50 text-emerald-300 hover:bg-emerald-500/10"
              : "border-indigo-500/50 text-indigo-300 hover:bg-indigo-500/10"
          )}
        >
          {isFollowLoading ? (
            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
          ) : isFollowing ? (
            <>
              <UserCheck className="w-4 h-4" /> Siguiendo
            </>
          ) : (
            <>
              <UserPlus className="w-4 h-4" /> Seguir
            </>
          )}
        </button>
        <button
          onClick={shareProfile}
          className="flex-1 py-2.5 rounded-full glass-card border border-white/10 text-slate-200 font-semibold flex items-center justify-center gap-2 hover:bg-white/5 transition-colors text-sm"
        >
          <Share2 className="w-4 h-4" /> Compartir perfil
        </button>
      </div>

      {hasInfo && (
        <div className="px-6 mb-8 space-y-3">
          <div className="glass-card rounded-3xl border border-white/10 p-4">
            <div className="text-white font-extrabold">Información</div>
            {location ? <div className="mt-2 text-sm text-slate-300">{location}</div> : null}
            {userData.contact_email ? <div className="mt-2 text-sm text-slate-300">{String(userData.contact_email)}</div> : null}
            {userData.contact_phone ? <div className="mt-1 text-sm text-slate-300">{String(userData.contact_phone)}</div> : null}
            {userData.bio ? <div className="mt-3 text-sm text-slate-200 whitespace-pre-wrap">{String(userData.bio)}</div> : null}
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

      {/* User's Public Songs */}
      <div className="px-6">
        {userSongs.length > 0 ? (
          <div className="space-y-3">
            {userSongs.map((song) => (
              <div key={song.id} className="flex items-center gap-4 p-4 rounded-3xl glass-card border border-white/10 hover:bg-white/5 transition-colors">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500/30 to-purple-500/30 border border-white/10 overflow-hidden shrink-0">
                  {song.coverUrl ? (
                    <img
                      src={normalizeR2PublicToProxy(song.coverUrl)}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-white font-extrabold truncate">{song.title || 'Pista sin título'}</div>
                  <div className="text-slate-400 text-xs truncate">{song.genre || ' '}</div>
                </div>
                <button
                  type="button"
                  onClick={() => onPlaySong?.(song)}
                  className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-200 hover:bg-white/10 transition-colors shrink-0"
                  aria-label="Reproducir"
                  title="Reproducir"
                >
                  <MoreVertical className="w-5 h-5" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center text-center py-12">
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
            <div className="text-slate-400 text-sm max-w-[280px]">
              {userData.full_name} aún no ha publicado canciones públicas.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
