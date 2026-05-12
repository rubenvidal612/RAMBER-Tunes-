import { useEffect, useRef, useState } from 'react';
import { HelpCircle, Edit2 } from 'lucide-react';
import { ensureAnonSession, supabaseBrowser } from '@/lib/supabaseBrowser';

export function EditProfileView({ onClose }: { onClose: () => void }) {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isAvatarAutoSaving, setIsAvatarAutoSaving] = useState(false);
  const [name, setName] = useState('');
  const [lastName, setLastName] = useState('');
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [country, setCountry] = useState('');
  const [city, setCity] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string>('');
  const [coverUrl, setCoverUrl] = useState<string>('');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [originalAvatarFile, setOriginalAvatarFile] = useState<File | null>(null);
  const [originalCoverFile, setOriginalCoverFile] = useState<File | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string>('');
  const [coverPreviewUrl, setCoverPreviewUrl] = useState<string>('');
  const [avatarCropRect, setAvatarCropRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [coverCropRect, setCoverCropRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const [cropTarget, setCropTarget] = useState<'avatar' | 'cover' | null>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [cropUrl, setCropUrl] = useState('');
  const [cropZoom, setCropZoom] = useState(1);
  const [cropShift, setCropShift] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [cropImg, setCropImg] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const cropWrapRef = useRef<HTMLDivElement | null>(null);
  const [cropWrapSize, setCropWrapSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const cropDragRef = useRef<{ on: boolean; x: number; y: number; sx: number; sy: number; pid: number | null }>({
    on: false,
    x: 0,
    y: 0,
    sx: 0,
    sy: 0,
    pid: null,
  });

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
        const ln = (meta?.last_name || '').toString().trim();
        const u = (meta?.username || '').toString().trim();
        const b = (meta?.bio || '').toString();
        setName(n);
        setLastName(ln);
        setUsername(u);
        setBio(b);
        setCountry((meta?.country || '').toString());
        setCity((meta?.city || '').toString());
        setContactEmail((meta?.contact_email || '').toString());
        setContactPhone((meta?.contact_phone || '').toString());
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

  const r2ValueToProxyUrl = (raw: any) => {
    const url = (raw || '').toString().trim();
    if (!url) return '';
    if (url.startsWith('blob:') || url.startsWith('data:')) return url;
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

  const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

  useEffect(() => {
    if (!cropOpen) return;
    const el = cropWrapRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      setCropWrapSize({ w: Math.max(1, Math.floor(r.width)), h: Math.max(1, Math.floor(r.height)) });
    };
    update();

    let ro: ResizeObserver | null = null;
    if (typeof (window as any).ResizeObserver === 'function') {
      ro = new ResizeObserver(() => update());
      ro.observe(el);
    } else {
      window.addEventListener('resize', update);
    }
    return () => {
      try {
        if (ro) ro.disconnect();
      } catch {}
      try {
        window.removeEventListener('resize', update);
      } catch {}
    };
  }, [cropOpen]);

  const openCrop = async (target: 'avatar' | 'cover', file: File) => {
    try {
      if (cropUrl) URL.revokeObjectURL(cropUrl);
    } catch {}
    const url = URL.createObjectURL(file);
    setCropTarget(target);
    setCropFile(file);
    setCropUrl(url);
    setCropZoom(1);
    setCropShift({ x: 0, y: 0 });
    setCropImg({ w: 0, h: 0 });
    setCropOpen(true);
    if (target === 'avatar') {
      setOriginalAvatarFile(file);
    } else if (target === 'cover') {
      setOriginalCoverFile(file);
    }
    try {
      const bitmap = await (async () => {
        try {
          return await createImageBitmap(file, { imageOrientation: 'from-image' } as any);
        } catch {
          return await createImageBitmap(file);
        }
      })();
      setCropImg({ w: bitmap.width || 0, h: bitmap.height || 0 });
      try {
        (bitmap as any)?.close?.();
      } catch {}
      return;
    } catch {}
    await new Promise<void>((resolve) => {
      const img = new Image();
      img.onload = () => {
        setCropImg({ w: img.naturalWidth || img.width || 0, h: img.naturalHeight || img.height || 0 });
        resolve();
      };
      img.onerror = () => resolve();
      img.src = url;
    });
  };

  const closeCrop = () => {
    const keep = false;
    cropDragRef.current.on = false;
    cropDragRef.current.pid = null;
    setCropOpen(false);
    setCropTarget(null);
    setCropFile(null);
    setCropZoom(1);
    setCropShift({ x: 0, y: 0 });
    setCropImg({ w: 0, h: 0 });
    if (!keep) {
      try {
        if (cropUrl) URL.revokeObjectURL(cropUrl);
      } catch {}
      setCropUrl('');
    }
  };

  const applyCrop = async () => {
    if (!cropTarget || !cropFile || !cropUrl) return;
    const wrapW = Number(cropWrapSize.w || 0);
    const wrapH = Number(cropWrapSize.h || 0);
    const iw = Number(cropImg.w || 0);
    const ih = Number(cropImg.h || 0);
    const zoom = clamp(Number(cropZoom || 1), 1, 3);
    const computeRect = () => {
      if (!(wrapW > 0 && wrapH > 0 && iw > 0 && ih > 0)) return null;
      const scale = Math.max(wrapW / iw, wrapH / ih) * zoom;
      const rw = iw * scale;
      const rh = ih * scale;
      const baseDx = (wrapW - rw) / 2;
      const baseDy = (wrapH - rh) / 2;
      const maxX = Math.abs(baseDx);
      const maxY = Math.abs(baseDy);
      const offX = clamp(Number(cropShift.x || 0), -maxX, maxX);
      const offY = clamp(Number(cropShift.y || 0), -maxY, maxY);
      const dx = baseDx + offX;
      const dy = baseDy + offY;
      const sx = clamp((-dx) / scale, 0, iw);
      const sy = clamp((-dy) / scale, 0, ih);
      const sw = clamp(wrapW / scale, 0.000001, iw);
      const sh = clamp(wrapH / scale, 0.000001, ih);
      const nx = clamp(sx / iw, 0, 1);
      const ny = clamp(sy / ih, 0, 1);
      const nw = clamp(sw / iw, 0.000001, 1);
      const nh = clamp(sh / ih, 0.000001, 1);
      return { x: nx, y: ny, w: nw, h: nh };
    };
    const rect = computeRect();
    if (cropTarget === 'avatar') {
      const blob = await imageFileToWebpBlob(cropFile, { width: 256, height: 256, quality: 0.82, cropRect: rect, fitMode: 'cover' } as any);
      const f = new File([blob], `avatar_${Date.now()}.webp`, { type: 'image/webp' });
      const preview = URL.createObjectURL(blob);
      try {
        if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl);
      } catch {}
      setAvatarFile(f);
      setAvatarPreviewUrl(preview);
      setAvatarCropRect(null);
      try {
        if (!supabaseBrowser) throw new Error('No se pudo iniciar sesión.');
        setIsAvatarAutoSaving(true);
        const { data } = await supabaseBrowser.auth.getUser();
        const user = data?.user;
        const userId = (user?.id || '').toString().trim();
        if (!userId) throw new Error('No pude identificar tu usuario.');
        const key = await uploadWebpToStorage(userId, 'avatar', blob);
        const upd = await supabaseBrowser.auth.updateUser({ data: { avatar_url: key } });
        if (upd.error) throw new Error(upd.error.message || 'No pude guardar tu foto.');
        try {
          URL.revokeObjectURL(preview);
        } catch {}
        setAvatarPreviewUrl('');
        setAvatarUrl(key);
        setAvatarFile(null);
        setOriginalAvatarFile(null);
      } catch (e: any) {
        alert(e instanceof Error ? e.message : 'No pude guardar tu foto.');
      } finally {
        setIsAvatarAutoSaving(false);
      }
    } else if (cropTarget === 'cover') {
      const blob = await imageFileToWebpBlob(cropFile, { width: 1610, height: 720, quality: 0.82, cropRect: rect, fitMode: 'cover' } as any);
      const f = new File([blob], `cover_${Date.now()}.webp`, { type: 'image/webp' });
      const preview = URL.createObjectURL(blob);
      try {
        if (coverPreviewUrl) URL.revokeObjectURL(coverPreviewUrl);
      } catch {}
      setCoverFile(f);
      setCoverPreviewUrl(preview);
      setCoverCropRect(rect);
    }
    cropDragRef.current.on = false;
    cropDragRef.current.pid = null;
    setCropOpen(false);
    setCropTarget(null);
    setCropFile(null);
    setCropUrl('');
    setCropZoom(1);
    setCropShift({ x: 0, y: 0 });
    setCropImg({ w: 0, h: 0 });
  };

  const imageFileToWebpBlob = async (
    file: File,
    opts: { width: number; height: number; quality: number; cropRect?: { x: number; y: number; w: number; h: number } | null }
  ) => {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(opts.width));
    canvas.height = Math.max(1, Math.floor(opts.height));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No pude preparar la imagen.');

    const dw = canvas.width;
    const dh = canvas.height;
    const fitMode = (opts as any)?.fitMode === 'contain' ? 'contain' : 'cover';

    const tryBitmap = async () => {
      try {
        return await createImageBitmap(file, { imageOrientation: 'from-image' } as any);
      } catch {
        return await createImageBitmap(file);
      }
    };

    const rect = opts.cropRect || null;
    try {
      const bitmap = await tryBitmap();
      const srcW = bitmap.width || 0;
      const srcH = bitmap.height || 0;
      if (fitMode === 'contain' && !rect && srcW > 0 && srcH > 0) {
        const scale = Math.min(dw / srcW, dh / srcH);
        const rw = srcW * scale;
        const rh = srcH * scale;
        const dx = (dw - rw) / 2;
        const dy = (dh - rh) / 2;
        ctx.drawImage(bitmap, dx, dy, rw, rh);
      } else if (rect && srcW > 0 && srcH > 0) {
        const rx = clamp(Number(rect.x || 0), 0, 1);
        const ry = clamp(Number(rect.y || 0), 0, 1);
        const rw = clamp(Number(rect.w || 1), 0.000001, 1);
        const rh = clamp(Number(rect.h || 1), 0.000001, 1);
        const sx = clamp(Math.round(rx * srcW), 0, Math.max(0, srcW - 1));
        const sy = clamp(Math.round(ry * srcH), 0, Math.max(0, srcH - 1));
        const sw = clamp(Math.round(rw * srcW), 1, Math.max(1, srcW - sx));
        const sh = clamp(Math.round(rh * srcH), 1, Math.max(1, srcH - sy));
        ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, dw, dh);
      } else {
        const scale = fitMode === 'contain' ? Math.min(dw / srcW, dh / srcH) : Math.max(dw / srcW, dh / srcH);
        const rw = srcW * scale;
        const rh = srcH * scale;
        const dx = (dw - rw) / 2;
        const dy = (dh - rh) / 2;
        ctx.drawImage(bitmap, dx, dy, rw, rh);
      }
      try {
        (bitmap as any)?.close?.();
      } catch {}
    } catch {
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
      const srcW = img.naturalWidth || img.width;
      const srcH = img.naturalHeight || img.height;
      if (fitMode === 'contain' && !rect && srcW > 0 && srcH > 0) {
        const scale = Math.min(dw / srcW, dh / srcH);
        const rw = srcW * scale;
        const rh = srcH * scale;
        const dx = (dw - rw) / 2;
        const dy = (dh - rh) / 2;
        ctx.drawImage(img, dx, dy, rw, rh);
      } else if (rect && srcW > 0 && srcH > 0) {
        const rx = clamp(Number(rect.x || 0), 0, 1);
        const ry = clamp(Number(rect.y || 0), 0, 1);
        const rw = clamp(Number(rect.w || 1), 0.000001, 1);
        const rh = clamp(Number(rect.h || 1), 0.000001, 1);
        const sx = clamp(Math.round(rx * srcW), 0, Math.max(0, srcW - 1));
        const sy = clamp(Math.round(ry * srcH), 0, Math.max(0, srcH - 1));
        const sw = clamp(Math.round(rw * srcW), 1, Math.max(1, srcW - sx));
        const sh = clamp(Math.round(rh * srcH), 1, Math.max(1, srcH - sy));
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, dw, dh);
      } else {
        const scale = fitMode === 'contain' ? Math.min(dw / srcW, dh / srcH) : Math.max(dw / srcW, dh / srcH);
        const rw = srcW * scale;
        const rh = srcH * scale;
        const dx = (dw - rw) / 2;
        const dy = (dh - rh) / 2;
        ctx.drawImage(img, dx, dy, rw, rh);
      }
    }

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
    const s = await ensureAnonSession();
    if (!s.ok) throw new Error(s.error || 'No se pudo iniciar sesión.');
    const base = kind === 'avatar' ? `avatars/${userId}` : `profile-covers/${userId}`;
    const path = `${base}/${kind}_${Date.now()}.webp`;
    
    const response = await fetch('/api/account/upload-profile-image', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'authorization': `Bearer ${s.session.access_token}`,
      },
      body: JSON.stringify({
        path,
        data: Array.from(new Uint8Array(await blob.arrayBuffer())),
        contentType: 'image/webp',
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({} as any));
      const msg = [err?.error, err?.detail].filter(Boolean).join(': ');
      throw new Error(msg || 'No pude subir la imagen.');
    }

    const out: any = await response.json().catch(() => ({} as any));
    const key = typeof out?.key === 'string' ? out.key.trim() : '';
    return key || path;
  };

  const save = async () => {
    if (!supabaseBrowser) return;
    const cleanName = (name || '').toString().trim().slice(0, 20);
    const cleanLastName = (lastName || '').toString().trim().slice(0, 30);
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
        const fileToProcess = originalAvatarFile || avatarFile;
        const blob =
          fileToProcess.type === 'image/webp' && !avatarCropRect
            ? fileToProcess
            : await imageFileToWebpBlob(fileToProcess, { width: 256, height: 256, quality: 0.82, cropRect: avatarCropRect, fitMode: 'cover' } as any);
        nextAvatarUrl = await uploadWebpToStorage(userId, 'avatar', blob);
      }
      if (coverFile) {
        const fileToProcess = originalCoverFile || coverFile;
        const blob =
          fileToProcess.type === 'image/webp' && !coverCropRect
            ? fileToProcess
            : await imageFileToWebpBlob(fileToProcess, { width: 1610, height: 720, quality: 0.82, cropRect: coverCropRect, fitMode: 'cover' } as any);
        nextCoverUrl = await uploadWebpToStorage(userId, 'cover', blob);
      }

      const upd = await supabaseBrowser.auth.updateUser({
        data: {
          full_name: cleanName,
          last_name: cleanLastName,
          username: cleanUsername,
          bio: (bio || '').toString().slice(0, 250),
          country: (country || '').toString().slice(0, 60),
          city: (city || '').toString().slice(0, 60),
          contact_email: (contactEmail || '').toString().slice(0, 120),
          contact_phone: (contactPhone || '').toString().slice(0, 40),
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
            <span className="text-slate-400 text-xs font-medium leading-tight max-w-[200px]">(Tamaño recomendado: 1610 × 720 px, máx. 10 MB)</span>
          </div>
          <button
            type="button"
            onClick={() => coverInputRef.current?.click()}
            className="w-full aspect-[1610/720] rounded-3xl bg-gradient-to-r from-indigo-500/20 via-fuchsia-500/10 to-yellow-500/10 relative flex items-center justify-center cursor-pointer overflow-hidden border border-white/10"
            disabled={isLoading || isSaving}
          >
            {(coverPreviewUrl || coverUrl) ? (
              <img src={r2ValueToProxyUrl(coverPreviewUrl || coverUrl)} alt="" className="absolute inset-0 w-full h-full object-cover" />
            ) : null}
            <div className="absolute inset-0 bg-black/35" />
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
              if (f.size > 25 * 1024 * 1024) {
                alert('La imagen es muy pesada. Usa una menor a 25 MB.');
                return;
              }
              openCrop('cover', f).catch(() => {});
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
                disabled={isLoading || isSaving || isAvatarAutoSaving}
              >
                {(avatarPreviewUrl || avatarUrl) ? (
                  <img src={r2ValueToProxyUrl(avatarPreviewUrl || avatarUrl)} alt="" className="w-full h-full object-cover" />
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
          {isAvatarAutoSaving ? <div className="mt-2 text-xs text-slate-300">Guardando tu foto…</div> : null}
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0] || null;
              e.currentTarget.value = '';
              if (!f) return;
              if (f.size > 25 * 1024 * 1024) {
                alert('La imagen es muy pesada. Usa una menor a 25 MB.');
                return;
              }
              openCrop('avatar', f).catch(() => {});
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

        {/* Last Name */}
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <h3 className="font-bold text-base">Apellidos</h3>
            <HelpCircle className="w-4 h-4 text-slate-500" />
          </div>
          <div className="flex items-center justify-between bg-white/5 rounded-xl px-4 py-3 border border-white/5">
            <input 
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value.substring(0, 30))}
              className="bg-transparent text-white outline-none flex-1 text-[15px]"
            />
            <span className="text-slate-500 text-sm ml-2">{lastName.length}/30</span>
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
          <h3 className="font-bold text-base mb-2">Biografía (público)</h3>
          <div className="bg-white/5 rounded-xl p-4 border border-white/5 relative">
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value.substring(0, 250))}
              placeholder="Escribe tu biografía (esto se verá en tu perfil)"
              className="w-full bg-transparent text-[15px] placeholder:text-slate-500 outline-none min-h-[120px] text-white resize-none"
            />
            <div className="absolute bottom-3 right-4 text-slate-500 text-sm">
              {bio.length} / 250
            </div>
          </div>
        </div>

        <div>
          <h3 className="font-bold text-base mb-2">Información (opcional)</h3>
          <div className="grid grid-cols-1 gap-3">
            <div className="bg-white/5 rounded-xl px-4 py-3 border border-white/5">
              <div className="text-xs text-slate-400 font-semibold">País</div>
              <input
                type="text"
                value={country}
                onChange={(e) => setCountry(e.target.value.substring(0, 60))}
                placeholder="Ej: México"
                className="mt-1 w-full bg-transparent text-white outline-none text-[15px] placeholder:text-slate-500"
              />
            </div>
            <div className="bg-white/5 rounded-xl px-4 py-3 border border-white/5">
              <div className="text-xs text-slate-400 font-semibold">Ciudad</div>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value.substring(0, 60))}
                placeholder="Ej: Guadalajara"
                className="mt-1 w-full bg-transparent text-white outline-none text-[15px] placeholder:text-slate-500"
              />
            </div>
            <div className="bg-white/5 rounded-xl px-4 py-3 border border-white/5">
              <div className="text-xs text-slate-400 font-semibold">Correo de contacto</div>
              <input
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value.substring(0, 120))}
                placeholder="Ej: contacto@correo.com"
                className="mt-1 w-full bg-transparent text-white outline-none text-[15px] placeholder:text-slate-500"
              />
            </div>
            <div className="bg-white/5 rounded-xl px-4 py-3 border border-white/5">
              <div className="text-xs text-slate-400 font-semibold">Teléfono de contacto</div>
              <input
                type="tel"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value.substring(0, 40))}
                placeholder="Ej: +52 33 1234 5678"
                className="mt-1 w-full bg-transparent text-white outline-none text-[15px] placeholder:text-slate-500"
              />
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

      {cropOpen && (
        <div className="fixed inset-0 z-[300] bg-black/70 flex items-end md:items-center justify-center">
          <button className="absolute inset-0 w-full h-full" onClick={closeCrop} aria-label="Cerrar" />
          <div className="relative w-full md:max-w-[720px] bg-[#0a0a0a] border border-white/10 rounded-t-3xl md:rounded-3xl overflow-hidden max-h-[92vh] flex flex-col">
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <div className="text-white font-extrabold">Centrar imagen</div>
              <button
                onClick={closeCrop}
                className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-200"
              >
                ✕
              </button>
            </div>
            <div className="p-4 space-y-4 overflow-y-auto">
              <div className="text-[12px] text-slate-300">Mueve la imagen con el dedo y ajusta el zoom.</div>

              <div
                ref={cropWrapRef}
                className={cropTarget === 'cover' ? 'w-full aspect-[1610/720] rounded-3xl overflow-hidden bg-black/40 border border-white/10 touch-none select-none relative' : 'w-full max-w-[360px] mx-auto aspect-square rounded-3xl overflow-hidden bg-black/40 border border-white/10 touch-none select-none relative'}
                onPointerDown={(e) => {
                  if (!cropUrl) return;
                  cropDragRef.current.on = true;
                  cropDragRef.current.pid = e.pointerId;
                  cropDragRef.current.x = e.clientX;
                  cropDragRef.current.y = e.clientY;
                  cropDragRef.current.sx = cropShift.x;
                  cropDragRef.current.sy = cropShift.y;
                  try {
                    (e.currentTarget as any).setPointerCapture?.(e.pointerId);
                  } catch {}
                  e.preventDefault();
                }}
                onPointerMove={(e) => {
                  const drag = cropDragRef.current;
                  if (!drag.on) return;
                  if (drag.pid != null && e.pointerId !== drag.pid) return;
                  const w = Number(cropWrapSize.w || 0);
                  const h = Number(cropWrapSize.h || 0);
                  const iw = Number(cropImg.w || 0);
                  const ih = Number(cropImg.h || 0);
                  if (!(w > 0 && h > 0 && iw > 0 && ih > 0)) return;
                  const baseScale = Math.max(w / iw, h / ih) * clamp(cropZoom, 1, 3);
                  const rw = iw * baseScale;
                  const rh = ih * baseScale;
                  const baseDx = (w - rw) / 2;
                  const baseDy = (h - rh) / 2;
                  const maxX = Math.abs(baseDx);
                  const maxY = Math.abs(baseDy);
                  const dx = Number(e.clientX) - drag.x;
                  const dy = Number(e.clientY) - drag.y;
                  const nx = clamp(drag.sx + dx, -maxX, maxX);
                  const ny = clamp(drag.sy + dy, -maxY, maxY);
                  setCropShift({ x: nx, y: ny });
                }}
                onPointerUp={(e) => {
                  const drag = cropDragRef.current;
                  if (drag.pid != null && e.pointerId !== drag.pid) return;
                  cropDragRef.current.on = false;
                  cropDragRef.current.pid = null;
                }}
                onPointerCancel={(e) => {
                  const drag = cropDragRef.current;
                  if (drag.pid != null && e.pointerId !== drag.pid) return;
                  cropDragRef.current.on = false;
                  cropDragRef.current.pid = null;
                }}
              >
                {(() => {
                  const w = Number(cropWrapSize.w || 0);
                  const h = Number(cropWrapSize.h || 0);
                  const iw = Number(cropImg.w || 0);
                  const ih = Number(cropImg.h || 0);
                  const zoom = clamp(cropZoom, 1, 3);
                  if (!cropUrl || !(w > 0 && h > 0 && iw > 0 && ih > 0)) {
                    return <div className="absolute inset-0 flex items-center justify-center text-slate-400 text-sm font-semibold">Cargando…</div>;
                  }
                  const scale = Math.max(w / iw, h / ih) * zoom;
                  const rw = iw * scale;
                  const rh = ih * scale;
                  const baseDx = (w - rw) / 2;
                  const baseDy = (h - rh) / 2;
                  const maxX = Math.abs(baseDx);
                  const maxY = Math.abs(baseDy);
                  const offX = clamp(Number(cropShift.x || 0), -maxX, maxX);
                  const offY = clamp(Number(cropShift.y || 0), -maxY, maxY);
                  const dx = baseDx + offX;
                  const dy = baseDy + offY;
                  return (
                    <>
                      <img
                        src={cropUrl}
                        alt=""
                        className="absolute"
                        style={{ left: `${dx}px`, top: `${dy}px`, width: `${rw}px`, height: `${rh}px`, willChange: 'transform,left,top' }}
                        draggable={false}
                      />
                      <div className="absolute inset-0 pointer-events-none ring-2 ring-white/15 rounded-3xl" />
                    </>
                  );
                })()}
              </div>

              <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
                <div className="flex items-center justify-between text-xs text-slate-300 font-semibold">
                  <div>Zoom</div>
                  <div>{Math.round(clamp(cropZoom, 1, 3) * 100)}%</div>
                </div>
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.01}
                  value={cropZoom}
                  onChange={(e) => setCropZoom(Number(e.target.value))}
                  className="w-full mt-3"
                />
                <button
                  type="button"
                  onClick={() => setCropShift({ x: 0, y: 0 })}
                  className="mt-3 w-full bg-white/10 hover:bg-white/15 border border-white/10 rounded-full h-[44px] text-white font-extrabold"
                >
                  Centrar
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={closeCrop}
                  className="w-full bg-white/5 hover:bg-white/10 border border-white/10 rounded-full h-[46px] text-slate-200 font-extrabold"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => applyCrop().catch(() => {})}
                  className="w-full bg-green-500 hover:bg-green-400 rounded-full h-[46px] text-black font-extrabold"
                >
                  Usar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
