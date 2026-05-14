import React, { useEffect, useRef, useState } from 'react';
import { Upload, Mic, Play, Pause, Trash2, Loader2, CheckCircle, XCircle, User, Info, ChevronDown, ChevronUp, Edit, Pencil } from 'lucide-react';
import { getAccessToken, supabaseBrowser } from '@/lib/supabaseBrowser';
import { cn } from '@/lib/utils';

interface VoiceItem {
  id: string;
  voice_id: string;
  voice_name: string;
  description: string;
  status: 'processing' | 'ready' | 'failed';
  created_at: string;
  cost: number;
  output?: any;
  error?: any;
  model_url?: string | null;
  sample_url?: string | null;
  profile_image_url?: string | null;
  voice_profile_name?: string | null;
}

interface LibrarySongItem {
  id: string;
  title: string;
  description: string;
  audio_url: string;
  cover_url: string;
  suno_task_id: string;
  suno_audio_id: string;
}

export function CloneVoiceView() {
  const DRAFT_KEY = 'ramber.cloneVoiceDraft.v1';
  const [voiceName, setVoiceName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [profileImage, setProfileImage] = useState<File | null>(null);
  const [profileImageUrl, setProfileImageUrl] = useState<string>('');
  const [voiceProfileName, setVoiceProfileName] = useState('');
  const [category, setCategory] = useState('personal');
  const [language, setLanguage] = useState('es');
  const [gender, setGender] = useState('unknown');
  const [tags, setTags] = useState<string[]>([]);
  const [isPublic, setIsPublic] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [voices, setVoices] = useState<VoiceItem[]>([]);
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioDuration, setAudioDuration] = useState<number | null>(null);
  const [showAudioRequirements, setShowAudioRequirements] = useState(false);
  const [isPreparingAudio, setIsPreparingAudio] = useState(false);
  const [editingVoice, setEditingVoice] = useState<VoiceItem | null>(null);
  const [editVoiceName, setEditVoiceName] = useState('');
  const [editProfileImage, setEditProfileImage] = useState<File | null>(null);
  const [editProfileImagePreview, setEditProfileImagePreview] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isManageVoices, setIsManageVoices] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const editImageInputRef = useRef<HTMLInputElement>(null);

  const [librarySongs, setLibrarySongs] = useState<LibrarySongItem[]>([]);
  const [coverSongId, setCoverSongId] = useState('');
  const [coverVoiceId, setCoverVoiceId] = useState('');
  const [isCoverBusy, setIsCoverBusy] = useState(false);
  const [coverProgress, setCoverProgress] = useState('');
  const [coverError, setCoverError] = useState('');
  const [coverSuccess, setCoverSuccess] = useState('');
  const [showPickCoverSong, setShowPickCoverSong] = useState(false);
  const [showPickCoverVoice, setShowPickCoverVoice] = useState(false);
  const coverFileInputRef = useRef<HTMLInputElement>(null);
  const [externalCoverFile, setExternalCoverFile] = useState<File | null>(null);
  const [externalCoverTitle, setExternalCoverTitle] = useState('');

  const loadVoices = async () => {
    const t = await getAccessToken();
    if (!t.ok) return;
    try {
      const r = await fetch('/api/kits/voices', {
        headers: { authorization: `Bearer ${t.token}` },
      });
      const out = await r.json();
      if (r.ok && Array.isArray(out?.voices)) {
        const mapped: VoiceItem[] = out.voices
          .map((v: any) => {
            const id = String(v?.id || '').trim() || String(v?.voice_id || '').trim() || String(v?.replicate_id || '').trim();
            const voice_id = String(v?.voice_id || '').trim() || String(v?.replicate_id || '').trim() || id;
            const voice_name = String(v?.voice_name || '').trim() || 'Voz';
            const description = String(v?.description || '').trim();
            const statusRaw = String(v?.status || '').trim().toLowerCase();
            const statusNorm =
              statusRaw === 'ready' || statusRaw === 'failed' || statusRaw === 'processing'
                ? statusRaw
                : statusRaw === 'training' || statusRaw === 'starting'
                ? 'processing'
                : 'processing';
            const status: VoiceItem['status'] = statusNorm as any;
            const created_at = String(v?.created_at || '').trim() || new Date().toISOString();
            const cost = Number(v?.cost ?? 0) || 0;
            const model_url = v?.model_url == null ? null : String(v.model_url || '') || null;
            const sample_url = v?.sample_url == null ? null : String(v.sample_url || '') || null;
            const profile_image_url = v?.profile_image_url == null ? null : String(v.profile_image_url || '') || null;
            const voice_profile_name = v?.voice_profile_name == null ? null : String(v.voice_profile_name || '') || null;
            let output: any = null;
            const outRaw = (v as any)?.output;
            if (outRaw && typeof outRaw === 'string') {
              try {
                output = JSON.parse(outRaw);
              } catch {
                output = null;
              }
            } else if (outRaw && typeof outRaw === 'object') {
              output = outRaw;
            }
            let errObj: any = null;
            const errRaw = (v as any)?.error;
            if (errRaw && typeof errRaw === 'string') {
              try {
                errObj = JSON.parse(errRaw);
              } catch {
                errObj = errRaw;
              }
            } else if (errRaw && typeof errRaw === 'object') {
              errObj = errRaw;
            }
            if (!id) return null;
            return { id, voice_id, voice_name, description, status, created_at, cost, output, error: errObj, model_url, sample_url, profile_image_url, voice_profile_name };
          })
          .filter(Boolean) as any;
        setVoices(mapped);
      }
    } catch (e) {
      console.error('Error loading voices:', e);
    }
  };

  const loadLibrarySongs = async () => {
    const t = await getAccessToken();
    if (!t.ok) return;
    try {
      const r = await fetch('/api/library/list?deleted=0', { headers: { authorization: `Bearer ${t.token}` } });
      const out = await r.json().catch(() => ({}));
      if (!r.ok) return;
      const rows = Array.isArray(out?.songs) ? out.songs : [];
      const mapped: LibrarySongItem[] = rows
        .map((s: any) => ({
          id: String(s?.id || '').trim(),
          title: String(s?.title || '').trim() || 'Canción',
          description: String(s?.description || '').trim(),
          audio_url: String(s?.audio_url || s?.audioUrl || '').trim(),
          cover_url: String(s?.cover_url || s?.coverUrl || '').trim(),
          suno_task_id: String(s?.suno_task_id || s?.sunoTaskId || '').trim(),
          suno_audio_id: String(s?.suno_audio_id || s?.sunoAudioId || '').trim(),
        }))
        .filter((s: any) => s.id);
      setLibrarySongs(mapped);
      if (!coverSongId) {
        const firstEligible = mapped.find((x) => x.suno_task_id || x.suno_audio_id) || mapped[0];
        if (firstEligible?.id) setCoverSongId(firstEligible.id);
      }
    } catch {
    }
  };

  useEffect(() => {
    loadLibrarySongs().catch(() => {});
  }, []);

  useEffect(() => {
    if (coverVoiceId) return;
    const firstReady = voices.find((v) => v.status === 'ready') || voices[0];
    if (firstReady?.voice_id) setCoverVoiceId(firstReady.voice_id);
  }, [voices.length]);

  const checkVoiceStatus = async (voiceId: string) => {
    const t = await getAccessToken();
    if (!t.ok) return null;
    try {
      const r = await fetch('/api/kits/voices', {
        headers: { authorization: `Bearer ${t.token}` },
      });
      if (r.ok) {
        const data = await r.json();
        const voice = data.voices?.find((v: any) => v.id === voiceId || v.replicate_id === voiceId);
        return voice;
      }
    } catch (e) {
      console.error('Error checking voice status:', e);
    }
    return null;
  };

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const d: any = JSON.parse(raw);
        if (typeof d?.voiceName === 'string') setVoiceName(d.voiceName);
        if (typeof d?.description === 'string') setDescription(d.description);
        if (typeof d?.profileImageUrl === 'string') setProfileImageUrl(d.profileImageUrl);
        if (typeof d?.voiceProfileName === 'string') setVoiceProfileName(d.voiceProfileName);
        if (typeof d?.category === 'string') setCategory(d.category);
        if (typeof d?.language === 'string') setLanguage(d.language);
        if (typeof d?.gender === 'string') setGender(d.gender);
        if (Array.isArray(d?.tags)) setTags(d.tags.filter((x: any) => typeof x === 'string').map((x: string) => x.trim()).filter(Boolean));
        if (typeof d?.isPublic === 'boolean') setIsPublic(d.isPublic);
        if (typeof d?.audioDuration === 'number' && Number.isFinite(d.audioDuration)) setAudioDuration(d.audioDuration);
        const fileName = typeof d?.selectedFileName === 'string' ? d.selectedFileName.trim() : '';
        if (fileName) setSuccess(`Se restauró lo que estabas llenando. Vuelve a seleccionar el audio: ${fileName}`);
      }
    } catch {
    }
    loadVoices();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      const hasProcessing = voices.some(v => v.status === 'processing');
      if (!hasProcessing) return;
      loadVoices().catch(() => {});
    }, 10000);

    return () => clearInterval(interval);
  }, [voices]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    if (!audioUrl) return;
    try {
      el.pause();
      el.currentTime = 0;
    } catch {}
    try {
      const p = el.play();
      if (p && typeof (p as any).catch === 'function') {
        (p as any).catch(() => {});
      }
    } catch {}
  }, [audioUrl]);

  useEffect(() => {
    try {
      const draft = {
        voiceName,
        description,
        profileImageUrl,
        voiceProfileName,
        category,
        language,
        gender,
        tags,
        isPublic,
        audioDuration,
        selectedFileName: selectedFile?.name || '',
      };
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
    }
  }, [voiceName, description, profileImageUrl, voiceProfileName, category, language, gender, tags, isPublic, audioDuration, selectedFile]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    if (!file) return;

    if (file.size > 50 * 1024 * 1024) {
      setError('El archivo es muy pesado. Máximo 50 MB.');
      return;
    }

    try {
      setIsPreparingAudio(true);
      setError('');
      const { file: normalizedFile, duration } = await normalizeVoiceAudioFile(file);
      const minDuration = 10;
      const maxDuration = 300;
      
      if (duration < minDuration) {
        setError(`El audio es demasiado corto. Mínimo ${minDuration} segundos. Duración actual: ${duration.toFixed(1)} segundos.`);
        return;
      }
      
      if (duration > maxDuration) {
         setError(`El audio es demasiado largo. Máximo ${maxDuration} segundos (5 minutos). Duración actual: ${duration.toFixed(1)} segundos.`);
         return;
       }
       
       setSelectedFile(normalizedFile);
       setAudioDuration(duration);
       setError('');
       if (!voiceProfileName.trim()) {
         setVoiceProfileName(normalizedFile.name.replace(/\.[^/.]+$/, '').slice(0, 50));
       }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'No se pudo preparar el audio. Usa MP3 o WAV, o convierte tu archivo a MP3/WAV.'
      );
      console.error('Error checking audio duration:', err);
    } finally {
      setIsPreparingAudio(false);
    }
  };

  // Función para obtener la duración de un archivo de audio
  const getAudioDuration = (file: File): Promise<number> => {
    return new Promise((resolve, reject) => {
      const audio = new Audio();
      audio.preload = 'metadata';
      
      audio.onloadedmetadata = () => {
        window.URL.revokeObjectURL(audio.src);
        resolve(audio.duration);
      };
      
      audio.onerror = () => {
        window.URL.revokeObjectURL(audio.src);
        reject(new Error('No se pudo cargar el audio'));
      };
      
      audio.src = URL.createObjectURL(file);
    });
  };

  const normalizeAudioType = (file: File, forcedType: string) => {
    const t = (file?.type || '').toString().toLowerCase();
    if (t === forcedType.toLowerCase()) return file;
    try {
      return new File([file], file.name || (forcedType.includes('wav') ? 'audio.wav' : 'audio.mp3'), { type: forcedType });
    } catch {
      return file;
    }
  };

  const audioBufferToWavBlob = (buffer: AudioBuffer): Blob => {
    const numChannels = Math.max(1, Math.min(2, buffer.numberOfChannels || 1));
    const sampleRate = Math.max(8000, Math.min(96000, Math.floor(buffer.sampleRate || 44100)));
    const length = Math.max(1, buffer.length || 1);
    const bytesPerSample = 2;
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = length * blockAlign;
    const out = new ArrayBuffer(44 + dataSize);
    const view = new DataView(out);

    const writeStr = (offset: number, s: string) => {
      for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
    };
    const writeU16 = (offset: number, v: number) => view.setUint16(offset, v, true);
    const writeU32 = (offset: number, v: number) => view.setUint32(offset, v, true);

    writeStr(0, 'RIFF');
    writeU32(4, 36 + dataSize);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    writeU32(16, 16);
    writeU16(20, 1);
    writeU16(22, numChannels);
    writeU32(24, sampleRate);
    writeU32(28, byteRate);
    writeU16(32, blockAlign);
    writeU16(34, 16);
    writeStr(36, 'data');
    writeU32(40, dataSize);

    const channels: Float32Array[] = [];
    for (let c = 0; c < numChannels; c++) channels.push(buffer.getChannelData(c));
    let o = 44;
    for (let i = 0; i < length; i++) {
      for (let c = 0; c < numChannels; c++) {
        const x = Math.max(-1, Math.min(1, channels[c][i] || 0));
        const s = x < 0 ? x * 0x8000 : x * 0x7fff;
        view.setInt16(o, Math.round(s), true);
        o += 2;
      }
    }

    return new Blob([out], { type: 'audio/wav' });
  };

  const normalizeVoiceAudioFile = async (file: File): Promise<{ file: File; duration: number }> => {
    const name = (file?.name || '').toString();
    const ext = name.toLowerCase().split('.').pop() || '';
    const type = (file?.type || '').toString().toLowerCase();
    const isMp3 = ext === 'mp3' || type === 'audio/mpeg' || type === 'audio/mp3';
    const isWav = ext === 'wav' || type === 'audio/wav' || type === 'audio/x-wav';
    if (isWav) {
      const duration = await getAudioDuration(file).catch(() => 0);
      if (duration > 0) return { file: normalizeAudioType(file, 'audio/wav'), duration };
    }

    const isAmr = ext === 'amr' || type.includes('amr');
    const is3gp = ext === '3gp' || ext === '3gpp' || type.includes('3gpp') || type.includes('3gp');
    if (isAmr || is3gp) {
      const label = [ext ? `.${ext}` : '', type ? `(${type})` : ''].filter(Boolean).join(' ');
      throw new Error(`Este formato ${label || ''} no se puede convertir aquí. Convierte a MP3 o WAV y vuelve a intentar.`);
    }

    const buf = await file.arrayBuffer();
    const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) {
      throw new Error('Tu navegador no soporta convertir este audio. Usa MP3 o WAV.');
    }
    const ctx = new AudioCtx();
    try {
      const decoded: AudioBuffer = await new Promise((resolve, reject) => {
        const p = ctx.decodeAudioData(buf.slice(0));
        if (p && typeof (p as any).then === 'function') {
          (p as any).then(resolve).catch(reject);
        } else {
          ctx.decodeAudioData(buf.slice(0), resolve, reject);
        }
      });

      const targetRate = 48000;
      let toEncode = decoded;
      if (Number.isFinite(decoded.sampleRate) && decoded.sampleRate > 0 && decoded.sampleRate !== targetRate) {
        try {
          const ch = Math.max(1, Math.min(2, decoded.numberOfChannels || 1));
          const len = Math.max(1, Math.ceil(decoded.duration * targetRate));
          const offline = new (window as any).OfflineAudioContext(ch, len, targetRate);
          const src = offline.createBufferSource();
          src.buffer = decoded;
          src.connect(offline.destination);
          src.start(0);
          toEncode = await offline.startRendering();
        } catch {}
      }

      const wavBlob = audioBufferToWavBlob(toEncode);
      const base = name.replace(/\.[^/.]+$/, '').slice(0, 120) || 'voz';
      const wavFile = new File([wavBlob], `${base}.wav`, { type: 'audio/wav' });
      return { file: wavFile, duration: Number.isFinite(toEncode.duration) ? toEncode.duration : 0 };
    } catch {
      const label = [ext ? `.${ext}` : '', type ? `(${type})` : ''].filter(Boolean).join(' ');
      const isAacLike = ext === 'aac' || ext === 'm4a' || ext === 'mp4' || type.includes('aac') || type.includes('mp4');
      if (isAacLike) {
        throw new Error(
          `Ese audio ${label || ''} no se pudo leer. ` +
            'No lo renombres a .mp3: debes convertirlo de verdad a MP3 o WAV y volver a intentar.'
        );
      }
      throw new Error(`Ese archivo ${label || ''} no se pudo leer. Usa MP3 o WAV, o convierte tu audio a MP3/WAV.`);
    } finally {
      try {
        await ctx.close();
      } catch {}
    }
  };

  const uploadAudioToR2 = async (file: File): Promise<{ url: string; path: string }> => {
    const t = await getAccessToken();
    if (!t.ok) throw new Error('No autorizado');

    const userId = (await supabaseBrowser.auth.getUser()).data.user?.id || 'unknown';
    const ext = ((file?.name || '').toString().toLowerCase().split('.').pop() || '') === 'wav' || (file.type || '').toLowerCase().includes('wav') ? 'wav' : 'mp3';
    const path = `personas/${userId}/clone_${Date.now()}.${ext}`;
    const contentType = ext === 'wav' ? 'audio/wav' : 'audio/mpeg';

    setUploadProgress(0);

    try {
      const prep = await fetch('/api/upload-audio', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'authorization': `Bearer ${t.token}`,
        },
        body: JSON.stringify({
          title: file.name,
          contentType,
        }),
      });

      const prepText = await prep.text().catch(() => '');
      let prepOut: any = {};
      try {
        prepOut = prepText ? JSON.parse(prepText) : {};
      } catch {
        prepOut = { error: prepText || 'Respuesta inválida del servidor.' };
      }
      if (!prep.ok || prepOut?.ok === false) {
        const msg = (prepOut?.error || 'Error subiendo audio').toString();
        const detail = (prepOut?.detail || prepOut?.hint || '').toString();
        throw new Error([msg, detail].filter(Boolean).join('\n'));
      }

      const uploadUrl = (prepOut?.uploadUrl || '').toString().trim();
      const url = (prepOut?.url || '').toString().trim();
      const key = (prepOut?.key || '').toString().trim();
      if (!uploadUrl || !url) throw new Error((prepOut?.error || 'No recibí URL para subir el audio.').toString());

      await new Promise<void>((resolve, reject) => {
        try {
          const xhr = new XMLHttpRequest();
          xhr.open('PUT', uploadUrl);
          xhr.setRequestHeader('Content-Type', contentType);
          xhr.upload.onprogress = (e) => {
            if (!e.lengthComputable) return;
            const pct = Math.max(0, Math.min(100, Math.round((e.loaded / e.total) * 100)));
            setUploadProgress(pct);
          };
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) return resolve();
            return reject(new Error(`No se pudo subir el audio (HTTP ${xhr.status}).`));
          };
          xhr.onerror = () => reject(new Error('No se pudo subir el audio.'));
          xhr.onabort = () => reject(new Error('Subida cancelada.'));
          xhr.send(file);
        } catch (e) {
          reject(e instanceof Error ? e : new Error('No se pudo subir el audio.'));
        }
      });

      setUploadProgress(100);
      return { url, path: key || path };
    } catch (putErr) {
      const canFallback = file.size <= 4 * 1024 * 1024;
      if (!canFallback) {
        throw new Error(
          'No se pudo subir el audio desde el teléfono. ' +
            'Tu audio es pesado y requiere activar CORS en Cloudflare R2 para subida directa. ' +
            'Prueba con un audio más ligero (menos de 4 MB) o conviértelo a MP3 más pequeño.'
        );
      }

      setUploadProgress(0);
      const arrayBuffer = await file.arrayBuffer();
      const fileArray = Array.from(new Uint8Array(arrayBuffer));
      const response = await fetch('/api/upload-audio', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'authorization': `Bearer ${t.token}`,
        },
        body: JSON.stringify({
          title: file.name,
          contentType,
          file: fileArray,
        }),
      });

      const raw = await response.text().catch(() => '');
      let out: any = {};
      try {
        out = raw ? JSON.parse(raw) : {};
      } catch {
        out = { error: raw || 'Respuesta inválida del servidor.' };
      }
      if (!response.ok || out?.ok === false) {
        const msg = (out?.error || 'Error subiendo audio').toString();
        const detail = (out?.detail || out?.hint || '').toString();
        throw new Error([msg, detail].filter(Boolean).join('\n'));
      }

      const url = (out?.url || '').toString().trim();
      const key = (out?.key || '').toString().trim();
      if (!url) throw new Error((out?.error || 'No pude terminar la subida del audio.').toString());
      setUploadProgress(100);
      return { url, path: key || path };
    }
  };

  const uploadProfileImageToR2 = async (file: File): Promise<{ url: string; path: string }> => {
    const t = await getAccessToken();
    if (!t.ok) throw new Error('No autorizado');

    const arrayBuffer = await file.arrayBuffer();
    const fileArray = Array.from(new Uint8Array(arrayBuffer));
    const userId = (await supabaseBrowser.auth.getUser()).data.user?.id || 'unknown';
    const path = `personas/${userId}/profile_${Date.now()}.jpg`;

    const response = await fetch('/api/account/upload-profile-image', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'authorization': `Bearer ${t.token}`,
      },
      body: JSON.stringify({
        path,
        data: fileArray,
        contentType: file.type,
      }),
    });

    if (!response.ok) {
      const out = await response.json().catch(() => ({}));
      throw new Error(out?.error || 'Error subiendo imagen de perfil');
    }

    const result = await response.json();
    return { url: result.url, path };
  };

  const openEditVoice = (voice: VoiceItem) => {
    setError('');
    setSuccess('');
    setEditingVoice(voice);
    setEditVoiceName(voice.voice_name || '');
    setEditProfileImage(null);
    setEditProfileImagePreview((voice.profile_image_url || '').toString());
  };

  const closeEditVoice = () => {
    setEditingVoice(null);
    setEditVoiceName('');
    setEditProfileImage(null);
    setEditProfileImagePreview('');
    setIsSavingEdit(false);
    try {
      if (editImageInputRef.current) editImageInputRef.current.value = '';
    } catch {}
  };

  const saveEditVoice = async () => {
    if (!editingVoice) return;
    const nextName = editVoiceName.trim();
    if (!nextName) {
      setError('Escribe un nombre para la voz');
      return;
    }

    setIsSavingEdit(true);
    setError('');
    setSuccess('');

    try {
      let nextProfileImageUrl = editProfileImagePreview.trim();
      if (editProfileImage) {
        const up = await uploadProfileImageToR2(editProfileImage);
        nextProfileImageUrl = (up?.url || '').toString().trim();
      }

      const t = await getAccessToken();
      if (!t.ok) throw new Error('No autorizado');

      const r = await fetch('/api/kits/voices', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'authorization': `Bearer ${t.token}`,
        },
        body: JSON.stringify({
          voiceId: editingVoice.id,
          voiceName: nextName,
          profileImageUrl: nextProfileImageUrl || undefined,
        }),
      });

      const raw = await r.text().catch(() => '');
      let out: any = {};
      try {
        out = raw ? JSON.parse(raw) : {};
      } catch {
        out = { error: raw || 'Respuesta inválida del servidor.' };
      }

      if (!r.ok) {
        const msg = [out?.error, out?.detail].filter(Boolean).join('\n');
        throw new Error(msg || 'No se pudo actualizar la voz');
      }

      const updated = out?.voice;
      if (updated && typeof updated === 'object') {
        setVoices((prev) =>
          prev.map((v) => {
            if (v.id !== editingVoice.id) return v;
            return {
              ...v,
              voice_name: typeof updated.voice_name === 'string' ? updated.voice_name : v.voice_name,
              profile_image_url: updated.profile_image_url == null ? null : String(updated.profile_image_url || '') || null,
            };
          })
        );
      } else {
        loadVoices().catch(() => {});
      }

      setSuccess('Voz actualizada.');
      closeEditVoice();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo actualizar la voz');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const cloneVoice = async () => {
    if (!selectedFile) {
      setError('Por favor selecciona un archivo de audio');
      return;
    }

    if (!voiceProfileName.trim()) {
      setError('Por favor ingresa un nombre para la voz');
      return;
    }

    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      // Subir audio a R2
      setIsUploading(true);
      setUploadProgress(0);
      const { url: audioUrl, path: audioPath } = await uploadAudioToR2(selectedFile);
      
      // Subir imagen de perfil si existe
      let profileImageUrlToUse = profileImageUrl;
      if (profileImage) {
        const { url: uploadedProfileImageUrl } = await uploadProfileImageToR2(profileImage);
        profileImageUrlToUse = uploadedProfileImageUrl;
      }
      
      setIsUploading(false);
      setUploadProgress(100);

      // Crear voz en el backend
      const token = await getAccessToken();
      if (!token.ok) throw new Error('No autorizado');

      const finalVoiceName = voiceProfileName.trim();
      const response = await fetch('/api/suno/clone-voice', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token.token}`,
        },
        body: JSON.stringify({
          uploadUrl: audioUrl,
          uploadPath: audioPath,
          voiceName: finalVoiceName,
          description: description.trim() || undefined,
          profileImageUrl: profileImageUrlToUse,
          voiceProfileName: finalVoiceName,
          category,
          language,
          gender,
          tags: tags.filter(tag => tag.trim()),
          isPublic,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const sqlText = typeof errorData?.sql === 'string' && errorData.sql.trim() ? `SQL (copia y pega en Supabase):\n${errorData.sql}` : '';
        const msg = [errorData?.error, errorData?.detail, errorData?.hint, sqlText].filter(Boolean).join('\n\n');
        throw new Error(msg || 'Error al crear la voz');
      }

      const data = await response.json();
      setSuccess(`Voz "${finalVoiceName}" creada exitosamente. Se está entrenando el modelo...`);
      
      // Recargar la lista de voces
      loadVoices();
      
      // Resetear formulario
      setSelectedFile(null);
      setProfileImage(null);
      setProfileImageUrl('');
      setVoiceProfileName('');
      setDescription('');
      setCategory('personal');
      setLanguage('es');
      setGender('unknown');
      setTags([]);
      setIsPublic(false);
      setUploadProgress(0);
      setAudioDuration(null);
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch {
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
      console.error('Error cloning voice:', err);
    } finally {
      setIsLoading(false);
      setIsUploading(false);
    }
  };

  const deleteVoice = async (voiceId: string) => {
    if (!confirm('¿Eliminar esta voz clonada? No se puede deshacer.')) return;

    const t = await getAccessToken();
    if (!t.ok) return;

    try {
      const r = await fetch('/api/kits/voices', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'authorization': `Bearer ${t.token}`,
        },
        body: JSON.stringify({ voiceId }),
      });

      if (r.ok) {
        setVoices(prev => prev.filter(v => v.id !== voiceId));
        setSuccess('Voz eliminada.');
      } else {
        const out = await r.json();
        setError(out?.error || 'Error eliminando voz');
      }
    } catch (e) {
      setError('Error eliminando voz');
    }
  };

  const playVoice = async (voice: VoiceItem) => {
    if (playingVoiceId === voice.voice_id) {
      if (audioRef.current) {
        audioRef.current.pause();
        setPlayingVoiceId(null);
      }
      return;
    }

    const fromRow =
      (typeof voice.sample_url === 'string' && voice.sample_url.trim()) ||
      (typeof voice.output?.sample_url === 'string' && voice.output.sample_url.trim()) ||
      (typeof voice.output?.audio_url === 'string' && voice.output.audio_url.trim()) ||
      (typeof voice.output?.audio === 'string' && voice.output.audio.trim()) ||
      '';

    if (fromRow) {
      setPlayingVoiceId(voice.voice_id);
      setAudioUrl(fromRow);
      return;
    }

    const statusData = await checkVoiceStatus(voice.id);
    let output: any = null;
    const outRaw = statusData?.output;
    if (outRaw && typeof outRaw === 'string') {
      try {
        output = JSON.parse(outRaw);
      } catch {
        output = null;
      }
    } else if (outRaw && typeof outRaw === 'object') {
      output = outRaw;
    }

    const url =
      (typeof output?.sample_url === 'string' && output.sample_url.trim()) ||
      (typeof output?.audio_url === 'string' && output.audio_url.trim()) ||
      (typeof output?.audio === 'string' && output.audio.trim()) ||
      '';

    if (!url) {
      setError('Esta voz no tiene audio para reproducir todavía.');
      return;
    }

    setPlayingVoiceId(voice.voice_id);
    setAudioUrl(url);
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case 'ready': return <CheckCircle className="w-4 h-4 text-emerald-400" />;
      case 'failed': return <XCircle className="w-4 h-4 text-red-400" />;
      default: return <Loader2 className="w-4 h-4 text-yellow-400 animate-spin" />;
    }
  };

  const statusText = (status: string) => {
    switch (status) {
      case 'ready': return 'Lista';
      case 'failed': return 'Falló';
      default: return 'Procesando…';
    }
  };

  const formatVoiceErrorMessage = (err: any) => {
    if (!err) return '';
    let msg = '';
    if (typeof err === 'string') {
      msg = err.trim();
    } else if (typeof err === 'object') {
      const candidates = [err?.message, err?.detail, err?.error, err?.title, err?.reason];
      for (const c of candidates) {
        if (typeof c === 'string' && c.trim()) {
          msg = c.trim();
          break;
        }
      }
      if (!msg) {
        try {
          msg = JSON.stringify(err);
        } catch {
          msg = '';
        }
      }
    }
    if (msg.length > 600) msg = msg.slice(0, 600) + '…';
    return msg;
  };

  function parseVocalRemovalItems(provider: any) {
    const cleanUrl = (raw: any) =>
      String(raw || '')
        .replace(/^"+|"+$/g, '')
        .trim();

    const map: Record<string, string> = {
      originUrl: 'Original',
      instrumentalUrl: 'Instrumental (Karaoke)',
      vocalUrl: 'Voz',
      backingVocalsUrl: 'Coros',
      drumsUrl: 'Batería',
      bassUrl: 'Bajo',
      pianoUrl: 'Piano',
      guitarUrl: 'Guitarra',
      stringsUrl: 'Cuerdas',
      woodwindsUrl: 'Vientos',
      brassUrl: 'Metales',
      synthUrl: 'Synth',
      otherUrl: 'Otros',
    };
    const map2: Record<string, string> = {
      Vocals: 'Voz',
      Instrumental: 'Instrumental (Karaoke)',
      'Backing Vocals': 'Coros',
      Drums: 'Batería',
      Bass: 'Bajo',
      Piano: 'Piano',
      Guitar: 'Guitarra',
      Strings: 'Cuerdas',
      Woodwinds: 'Vientos',
      Brass: 'Metales',
      Synth: 'Synth',
      Other: 'Otros',
    };

    const takeObj = (x: any) => (x && typeof x === 'object' ? x : null);
    const root = takeObj(provider?.data?.response) || takeObj(provider?.data?.data?.response) || takeObj(provider?.data?.data?.data?.response) || takeObj(provider?.data) || provider || {};

    const items: Array<{ key: string; label: string; url: string; audioId?: string }> = [];
    const push = (key: string, url: any, label?: string, audioId?: any) => {
      const u = cleanUrl(url);
      if (!/^https?:\/\//i.test(u)) return;
      const k = String(key || '').trim();
      if (!k) return;
      const l = String(label || map[k] || map2[k] || k).trim();
      const aid = typeof audioId === 'string' ? audioId.trim() : audioId == null ? '' : String(audioId).trim();
      items.push({ key: k, label: l || k, url: u, audioId: aid || undefined });
    };

    const direct = root?.data || root?.result || root?.response || root;
    if (direct && typeof direct === 'object') {
      for (const k of Object.keys(map)) {
        if ((direct as any)[k]) push(k, (direct as any)[k], map[k], (direct as any)?.audioId || (direct as any)?.audio_id);
      }
    }

    const stems = Array.isArray(root?.stems) ? root.stems : Array.isArray(direct?.stems) ? direct.stems : [];
    for (const s of stems) {
      const name = String(s?.name || s?.label || '').trim();
      const url = s?.url || s?.audio || s?.audio_url;
      if (!name) continue;
      const label = map2[name] || name;
      const norm = name.trim().replace(/\s+/g, ' ');
      const lower = norm.toLowerCase();
      const fixed: Record<string, string> = {
        vocals: 'vocalUrl',
        vocal: 'vocalUrl',
        instrumental: 'instrumentalUrl',
        'backing vocals': 'backingVocalsUrl',
        drums: 'drumsUrl',
        bass: 'bassUrl',
        piano: 'pianoUrl',
        guitar: 'guitarUrl',
        strings: 'stringsUrl',
        woodwinds: 'woodwindsUrl',
        brass: 'brassUrl',
        synth: 'synthUrl',
        other: 'otherUrl',
      };
      const key = fixed[lower] || norm;
      push(key, url, label, s?.audioId || s?.audio_id);
    }

    const seen = new Set<string>();
    return items.filter((x) => {
      const k = `${x.key}|${x.url}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  const runHqCoverPipeline = async (params: {
    token: string;
    baseName: string;
    description: string;
    coverUrl: string;
    taskId: string;
    audioId: string;
  }) => {
    const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    const parseStatus = (provider: any) => {
      const data = provider?.data || provider?.data?.data || provider;
      const raw = data?.data?.status ?? data?.data?.successFlag ?? data?.status ?? data?.successFlag ?? '';
      return String(raw || '').toUpperCase();
    };
    const importAudio = async (p: {
      sourceUrl: string;
      title: string;
      description?: string;
      coverUrl?: string;
      externalId?: string;
      sunoTaskId?: string;
    }) => {
      const r = await fetch('/api/library/import-audio', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${params.token}` },
        body: JSON.stringify({
          sourceUrl: p.sourceUrl,
          title: p.title,
          description: p.description || '',
          coverUrl: p.coverUrl || '',
          externalId: p.externalId || '',
          sunoTaskId: p.sunoTaskId || '',
        }),
      });
      const out = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((out?.detail || out?.error || 'No pude guardar en Biblioteca.').toString());
      return out?.song ?? null;
    };

    const decodeAudio = async (ctx: AudioContext, buf: ArrayBuffer): Promise<AudioBuffer> => {
      return await new Promise((resolve, reject) => {
        const p = ctx.decodeAudioData(buf.slice(0));
        if (p && typeof (p as any).then === 'function') {
          (p as any).then(resolve).catch(reject);
        } else {
          ctx.decodeAudioData(buf.slice(0), resolve, reject);
        }
      });
    };

    const mixToWavBlob = async (instUrl: string, vocalUrl: string) => {
      const r1 = await fetch(instUrl);
      if (!r1.ok) throw new Error(`No pude descargar instrumental (HTTP ${r1.status}).`);
      const r2 = await fetch(vocalUrl);
      if (!r2.ok) throw new Error(`No pude descargar voz clonada (HTTP ${r2.status}).`);
      const b1 = await r1.arrayBuffer();
      const b2 = await r2.arrayBuffer();
      const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) throw new Error('Tu navegador no soporta mezclar audio aquí.');
      const ctx = new AudioCtx();
      try {
        const a1 = await decodeAudio(ctx, b1);
        const a2 = await decodeAudio(ctx, b2);
        const sr = a1.sampleRate || 44100;
        const length = Math.max(a1.length, a2.length);
        const oc = new OfflineAudioContext(2, Math.max(1, length), sr);
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
        return audioBufferToWavBlob(rendered);
      } finally {
        try {
          await ctx.close();
        } catch {
        }
      }
    };

    if (!coverVoiceId) throw new Error('Selecciona una voz.');
    if (!params.taskId && !params.audioId) throw new Error('No tengo taskId/audioId para separar.');

    setCoverProgress('Separando voz e instrumentos…');
    const start = await fetch('/api/suno/separate', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${params.token}` },
      body: JSON.stringify({ taskId: params.taskId || '', audioId: params.audioId || '', type: 'split_stem' }),
    });
    const startedOut = await start.json().catch(() => ({}));
    if (!start.ok) throw new Error((startedOut?.detail || startedOut?.error || 'No pude iniciar la separación.').toString());
    const sepTaskId = String(startedOut?.taskId || '').trim();
    if (!sepTaskId) throw new Error('No recibí taskId de separación.');

    let provider: any = null;
    const startedAt = Date.now();
    while (Date.now() - startedAt < 30 * 60 * 1000) {
      await delay(3500);
      const tr = await fetch(`/api/suno/task?kind=split_stem&taskId=${encodeURIComponent(sepTaskId)}`, {
        headers: { authorization: `Bearer ${params.token}` },
      });
      const tout = await tr.json().catch(() => ({}));
      if (!tr.ok) continue;
      provider = tout?.data;
      const status = parseStatus(provider);
      if (status === 'FAILED' || status === 'CREATE_TASK_FAILED' || status === 'CALLBACK_EXCEPTION') {
        throw new Error('No se pudo separar la canción en stems.');
      }
      if (status === 'SUCCESS') break;
    }

    const items = parseVocalRemovalItems(provider);
    const vocalItem = items.find((x: any) => (x?.key || '').trim() === 'vocalUrl');
    const instItem = items.find((x: any) => (x?.key || '').trim() === 'instrumentalUrl');
    if (!vocalItem?.url || !instItem?.url) throw new Error('Terminó, pero no recibí links de stems (voz/instrumental).');

    setCoverProgress('Guardando stems…');
    const instSaved = await importAudio({
      sourceUrl: instItem.url,
      title: `${params.baseName} - Instrumental`.slice(0, 120),
      description: params.description,
      coverUrl: params.coverUrl,
      externalId: `stem_${sepTaskId}_instrumentalUrl`,
      sunoTaskId: sepTaskId,
    }).catch(() => null);

    const vocalSaved = await importAudio({
      sourceUrl: vocalItem.url,
      title: `${params.baseName} - Voz`.slice(0, 120),
      description: params.description,
      coverUrl: params.coverUrl,
      externalId: `stem_${sepTaskId}_vocalUrl`,
      sunoTaskId: sepTaskId,
    }).catch(() => null);

    const vocalInputUrl =
      (typeof (vocalSaved as any)?.audio_url === 'string' ? String((vocalSaved as any).audio_url).trim() : '') || vocalItem.url;
    if (!vocalInputUrl) throw new Error('No pude preparar el audio de voz para clonar.');

    setCoverProgress('Clonando solo la voz…');
    const coverRes = await fetch('/api/suno/create-cover', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${params.token}` },
      body: JSON.stringify({
        uploadUrl: vocalInputUrl,
        voiceId: coverVoiceId,
        title: `${params.baseName} - Voz clonada`.slice(0, 120),
        outputFormat: 'wav',
      }),
    });
    const coverOut = await coverRes.json().catch(() => ({}));
    if (!coverRes.ok) {
      const msg = [coverOut?.error, coverOut?.detail, coverOut?.hint]
        .map((x: any) => (typeof x === 'string' ? x.trim() : ''))
        .filter(Boolean)
        .join('\n\n');
      throw new Error(msg || 'No pude iniciar el clonado.');
    }
    const predictionId = String(coverOut?.predictionId || coverOut?.coverId || '').trim();
    if (!predictionId) throw new Error('No recibí predictionId del clonador.');

    let outputUrl = '';
    const cloneStartedAt = Date.now();
    while (Date.now() - cloneStartedAt < 45 * 60 * 1000) {
      await delay(5000);
      const sr = await fetch(`/api/rvc/cover-status?predictionId=${encodeURIComponent(predictionId)}&nocache=1`, {
        headers: { authorization: `Bearer ${params.token}` },
      });
      const sout = await sr.json().catch(() => ({}));
      if (!sr.ok) continue;
      const rawStatus = (sout?.replicateStatus || sout?.status || '').toString().trim().toLowerCase();
      if (rawStatus === 'failed' || rawStatus === 'canceled' || rawStatus === 'error') {
        throw new Error((sout?.importError || sout?.replicateFetchError || sout?.error || 'El clonador falló.').toString());
      }
      const u = typeof sout?.outputUrl === 'string' ? sout.outputUrl.trim() : '';
      if (u && (rawStatus === 'succeeded' || rawStatus === 'completed' || rawStatus === 'ready')) {
        outputUrl = u;
        break;
      }
    }
    if (!outputUrl) throw new Error('El clonador está tardando demasiado. Intenta más tarde.');

    setCoverProgress('Guardando voz clonada…');
    const clonedSaved = await importAudio({
      sourceUrl: outputUrl,
      title: `${params.baseName} - Voz clonada`.slice(0, 120),
      description: params.description,
      coverUrl: params.coverUrl,
      externalId: `rvc_vocals_${predictionId}`.slice(0, 200),
    }).catch(() => null);

    const instId = String((instSaved as any)?.id || '').trim();
    const vocalsId = String((clonedSaved as any)?.id || '').trim();
    const instFetchUrl = instId ? `/api/share/song/audio?id=${encodeURIComponent(instId)}&t=${Date.now()}` : instItem.url;
    const vocalFetchUrl = vocalsId ? `/api/share/song/audio?id=${encodeURIComponent(vocalsId)}&t=${Date.now()}` : outputUrl;

    setCoverProgress('Mezclando…');
    const mixed = await mixToWavBlob(instFetchUrl, vocalFetchUrl);

    setCoverProgress('Subiendo audio final…');
    const up = await fetch('/api/upload-audio', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${params.token}` },
      body: JSON.stringify({ title: `${params.baseName} (voz clonada)`.slice(0, 120), contentType: 'audio/wav' }),
    });
    const upOut = await up.json().catch(() => ({}));
    if (!up.ok || upOut?.ok !== true || !upOut?.uploadUrl || !upOut?.key) {
      throw new Error((upOut?.error || 'No pude preparar la subida del audio final.').toString());
    }

    const put = await fetch(String(upOut.uploadUrl), { method: 'PUT', headers: { 'content-type': 'audio/wav' }, body: mixed });
    if (!put.ok) {
      throw new Error('No pude subir el audio final. Si sale un error de CORS, hay que habilitar CORS en Cloudflare R2 (una sola vez).');
    }

    const created = await fetch('/api/library/create-from-r2', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${params.token}` },
      body: JSON.stringify({
        key: String(upOut.key),
        title: `${params.baseName} (voz clonada)`.slice(0, 120),
        description: params.description,
        coverUrl: params.coverUrl,
        isCover: true,
        externalId: `rvc_mix_${predictionId}`.slice(0, 200),
      }),
    });
    const createdOut = await created.json().catch(() => ({}));
    if (!created.ok) throw new Error((createdOut?.detail || createdOut?.error || 'No pude guardar el audio final en Biblioteca.').toString());
  };

  const createHqCoverFromLibrarySong = async () => {
    if (isCoverBusy) return;
    setCoverError('');
    setCoverSuccess('');
    setCoverProgress('');
    const t = await getAccessToken();
    if (!t.ok) {
      setCoverError(t.error || 'No se pudo iniciar sesión.');
      return;
    }

    const song = librarySongs.find((s) => s.id === coverSongId) || null;
    if (!song) {
      setCoverError('Selecciona una canción.');
      return;
    }
    if (!coverVoiceId) {
      setCoverError('Selecciona una voz.');
      return;
    }
    if (!song.suno_task_id && !song.suno_audio_id) {
      setCoverError('Esa canción no se puede separar (no tiene taskId/audioId).');
      return;
    }

    try {
      setIsCoverBusy(true);
      const baseName = (song.title || 'Canción').toString().trim().slice(0, 100);
      const desc = (song.description || '').toString().trim().slice(0, 2000);
      const coverUrl = (song.cover_url || '').toString().trim().slice(0, 2000);
      await runHqCoverPipeline({
        token: t.token,
        baseName,
        description: desc,
        coverUrl,
        taskId: song.suno_task_id || '',
        audioId: song.suno_audio_id || '',
      });

      setCoverSuccess('Listo. Ya está en tu Biblioteca.');
      setCoverProgress('');
      loadLibrarySongs().catch(() => {});
    } catch (e) {
      setCoverError(e instanceof Error ? e.message : 'Error creando el cover.');
    } finally {
      setIsCoverBusy(false);
    }
  };

  const createHqCoverFromExternalFile = async () => {
    if (isCoverBusy) return;
    setCoverError('');
    setCoverSuccess('');
    setCoverProgress('');
    const file = externalCoverFile;
    if (!file) {
      setCoverError('Selecciona un archivo de audio.');
      return;
    }
    if (!coverVoiceId) {
      setCoverError('Selecciona una voz.');
      return;
    }

    const baseName = (externalCoverTitle || file.name || 'Canción').toString().replace(/\.[^/.]+$/, '').trim().slice(0, 100) || 'Canción';

    try {
      setIsCoverBusy(true);
      setCoverProgress('Subiendo tu canción…');
      const t = await getAccessToken();
      if (!t.ok) throw new Error(t.error || 'No se pudo iniciar sesión.');

      let duration = 0;
      try {
        duration = await getAudioDuration(file);
      } catch {
        duration = 0;
      }
      if (Number.isFinite(duration) && duration > 0 && duration > 60 * 8) {
        throw new Error('Tu audio dura más de 8 minutos. Usa un audio más corto.');
      }

      const uploaded = await uploadAudioToR2(file);

      const createdOrig = await fetch('/api/library/create-from-r2', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${t.token}` },
        body: JSON.stringify({
          key: String(uploaded.path),
          title: baseName.slice(0, 120),
          description: '',
          coverUrl: '',
          isCover: false,
          externalId: `ext_${String(uploaded.path).replaceAll(/[^a-zA-Z0-9_-]/g, '_').slice(-80)}`.slice(0, 200),
        }),
      });
      const createdOrigOut = await createdOrig.json().catch(() => ({}));
      if (!createdOrig.ok) throw new Error((createdOrigOut?.detail || createdOrigOut?.error || 'No pude guardar tu canción en Biblioteca.').toString());
      const createdSongId = String(createdOrigOut?.song?.id || '').trim();
      if (createdSongId) {
        setCoverSongId(createdSongId);
        loadLibrarySongs().catch(() => {});
      }

      setCoverProgress('Preparando la canción…');
      const startUploadCover = await fetch('/api/suno/upload-cover', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${t.token}` },
        body: JSON.stringify({
          uploadPath: uploaded.path,
          title: baseName.slice(0, 100),
          style: 'General',
          prompt: ' ',
          instrumental: false,
        }),
      });
      const startUploadOut = await startUploadCover.json().catch(() => ({}));
      if (!startUploadCover.ok) throw new Error((startUploadOut?.detail || startUploadOut?.error || 'No pude preparar la canción.').toString());
      const uploadTaskId = String(startUploadOut?.taskId || '').trim();
      if (!uploadTaskId) throw new Error('No recibí taskId de preparación.');

      const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
      const parseStatus = (provider: any) => {
        const data = provider?.data || provider?.data?.data || provider;
        const raw = data?.data?.status ?? data?.data?.successFlag ?? data?.status ?? data?.successFlag ?? '';
        return String(raw || '').toUpperCase();
      };

      const startedAt = Date.now();
      let provider: any = null;
      setCoverProgress('Procesando la canción…');
      while (Date.now() - startedAt < 30 * 60 * 1000) {
        await delay(3500);
        const tr = await fetch(`/api/suno/task?kind=upload-cover&taskId=${encodeURIComponent(uploadTaskId)}`, {
          headers: { authorization: `Bearer ${t.token}` },
        });
        const tout = await tr.json().catch(() => ({}));
        if (!tr.ok) continue;
        provider = tout?.data;
        const status = parseStatus(provider);
        if (status === 'FAILED' || status === 'CREATE_TASK_FAILED' || status === 'CALLBACK_EXCEPTION') {
          throw new Error('No se pudo preparar la canción.');
        }
        if (status === 'SUCCESS') break;
      }

      await runHqCoverPipeline({
        token: t.token,
        baseName,
        description: '',
        coverUrl: '',
        taskId: uploadTaskId,
        audioId: '',
      });

      setCoverSuccess('Listo. Ya está en tu Biblioteca.');
      setCoverProgress('');
      loadLibrarySongs().catch(() => {});
    } catch (e) {
      setCoverError(e instanceof Error ? e.message : 'Error creando el cover.');
    } finally {
      setIsCoverBusy(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col p-4 md:p-6 overflow-y-auto">
      <div className="max-w-[720px] mx-auto w-full space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-white">Clonar Voz</h1>
          <p className="text-sm text-slate-300 mt-1">
            Sube un audio de tu voz para crear un clon que podrás usar en tus canciones.
          </p>
        </div>

        <div className="glass-card rounded-3xl border border-white/10 p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center">
              <Mic className="w-6 h-6 text-purple-200" />
            </div>
            <div className="min-w-0">
              <div className="text-white font-extrabold">Clonar voz en una canción</div>
              <div className="text-xs text-slate-300">Mejor calidad: separa voz, clona solo la voz y luego mezcla con instrumental</div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="text-slate-300 text-sm">Canción</div>
            <button
              type="button"
              onClick={() => setShowPickCoverSong(true)}
              disabled={isCoverBusy || librarySongs.length === 0}
              className={cn(
                "w-full glass-card rounded-2xl p-3 text-sm border border-white/10 text-left transition-colors",
                isCoverBusy || librarySongs.length === 0 ? "bg-white/5 text-slate-500" : "bg-white/5 hover:bg-white/10 text-white"
              )}
            >
              {(() => {
                const s = librarySongs.find((x) => x.id === coverSongId) || null;
                if (s) return s.title || 'Canción';
                return librarySongs.length > 0 ? 'Seleccionar canción de la Biblioteca' : 'Cargando canciones…';
              })()}
            </button>

            <div className="text-[11px] text-slate-500">O sube una canción externa (MP3/WAV)</div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => coverFileInputRef.current?.click()}
                disabled={isCoverBusy}
                className={cn(
                  "shrink-0 px-4 py-2 rounded-full border text-xs font-extrabold transition-colors",
                  isCoverBusy ? "bg-white/5 border-white/10 text-slate-500" : "bg-white/5 hover:bg-white/10 border-white/10 text-slate-200"
                )}
              >
                Subir archivo
              </button>
              <input
                ref={coverFileInputRef}
                type="file"
                accept=".mp3,.wav,.m4a,.aac,.ogg,.webm,audio/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0] || null;
                  setExternalCoverFile(f);
                  const name = (f?.name || '').toString().replace(/\.[^/.]+$/, '').trim();
                  setExternalCoverTitle(name);
                }}
              />
              <div className="min-w-0 text-xs text-slate-400 truncate">
                {externalCoverFile ? externalCoverFile.name : 'Ningún archivo seleccionado'}
              </div>
            </div>
            {externalCoverFile ? (
              <button
                type="button"
                onClick={() => createHqCoverFromExternalFile().catch(() => {})}
                disabled={isCoverBusy || !coverVoiceId}
                className={cn(
                  "w-full py-3 rounded-full font-extrabold text-sm flex items-center justify-center gap-2 transition-colors",
                  isCoverBusy || !coverVoiceId ? "bg-white/10 text-slate-400 cursor-not-allowed" : "bg-indigo-600 hover:bg-indigo-500 text-white"
                )}
              >
                {isCoverBusy ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Procesando…
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" /> Crear cover desde archivo
                  </>
                )}
              </button>
            ) : null}

            <div className="text-slate-300 text-sm">Voz</div>
            <button
              type="button"
              onClick={() => setShowPickCoverVoice(true)}
              disabled={isCoverBusy || voices.filter((v) => v.status === 'ready').length === 0}
              className={cn(
                "w-full glass-card rounded-2xl p-3 text-sm border border-white/10 text-left transition-colors",
                isCoverBusy || voices.filter((v) => v.status === 'ready').length === 0
                  ? "bg-white/5 text-slate-500"
                  : "bg-white/5 hover:bg-white/10 text-white"
              )}
            >
              {(() => {
                const v = voices.find((x) => x.voice_id === coverVoiceId) || null;
                if (v) return ((v.voice_profile_name || v.voice_name || '').toString().trim() || 'Voz');
                return voices.filter((x) => x.status === 'ready').length > 0 ? 'Seleccionar tu voz clonada' : 'No hay voces listas';
              })()}
            </button>

            <button
              onClick={() => createHqCoverFromLibrarySong().catch(() => {})}
              disabled={isCoverBusy || !coverSongId || !coverVoiceId}
              className={cn(
                "w-full py-3.5 rounded-full font-extrabold text-sm flex items-center justify-center gap-2 transition-colors",
                isCoverBusy || !coverSongId || !coverVoiceId
                  ? "bg-white/10 text-slate-400 cursor-not-allowed"
                  : "bg-purple-600 hover:bg-purple-500 text-white"
              )}
            >
              {isCoverBusy ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Procesando…
                </>
              ) : (
                <>
                  <Mic className="w-4 h-4" /> Crear cover (mejor calidad)
                </>
              )}
            </button>

            {coverProgress ? <div className="text-xs text-slate-300">{coverProgress}</div> : null}
            {coverError ? (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-2xl text-red-300 text-sm">{coverError}</div>
            ) : null}
            {coverSuccess ? (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl text-emerald-300 text-sm">
                {coverSuccess} Ve a Biblioteca para verla.
              </div>
            ) : null}
          </div>
        </div>

        {showPickCoverSong ? (
          <div className="fixed inset-0 z-[2147483647] bg-black/70 flex items-end md:items-center justify-center">
            <button className="absolute inset-0 w-full h-full" onClick={() => setShowPickCoverSong(false)} aria-label="Cerrar" />
            <div className="relative w-full md:max-w-[720px] bg-[#0b0f16] border border-white/10 rounded-t-3xl md:rounded-3xl overflow-hidden max-h-[85vh] flex flex-col">
              <div className="p-4 border-b border-white/10 flex items-center justify-between">
                <div className="text-white font-extrabold">Selecciona una canción</div>
                <button
                  onClick={() => setShowPickCoverSong(false)}
                  className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-200"
                >
                  ✕
                </button>
              </div>
              <div className="p-4 overflow-y-auto">
                <div className="space-y-2">
                  {librarySongs.map((s) => {
                    const ok = Boolean(s.suno_task_id || s.suno_audio_id);
                    const active = s.id === coverSongId;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        disabled={!ok}
                        onClick={() => {
                          if (!ok) return;
                          setCoverSongId(s.id);
                          setShowPickCoverSong(false);
                        }}
                        className={cn(
                          "w-full text-left rounded-2xl p-4 border transition-colors",
                          !ok ? "bg-white/5 border-white/10 text-slate-500 opacity-70" : active ? "bg-purple-600/20 border-purple-500/30 text-white" : "bg-white/5 border-white/10 text-slate-200 hover:bg-white/10"
                        )}
                      >
                        <div className="font-extrabold truncate">{s.title || 'Canción'}</div>
                        <div className="text-xs text-slate-400 truncate">{ok ? 'Lista para separar voz/instrumental' : 'No se puede separar (no tiene info del proveedor)'}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {showPickCoverVoice ? (
          <div className="fixed inset-0 z-[2147483647] bg-black/70 flex items-end md:items-center justify-center">
            <button className="absolute inset-0 w-full h-full" onClick={() => setShowPickCoverVoice(false)} aria-label="Cerrar" />
            <div className="relative w-full md:max-w-[720px] bg-[#0b0f16] border border-white/10 rounded-t-3xl md:rounded-3xl overflow-hidden max-h-[85vh] flex flex-col">
              <div className="p-4 border-b border-white/10 flex items-center justify-between">
                <div className="text-white font-extrabold">Selecciona una voz</div>
                <button
                  onClick={() => setShowPickCoverVoice(false)}
                  className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-200"
                >
                  ✕
                </button>
              </div>
              <div className="p-4 overflow-y-auto">
                <div className="space-y-2">
                  {voices
                    .filter((v) => v.status === 'ready')
                    .map((v) => {
                      const name = (v.voice_profile_name || v.voice_name || '').toString().trim() || 'Voz';
                      const active = v.voice_id === coverVoiceId;
                      return (
                        <button
                          key={v.voice_id}
                          type="button"
                          onClick={() => {
                            setCoverVoiceId(v.voice_id);
                            setShowPickCoverVoice(false);
                          }}
                          className={cn(
                            "w-full text-left rounded-2xl p-4 border transition-colors flex items-center gap-3",
                            active ? "bg-purple-600/20 border-purple-500/30 text-white" : "bg-white/5 border-white/10 text-slate-200 hover:bg-white/10"
                          )}
                        >
                          <div className="w-12 h-12 rounded-2xl overflow-hidden bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                            {v.profile_image_url ? (
                              <img src={v.profile_image_url} alt={name} className="w-full h-full object-cover" />
                            ) : (
                              <User className="w-6 h-6 text-slate-400" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="font-extrabold truncate">{name}</div>
                            <div className="text-xs text-slate-400 truncate">Lista para usar</div>
                          </div>
                        </button>
                      );
                    })}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {/* Audio Requirements Info */}
        <div className="glass-card rounded-3xl border border-white/10 p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
                <Info className="w-6 h-6 text-emerald-300" />
              </div>
              <div className="min-w-0">
                <div className="text-white font-extrabold">Requisitos del Audio</div>
                <div className="text-xs text-slate-300">Para obtener los mejores resultados</div>
              </div>
            </div>
            <button
              onClick={() => setShowAudioRequirements(!showAudioRequirements)}
              className="p-2 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 transition-colors"
            >
              {showAudioRequirements ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
            </button>
          </div>

          {showAudioRequirements && (
            <div className="space-y-4">
            {/* Duración Requirements */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
              <div className="text-white font-semibold mb-2">Duración del Audio</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                    <span className="text-slate-300 text-sm">Mínimo:</span>
                  </div>
                  <div className="text-white font-bold text-lg">10 segundos</div>
                  <div className="text-slate-400 text-xs">
                    Tiempo suficiente para capturar tu voz
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-purple-500"></div>
                    <span className="text-slate-300 text-sm">Máximo:</span>
                  </div>
                  <div className="text-white font-bold text-lg">5 minutos</div>
                  <div className="text-slate-400 text-xs">
                    Equivalente a una canción completa
                  </div>
                </div>
              </div>
            </div>

            {/* File Size Requirements */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
              <div className="text-white font-semibold mb-2">Tamaño del Archivo</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                    <span className="text-slate-300 text-sm">Formato:</span>
                  </div>
                  <div className="text-white font-bold text-lg">MP3 o WAV (o M4A/AAC/OGG/WEBM)</div>
                  <div className="text-slate-400 text-xs">
                    Si no es MP3/WAV, la app lo convierte a WAV
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-orange-500"></div>
                    <span className="text-slate-300 text-sm">Tamaño máximo:</span>
                  </div>
                  <div className="text-white font-bold text-lg">50 MB</div>
                  <div className="text-slate-400 text-xs">
                    Suficiente para audio de alta calidad
                  </div>
                </div>
              </div>
            </div>

            {/* Tips */}
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4">
              <div className="text-white font-semibold mb-2 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                <span>Consejos para mejores resultados:</span>
              </div>
              <ul className="space-y-2 text-sm text-slate-300">
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400">•</span>
                  <span>Usa el micrófono de tu celular</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400">•</span>
                  <span>Grabar en un ambiente silencioso</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400">•</span>
                  <span>Habla o canta de forma natural</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400">•</span>
                  <span>Evita ruidos de fondo y ecos</span>
                </li>
              </ul>
            </div>
          </div>
          )}
        </div>

        {/* Upload Section */}
        <div className="glass-card rounded-3xl border border-white/10 p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-100">
              <Mic className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <div className="text-white font-extrabold">Subir Audio</div>
              <div className="text-xs text-slate-300">MP3/WAV o M4A/AAC/OGG/WEBM, mínimo 10 segundos, máximo 5 minutos (50 MB)</div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex-1 py-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 font-semibold flex items-center justify-center gap-2 transition-colors"
                disabled={isLoading}
              >
                <Mic className="w-4 h-4" /> Seleccionar archivo
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".mp3,.wav,.m4a,.aac,.ogg,.webm,audio/*"
                className="hidden"
                onChange={handleFileSelect}
              />
            </div>
            {isPreparingAudio && (
              <div className="text-xs text-slate-400">
                Preparando audio…
              </div>
            )}

            {/* Selected File Info */}
            {selectedFile && (
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                    <span className="text-white font-semibold">Archivo seleccionado:</span>
                  </div>
                  <div className="text-xs text-slate-400">
                    {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                  </div>
                </div>
                
                <div className="text-sm text-slate-300 mb-2 truncate">
                  {selectedFile.name}
                </div>
                
                {audioDuration && (
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-1">
                        <span className="text-slate-400">Duración:</span>
                        <span className="text-white font-bold">
                          {Math.floor(audioDuration / 60)}:{Math.floor(audioDuration % 60).toString().padStart(2, '0')}
                        </span>
                        <span className="text-slate-400">(min:seg)</span>
                      </div>
                      
                      <div className="flex items-center gap-1">
                        <span className="text-slate-400">Segundos:</span>
                        <span className="text-white font-bold">{audioDuration.toFixed(1)}</span>
                      </div>
                    </div>
                    
                    <div className={`px-2 py-1 rounded-full text-xs font-bold ${
                      audioDuration >= 10 && audioDuration <= 300 
                        ? 'bg-emerald-500/20 text-emerald-300' 
                        : 'bg-red-500/20 text-red-300'
                    }`}>
                      {audioDuration >= 10 && audioDuration <= 300 ? '✓ Válido' : '✗ Inválido'}
                    </div>
                  </div>
                )}
              </div>
            )}

            {selectedFile && (
              <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <div className="text-white font-semibold truncate">{selectedFile.name}</div>
                    <div className="text-xs text-slate-400 mt-1">
                      {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedFile(null)}
                    className="shrink-0 w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-slate-300"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {isUploading && (
              <div className="mt-4">
                <div className="flex items-center justify-between text-xs text-slate-300 mb-1">
                  <span>Subiendo audio…</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full bg-emerald-400 transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}

            <div className="space-y-3">
              {/* Profile Image Upload */}
              <div>
                <label className="block text-sm font-semibold text-slate-300 mb-2">
                  Foto de perfil de la voz (opcional)
                </label>
                <div className="flex items-center gap-4">
                  {profileImageUrl ? (
                    <div className="relative">
                      <img
                        src={profileImageUrl}
                        alt="Preview"
                        className="w-16 h-16 rounded-2xl object-cover border border-white/10"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setProfileImage(null);
                          setProfileImageUrl('');
                        }}
                        className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center text-xs"
                      >
                        ×
                      </button>
                    </div>
                  ) : (
                    <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
                      <User className="w-6 h-6 text-slate-500" />
                    </div>
                  )}
                  <div className="flex-1">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setProfileImage(file);
                          setProfileImageUrl(URL.createObjectURL(file));
                        }
                      }}
                      className="hidden"
                      id="profile-image-input"
                    />
                    <label
                      htmlFor="profile-image-input"
                      className="block w-full bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl px-4 py-3 text-slate-300 text-sm cursor-pointer transition-colors text-center"
                    >
                      {profileImage ? 'Cambiar imagen' : 'Subir imagen'}
                    </label>
                    <div className="text-xs text-slate-500 mt-1">
                      JPG, PNG o GIF, máximo 5MB
                    </div>
                  </div>
                </div>
              </div>

              {/* Voice Profile Name */}
              <div>
                <label className="block text-sm font-semibold text-slate-300 mb-2">
                  Nombre de la Voz
                </label>
                <input
                  type="text"
                  value={voiceProfileName}
                  onChange={(e) => setVoiceProfileName(e.target.value.slice(0, 50))}
                  placeholder="Ej: Ruben Cantante, Mi Voz Profesional"
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-white placeholder-slate-500 outline-none focus:border-emerald-500/50 transition-colors"
                  maxLength={50}
                />
                <div className="text-xs text-slate-500 mt-1 text-right">
                  {voiceProfileName.length}/50
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-300 mb-2">
                  Descripción (opcional)
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value.slice(0, 200))}
                  placeholder="Ej: Voz clonada de mis grabaciones personales"
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-white placeholder-slate-500 outline-none focus:border-emerald-500/50 transition-colors resize-none"
                  rows={2}
                  maxLength={200}
                />
                <div className="text-xs text-slate-500 mt-1 text-right">
                  {description.length}/200
                </div>
              </div>

              {/* Additional Metadata */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-300 mb-2">
                    Categoría
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    style={{ colorScheme: 'dark' }}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-white outline-none focus:border-emerald-500/50 transition-colors"
                  >
                    <option value="personal" className="bg-[#0b0f16] text-slate-200">Personal</option>
                    <option value="celebrity" className="bg-[#0b0f16] text-slate-200">Celebridad</option>
                    <option value="character" className="bg-[#0b0f16] text-slate-200">Personaje</option>
                    <option value="professional" className="bg-[#0b0f16] text-slate-200">Profesional</option>
                    <option value="ai" className="bg-[#0b0f16] text-slate-200">IA Generada</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-300 mb-2">
                    Idioma
                  </label>
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    style={{ colorScheme: 'dark' }}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-white outline-none focus:border-emerald-500/50 transition-colors"
                  >
                    <option value="es" className="bg-[#0b0f16] text-slate-200">Español</option>
                    <option value="en" className="bg-[#0b0f16] text-slate-200">Inglés</option>
                    <option value="fr" className="bg-[#0b0f16] text-slate-200">Francés</option>
                    <option value="pt" className="bg-[#0b0f16] text-slate-200">Portugués</option>
                    <option value="de" className="bg-[#0b0f16] text-slate-200">Alemán</option>
                    <option value="it" className="bg-[#0b0f16] text-slate-200">Italiano</option>
                    <option value="ja" className="bg-[#0b0f16] text-slate-200">Japonés</option>
                    <option value="ko" className="bg-[#0b0f16] text-slate-200">Coreano</option>
                    <option value="zh" className="bg-[#0b0f16] text-slate-200">Chino</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-300 mb-2">
                    Género
                  </label>
                  <select
                    value={gender}
                    onChange={(e) => setGender(e.target.value)}
                    style={{ colorScheme: 'dark' }}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-white outline-none focus:border-emerald-500/50 transition-colors"
                  >
                    <option value="unknown" className="bg-[#0b0f16] text-slate-200">No especificado</option>
                    <option value="male" className="bg-[#0b0f16] text-slate-200">Masculino</option>
                    <option value="female" className="bg-[#0b0f16] text-slate-200">Femenino</option>
                    <option value="neutral" className="bg-[#0b0f16] text-slate-200">Neutral</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-300 mb-2">
                    Visibilidad
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="is-public"
                      checked={isPublic}
                      onChange={(e) => setIsPublic(e.target.checked)}
                      className="w-4 h-4 rounded border-white/10 bg-white/5 text-emerald-500 focus:ring-emerald-500/50"
                    />
                    <label htmlFor="is-public" className="text-sm text-slate-300">
                      Hacer pública en el catálogo
                    </label>
                  </div>
                </div>
              </div>

            </div>

            <button
              onClick={cloneVoice}
              disabled={isLoading || !selectedFile}
              className={cn(
                "w-full py-3.5 rounded-full font-extrabold text-sm flex items-center justify-center gap-2 transition-colors",
                isLoading || !selectedFile
                  ? "bg-white/10 text-slate-400 cursor-not-allowed"
                  : "bg-emerald-500 hover:bg-emerald-400 text-black"
              )}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Procesando…
                </>
              ) : (
                <>
                  <Mic className="w-4 h-4" /> Clonar Voz (15 créditos)
                </>
              )}
            </button>

            {error && (
              <div className="mt-3 p-3 bg-red-500/10 border border-red-500/30 rounded-2xl text-red-300 text-sm">
                {error}
              </div>
            )}

            {success && (
              <div className="mt-3 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl text-emerald-300 text-sm">
                {success}
              </div>
            )}
          </div>
        </div>

        {/* Voices List */}
        <div className="glass-card rounded-3xl border border-white/10 p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-100">
              <Mic className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <div className="text-white font-extrabold">Mis Voces Clonadas</div>
              <div className="text-xs text-slate-300">
                {voices.length} {voices.length === 1 ? 'voz' : 'voces'}
              </div>
            </div>
            {voices.length > 0 ? (
              <button
                type="button"
                onClick={() => setIsManageVoices((v) => !v)}
                className={cn(
                  "ml-auto w-11 h-11 rounded-full border flex items-center justify-center transition-colors",
                  isManageVoices ? "bg-emerald-500/20 border-emerald-500/30 text-emerald-200" : "bg-white/5 hover:bg-white/10 border-white/10 text-slate-200"
                )}
                aria-label={isManageVoices ? 'Listo' : 'Editar voces'}
                title={isManageVoices ? 'Listo' : 'Editar voces'}
              >
                <Pencil className="w-5 h-5" />
              </button>
            ) : null}
          </div>

          {voices.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-slate-400 text-sm">
                Aún no tienes voces clonadas. Sube un audio para crear la primera.
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-3 lg:grid-cols-4">
              {voices.map((voice) => {
                const playableUrl =
                  (typeof voice.sample_url === 'string' && voice.sample_url.trim()) ||
                  (typeof voice.output?.sample_url === 'string' && voice.output.sample_url.trim()) ||
                  (typeof voice.output?.audio_url === 'string' && voice.output.audio_url.trim()) ||
                  (typeof voice.output?.audio === 'string' && voice.output.audio.trim()) ||
                  '';
                const hasAudio = Boolean(playableUrl);
                const displayName = (voice.voice_profile_name || voice.voice_name || '').toString().trim() || 'Voz';
                const isPlaying = playingVoiceId === voice.voice_id;
                return (
                  <div key={voice.id} className="min-w-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        if (isManageVoices) {
                          e.preventDefault();
                          e.stopPropagation();
                          openEditVoice(voice);
                          return;
                        }
                        if (hasAudio) {
                          e.preventDefault();
                          e.stopPropagation();
                          playVoice(voice);
                        }
                      }}
                      className={cn(
                        "relative w-full aspect-square rounded-[28px] overflow-hidden border transition-colors",
                        isManageVoices ? "bg-emerald-500/10 border-emerald-500/30" : "bg-white/5 border-white/10 hover:bg-white/10",
                        !hasAudio && !isManageVoices ? "opacity-80" : ""
                      )}
                      aria-label={displayName}
                      title={displayName}
                    >
                      {voice.profile_image_url ? (
                        <img src={voice.profile_image_url} alt={displayName} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-400">
                          <User className="w-12 h-12" />
                        </div>
                      )}

                      <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/85 via-black/40 to-transparent">
                        <div className="text-white font-extrabold truncate text-sm leading-tight">{displayName}</div>
                      </div>



                      {isManageVoices ? (
                        <div className="absolute right-2 top-2 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              openEditVoice(voice);
                            }}
                            className="w-12 h-12 rounded-full bg-black/45 border border-white/10 text-white flex items-center justify-center hover:bg-black/60"
                            aria-label="Editar voz"
                            title="Editar"
                          >
                            <Edit className="w-5 h-5" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              deleteVoice(voice.id);
                            }}
                            className="w-12 h-12 rounded-full bg-black/45 border border-white/10 text-white flex items-center justify-center hover:bg-black/60"
                            aria-label="Eliminar voz"
                            title="Eliminar"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                      ) : null}
                    </button>

                    {!isManageVoices && hasAudio ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          playVoice(voice);
                        }}
                        className={cn(
                          "mt-2 w-full rounded-2xl border px-3 py-2 text-sm font-extrabold flex items-center justify-center gap-2 transition-colors",
                          "bg-white/5 border-white/10 text-slate-100 hover:bg-white/10",
                          isPlaying ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-200" : ""
                        )}
                        aria-label={isPlaying ? 'Pausar' : 'Reproducir'}
                        title={isPlaying ? 'Pausar' : 'Reproducir'}
                      >
                        {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                        {isPlaying ? 'Pausar' : 'Play'}
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {editingVoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            onClick={closeEditVoice}
            className="absolute inset-0 bg-black/60"
            aria-label="Cerrar"
          />
          <div className="relative w-full max-w-md bg-[#0b0f16] rounded-3xl border border-white/10 p-5 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div className="text-white font-extrabold text-lg">Editar voz</div>
              <button
                type="button"
                onClick={closeEditVoice}
                className="w-9 h-9 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-slate-300"
              >
                ×
              </button>
            </div>

            <div className="flex items-center gap-4 mb-4">
              <div className="w-16 h-16 rounded-2xl overflow-hidden bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0">
                {editProfileImagePreview ? (
                  <img src={editProfileImagePreview} alt={editVoiceName || 'Voz'} className="w-full h-full object-cover" />
                ) : (
                  <User className="w-6 h-6 text-slate-400" />
                )}
              </div>
              <div className="flex-1">
                <button
                  type="button"
                  onClick={() => editImageInputRef.current?.click()}
                  className="w-full py-2 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 font-semibold flex items-center justify-center gap-2 transition-colors"
                  disabled={isSavingEdit}
                >
                  <Upload className="w-4 h-4" /> Cambiar imagen
                </button>
                <input
                  ref={editImageInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0] || null;
                    setEditProfileImage(f);
                    if (f) {
                      try {
                        const u = URL.createObjectURL(f);
                        setEditProfileImagePreview(u);
                      } catch {}
                    }
                  }}
                />
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <div className="text-xs text-slate-300 mb-1">Nombre</div>
                <input
                  value={editVoiceName}
                  onChange={(e) => setEditVoiceName(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-white placeholder-slate-500 outline-none focus:border-emerald-500/50 transition-colors"
                  placeholder="Nombre de la voz"
                  maxLength={120}
                  disabled={isSavingEdit}
                />
              </div>
            </div>

            <div className="flex items-center gap-3 mt-5">
              <button
                type="button"
                onClick={closeEditVoice}
                className="flex-1 py-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 font-semibold transition-colors"
                disabled={isSavingEdit}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={saveEditVoice}
                className={cn(
                  "flex-1 py-3 rounded-2xl font-extrabold transition-colors",
                  isSavingEdit ? "bg-white/10 text-slate-400 cursor-not-allowed" : "bg-emerald-500 hover:bg-emerald-400 text-black"
                )}
                disabled={isSavingEdit}
              >
                {isSavingEdit ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden Audio Element */}
      <audio
        ref={audioRef}
        src={audioUrl || undefined}
        onEnded={() => setPlayingVoiceId(null)}
        onError={() => {
          setPlayingVoiceId(null);
          setError('No se pudo reproducir la voz.');
        }}
      />
    </div>
  );
}
