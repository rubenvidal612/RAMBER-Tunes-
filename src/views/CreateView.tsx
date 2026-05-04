import { useEffect, useRef, useState } from 'react';
import { Dices, RefreshCw, Plus, ListMusic, Music, Maximize2, List, X, ChevronDown, User, AudioLines, Pencil, Library, Trash2, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { type CreateMode, type SongItem } from '@/types';
import { ensureAnonSession, getAccessToken, supabaseBrowser } from '@/lib/supabaseBrowser';

function normalizeLyricsTags(t: string) {
  const lines = (t || '').toString().replaceAll('\r\n', '\n').split('\n');
  const mapped = lines.map((line) => {
    const s = line.trim();
    if (!s) return '';
    const lower = s.toLowerCase();
    const isTag =
      lower === 'coro' ||
      lower.startsWith('coro ') ||
      lower === 'chorus' ||
      lower.startsWith('chorus ') ||
      lower.startsWith('verso') ||
      lower.startsWith('verse') ||
      lower.startsWith('pre-coro') ||
      lower.startsWith('pre coro') ||
      lower.startsWith('bridge') ||
      lower.startsWith('puente') ||
      lower.startsWith('outro') ||
      lower.startsWith('intro');
    if (isTag && !s.startsWith('[')) return `[${s.replaceAll(':', '').trim()}]`;
    if (s.startsWith('[') && s.endsWith(']')) return s;
    if (s.endsWith(':') && s.length < 20) return `[${s.slice(0, -1).trim()}]`;
    return line;
  });
  return mapped.join('\n').replaceAll(/\n{3,}/g, '\n\n').trim();
}

function stripTitleFromLyrics(title: string, lyrics: string) {
  const t = (title || '').toString().trim().toLowerCase();
  if (!t) return lyrics;
  const lines = (lyrics || '').toString().replaceAll('\r\n', '\n').split('\n');
  const first = (lines[0] || '').trim();
  const firstLower = first.toLowerCase();
  if (!first) return lyrics;
  if (firstLower === t) return lines.slice(1).join('\n').trim();
  if (firstLower === `titulo: ${t}` || firstLower === `título: ${t}`) return lines.slice(1).join('\n').trim();
  if (firstLower.startsWith(`${t} -`) || firstLower.startsWith(`${t}:`)) return lines.slice(1).join('\n').trim();
  return lyrics;
}

interface CreateViewProps {
  onSongCreated?: (song: SongItem, audioBlob?: Blob) => void;
  credits?: number;
  openPersonaPickerSignal?: number;
  onGoLibrary?: () => void;
  onOpenBalance?: () => void;
  prefill?: { type: 'cover'; song: SongItem };
  prefillNonce?: number;
}

export function CreateView({ onSongCreated, credits, openPersonaPickerSignal, onGoLibrary, onOpenBalance, prefill, prefillNonce }: CreateViewProps) {
  const [mode, setMode] = useState<CreateMode>('personalizado');
  const [instrumental, setInstrumental] = useState(false);
  const [description, setDescription] = useState('');
  const [instructions, setInstructions] = useState('');
  
  const [title, setTitle] = useState('');
  const [lyrics, setLyrics] = useState('');
  const [gender, setGender] = useState<'Masculino' | 'Femenino'>('Masculino');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTranscribingAudioLyrics, setIsTranscribingAudioLyrics] = useState(false);
  const lastTranscribedKeyRef = useRef<string>('');
  const [hasPendingTask, setHasPendingTask] = useState(false);
  const pendingListKey = 'ramber.pendingSunoTasks_v1';
  const pendingLegacyKey = 'ramber.pendingSunoTask';
  const [isBoostingStyle, setIsBoostingStyle] = useState(false);
  
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioUploadUrl, setAudioUploadUrl] = useState<string>('');
  const [audioUploadPath, setAudioUploadPath] = useState<string>('');
  const [externalAudioLabel, setExternalAudioLabel] = useState<string>('');
  const [audioDurationSec, setAudioDurationSec] = useState<number>(0);
  const [isUploadingAudio, setIsUploadingAudio] = useState(false);
  const [audioAction, setAudioAction] = useState<'cover' | 'instrumental' | 'vocals' | 'extend' | 'library'>('cover');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isAudioModalOpen, setIsAudioModalOpen] = useState(false);
  const [audioUploadError, setAudioUploadError] = useState<string | null>(null);
  const savedUploadsKey = 'ramber.saved_uploads_v1';
  const [savedUploadKey, setSavedUploadKey] = useState<string>('');

  const [model, setModel] = useState<'V5' | 'V5_5' | 'V4_5PLUS' | 'V4_5ALL' | 'V4_5' | 'V4'>('V5');
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
  const modelBtnRef = useRef<HTMLButtonElement | null>(null);
  const modelMenuRef = useRef<HTMLDivElement | null>(null);

  const [weirdness, setWeirdness] = useState(50);
  const [styleInfluence, setStyleInfluence] = useState(50);
  const [audioInfluence, setAudioInfluence] = useState(25);
  const [showMoreOptions, setShowMoreOptions] = useState(false);

  const [isPersonaPickerOpen, setIsPersonaPickerOpen] = useState(false);
  const [personas, setPersonas] = useState<Array<{ persona_id: string; name: string; photo_url?: string }>>([]);
  const [selectedPersona, setSelectedPersona] = useState<{ persona_id: string; name: string; photo_url?: string } | null>(null);

  const audioInputRef = useRef<HTMLInputElement | null>(null);
  const uploadXhrRef = useRef<XMLHttpRequest | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('ramber_create_draft_v1');
      if (!raw) return;
      const d = JSON.parse(raw);
      const m = typeof d?.mode === 'string' ? d.mode : '';
      if (m === 'simple' || m === 'personalizado') setMode(m);
      setInstrumental(Boolean(d?.instrumental));
      if (typeof d?.description === 'string') setDescription(d.description);
      if (typeof d?.instructions === 'string') setInstructions(d.instructions);
      if (typeof d?.title === 'string') setTitle(d.title);
      if (typeof d?.lyrics === 'string') setLyrics(d.lyrics);
      const g = typeof d?.gender === 'string' ? d.gender : '';
      if (g === 'Masculino' || g === 'Femenino') setGender(g);
      const w = Number(d?.weirdness);
      const si = Number(d?.styleInfluence);
      const ai = Number(d?.audioInfluence);
      if (Number.isFinite(w)) setWeirdness(Math.max(0, Math.min(100, Math.round(w))));
      if (Number.isFinite(si)) setStyleInfluence(Math.max(0, Math.min(100, Math.round(si))));
      if (Number.isFinite(ai)) setAudioInfluence(Math.max(0, Math.min(100, Math.round(ai))));
      const pid = typeof d?.persona_id === 'string' ? d.persona_id : '';
      const pn = typeof d?.persona_name === 'string' ? d.persona_name : '';
      if (pid) setSelectedPersona({ persona_id: pid, name: pn || 'Persona' });
    } catch {
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        'ramber_create_draft_v1',
        JSON.stringify({
          mode,
          instrumental,
          description,
          instructions,
          title,
          lyrics: (lyrics || '').toString().slice(0, 20000),
          gender,
          weirdness,
          styleInfluence,
          audioInfluence,
          persona_id: selectedPersona?.persona_id || '',
          persona_name: selectedPersona?.name || '',
        }),
      );
    } catch {
    }
  }, [mode, instrumental, description, instructions, title, lyrics, gender, model, selectedPersona, weirdness, styleInfluence, audioInfluence]);

  useEffect(() => {
    if (!openPersonaPickerSignal) return;
    setIsPersonaPickerOpen(true);
  }, [openPersonaPickerSignal]);

  useEffect(() => {
    if (!prefillNonce) return;
    if (!prefill) return;
    if (prefill.type !== 'cover') return;
    const song = prefill.song;
    const url = (song?.audioUrl || '').toString().trim();
    if (!url) return;
    setMode('personalizado');
    setAudioAction('cover');
    setInstrumental(false);
    setAudioFile(null);
    setAudioUploadUrl(url);
    setAudioUploadPath('');
    setIsUploadingAudio(false);
    setUploadProgress(100);
    setExternalAudioLabel(song?.title ? `Cover de: ${song.title}` : 'Cover desde Biblioteca');
    setTitle((song?.title || 'Cover').toString().slice(0, 100));
    if (typeof song?.description === 'string') {
      setInstructions(song.description);
      setDescription(song.description);
    }
    if (typeof song?.lyrics === 'string') {
      setLyrics(song.lyrics);
    }
  }, [prefillNonce, prefill]);

  useEffect(() => {
    if (!isPersonaPickerOpen) return;
    if (!supabaseBrowser) return;
    ensureAnonSession()
      .then(async (s) => {
        if (!s.ok) return;
        const { data } = await supabaseBrowser.auth.getUser();
        const user = data?.user;
        if (!user) return;
        const { data: rows } = await supabaseBrowser
          .from('suno_personas')
          .select('persona_id, name, photo_url')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(50);
        const list = Array.isArray(rows)
          ? rows
              .map((r: any) => ({
                persona_id: String(r?.persona_id || '').trim(),
                name: String(r?.name || '').trim(),
                photo_url: typeof r?.photo_url === 'string' ? r.photo_url : '',
              }))
              .filter((x: any) => x.persona_id)
          : [];
        setPersonas(list);
        setSelectedPersona((prev) => {
          if (!prev?.persona_id) return prev;
          const match = list.find((p) => p.persona_id === prev.persona_id);
          if (!match) return prev;
          if (prev.photo_url) return prev;
          if (!match.photo_url) return prev;
          return { ...prev, photo_url: match.photo_url };
        });
      })
      .catch(() => {});
  }, [isPersonaPickerOpen]);

  useEffect(() => {
    if (!isModelMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as any;
      const btn = modelBtnRef.current;
      const menu = modelMenuRef.current;
      if (btn && (btn === t || btn.contains(t))) return;
      if (menu && (menu === t || menu.contains(t))) return;
      setIsModelMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [isModelMenuOpen]);

  const clearAudio = () => {
    try {
      uploadXhrRef.current?.abort();
    } catch {}
    uploadXhrRef.current = null;
    setAudioFile(null);
    setAudioUploadUrl('');
    setAudioUploadPath('');
    setExternalAudioLabel('');
    setAudioDurationSec(0);
    setIsUploadingAudio(false);
    setAudioAction('cover');
    setUploadProgress(0);
    setIsAudioModalOpen(false);
    setAudioUploadError(null);
    if (audioInputRef.current) audioInputRef.current.value = '';
  };

  const transcribeLyricsFromAudio = async (auto?: boolean) => {
    if (!audioUploadUrl) {
      if (!auto) alert('Primero sube tu audio.');
      return;
    }
    if (isTranscribingAudioLyrics) return;
    setIsTranscribingAudioLyrics(true);
    try {
      const t = await getAccessToken();
      if (!t.ok) {
        if (!auto) alert(t.error || 'No se pudo iniciar sesión.');
        return;
      }
      const guessMimeType = (u: string) => {
        const s = (u || '').toString().trim().toLowerCase();
        const q = s.split('?')[0].split('#')[0];
        if (q.endsWith('.mp3')) return 'audio/mpeg';
        if (q.endsWith('.wav')) return 'audio/wav';
        if (q.endsWith('.m4a')) return 'audio/mp4';
        if (q.endsWith('.mp4')) return 'audio/mp4';
        if (q.endsWith('.ogg')) return 'audio/ogg';
        if (q.endsWith('.webm')) return 'audio/webm';
        return '';
      };
      const mimeType = ((audioFile?.type || '').toString().trim() || guessMimeType(audioUploadUrl)).trim();
      const r = await fetch('/api/ai/transcribe-lyrics', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${t.token}` },
        body: JSON.stringify({ uploadUrl: audioUploadUrl, mimeType }),
      });
      const out = await r.json().catch(() => ({}));
      if (!r.ok || out?.ok === false) {
        if (!auto) alert((out?.message || out?.detail || out?.error || 'No se pudo transcribir la letra.').toString());
        return;
      }
      const status = (out?.status || '').toString().trim().toUpperCase();
      if (status === 'ILEGIBLE' || status === 'SIN_LETRA') {
        if (!auto) alert((out?.message || 'No se pudo transcribir la letra.').toString());
        return;
      }
      const text = (out?.lyrics || '').toString().trim();
      if (!text) {
        if (!auto) alert('No detecté letra en ese audio.');
        return;
      }
      setLyrics(text);
    } catch (e) {
      if (!auto) alert(e instanceof Error ? e.message : 'Error transcribiendo la letra.');
    } finally {
      setIsTranscribingAudioLyrics(false);
    }
  };

  useEffect(() => {
    const readList = () => {
      try {
        const raw = window.localStorage.getItem(pendingListKey);
        const arr = raw ? JSON.parse(raw) : null;
        return Array.isArray(arr) ? arr : [];
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
    const tick = () => {
      const list = migrateLegacyIfNeeded();
      setHasPendingTask(Array.isArray(list) && list.length > 0);
    };
    tick();
    const id = window.setInterval(tick, 1500);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!audioUploadUrl) return;
    if (!audioFile) return;
    setUploadProgress(100);
  }, [audioUploadUrl, audioFile]);

  useEffect(() => {
    if (!audioUploadUrl) return;
    if (!audioFile) return;
    const key = (audioUploadPath || audioUploadUrl).toString().trim();
    if (!key) return;
    if (lastTranscribedKeyRef.current === key) return;
    lastTranscribedKeyRef.current = key;
    transcribeLyricsFromAudio(true).catch(() => {});
  }, [audioUploadUrl, audioUploadPath, audioFile]);

  useEffect(() => {
    if (!onSongCreated) return;
    if (!audioFile) return;
    if (!audioUploadUrl) return;
    const key = (audioUploadPath || audioUploadUrl).toString().trim();
    if (!key) return;
    if (savedUploadKey && savedUploadKey === key) return;
    try {
      const raw = window.localStorage.getItem(savedUploadsKey);
      const list = raw ? JSON.parse(raw) : [];
      const arr = Array.isArray(list) ? list : [];
      if (arr.includes(key)) {
        setSavedUploadKey(key);
        return;
      }
      const titleFromFile = (audioFile.name || 'Audio').toString().slice(0, 120);
      onSongCreated({
        id: `upload_${Date.now()}`,
        title: titleFromFile,
        description: 'Audio subido',
        lyrics: undefined,
        genre: gender,
        audioUrl: audioUploadUrl,
        coverUrl: makeAudioCoverSvgUrl(titleFromFile),
        sunoTaskId: null,
        sunoAudioId: null,
        isCover: false,
      });
      const next = [...arr, key].slice(-80);
      window.localStorage.setItem(savedUploadsKey, JSON.stringify(next));
      setSavedUploadKey(key);
    } catch {
    }
  }, [audioUploadUrl, audioUploadPath, audioFile, gender, onSongCreated, savedUploadKey]);

  const makeAudioCoverSvgUrl = (seed: string) => {
    const s = (seed || 'audio').toString().slice(0, 80);
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    const hue1 = h % 360;
    const hue2 = (hue1 + 50) % 360;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue1} 80% 55%)"/><stop offset="1" stop-color="hsl(${hue2} 80% 45%)"/></linearGradient></defs><rect width="512" height="512" rx="48" fill="url(#g)"/><rect x="0" y="0" width="512" height="512" rx="48" fill="rgba(0,0,0,0.25)"/><g fill="rgba(255,255,255,0.95)"><path d="M214 174c0-10 8-18 18-18h48c10 0 18 8 18 18v140c0 29-24 52-52 52s-52-23-52-52 24-52 52-52c12 0 23 4 32 10V174h-44v0z"/></g><text x="36" y="470" font-family="system-ui, -apple-system, Segoe UI, Roboto, Arial" font-size="44" font-weight="800" fill="rgba(255,255,255,0.9)">RAMBER</text></svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  };

  const getAudioDurationSeconds = (file: File) =>
    new Promise<number>((resolve) => {
      try {
        const url = URL.createObjectURL(file);
        const a = document.createElement('audio');
        a.preload = 'metadata';
        a.onloadedmetadata = () => {
          const d = Number(a.duration || 0);
          try {
            URL.revokeObjectURL(url);
          } catch {}
          resolve(Number.isFinite(d) ? d : 0);
        };
        a.onerror = () => {
          try {
            URL.revokeObjectURL(url);
          } catch {}
          resolve(0);
        };
        a.src = url;
      } catch {
        resolve(0);
      }
    });

  const uploadAudio = async (file: File) => {
    if (!supabaseBrowser) {
      setAudioUploadError('Supabase no está configurado.');
      alert('Supabase no está configurado.');
      return;
    }
    setAudioUploadError(null);
    setIsUploadingAudio(true);
    setAudioUploadUrl('');
    setAudioUploadPath('');
    setUploadProgress(0);
    try {
      const s = await ensureAnonSession();
      if (!s.ok) {
        setAudioUploadError(s.error || 'No se pudo iniciar sesión.');
        alert(s.error || 'No se pudo iniciar sesión.');
        return;
      }
      const t = await getAccessToken();
      if (!t.ok) {
        setAudioUploadError(t.error || 'No se pudo iniciar sesión.');
        alert(t.error || 'No se pudo iniciar sesión.');
        return;
      }
      const { data } = await supabaseBrowser.auth.getUser();
      const user = data?.user;
      if (!user) {
        setAudioUploadError('No se pudo identificar tu usuario.');
        alert('No se pudo identificar tu usuario.');
        return;
      }
      const safeName = (file.name || 'audio')
        .trim()
        .replaceAll(/[^a-zA-Z0-9._-]+/g, '_')
        .slice(0, 80);
      const path = `uploads/${user.id}/${Date.now()}_${safeName}`;

      const supabaseUrl = ((process.env.SUPABASE_URL as any) || '').toString().trim();
      const supabaseAnonKey = ((process.env.SUPABASE_ANON_KEY as any) || '').toString().trim();

      const tryXhr = Boolean(supabaseUrl && supabaseAnonKey);
      if (tryXhr) {
        await new Promise<void>((resolve, reject) => {
          try {
            const xhr = new XMLHttpRequest();
            uploadXhrRef.current = xhr;
            const url = `${supabaseUrl.replace(/\/+$/g, '')}/storage/v1/object/ramber-tunes/${encodeURI(path)}`;
            xhr.open('POST', url);
            xhr.setRequestHeader('authorization', `Bearer ${t.token}`);
            xhr.setRequestHeader('apikey', supabaseAnonKey);
            xhr.setRequestHeader('x-upsert', 'true');
            xhr.setRequestHeader('cache-control', '31536000');
            xhr.setRequestHeader('content-type', file.type || 'application/octet-stream');
            xhr.upload.onprogress = (e) => {
              if (!e.lengthComputable) return;
              const pct = Math.max(0, Math.min(100, Math.round((e.loaded / e.total) * 100)));
              setUploadProgress(pct);
            };
            xhr.onerror = () => reject(new Error('No se pudo subir el audio.'));
            xhr.onload = () => {
              if (xhr.status >= 200 && xhr.status < 300) return resolve();
              const txt = (xhr.responseText || '').toString();
              reject(new Error(txt || `HTTP ${xhr.status}`));
            };
            xhr.send(file);
          } catch (e) {
            reject(e instanceof Error ? e : new Error('No se pudo subir el audio.'));
          }
        });
      } else {
        const { error } = await supabaseBrowser.storage.from('ramber-tunes').upload(path, file, {
          upsert: true,
          contentType: file.type || undefined,
          cacheControl: '31536000',
        });
        if (error) {
          const raw = (error.message || '').toString();
          const msg = raw.toLowerCase().includes('bucket not found')
            ? 'No existe el bucket "ramber-tunes" en Supabase Storage. Crea el bucket y vuelve a intentar.'
            : raw || 'No se pudo subir el audio.';
          setAudioUploadError(msg);
          alert(msg);
          return;
        }
      }

      const { data: pub } = supabaseBrowser.storage.from('ramber-tunes').getPublicUrl(path);
      const url = (pub?.publicUrl || '').toString();
      if (!url) {
        setAudioUploadError('No pude obtener el link del audio subido.');
        alert('No pude obtener el link del audio subido.');
        return;
      }
      setAudioUploadUrl(url);
      setAudioUploadPath(path);
      setAudioUploadError(null);
    } finally {
      setIsUploadingAudio(false);
      uploadXhrRef.current = null;
    }
  };

  const pickAudio = async (file: File) => {
    setAudioFile(file);
    setAudioUploadUrl('');
    setAudioAction('cover');
    setUploadProgress(0);
    setIsAudioModalOpen(true);
    setAudioUploadError(null);
    getAudioDurationSeconds(file).then((d) => setAudioDurationSec(d)).catch(() => {});
    uploadAudio(file).catch(() => {});
  };

  const saveUploadedAudioToLibrary = async () => {
    if (!onSongCreated) return;
    if (!audioFile) return;
    if (!audioUploadUrl) {
      alert('Todavía se está subiendo el audio. Espera un momento.');
      return;
    }
    const titleFromFile = (audioFile.name || 'Audio').toString().slice(0, 120);
    onSongCreated({
      id: `upload_${Date.now()}`,
      title: titleFromFile,
      description: (instructions || 'Audio subido').toString().slice(0, 2000),
      lyrics: lyrics || undefined,
      genre: gender,
      audioUrl: audioUploadUrl,
      coverUrl: makeAudioCoverSvgUrl(titleFromFile),
      sunoTaskId: null,
      sunoAudioId: null,
      isCover: false,
    });
    clearAudio();
    onGoLibrary?.();
  };

  const continueFromAudio = async () => {
    if (audioAction === 'library') return saveUploadedAudioToLibrary();
    setIsAudioModalOpen(false);
  };

  const handleAddVocalsFromAudio = async () => {
    if (!onSongCreated) return;
    if (!audioUploadUrl) {
      alert('Primero sube tu audio.');
      return;
    }
    const baseLyrics = normalizeLyricsTags(stripTitleFromLyrics(title, (lyrics || '').toString()));
    const prompt = (baseLyrics || description || ' ').trim();
    if (!prompt) {
      alert('Escribe una descripción o letras para guiar las voces.');
      return;
    }
    const style = (instructions || 'General').trim() || 'General';
    const titleFromFile = (audioFile?.name || title || 'Voces').toString().slice(0, 100);
    setIsSubmitting(true);
    try {
      const t = await getAccessToken();
      if (!t.ok) {
        alert(t.error || 'No se pudo iniciar sesión.');
        return;
      }

      const payload: any = {
        uploadUrl: audioUploadUrl,
        uploadBucket: audioUploadPath ? 'ramber-tunes' : undefined,
        uploadPath: audioUploadPath || undefined,
        prompt,
        style,
        title: titleFromFile,
        negativeTags: 'None',
        vocalGender: gender === 'Femenino' ? 'f' : gender === 'Masculino' ? 'm' : undefined,
        model,
        weirdnessConstraint: weirdness / 100,
        styleWeight: styleInfluence / 100,
        audioWeight: audioInfluence / 100,
      };

      const r = await fetch('/api/suno/add-vocals', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${t.token}`,
        },
        body: JSON.stringify(payload),
      });

      const out = await r.json().catch(() => ({}));
      if (!r.ok) {
        const msg = (out?.detail || out?.error || 'No se pudo agregar voces.').toString();
        alert(msg);
        return;
      }

      const taskId = (out?.taskId || '').toString();
      if (!taskId) {
        alert('No recibí taskId del proveedor.');
        return;
      }

      const pendingRaw = window.localStorage.getItem(pendingListKey);
      const pending = (() => {
        try {
          return JSON.parse(pendingRaw || '[]');
        } catch {
          return [];
        }
      })();
      const next = Array.isArray(pending) ? pending : [];
      next.push({
        taskId,
        kind: 'add-vocals',
        startedAt: Date.now(),
        draft: {
          title: titleFromFile,
          description: style,
          lyrics: prompt,
          genre: gender,
          isCover: false,
        },
      });
      window.localStorage.setItem(pendingListKey, JSON.stringify(next.slice(-10)));

      setIsAudioModalOpen(false);
      onGoLibrary?.();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBoostStyle = async () => {
    const content = (instructions || '').trim();
    if (!content) {
      alert('Escribe algo en "Instrucciones" primero.');
      return;
    }
    setIsBoostingStyle(true);
    try {
      const t = await getAccessToken();
      if (!t.ok) {
        alert(t.error || 'No se pudo iniciar sesión.');
        return;
      }
      const r = await fetch('/api/suno/boost-style', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${t.token}` },
        body: JSON.stringify({ content }),
      });
      const out = await r.json().catch(() => ({}));
      if (!r.ok) {
        alert((out?.detail || out?.error || 'No se pudo optimizar el estilo.').toString());
        return;
      }
      const result = (out?.result || out?.data?.result || '').toString().trim();
      if (!result) {
        alert('No recibí resultado del estilo.');
        return;
      }
      setInstructions(result);
    } finally {
      setIsBoostingStyle(false);
    }
  };

  const handleAddInstrumentalFromAudio = async () => {
    if (!onSongCreated) return;
    if (!audioUploadUrl) {
      alert('Primero sube tu audio.');
      return;
    }
    setIsSubmitting(true);
    try {
      const t = await getAccessToken();
      if (!t.ok) {
        alert(t.error || 'No se pudo iniciar sesión.');
        return;
      }

      const titleFromFile = (audioFile?.name || title || 'Instrumental').toString().slice(0, 100);
      const tags = (instructions || 'Instrumental').trim() || 'Instrumental';
      const payload: any = {
        uploadUrl: audioUploadUrl,
        uploadBucket: audioUploadPath ? 'ramber-tunes' : undefined,
        uploadPath: audioUploadPath || undefined,
        title: titleFromFile,
        tags,
        negativeTags: 'None',
        vocalGender: gender === 'Femenino' ? 'f' : gender === 'Masculino' ? 'm' : undefined,
        model,
        weirdnessConstraint: weirdness / 100,
        styleWeight: styleInfluence / 100,
        audioWeight: audioInfluence / 100,
      };

      const r = await fetch('/api/suno/add-instrumental', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${t.token}`,
        },
        body: JSON.stringify(payload),
      });

      const out = await r.json().catch(() => ({}));
      if (!r.ok) {
        const msg = (out?.detail || out?.error || 'No se pudo generar el instrumental.').toString();
        alert(msg);
        return;
      }

      const taskId = (out?.taskId || '').toString();
      if (!taskId) {
        alert('No recibí taskId del proveedor.');
        return;
      }

      const pendingRaw = window.localStorage.getItem(pendingListKey);
      const pending = (() => {
        try {
          return JSON.parse(pendingRaw || '[]');
        } catch {
          return [];
        }
      })();
      const next = Array.isArray(pending) ? pending : [];
      next.push({
        taskId,
        kind: 'add-instrumental',
        startedAt: Date.now(),
        draft: {
          title: titleFromFile,
          description: tags,
          lyrics: '',
          genre: gender,
          isCover: false,
        },
      });
      window.localStorage.setItem(pendingListKey, JSON.stringify(next.slice(-10)));

      setIsAudioModalOpen(false);
      onGoLibrary?.();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCoverFromAudio = async () => {
    if (!onSongCreated) return;
    if (!audioUploadUrl) {
      alert('Primero sube tu audio.');
      return;
    }
    const dur = Number(audioDurationSec || 0);
    if (Number.isFinite(dur) && dur > 0) {
      if (dur > 60 * 8) {
        alert('Tu audio dura más de 8 minutos. El cover solo permite hasta 8 minutos.');
        return;
      }
      if (model === 'V4_5ALL' && dur > 60) {
        alert('Con el modelo V4.5 ALL el audio debe durar máximo 1 minuto. Cambia de modelo o usa un audio más corto.');
        return;
      }
    }
    setIsSubmitting(true);
    try {
      const t = await getAccessToken();
      if (!t.ok) {
        alert(t.error || 'No se pudo iniciar sesión.');
        return;
      }

      const baseLyrics = normalizeLyricsTags(stripTitleFromLyrics(title, (lyrics || '').toString()));
      const prompt = (baseLyrics || description || ' ').trim() || ' ';
      const payload: any = {
        uploadUrl: audioUploadUrl,
        uploadBucket: audioUploadPath ? 'ramber-tunes' : undefined,
        uploadPath: audioUploadPath || undefined,
        instrumental,
        prompt,
        style: (instructions || 'General').trim(),
        title: (title || 'Cover').trim(),
        model,
        weirdnessConstraint: weirdness / 100,
        styleWeight: styleInfluence / 100,
        audioWeight: audioInfluence / 100,
      };
      if (selectedPersona?.persona_id) {
        payload.personaId = selectedPersona.persona_id;
        payload.personaModel = 'voice_persona';
      }

      const r = await fetch('/api/suno/upload-cover', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${t.token}`,
        },
        body: JSON.stringify(payload),
      });
      const out = await r.json().catch(() => ({}));
      if (!r.ok) {
        const msg = (out?.detail || out?.error || 'No se pudo hacer el cover.').toString();
        alert(msg);
        return;
      }
      const taskId = typeof out?.taskId === 'string' ? out.taskId : '';
      if (!taskId) {
        alert('No recibí taskId del servidor.');
        return;
      }
      try {
        const raw = window.localStorage.getItem(pendingListKey);
        const arr = raw ? JSON.parse(raw) : [];
        const list = Array.isArray(arr) ? arr : [];
        list.push({
          taskId,
          kind: 'upload-cover',
          startedAt: Date.now(),
          draft: {
            title: (title || 'Cover').toString(),
            description: (instructions || 'Cover').toString(),
            lyrics: (baseLyrics || '').toString() || null,
            genre: gender,
            isCover: true,
          },
        });
        window.localStorage.setItem(pendingListKey, JSON.stringify(list));
        try {
          window.localStorage.removeItem(pendingLegacyKey);
        } catch {
        }
      } catch {
      }
      onGoLibrary?.();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error haciendo cover');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreate = async () => {
    if (!onSongCreated) return;

    if (audioUploadUrl) {
      if (audioAction === 'cover') return handleCoverFromAudio();
      if (audioAction === 'instrumental') return handleAddInstrumentalFromAudio();
      if (audioAction === 'vocals') return handleAddVocalsFromAudio();
      if (audioAction === 'extend') {
        alert('Extender: Próximamente');
        return;
      }
    }

    const baseLyrics = normalizeLyricsTags(stripTitleFromLyrics(title, (lyrics || '').toString()));
    const prompt = (mode === 'simple' ? description : (baseLyrics || description)).trim();
    if (!prompt) {
      alert('Escribe una descripción o letra para crear la canción.');
      return;
    }

    setIsSubmitting(true);
    try {
      const t = await getAccessToken();
      if (!t.ok) {
        alert(t.error || 'No se pudo iniciar sesión.');
        return;
      }

      const wantsCustomMode = mode === 'personalizado';
      const payload: any = {
        prompt,
        instrumental,
        customMode: wantsCustomMode,
        model,
      };
      if (wantsCustomMode) {
        payload.style = (instructions || 'General').trim();
        payload.title = (title || 'Nueva Canción').trim();
        payload.weirdnessConstraint = weirdness / 100;
        payload.styleWeight = styleInfluence / 100;
        payload.audioWeight = audioInfluence / 100;
      }
      if (selectedPersona?.persona_id) {
        payload.personaId = selectedPersona.persona_id;
        payload.personaModel = 'voice_persona';
      }

      const r = await fetch('/api/suno/generate', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${t.token}`,
        },
        body: JSON.stringify(payload),
      });
      const out = await r.json().catch(() => ({}));
      if (!r.ok) {
        const msg = (out?.detail || out?.error || 'No se pudo crear la canción.').toString();
        alert(msg);
        return;
      }

      const taskId = typeof out?.taskId === 'string' ? out.taskId : '';
      if (!taskId) {
        alert('No recibí taskId del servidor.');
        return;
      }
      try {
        const raw = window.localStorage.getItem(pendingListKey);
        const arr = raw ? JSON.parse(raw) : [];
        const list = Array.isArray(arr) ? arr : [];
        list.push({
          taskId,
          kind: 'generate',
          startedAt: Date.now(),
          draft: {
            title: (title || 'Nueva Canción').toString(),
            description: (mode === 'simple' ? description : instructions).toString(),
            lyrics: mode === 'personalizado' ? (baseLyrics || '').toString() || null : null,
            genre: gender,
            isCover: Boolean(audioFile || audioUploadUrl),
          },
        });
        window.localStorage.setItem(pendingListKey, JSON.stringify(list));
        try {
          window.localStorage.removeItem(pendingLegacyKey);
        } catch {
        }
      } catch {
      }
      onGoLibrary?.();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error creando la canción');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col relative overflow-y-auto">
      {/* Top Header Tabs */}
      <div className="flex items-center justify-between px-4 mt-4 mb-4">
        <div className="flex bg-white/5 rounded-full p-1 border border-white/5">
          <button 
            onClick={() => setMode('simple')}
            className={cn(
              "px-5 py-1.5 rounded-full text-sm font-semibold transition-colors",
              mode === 'simple' ? "bg-white text-black" : "text-slate-300 hover:text-white"
            )}
          >
            Simple
          </button>
          <button 
            onClick={() => setMode('personalizado')}
            className={cn(
              "px-5 py-1.5 rounded-full text-sm font-semibold transition-colors",
              mode === 'personalizado' ? "bg-white text-black" : "text-slate-300 hover:text-white"
            )}
          >
            Personalizado
          </button>
        </div>
        
        <div className="relative">
          <div className="border border-white/20 hover:border-white/40 block rounded-full px-3 py-1.5 hover:bg-white/5 transition-colors md:hidden">
            <div className="flex items-center gap-2">
              <select
                value={model}
                onChange={(e) => {
                  const v = e.target.value as any;
                  setModel(v);
                }}
                className="bg-transparent text-xs font-semibold text-slate-200 outline-none appearance-none pr-4"
              >
                <option value="V5_5">V5.5</option>
                <option value="V5">V5</option>
                <option value="V4_5PLUS">V4.5+</option>
                <option value="V4_5ALL">V4.5 All</option>
                <option value="V4_5">V4.5</option>
                <option value="V4">V4</option>
              </select>
              <ChevronDown className="w-4 h-4 text-slate-200 -ml-3 pointer-events-none" />
            </div>
          </div>

          <button
            ref={modelBtnRef}
            type="button"
            onClick={() => setIsModelMenuOpen((v) => !v)}
            className="hidden md:flex items-center gap-2 border border-white/20 hover:border-white/40 rounded-full px-3 py-1.5 hover:bg-white/5 transition-colors"
          >
            <span className="text-xs font-semibold text-slate-200">{model === 'V5_5' ? 'V5.5' : model === 'V4_5PLUS' ? 'V4.5+' : model === 'V4_5ALL' ? 'V4.5 All' : model === 'V4_5' ? 'V4.5' : model}</span>
            <ChevronDown className={cn("w-4 h-4 text-slate-200 transition-transform", isModelMenuOpen ? "rotate-180" : "rotate-0")} />
          </button>

          {isModelMenuOpen && (
            <div
              ref={modelMenuRef}
              className="hidden md:block absolute right-0 mt-2 w-[160px] bg-[#0b0f16] border border-white/10 rounded-2xl overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.55)] z-[90]"
            >
              {[
                { value: 'V5_5', label: 'V5.5' },
                { value: 'V5', label: 'V5' },
                { value: 'V4_5PLUS', label: 'V4.5+' },
                { value: 'V4_5ALL', label: 'V4.5 All' },
                { value: 'V4_5', label: 'V4.5' },
                { value: 'V4', label: 'V4' },
              ].map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => {
                    setModel(m.value as any);
                    setIsModelMenuOpen(false);
                  }}
                  className={cn(
                    "w-full text-left px-4 py-3 text-sm hover:bg-white/5 transition-colors",
                    model === (m.value as any) ? "text-emerald-300" : "text-slate-200"
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="px-4 space-y-4 pb-[220px] md:pb-32">
        {mode === 'simple' ? (
          <SimpleForm instrumental={instrumental} setInstrumental={setInstrumental} description={description} setDescription={setDescription} />
        ) : (
          <CustomForm 
            instrumental={instrumental} 
            setInstrumental={setInstrumental}
            description={description}
            lyrics={lyrics}
            setLyrics={setLyrics}
            gender={gender}
            setGender={setGender}
            title={title}
            setTitle={setTitle}
            instructions={instructions}
            setInstructions={setInstructions}
            isBoostingStyle={isBoostingStyle}
            onBoostStyle={handleBoostStyle}
            showMoreOptions={showMoreOptions}
            setShowMoreOptions={setShowMoreOptions}
            weirdness={weirdness}
            setWeirdness={setWeirdness}
            styleInfluence={styleInfluence}
            setStyleInfluence={setStyleInfluence}
            audioInfluence={audioInfluence}
            setAudioInfluence={setAudioInfluence}
            audioAction={audioAction}
            audioFile={audioFile}
            setAudioFile={setAudioFile}
            audioInputRef={audioInputRef}
            audioUploadUrl={audioUploadUrl}
            externalAudioLabel={externalAudioLabel}
            isUploadingAudio={isUploadingAudio}
            onUploadAudio={uploadAudio}
            onClearAudio={clearAudio}
            onCoverFromAudio={handleCoverFromAudio}
            onOpenBalance={onOpenBalance}
            credits={credits}
            onOpenPersonaPicker={() => setIsPersonaPickerOpen(true)}
            onPickAudio={pickAudio}
            uploadProgress={uploadProgress}
            onOpenAudioModal={() => setIsAudioModalOpen(true)}
            selectedPersona={selectedPersona}
            onClearPersona={() => setSelectedPersona(null)}
            isTranscribingAudioLyrics={isTranscribingAudioLyrics}
            onTranscribeAudioLyrics={transcribeLyricsFromAudio}
          />
        )}
      </div>

      {/* Action Buttons & Sticky Create */}
      <div className="fixed md:sticky bottom-[76px] md:bottom-0 left-0 right-0 w-full px-4 flex flex-col gap-2 bg-gradient-to-t from-[#020617] via-[#020617] to-transparent pt-12 pb-6 z-30">
        <button 
          onClick={() => handleCreate().catch(() => {})}
          disabled={isSubmitting || (audioFile && !audioUploadUrl) || (audioAction === 'extend' && Boolean(audioUploadUrl))}
          className="w-full bg-green-500 hover:bg-green-400 text-[#020617] h-[48px] rounded-full font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-70"
        >
          {isSubmitting ? (
            <RefreshCw className="w-5 h-5 animate-spin" />
          ) : (
            <Music className="w-5 h-5" strokeWidth={2} />
          )}
          <span>
            {isSubmitting
              ? 'Creando…'
              : audioFile && !audioUploadUrl
                ? 'Subiendo audio…'
                : audioUploadUrl && audioAction === 'cover'
                  ? 'Crear cover'
                  : audioUploadUrl && audioAction === 'instrumental'
                    ? 'Crear instrumental'
                    : audioUploadUrl && audioAction === 'vocals'
                      ? 'Crear voces'
                      : audioUploadUrl && audioAction === 'extend'
                        ? 'Extender (Próximamente)'
                        : audioUploadUrl && audioAction === 'library'
                          ? 'Guardar en Biblioteca'
                          : 'Crear'}
          </span>
        </button>
      </div>

      {isPersonaPickerOpen && (
        <div className="fixed inset-0 z-[120] bg-black/70 flex items-end md:items-center justify-center">
          <button className="absolute inset-0 w-full h-full" onClick={() => setIsPersonaPickerOpen(false)} aria-label="Cerrar" />
          <div className="relative w-full md:max-w-[520px] bg-[#0b0f16] border border-white/10 rounded-t-3xl md:rounded-3xl overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-white/10">
              <div className="text-white font-extrabold">Persona</div>
              <button
                onClick={() => setIsPersonaPickerOpen(false)}
                className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 max-h-[60vh] overflow-y-auto">
              {personas.length === 0 ? (
                <div className="text-slate-400 text-sm">No tienes Personas todavía.</div>
              ) : (
                <div className="space-y-2">
                  {personas.map((p) => (
                    <button
                      key={p.persona_id}
                      onClick={() => {
                        setSelectedPersona(p);
                        setIsPersonaPickerOpen(false);
                      }}
                      className="w-full glass-card rounded-2xl p-4 flex items-center gap-3 hover:bg-white/10 transition-colors"
                    >
                      {p.photo_url ? (
                        <div className="w-10 h-10 rounded-xl overflow-hidden bg-white/5 border border-white/10 shrink-0">
                          <img src={p.photo_url} alt="" className="w-full h-full object-cover" />
                        </div>
                      ) : (
                        <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-200 shrink-0">
                          <User className="w-5 h-5" />
                        </div>
                      )}
                      <div className="flex-1 text-left min-w-0">
                        <div className="text-white font-bold truncate">{p.name || 'Persona'}</div>
                        <div className="text-slate-500 text-xs truncate">Voz guardada</div>
                      </div>
                      <ChevronDown className="w-5 h-5 text-slate-500 rotate-[-90deg]" />
                    </button>
                  ))}
                </div>
              )}
              {selectedPersona?.persona_id && (
                <button
                  onClick={() => {
                    setSelectedPersona(null);
                    setIsPersonaPickerOpen(false);
                  }}
                  className="w-full mt-3 bg-white/5 border border-white/10 rounded-full py-3 text-slate-200 font-semibold hover:bg-white/10 transition-colors"
                >
                  Quitar Persona
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {isAudioModalOpen && audioFile && (
        <div className="fixed inset-0 md:absolute md:inset-0 z-[130] bg-black/70 flex items-end md:items-center justify-center">
          <button className="absolute inset-0 w-full h-full" onClick={() => setIsAudioModalOpen(false)} aria-label="Cerrar" />
          <div className="relative w-full md:max-w-[520px] bg-[#0b0f16] border border-white/10 rounded-t-3xl md:rounded-3xl overflow-hidden shadow-[0_-20px_60px_rgba(0,0,0,0.6)]">
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <div className="text-white font-extrabold">Crear desde tu audio</div>
              <button
                onClick={() => setIsAudioModalOpen(false)}
                className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4">
              {(() => {
                const pct = Math.max(0, Math.min(100, Math.round(Number(uploadProgress || 0))));
                const hot = pct >= 87 && pct < 100;
                const deg = Math.max(0, Math.min(100, Number(uploadProgress || 0))) * 3.6;
                const ringColor = pct >= 100 ? '#3b82f6' : hot ? '#ef4444' : '#22c55e';
                const pctText = `${pct}%`;
                return (
                  <>
              <div className="flex items-center gap-4">
                <div
                  className="w-14 h-14 rounded-full p-[2px] shrink-0"
                  style={{
                    background: `conic-gradient(${ringColor} ${deg}deg, rgba(255,255,255,0.10) 0deg)`,
                  }}
                >
                  <div className="w-full h-full rounded-full bg-[#0b0f16] border border-white/10 flex items-center justify-center">
                    <div className={cn("text-xs font-extrabold", hot ? "text-red-400" : "text-slate-100")}>{pctText}</div>
                  </div>
                </div>
                <div className="w-14 h-14 rounded-2xl overflow-hidden bg-white/5 border border-white/10 shrink-0">
                  <img
                    src={makeAudioCoverSvgUrl((audioFile?.name || 'audio').toString())}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="min-w-0">
                  <div className="text-white font-extrabold truncate">{audioFile.name}</div>
                  <div className={cn("text-sm", pct >= 100 ? "text-blue-300" : hot ? "text-red-300" : "text-slate-400")}>
                    {isUploadingAudio ? 'Subiendo…' : audioUploadUrl ? 'Listo' : 'Preparando…'}
                  </div>
                </div>
              </div>

              {audioUploadError && (
                <div className="mt-4 bg-red-500/10 border border-red-500/20 rounded-2xl p-3 text-sm text-red-200">
                  {audioUploadError}
                </div>
              )}

              <div className="mt-4 text-slate-300 text-sm">Elige qué quieres hacer</div>
                  </>
                );
              })()}

              <div className="grid grid-cols-2 gap-3 mt-3">
                <button
                  onClick={() => setAudioAction('cover')}
                  className={cn(
                    "rounded-2xl p-4 border transition-colors text-left",
                    audioAction === 'cover' ? "border-emerald-400/70 bg-emerald-500/10" : "border-white/10 bg-white/5 hover:bg-white/10"
                  )}
                  disabled={isUploadingAudio}
                >
                  <div className="w-10 h-10 rounded-xl bg-black/30 border border-white/10 flex items-center justify-center text-slate-200">
                    <AudioLines className="w-5 h-5" />
                  </div>
                  <div className="mt-3 text-white font-bold">Cover</div>
                </button>

                <button
                  onClick={() => setAudioAction('instrumental')}
                  className={cn(
                    "rounded-2xl p-4 border transition-colors text-left",
                    audioAction === 'instrumental' ? "border-emerald-400/70 bg-emerald-500/10" : "border-white/10 bg-white/5 hover:bg-white/10"
                  )}
                  disabled={isUploadingAudio}
                >
                  <div className="w-10 h-10 rounded-xl bg-black/30 border border-white/10 flex items-center justify-center text-slate-200">
                    <Music className="w-5 h-5" />
                  </div>
                  <div className="mt-3 text-white font-bold">Instrumental</div>
                </button>

                <button
                  onClick={() => setAudioAction('vocals')}
                  className={cn(
                    "rounded-2xl p-4 border transition-colors text-left",
                    audioAction === 'vocals' ? "border-emerald-400/70 bg-emerald-500/10" : "border-white/10 bg-white/5 hover:bg-white/10"
                  )}
                  disabled={isUploadingAudio}
                >
                  <div className="w-10 h-10 rounded-xl bg-black/30 border border-white/10 flex items-center justify-center text-slate-200">
                    <User className="w-5 h-5" />
                  </div>
                  <div className="mt-3 text-white font-bold">Voces</div>
                </button>

                <button
                  onClick={() => setAudioAction('extend')}
                  className={cn(
                    "rounded-2xl p-4 border transition-colors text-left",
                    audioAction === 'extend' ? "border-emerald-400/70 bg-emerald-500/10" : "border-white/10 bg-white/5 hover:bg-white/10"
                  )}
                  disabled={isUploadingAudio}
                >
                  <div className="w-10 h-10 rounded-xl bg-black/30 border border-white/10 flex items-center justify-center text-slate-200">
                    <Pencil className="w-5 h-5" />
                  </div>
                  <div className="mt-3 text-white font-bold">Extender</div>
                </button>

                <button
                  onClick={() => setAudioAction('library')}
                  className={cn(
                    "rounded-2xl p-4 border transition-colors text-left",
                    audioAction === 'library' ? "border-emerald-400/70 bg-emerald-500/10" : "border-white/10 bg-white/5 hover:bg-white/10"
                  )}
                  disabled={isUploadingAudio}
                >
                  <div className="w-10 h-10 rounded-xl bg-black/30 border border-white/10 flex items-center justify-center text-slate-200">
                    <Library className="w-5 h-5" />
                  </div>
                  <div className="mt-3 text-white font-bold">Biblioteca</div>
                </button>
              </div>

              <button
                onClick={() => {
                  continueFromAudio().catch(() => {});
                }}
                disabled={
                  (audioAction === 'library' && (!audioUploadUrl || isUploadingAudio))
                }
                className="mt-4 w-full bg-green-500 hover:bg-green-400 text-[#020617] h-[52px] rounded-full font-extrabold text-sm transition-colors disabled:opacity-60"
              >
                Listo
              </button>

              <button
                onClick={() => {
                  if (audioFile) {
                    uploadAudio(audioFile).catch(() => {});
                    return;
                  }
                }}
                disabled={isUploadingAudio || !audioFile}
                className="mt-3 w-full bg-white/5 border border-white/10 rounded-full py-3 text-slate-200 font-semibold hover:bg-white/10 transition-colors disabled:opacity-60"
              >
                Reintentar subida
              </button>

              <button
                onClick={clearAudio}
                className="mt-3 w-full bg-white/5 border border-white/10 rounded-full py-3 text-slate-200 font-semibold hover:bg-white/10 transition-colors"
              >
                Eliminar audio
              </button>

              <button
                onClick={() => {
                  clearAudio();
                  window.setTimeout(() => audioInputRef.current?.click(), 0);
                }}
                className="mt-3 w-full bg-white/5 border border-white/10 rounded-full py-3 text-slate-200 font-semibold hover:bg-white/10 transition-colors"
              >
                Subir otro audio
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SimpleForm({ instrumental, setInstrumental, description, setDescription }: any) {
  return (
    <>
      <div className="glass-card rounded-3xl p-5 relative">
        <div className="flex items-start justify-between mb-2">
          <label className="text-sm font-semibold text-slate-200">Descripción de la canción</label>
          <button className="bg-white/5 p-1.5 rounded-full text-slate-300 hover:text-white transition-colors">
            <Dices className="w-4 h-4" />
          </button>
        </div>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Ej: una balada pop sobre un amanecer en la playa..."
          className="w-full bg-transparent text-white placeholder:text-slate-500 resize-none outline-none min-h-[80px]"
        />
        
        <div className="mt-4 flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
          <button className="flex-shrink-0 bg-white/5 w-8 h-8 rounded-full flex items-center justify-center text-slate-400">
            <RefreshCw className="w-4 h-4" />
          </button>
          <span className="flex-shrink-0 bg-indigo-500/20 text-indigo-300 px-3 py-1.5 rounded-full text-xs font-medium border border-indigo-500/20 truncate max-w-[150px]">
            female background vocals
          </span>
          <span className="flex-shrink-0 bg-indigo-500/20 text-indigo-300 px-3 py-1.5 rounded-full text-xs font-medium border border-indigo-500/20 truncate max-w-[150px]">
            dungeon neo so...
          </span>
        </div>
      </div>

      <div className="glass-card rounded-2xl p-4 flex items-center justify-between">
        <button className="flex items-center gap-2 text-white font-medium hover:text-gray-300 transition-colors">
          <Plus className="w-5 h-5" /> Letras
        </button>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-300">Instrumental</span>
          <Toggle checked={instrumental} onChange={() => setInstrumental(!instrumental)} />
        </div>
      </div>
    </>
  );
}

function CustomForm({
  instrumental,
  setInstrumental,
  description,
  lyrics,
  setLyrics,
  gender,
  setGender,
  title,
  setTitle,
  instructions,
  setInstructions,
  isBoostingStyle,
  onBoostStyle,
  showMoreOptions,
  setShowMoreOptions,
  weirdness,
  setWeirdness,
  styleInfluence,
  setStyleInfluence,
  audioInfluence,
  setAudioInfluence,
  audioAction,
  audioFile,
  setAudioFile,
  audioInputRef,
  audioUploadUrl,
  externalAudioLabel,
  isUploadingAudio,
  onUploadAudio,
  onClearAudio,
  onCoverFromAudio,
  onOpenBalance,
  credits,
  onOpenPersonaPicker,
  onPickAudio,
  uploadProgress,
  onOpenAudioModal,
  selectedPersona,
  onClearPersona,
  isTranscribingAudioLyrics,
  onTranscribeAudioLyrics,
}: any) {
  const [isGeneratingLyrics, setIsGeneratingLyrics] = useState(false);
  const [isLyricsExpanded, setIsLyricsExpanded] = useState(false);
  const [prevLyrics, setPrevLyrics] = useState<string>('');

  const normalizeLyrics = (t: string) => {
    const lines = (t || '').toString().replaceAll('\r\n', '\n').split('\n');
    const mapped = lines.map((line) => {
      const s = line.trim();
      if (!s) return '';
      const lower = s.toLowerCase();
      const isTag =
        lower === 'coro' ||
        lower.startsWith('coro ') ||
        lower === 'chorus' ||
        lower.startsWith('chorus ') ||
        lower.startsWith('verso') ||
        lower.startsWith('verse') ||
        lower.startsWith('pre-coro') ||
        lower.startsWith('pre coro') ||
        lower.startsWith('bridge') ||
        lower.startsWith('puente') ||
        lower.startsWith('outro') ||
        lower.startsWith('intro');
      if (isTag && !s.startsWith('[')) return `[${s.replaceAll(':', '').trim()}]`;
      if (s.startsWith('[') && s.endsWith(']')) return s;
      if (s.endsWith(':') && s.length < 20) return `[${s.slice(0, -1).trim()}]`;
      return line;
    });
    return mapped.join('\n').replaceAll(/\n{3,}/g, '\n\n').trim();
  };

  const setLyricsWithUndo = (next: string) => {
    const current = (lyrics || '').toString();
    const n = (next || '').toString();
    if (n === current) return;
    setPrevLyrics(current);
    setLyrics(n);
  };

  const handleGenerateLyrics = async (auto?: boolean) => {
    if (instrumental) {
      if (!auto) alert('En modo instrumental no se generan letras.');
      return;
    }
    setIsGeneratingLyrics(true);
    try {
      const t = await getAccessToken();
      if (!t.ok) {
        if (!auto) alert(t.error || 'No se pudo iniciar sesión.');
        return;
      }

      const contextTitle = (typeof title === 'string' && title.trim()) ? title.trim() : '';
      const contextStyle = (typeof instructions === 'string' && instructions.trim()) ? instructions.trim() : '';
      const contextIdea =
        (typeof lyrics === 'string' && lyrics.trim()) ? lyrics.trim() :
        (typeof description === 'string' && description.trim()) ? description.trim() :
        '';

      if (!contextIdea) {
        if (!auto) alert('Escribe un tema o idea en la caja de "Letras" para generar letra.');
        return;
      }

      const joined = [
        'Letra en español.',
        contextTitle ? `Título: ${contextTitle}.` : '',
        contextStyle ? `Estilo: ${contextStyle}.` : '',
        `Idea: ${contextIdea}.`,
      ].filter(Boolean).join(' ');

      const prompt = joined.slice(0, 200);

      const r = await fetch('/api/suno/lyrics', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${t.token}` },
        body: JSON.stringify({ prompt }),
      });
      const out = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (!auto) alert((out?.detail || out?.error || 'No se pudo generar letra.').toString());
        return;
      }
      const taskId = (out?.taskId || '').toString();
      if (!taskId) {
        if (!auto) alert('No recibí taskId para la letra.');
        return;
      }

      const started = Date.now();
      while (Date.now() - started < 180_000) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        const tr = await fetch(`/api/suno/task?kind=lyrics&taskId=${encodeURIComponent(taskId)}`, {
          headers: { authorization: `Bearer ${t.token}` },
        });
        const tout = await tr.json().catch(() => ({}));
        if (!tr.ok) continue;

        const provider = tout?.data;
        const status = String(
          provider?.data?.status ||
            provider?.data?.successFlag ||
            provider?.data?.data?.status ||
            provider?.data?.data?.successFlag ||
            ''
        ).toUpperCase();

        if (
          status === 'FAILED' ||
          status === 'CREATE_TASK_FAILED' ||
          status === 'GENERATE_LYRICS_FAILED' ||
          status === 'CALLBACK_EXCEPTION' ||
          status === 'SENSITIVE_WORD_ERROR'
        ) {
          if (!auto) alert('No se pudo generar letra.');
          return;
        }

        if (status !== 'SUCCESS') continue;

        const root = provider?.data || {};
        const resp = root?.response || {};
        const variants = Array.isArray(resp?.data) ? resp.data : Array.isArray(root?.data) ? root.data : [];

        const best =
          variants.find((v: any) => String(v?.status || '').toLowerCase() === 'complete' && String(v?.text || '').trim()) ||
          variants.find((v: any) => String(v?.text || '').trim()) ||
          null;
        const textRaw = best ? String(best?.text || '').trim() : '';
        const inferredTitle = (contextTitle || (best && typeof (best as any)?.title === 'string' ? String((best as any).title).trim() : '')).toString();
        const text = stripTitleFromLyrics(inferredTitle, normalizeLyrics(textRaw));
        if (text) {
          setLyricsWithUndo(text);
          if (!contextTitle && typeof best?.title === 'string' && best.title.trim()) setTitle(best.title.trim().slice(0, 100));
          return;
        }
      }

      if (!auto) alert('La letra está tardando. Intenta de nuevo en unos segundos.');
    } catch (e) {
      if (!auto) alert(e instanceof Error ? e.message : 'Error al generar letra.');
    } finally {
      setIsGeneratingLyrics(false);
    }
  };

  return (
    <>
      <div className="flex gap-4">
        <div className="flex-1 flex gap-2">
          <button
            type="button"
            onClick={() => {
              if (audioFile) {
                onOpenAudioModal?.();
                return;
              }
              audioInputRef?.current?.click?.();
            }}
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-white/5 hover:bg-white/10 rounded-2xl text-sm font-semibold border border-white/5 text-slate-300 hover:text-white cursor-pointer relative transition-colors shadow-inner"
          >
            <Plus className="w-5 h-5 text-slate-400" /> {audioUploadUrl ? 'Audio cargado' : 'Audio'}
          </button>
          {!!audioUploadUrl && (
            <button
              type="button"
              onClick={() => onClearAudio?.()}
              className="w-12 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/5 flex items-center justify-center text-slate-200"
              aria-label="Eliminar audio"
              title="Eliminar audio"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          )}
        </div>
        <input 
          type="file" 
          accept="audio/*" 
          className="hidden" 
          ref={audioInputRef}
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              const f = e.target.files[0];
              setAudioFile(f);
              onPickAudio(f);
            }
          }}
        />
        <button
          onClick={onOpenPersonaPicker}
          className="flex-1 flex items-center justify-center gap-2 py-3 bg-white/5 hover:bg-white/10 rounded-2xl text-sm font-semibold border border-white/5 text-slate-300 hover:text-white transition-colors shadow-inner"
        >
          <Plus className="w-5 h-5 text-slate-400" /> Persona
        </button>
      </div>

      {!!audioUploadUrl && (
        <div className="glass-card rounded-2xl p-4 border border-white/10 mt-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-white font-bold truncate">{audioFile ? audioFile.name : (externalAudioLabel || 'Audio listo')}</div>
              <div className="text-xs text-slate-400">
                {isUploadingAudio || !audioUploadUrl
                  ? `Subiendo… ${Math.max(0, Math.min(100, Math.round(Number(uploadProgress || 0))))}%`
                  : `Audio listo · Acción: ${
                      audioAction === 'cover'
                        ? 'Cover'
                        : audioAction === 'instrumental'
                          ? 'Instrumental'
                          : audioAction === 'vocals'
                            ? 'Voces'
                            : audioAction === 'extend'
                              ? 'Extender'
                              : audioAction === 'library'
                                ? 'Biblioteca'
                                : 'Cover'
                    }`}
              </div>
              {audioUploadUrl && (
                <div className="text-[11px] text-slate-500 mt-1">
                  Edita letras/instrucciones aquí, y cuando toques “Crear” se empezará el proceso y te mandará a Biblioteca.
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                if (audioFile) {
                  onOpenAudioModal?.();
                  return;
                }
                audioInputRef?.current?.click?.();
              }}
              className="shrink-0 bg-white/5 border border-white/10 rounded-full px-4 py-2 text-xs font-bold text-slate-200 hover:bg-white/10 transition-colors"
            >
              Cambiar
            </button>
          </div>
          <div className="mt-3 h-2 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full bg-emerald-400"
              style={{ width: `${Math.max(0, Math.min(100, Math.round(Number(uploadProgress || 0))))}%` }}
            />
          </div>
        </div>
      )}

      {selectedPersona?.persona_id && (
        <div className="glass-card rounded-2xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            {selectedPersona.photo_url ? (
              <div className="w-10 h-10 rounded-xl overflow-hidden bg-white/5 border border-white/10 shrink-0">
                <img src={selectedPersona.photo_url} alt="" className="w-full h-full object-cover" />
              </div>
            ) : (
              <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-200 shrink-0">
                <User className="w-5 h-5" />
              </div>
            )}
            <div className="min-w-0">
              <div className="text-white font-bold truncate">{selectedPersona.name || 'Persona'}</div>
              <div className="text-slate-500 text-xs">Usando voz</div>
            </div>
          </div>
          <button onClick={onClearPersona} className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-200">
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      <div className="bg-[#111318] border border-white/5 rounded-2xl p-5 flex flex-col mt-2 shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)]">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <label className="font-bold text-white text-base">Letras</label>
            <button
              type="button"
              onClick={() => {
                if (!prevLyrics) return;
                const current = (lyrics || '').toString();
                setPrevLyrics(current);
                setLyrics(prevLyrics);
              }}
              disabled={!prevLyrics}
              className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-200 disabled:opacity-40"
              aria-label="Regresar letra"
              title="Regresar letra"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                const current = (lyrics || '').toString();
                if (!current.trim()) {
                  setLyrics('');
                  return;
                }
                if (!confirm('¿Seguro que quieres eliminar la letra?')) return;
                setPrevLyrics(current);
                setLyrics('');
              }}
              className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-200 hover:bg-white/10"
              aria-label="Eliminar letra"
              title="Eliminar letra"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
          <div className="flex items-center gap-3">
            <button className="text-slate-400 hover:text-white transition-colors">
              <ListMusic className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-300">Instrumental</span>
              <Toggle checked={instrumental} onChange={() => setInstrumental(!instrumental)} />
            </div>
          </div>
        </div>
        
        <div className="relative flex flex-col">
          <textarea
            value={lyrics}
            onChange={(e) => setLyricsWithUndo(e.target.value)}
            placeholder="Agrega tu propia letra o ingresa un tema para generar"
            className="w-full bg-transparent text-[15px] placeholder:text-slate-500 font-medium resize-none outline-none min-h-[120px] text-white"
          />
          
          <div className="flex justify-end items-center gap-2 mt-2">
            <button
              type="button"
              onClick={() => setIsLyricsExpanded(true)}
              className="bg-white/5 hover:bg-white/10 text-slate-200 border border-white/10 w-10 h-10 rounded-full text-sm font-semibold transition-colors flex items-center justify-center"
              aria-label="Expandir letras"
              title="Expandir letras"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
            <button 
              onClick={() => handleGenerateLyrics(false).catch(() => {})}
              disabled={isGeneratingLyrics}
              className="bg-white/5 hover:bg-white/10 text-slate-200 border border-white/10 px-4 py-2 rounded-full text-sm font-semibold transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {isGeneratingLyrics && <RefreshCw className="w-4 h-4 animate-spin" />}
              Generar letra
            </button>
          </div>
        </div>
      </div>

      {isLyricsExpanded && (
        <div className="fixed inset-0 z-[140] bg-black/70 flex items-end md:items-center justify-center">
          <button className="absolute inset-0 w-full h-full" onClick={() => setIsLyricsExpanded(false)} aria-label="Cerrar" />
          <div className="relative w-full md:max-w-[720px] bg-[#0b0f16] border border-white/10 rounded-t-3xl md:rounded-3xl overflow-hidden">
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <div className="text-white font-extrabold">Letras</div>
              <button
                onClick={() => setIsLyricsExpanded(false)}
                className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4">
              <textarea
                value={lyrics}
                onChange={(e) => setLyrics(e.target.value)}
                placeholder="Agrega tu propia letra o ingresa un tema para generar"
                className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-[15px] text-white placeholder:text-slate-500 outline-none min-h-[55vh] resize-none"
              />
            </div>
          </div>
        </div>
      )}

      <div className="bg-[#111318] border border-white/5 rounded-2xl p-5 shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)] mt-4">
        <button
          type="button"
          onClick={() => setShowMoreOptions(!showMoreOptions)}
          className="w-full flex items-center justify-between"
        >
          <div className="text-white font-bold text-base">Más opciones</div>
          <ChevronDown className={cn("w-5 h-5 text-slate-400 transition-transform", showMoreOptions ? "rotate-180" : "rotate-0")} />
        </button>

        {showMoreOptions && (
          <div className="mt-4 space-y-4">
            <SliderRow
              label="Weirdness"
              value={weirdness}
              onChange={setWeirdness}
            />
            <SliderRow
              label="Influencia de estilo"
              value={styleInfluence}
              onChange={setStyleInfluence}
            />
            <SliderRow
              label="Influencia de audio"
              value={audioInfluence}
              onChange={setAudioInfluence}
            />
          </div>
        )}
      </div>

      {/* Instrucciones (Estilos) */}
      <div className="bg-[#111318] border border-white/5 rounded-2xl p-5 shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)] mt-4">
        <label className="font-bold text-white text-base mb-4 block">Instrucciones</label>
        <textarea
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder="Describe el estilo, el ambiente o los instrumentos de tu música"
          className="w-full bg-transparent text-[15px] placeholder:text-slate-500 font-medium resize-none outline-none min-h-[80px] text-white"
        />
        
        <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar mt-4">
          <button className="flex-shrink-0 bg-white/5 w-9 h-9 rounded-full flex items-center justify-center text-slate-400 border border-white/5">
            <List className="w-4 h-4" />
          </button>
          <button
            onClick={() => onBoostStyle?.()}
            disabled={Boolean(isBoostingStyle)}
            className="flex-shrink-0 bg-white/5 w-9 h-9 rounded-full flex items-center justify-center text-slate-400 border border-white/5 disabled:opacity-60"
            aria-label="Optimizar estilo"
            title="Optimizar estilo"
          >
            <RefreshCw className={cn("w-4 h-4", isBoostingStyle ? "animate-spin" : "")} />
          </button>
          <span className="flex-shrink-0 bg-white/5 text-slate-300 px-4 py-2 rounded-full text-sm font-medium border border-white/5 truncate max-w-[200px]">
            raspy female vocals
          </span>
          <span className="flex-shrink-0 bg-white/5 text-slate-300 px-4 py-2 rounded-full text-sm font-medium border border-white/5 truncate max-w-[200px]">
            modern danceh...
          </span>
        </div>
      </div>

      {/* Género */}
      <div className="bg-[#111318] border border-white/5 rounded-2xl p-5 shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)] mt-4 flex items-center justify-between">
        <label className="font-bold text-white text-base">Género</label>
        <div className="flex gap-4">
          <button 
            onClick={() => setGender('Masculino')}
            className={cn("text-sm font-semibold transition-colors", gender === 'Masculino' ? "text-slate-200" : "text-slate-500")}
          >
            Masculino
          </button>
          <button 
            onClick={() => setGender('Femenino')}
            className={cn("text-sm font-semibold transition-colors", gender === 'Femenino' ? "text-slate-200" : "text-slate-500")}
          >
            Femenino
          </button>
        </div>
      </div>

      {/* Título de la canción */}
      <div className="bg-[#111318] border border-white/5 rounded-2xl p-5 shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)] mt-4 mb-4">
        <label className="font-bold text-white text-base mb-4 block">Título de la canción <span className="text-slate-500 font-normal">(Opcional)</span></label>
        <div className="flex items-center justify-between bg-white/5 rounded-xl px-4 py-3 border border-white/5">
          <input 
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value.substring(0, 80))}
            placeholder="Introduce el título de tu canción"
            className="bg-transparent text-white placeholder:text-slate-500 outline-none flex-1 text-[15px]"
          />
          <span className="text-slate-500 text-sm">{title.length}/80</span>
        </div>
        <button
          type="button"
          onClick={() => onOpenBalance?.()}
          className="mt-4 w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 flex items-center justify-between hover:bg-white/10 transition-colors"
        >
          <div className="text-slate-200 font-extrabold">Saldo</div>
          <div className="text-slate-300 text-sm font-semibold">Créditos: {Number(credits || 0)}</div>
        </button>
      </div>
    </>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button 
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={cn(
        "w-10 h-6 rounded-full flex items-center px-1 transition-colors relative",
        checked ? "bg-indigo-500" : "bg-white/10"
      )}
    >
      <div 
        className={cn(
          "w-4 h-4 bg-white rounded-full transition-transform shadow-md",
          checked ? "translate-x-4" : "translate-x-0"
        )}
      />
    </button>
  );
}

function SliderRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  const v = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
  const hot = v >= 87;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-slate-300 text-sm font-semibold">{label}</div>
        <div className="text-slate-400 text-sm">{v}%</div>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={v}
        onChange={(e) => onChange(Math.max(0, Math.min(100, Number(e.target.value))))}
        className={cn("w-full", hot ? "accent-red-500" : "accent-emerald-500")}
      />
    </div>
  );
}
