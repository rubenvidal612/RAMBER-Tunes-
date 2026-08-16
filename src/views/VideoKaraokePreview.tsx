import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, FileAudio, HelpCircle, Image, Mic2, Music2, Pause, Play, Sparkles, Upload, Video, Volume2, X } from 'lucide-react';
import { useVideoKaraokeProject } from './video-karaoke/useVideoKaraokeProject';

const steps = ['Canción', 'Letra', 'Karaoke', 'Diseño', 'Exportar'];

function getPresetStyle(preset: string) {
  const name = (preset || 'Neon').trim();
  if (name === 'Clásico') return { background: 'linear-gradient(180deg,#0a0c13 0%,#04060b 100%)', overlay: 'radial-gradient(circle at 50% 18%,rgba(255,255,255,.08) 0%,transparent 50%)', textColor: '#ffffff', activeColor: '#cbd5f5', fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Inter, sans-serif', glow: false, badge: 'rgba(255,255,255,.08)', activeBg: 'rgba(255,255,255,.06)', activeBorder: 'rgba(255,255,255,.12)', letterSpacing: '-0.01em' };
  if (name === 'Neon') return { background: 'radial-gradient(circle at 50% 20%,rgba(236,72,153,.28) 0%,rgba(5,6,17,1) 64%),linear-gradient(120deg,rgba(99,102,241,.12),transparent 55%)', overlay: 'radial-gradient(circle at 65% 40%,rgba(255,47,146,.24) 0%,transparent 55%)', textColor: '#ffffff', activeColor: '#ff2f92', fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Poppins, sans-serif', glow: true, badge: 'rgba(255,47,146,.18)', activeBg: 'rgba(255,47,146,.20)', activeBorder: 'rgba(255,47,146,.36)', letterSpacing: '-0.02em' };
  if (name === 'Romántico') return { background: 'radial-gradient(circle at 35% 18%,rgba(255,115,176,.30) 0%,rgba(6,6,12,1) 62%),linear-gradient(120deg,rgba(255,50,140,.12),rgba(255,205,240,.04))', overlay: 'radial-gradient(circle at 70% 70%,rgba(255,185,215,.18) 0%,transparent 55%)', textColor: '#ffeef6', activeColor: '#ff3f9f', fontFamily: 'ui-serif, Georgia, Times New Roman, serif', glow: true, badge: 'rgba(255,63,159,.18)', activeBg: 'rgba(255,63,159,.16)', activeBorder: 'rgba(255,63,159,.28)', letterSpacing: '0.005em' };
  if (name === 'Noche') return { background: 'radial-gradient(circle at 40% 20%,rgba(59,130,246,.22) 0%,rgba(10,13,30,1) 60%),linear-gradient(180deg,#050816 0%,#020312 100%)', overlay: 'radial-gradient(circle at 75% 35%,rgba(99,102,241,.18) 0%,transparent 58%)', textColor: '#e7efff', activeColor: '#6aa9ff', fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Inter, sans-serif', glow: true, badge: 'rgba(106,169,255,.16)', activeBg: 'rgba(106,169,255,.16)', activeBorder: 'rgba(106,169,255,.30)', letterSpacing: '-0.01em' };
  if (name === 'Rock') return { background: 'linear-gradient(180deg,#0b0b0c 0%,#060607 100%),repeating-linear-gradient(135deg,rgba(255,255,255,.04) 0 8px,transparent 8px 16px)', overlay: 'radial-gradient(circle at 50% 0%,rgba(255,255,255,.10) 0%,transparent 55%)', textColor: '#f3f4f6', activeColor: '#ff5050', fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Inter, sans-serif', glow: false, badge: 'rgba(255,80,80,.14)', activeBg: 'rgba(255,80,80,.14)', activeBorder: 'rgba(255,80,80,.30)', letterSpacing: '0.01em' };
  if (name === 'Elegante') return { background: 'linear-gradient(180deg,#07060b 0%,#020206 100%),radial-gradient(circle at 35% 20%,rgba(245,193,76,.22) 0%,transparent 55%)', overlay: 'linear-gradient(90deg,rgba(245,193,76,.12),transparent 60%)', textColor: '#fff6dd', activeColor: '#f5c14c', fontFamily: 'ui-serif, Georgia, Times New Roman, serif', glow: false, badge: 'rgba(245,193,76,.16)', activeBg: 'rgba(245,193,76,.12)', activeBorder: 'rgba(245,193,76,.26)', letterSpacing: '0.02em' };
  if (name === 'Urbano') return { background: 'linear-gradient(135deg,rgba(47,124,255,.22) 0%,rgba(255,47,146,.12) 42%,rgba(7,7,16,1) 90%),repeating-linear-gradient(90deg,rgba(255,255,255,.03) 0 3px,transparent 3px 9px)', overlay: 'radial-gradient(circle at 20% 75%,rgba(39,214,166,.14) 0%,transparent 52%)', textColor: '#f0f7ff', activeColor: '#27d6a6', fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Poppins, sans-serif', glow: true, badge: 'rgba(39,214,166,.18)', activeBg: 'rgba(39,214,166,.16)', activeBorder: 'rgba(39,214,166,.32)', letterSpacing: '-0.015em' };
  return { background: 'linear-gradient(180deg,#0a0c13 0%,#04060b 100%)', overlay: 'radial-gradient(circle at 50% 18%,rgba(255,255,255,.08) 0%,transparent 50%)', textColor: '#ffffff', activeColor: '#cbd5f5', fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Inter, sans-serif', glow: false, badge: 'rgba(255,255,255,.08)', activeBg: 'rgba(255,255,255,.06)', activeBorder: 'rgba(255,255,255,.12)', letterSpacing: '-0.01em' };
}

export function VideoKaraokePreview({ credits = 1248 }: { credits?: number }) {
  const { step, setStep, format, setFormat, preset, setPreset } = useVideoKaraokeProject();
  const [fileName, setFileName] = useState('Si te vuelves a enamorar.mp3');
  const [hasAudio, setHasAudio] = useState(false);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [playing, setPlaying] = useState(false);
  const [audioSrc, setAudioSrc] = useState('');
  const audioSrcRef = useRef('');
  const audioRef = useRef<HTMLAudioElement>(null);
  const [audioDurationSec, setAudioDurationSec] = useState(0);
  const [audioCurrentSec, setAudioCurrentSec] = useState(0);
  const [audioSizeBytes, setAudioSizeBytes] = useState(0);
  const [karaokePlaying, setKaraokePlaying] = useState(false);
  const [karaokeSrc, setKaraokeSrc] = useState('');
  const karaokeAudioRef = useRef<HTMLAudioElement>(null);
  const [karaokeDurationSec, setKaraokeDurationSec] = useState(0);
  const [karaokeCurrentSec, setKaraokeCurrentSec] = useState(0);
  const [bgImageUrl, setBgImageUrl] = useState('');
  const bgImageUrlRef = useRef('');
  const [bgImageFile, setBgImageFile] = useState<File | null>(null);
  const [bgVideoUrl, setBgVideoUrl] = useState('');
  const bgVideoUrlRef = useRef('');
  const [bgVideoFile, setBgVideoFile] = useState<File | null>(null);
  const [bgColor, setBgColor] = useState('#070914');
  const [bgColorEnabled, setBgColorEnabled] = useState(false);
  const [bgDarken, setBgDarken] = useState(35);
  const [bgBlur, setBgBlur] = useState(0);
  const [bgBrightness, setBgBrightness] = useState(105);
  const [bgLoop, setBgLoop] = useState(true);
  const [bgError, setBgError] = useState('');
  const bgImageInputRef = useRef<HTMLInputElement>(null);
  const bgVideoInputRef = useRef<HTMLInputElement>(null);
  const [lyricsMode, setLyricsMode] = useState('auto');
  const [lyricsText, setLyricsText] = useState('');
  const [lyricsFileName, setLyricsFileName] = useState('');
  const [attemptedContinue, setAttemptedContinue] = useState(false);
  const [removeVoice, setRemoveVoice] = useState(true);
  const [showNotice, setShowNotice] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [fontSize, setFontSize] = useState(30);
  const [textColor, setTextColor] = useState('#ffffff');
  const [activeColor, setActiveColor] = useState('#ff2f92');
  const [instrumentalVolume, setInstrumentalVolume] = useState(100);
  const [chorusVolume, setChorusVolume] = useState(60);
  const [pitch, setPitch] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [fontFamily, setFontFamily] = useState('Montserrat');
  const [position, setPosition] = useState('Centro inferior');
  const [alignment, setAlignment] = useState('Centrada');
  const fileRef = useRef<HTMLInputElement>(null);
  const [youkaPhase, setYoukaPhase] = useState<'idle' | 'uploading' | 'quoting' | 'creating' | 'processing' | 'ready' | 'failed'>('idle');
  const [youkaQuote, setYoukaQuote] = useState<any>(null);
  const [youkaUploadId, setYoukaUploadId] = useState('');
  const [youkaTaskId, setYoukaTaskId] = useState('');
  const [youkaProjectId, setYoukaProjectId] = useState('');
  const [youkaProgress, setYoukaProgress] = useState<number | null>(null);
  const [youkaStems, setYoukaStems] = useState<any[]>([]);
  const [youkaAlignments, setYoukaAlignments] = useState<any[]>([]);
  const [youkaError, setYoukaError] = useState('');
  const pollTimerRef = useRef<number | null>(null);
  const startLockRef = useRef(false);

  const stopPoll = () => {
    const t = pollTimerRef.current;
    if (t) window.clearInterval(t);
    pollTimerRef.current = null;
  };

  const resetYouka = () => {
    stopPoll();
    setYoukaPhase('idle');
    setYoukaQuote(null);
    setYoukaUploadId('');
    setYoukaTaskId('');
    setYoukaProjectId('');
    setYoukaProgress(null);
    setYoukaStems([]);
    setYoukaAlignments([]);
    setYoukaError('');
    setKaraokeSrc('');
    setKaraokeDurationSec(0);
    setKaraokeCurrentSec(0);
    setKaraokePlaying(false);
    const el = karaokeAudioRef.current;
    if (el) {
      el.pause();
      el.removeAttribute('src');
      el.load();
    }
    startLockRef.current = false;
  };

  const instrumentalStemUrl = youkaStems.find((stem) => stem && stem.type === 'instrumental')?.url || '';
  const vocalsStemUrl = youkaStems.find((stem) => stem && stem.type === 'vocals')?.url || '';
  const backingVocalsStemUrl = youkaStems.find((stem) => stem && stem.type === 'backing_vocals')?.url || '';
  const chorusAvailable = Boolean(backingVocalsStemUrl);

  const effectiveKaraokeSrc = youkaPhase === 'ready' && removeVoice && instrumentalStemUrl ? instrumentalStemUrl : audioSrc;

  const cleanupAudioSrc = () => {
    const prev = audioSrcRef.current;
    if (prev) URL.revokeObjectURL(prev);
    audioSrcRef.current = '';
  };

  const cleanupBgImageUrl = () => {
    const prev = bgImageUrlRef.current;
    if (prev) URL.revokeObjectURL(prev);
    bgImageUrlRef.current = '';
  };

  const cleanupBgVideoUrl = () => {
    const prev = bgVideoUrlRef.current;
    if (prev) URL.revokeObjectURL(prev);
    bgVideoUrlRef.current = '';
  };

  const clearSelectedAudio = () => {
    const el = audioRef.current;
    if (el) {
      el.pause();
      el.removeAttribute('src');
      el.load();
    }
    cleanupAudioSrc();
    resetYouka();
    setPlaying(false);
    setAudioSrc('');
    setAudioDurationSec(0);
    setAudioCurrentSec(0);
    setAudioSizeBytes(0);
    setHasAudio(false);
    setAudioFile(null);
    try {
      if (fileRef.current) fileRef.current.value = '';
    } catch {}
  };

  const clearBackground = () => {
    cleanupBgImageUrl();
    cleanupBgVideoUrl();
    setBgImageUrl('');
    setBgVideoUrl('');
    setBgImageFile(null);
    setBgVideoFile(null);
    setBgColorEnabled(false);
    setBgError('');
    try {
      if (bgImageInputRef.current) bgImageInputRef.current.value = '';
      if (bgVideoInputRef.current) bgVideoInputRef.current.value = '';
    } catch {}
  };

  const selectBgImage = (file?: File) => {
    if (!file) return;
    cleanupBgImageUrl();
    cleanupBgVideoUrl();
    const nextUrl = URL.createObjectURL(file);
    bgImageUrlRef.current = nextUrl;
    setBgImageUrl(nextUrl);
    setBgVideoUrl('');
    setBgImageFile(file);
    setBgVideoFile(null);
    setBgColorEnabled(false);
    setBgError('');
    try {
      if (bgVideoInputRef.current) bgVideoInputRef.current.value = '';
    } catch {}
  };

  const selectBgVideo = (file?: File) => {
    if (!file) return;
    if (file.type) {
      try {
        const probe = document.createElement('video');
        const canPlay = probe.canPlayType(file.type);
        if (!canPlay || canPlay === 'no') {
          setBgError('Tu navegador no soporta ese video como fondo. Prueba MP4 (H.264) u otro formato.');
          try {
            if (bgVideoInputRef.current) bgVideoInputRef.current.value = '';
          } catch {}
          return;
        }
      } catch {}
    }
    cleanupBgVideoUrl();
    cleanupBgImageUrl();
    const nextUrl = URL.createObjectURL(file);
    bgVideoUrlRef.current = nextUrl;
    setBgVideoUrl(nextUrl);
    setBgImageUrl('');
    setBgVideoFile(file);
    setBgImageFile(null);
    setBgColorEnabled(false);
    setBgError('');
    try {
      if (bgImageInputRef.current) bgImageInputRef.current.value = '';
    } catch {}
  };

  const enableBgColor = (color: string) => {
    cleanupBgImageUrl();
    cleanupBgVideoUrl();
    setBgImageUrl('');
    setBgVideoUrl('');
    setBgImageFile(null);
    setBgVideoFile(null);
    setBgColor(color);
    setBgColorEnabled(true);
    setBgError('');
    try {
      if (bgImageInputRef.current) bgImageInputRef.current.value = '';
      if (bgVideoInputRef.current) bgVideoInputRef.current.value = '';
    } catch {}
  };

  const selectFile = (file?: File) => {
    if (!file) return;
    const el = audioRef.current;
    if (el) el.pause();
    cleanupAudioSrc();
    resetYouka();
    const nextSrc = URL.createObjectURL(file);
    audioSrcRef.current = nextSrc;
    setAudioSrc(nextSrc);
    setFileName(file.name);
    setAudioSizeBytes(file.size || 0);
    setAudioDurationSec(0);
    setAudioCurrentSec(0);
    setPlaying(false);
    setHasAudio(true);
    setAudioFile(file);
  };

  const togglePlayback = async () => {
    const el = audioRef.current;
    if (!el || !audioSrc) return;
    if (el.paused) {
      try {
        await el.play();
      } catch {}
      return;
    }
    el.pause();
  };

  const seekTo = (nextSec: number) => {
    const el = audioRef.current;
    if (!el || !Number.isFinite(nextSec)) return;
    el.currentTime = Math.max(0, Math.min(nextSec, Number.isFinite(el.duration) ? el.duration : nextSec));
    setAudioCurrentSec(el.currentTime || 0);
  };

  const toggleKaraokePlayback = async () => {
    const el = karaokeAudioRef.current;
    if (!el || !effectiveKaraokeSrc) return;
    if (el.paused) {
      try {
        await el.play();
      } catch {}
      return;
    }
    el.pause();
  };

  const seekKaraokeTo = (nextSec: number) => {
    const el = karaokeAudioRef.current;
    if (!el || !Number.isFinite(nextSec)) return;
    el.currentTime = Math.max(0, Math.min(nextSec, Number.isFinite(el.duration) ? el.duration : nextSec));
    setKaraokeCurrentSec(el.currentTime || 0);
  };

  const simpleHash = (value: string) => {
    let h = 0;
    for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) >>> 0;
    return h.toString(16);
  };

  const startYoukaProcessing = async () => {
    if (startLockRef.current) return;
    if (!audioFile) {
      setYoukaError('Selecciona un archivo local para poder procesarlo con Youka.');
      return;
    }
    if (!Number.isFinite(audioDurationSec) || audioDurationSec <= 0) {
      setYoukaError('No pude obtener la duración del audio. Reproduce o espera a que cargue la metadata y vuelve a intentar.');
      return;
    }
    if (lyricsMode !== 'auto' && !String(lyricsText || '').trim()) {
      setYoukaError('Pegaste/subiste letra, pero está vacía. Agrega la letra para poder alinear.');
      return;
    }

    setYoukaError('');
    startLockRef.current = true;
    try {
      setYoukaPhase('uploading');
      setYoukaProgress(null);
      setYoukaStems([]);
      setYoukaAlignments([]);

      const lyricsSource = lyricsMode === 'auto'
        ? { type: 'transcribe', language: 'es' }
        : { type: 'align', lyrics: String(lyricsText || ''), language: 'es' };

      const baseKey = `f${audioFile.size}-m${audioFile.lastModified}-n${audioFile.name}-l${lyricsMode}-${simpleHash(String(lyricsText || ''))}`;
      const uploadKey = `vk-upload-${baseKey}`;
      const projectKey = `vk-project-${baseKey}`;

      const uploadRes = await fetch('/api/video-karaoke/uploads', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': uploadKey },
        body: JSON.stringify({
          filename: audioFile.name,
          contentType: audioFile.type || 'audio/mpeg',
          contentLength: audioFile.size,
        }),
      });
      const uploadJson = await uploadRes.json().catch(() => null) as any;
      if (!uploadRes.ok || !uploadJson?.ok || !uploadJson?.data?.uploadUrl || !uploadJson?.data?.uploadId) {
        throw new Error(uploadJson?.error?.message || 'No pude preparar la subida a Youka.');
      }

      const uploadId = String(uploadJson.data.uploadId);
      setYoukaUploadId(uploadId);
      const uploadUrl = String(uploadJson.data.uploadUrl);

      const putRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'content-type': audioFile.type || 'audio/mpeg' },
        body: audioFile,
      });
      if (!putRes.ok) throw new Error('No pude subir el archivo a Youka. Intenta de nuevo.');

      setYoukaPhase('quoting');
      const quoteRes = await fetch('/api/video-karaoke/quote', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          inputFileId: uploadId,
          durationSeconds: audioDurationSec,
          splitModel: 'mdx23c',
          lyricsSource,
        }),
      });
      const quoteJson = await quoteRes.json().catch(() => null) as any;
      if (!quoteRes.ok || !quoteJson?.ok) throw new Error(quoteJson?.error?.message || 'No pude cotizar el proyecto con Youka.');
      setYoukaQuote(quoteJson.data);

      setYoukaPhase('creating');
      const createRes = await fetch('/api/video-karaoke/projects', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': projectKey },
        body: JSON.stringify({
          title: audioFile.name,
          inputFileId: uploadId,
          splitModel: 'mdx23c',
          lyricsSource,
        }),
      });
      const createJson = await createRes.json().catch(() => null) as any;
      if (!createRes.ok || !createJson?.ok || !createJson?.data?.id) throw new Error(createJson?.error?.message || 'No pude crear el proyecto de Youka.');

      const projectId = String(createJson.data.id);
      const taskId = String(createJson.data.providerTaskId || createJson.data.taskId || '');
      setYoukaProjectId(projectId);
      setYoukaTaskId(taskId);

      if (!taskId) {
        throw new Error('Youka no devolvió un taskId para monitorear el procesamiento.');
      }

      setYoukaPhase('processing');
      const startedAt = Date.now();
      stopPoll();
      pollTimerRef.current = window.setInterval(async () => {
        const elapsed = Date.now() - startedAt;
        if (elapsed > 20 * 60 * 1000) {
          stopPoll();
          setYoukaPhase('failed');
          setYoukaError('Tiempo de espera agotado al procesar el karaoke.');
          startLockRef.current = false;
          return;
        }
        const statusRes = await fetch(`/api/video-karaoke/tasks/${encodeURIComponent(taskId)}`);
        const statusJson = await statusRes.json().catch(() => null) as any;
        if (!statusRes.ok || !statusJson?.ok) return;
        const task = statusJson.data || {};
        const state = String(task.state || task.status || '').toLowerCase();
        const progress = task.progress == null ? null : Number(task.progress);
        setYoukaProgress(Number.isFinite(progress) ? progress : null);
        if (state === 'succeeded' || state === 'completed' || state === 'success') {
          stopPoll();
          const projectRes = await fetch(`/api/video-karaoke/projects/${encodeURIComponent(projectId)}`);
          const projectJson = await projectRes.json().catch(() => null) as any;
          if (!projectRes.ok || !projectJson?.ok) {
            setYoukaPhase('failed');
            setYoukaError(projectJson?.error?.message || 'No pude obtener el resultado del proyecto.');
            startLockRef.current = false;
            return;
          }
          const provider = projectJson.data?.provider || projectJson.data || {};
          const stems = Array.isArray(provider.stems) ? provider.stems : [];
          const alignments = Array.isArray(provider.alignments) ? provider.alignments : [];
          setYoukaStems(stems);
          setYoukaAlignments(alignments);
          setYoukaPhase('ready');
          startLockRef.current = false;
          return;
        }
        if (state === 'failed' || state === 'error' || state === 'canceled' || state === 'cancelled') {
          stopPoll();
          setYoukaPhase('failed');
          setYoukaError(task?.error?.message || 'Youka falló al procesar el karaoke.');
          startLockRef.current = false;
        }
      }, 3000);
    } catch (err: any) {
      stopPoll();
      setYoukaPhase('failed');
      setYoukaError(String(err?.message || 'No pude procesar el karaoke.'));
      startLockRef.current = false;
    }
  };

  useEffect(() => {
    return () => {
      cleanupAudioSrc();
      resetYouka();
      cleanupBgImageUrl();
      cleanupBgVideoUrl();
    };
  }, []);

  useEffect(() => {
    const el = karaokeAudioRef.current;
    if (!el) return;
    el.pause();
    setKaraokePlaying(false);
    setKaraokeCurrentSec(0);
    try {
      el.currentTime = 0;
      el.load();
    } catch {}
  }, [effectiveKaraokeSrc]);

  useEffect(() => {
    if (!chorusAvailable && !removeVoice) setRemoveVoice(true);
  }, [chorusAvailable, removeVoice]);

  if (showResult) return <KaraokeResult onAgain={()=>{setShowResult(false);setStep(1)}} />;
  return <div className="h-full overflow-y-auto bg-[#050611] text-white">
    <input ref={fileRef} type="file" accept="audio/*,video/mp4" className="hidden" onChange={e => selectFile(e.target.files?.[0])} />
    <audio
      ref={audioRef}
      className="hidden"
      preload="metadata"
      src={audioSrc || undefined}
      onPlay={() => setPlaying(true)}
      onPause={() => setPlaying(false)}
      onEnded={() => setPlaying(false)}
      onLoadedMetadata={(e) => {
        const el = e.currentTarget;
        const d = Number(el.duration);
        setAudioDurationSec(Number.isFinite(d) ? d : 0);
      }}
      onTimeUpdate={(e) => {
        const el = e.currentTarget;
        setAudioCurrentSec(el.currentTime || 0);
      }}
    />
    <audio
      ref={karaokeAudioRef}
      className="hidden"
      preload="metadata"
      src={effectiveKaraokeSrc || undefined}
      onPlay={() => setKaraokePlaying(true)}
      onPause={() => setKaraokePlaying(false)}
      onEnded={() => setKaraokePlaying(false)}
      onLoadedMetadata={(e) => {
        const el = e.currentTarget;
        const d = Number(el.duration);
        setKaraokeDurationSec(Number.isFinite(d) ? d : 0);
      }}
      onTimeUpdate={(e) => {
        const el = e.currentTarget;
        setKaraokeCurrentSec(el.currentTime || 0);
      }}
    />
    <div className="mx-auto w-full max-w-[1500px] px-4 py-5 md:px-7 md:py-7">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.08fr)_minmax(430px,.72fr)]">
        <section className="hidden overflow-hidden rounded-[24px] border border-white/10 bg-[#080a15] shadow-2xl shadow-black/40 xl:block">
          <div className="relative min-h-[245px] overflow-hidden border-b border-white/10 p-7 md:p-10">
            <img src="/assets/tool-clone-voice.png" alt="Micrófono en estudio musical" className="absolute inset-0 h-full w-full object-cover opacity-45" />
            <div className="absolute inset-0 bg-gradient-to-r from-[#070914] via-[#070914]/90 to-[#070914]/20" />
            <div className="relative z-10 max-w-[600px]">
              <div className="flex flex-wrap items-center gap-3"><h1 className="bg-gradient-to-r from-fuchsia-500 to-pink-500 bg-clip-text text-4xl font-black tracking-tight text-transparent md:text-6xl">Video Karaoke</h1><span className="rounded-md bg-blue-600 px-2.5 py-1 text-[11px] font-black">NUEVO</span></div>
              <h2 className="mt-3 text-lg font-extrabold md:text-xl">Convierte tu canción en un video karaoke con letra sincronizada</h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-slate-300 md:text-base">Sube tu canción, sincronizamos la letra y te entregamos un video listo para cantar.</p>
            </div>
          </div>
          <div className="p-5 md:p-7">
            <h3 className="text-lg font-extrabold">Comienza tu karaoke</h3>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <StartCard icon={Upload} title="Subir una canción" text="Sube un archivo de audio o video desde tu dispositivo." button="Seleccionar archivo" onClick={() => fileRef.current?.click()} />
              <StartCard icon={Music2} title="Elegir de mi Biblioteca" text="Usa una canción que ya generaste en LucIAna Music." button="Abrir Biblioteca" onClick={() => { setFileName('Luz de madrugada.mp3'); setHasAudio(true); }} secondary />
            </div>
            <div className="mt-4 grid gap-2 rounded-2xl border border-white/10 bg-white/[.02] p-3 sm:grid-cols-2 lg:grid-cols-4">
              <Feature icon={Upload} text="Sincronización inteligente de letras"/><Feature icon={Volume2} text="Elimina la voz o conserva coros"/><Feature icon={Image} text="Fondos y estilos personalizables"/><Feature icon={Video} text="Exporta en HD 720p / 1080p"/>
            </div>
            <p className="mt-4 text-[11px] text-slate-500">Vista previa visual. No se procesará ningún archivo ni se descontarán créditos.</p>
          </div>
        </section>

        <section className="flex min-h-[650px] flex-col overflow-hidden rounded-[24px] border border-white/10 bg-[#080a15] shadow-2xl shadow-black/40">
          <header className="flex items-center justify-between border-b border-white/10 px-5 py-4"><div className="flex items-center gap-3"><ArrowLeft className="h-4 w-4 text-slate-400"/><strong>Nuevo Karaoke</strong></div><div className="flex items-center gap-2"><span className="rounded-full bg-white/5 px-3 py-1.5 text-xs font-bold">Créditos: {credits.toLocaleString('es-MX')}</span><HelpCircle className="h-5 w-5 text-slate-400"/></div></header>
          <div className="px-4 pt-5 md:px-6"><div className="relative grid grid-cols-5"><div className="absolute left-[10%] right-[10%] top-4 h-px bg-white/15"><div className="h-full bg-pink-500 transition-all" style={{width:`${Math.max(0,(step-1)*25)}%`}}/></div>{steps.map((label,i)=>{const n=i+1;return <button key={label} onClick={()=>setStep(n)} className="relative z-10 flex min-w-0 flex-col items-center gap-2"><span className={`grid h-8 w-8 place-items-center rounded-full border text-xs font-black ${n<=step?'border-pink-500 bg-pink-600':'border-white/20 bg-[#0b0d18] text-slate-400'}`}>{n<step?<Check className="h-4 w-4"/>:n}</span><small className={`w-full truncate text-center text-[9px] md:text-[10px] ${n===step?'text-pink-300':'text-slate-400'}`}>{label}</small></button>})}</div></div>
          <div className="flex-1 p-5 md:p-6">
            {step===1&&<AudioStep fileName={fileName} hasAudio={hasAudio} playing={playing} durationSec={audioDurationSec} currentSec={audioCurrentSec} sizeBytes={audioSizeBytes} canPlay={Boolean(audioSrc)} onPlay={togglePlayback} onSeek={seekTo} onUpload={()=>fileRef.current?.click()} onLibrary={()=>{setFileName('Luz de madrugada.mp3');setHasAudio(true);setAudioSrc('');cleanupAudioSrc();setAudioDurationSec(0);setAudioCurrentSec(0);setAudioSizeBytes(0);setPlaying(false)}} onClear={clearSelectedAudio}/>} 
            {step===2&&<LyricsStep mode={lyricsMode} setMode={setLyricsMode} lyricsText={lyricsText} setLyricsText={setLyricsText} lyricsFileName={lyricsFileName} setLyricsFileName={setLyricsFileName} showValidation={attemptedContinue} />} 
            {step===3&&<AudioSettings removeVoice={removeVoice} setRemoveVoice={setRemoveVoice} instrumentalVolume={instrumentalVolume} setInstrumentalVolume={setInstrumentalVolume} chorusVolume={chorusVolume} setChorusVolume={setChorusVolume} pitch={pitch} setPitch={setPitch} speed={speed} setSpeed={setSpeed} canPlay={Boolean(effectiveKaraokeSrc)} playing={karaokePlaying} durationSec={karaokeDurationSec} currentSec={karaokeCurrentSec} onPlay={toggleKaraokePlayback} onSeek={seekKaraokeTo} fileName={fileName} youkaPhase={youkaPhase} youkaProgress={youkaProgress} youkaError={youkaError} youkaQuote={youkaQuote} removeVoiceReady={youkaPhase==='ready'&&removeVoice&&Boolean(instrumentalStemUrl)} chorusAvailable={chorusAvailable} />} 
            {step===4&&<DesignStep format={format} setFormat={setFormat} preset={preset} setPreset={(next:string)=>{const presetStyle=getPresetStyle(next);setPreset(next);setFontFamily(presetStyle.fontFamily);setTextColor(presetStyle.textColor);setActiveColor(presetStyle.activeColor);}} fontSize={fontSize} setFontSize={setFontSize} textColor={textColor} setTextColor={setTextColor} activeColor={activeColor} setActiveColor={setActiveColor} fontFamily={fontFamily} setFontFamily={setFontFamily} position={position} setPosition={setPosition} alignment={alignment} setAlignment={setAlignment} bgImageUrl={bgImageUrl} bgVideoUrl={bgVideoUrl} bgColor={bgColor} bgColorEnabled={bgColorEnabled} bgDarken={bgDarken} setBgDarken={setBgDarken} bgBlur={bgBlur} setBgBlur={setBgBlur} bgBrightness={bgBrightness} setBgBrightness={setBgBrightness} bgLoop={bgLoop} setBgLoop={setBgLoop} bgError={bgError} setBgError={setBgError} onSelectBgImage={selectBgImage} onSelectBgVideo={selectBgVideo} onEnableBgColor={enableBgColor} onClearBackground={clearBackground} bgImageInputRef={bgImageInputRef} bgVideoInputRef={bgVideoInputRef} />} {step===5&&<ExportStep fileName={fileName} format={format} preset={preset} instrumentalVolume={instrumentalVolume} chorusVolume={chorusVolume} previewProps={{formatClass:{'16:9':'aspect-video','9:16':'aspect-[9/16]','1:1':'aspect-square'}[format],fontSize,textColor,activeColor,preset,fontFamily,position,alignment,bgImageUrl,bgVideoUrl,bgColor,bgColorEnabled,bgDarken,bgBlur,bgBrightness,bgLoop}} />} 
          </div>
          <footer className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-white/10 bg-[#080a15]/95 p-4 backdrop-blur md:px-6"><button disabled={step===1} onClick={()=>setStep(step-1)} className="inline-flex h-11 items-center gap-2 rounded-xl border border-white/10 px-4 text-sm font-bold text-slate-300 disabled:opacity-30"><ArrowLeft className="h-4 w-4"/> Atrás</button>{step<5?<button onClick={async ()=>{if(step===1){if(!hasAudio){return;}setStep(2);return;}if(step===2){setAttemptedContinue(true);if(lyricsMode!=='auto'&&!String(lyricsText||'').trim()){setYoukaError('Pegaste/subiste letra, pero está vacía.');return;}setStep(3);await startYoukaProcessing();return;}setStep(step+1);}} className="inline-flex h-11 min-w-[165px] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-fuchsia-600 to-pink-600 px-5 text-sm font-black">Continuar <ArrowRight className="h-4 w-4"/></button>:<button onClick={()=>setShowNotice(true)} className="h-11 rounded-xl bg-gradient-to-r from-fuchsia-600 to-pink-600 px-5 text-sm font-black">Generar Video Karaoke</button>}</footer>
        </section>
      </div>
    </div>
    {showNotice&&<div className="fixed inset-0 z-[400] grid place-items-center bg-black/75 p-4 backdrop-blur-sm"><div className="w-full max-w-md rounded-3xl border border-pink-500/30 bg-[#0b0d18] p-6 text-center shadow-2xl shadow-pink-900/30"><span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-pink-500/10 text-pink-400"><Video className="h-7 w-7"/></span><h3 className="mt-4 text-xl font-black">Integración en preparación</h3><p className="mt-2 text-sm leading-6 text-slate-300">La generación real estará disponible cuando activemos la integración con Youka.</p><p className="mt-3 text-xs text-slate-500">No se descontaron créditos ni se procesó ningún archivo.</p><div className="mt-6 grid gap-3 sm:grid-cols-2"><button onClick={()=>setShowNotice(false)} className="h-11 rounded-xl border border-white/10 text-sm font-bold">Cerrar</button><button onClick={()=>{setShowNotice(false);setShowResult(true)}} className="h-11 rounded-xl bg-gradient-to-r from-fuchsia-600 to-pink-600 text-sm font-black">Ver resultado mock</button></div></div></div>}
  </div>;
}

function StartCard({icon:Icon,title,text,button,onClick,secondary=false}:any){return <article className="rounded-2xl border border-white/10 bg-white/[.025] p-5"><div className="flex gap-4"><span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-fuchsia-500/10 text-fuchsia-400"><Icon className="h-7 w-7"/></span><div><strong>{title}</strong><p className="mt-1 text-sm leading-5 text-slate-400">{text}</p><span className="mt-3 inline-block rounded-md bg-white/5 px-2 py-1 text-[10px] font-bold text-slate-300">MP3, WAV, M4A, MP4</span></div></div><button onClick={onClick} className={`mt-5 h-11 w-full rounded-xl text-sm font-extrabold ${secondary?'border border-white/10 bg-white/5':'bg-gradient-to-r from-fuchsia-600 to-pink-600'}`}>{button}</button></article>}
function Feature({icon:Icon,text}:any){return <div className="flex items-center gap-3 rounded-xl p-2.5"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-pink-500/10 text-pink-400"><Icon className="h-5 w-5"/></span><span className="text-xs font-semibold leading-4 text-slate-200">{text}</span></div>}
function formatDuration(seconds: number) {
  const raw = Math.max(0, Math.floor(Number(seconds) || 0));
  const mins = Math.floor(raw / 60);
  const secs = raw % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}
function formatSize(bytes: number) {
  const n = Number(bytes) || 0;
  if (n <= 0) return '0 MB';
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
function AudioStep({fileName,hasAudio,playing,durationSec,currentSec,sizeBytes,canPlay,onPlay,onSeek,onUpload,onLibrary,onClear}:any){return <div><h3 className="font-extrabold">1. Selecciona tu canción</h3><div className="mt-4 grid grid-cols-2 rounded-xl bg-white/[.04] p-1"><button onClick={onUpload} className="rounded-lg border border-pink-500 py-2.5 text-xs font-bold text-pink-200">Subir canción</button><button onClick={onLibrary} className="rounded-lg py-2.5 text-xs font-bold text-slate-300">Mi Biblioteca</button></div>{hasAudio?<div className="mt-4 rounded-2xl border border-white/10 bg-white/[.025] p-4"><div className="flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-xl bg-pink-500/15 text-pink-400"><FileAudio/></span><div className="min-w-0 flex-1"><strong className="block truncate text-sm">{fileName}</strong><small className="text-slate-400">{durationSec>0?formatDuration(durationSec):'--:--'} · {formatSize(sizeBytes)}</small></div><button onClick={onClear}><X className="h-4 w-4 text-slate-400"/></button></div><div className="mt-4 flex items-center gap-3"><button onClick={onPlay} disabled={!canPlay} className="grid h-10 w-10 place-items-center rounded-full border border-white/10 disabled:opacity-35">{playing?<Pause className="h-4 w-4"/>:<Play className="h-4 w-4"/>}</button><div className="flex-1"><input type="range" min={0} max={Math.max(0,durationSec||0)} value={Math.min(currentSec||0,durationSec||0)} onChange={(e)=>onSeek(Number(e.target.value))} disabled={!canPlay||!(durationSec>0)} className="w-full accent-pink-500 disabled:opacity-40"/></div><small className="w-[52px] text-right text-slate-400">{formatDuration(currentSec||0)}</small></div></div>:<button onClick={onUpload} className="mt-4 grid min-h-36 w-full place-items-center rounded-2xl border border-dashed border-pink-500/40 bg-pink-500/[.03]"><span><Upload className="mx-auto h-7 w-7 text-pink-400"/><strong className="mt-2 block text-sm">Seleccionar archivo</strong><small className="text-slate-500">MP3, WAV, M4A o MP4</small></span></button>}<h3 className="mt-6 font-extrabold">2. Información de la canción <span className="text-xs font-normal text-slate-500">(opcional)</span></h3><div className="mt-3 grid gap-3 sm:grid-cols-2"><Field label="Título" value="Si te vuelves a enamorar"/><Field label="Artista" value="Ruben Vidal"/></div><div className="mt-3 max-w-[210px]"><Field label="Género" value="Balada"/></div></div>}
function LyricsStep({mode,setMode,lyricsText,setLyricsText,lyricsFileName,setLyricsFileName,showValidation}:any){const[analyzing,setAnalyzing]=useState(false);const file=useRef<HTMLInputElement>(null);const requiresLyrics=mode!=='auto';const isInvalid=Boolean(showValidation&&requiresLyrics&&!String(lyricsText||'').trim());const select=(id:string)=>{setMode(id);if(id==='auto'){setLyricsFileName('');setLyricsText('');setAnalyzing(true);window.setTimeout(()=>setAnalyzing(false),900)}};const onPickFile=async(e:any)=>{const f=e.target.files?.[0];if(!f)return;setLyricsFileName(f.name||'');const text=await f.text().catch(()=> '');setLyricsText(String(text||''));setMode('file')};return <div><input ref={file} type="file" accept=".lrc,.txt" className="hidden" onChange={onPickFile}/><h3 className="font-extrabold">2. Letra de la canción</h3><p className="mt-1 rounded-xl border border-white/10 bg-white/[.02] p-3 text-xs text-slate-400"><b className="text-pink-300">Youka activo:</b> puedes alinear letra si la proporcionas, o detectar automáticamente si eliges esa opción.</p><div className="mt-4 grid grid-cols-3 rounded-xl bg-white/[.04] p-1">{[['auto','Detectar automáticamente'],['paste','Pegar letra'],['file','Subir archivo']].map(([id,label])=><button key={id} onClick={()=>{select(id);if(id==='file')file.current?.click()}} className={`rounded-lg px-2 py-2.5 text-[10px] font-bold ${mode===id?'border border-pink-500 text-pink-200':'text-slate-400'}`}>{label}</button>)}</div>{lyricsFileName?<p className="mt-3 rounded-lg bg-white/5 p-2 text-xs text-slate-300">Archivo seleccionado: {lyricsFileName}</p>:null}{isInvalid?<p className="mt-3 rounded-lg border border-rose-500/20 bg-rose-500/10 p-2 text-xs text-rose-200">La letra es obligatoria si eliges “Pegar letra” o “Subir archivo”.</p>:null}<div className="mt-4 grid min-h-[280px] gap-4 rounded-2xl border border-white/10 bg-white/[.02] p-4 md:grid-cols-[1fr_180px]"><textarea placeholder={mode==='auto'?'Youka detectará la letra automáticamente...':'Pega aquí la letra completa (puedes usar .lrc con timestamps).'} value={mode==='auto'?'':String(lyricsText||'')} onChange={e=>setLyricsText(e.target.value)} disabled={mode==='auto'} className="min-h-52 resize-none bg-transparent text-xs leading-7 text-slate-300 outline-none disabled:opacity-40"/><div className="grid place-items-center rounded-xl bg-purple-900/30 p-4 text-center"><div>{mode==='auto'&&analyzing?<><span className="mx-auto block h-8 w-8 animate-spin rounded-full border-2 border-pink-500 border-t-transparent"/><strong className="mt-3 block">Preparando transcripción…</strong><small className="mt-2 block text-slate-400">se ejecuta al continuar</small></>:<><Sparkles className="mx-auto h-6 w-6 text-pink-400"/><strong className="mt-2 block">Tip</strong><small className="mt-2 block text-slate-400">Si tienes un archivo .lrc, súbelo para alinear mejor.</small></>}</div></div></div></div>}
function AudioSettings({removeVoice,setRemoveVoice,instrumentalVolume,setInstrumentalVolume,chorusVolume,setChorusVolume,pitch,setPitch,speed,setSpeed,canPlay,playing,durationSec,currentSec,onPlay,onSeek,fileName,youkaPhase,youkaProgress,youkaError,youkaQuote,removeVoiceReady,chorusAvailable}:any){const preparing=youkaPhase==='uploading'||youkaPhase==='quoting'||youkaPhase==='creating'||youkaPhase==='processing';const ready=youkaPhase==='ready';const failed=youkaPhase==='failed';const headline=ready?'Audio karaoke procesado':preparing?'Preparando audio karaoke…':'Vista previa del audio original. Preparando karaoke…';return <div><h3 className="font-extrabold">3. Configura el audio del karaoke</h3><p className="mt-1 text-xs text-slate-500">{headline}</p>{youkaQuote?<div className="mt-3 rounded-xl border border-white/10 bg-white/[.02] p-3 text-xs text-slate-300"><b className="text-pink-300">Costo Youka:</b> {youkaQuote.providerCredits} créditos (split {youkaQuote.breakdown?.split} + sync {youkaQuote.breakdown?.sync}) · Saldo {youkaQuote.availableBalance}</div>:null}{failed&&youkaError?<div className="mt-3 rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-200">{youkaError}</div>:null}{preparing?<div className="mt-3 rounded-xl border border-white/10 bg-white/[.02] p-3"><div className="flex items-center justify-between text-xs text-slate-300"><span>Progreso</span><b>{youkaProgress==null?'...':`${Math.round(Math.max(0,Math.min(1,youkaProgress))*100)}%`}</b></div><div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/10"><div className="h-full bg-pink-500 transition-all" style={{width:youkaProgress==null?'18%':`${Math.round(Math.max(0,Math.min(1,youkaProgress))*100)}%`}}/></div></div>:null}<div className="mt-4 grid gap-3 sm:grid-cols-2"><Choice active={removeVoice} onClick={()=>setRemoveVoice(true)} icon={Volume2} title="Eliminar voz principal" text={ready&&removeVoiceReady?'Instrumental real generado por Youka.':'Remueve la voz principal.'}/><Choice active={!removeVoice} onClick={()=>setRemoveVoice(false)} disabled={!chorusAvailable} icon={Mic2} title="Conservar coros" text={chorusAvailable?'Usa stems reales si están disponibles.':'No disponible con el modelo actual.'}/></div><Slider label="Volumen instrumental" value={`${instrumentalVolume}%`} valueNumber={instrumentalVolume} onChange={(e:any)=>setInstrumentalVolume(Number(e.target.value))}/><Slider label="Volumen de coros" value={`${chorusVolume}%`} valueNumber={chorusVolume} onChange={(e:any)=>setChorusVolume(Number(e.target.value))}/><Slider label="Tono" value={pitch>0?`+${pitch}`:String(pitch)} min={-12} max={12} valueNumber={pitch} onChange={(e:any)=>setPitch(Number(e.target.value))}/><Slider label="Velocidad" value={`${speed.toFixed(1)}×`} min={0.5} max={1.5} step={0.1} valueNumber={speed} onChange={(e:any)=>setSpeed(Number(e.target.value))}/><div className="mt-6 rounded-2xl border border-white/10 bg-white/[.025] p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><strong className="block truncate text-sm">{fileName||'Audio seleccionado'}</strong><small className="block text-[11px] text-slate-400">{canPlay&&durationSec>0?formatDuration(durationSec):'--:--'}</small></div>{!canPlay?<span className="rounded-full bg-white/5 px-3 py-1 text-[10px] font-bold text-slate-400">Selecciona un archivo en Paso 1</span>:null}</div><div className="mt-4 flex items-center gap-3"><button onClick={onPlay} disabled={!canPlay} className="grid h-10 w-10 place-items-center rounded-full border border-white/10 disabled:opacity-35">{playing?<Pause className="h-4 w-4"/>:<Play className="h-4 w-4"/>}</button><div className="flex-1"><input type="range" min={0} max={Math.max(0,durationSec||0)} value={Math.min(currentSec||0,durationSec||0)} onChange={(e)=>onSeek(Number(e.target.value))} disabled={!canPlay||!(durationSec>0)} className="w-full accent-pink-500 disabled:opacity-40"/></div><small className="w-[52px] text-right text-slate-400">{formatDuration(currentSec||0)}</small></div><div className="mt-3 h-7 w-full opacity-50 [background:repeating-linear-gradient(90deg,rgba(244,114,182,.75)_0_2px,transparent_2px_5px)]"/></div></div>}
function DesignStep({format,setFormat,preset,setPreset,fontSize,setFontSize,textColor,setTextColor,activeColor,setActiveColor,fontFamily,setFontFamily,position,setPosition,alignment,setAlignment,bgImageUrl,bgVideoUrl,bgColor,bgColorEnabled,bgDarken,setBgDarken,bgBlur,setBgBlur,bgBrightness,setBgBrightness,bgLoop,setBgLoop,bgError,setBgError,onSelectBgImage,onSelectBgVideo,onEnableBgColor,onClearBackground,bgImageInputRef,bgVideoInputRef}:any){const ratios:any={'16:9':'aspect-video','9:16':'aspect-[9/16]','1:1':'aspect-square'};const presets=['Clásico','Neon','Romántico','Noche','Rock','Elegante','Urbano'];const hasCustomVideo=Boolean(bgVideoUrl);const hasCustomImage=Boolean(bgImageUrl);const hasCustomColor=Boolean(bgColorEnabled);return <div><h3 className="font-extrabold">4. Diseña tu Video Karaoke</h3><p className="mt-1 text-xs text-slate-400">Todos los cambios se reflejan al instante en la vista previa.</p><h4 className="mt-5 text-xs font-black uppercase tracking-wider text-slate-400">Formato</h4><div className="mt-2 grid grid-cols-3 gap-2">{['16:9','9:16','1:1'].map(item=><button key={item} onClick={()=>setFormat(item)} className={`rounded-xl border p-3 text-center ${format===item?'border-pink-500 bg-pink-500/10':'border-white/10'}`}><span className={`mx-auto block border border-current ${item==='16:9'?'h-6 w-11':item==='9:16'?'h-9 w-5':'h-7 w-7'}`}/><strong className="mt-2 block text-xs">{item}</strong></button>)}</div><h4 className="mt-5 text-xs font-black uppercase tracking-wider text-slate-400">Estilos Luciana</h4><div className="mt-2 flex flex-wrap gap-2">{presets.map(item=><button key={item} onClick={()=>setPreset(item)} className={`rounded-full border px-3 py-2 text-xs font-bold ${preset===item?'border-pink-500 bg-pink-500/10 text-pink-300':'border-white/10 text-slate-400'}`}>{item}</button>)}</div><div className="mt-5 grid gap-4 md:grid-cols-[240px_1fr]"><div className="order-2 space-y-3 md:order-1"><h4 className="text-xs font-black uppercase tracking-wider text-slate-400">Fondo</h4><div className="grid gap-2"><button type="button" onClick={()=>{onClearBackground();setBgError('')}} className={`flex items-center justify-between rounded-xl border px-4 py-3 text-left text-xs font-bold ${!hasCustomVideo&&!hasCustomImage&&!hasCustomColor?'border-pink-500 bg-pink-500/10 text-pink-200':'border-white/10 text-slate-300'}`}><span>Fondos Luciana</span><span className="text-[10px] text-slate-500">{preset}</span></button><div className="rounded-xl border border-white/10 bg-white/[.02] p-3"><div className="flex items-center justify-between"><strong className="text-xs">Mi fondo</strong><button type="button" onClick={()=>{onClearBackground();setBgError('')}} className="text-[10px] font-bold text-slate-400">Limpiar</button></div><div className="mt-2 grid gap-2"><input ref={bgImageInputRef} type="file" accept="image/*" className="hidden" onChange={e=>{const f=e.target.files?.[0];if(!f)return;try{onSelectBgImage(f)}catch{setBgError('No pude cargar esa imagen.')}}} /><input ref={bgVideoInputRef} type="file" accept="video/*" className="hidden" onChange={e=>{const f=e.target.files?.[0];if(!f)return;try{onSelectBgVideo(f)}catch{setBgError('No pude cargar ese video.')}}} /><div className="grid gap-2 sm:grid-cols-2"><button type="button" onClick={()=>bgImageInputRef.current?.click()} className="h-10 rounded-xl border border-white/10 bg-white/5 text-xs font-extrabold">Subir imagen</button><button type="button" onClick={()=>bgVideoInputRef.current?.click()} className="h-10 rounded-xl border border-white/10 bg-white/5 text-xs font-extrabold">Subir video</button></div><small className="text-[11px] text-slate-500">{hasCustomVideo?'Video local seleccionado':hasCustomImage?'Imagen local seleccionada':'Sin archivo seleccionado'}</small></div>{bgError?<p className="mt-2 rounded-lg border border-rose-500/20 bg-rose-500/10 p-2 text-[11px] text-rose-200">{bgError}</p>:null}</div><div className="rounded-xl border border-white/10 bg-white/[.02] p-3"><div className="flex items-center justify-between"><strong className="text-xs">Color de fondo</strong><button type="button" onClick={()=>{onClearBackground();setBgError('')}} className="text-[10px] font-bold text-slate-400">Desactivar</button></div><div className="mt-2 flex items-center justify-between gap-3"><input type="color" value={bgColor} onChange={e=>onEnableBgColor(e.target.value)} className="h-10 w-14 rounded-xl border border-white/10 bg-transparent"/><button type="button" onClick={()=>onEnableBgColor(bgColor)} className={`h-10 flex-1 rounded-xl border text-xs font-extrabold ${hasCustomColor?'border-pink-500 bg-pink-500/10 text-pink-200':'border-white/10 bg-white/5 text-slate-200'}`}>Usar color sólido</button></div></div></div><h4 className="mt-4 text-xs font-black uppercase tracking-wider text-slate-400">Ajustes del fondo</h4><label className="mt-2 block"><span className="flex justify-between text-xs"><span>Oscurecer fondo</span><b>{bgDarken}%</b></span><input type="range" min={0} max={80} value={bgDarken} onChange={(e)=>setBgDarken(Number(e.target.value))} className="mt-3 w-full accent-pink-500"/></label><label className="mt-2 block"><span className="flex justify-between text-xs"><span>Desenfoque</span><b>{bgBlur}px</b></span><input type="range" min={0} max={14} value={bgBlur} onChange={(e)=>setBgBlur(Number(e.target.value))} className="mt-3 w-full accent-pink-500"/></label><label className="mt-2 block"><span className="flex justify-between text-xs"><span>Brillo</span><b>{bgBrightness}%</b></span><input type="range" min={70} max={140} value={bgBrightness} onChange={(e)=>setBgBrightness(Number(e.target.value))} className="mt-3 w-full accent-pink-500"/></label>{hasCustomVideo?<button type="button" onClick={()=>setBgLoop(!bgLoop)} className={`mt-2 flex w-full items-center justify-between rounded-xl border px-4 py-3 text-xs font-bold ${bgLoop?'border-pink-500 bg-pink-500/10 text-pink-200':'border-white/10 bg-white/[.02] text-slate-300'}`}><span>Repetir video</span><span className={`h-5 w-9 rounded-full p-0.5 ${bgLoop?'bg-pink-500':'bg-white/10'}`}><span className={`block h-4 w-4 rounded-full bg-white transition-transform ${bgLoop?'translate-x-4':''}`}/></span></button>:null}<h4 className="mt-4 text-xs font-black uppercase tracking-wider text-slate-400">Texto</h4><label className="block text-[11px] text-slate-400">Fuente<select value={fontFamily} onChange={e=>setFontFamily(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-[#0b0d18] px-3 text-xs text-white"><option>Montserrat</option><option>Poppins</option><option>Inter</option></select></label><Slider label="Tamaño" value={`${fontSize}px`} valueNumber={fontSize} onChange={(e:any)=>setFontSize(Number(e.target.value))}/><Color label="Color de letra" value={textColor} onChange={setTextColor}/><Color label="Palabra activa" value={activeColor} onChange={setActiveColor}/><SelectField label="Posición" value={position} options={['Superior','Centro','Centro inferior']} onChange={setPosition}/><SelectField label="Alineación" value={alignment} options={['Izquierda','Centrada','Derecha']} onChange={setAlignment}/></div><div className="order-1 md:order-2"><Preview formatClass={ratios[format]} fontSize={fontSize} textColor={textColor} activeColor={activeColor} preset={preset} fontFamily={fontFamily} position={position} alignment={alignment} bgImageUrl={bgImageUrl} bgVideoUrl={bgVideoUrl} bgColor={bgColor} bgColorEnabled={bgColorEnabled} bgDarken={bgDarken} bgBlur={bgBlur} bgBrightness={bgBrightness} bgLoop={bgLoop} onBgError={()=>setBgError('Tu navegador no pudo reproducir ese archivo como fondo. Prueba otro formato.')}/></div></div></div>}
function ExportStep({fileName,format,preset,instrumentalVolume,chorusVolume,previewProps}:any){return <div><h3 className="font-extrabold">5. Exporta tu Video Karaoke</h3><div className="mt-4 grid gap-4 md:grid-cols-[190px_1fr]"><div className="space-y-3"><Field label="Resolución" value="1080p"/><Summary label="Canción" value={fileName}/><Summary label="Duración" value="03:58"/><Summary label="Formato" value={format}/><Summary label="Diseño" value={preset}/><Summary label="Audio" value={`Instrumental ${instrumentalVolume}% · Coros ${chorusVolume}%`}/></div><Preview {...(previewProps||{})}/></div><div className="mt-5 rounded-xl border border-white/10 bg-white/[.025] p-4"><small className="text-slate-400">Costo estimado</small><strong className="block text-xl">-- créditos</strong><p className="mt-1 text-xs text-slate-500">El costo final se calculará antes de generar el video.</p></div></div>}
function Preview({formatClass='aspect-video',fontSize=18,textColor='#ffffff',activeColor='#ff2f92',preset='Neon',fontFamily='Montserrat',position='Centro inferior',alignment='Centrada',bgImageUrl='',bgVideoUrl='',bgColor='#070914',bgColorEnabled=false,bgDarken=35,bgBlur=0,bgBrightness=105,bgLoop=true,onBgError}:any){const presetStyle=getPresetStyle(preset);const vertical=position==='Superior'?'top-10':position==='Centro'?'top-1/2 -translate-y-1/2':'bottom-8';const horizontal=alignment==='Izquierda'?'text-left':alignment==='Derecha'?'text-right':'text-center';const hasVideo=Boolean(bgVideoUrl);const hasImage=!hasVideo&&Boolean(bgImageUrl);const hasColor=!hasVideo&&!hasImage&&Boolean(bgColorEnabled);const filter=`blur(${Math.max(0,Number(bgBlur)||0)}px) brightness(${Math.max(.3,(Number(bgBrightness)||100)/100)})`;const scale=Math.max(1,1+(Math.max(0,Number(bgBlur)||0)/40));const darkenAlpha=Math.max(0,Math.min(0.85,(Number(bgDarken)||0)/100));const titleGlow=presetStyle.glow?`0 0 18px ${activeColor}55,0 0 42px ${activeColor}25`:'0 10px 32px rgba(0,0,0,.55)';const activeGlow=presetStyle.glow?`0 0 16px ${activeColor}66`:'none';const activeBg=presetStyle.activeBg||'transparent';const activeBorder=presetStyle.activeBorder||'transparent';return <div className={`mx-auto mt-5 w-full max-w-lg overflow-hidden rounded-2xl border border-white/10 bg-black ${formatClass}`}><div className="relative h-full min-h-48"><div className="absolute inset-0 overflow-hidden"><div className="absolute inset-0" style={{background:presetStyle.background}}/>{hasColor?<div className="absolute inset-0" style={{background:bgColor}}/>:null}{hasImage?<img src={bgImageUrl} alt="Fondo" className="absolute inset-0 h-full w-full object-cover" style={{filter,transform:`scale(${scale})`}} onError={()=>{if(typeof onBgError==='function')onBgError()}}/>:null}{hasVideo?<video src={bgVideoUrl} className="absolute inset-0 h-full w-full object-cover" autoPlay muted playsInline loop={Boolean(bgLoop)} style={{filter,transform:`scale(${scale})`}} onError={()=>{if(typeof onBgError==='function')onBgError()}}/>:null}{!hasVideo&&!hasImage&&!hasColor?<div className="absolute inset-0" style={{background:presetStyle.overlay,opacity:.9}}/>:null}<div className="absolute inset-0" style={{background:'radial-gradient(circle at 50% 0%,rgba(255,255,255,.12) 0%,transparent 50%)',opacity:.35}}/><div className="absolute inset-0" style={{background:`rgba(0,0,0,${darkenAlpha})`}}/></div><span className="absolute left-3 top-3 rounded-full px-2 py-1 text-[9px] font-black text-white" style={{background:presetStyle.badge}}>{preset}</span><div className={`absolute inset-x-4 ${vertical} ${horizontal} font-black leading-tight`} style={{fontSize,color:textColor,fontFamily,letterSpacing:presetStyle.letterSpacing,textShadow:titleGlow}}><span style={{color:activeColor,textShadow:activeGlow,background:activeBg,border:`1px solid ${activeBorder}`,padding:'0.14em 0.28em',borderRadius:'0.55em',boxDecorationBreak:'clone',WebkitBoxDecorationBreak:'clone'}}>Si te vuelves</span> a enamorar<br/>No te enamores de mí</div><div className="absolute inset-x-0 bottom-0 h-1 bg-white/10"><div className="h-full w-2/5 bg-pink-500"/></div></div></div>}
function KaraokeResult({onAgain}:any){return <div className="h-full overflow-y-auto bg-[#050611] p-5 text-white md:p-10"><div className="mx-auto max-w-4xl rounded-[28px] border border-white/10 bg-[#080a15] p-5 text-center md:p-8"><span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-emerald-500/10 text-emerald-400"><Check className="h-8 w-8"/></span><h1 className="mt-5 text-3xl font-black">Tu Video Karaoke está listo</h1><p className="mt-2 text-sm text-slate-400">Vista previa del resultado que recibirás cuando activemos la generación.</p><div className="mx-auto mt-7 max-w-2xl"><Preview/></div><p className="mt-6 rounded-xl border border-white/10 bg-white/[.025] p-4 text-xs text-slate-400">Cuando activemos la generación, tu video estará disponible temporalmente para descargar.</p><div className="mt-5 grid gap-3 sm:grid-cols-3"><button disabled className="h-12 rounded-xl bg-white/5 text-sm font-bold text-slate-500">Descargar MP4</button><button onClick={onAgain} className="h-12 rounded-xl bg-gradient-to-r from-fuchsia-600 to-pink-600 text-sm font-black">Crear otro karaoke</button><button className="h-12 rounded-xl border border-white/10 text-sm font-bold">Volver a Biblioteca</button></div></div></div>}
function Summary({label,value}:any){return <div className="rounded-lg border border-white/10 bg-white/[.025] p-3"><small className="block text-slate-500">{label}</small><strong className="mt-1 block truncate text-xs">{value}</strong></div>}
function Color({label,value,onChange}:any){return <label className="flex items-center justify-between text-[11px] text-slate-400"><span>{label}</span><input type="color" value={value} onChange={e=>onChange(e.target.value)} className="h-9 w-12 rounded border border-white/10 bg-transparent"/></label>}
function SelectField({label,value,options,onChange}:any){return <label className="block text-[11px] text-slate-400">{label}<select value={value} onChange={e=>onChange(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-[#0b0d18] px-3 text-xs text-white">{options.map((option:string)=><option key={option}>{option}</option>)}</select></label>}
function Field({label,value}:any){return <label className="block text-[11px] text-slate-400">{label}<input defaultValue={value} className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-black/20 px-3 text-xs font-semibold text-white outline-none focus:border-pink-500"/></label>}
function Choice({active=false,disabled=false,onClick,icon:Icon,title,text}:any){return <button disabled={disabled} onClick={()=>{if(disabled)return;onClick?.()}} className={`flex gap-3 rounded-xl border p-4 text-left disabled:opacity-50 ${active?'border-pink-500 bg-pink-500/[.06]':'border-white/10 bg-white/[.025]'}`}><span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${active?'bg-pink-500':'bg-white/5 text-slate-400'}`}>{active?<Check className="h-4 w-4"/>:<Icon className="h-4 w-4"/>}</span><span><strong className="block text-sm">{title}</strong><small className="text-slate-400">{text}</small></span></button>}
function Slider({label,value,defaultValue,valueNumber,onChange,min=0,max=100,step=1}:any){return <label className="mt-6 block"><span className="flex justify-between text-xs"><span>{label}</span><b>{value}</b></span><input type="range" min={min} max={max} step={step} {...(valueNumber===undefined?{defaultValue}:{value:valueNumber})} onChange={onChange} className="mt-3 w-full accent-pink-500"/></label>}
function Toggle({label}:any){const[on,setOn]=useState(false);return <button onClick={()=>setOn(!on)} className="flex w-full items-center justify-between text-xs text-slate-300"><span>{label}</span><span className={`h-5 w-9 rounded-full p-0.5 ${on?'bg-pink-500':'bg-white/10'}`}><span className={`block h-4 w-4 rounded-full bg-white transition-transform ${on?'translate-x-4':''}`}/></span></button>}
