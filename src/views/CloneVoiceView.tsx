import React, { useEffect, useRef, useState } from 'react';
import { Upload, Mic, Play, Pause, Trash2, Loader2, CheckCircle, XCircle, User, Info, ChevronDown, ChevronUp, Edit } from 'lucide-react';
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
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const editImageInputRef = useRef<HTMLInputElement>(null);

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

    const statusData = await checkVoiceStatus(voice.id);
    const statusTextRaw = String(statusData?.status || '').trim().toLowerCase();
    const isReady = statusTextRaw === 'ready' || statusTextRaw === 'succeeded' || statusTextRaw === 'completed';

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

    if (!isReady) {
      setError('La voz aún no está lista. Está en proceso de entrenamiento.');
      return;
    }

    if (!url) {
      setError('La voz está lista pero no tiene una URL de audio para reproducir.');
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

              {/* Tags Input */}
              <div>
                <label className="block text-sm font-semibold text-slate-300 mb-2">
                  Etiquetas (opcional)
                </label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {tags.map((tag, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-sm"
                    >
                      {tag}
                      <button
                        type="button"
                        onClick={() => setTags(tags.filter((_, i) => i !== index))}
                        className="text-xs hover:text-white"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
                <input
                  type="text"
                  placeholder="Agrega etiquetas separadas por comas (ej: pop, rock, suave)"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ',') {
                      e.preventDefault();
                      const input = e.currentTarget;
                      const value = input.value.trim();
                      if (value && !tags.includes(value)) {
                        setTags([...tags, value]);
                      }
                      input.value = '';
                    }
                  }}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-white placeholder-slate-500 outline-none focus:border-emerald-500/50 transition-colors"
                />
                <div className="text-xs text-slate-500 mt-1">
                  Presiona Enter o coma para agregar etiquetas
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
          </div>

          {voices.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-slate-400 text-sm">
                Aún no tienes voces clonadas. Sube un audio para crear la primera.
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {voices.map((voice) => {
                const playableUrl =
                  (typeof voice.output?.sample_url === 'string' && voice.output.sample_url.trim()) ||
                  (typeof voice.output?.audio_url === 'string' && voice.output.audio_url.trim()) ||
                  (typeof voice.output?.audio === 'string' && voice.output.audio.trim()) ||
                  '';
                const canPlay = voice.status === 'ready' && Boolean(playableUrl);
                return (
                  <div
                    key={voice.id}
                    className="bg-white/5 border border-white/10 rounded-2xl p-4"
                  >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3 min-w-0">
                      {statusIcon(voice.status)}
                      <div className="w-9 h-9 rounded-full overflow-hidden bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0">
                        {voice.profile_image_url ? (
                          <img src={voice.profile_image_url} alt={voice.voice_name} className="w-full h-full object-cover" />
                        ) : (
                          <User className="w-4 h-4 text-slate-400" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="text-white font-semibold truncate">
                          {voice.voice_name}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => playVoice(voice)}
                        disabled={!canPlay}
                        className={cn(
                          "w-8 h-8 rounded-full flex items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
                          playingVoiceId === voice.voice_id
                            ? "bg-emerald-500/20 border border-emerald-500/30 text-emerald-300"
                            : "bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300"
                        )}
                        title={!canPlay ? (voice.status !== 'ready' ? 'La voz aún se está entrenando' : 'No hay muestra para reproducir') : 'Reproducir'}
                      >
                        {playingVoiceId === voice.voice_id ? (
                          <Pause className="w-3.5 h-3.5" />
                        ) : (
                          <Play className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <button
                        onClick={() => openEditVoice(voice)}
                        className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-slate-300"
                        title="Editar"
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => deleteVoice(voice.id)}
                        className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-slate-300"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="text-xs text-slate-400 mb-2">
                    {voice.description}
                  </div>

                  {voice.status === 'failed' && (
                    <div className="mb-2 p-3 bg-red-500/10 border border-red-500/30 rounded-2xl text-red-200 text-xs whitespace-pre-wrap">
                      {formatVoiceErrorMessage(voice.error) || 'No se recibió el motivo del fallo.'}
                    </div>
                  )}

                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <div className="flex items-center gap-4">
                      <span>{statusText(voice.status)}</span>
                      <span>{formatDate(voice.created_at)}</span>
                    </div>
                    <span>{voice.cost} créditos</span>
                  </div>
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
