import React, { useState, useRef, useEffect } from 'react';
import { UploadCloud, FileAudio, Music, Image as ImageIcon, ArrowRight, Loader2, Play, Mic2, Users, Guitar, Download, RotateCcw, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getAccessToken, supabaseBrowser } from '@/lib/supabaseBrowser';

type KaraokeState = 'form' | 'generating' | 'result';
type AudioMode = 'instrumental' | 'backing' | 'vocals';

// Global singleton to persist state when navigating away
class KaraokeStore {
  step: KaraokeState = 'form';
  progress = 0;
  audioFile: File | null = null;
  backgroundFile: File | null = null;
  lyrics = '';
  syncData: Array<{text: string, start_time: number, end_time: number}> = [];
  instrumentalUrl: string | null = null;
  vocalUrl: string | null = null;
  backingVocalUrl: string | null = null;
  uploadPath: string | null = null;
  originalPlayUrl: string | null = null;
  title = '';
  author = '';
  audioMode: AudioMode = 'backing';
  
  listeners: Array<() => void> = [];
  
  subscribe(fn: () => void) {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter(l => l !== fn);
    };
  }
  
  notify() {
    this.listeners.forEach(fn => fn());
  }

  set(updates: Partial<KaraokeStore>) {
    Object.assign(this, updates);
    this.notify();
  }
}

const karaokeStore = new KaraokeStore();

export function KaraokeView() {
  const [, forceRender] = useState(0);

  useEffect(() => {
    return karaokeStore.subscribe(() => forceRender(n => n + 1));
  }, []);

  const step = karaokeStore.step;
  const progress = karaokeStore.progress;
  const audioFile = karaokeStore.audioFile;
  const backgroundFile = karaokeStore.backgroundFile;
  const lyrics = karaokeStore.lyrics;
  const syncData = karaokeStore.syncData;
  const instrumentalUrl = karaokeStore.instrumentalUrl;
  const vocalUrl = karaokeStore.vocalUrl;
  const backingVocalUrl = karaokeStore.backingVocalUrl;
  const uploadPath = karaokeStore.uploadPath;
  const originalPlayUrl = karaokeStore.originalPlayUrl;
  const keepBackingVocals = karaokeStore.keepBackingVocals;
  const title = karaokeStore.title;
  const author = karaokeStore.author;
  const audioMode = karaokeStore.audioMode;

  const setStep = (v: KaraokeState) => karaokeStore.set({ step: v });
  const setProgress = (v: number | ((p: number) => number)) => karaokeStore.set({ progress: typeof v === 'function' ? v(karaokeStore.progress) : v });
  const setAudioFile = (v: File | null) => karaokeStore.set({ audioFile: v });
  const setBackgroundFile = (v: File | null) => karaokeStore.set({ backgroundFile: v });
  const setLyrics = (v: string) => karaokeStore.set({ lyrics: v });
  const setSyncData = (v: any) => karaokeStore.set({ syncData: v });
  const setInstrumentalUrl = (v: string | null) => karaokeStore.set({ instrumentalUrl: v });
  const setVocalUrl = (v: string | null) => karaokeStore.set({ vocalUrl: v });
  const setBackingVocalUrl = (v: string | null) => karaokeStore.set({ backingVocalUrl: v });
  const setUploadPath = (v: string | null) => karaokeStore.set({ uploadPath: v });
  const setOriginalPlayUrl = (v: string | null) => karaokeStore.set({ originalPlayUrl: v });
  const setKeepBackingVocals = (v: boolean) => karaokeStore.set({ keepBackingVocals: v });
  const setTitle = (v: string) => karaokeStore.set({ title: v });
  const setAuthor = (v: string) => karaokeStore.set({ author: v });
  const setAudioMode = (v: AudioMode) => karaokeStore.set({ audioMode: v });
  
  // Style Customization
  const [bgColor, setBgColor] = useState('#0a0a0a');
  const [textColor, setTextColor] = useState('#ffffff');
  const [highlightColor, setHighlightColor] = useState('#c084fc');
  
  // Player State
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isDownloadingVideo, setIsDownloadingVideo] = useState(false);
  const [readyVideo, setReadyVideo] = useState<{ url: string; name: string } | null>(null);
  const videoRecorderRef = useRef<MediaRecorder | null>(null);
  const videoChunksRef = useRef<BlobPart[]>([]);
  const proxyUrlCacheRef = useRef<Map<string, string>>(new Map());

  const handleDownload = async () => {
    let targetUrl = '';
    let nameSuffix = '';
    
    if (audioMode === 'instrumental' && instrumentalUrl) {
      targetUrl = instrumentalUrl;
      nameSuffix = 'Instrumental';
    } else if (audioMode === 'backing' && backingVocalUrl) {
      targetUrl = backingVocalUrl;
      nameSuffix = 'Coros_Aislados';
    } else if (audioMode === 'vocals' && vocalUrl) {
      targetUrl = vocalUrl;
      nameSuffix = 'Voz_Principal';
    } else if (audioFile) {
      targetUrl = URL.createObjectURL(audioFile);
      nameSuffix = 'Original';
    }

    if (!targetUrl) {
      alert("No hay archivo de audio listo para descargar.");
      return;
    }

    setIsDownloading(true);
    try {
      const response = await fetch(targetUrl);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = blobUrl;
      const cleanTitle = (title || 'karaoke').toLowerCase().replace(/[^a-z0-9]/gi, '_');
      const ext = targetUrl.split('.').pop()?.split('?')[0] || 'mp3';
      a.download = `${cleanTitle}_${nameSuffix}.${ext}`;
      try { document.body.appendChild(a); } catch {}
      a.click();
      try { if (a.parentNode) a.parentNode.removeChild(a); } catch {}
      URL.revokeObjectURL(blobUrl);
    } catch (e) {
      console.error(e);
      // Fallback
      const a = document.createElement('a');
      a.href = targetUrl;
      a.target = '_blank';
      const cleanTitle2 = (title || 'karaoke').toLowerCase().replace(/[^a-z0-9]/gi, '_');
      const ext2 = targetUrl.split('.').pop()?.split('?')[0] || 'mp3';
      a.download = `${cleanTitle2}_${nameSuffix}.${ext2}`;
      try { document.body.appendChild(a); } catch {}
      a.click();
      try { if (a.parentNode) a.parentNode.removeChild(a); } catch {}
    } finally {
      setTimeout(() => {
        setIsDownloading(false);
      }, 1500);
    }
  };

  const stopVideoRecording = () => {
    try {
      const rec = videoRecorderRef.current;
      if (rec && rec.state !== 'inactive') rec.stop();
    } catch {}
  };

  const downloadReadyVideo = () => {
    if (!readyVideo?.url) return;
    const a = document.createElement('a');
    a.href = readyVideo.url;
    a.download = readyVideo.name || 'karaoke.webm';
    try { document.body.appendChild(a); } catch {}
    a.click();
    try { if (a.parentNode) a.parentNode.removeChild(a); } catch {}
    setTimeout(() => {
      try {
        URL.revokeObjectURL(readyVideo.url);
      } catch {}
      setReadyVideo(null);
    }, 1500);
  };

  const handleDownloadVideo = async () => {
    if (!canvasRef.current) {
      alert('No hay video listo para grabar.');
      return;
    }
    if (!audioRef.current) {
      alert('No hay audio listo para grabar.');
      return;
    }

    setIsDownloadingVideo(true);
    setReadyVideo(null);
    videoChunksRef.current = [];

    try {
      const getProxyUrlForSrc = async (src: string): Promise<string | null> => {
        const raw = (src || '').toString().trim();
        if (!raw) return null;
        if (!/^https?:\/\//i.test(raw)) return raw;
        const cached = proxyUrlCacheRef.current.get(raw);
        if (cached) return cached;
        const t = await getAccessToken();
        if (!t.ok) return null;
        const r = await fetch(`/api/karaoke/proxy-url?src=${encodeURIComponent(raw)}`, {
          headers: { 'Authorization': `Bearer ${t.token}` }
        });
        const out = await r.json().catch(() => ({}));
        if (!r.ok || out?.ok === false) return null;
        const url = String(out?.url || '').trim();
        if (!url) return null;
        proxyUrlCacheRef.current.set(raw, url);
        return url;
      };

      if (!audioRef.current.src) {
        const fallback = await ensureOriginalPlayableUrl();
        if (fallback) {
          audioRef.current.src = fallback;
          audioRef.current.load();
        }
      }

      audioRef.current.currentTime = 0;
      if (backingAudioRef.current) backingAudioRef.current.currentTime = 0;

      const sourceUrl = audioRef.current.src;
      const proxiedUrl = sourceUrl ? await getProxyUrlForSrc(sourceUrl) : '';
      if (proxiedUrl) {
        (audioRef.current as any).crossOrigin = 'anonymous';
        audioRef.current.src = proxiedUrl;
        audioRef.current.load();
      }

      const canvasStream = canvasRef.current.captureStream(30);

      const getAudioTrack = async () => {
        const el: any = audioRef.current as any;
        if (!el) return null;
        const cap = el.captureStream?.();
        if (!cap || !cap.getAudioTracks) return null;
        const tracks = cap.getAudioTracks();
        if (tracks && tracks.length > 0) return tracks[0];
        return null;
      };

      await audioRef.current.play().catch(() => {});
      await new Promise(r => setTimeout(r, 250));
      let audioTrack = await getAudioTrack();
      if (!audioTrack) {
        await new Promise(r => setTimeout(r, 750));
        audioTrack = await getAudioTrack();
      }
      if (!audioTrack) {
        throw new Error('No pude capturar el audio para el video. Prueba en Chrome (no incógnito) o descarga el WEBM sin audio y lo juntamos con el MP3.');
      }

      audioRef.current.pause();
      audioRef.current.currentTime = 0;

      const mixed = new MediaStream();
      for (const t of canvasStream.getVideoTracks()) mixed.addTrack(t);
      mixed.addTrack(audioTrack);

      const pickMime = () => {
        const candidates = [
          'video/webm;codecs=vp9,opus',
          'video/webm;codecs=vp8,opus',
          'video/webm',
        ];
        for (const m of candidates) {
          try {
            if ((window as any).MediaRecorder?.isTypeSupported?.(m)) return m;
          } catch {}
        }
        return '';
      };

      const mimeType = pickMime();
      const recorder = new MediaRecorder(mixed, mimeType ? { mimeType } : undefined);
      videoRecorderRef.current = recorder;

      const onData = (e: BlobEvent) => {
        if (e.data && e.data.size > 0) videoChunksRef.current.push(e.data);
      };
      recorder.addEventListener('dataavailable', onData);

      const cleanTitle = (title || 'karaoke').toLowerCase().replace(/[^a-z0-9]/gi, '_');
      const fileName = `${cleanTitle}_karaoke.webm`;

      const onStop = () => {
        recorder.removeEventListener('dataavailable', onData);
        const blob = new Blob(videoChunksRef.current, { type: recorder.mimeType || 'video/webm' });
        const blobUrl = URL.createObjectURL(blob);
        setReadyVideo({ url: blobUrl, name: fileName });
        setIsDownloadingVideo(false);
      };
      recorder.addEventListener('stop', onStop, { once: true });

      const onEnded = () => stopVideoRecording();
      audioRef.current.addEventListener('ended', onEnded, { once: true });

      recorder.start(1000);

      await audioRef.current.play();
      if (backingAudioRef.current && audioMode === 'backing' && backingVocalUrl) {
        backingAudioRef.current.play().catch(() => {});
      }
    } catch (e) {
      console.error(e);
      setIsDownloadingVideo(false);
      alert(e instanceof Error ? e.message : 'No se pudo crear el video.');
    }
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const bgInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const backingAudioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Web Audio API refs for realtime stem simulation
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const filterNodeRef = useRef<BiquadFilterNode | null>(null);

  const handleAudioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setAudioFile(e.target.files[0]);
    }
  };

  const handleBgUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setBackgroundFile(e.target.files[0]);
    }
  };

  const uploadAudioToR2 = async (file: File): Promise<{ url: string; path: string }> => {
    const t = await getAccessToken();
    if (!t.ok) throw new Error('No autorizado');

    const userId = (await supabaseBrowser.auth.getUser()).data.user?.id || 'unknown';
    const ext = ((file?.name || '').toString().toLowerCase().split('.').pop() || '') === 'wav' || (file.type || '').toLowerCase().includes('wav') ? 'wav' : 'mp3';
    const fallbackPath = `karaoke/${userId}/audio_${Date.now()}.${ext}`;
    const contentType = ext === 'wav' ? 'audio/wav' : 'audio/mpeg';

    // Step A: get signed PUT URL from our backend
    const prep = await fetch('/api/karaoke/upload-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'authorization': `Bearer ${t.token}` },
      body: JSON.stringify({ title: file.name, contentType }),
    });
    const prepOut = await prep.json().catch(() => ({}));
    if (!prep.ok || prepOut?.ok === false) {
      throw new Error(prepOut?.error || prepOut?.detail || 'Error preparando la subida del audio');
    }

    const uploadUrl: string = prepOut.uploadUrl || '';
    const url: string = prepOut.url || '';
    const key: string = prepOut.key || fallbackPath;

    // Step B: try direct PUT to R2 using fetch (clearer errors than XHR)
    if (uploadUrl) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3 * 60 * 1000);
        const putRes = await fetch(uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': contentType },
          body: file,
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (putRes.ok) {
          const verifyRes = await fetch('/api/karaoke/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${t.token}` },
            body: JSON.stringify({ key, expectedSize: file.size }),
          });
          const verifyData = await verifyRes.json().catch(() => ({}));
          if (!verifyRes.ok || verifyData?.ok === false) {
            throw new Error(verifyData?.error || verifyData?.detail || 'La subida a R2 no se pudo verificar');
          }
          return { url, path: key };
        }
        const errBody = await putRes.text().catch(() => `HTTP ${putRes.status}`);
        console.warn('[Karaoke] R2 PUT failed:', putRes.status, errBody);
        const bodyLower = (errBody || '').toString().toLowerCase();
        if (putRes.status === 404 && bodyLower.includes('requested resource could not be found')) {
          throw new Error(
            'Cloudflare R2 respondió 404 (no encontró el recurso). ' +
            'Esto casi siempre es por configuración de endpoint/bucket. ' +
            'Revisa en Vercel: R2_BUCKET_NAME y R2_ENDPOINT.'
          );
        }
        throw new Error(`La subida a R2 falló (HTTP ${putRes.status}). Revisa CORS en R2 y que el bucket exista.`);
      } catch (putErr) {
        console.warn('[Karaoke] R2 PUT network error:', putErr);
      }
    }

    throw new Error(
      'No se pudo subir el audio directamente a R2 desde el navegador. ' +
      'Verifica CORS en Cloudflare R2 para permitir PUT/GET/HEAD desde tu dominio (ramber-tunes.vercel.app) y localhost.'
    );
  };

  const ensureOriginalPlayableUrl = async (): Promise<string | null> => {
    if (karaokeStore.originalPlayUrl) return karaokeStore.originalPlayUrl;
    const key = karaokeStore.uploadPath;
    if (!key) return null;
    const t = await getAccessToken();
    if (!t.ok) return null;
    const res = await fetch(`/api/karaoke/proxy-url?key=${encodeURIComponent(key)}`, {
      headers: { 'Authorization': `Bearer ${t.token}` }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.ok === false) return null;
    const url = String(data?.url || '').trim();
    if (!url) return null;
    karaokeStore.set({ originalPlayUrl: url });
    return url;
  };

  const handleGenerate = async () => {
    if (!karaokeStore.audioFile) return;
    karaokeStore.set({ step: 'generating', progress: 0 });

    try {
      // STEP 1: Upload audio to R2
      const progressInterval = setInterval(() => {
        karaokeStore.set({ progress: Math.min(20, karaokeStore.progress + Math.random() * 4) });
      }, 400);
      try {
        const { url: uploadUrl, path: uploadPath } = await uploadAudioToR2(karaokeStore.audioFile);
        karaokeStore.set({ progress: 22, uploadPath, originalPlayUrl: null });

        // STEP 2: Start Replicate separation job (returns immediately with a predictionId)
        const t = await getAccessToken();
        const startRes = await fetch('/api/karaoke/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${t.token}` },
          body: JSON.stringify({ uploadUrl, uploadPath, lyrics: karaokeStore.lyrics })
        });
        const startData = await startRes.json().catch(() => ({}));
        if (!startRes.ok || !startData?.predictionId) {
          throw new Error(startData?.error || 'No se pudo iniciar la separación de audio');
        }

        karaokeStore.set({ progress: 25 });

        // STEP 3: Poll karaoke-status until Replicate finishes
        // State we accumulate across polls:
        let predictionId: string = startData.predictionId;
        let stage: string = 'separating';
        let instrumentalUrl: string | null = null;
        let vocalUrl: string | null = null;
        let backingVocalUrl: string | null = null;

        await new Promise<void>((resolve, reject) => {
          let dots = 0;
          const MAX_POLLS = 120; // 120 polls × 5s = 10 minutes safety cap
          let pollCount = 0;

          const interval = setInterval(async () => {
            try {
              pollCount++;
              if (pollCount > MAX_POLLS) {
                clearInterval(interval);
                reject(new Error('El procesamiento tardó demasiado. Intenta con una canción más corta.'));
                return;
              }

              // Advance fake progress slowly from 25 → 88
              karaokeStore.set({ progress: Math.min(88, karaokeStore.progress + (Math.random() * 0.8)) });

              const params = new URLSearchParams({ predictionId, stage });
              if (stage === 'backing' && vocalUrl) params.set('vocalUrl', vocalUrl);
              if (stage === 'backing' && instrumentalUrl) params.set('instrumentalUrl', instrumentalUrl);

              const statusRes = await fetch(`/api/karaoke/status?${params.toString()}`, {
                headers: { 'Authorization': `Bearer ${t.token}` }
              });
              const statusData = await statusRes.json().catch(() => ({}));

            if (!statusData?.ok) {
                clearInterval(interval);
              const raw = (statusData?.error || 'Error consultando estado del karaoke').toString();
              const lower = raw.toLowerCase();
              if (lower.includes('audio buffer is not finite')) {
                reject(new Error('Replicate no pudo procesar ese audio (archivo corrupto o codificación rara). Convierte el archivo a MP3 estándar (128/192 kbps) o WAV y vuelve a intentar.'));
                return;
              }
              reject(new Error(raw));
                return;
              }

              if (statusData.status === 'processing' || statusData.status === 'starting') {
                // Still going, update stage label
                stage = statusData.stage || stage;
                return;
              }

              if (statusData.status === 'progressing') {
                // Main separation done, now polling BVE (backing vocal extraction)
                predictionId = statusData.predictionId;
                stage = 'backing';
                instrumentalUrl = statusData.instrumentalUrl || instrumentalUrl;
                vocalUrl = statusData.vocalUrl || vocalUrl;
                karaokeStore.set({ progress: 65 });
                return;
              }

              if (statusData.status === 'ready_for_finalize') {
                // All Replicate work done
                clearInterval(interval);
                if (statusData.instrumentalUrl) instrumentalUrl = statusData.instrumentalUrl;
                if (statusData.vocalUrl) vocalUrl = statusData.vocalUrl;
                if (statusData.backingVocalUrl) backingVocalUrl = statusData.backingVocalUrl;
                resolve();
              }
            } catch (err) {
              clearInterval(interval);
              reject(err);
            }
          }, 5000);
        });

        if (!vocalUrl) throw new Error('No se obtuvo la pista vocal de Replicate');
        karaokeStore.set({ progress: 90 });

        // STEP 4: Finalize — call Gemini for lyric sync (< 30s, fits Hobby plan)
        const finalRes = await fetch('/api/karaoke/finalize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${t.token}` },
          body: JSON.stringify({
            vocalUrl,
            instrumentalUrl,
            backingVocalUrl,
            lyrics: karaokeStore.lyrics
          })
        });
        const finalData = await finalRes.json().catch(() => ({}));
        if (!finalRes.ok || !finalData?.ok) {
          throw new Error(finalData?.error || 'Error sincronizando la letra');
        }

        const newSyncData = Array.isArray(finalData.syncData) ? finalData.syncData : [];
        const finalInstrumentalUrl = finalData.instrumentalUrl || instrumentalUrl || null;
        const finalVocalUrl = finalData.vocalUrl || vocalUrl || null;
        const finalBackingUrl = finalData.backingVocalUrl || backingVocalUrl || null;
        karaokeStore.set({
          syncData: newSyncData,
          instrumentalUrl: finalInstrumentalUrl,
          vocalUrl: finalVocalUrl,
          backingVocalUrl: finalBackingUrl,
          audioMode: finalBackingUrl ? 'backing' : finalInstrumentalUrl ? 'instrumental' : 'vocals',
          progress: 100
        });

        setTimeout(() => karaokeStore.set({ step: 'result' }), 500);
      } finally {
        clearInterval(progressInterval);
      }
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : 'Error desconocido');
      karaokeStore.set({ step: 'form' });
    }
  };

  // Setup Audio when entering result step or switching modes
  useEffect(() => {
    if (step === 'result' && audioRef.current) {
      const wasPlaying = !audioRef.current.paused && audioRef.current.currentTime > 0;
      const currentTime = audioRef.current.currentTime;
      
      let targetSrc = '';
      if (audioMode === 'instrumental' && instrumentalUrl) {
        targetSrc = instrumentalUrl;
      } else if (audioMode === 'backing' && instrumentalUrl) {
        targetSrc = instrumentalUrl;
      } else if (audioMode === 'vocals' && vocalUrl) {
        targetSrc = vocalUrl;
      } else if (audioFile) {
        targetSrc = URL.createObjectURL(audioFile);
      }

      const applySources = async (mainSrc: string) => {
        if (!audioRef.current) return;
        const resolveProxy = async (raw: string): Promise<string> => {
          const s = (raw || '').toString().trim();
          if (!s) return '';
          if (!/^https?:\/\//i.test(s)) return s;
          const cached = proxyUrlCacheRef.current.get(s);
          if (cached) return cached;
          const t = await getAccessToken();
          if (!t.ok) return s;
          const r = await fetch(`/api/karaoke/proxy-url?src=${encodeURIComponent(s)}`, {
            headers: { 'Authorization': `Bearer ${t.token}` }
          });
          const out = await r.json().catch(() => ({}));
          const url = r.ok && out?.ok !== false ? String(out?.url || '').trim() : '';
          if (url) {
            proxyUrlCacheRef.current.set(s, url);
            return url;
          }
          return s;
        };

        const main = await resolveProxy(mainSrc);
        if (main && audioRef.current.src !== main) {
          (audioRef.current as any).crossOrigin = 'anonymous';
          audioRef.current.src = main;
          audioRef.current.load();
          audioRef.current.currentTime = currentTime;
        }
        if (backingAudioRef.current) {
          if (audioMode === 'backing' && backingVocalUrl) {
            const backing = await resolveProxy(backingVocalUrl);
            (backingAudioRef.current as any).crossOrigin = 'anonymous';
            backingAudioRef.current.src = backing;
            backingAudioRef.current.load();
            backingAudioRef.current.currentTime = currentTime;
          } else {
            backingAudioRef.current.pause();
            backingAudioRef.current.src = '';
          }
        }
        if (wasPlaying) {
          audioRef.current.play().catch(console.error);
          if (backingAudioRef.current && audioMode === 'backing' && backingVocalUrl) {
             backingAudioRef.current.play().catch(console.error);
          }
        }
      };

      if (targetSrc) {
        applySources(targetSrc);
      } else if (!targetSrc && karaokeStore.uploadPath) {
        (async () => {
          const fallback = await ensureOriginalPlayableUrl();
          if (fallback) applySources(fallback);
        })();
      }
    }
  }, [step, audioMode, instrumentalUrl, vocalUrl, audioFile, backingVocalUrl, keepBackingVocals, uploadPath, originalPlayUrl]);

  const applyAudioMode = (mode: AudioMode) => {
    setAudioMode(mode);
  };

  // Canvas Animation for Karaoke Lyrics
  useEffect(() => {
    if (step !== 'result' || !canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    let animationId: number;
    const lines = lyrics.split('\n').filter(l => l.trim().length > 0);
    const render = () => {
      if (!canvas || !ctx || !audioRef.current) return;
      
      // Clear
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Background Color
      if (!backgroundFile) {
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      
      // Draw Title and Author
      ctx.save();
      ctx.textAlign = 'left';
      ctx.shadowColor = 'rgba(0,0,0,0.8)';
      ctx.shadowBlur = 10;
      ctx.shadowOffsetX = 2;
      ctx.shadowOffsetY = 2;
      
      if (title) {
        ctx.font = 'bold 28px "Inter", sans-serif';
        ctx.fillStyle = textColor;
        ctx.fillText(`Canción: ${title}`, 30, 50);
      }
      
      if (author) {
        ctx.font = 'bold 20px "Inter", sans-serif';
        ctx.fillStyle = textColor;
        ctx.globalAlpha = 0.8;
        ctx.fillText(`Autor: ${author}`, 30, 85);
      }
      ctx.restore();
      
      // Draw Lyrics
      const time = audioRef.current.currentTime;
      const totalTime = audioRef.current.duration || 1;
      const progressRatio = time / totalTime;
      
      // Determine current line based on exact timestamps or mock if empty
      let currentLine = "♪ ♪ ♪";
      let nextLine = "";
      let previousLine = "";
      let lineFraction = 0;

      if (syncData && syncData.length > 0) {
        let activeIndex = -1;
        for (let i = 0; i < syncData.length; i++) {
          if (time >= syncData[i].start_time && time <= syncData[i].end_time) {
            activeIndex = i;
            break;
          } else if (time < syncData[i].start_time && activeIndex === -1) {
            // we are before this line, maybe it's an instrumental break
            break;
          }
        }

        if (activeIndex !== -1) {
          currentLine = syncData[activeIndex].text || "♪ ♪ ♪";
          nextLine = syncData[activeIndex + 1]?.text || "";
          previousLine = syncData[activeIndex - 1]?.text || "";
          
          const sTime = syncData[activeIndex].start_time;
          const eTime = syncData[activeIndex].end_time;
          const duration = eTime - sTime;
          if (duration > 0) {
             lineFraction = Math.max(0, Math.min(1, (time - sTime) / duration));
          } else {
             lineFraction = 1;
          }
        } else {
          // Find closest past line for previous and closest future for next
          const pastLines = syncData.filter(d => time > d.end_time);
          const futureLines = syncData.filter(d => time < d.start_time);
          if (pastLines.length > 0) previousLine = pastLines[pastLines.length - 1].text;
          if (futureLines.length > 0) nextLine = futureLines[0].text;
          currentLine = "♪ ♪ ♪";
          lineFraction = 0;
        }
      } else {
        // Fallback Mock sync
        const exactLineProgress = progressRatio * lines.length;
        const lineIndex = Math.min(Math.floor(exactLineProgress), lines.length - 1);
        currentLine = lines[lineIndex] || "♪ ♪ ♪";
        nextLine = lines[lineIndex + 1] || "";
        previousLine = lines[lineIndex - 1] || "";
        lineFraction = exactLineProgress - lineIndex;
      }
      
      ctx.textAlign = 'center';
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      
      // Draw Previous Line
      if (previousLine) {
        ctx.font = 'bold 24px "Inter", sans-serif';
        ctx.fillStyle = textColor;
        ctx.globalAlpha = 0.3;
        ctx.fillText(previousLine, centerX, centerY - 60);
      }
      
      // Draw Next Line
      if (nextLine) {
        ctx.font = 'bold 24px "Inter", sans-serif';
        ctx.fillStyle = textColor;
        ctx.globalAlpha = 0.5;
        ctx.fillText(nextLine, centerX, centerY + 60);
      }

      // Draw Current Line Base
      ctx.font = 'bold 42px "Inter", sans-serif';
      ctx.globalAlpha = 1.0;
      ctx.fillStyle = textColor;
      ctx.shadowColor = 'rgba(0,0,0,0.8)';
      ctx.shadowBlur = 15;
      ctx.shadowOffsetX = 3;
      ctx.shadowOffsetY = 3;
      ctx.fillText(currentLine, centerX, centerY);
      
      // Draw Karaoke Highlight Sweep (Clip Rect)
      const textMetrics = ctx.measureText(currentLine);
      const textWidth = textMetrics.width;
      
      ctx.save();
      // Clip from the left edge of the text to the current progress
      ctx.beginPath();
      ctx.rect(centerX - textWidth / 2, centerY - 50, textWidth * lineFraction, 100);
      ctx.clip();
      
      ctx.fillStyle = highlightColor;
      ctx.fillText(currentLine, centerX, centerY);
      ctx.restore();
      
      // Draw Title and Author Info
      if (title || author) {
        ctx.font = 'bold 20px "Inter", sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.textAlign = 'left';
        ctx.shadowBlur = 4;
        ctx.fillText(`${title} ${author ? `- ${author}` : ''}`, 40, canvas.height - 40);
      }
      
      animationId = requestAnimationFrame(render);
    };
    
    render();
    return () => cancelAnimationFrame(animationId);
  }, [step, lyrics, bgColor, textColor, highlightColor, backgroundFile, title, author]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    
    const shouldPlayBacking = backingAudioRef.current && audioMode === 'backing' && backingVocalUrl;
    
    if (isPlaying) {
      audioRef.current.pause();
      if (shouldPlayBacking) backingAudioRef.current.pause();
    } else {
      (async () => {
        if (audioRef.current && !audioRef.current.src) {
          const fallback = await ensureOriginalPlayableUrl();
          if (fallback) {
            audioRef.current.src = fallback;
            audioRef.current.load();
          }
        }
        audioRef.current?.play().catch(console.error);
        if (shouldPlayBacking && backingAudioRef.current && audioRef.current) {
          backingAudioRef.current.currentTime = audioRef.current.currentTime;
          backingAudioRef.current.play().catch(console.error);
        }
      })();
    }
    setIsPlaying(!isPlaying);
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
      setDuration(audioRef.current.duration || 0);
    }
  };

  const formatTime = (seconds: number) => {
    if (isNaN(seconds)) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const canSubmit = audioFile && lyrics.trim() && title.trim();

  // -----------------------------------------------------
  // RENDER VIEWS
  // -----------------------------------------------------

  if (step === 'generating') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center w-full bg-[#030303] text-white p-8">
        <div className="max-w-md w-full bg-white/5 border border-white/10 rounded-3xl p-10 text-center shadow-[0_0_50px_rgba(99,102,241,0.1)]">
          <div className="relative w-40 h-40 mx-auto mb-8">
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="8" />
              <circle 
                cx="50" cy="50" r="45" fill="none" stroke="url(#gradient)" strokeWidth="8"
                strokeDasharray="283" strokeDashoffset={283 - (283 * progress) / 100}
                strokeLinecap="round" className="transition-all duration-300"
              />
              <defs>
                <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#818cf8" />
                  <stop offset="100%" stopColor="#c084fc" />
                </linearGradient>
              </defs>
            </svg>
            <div className="absolute inset-0 flex items-center justify-center flex-col">
              <span className="text-4xl font-black bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">{Math.round(progress)}%</span>
            </div>
          </div>
          <h2 className="text-2xl font-bold mb-3">Creando Karaoke...</h2>
          <p className="text-slate-400 text-sm h-6">
            {progress < 23 ? "Subiendo audio a la nube..." :
             progress < 27 ? "Iniciando separación de voz con IA..." :
             progress < 65 ? "Separando voces del instrumental (1-2 min)..." :
             progress < 88 ? "Extrayendo segundas voces (coros)..." :
             "Sincronizando letra con IA LucIAna..."}
          </p>
        </div>
      </div>
    );
  }

  if (step === 'result') {
    return (
      <div className="flex-1 flex flex-col overflow-y-auto w-full bg-[#030303] text-white">
        <div className="max-w-5xl mx-auto px-4 py-8 w-full flex flex-col items-center">
          
          <div className="w-full flex justify-between items-center mb-6">
            <h1 className="font-display font-extrabold text-3xl bg-gradient-to-r from-indigo-400 to-purple-500 bg-clip-text text-transparent">
              Tu Karaoke está Listo
            </h1>
            <button onClick={() => setStep('form')} className="text-slate-400 hover:text-white flex items-center gap-2 font-medium">
              <RotateCcw className="w-4 h-4" /> Crear otro
            </button>
          </div>

          {/* VIDEO / CANVAS PLAYER */}
          <div className="w-full aspect-video bg-black rounded-3xl overflow-hidden shadow-[0_0_50px_rgba(99,102,241,0.2)] border border-white/10 relative group">
            {backgroundFile && (
              <img 
                src={URL.createObjectURL(backgroundFile)} 
                className="absolute inset-0 w-full h-full object-cover opacity-60" 
                alt="Background" 
              />
            )}
            <canvas ref={canvasRef} width={1280} height={720} className="absolute inset-0 w-full h-full z-10" />
            
            <audio ref={audioRef} onTimeUpdate={handleTimeUpdate} onEnded={() => setIsPlaying(false)} />
            <audio ref={backingAudioRef} muted={false} />

            {/* Floating Controls */}
            <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/90 via-black/50 to-transparent z-20 transform translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300">
              <div className="flex flex-col gap-4">
                {/* Progress Bar */}
                <div className="flex items-center gap-3 w-full">
                  <span className="text-xs font-medium text-slate-300 w-10 text-right">{formatTime(currentTime)}</span>
                  <input 
                    type="range" min={0} max={duration || 100} value={currentTime}
                    onChange={(e) => {
                      if(audioRef.current) audioRef.current.currentTime = Number(e.target.value);
                    }}
                    className="flex-1 h-2 bg-white/20 rounded-full appearance-none cursor-pointer accent-indigo-500"
                  />
                  <span className="text-xs font-medium text-slate-300 w-10">{formatTime(duration)}</span>
                </div>
                
                {/* Play Button */}
                <div className="flex justify-center">
                  <button onClick={togglePlay} className="w-14 h-14 bg-white text-gray-900 shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] ring-1 ring-inset ring-black/10 rounded-full flex items-center justify-center hover:scale-105 transition-transform">
                    {isPlaying ? <div className="w-5 h-5 bg-black rounded-sm" /> : <Play className="w-6 h-6 ml-1" fill="currentColor" />}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* STEMS & DOWNLOAD ACTIONS */}
          <div className="w-full mt-8 bg-white/5 border border-white/10 rounded-3xl p-6">
            <h3 className="text-lg font-bold mb-4 text-center">Opciones de Audio Final</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <button 
                onClick={() => applyAudioMode('instrumental')}
                className={cn("py-4 px-6 rounded-2xl font-bold flex flex-col items-center justify-center gap-2 border-2 transition-all", audioMode === 'instrumental' ? "bg-indigo-500/20 border-indigo-500 text-indigo-400" : "bg-black/30 border-white/5 text-slate-400 hover:bg-white/5")}
              >
                <Guitar className="w-6 h-6" />
                Instrumental
                <span className="text-xs font-normal opacity-70">Sin Coros</span>
              </button>
              
              <button 
                onClick={() => applyAudioMode('backing')}
                className={cn("py-4 px-6 rounded-2xl font-bold flex flex-col items-center justify-center gap-2 border-2 transition-all", audioMode === 'backing' ? "bg-emerald-500/20 border-emerald-500 text-emerald-400" : "bg-black/30 border-white/5 text-slate-400 hover:bg-white/5")}
              >
                <Users className="w-6 h-6" />
                Coros
                <span className="text-xs font-normal opacity-70">Pista + Coros</span>
              </button>
              
              <button 
                onClick={() => applyAudioMode('vocals')}
                className={cn("py-4 px-6 rounded-2xl font-bold flex flex-col items-center justify-center gap-2 border-2 transition-all", audioMode === 'vocals' ? "bg-fuchsia-500/20 border-fuchsia-500 text-fuchsia-400" : "bg-black/30 border-white/5 text-slate-400 hover:bg-white/5")}
              >
                <Mic2 className="w-6 h-6" />
                Solo Voz
                <span className="text-xs font-normal opacity-70">Principal</span>
              </button>
            </div>

            <button 
              onClick={handleDownload}
              disabled={isDownloading}
              className={cn(
                "w-full h-16 font-extrabold text-lg rounded-2xl flex items-center justify-center gap-3 transition-all duration-300 shadow-xl cursor-pointer",
                isDownloading 
                  ? "bg-emerald-500 text-white animate-pulse scale-[0.98]" 
                  : "bg-white text-gray-900 shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] ring-1 ring-inset ring-black/10 hover:bg-slate-200 active:scale-[0.98]"
              )}
            >
              {isDownloading ? (
                <>
                  <Loader2 className="w-6 h-6 animate-spin" /> Descargando Audio...
                </>
              ) : (
                <>
                  <Download className="w-6 h-6" /> Descargar Audio MP3 ({audioMode === 'backing' ? 'Coros Aislados' : audioMode === 'instrumental' ? 'Sin Coros' : 'Solo Voz'})
                </>
              )}
            </button>
            <p className="text-center text-slate-500 text-sm mt-4">El archivo se descargará con la pista de audio que tengas seleccionada arriba.</p>

            <button
              onClick={isDownloadingVideo ? stopVideoRecording : handleDownloadVideo}
              className={cn(
                "w-full h-16 font-extrabold text-lg rounded-2xl flex items-center justify-center gap-3 transition-all duration-300 shadow-xl cursor-pointer mt-4",
                isDownloadingVideo ? "bg-fuchsia-600 text-white animate-pulse scale-[0.98]" : "bg-fuchsia-500 text-white hover:bg-fuchsia-400 active:scale-[0.98]"
              )}
            >
              {isDownloadingVideo ? (
                <>
                  <Loader2 className="w-6 h-6 animate-spin" /> Grabando Video... (toca para detener)
                </>
              ) : (
                <>
                  <ImageIcon className="w-6 h-6" /> Descargar Video Karaoke (WEBM)
                </>
              )}
            </button>
            <p className="text-center text-slate-500 text-sm mt-3">Se graba lo que ves en pantalla con el audio. Al terminar, se descargará el video.</p>

            {readyVideo?.url && (
              <>
                <button
                  onClick={downloadReadyVideo}
                  className="w-full h-14 font-extrabold text-base rounded-2xl flex items-center justify-center gap-3 transition-all duration-300 shadow-xl cursor-pointer mt-4 bg-emerald-500 text-white hover:bg-emerald-400 active:scale-[0.98]"
                >
                  <Download className="w-5 h-5" /> Descargar Video Listo
                </button>
                <p className="text-center text-slate-500 text-sm mt-3">Si tu navegador bloquea descargas automáticas, usa este botón.</p>
              </>
            )}
          </div>

        </div>
      </div>
    );
  }

  // STEP: FORM
  return (
    <div className="flex-1 flex flex-col overflow-y-auto w-full bg-[#030303] text-white">
      <div className="max-w-6xl mx-auto px-4 md:px-8 py-8 md:py-12 w-full">
        
        {/* Encabezado */}
        <div className="mb-8 border-b border-white/10 pb-6">
          <h1 className="font-display font-extrabold text-3xl md:text-5xl mb-3 tracking-tight bg-gradient-to-r from-indigo-400 to-purple-500 bg-clip-text text-transparent">
            Crear Video Karaoke
          </h1>
          <p className="text-slate-400 text-lg">
            Sube tu audio y letra para generar un video de karaoke dinámico con IA
          </p>
        </div>

        <div className="space-y-10">
          {/* Fila 1: Audio y Letras */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            
            {/* Audio Upload */}
            <div className="bg-white/5 border border-white/10 rounded-3xl p-6 flex flex-col shadow-lg">
              <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                <FileAudio className="w-5 h-5 text-indigo-400" />
                Archivo de Audio
              </h3>
              
              <div 
                className="flex-1 border-2 border-dashed border-white/20 rounded-2xl flex flex-col items-center justify-center p-8 hover:bg-white/5 transition-colors cursor-pointer group"
                onClick={() => fileInputRef.current?.click()}
              >
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleAudioUpload} 
                  accept="audio/*" 
                  className="hidden" 
                />
                
                {audioFile ? (
                  <div className="text-center relative w-full h-full flex flex-col items-center justify-center">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setAudioFile(null);
                        if (fileInputRef.current) fileInputRef.current.value = '';
                      }}
                      className="absolute top-2 right-2 w-8 h-8 bg-red-500/20 hover:bg-red-500/40 text-red-400 rounded-full flex items-center justify-center transition-colors"
                      title="Eliminar Audio"
                    >
                      <X className="w-5 h-5" />
                    </button>
                    <div className="w-16 h-16 bg-indigo-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Music className="w-8 h-8 text-indigo-400" />
                    </div>
                    <p className="font-bold text-lg text-white mb-1 truncate max-w-[200px]">{audioFile.name}</p>
                    <p className="text-slate-400 text-sm">{(audioFile.size / 1024 / 1024).toFixed(2)} MB</p>
                  </div>
                ) : (
                  <div className="text-center">
                    <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                      <UploadCloud className="w-8 h-8 text-slate-400 group-hover:text-white" />
                    </div>
                    <p className="font-bold text-lg text-white mb-2">Haz clic para subir Audio</p>
                    <p className="text-slate-400 text-sm">Máximo 50MB</p>
                  </div>
                )}
              </div>
            </div>

            {/* Letras Input */}
            <div className="bg-white/5 border border-white/10 rounded-3xl p-6 flex flex-col shadow-lg">
              <div className="flex gap-4 mb-4">
                <div className="flex-1">
                  <label className="text-sm font-bold text-slate-300 block mb-1">Nombre de la Canción *</label>
                  <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej: Bohemian Rhapsody" className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50" />
                </div>
                <div className="flex-1">
                  <label className="text-sm font-bold text-slate-300 block mb-1">Autor (Opcional)</label>
                  <input type="text" value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Ej: Queen" className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50" />
                </div>
              </div>
              <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                <Play className="w-5 h-5 text-purple-400" />
                Letra de la Canción
              </h3>
              <textarea
                value={lyrics}
                onChange={(e) => setLyrics(e.target.value)}
                placeholder="Pega aquí la letra de la canción para que la inteligencia artificial la sincronice palabra por palabra con el audio..."
                className="flex-1 w-full bg-black/40 border border-white/10 rounded-2xl p-4 text-white placeholder:text-slate-500 resize-none min-h-[180px] focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              />
            </div>
          </div>

          {/* Fila 2: Fondo y Estilo */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            
            {/* Background Upload */}
            <div className="bg-white/5 border border-white/10 rounded-3xl p-6 shadow-lg">
              <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                <ImageIcon className="w-5 h-5 text-fuchsia-400" />
                Fondo Personalizado (Opcional)
              </h3>
              
              <div 
                className="border-2 border-dashed border-white/20 rounded-2xl flex flex-col items-center justify-center p-6 hover:bg-white/5 transition-colors cursor-pointer group h-[160px]"
                onClick={() => bgInputRef.current?.click()}
              >
                <input 
                  type="file" 
                  ref={bgInputRef} 
                  onChange={handleBgUpload} 
                  accept="image/*" 
                  className="hidden" 
                />
                
                {backgroundFile ? (
                  <div className="text-center relative w-full h-full flex flex-col items-center justify-center">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setBackgroundFile(null);
                        if (bgInputRef.current) bgInputRef.current.value = '';
                      }}
                      className="absolute top-2 right-2 w-8 h-8 bg-red-500/20 hover:bg-red-500/40 text-red-400 rounded-full flex items-center justify-center transition-colors"
                      title="Eliminar Fondo"
                    >
                      <X className="w-5 h-5" />
                    </button>
                    <p className="font-bold text-lg text-white mb-1 truncate max-w-[200px]">{backgroundFile.name}</p>
                    <p className="text-slate-400 text-sm">Fondo Listo</p>
                  </div>
                ) : (
                  <div className="text-center">
                    <UploadCloud className="w-8 h-8 text-slate-400 group-hover:text-white mx-auto mb-3" />
                    <p className="font-bold text-white mb-1">Subir Imagen</p>
                    <p className="text-slate-400 text-xs">Si no subes nada, usaremos el color de fondo.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Configuración Visual */}
            <div className="bg-white/5 border border-white/10 rounded-3xl p-6 shadow-lg">
              <h3 className="text-xl font-bold mb-4">Colores del Video</h3>
              <div className="flex flex-col gap-5">
                <div className="flex items-center justify-between">
                  <label className="text-slate-300 font-medium">Color de Fondo</label>
                  <div className="flex items-center gap-3">
                    <input type="color" value={bgColor} onChange={(e) => setBgColor(e.target.value)} className="w-10 h-10 rounded-xl cursor-pointer border-0" />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <label className="text-slate-300 font-medium">Color de Letras Base</label>
                  <div className="flex items-center gap-3">
                    <input type="color" value={textColor} onChange={(e) => setTextColor(e.target.value)} className="w-10 h-10 rounded-xl cursor-pointer border-0" />
                  </div>
                </div>
                <div className="flex items-center justify-between border-t border-white/10 pt-4">
                  <div className="flex flex-col">
                    <label className="text-slate-200 font-bold">Color de Resaltado (Sombreado)</label>
                    <span className="text-xs text-slate-400">El color que avanza al cantar</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <input type="color" value={highlightColor} onChange={(e) => setHighlightColor(e.target.value)} className="w-12 h-12 rounded-xl cursor-pointer border-0 shadow-[0_0_15px_rgba(0,0,0,0.5)]" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Submit */}
          <div className="flex justify-end pt-4">
            <button 
              disabled={!canSubmit || step === 'generating'}
              onClick={handleGenerate}
              className="w-full md:w-auto h-16 px-12 text-xl font-bold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-2xl transition-all shadow-xl shadow-indigo-500/20 flex items-center justify-center"
            >
              Generar Karaoke Dinámico <ArrowRight className="w-6 h-6 ml-3" />
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
