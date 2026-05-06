import { useEffect, useRef, useState } from 'react';
import { HelpCircle, Edit2 } from 'lucide-react';
import { ensureAnonSession, supabaseBrowser } from '@/lib/supabaseBrowser';

export function EditProfileView({ onClose }: { onClose: () => void }) {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string>('');
  const [coverUrl, setCoverUrl] = useState<string>('');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string>('');
  const [coverPreviewUrl, setCoverPreviewUrl] = useState<string>('');
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const coverInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!supabaseBrowser) return;
    let alive = true;
    setIsLoading(true);
    supabaseBrowser.auth
      .getUser()
      .then(({ data }) => {
        if (!alive) return;
        const meta: any = data?.user?.user_metadata || {};
        const n = (meta?.full_name || meta?.name || '').toString().trim();
        const u = (meta?.username || '').toString().trim();
        const b = (meta?.bio || '').toString();
        setName(n);
        setUsername(u);
        setBio(b);
        setAvatarUrl((meta?.avatar_url || '').toString());
        setCoverUrl((meta?.cover_url || '').toString());
      })
      .catch(() => {})
      .finally(() => {
        if (!alive) return;
        setIsLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      try {
        if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl);
      } catch {}
      try {
        if (coverPreviewUrl) URL.revokeObjectURL(coverPreviewUrl);
      } catch {}
    };
  }, [avatarPreviewUrl, coverPreviewUrl]);

  const sanitizeUsername = (s: string) =>
    (s || '')
      .toString()
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '')
      .slice(0, 20);

  const imageFileToWebpBlob = async (file: File, opts: { width: number; height: number; quality: number }) => {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const i = new Image();
      i.onload = () => {
        URL.revokeObjectURL(url);
        resolve(i);
      };
      i.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('No pude leer la imagen.'));
      };
      i.src = url;
    });

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(opts.width));
    canvas.height = Math.max(1, Math.floor(opts.height));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No pude preparar la imagen.');

    const sw = img.naturalWidth || img.width;
    const sh = img.naturalHeight || img.height;
    const dw = canvas.width;
    const dh = canvas.height;

    const scale = Math.max(dw / sw, dh / sh);
    const rw = sw * scale;
    const rh = sh * scale;
    const dx = (dw - rw) / 2;
    const dy = (dh - rh) / 2;
    ctx.drawImage(img, dx, dy, rw, rh);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => {
          if (!b) reject(new Error('No pude comprimir la imagen.'));
          else resolve(b);
        },
        'image/webp',
        Math.max(0.1, Math.min(0.95, opts.quality))
      );
    });
    return blob;
  };

  const uploadWebpToStorage = async (userId: string, kind: 'avatar' | 'cover', blob: Blob) => {
    await ensureAnonSession();
    const base = kind === 'avatar' ? `avatars/${userId}` : `profile-covers/${userId}`;
    const path = `${base}/${kind}_${Date.now()}.webp`;
    const up = await supabaseBrowser.storage.from('ramber-tunes').upload(path, blob, {
      upsert: true,
      contentType: 'image/webp',
      cacheControl: '31536000',
    });
    if (up.error) throw new Error(up.error.message || 'No pude subir la imagen.');
    const { data } = supabaseBrowser.storage.from('ramber-tunes').getPublicUrl(path);
    const url = (data?.publicUrl || '').toString();
    if (!url) throw new Error('No pude obtener el link de la imagen.');
    return url;
  };

  const save = async () => {
    if (!supabaseBrowser) return;
    const cleanName = (name || '').toString().trim().slice(0, 20);
    const cleanUsername = sanitizeUsername(username);
    if (!cleanName) {
      alert('Pon tu Nombre.');
      return;
    }
    if (!cleanUsername) {
      alert('Pon tu Nombre de usuario.');
      return;
    }
    setIsSaving(true);
    try {
      const { data } = await supabaseBrowser.auth.getUser();
      const user = data?.user;
      const userId = (user?.id || '').toString();
      if (!userId) {
        alert('No pude identificar tu usuario.');
        return;
      }

      let nextAvatarUrl = avatarUrl;
      let nextCoverUrl = coverUrl;

      if (avatarFile) {
        const blob = await imageFileToWebpBlob(avatarFile, { width: 256, height: 256, quality: 0.82 });
        nextAvatarUrl = await uploadWebpToStorage(userId, 'avatar', blob);
      }
      if (coverFile) {
        const blob = await imageFileToWebpBlob(coverFile, { width: 1610, height: 180, quality: 0.78 });
        nextCoverUrl = await uploadWebpToStorage(userId, 'cover', blob);
      }

      const upd = await supabaseBrowser.auth.updateUser({
        data: {
          full_name: cleanName,
          username: cleanUsername,
          bio: (bio || '').toString().slice(0, 250),
          avatar_url: nextAvatarUrl || undefined,
          cover_url: nextCoverUrl || undefined,
          profile_ready: true,
        },
      });
      if (upd.error) {
        alert(upd.error.message || 'No pude guardar tu perfil.');
        return;
      }
      onClose();
    } catch (e: any) {
      alert(e instanceof Error ? e.message : 'No pude guardar tu perfil.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#0a0a0a] overflow-y-auto animate-in slide-in-from-bottom-8 duration-300 z-[100] fixed inset-0 pb-safe text-white">
      {/* Header */}
      <div className="flex items-center p-4 sticky top-0 bg-[#0a0a0a] z-10">
        <h2 className="text-xl font-bold">Editar</h2>
      </div>

      <div className="p-4 space-y-6 pb-32">
        {/* Banner Image */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <h3 className="font-bold text-lg">Imagen de perfil</h3>
            <span className="text-slate-400 text-xs font-medium leading-tight max-w-[200px]">(Tamaño recomendado: 1610 × 180 px, máx. 10 MB)</span>
          </div>
          <button
            type="button"
            onClick={() => coverInputRef.current?.click()}
            className="w-full h-24 rounded-xl bg-gradient-to-r from-teal-900 to-slate-800 relative flex items-center justify-center cursor-pointer overflow-hidden border border-white/5"
            disabled={isLoading || isSaving}
          >
            {(coverPreviewUrl || coverUrl) ? (
              <img src={(coverPreviewUrl || coverUrl).toString()} alt="" className="absolute inset-0 w-full h-full object-cover" />
            ) : null}
            <div className="absolute inset-0 bg-black/25" />
            <div className="absolute bottom-2 right-2 w-7 h-7 bg-black/60 backdrop-blur-md rounded-full flex items-center justify-center border border-white/10">
              <Edit2 className="w-3.5 h-3.5 text-white" />
            </div>
          </button>
          <input
            ref={coverInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0] || null;
              e.currentTarget.value = '';
              if (!f) return;
              if (f.size > 10 * 1024 * 1024) {
                alert('La imagen debe ser menor a 10 MB.');
                return;
              }
              try {
                if (coverPreviewUrl) URL.revokeObjectURL(coverPreviewUrl);
              } catch {}
              setCoverFile(f);
              setCoverPreviewUrl(URL.createObjectURL(f));
            }}
          />
        </div>

        {/* Profile Image */}
        <div>
          <h3 className="font-bold text-lg mb-2">Imagen</h3>
          <div className="flex items-center gap-4">
            <div className="relative">
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                className="w-20 h-20 rounded-full bg-teal-600 flex items-center justify-center text-3xl font-bold text-white shadow-inner overflow-hidden"
                disabled={isLoading || isSaving}
              >
                {(avatarPreviewUrl || avatarUrl) ? (
                  <img src={(avatarPreviewUrl || avatarUrl).toString()} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span>{(name || 'U').toString().trim().slice(0, 1).toUpperCase()}</span>
                )}
              </button>
              <div className="absolute bottom-0 right-0 w-7 h-7 bg-black/60 backdrop-blur-md rounded-full flex items-center justify-center border border-white/10 cursor-pointer pointer-events-none">
                <Edit2 className="w-3.5 h-3.5 text-white" />
              </div>
            </div>
            <span className="text-slate-400 text-xs font-medium leading-tight max-w-[180px]">(Tamaño recomendado: 88 × 88 px, máx. 500 KB)</span>
          </div>
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0] || null;
              e.currentTarget.value = '';
              if (!f) return;
              if (f.size > 500 * 1024) {
                alert('La foto de perfil debe ser menor a 500 KB.');
                return;
              }
              try {
                if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl);
              } catch {}
              setAvatarFile(f);
              setAvatarPreviewUrl(URL.createObjectURL(f));
            }}
          />
        </div>

        {/* Name */}
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <h3 className="font-bold text-base">Nombre</h3>
            <HelpCircle className="w-4 h-4 text-slate-500" />
          </div>
          <div className="flex items-center justify-between bg-white/5 rounded-xl px-4 py-3 border border-white/5">
            <input 
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value.substring(0, 20))}
              className="bg-transparent text-white outline-none flex-1 text-[15px]"
            />
            <span className="text-slate-500 text-sm ml-2">{name.length}/20</span>
          </div>
        </div>

        {/* Username */}
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <h3 className="font-bold text-base">Nombre de usuario</h3>
            <HelpCircle className="w-4 h-4 text-slate-500" />
          </div>
          <div className="flex items-center justify-between bg-white/5 rounded-xl px-4 py-3 border border-white/5">
            <input 
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value.substring(0, 20))}
              className="bg-transparent text-white outline-none flex-1 text-[15px]"
            />
            <span className="text-slate-500 text-sm ml-2">{username.length}/20</span>
          </div>
        </div>

        {/* Bio */}
        <div>
          <h3 className="font-bold text-base mb-2">Biografía</h3>
          <div className="bg-white/5 rounded-xl p-4 border border-white/5 relative">
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value.substring(0, 250))}
              placeholder="Escribe tu biografía"
              className="w-full bg-transparent text-[15px] placeholder:text-slate-500 outline-none min-h-[120px] text-white resize-none"
            />
            <div className="absolute bottom-3 right-4 text-slate-500 text-sm">
              {bio.length} / 250
            </div>
          </div>
        </div>
      </div>

      {/* Action Buttons Fixed at Bottom */}
      <div className="fixed bottom-0 left-0 w-full p-4 flex gap-4 bg-[#0a0a0a] border-t border-white/5 pb-safe z-20">
        <button 
          onClick={onClose}
          className="flex-1 py-3.5 rounded-full border border-white/20 text-white font-bold hover:bg-white/5 transition-colors"
        >
          Cancelar
        </button>
        <button 
          onClick={() => save().catch(() => {})}
          disabled={isLoading || isSaving}
          className="flex-1 py-3.5 rounded-full bg-green-500 hover:bg-green-400 text-[#020617] font-bold transition-colors disabled:opacity-60"
        >
          {isSaving ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </div>
  );
}
