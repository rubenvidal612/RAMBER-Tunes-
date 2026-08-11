import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, ArrowRight, Library as Books, BadgeCheck as Certificate,
  MessageCircle as ChatCircle, Check, Coins, Download as DownloadSimple,
  FileText, Film as FilmStrip, Folder, FolderOpen, Home as House, Info, List,
  WandSparkles as MagicWand, Mic as Microphone, Music2 as MusicNote, Pause,
  Pencil as PencilSimple, Play, ListMusic as Playlist, CircleHelp as Question,
  Scissors, Share2 as ShareNetwork, SlidersHorizontal, Sparkles as Sparkle,
  Languages as Translate, Upload as UploadSimple, User, Users, Bell,
  AudioWaveform as Waveform, Image as ImageIcon, Trash2 as Trash, X, Loader2,
} from "lucide-react";
import { createPortal } from "react-dom";
import approvedBaseCss from "./approved-create/styles.css?raw";
import approvedMenuCss from "./approved-create/menu-fix.css?raw";
import approvedCreditCss from "./approved-create/credit-fix.css?raw";
import approvedDesignCss from "./approved-create/design-v2.css?raw";
import approvedPlayerCss from "./approved-create/player-options.css?raw";
import { ensureAnonSession, getAccessToken } from "./lib/supabaseBrowser";

const pendingListKey = 'ramber.pendingSunoTasks_v1';
const pendingLegacyKey = 'ramber.pendingSunoTask';
const generationSessionKey = 'ramber.createGenerationSession_v1';
const mp3ConverterUrl = 'https://online-audio-converter.com/sp/';

function readPendingTasks() {
  try {
    const raw = window.localStorage.getItem(pendingListKey);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function readGenerationSession() {
  try {
    const raw = window.localStorage.getItem(generationSessionKey);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function writeGenerationSession(session) {
  try {
    if (!session) {
      window.localStorage.removeItem(generationSessionKey);
      return;
    }
    window.localStorage.setItem(generationSessionKey, JSON.stringify(session));
  } catch {}
}

function clearGenerationSession() {
  writeGenerationSession(null);
}

function openMp3Converter() {
  try {
    window.open(mp3ConverterUrl, '_blank', 'noopener,noreferrer');
  } catch {}
}

function detectPromptLanguage(text) {
  const value = (text || '').toString().trim().toLowerCase();
  if (!value) return 'es';
  const spanishHints = [
    ' el ', ' la ', ' los ', ' las ', ' de ', ' del ', ' para ', ' con ', ' sin ', ' una ', ' un ',
    ' que ', ' y ', ' en ', ' por ', ' como ', ' canción', ' cancion', ' voz ', ' ritmo', ' piano',
    ' románt', ' romant', ' suave', ' femenina', ' masculino', ' mujer', ' hombre',
  ];
  const englishHints = [
    ' the ', ' and ', ' with ', ' without ', ' for ', ' from ', ' into ', ' song', ' voice ',
    ' female', ' male', ' piano', ' soft', ' cinematic', ' dreamy', ' chorus', ' verse',
    ' bridge', ' mood', ' atmosphere', ' instrumental',
  ];
  let esScore = /[áéíóúñ¿¡]/.test(value) ? 2 : 0;
  let enScore = 0;
  for (const hint of spanishHints) if (` ${value} `.includes(hint)) esScore += 1;
  for (const hint of englishHints) if (` ${value} `.includes(hint)) enScore += 1;
  return enScore > esScore ? 'en' : 'es';
}

function getGenerationStage(session, pendingItem) {
  if (session?.failedAt) return 'failed';
  const readyCount = Number(session?.readyTrackCount || 0);
  if (session?.completedAt || readyCount >= 2) return 'ready';
  const providerStatus = String(pendingItem?.providerStatus || session?.providerStatus || '').toUpperCase();
  if (providerStatus === 'SUCCESS') return 'processing';
  if (providerStatus === 'FIRST_SUCCESS' || providerStatus === 'TEXT_SUCCESS' || providerStatus === 'GENERATING') return 'generating';
  return 'preparing';
}

function getStageItems(stage) {
  const order = ['preparing', 'generating', 'processing', 'ready'];
  const labels = {
    preparing: 'Preparando',
    generating: 'Generando',
    processing: 'Procesando',
    ready: 'Lista',
  };
  const activeIndex = Math.max(0, order.indexOf(stage));
  return order.map((key, index) => ({
    key,
    label: labels[key],
    state: stage === 'failed' ? (index === 0 ? 'active' : 'pending') : index < activeIndex ? 'complete' : index === activeIndex ? 'active' : 'pending',
  }));
}

function normalizeLyricsTags(t) {
  const lines = (t || '').toString().replaceAll('\r\n', '\n').split('\n');
  const mapped = lines.map((line) => {
    const s = line.trim();
    if (!s) return '';
    const paren = /^\(([^)]+)\)\s*$/.exec(s) || /^\(([^)]+)\)\s*:\s*$/.exec(s);
    if (paren && paren[1]) {
      const inner = paren[1].toString().trim().replaceAll(':', '').trim();
      const innerLower = inner.toLowerCase();
      const innerIsTag =
        innerLower === 'coro' || innerLower.startsWith('coro ') ||
        innerLower === 'chorus' || innerLower.startsWith('chorus ') ||
        innerLower.startsWith('verso') || innerLower.startsWith('verse') ||
        innerLower.startsWith('pre-coro') || innerLower.startsWith('pre coro') ||
        innerLower.startsWith('bridge') || innerLower.startsWith('puente') ||
        innerLower.startsWith('outro') || innerLower.startsWith('intro');
      if (innerIsTag || inner.length < 30) return `[${inner}]`;
    }
    const lower = s.toLowerCase();
    const isTag =
      lower === 'coro' || lower.startsWith('coro ') ||
      lower === 'chorus' || lower.startsWith('chorus ') ||
      lower.startsWith('verso') || lower.startsWith('verse') ||
      lower.startsWith('pre-coro') || lower.startsWith('pre coro') ||
      lower.startsWith('bridge') || lower.startsWith('puente') ||
      lower.startsWith('outro') || lower.startsWith('intro');
    if (isTag && !s.startsWith('[')) return `[${s.replaceAll(':', '').trim()}]`;
    if (s.startsWith('[') && s.endsWith(']')) return s;
    if (s.endsWith(':') && s.length < 20) return `[${s.slice(0, -1).trim()}]`;
    return line;
  });
  return mapped.join('\n').replaceAll(/\n{3,}/g, '\n\n').trim();
}

function stripTitleFromLyrics(title, lyrics) {
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

function toUserFriendlySunoError(out, fallback) {
  const raw = (out?.detail || out?.error || out?.message || fallback || '').toString().trim();
  const lower = raw.toLowerCase();
  const looksLikeVoiceExpired =
    lower.includes('voice has expired') ||
    (lower.includes('voice') && lower.includes('expired')) ||
    (lower.includes('persona') && lower.includes('expired'));
  const looksLikeCopyright =
    lower.includes('copyright') || lower.includes('copyrighted') ||
    lower.includes('dmca') || lower.includes('rights') || lower.includes('infring');
  const looksLikeTemporaryProviderIssue =
    lower.includes('internal error') || lower.includes('try again later') ||
    lower.includes('please try again later') || lower.includes('temporarily') ||
    lower.includes('rate limit');
  if (looksLikeVoiceExpired) {
    return 'La voz seleccionada expiró.\n\nSolución: abre “Clonador” y selecciona otra voz (o vuelve a crearla).';
  }
  if (looksLikeCopyright) {
    return 'Error por Copyright.\n\nEse audio parece ser de una canción protegida. Sube un audio original o usa otro audio.';
  }
  if (looksLikeTemporaryProviderIssue) {
    return 'Ahorita el servidor que crea la música está fallando o saturado.\n\nSolución: inténtalo otra vez en 1–2 minutos. Si sigue igual, cambia un poco el texto o prueba con otro modelo.';
  }
  return raw || fallback;
}

function makeAudioCoverSvgUrl(seed) {
  const s = (seed || 'audio').toString().slice(0, 80);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  const hue1 = h % 360;
  const hue2 = (hue1 + 50) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue1} 80% 55%)"/><stop offset="1" stop-color="hsl(${hue2} 80% 45%)"/></linearGradient></defs><rect width="512" height="512" rx="48" fill="url(#g)"/><rect x="0" y="0" width="512" height="512" rx="48" fill="rgba(0,0,0,0.25)"/><g fill="rgba(255,255,255,0.95)"><path d="M214 174c0-10 8-18 18-18h48c10 0 18 8 18 18v140c0 29-24 52-52 52s-52-23-52-52 24-52 52-52c12 0 23 4 32 10V174h-44v0z"/></g><text x="36" y="470" font-family="system-ui, -apple-system, Segoe UI, Roboto, Arial" font-size="44" font-weight="800" fill="rgba(255,255,255,0.9)">RAMBER</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const steps = ["Inicio", "Letra", "Estilo", "Revisar"];
const formatTime = (seconds) => {
  const safeSeconds = Math.max(0, Math.round(Number(seconds) || 0));
  return `${Math.floor(safeSeconds / 60)}:${String(safeSeconds % 60).padStart(2, "0")}`;
};
const models = [
  ["SUNO V4", "Voces mejoradas"],
  ["SUNO V4.5", "Prompts inteligentes"],
  ["SUNO V4.5 Plus", "Tonos más ricos"],
  ["SUNO V4.5 All", "Mejor estructura"],
  ["SUNO V5", "Última generación"],
  ["SUNO V5.5", "Clonación de Voz"],
];

const navItems = [
  [House, "Inicio"],
  [MusicNote, "Landing"],
  [Users, "Clonador de Voz"],
  [Sparkle, "Crear"],
  [Waveform, "Masterizar"],
  [Books, "Mis Canciones"],
  [Coins, "Comprar créditos"],
  [User, "Perfil"],
  [Coins, "Vendedor"],
];

function InfoTip({ title, children }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="tip-wrap">
      <button className="icon-button info-button" aria-label={`Ayuda: ${title}`} onClick={() => setOpen(!open)}>
        <Info size={19} weight="bold" />
      </button>
      {open && (
        <span className="tooltip" role="status">
          <strong>{title}</strong>
          <span>{children}</span>
        </span>
      )}
    </span>
  );
}

function RangeSetting({ label, help, value, onChange }) {
  const notRecommended = value >= 87;
  return (
    <div className={notRecommended ? "range-setting warning-range" : "range-setting"}>
      <div className="range-heading">
        <div>
          <span className="range-label">{label}</span>
          <InfoTip title={label}>{help}</InfoTip>
          <p>{help}</p>
        </div>
        <output><span>{value}%</span>{notRecommended && <small>No recomendable</small>}</output>
      </div>
      <input aria-label={label} type="range" min="0" max="100" value={value} onInput={(e) => onChange(Number(e.currentTarget.value))} onChange={(e) => onChange(Number(e.currentTarget.value))} />
    </div>
  );
}

function Sidebar({ activePage, onNavigate, mobileOpen, onClose }) {
  const navigate = (page) => { onNavigate(page); onClose(); };
  return (
    <aside className={mobileOpen ? "sidebar mobile-open" : "sidebar"}>
      <div className="mobile-menu-heading"><strong>Menú principal</strong><button onClick={onClose} aria-label="Cerrar menú"><X size={22}/></button></div>
      <p className="side-label">MENÚ</p>
      <nav>
        {navItems.map(([Icon, label]) => (
          <button key={label} onClick={()=>navigate(label)} className={label === activePage ? "nav-item active" : "nav-item"}>
            <Icon size={23} weight={label === activePage ? "fill" : "regular"} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      <p className="side-label assistant-label">ASISTENTE</p>
      <button onClick={()=>navigate("LucIAna Bot")} className={activePage === "LucIAna Bot" ? "nav-item active" : "nav-item"}><MagicWand size={23} /><span>LucIAna Bot</span></button>
      <button onClick={()=>navigate("Centro de ayuda")} className={activePage === "Centro de ayuda" ? "nav-item active" : "nav-item"}><Question size={23} /><span>Centro de ayuda</span></button>
    </aside>
  );
}

function Header({ onMenu, onCredits }) {
  return (
    <header className="header">
      <img className="brand-mark" src="/assets/luciana-music-logo.jpeg" alt="Logo de LucIAna Music" />
      <strong className="brand">Luc<span>IA</span>na | Music</strong>
      <div className="header-actions">
        <button className="credits" onClick={onCredits}><Coins size={22} weight="fill" /><span><small>Comprar créditos</small>2,292.4</span></button>
        <button className="menu-button" onClick={onMenu} aria-label="Abrir menú"><List size={28} /></button>
      </div>
    </header>
  );
}

function Stepper({ step, onStep }) {
  return (
    <div className="stepper">
      {steps.map((name, index) => (
        <button key={name} onClick={() => onStep(index)} className={`step ${index === step ? "current" : ""} ${index < step ? "done" : ""}`}>
          <span className="step-circle">{index < step ? <Check size={19} weight="bold" /> : index + 1}</span>
          <span>{name}</span>
        </button>
      ))}
    </div>
  );
}

function VoiceMeter({ onFinished }) {
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const audioContextRef = useRef(null);
  const animationRef = useRef(null);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState("");

  const stopListening = () => {
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    audioContextRef.current?.close();
    streamRef.current = null;
    audioContextRef.current = null;
    setListening(false);
  };

  useEffect(() => () => stopListening(), []);

  const startListening = async () => {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const context = new AudioContextClass();
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.78;
      context.createMediaStreamSource(stream).connect(analyser);
      streamRef.current = stream;
      audioContextRef.current = context;
      setListening(true);

      const data = new Uint8Array(analyser.frequencyBinCount);
      const draw = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        const width = canvas.width;
        const height = canvas.height;
        analyser.getByteFrequencyData(data);
        ctx.clearRect(0, 0, width, height);
        const gradient = ctx.createLinearGradient(0, 0, width, 0);
        gradient.addColorStop(0, "#21c9a7");
        gradient.addColorStop(1, "#a764ed");
        ctx.fillStyle = gradient;
        const bars = 36;
        const gap = 4;
        const barWidth = (width - gap * (bars - 1)) / bars;
        for (let index = 0; index < bars; index += 1) {
          const value = data[Math.floor((index / bars) * data.length)] / 255;
          const barHeight = Math.max(5, value * (height - 8));
          ctx.beginPath();
          ctx.roundRect(index * (barWidth + gap), (height - barHeight) / 2, barWidth, barHeight, 4);
          ctx.fill();
        }
        animationRef.current = requestAnimationFrame(draw);
      };
      draw();
    } catch {
      setError("Permite el acceso al micrófono para que la barra pueda detectar tu voz.");
    }
  };

  const finish = () => {
    stopListening();
    onFinished();
  };

  return <div className="voice-meter"><div className={`voice-meter-display ${listening ? "active" : ""}`}><canvas ref={canvasRef} width="620" height="82" aria-label="Medidor de intensidad de voz"/><span>{listening ? "Escuchando tu voz…" : "El medidor comenzará cuando actives el micrófono"}</span></div>{error && <small className="voice-meter-error">{error}</small>}{!listening ? <button className="wizard-next phrase-finish" onClick={startListening}><Microphone size={19}/> Comenzar a cantar</button> : <button className="wizard-next phrase-finish recording" onClick={finish}><Check size={19} weight="bold"/> Terminé de cantar</button>}</div>;
}

function CloneVoiceWizard({ onClose, onComplete, setToast }) {
  const [wizardStep, setWizardStep] = useState(0);
  const [profile, setProfile] = useState({ name: "", description: "", style: "Pop", level: "beginner", sourceAudio: null, verifyAudio: null, audioDuration: 420, start: 0, end: 10 });
  const [countdown, setCountdown] = useState(10);
  const [timerRunning, setTimerRunning] = useState(true);
  const wizardSteps = ["Perfil", "Audio original", "Frase", "Verificación", "Listo"];
  const sourceReady = Boolean(profile.sourceAudio);
  const verificationReady = Boolean(profile.verifyAudio);
  useEffect(() => {
    if (wizardStep !== 2 || !timerRunning || countdown <= 0) return undefined;
    const timer = window.setInterval(() => setCountdown((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [wizardStep, timerRunning, countdown]);
  const repeatPhrase = () => { setCountdown(10); setTimerRunning(true); };
  const sampleFile = (type) => {
    const sample = { name: type === "source" ? "voz-original-prueba.mp3" : "frase-verificacion-prueba.mp3" };
    setProfile({ ...profile, [type === "source" ? "sourceAudio" : "verifyAudio"]: sample, ...(type === "source" ? { audioDuration: 420, start: 0, end: 10 } : {}) });
    setToast("Archivo de prueba agregado solo al prototipo local.");
  };
  const acceptMp3 = (file, field) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".mp3")) {
      setToast("Ese archivo no es MP3. Usa el convertidor gratuito.");
      return;
    }
    if (field !== "sourceAudio") {
      setProfile((current) => ({ ...current, [field]: file }));
      return;
    }
    const audio = new Audio(URL.createObjectURL(file));
    audio.addEventListener("loadedmetadata", () => {
      const duration = Math.max(1, Math.floor(audio.duration));
      setProfile((current) => ({ ...current, sourceAudio: file, audioDuration: duration, start: 0, end: Math.min(10, duration) }));
      URL.revokeObjectURL(audio.src);
    }, { once: true });
    audio.addEventListener("error", () => {
      setProfile((current) => ({ ...current, sourceAudio: file, audioDuration: 420, start: 0, end: 10 }));
      URL.revokeObjectURL(audio.src);
    }, { once: true });
  };

  return (
    <div className="wizard-overlay" role="dialog" aria-modal="true" aria-label="Crear perfil de voz">
      <div className="voice-wizard">
        <div className="wizard-header"><div><span className="eyebrow">SUNO V5.5 · CLONACIÓN DE VOZ</span><h2>Crear perfil de voz</h2></div><button className="wizard-close" aria-label="Cerrar creación de perfil" onClick={onClose}><X size={23} /></button></div>
        <div className="wizard-progress">{wizardSteps.map((label,index)=><div key={label} className={index === wizardStep ? "active" : index < wizardStep ? "done" : ""}><span>{index < wizardStep ? <Check size={14} weight="bold" /> : index + 1}</span><small>{label}</small></div>)}</div>
        <div className="wizard-body">
          {wizardStep === 0 && <div className="wizard-section"><h3>Datos del perfil</h3><p>Estos datos te ayudarán a reconocer y reutilizar esta voz.</p><label>Nombre de la voz<input value={profile.name} onChange={(e)=>setProfile({...profile,name:e.target.value})} placeholder="Ejemplo: Mi voz principal" /></label><label>Descripción<input value={profile.description} onChange={(e)=>setProfile({...profile,description:e.target.value})} placeholder="Ejemplo: Voz cálida para baladas" /></label><div className="wizard-fields"><label>Estilo vocal<select value={profile.style} onChange={(e)=>setProfile({...profile,style:e.target.value})}><option>Pop</option><option>Balada</option><option>Regional</option><option>Rock</option><option>Otro</option></select></label><label>Nivel del cantante<select value={profile.level} onChange={(e)=>setProfile({...profile,level:e.target.value})}><option value="beginner">Principiante</option><option value="intermediate">Intermedio</option><option value="advanced">Avanzado</option><option value="professional">Profesional</option></select></label></div><div className="wizard-info"><Info size={19}/><span>Después subirás dos audios distintos: uno para crear la voz y otro para verificarla.</span></div></div>}
          {wizardStep === 1 && <div className="wizard-section"><h3>Sube el audio original de tu voz</h3><p>Este es el audio que Suno utilizará para crear el perfil. Busca una parte con voz clara y poco ruido.</p><label className="wizard-upload"><UploadSimple size={35}/><strong>{profile.sourceAudio?.name || "Subir audio para entrenar la voz"}</strong><small>Solo archivos MP3</small><input type="file" accept="audio/mpeg,.mp3" onChange={(e)=>acceptMp3(e.target.files[0],"sourceAudio")}/></label><div className="sample-actions"><button onClick={()=>sampleFile("source")}><FolderOpen size={18}/> Usar audio de prueba</button><a href={mp3ConverterUrl} target="_blank" rel="noopener noreferrer"><Waveform size={18}/> Convertir a MP3</a></div>{sourceReady && <div className="segment-box"><div><strong>Selecciona el fragmento vocal</strong><InfoTip title="¿Qué fragmento elegir?">La línea representa todo el audio. Mueve los controles para seleccionar una parte donde la voz se escuche claramente.</InfoTip></div><div className="timeline-summary"><span>Inicio <strong>{formatTime(profile.start)}</strong></span><span>Fragmento seleccionado: <strong>{formatTime(profile.end-profile.start)}</strong></span><span>Final <strong>{formatTime(profile.end)}</strong></span></div><div className="dual-timeline" style={{"--timeline-start":`${(profile.start/profile.audioDuration)*100}%`,"--timeline-end":`${(profile.end/profile.audioDuration)*100}%`}}><div className="timeline-track"/><input aria-label="Inicio del fragmento" type="range" min="0" max={Math.max(0,profile.audioDuration-1)} value={profile.start} onInput={(e)=>setProfile({...profile,start:Math.min(Number(e.currentTarget.value),profile.end-1)})}/><input aria-label="Final del fragmento" type="range" min="1" max={profile.audioDuration} value={profile.end} onInput={(e)=>setProfile({...profile,end:Math.max(Number(e.currentTarget.value),profile.start+1)})}/></div><div className="timeline-scale"><span>0:00</span><span>Audio completo</span><Waveform size={20}/><span>{formatTime(profile.audioDuration)}</span></div></div>}</div>}
          {wizardStep === 2 && <div className="wizard-section phrase-section"><h3>Frase de verificación</h3><p>Suno genera esta frase después de analizar el audio original. El cliente debe cantarla exactamente como aparece.</p><div className="phrase-card"><Microphone size={32}/><blockquote>“Las melodías llenan el aire mientras mi corazón canta con alegría esta noche.”</blockquote></div><div className="wizard-info"><Info size={19}/><span>Puedes cantar la frase las veces que necesites. Canta de forma continua y evita dejar silencios largos entre cada repetición.</span></div><VoiceMeter onFinished={()=>setWizardStep(3)}/><small className="phrase-help">La barra se moverá con tu voz. Cuando termines, pasarás a subir el audio de verificación.</small></div>}
          {wizardStep === 3 && <div className="wizard-section"><h3>Sube la frase cantada</h3><p>Este segundo audio confirma la identidad de la voz. No es el mismo archivo utilizado para entrenarla.</p><label className="wizard-upload verify"><Microphone size={35}/><strong>{profile.verifyAudio?.name || "Subir audio de verificación"}</strong><small>La frase exacta, cantada y en formato MP3</small><input type="file" accept="audio/mpeg,.mp3" onChange={(e)=>acceptMp3(e.target.files[0],"verifyAudio")}/></label><div className="sample-actions"><button onClick={()=>sampleFile("verify")}><FolderOpen size={18}/> Usar verificación de prueba</button><a href={mp3ConverterUrl} target="_blank" rel="noopener noreferrer"><Waveform size={18}/> Convertir a MP3</a></div></div>}
          {wizardStep === 4 && <div className="wizard-section ready-section"><div className="ready-icon"><Check size={34} weight="bold"/></div><h3>Perfil listo para esta prueba</h3><p>Los dos audios y los datos del perfil están completos.</p><div className="profile-preview"><span>Perfil</span><strong>{profile.name}</strong><small>{profile.style} · {profile.level}</small><span>Audios</span><strong>Audio original + verificación</strong></div><div className="wizard-info"><Info size={19}/><span>En la integración real, aquí esperaremos el procesamiento, guardaremos el voiceId y comprobaremos su disponibilidad.</span></div></div>}
        </div>
        <div className="wizard-footer"><button className="wizard-back" disabled={wizardStep === 0} onClick={()=>setWizardStep(Math.max(0,wizardStep-1))}><ArrowLeft size={18}/> Atrás</button>{wizardStep < 4 ? <button className="wizard-next" disabled={(wizardStep===0&&!profile.name.trim())||(wizardStep===1&&(!sourceReady||profile.end<=profile.start))||(wizardStep===3&&!verificationReady)} onClick={()=>setWizardStep(wizardStep+1)}>Continuar <ArrowRight size={18}/></button> : <button className="wizard-next" onClick={()=>onComplete({name:profile.name,style:profile.style,level:profile.level,voiceId:"voice_preview_001"})}><Check size={18} weight="bold"/> Usar este perfil</button>}</div>
      </div>
    </div>
  );
}

function StartStep({ data, setData, setToast, handlers }) {
  const [cloneWizardOpen, setCloneWizardOpen] = useState(false);
  const fileName = data.file?.name;
  const uploading = Boolean(handlers?.isUploadingAudio);
  const uploadedAudioUrl = (handlers?.audioUploadUrl || '').toString().trim();
  const uploadError = (handlers?.audioUploadError || '').toString().trim();
  const hasSelectedAudio = Boolean(data.file || uploadedAudioUrl || uploading || uploadError);
  const chooseFile = async (file) => {
    if (!file) return;
    const ext = (file.name || '').toString().toLowerCase().split('.').pop() || '';
    const isAudioOk = ext === 'mp3' || ext === 'wav' || ext === 'm4a' || ext === 'aac' || ext === 'ogg' || ext === 'webm' || (file.type || '').toString().startsWith('audio/');
    if (!isAudioOk) {
      setToast("Ese archivo no es de audio. Usa MP3, WAV o M4A.");
      return;
    }
    setData({ ...data, audioSource: "upload", file });
    if (handlers?.uploadAudio) {
      try { await handlers.uploadAudio(file); } catch {}
    } else {
      setToast("Audio recibido. En el paso 2 verás la letra detectada.");
    }
  };

  return (
    <section className="start-step">
      <div className="project-cover"><img src="/assets/cover-luz-madrugada.png" alt="Portada violeta con luna dorada"/><div><span>PROYECTO ACTUAL</span><strong>Mi nueva canción</strong><small>Guardado hace 2 minutos</small></div></div>
      <div className="section-title"><span className="eyebrow">PASO 1 DE 4</span><h1>¿Cómo quieres comenzar?</h1><p>Primero dinos si tienes un audio y qué tipo de voz quieres usar.</p></div>
      <div className="start-grid">
        <div className="decision-group">
          <div className="decision-heading"><span>1</span><div><h2>¿Tienes un audio?</h2><p>Si lo subes, obtendremos la letra para el siguiente paso.</p></div></div>
          <label className={data.audioSource === "upload" ? "decision-card selected audio-upload-card" : "decision-card audio-upload-card"}>
            <span className="choice-icon teal">{uploading ? <Loader2 size={28} className="animate-spin"/> : <UploadSimple size={28} />}</span>
            <span><strong>{uploading ? "Subiendo audio…" : "Subir mi audio"}</strong><small>{uploading ? `Progreso ${handlers?.uploadProgress || 0}%` : fileName || "MP3, WAV o M4A"}</small></span>
            {hasSelectedAudio ? (
              <button
                type="button"
                className="audio-remove-button"
                aria-label="Quitar audio seleccionado"
                title="Quitar audio"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handlers?.removeSelectedAudio?.();
                }}
              >
                <Trash size={15} />
              </button>
            ) : null}
            <span className="radio" />
            <input type="file" accept="audio/*,.mp3,.wav,.m4a" onChange={(e) => chooseFile(e.target.files[0])} disabled={uploading} />
          </label>
          {data.audioSource === "upload" && uploadedAudioUrl ? (
            <CompactAudioPlayer src={uploadedAudioUrl} />
          ) : null}
          {data.audioSource === "upload" && uploadError ? (
            <div className="audio-upload-status error">{uploadError}</div>
          ) : data.audioSource === "upload" && uploadedAudioUrl ? (
            <div className="audio-upload-status success">Audio subido correctamente. Ya puedes escucharlo aquí y continuar.</div>
          ) : null}
          <button className={data.audioSource === "none" ? "decision-card selected" : "decision-card"} onClick={() => handlers?.removeSelectedAudio?.({ nextAudioSource: "none" })} disabled={uploading}>
            <span className="choice-icon"><MusicNote size={27} /></span>
            <span><strong>No tengo audio</strong><small>Escribiré o crearé la letra en el paso 2</small></span>
            <span className="radio" />
          </button>
          <a className="converter-button" href={mp3ConverterUrl} target="_blank" rel="noopener noreferrer"><Waveform size={20} /> Convertir mi archivo a MP3 <ArrowRight size={18} /></a>
          <p className="external-note">Ayuda opcional: abre un convertidor gratuito externo</p>
        </div>

        <div className="decision-group">
          <div className="decision-heading"><span>2</span><div><h2>¿Qué voz quieres usar?</h2><p>Podrás cambiar esta elección antes de generar.</p></div></div>
          <button className={data.voice === "standard" ? "decision-card selected" : "decision-card"} onClick={() => setData({ ...data, voice: "standard", model: data.model === "SUNO V5.5" ? "SUNO V5" : data.model })}>
            <span className="choice-icon"><Microphone size={28} /></span>
            <span><strong>Voz estándar</strong><small>Una voz de alta calidad generada por IA</small></span>
            <InfoTip title="Voz estándar">Elige esta opción si no necesitas usar una voz clonada.</InfoTip>
            <span className="radio" />
          </button>
          <button className={data.voice === "clone" ? "decision-card selected" : "decision-card"} onClick={() => { setData({ ...data, voice: "clone", model: "SUNO V5.5" }); setCloneWizardOpen(true); }}>
            <span className="choice-icon"><Users size={28} /></span>
            <span><strong>Clonar voz <em>SUNO V5.5</em></strong><small>Usa una voz clonada para tu canción</small></span>
            <InfoTip title="Clonación de Voz">Disponible con SUNO V5.5 para usar una voz previamente clonada.</InfoTip>
            <span className="radio" />
          </button>
          <div className="selection-summary"><Check size={18} weight="bold" /><span>{data.audioSource === "upload" ? "Audio MP3" : "Sin audio"} · {data.voice === "clone" ? "Clonar voz" : "Voz estándar"}</span></div>
          {data.voiceProfile && <div className="voice-profile-chip"><Users size={19}/><span><small>Perfil seleccionado</small><strong>{data.voiceProfile.name}</strong></span><button onClick={()=>setCloneWizardOpen(true)}>Cambiar</button></div>}
          {typeof handlers?.credits === 'number' && (
            <div className="selection-summary" style={{ marginTop: 12, padding: '10px 14px', borderRadius: 16, background: 'rgba(138,69,217,0.1)', border: '1px solid rgba(184,100,240,0.25)' }}>
              <Coins size={18} style={{ color: '#b864f0' }}/>
              <span style={{ fontSize: 13 }}><strong style={{ color: '#fff' }}>{handlers.credits.toFixed ? handlers.credits.toFixed(1) : handlers.credits}</strong> créditos disponibles</span>
            </div>
          )}
        </div>
      </div>
      {cloneWizardOpen && <CloneVoiceWizard setToast={setToast} onClose={()=>setCloneWizardOpen(false)} onComplete={(voiceProfile)=>{setData({...data,voice:"clone",model:"SUNO V5.5",voiceProfile});setCloneWizardOpen(false);setToast("Perfil de voz seleccionado para la canción.");}}/>}
    </section>
  );
}

function LyricsStep({ data, setData, setToast, handlers }) {
  const aiExample = "Escribe una canción romántica para mi esposa por nuestro aniversario. Que hable de todo lo que hemos superado juntos, tenga un tono emotivo y termine con un mensaje de amor para toda la vida.";
  const usingAI = data.lyricsMode === "ai";
  const aiLoading = Boolean(handlers?.isGeneratingLyrics);
  const audioLyricsStatus = (handlers?.audioLyricsStatus || '').toString().trim();
  const isTranscribingAudioLyrics = Boolean(handlers?.isTranscribingAudioLyrics);
  const doGenerateAI = async () => {
    if (!handlers?.generateLyricsWithAI) {
      setToast("Generador de letras no disponible.");
      return;
    }
    const ok = await handlers.generateLyricsWithAI();
    if (ok) setToast("Letra generada correctamente. Puedes editarla antes de continuar.");
  };
  return (
    <section className="single-column">
      <div className="section-title"><span className="eyebrow">PASO 2 DE 4</span><h1>{data.audioSource === "upload" ? "Revisa la letra de tu audio" : "Escribe o crea tu letra"}</h1><p>{data.audioSource === "upload" ? "La letra detectada aparece aquí para que puedas corregirla antes de continuar." : "Pega tu letra completa. La usaremos tal como está para crear la canción."}</p></div>
      <div className="segmented">
        <button className={!usingAI ? "selected" : ""} onClick={() => setData({ ...data, lyricsMode: "manual" })}>Tengo mi letra</button>
        <button className={usingAI ? "selected" : ""} onClick={() => setData({ ...data, lyricsMode: "ai", lyricInstruction: data.lyricInstruction || aiExample })}><MagicWand size={18} /> Crear con IA</button>
      </div>
      {data.audioSource === "upload" && !usingAI ? (
        <div className={`audio-lyrics-notice ${data.lyrics.trim() ? 'success' : audioLyricsStatus ? 'warning' : isTranscribingAudioLyrics ? 'info' : ''}`}>
          <Info size={18} />
          <span>
            {data.lyrics.trim()
              ? 'Revisa que la letra sea correcta antes de continuar. La transcripción automática puede contener errores.'
              : isTranscribingAudioLyrics
                ? 'Estamos transcribiendo la letra de tu audio automáticamente.'
                : audioLyricsStatus || 'Si la transcripción automática no detecta bien la letra, puedes escribirla manualmente aquí.'}
          </span>
        </div>
      ) : null}
      {usingAI ? <>
        <div className="ai-label-row"><label className="field-label">Instrucción para crear la letra <InfoTip title="¿Qué debo escribir?">Explica de qué tratará la canción, para quién es, qué historia debe contar y qué emoción quieres transmitir.</InfoTip></label><button className="example-button" onClick={() => setData({ ...data, lyricInstruction: aiExample })}><MagicWand size={16} /> Poner ejemplo</button></div>
        <textarea className="lyrics-box ai-instruction-box" value={data.lyricInstruction} onChange={(e) => setData({ ...data, lyricInstruction: e.target.value })} placeholder="Ejemplo: Escribe una canción para una persona especial y cuenta la historia que quiero transmitir..." disabled={aiLoading} />
        <div className="field-footer"><span>Describe todos los detalles que quieras incluir</span><span>{data.lyricInstruction.length}/1,000</span></div>
        <div className="ai-explanation"><Info size={19} /><span>Con esta instrucción, la IA escribirá una letra completa que después podrás revisar y editar.</span></div>
        <button className="generate-lyrics-button" disabled={!data.lyricInstruction.trim() || aiLoading} onClick={doGenerateAI}>
          {aiLoading ? <Loader2 size={20} className="animate-spin" /> : <MagicWand size={20} weight="fill" />}
          <span style={{ marginLeft: 8 }}>
            {aiLoading ? "Escribiendo la letra…" : data.aiLyricsGenerated ? "Volver a generar la letra" : "Generar letra con IA"}
          </span>
        </button>
        {data.aiLyricsGenerated && <div className="generated-lyrics"><div className="generated-heading"><span><Check size={18} weight="bold" /> Letra generada</span><small>Resultado editable</small></div><textarea className="lyrics-box" value={data.lyrics} onChange={(e) => setData({ ...data, lyrics: e.target.value })} /><div className="field-footer"><span>Puedes cambiar cualquier parte de la letra</span><span>{data.lyrics.length}/5,000</span></div></div>}
      </> : <>
        <label className="field-label">Letra de la canción <InfoTip title="Cómo escribir la letra">Puedes usar secciones como [Verso], [Coro] y [Puente].</InfoTip></label>
        <textarea className="lyrics-box" value={data.lyrics} onChange={(e) => setData({ ...data, lyrics: e.target.value })} placeholder="Escribe o pega aquí la letra de tu canción..." />
        <div className="field-footer"><span>Admite hasta 5,000 caracteres</span><span>{data.lyrics.length}/5,000</span></div>
      </>}
    </section>
  );
}

function StyleStep({ data, setData, creativity, setCreativity, instruction, setInstruction, audioWeight, setAudioWeight, setToast, handlers }) {
  const [modelOpen, setModelOpen] = useState(false);
  const improving = Boolean(handlers?.isBoostingStyle);
  const translating = Boolean(handlers?.isTranslatingStyle);
  const currentStyleLanguage = detectPromptLanguage(data.style);
  const translateLabel = currentStyleLanguage === 'en' ? 'Traducir al español' : 'Traducir al inglés';
  const updateStyle = (value) => setData({ ...data, style: value, styleTranslated: false });
  return (
    <section className="two-columns">
      <div>
        <div className="section-title"><span className="eyebrow">PASO 3 DE 4</span><h1>Define el estilo de tu canción</h1><p>Elige el motor y describe cómo quieres que suene.</p></div>
        <label className="field-label">Motor y versión <InfoTip title="Motor y versión">Cada versión ofrece una forma distinta de interpretar tu canción.</InfoTip></label>
        <div className="select-wrap">
          <button className="select-button" onClick={() => setModelOpen(!modelOpen)}><span>{data.model}</span><SlidersHorizontal size={20} /></button>
          {modelOpen && <div className="model-menu">{models.map(([name, detail]) => <button key={name} onClick={() => { setData({ ...data, model: name }); setModelOpen(false); }} className={data.model === name ? "chosen" : ""}><span><strong>{name}</strong><small>{detail}</small></span>{data.model === name && <Check size={18} />}</button>)}<p><Info size={16} /> Más motores próximamente</p></div>}
        </div>
        <label className="field-label top-gap">Nombre de la canción <InfoTip title="Nombre de la canción">Este nombre es obligatorio y se usará al generar la canción.</InfoTip></label>
        <input className="title-input" value={data.title} onChange={(e) => setData({ ...data, title: e.target.value })} placeholder="Escribe el nombre de la canción" />
        <div className="field-footer"><span>Obligatorio para generar</span><span>{data.title.length}/100</span></div>
        <div className="style-label-row">
          <label className="field-label top-gap">Estilo e instrucción <InfoTip title="Qué escribir aquí">Describe género, ritmo, instrumentos y ambiente.</InfoTip></label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button className="translate-button" disabled={!data.style.trim() || improving || translating} onClick={() => handlers?.handleBoostStyle?.()}>
              {improving ? <Loader2 size={18} className="animate-spin" /> : <MagicWand size={18} />}
              {improving ? "Mejorando..." : "Mejorar instrucción"}
            </button>
            <button className="translate-button" disabled={!data.style.trim() || improving || translating} onClick={() => handlers?.handleTranslateStyle?.()}>
              {translating ? <Loader2 size={18} className="animate-spin" /> : <Translate size={18} />}
              {translating ? "Traduciendo..." : translateLabel}
            </button>
          </div>
        </div>
        <textarea value={data.style} onChange={(e) => updateStyle(e.target.value)} placeholder="Ejemplo: Balada pop romántica, piano suave, voz emotiva..." />
        {data.styleTranslated && <div className="translation-note"><Check size={17} weight="bold" /> Instrucción traducida. Puedes editarla antes de continuar.</div>}
        <label className="field-label top-gap">Evitar estilos o elementos</label>
        <textarea className="short-area" value={data.negative} onChange={(e) => setData({ ...data, negative: e.target.value })} placeholder="Ejemplo: Sin batería fuerte, sin voz robótica..." />
        <div className="gender-section"><div className="gender-heading"><div><strong>Tipo de voz</strong><p>Elige qué voz interpretará la canción.</p></div><InfoTip title="Tipo de voz">Esta opción indica a Suno si deseas una voz masculina o femenina.</InfoTip></div><div className="gender-buttons"><button className={data.vocalGender === "m" ? "selected" : ""} onClick={()=>setData({...data,vocalGender:"m"})}><User size={24}/><span><strong>Voz de hombre</strong><small>Voz masculina</small></span><span className="radio"/></button><button className={data.vocalGender === "f" ? "selected" : ""} onClick={()=>setData({...data,vocalGender:"f"})}><User size={24}/><span><strong>Voz de mujer</strong><small>Voz femenina</small></span><span className="radio"/></button></div></div>
      </div>
      <div className="settings-panel">
        <h2>Ajustes de precisión</h2><p className="panel-intro">Puedes moverlos o dejarlos como están.</p>
        <RangeSetting label="Nivel de creatividad" help="Qué tan diferente puede ser el resultado" value={creativity} onChange={setCreativity} />
        <RangeSetting label="Peso de la instrucción" help="Cuánto seguirá tus indicaciones" value={instruction} onChange={setInstruction} />
        <RangeSetting label="Peso del audio original" help="Cuánto respetará el audio que subiste" value={audioWeight} onChange={setAudioWeight} />
      </div>
    </section>
  );
}

function VoiceStep({ data, setData, creativity, instruction, audioWeight, setToast }) {
  const fileName = data.file?.name;
  return (
    <section className="two-columns voice-layout">
      <div>
        <div className="section-title"><span className="eyebrow">PASO 3 DE 4</span><h1>Elige la voz y el audio</h1><p>Selecciona cómo quieres que suene tu canción.</p></div>
        <div className="choice-list">
          <button className={data.voice === "standard" ? "voice-choice selected" : "voice-choice"} onClick={() => setData({ ...data, voice: "standard", model: data.model === "SUNO V5.5" ? "SUNO V5" : data.model })}><span className="choice-icon"><Microphone size={28} /></span><span><strong>Voz estándar</strong><small>Elige una voz de alta calidad generada por IA.</small></span><span className="radio" /></button>
          <button className={data.voice === "clone" ? "voice-choice selected" : "voice-choice"} onClick={() => setData({ ...data, voice: "clone", model: "SUNO V5.5" })}><span className="choice-icon"><Users size={28} /></span><span><strong>Clonar voz <em>SUNO V5.5</em></strong><small>Usa una voz clonada para tu canción.</small></span><span className="radio" /></button>
          <div className={data.voice === "upload" ? "upload-card selected" : "upload-card"}>
            <button className="upload-choice" onClick={() => setData({ ...data, voice: "upload" })}><span className="choice-icon teal"><UploadSimple size={29} /></span><span><strong>Subir mi audio</strong><small>Usa un audio de referencia para guiar el resultado.</small></span><InfoTip title="¿Qué audio debo subir?">Usa un archivo MP3 claro. Puede ser tu voz o un audio de referencia.</InfoTip><span className="radio" /></button>
            <label className="drop-zone"><UploadSimple size={30} /><span><strong>{fileName || "Sube tu audio en formato MP3"}</strong><small>{fileName ? "Archivo listo para esta vista previa" : "Solo se aceptan archivos .MP3"}</small></span><input type="file" accept="audio/mpeg,.mp3" onChange={(e) => { const file = e.target.files[0]; if (!file) return; if (!file.name.toLowerCase().endsWith(".mp3")) { setToast("Ese archivo no es MP3. Usa el convertidor gratuito."); return; } setData({ ...data, voice: "upload", file }); setToast("Audio MP3 agregado a la vista previa."); }} /></label>
            <button className="converter-button" onClick={() => setToast("En la app, este botón abrirá el convertidor gratuito en otra página.")}><Waveform size={20} /> Convertir mi archivo a MP3 <ArrowRight size={18} /></button>
            <p className="external-note">Abre un convertidor gratuito en otra página</p>
          </div>
        </div>
      </div>
      <div className="settings-panel summary-panel">
        <h2>Tus ajustes</h2>
        <RangeSummary label="Nivel de creatividad" value={creativity} help="Qué tan diferente puede ser el resultado" />
        <RangeSummary label="Peso de la instrucción" value={instruction} help="Cuánto seguirá tus indicaciones" />
        <RangeSummary label="Peso del audio original" value={audioWeight} help="Cuánto respetará el audio que subiste" />
        <div className="engine-summary"><span>Motor seleccionado</span><strong>{data.voice === "clone" ? "SUNO V5.5 — Clonación de Voz" : data.model}</strong></div>
      </div>
    </section>
  );
}

function RangeSummary({ label, value, help }) {
  const notRecommended = value >= 87;
  return <div className={notRecommended ? "range-setting read-only warning-range" : "range-setting read-only"}><div className="range-heading"><div><span className="range-label">{label}</span><InfoTip title={label}>{help}</InfoTip><p>{help}</p></div><output><span>{value}%</span>{notRecommended && <small>No recomendable</small>}</output></div><div className="progress"><span style={{ width: `${value}%` }} /></div></div>;
}

function ReviewStep({ data, setData, creativity, instruction, audioWeight, setToast, handlers }) {
  const requirements = [
    ["Título de la canción", Boolean(data.title.trim())],
    ["Letra completa", Boolean(data.lyrics.trim())],
    ["Instrucción o estilo musical", Boolean(data.style.trim())],
    ["Voz seleccionada", Boolean(data.voice)],
    ["Voz de hombre o de mujer", Boolean(data.vocalGender)],
    ["Audio MP3 de referencia", data.audioSource !== "upload" || Boolean(handlers?.hasUploadedAudio)],
    ["Perfil de voz clonado", data.voice !== "clone" || Boolean(data.voiceProfile)],
  ];
  const isReady = requirements.every(([, complete]) => complete);
  const submitting = Boolean(handlers?.isSubmitting);
  return (
    <section className="review-wrap">
      <div className="section-title"><span className="eyebrow">PASO 4 DE 4</span><h1>Revisa tu canción</h1><p>Comprueba toda la información antes de enviarla a generar.</p></div>
      <div className="review-grid">
        <div className="review-card"><span>Nombre de la canción</span><strong>{data.title || "Sin nombre todavía"}</strong><small>{data.title ? "Nombre listo para generar" : "Vuelve al paso 3 para escribirlo"}</small></div>
        <div className="review-card"><span>Letra</span><strong>{data.lyrics ? "Letra lista" : "Sin letra todavía"}</strong><small>{data.lyrics ? `${data.lyrics.length} caracteres` : "Vuelve al paso 1 para escribirla"}</small></div>
        <div className="review-card"><span>Motor</span><strong>{data.voice === "clone" ? "SUNO V5.5" : data.model}</strong><small>{data.voice === "clone" ? "Clonación de Voz" : "Modelo seleccionado"}</small></div>
        <div className="review-card"><span>Voz y audio</span><strong>{data.voice === "clone" ? "Clonar voz" : data.voice === "upload" ? "Audio propio" : "Voz estándar"}</strong><small>{data.file?.name || "Sin archivo cargado"}</small></div>
        <div className="review-card"><span>Tipo de voz</span><strong>{data.vocalGender === "m" ? "Voz de hombre" : data.vocalGender === "f" ? "Voz de mujer" : "Sin seleccionar"}</strong><small>{data.vocalGender ? "Selección guardada" : "Vuelve al paso 3 para elegirla"}</small></div>
        <div className="review-card"><span>Ajustes</span><strong>{creativity}% creatividad</strong><small>{instruction}% instrucción · {audioWeight}% audio</small></div>
        <div className="review-card review-card-wide"><span>Instrucción o estilo musical</span><strong>{data.style || "Todavía no escribiste una instrucción"}</strong><small>{data.negative ? `Evitar: ${data.negative}` : "Sin estilos o elementos excluidos"}</small></div>
      </div>
      <div className="requirements-box">
        <div><strong>Antes de generar</strong><span>{submitting ? "Enviando a Suno…" : isReady ? "Todo está completo" : "Completa los elementos pendientes"}</span></div>
        <ul>{requirements.map(([label, complete]) => <li key={label} className={complete ? "complete" : "pending"}>{complete ? <Check size={18} weight="bold" /> : <X size={17} weight="bold" />}<span>{label}</span></li>)}</ul>
      </div>
      <button className="mock-generate" disabled={submitting || !isReady} onClick={() => handlers?.handleSubmitGenerate?.()}>
        {submitting ? <Loader2 size={22} className="animate-spin" /> : <MusicNote size={22} weight="fill" />}
        <span style={{ marginLeft: submitting ? 10 : 8 }}>{submitting ? "Generando…" : "Generar canción"}</span>
      </button>
      <p className="safe-note"><Info size={18} /> El botón solo se habilita al completar todos los requisitos. Después de generar, irás a tu Biblioteca para ver el progreso.</p>
    </section>
  );
}

function CompactAudioPlayer({ src }) {
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return undefined;
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    try {
      audio.pause();
      audio.currentTime = 0;
    } catch {}
    return () => {
      try { audio.pause(); } catch {}
    };
  }, [src]);

  return (
    <div className="audio-preview-player">
      <audio
        ref={audioRef}
        src={src}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
        onTimeUpdate={() => {
          const audio = audioRef.current;
          if (!audio) return;
          const next = Number(audio.currentTime);
          if (Number.isFinite(next)) setCurrentTime(next);
        }}
        onLoadedMetadata={() => {
          const audio = audioRef.current;
          if (!audio) return;
          const next = Number(audio.duration);
          if (Number.isFinite(next)) setDuration(next);
        }}
        onDurationChange={() => {
          const audio = audioRef.current;
          if (!audio) return;
          const next = Number(audio.duration);
          if (Number.isFinite(next)) setDuration(next);
        }}
      />
      <button
        type="button"
        className="audio-preview-toggle"
        onClick={() => {
          const audio = audioRef.current;
          if (!audio) return;
          if (audio.paused) {
            audio.play().catch(() => {});
          } else {
            audio.pause();
          }
        }}
      >
        {isPlaying ? <Pause size={16} /> : <Play size={16} />}
      </button>
      <div className="audio-preview-meta">
        <div className="audio-preview-row">
          <strong>{isPlaying ? 'Reproduciendo audio' : 'Escuchar audio'}</strong>
          <span>{formatTime(currentTime)} / {formatTime(duration)}</span>
        </div>
        <input
          type="range"
          min={0}
          max={Number.isFinite(duration) && duration > 0 ? duration : 0}
          step={0.1}
          value={Number.isFinite(currentTime) ? currentTime : 0}
          disabled={!Number.isFinite(duration) || duration <= 0}
          onChange={(e) => {
            const audio = audioRef.current;
            if (!audio) return;
            const next = Math.max(0, Math.min(Number(e.target.value), Number.isFinite(duration) ? duration : 0));
            try { audio.currentTime = next; } catch {}
            setCurrentTime(next);
          }}
        />
      </div>
    </div>
  );
}

function GeneratingSongsView({ session, pendingItem, onGoLibrary, onToggleNotify, onClearSession }) {
  const stage = getGenerationStage(session, pendingItem);
  const readyCount = Number(session?.readyTrackCount || 0);
  const notificationsEnabled = Boolean(session?.notifyWhenReady);
  const notificationPermission = typeof Notification !== 'undefined' ? Notification.permission : 'default';
  const heroTitle = stage === 'ready' ? 'Tus 2 canciones ya están listas' : '¡Se están generando tus 2 canciones!';
  const heroSubtitle = stage === 'ready' ? 'Ya puedes escucharlas en tu Biblioteca.' : 'Esto puede tardar unos minutos.';
  const heroMessage = stage === 'ready' ? 'Puedes abrir tu Biblioteca ahora mismo para escucharlas.' : 'Puedes seguir usando LucIAna. Te avisaremos cuando estén listas.';
  const cards = [
    { key: 'song-1', title: 'Canción 1', subtitle: 'Versión original', accent: 'purple' },
    { key: 'song-2', title: 'Canción 2', subtitle: 'Segunda versión', accent: 'cyan' },
  ];
  const stageItems = getStageItems(stage);

  return (
    <section className={`generation-stage ${stage === 'ready' ? 'ready' : ''}`}>
      <div className="generation-hero">
        <div className="generation-hero-icon"><Sparkle size={28} /></div>
        <h1>{heroTitle}</h1>
        <p className="generation-hero-subtitle">{heroSubtitle}</p>
        <p className="generation-hero-copy">{heroMessage}</p>
        <div className="generation-ai-banner">
          <span className="generation-ai-chip"><MagicWand size={18} /></span>
          <div>
            <strong>Estamos usando IA avanzada de Suno</strong>
            <span>para crear <em>dos versiones unicas</em> de tu canción.</span>
          </div>
        </div>
      </div>

      <div className="generation-cards">
        {cards.map((card, index) => {
          const done = stage === 'ready' && readyCount >= index + 1;
          return (
            <article key={card.key} className={`generation-card ${card.accent} ${done ? 'done' : ''}`}>
              <div className="generation-card-main">
                <div className="generation-cover">
                  <div className="generation-cover-glow" />
                  <MusicNote size={46} />
                </div>
                <div className="generation-copy">
                  <div className="generation-title-row">
                    <div>
                      <h2>{card.title}</h2>
                      <p>{card.subtitle}</p>
                    </div>
                    <span className={`generation-state-pill ${card.accent}`}>{done ? 'Lista' : 'En generación'}</span>
                  </div>
                  <div className={`generation-wave ${card.accent}`} aria-hidden="true">
                    {Array.from({ length: 26 }).map((_, bar) => (
                      <span key={`${card.key}-${bar}`} style={{ animationDelay: `${bar * 0.08}s`, height: `${12 + ((bar * 11) % 24)}px` }} />
                    ))}
                  </div>
                  <div className="generation-card-note">
                    {done ? 'Audio real disponible en tu Biblioteca.' : 'LucIAna sigue consultando el estado real del proveedor.'}
                  </div>
                </div>
              </div>
              <div className="generation-card-side">
                <div className={`generation-ring ${card.accent} ${done ? 'done' : 'indeterminate'}`}>
                  <div className="generation-ring-inner">
                    {done ? <Check size={24} /> : <Loader2 size={24} className="animate-spin" />}
                  </div>
                </div>
                <ul className="generation-status-list">
                  {stageItems.map((item) => (
                    <li key={`${card.key}-${item.key}`} className={item.state}>
                      <span className="dot" />
                      <span>{item.label}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </article>
          );
        })}
      </div>

      <div className="generation-bottom-grid">
        <div className="generation-tip-card">
          <div className="generation-tip-icon"><MusicNote size={20} /></div>
          <div className="generation-tip-copy">
            <strong>Consejo</strong>
            <span>Puedes seguir usando la app mientras tanto. Te avisaremos cuando tus canciones estén listas.</span>
          </div>
        </div>

        <button
          type="button"
          className={`generation-notify-card ${notificationsEnabled ? 'enabled' : ''}`}
          onClick={() => onToggleNotify?.(!notificationsEnabled)}
        >
          <div className="generation-tip-icon"><Bell size={20} /></div>
          <div className="generation-tip-copy">
            <strong>Te notificaremos</strong>
            <span>
              {notificationPermission === 'denied'
                ? 'Las notificaciones del navegador están bloqueadas. Seguiremos avisándote dentro de LucIAna.'
                : 'Cuando estén listas'}
            </span>
          </div>
          <span className={`notify-switch ${notificationsEnabled ? 'on' : ''}`} aria-hidden="true"><span /></span>
        </button>
      </div>

      <div className="generation-footer-banner">
        <div>
          <strong>IA que crea. Tú que inspiras. LucIAna | Music</strong>
          <span>{session?.title ? `Canción: ${session.title}` : 'Tu creatividad, potenciada por inteligencia artificial.'}</span>
        </div>
        <div className="generation-footer-actions">
          <button type="button" className="generation-link-button" onClick={() => onGoLibrary?.()}>
            Ver mis canciones
            <ArrowRight size={18} />
          </button>
          {stage === 'ready' && (
            <button type="button" className="generation-secondary-button" onClick={() => onClearSession?.()}>
              Seguir creando
            </button>
          )}
        </div>
      </div>
    </section>
  );
}


const approvedCss = `
:host{--bg:#07111d;--panel:#0d1825;--panel-2:#111d2c;--line:#253244;--text:#f5f7fb;--muted:#a8b2c1;--purple:#8a45d9;--purple-2:#b864f0;--teal:#00bfa6;display:block;height:100%;min-height:0;color:var(--text);background:var(--bg)}
.approved-flow-shell{height:100%;min-height:0;overflow:hidden;background:radial-gradient(circle at 70% 25%,rgba(66,38,105,.13),transparent 28%),var(--bg);color:var(--text);font-family:Inter,Arial,sans-serif}
.approved-flow-shell .main-area{height:100%;min-height:0;padding-bottom:0;grid-template-rows:126px minmax(0,1fr)}
.approved-flow-shell .content-area{min-height:0;overflow-x:hidden;overflow-y:auto;overscroll-behavior-y:contain;-webkit-overflow-scrolling:touch;touch-action:pan-y;padding-bottom:0}
.approved-flow-shell .step-footer{margin:24px -40px 0}
@media(max-width:700px){.approved-flow-shell .main-area{height:100%;grid-template-rows:104px minmax(0,1fr)}.approved-flow-shell .content-area{padding-bottom:0}.approved-flow-shell .step-footer{margin:18px -18px 0}}
.generation-stage{max-width:1180px;margin:0 auto;padding:30px 4px 10px;display:grid;gap:18px}
.generation-hero{position:relative;border:1px solid rgba(131,88,255,.18);border-radius:28px;padding:34px 34px 28px;background:radial-gradient(circle at 50% 0%,rgba(145,91,255,.16),transparent 42%),linear-gradient(180deg,rgba(7,14,27,.96),rgba(6,11,21,.92));box-shadow:0 18px 55px rgba(0,0,0,.28);text-align:center;overflow:hidden}
.generation-hero::before,.generation-hero::after{content:"";position:absolute;top:50%;width:190px;height:76px;transform:translateY(-50%);pointer-events:none;opacity:.8;background:linear-gradient(90deg,transparent,rgba(155,91,255,.95),transparent);filter:blur(.5px)}
.generation-hero::before{left:-28px}.generation-hero::after{right:-28px}
.generation-hero-icon{position:relative;z-index:1;width:58px;height:58px;margin:0 auto 12px;border-radius:999px;display:grid;place-items:center;background:radial-gradient(circle,rgba(180,100,240,.24),rgba(63,33,114,.08));color:#e8d5ff}
.generation-hero h1{position:relative;z-index:1;margin:0;font-size:54px;line-height:1.04;font-weight:900}
.generation-hero-subtitle{position:relative;z-index:1;margin:12px 0 0;font-size:24px;color:#d9deea}
.generation-hero-copy{position:relative;z-index:1;margin:10px 0 0;font-size:18px;line-height:1.6;color:#aeb8c9}
.generation-ai-banner{position:relative;z-index:1;display:flex;align-items:center;gap:14px;max-width:610px;margin:24px auto 0;padding:16px 20px;border-radius:18px;border:1px solid rgba(133,97,239,.22);background:rgba(13,24,37,.88);text-align:left}
.generation-ai-chip{width:44px;height:44px;border-radius:14px;display:grid;place-items:center;background:linear-gradient(180deg,rgba(111,72,207,.38),rgba(13,24,37,.08));color:#cbb7ff;flex-shrink:0}
.generation-ai-banner strong,.generation-ai-banner span{display:block}
.generation-ai-banner strong{font-size:15px;color:#fff}
.generation-ai-banner span{margin-top:4px;font-size:14px;color:#bcc5d3}
.generation-ai-banner em{font-style:normal;color:#a86bff;font-weight:700}
.generation-cards{display:grid;grid-template-columns:1fr;gap:16px}
.generation-card{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:20px;align-items:center;padding:20px 22px;border-radius:24px;border:1px solid rgba(125,86,230,.18);background:linear-gradient(180deg,rgba(6,12,24,.96),rgba(8,14,26,.88));box-shadow:0 18px 45px rgba(0,0,0,.24)}
.generation-card.cyan{border-color:rgba(18,197,214,.2)}
.generation-card.done{box-shadow:0 0 0 1px rgba(53,240,174,.15),0 18px 45px rgba(0,0,0,.24)}
.generation-card-main{display:flex;align-items:center;gap:18px;min-width:0}
.generation-cover{position:relative;width:108px;height:108px;border-radius:22px;display:grid;place-items:center;overflow:hidden;border:1px solid rgba(255,255,255,.08);background:radial-gradient(circle at 35% 30%,rgba(202,132,255,.3),transparent 38%),linear-gradient(180deg,#140f29,#08111e);color:#dfb8ff;flex-shrink:0}
.generation-card.cyan .generation-cover{background:radial-gradient(circle at 35% 30%,rgba(71,248,255,.28),transparent 38%),linear-gradient(180deg,#081824,#07111d);color:#8af8ff}
.generation-cover-glow{position:absolute;inset:0;background:radial-gradient(circle at 50% 50%,rgba(164,94,234,.22),transparent 60%)}
.generation-copy{min-width:0;display:grid;gap:10px}
.generation-title-row{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}
.generation-title-row h2{margin:0;font-size:34px;line-height:1.05;font-weight:900}
.generation-title-row p{margin:6px 0 0;font-size:18px;color:#b6bfd0}
.generation-state-pill{display:inline-flex;align-items:center;justify-content:center;padding:7px 12px;border-radius:999px;font-size:13px;font-weight:800;white-space:nowrap}
.generation-state-pill.purple{background:rgba(138,69,217,.18);color:#d4b1ff;border:1px solid rgba(184,100,240,.26)}
.generation-state-pill.cyan{background:rgba(0,191,166,.14);color:#75f4e1;border:1px solid rgba(0,191,166,.22)}
.generation-wave{display:flex;align-items:flex-end;gap:4px;height:34px}
.generation-wave span{width:4px;border-radius:999px;background:linear-gradient(180deg,rgba(198,137,255,.96),rgba(115,49,189,.2));animation:generationWave 1.35s ease-in-out infinite}
.generation-wave.cyan span{background:linear-gradient(180deg,rgba(69,243,255,.96),rgba(12,141,173,.18))}
.generation-card-note{font-size:15px;color:#9fafc4}
.generation-card-side{display:grid;grid-template-columns:auto minmax(180px,220px);align-items:center;gap:20px}
.generation-ring{position:relative;width:130px;height:130px;border-radius:999px;padding:8px;display:grid;place-items:center}
.generation-ring::before{content:"";position:absolute;inset:0;border-radius:999px;background:conic-gradient(from 0deg,rgba(255,255,255,.08),rgba(255,255,255,.02));opacity:.95}
.generation-ring.indeterminate::after{content:"";position:absolute;inset:0;border-radius:999px;padding:8px;background:conic-gradient(from 0deg,rgba(167,97,255,.05),rgba(167,97,255,1),rgba(167,97,255,.08) 55%,rgba(167,97,255,0) 72%);-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;animation:generationSpin 1.4s linear infinite}
.generation-ring.cyan.indeterminate::after{background:conic-gradient(from 0deg,rgba(0,218,199,.05),rgba(0,229,215,1),rgba(0,229,215,.08) 55%,rgba(0,229,215,0) 72%)}
.generation-ring.done::after{content:"";position:absolute;inset:0;border-radius:999px;padding:8px;background:conic-gradient(from 0deg,#35f0ae,#7df7ff,#a86bff,#35f0ae);-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude}
.generation-ring-inner{position:relative;z-index:1;width:100%;height:100%;border-radius:999px;display:grid;place-items:center;background:radial-gradient(circle at 50% 35%,rgba(15,21,35,.95),rgba(7,12,23,.96));color:#fff;font-size:28px;font-weight:900}
.generation-status-list{display:grid;gap:10px;list-style:none;padding:0;margin:0}
.generation-status-list li{display:flex;align-items:center;gap:10px;font-size:15px;color:#8e9bb0}
.generation-status-list li .dot{width:11px;height:11px;border-radius:999px;border:1px solid currentColor}
.generation-status-list li.complete{color:#7ef0d6}
.generation-status-list li.complete .dot{background:currentColor}
.generation-status-list li.active{color:#f0f5ff;font-weight:800}
.generation-status-list li.active .dot{background:currentColor;box-shadow:0 0 0 4px rgba(168,107,255,.12)}
.generation-status-list li.pending{color:#79879a}
.generation-bottom-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.generation-tip-card,.generation-notify-card,.generation-footer-banner{border:1px solid rgba(125,86,230,.18);background:linear-gradient(180deg,rgba(9,15,27,.95),rgba(8,14,25,.9));box-shadow:0 18px 45px rgba(0,0,0,.2)}
.generation-tip-card,.generation-notify-card{display:flex;align-items:center;gap:14px;padding:18px 20px;border-radius:22px}
.generation-notify-card{cursor:pointer;text-align:left}
.generation-notify-card.enabled{border-color:rgba(0,191,166,.28)}
.generation-tip-icon{width:44px;height:44px;border-radius:14px;display:grid;place-items:center;background:linear-gradient(180deg,rgba(111,72,207,.38),rgba(13,24,37,.08));color:#d2b7ff;flex-shrink:0}
.generation-tip-copy{display:grid;gap:4px;min-width:0;flex:1}
.generation-tip-copy strong{font-size:18px;color:#fff}
.generation-tip-copy span{font-size:14px;line-height:1.5;color:#adb8ca}
.notify-switch{width:62px;height:34px;border-radius:999px;padding:4px;display:flex;align-items:center;background:rgba(255,255,255,.12);transition:background .2s ease;flex-shrink:0}
.notify-switch span{width:26px;height:26px;border-radius:999px;background:#fff;box-shadow:0 3px 10px rgba(0,0,0,.35);transform:translateX(0);transition:transform .2s ease}
.notify-switch.on{background:linear-gradient(90deg,#7c3aed,#b864f0)}
.notify-switch.on span{transform:translateX(28px)}
.generation-footer-banner{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:22px 24px;border-radius:24px;background:linear-gradient(90deg,rgba(88,38,181,.28),rgba(11,18,33,.92))}
.generation-footer-banner strong,.generation-footer-banner span{display:block}
.generation-footer-banner strong{font-size:25px;line-height:1.1;color:#fff}
.generation-footer-banner span{margin-top:6px;font-size:15px;color:#c6cee0}
.generation-footer-actions{display:flex;gap:12px;align-items:center}
.generation-link-button,.generation-secondary-button{border-radius:999px;font-weight:800;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px}
.generation-link-button{min-height:52px;padding:0 22px;border:1px solid rgba(220,201,255,.25);background:linear-gradient(90deg,rgba(122,60,224,.92),rgba(176,98,241,.95));color:#fff}
.generation-secondary-button{min-height:48px;padding:0 18px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04);color:#d8deeb}
.audio-upload-card{position:relative}
.audio-remove-button{position:absolute;top:12px;right:12px;width:30px;height:30px;border-radius:999px;border:1px solid rgba(255,255,255,.12);background:rgba(10,18,30,.82);color:#cfd9e8;display:grid;place-items:center;cursor:pointer;z-index:2;transition:background .2s ease,color .2s ease,border-color .2s ease}
.audio-remove-button:hover{background:rgba(87,34,126,.9);border-color:rgba(184,100,240,.35);color:#fff}
.audio-preview-player{margin-top:14px;padding:12px 14px;border-radius:16px;border:1px solid rgba(0,191,166,.2);background:rgba(3,17,23,.72);display:flex;align-items:center;gap:12px}
.audio-preview-toggle{width:38px;height:38px;border-radius:999px;border:1px solid rgba(141,219,234,.25);background:#10202b;color:#8ddbea;display:grid;place-items:center;cursor:pointer;flex-shrink:0}
.audio-preview-meta{min-width:0;flex:1;display:grid;gap:6px}
.audio-preview-row{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:12px;color:#9fc3cc}
.audio-preview-row strong{font-size:13px;color:#ecfbff}
.audio-preview-player input[type="range"]{width:100%;accent-color:#22d3ee}
.audio-upload-status{margin-top:10px;font-size:13px;line-height:1.45}
.audio-upload-status.error{color:#ffb4b4}
.audio-upload-status.success{color:#86ebd8}
.audio-lyrics-notice{margin:16px 0 6px;padding:12px 14px;border-radius:16px;border:1px solid rgba(255,255,255,.08);background:rgba(11,20,31,.76);display:flex;align-items:flex-start;gap:10px;font-size:14px;line-height:1.55;color:#d8e2f0}
.audio-lyrics-notice.info{border-color:rgba(33,201,167,.18);color:#bfeee5}
.audio-lyrics-notice.success{border-color:rgba(135,100,240,.24);background:rgba(56,28,110,.16);color:#ebdefe}
.audio-lyrics-notice.warning{border-color:rgba(255,189,105,.18);color:#ffe4b8}
@keyframes generationWave{0%,100%{transform:scaleY(.45);opacity:.45}50%{transform:scaleY(1);opacity:1}}
@keyframes generationSpin{to{transform:rotate(360deg)}}
@media(max-width:980px){.generation-hero h1{font-size:42px}.generation-title-row h2{font-size:28px}.generation-title-row p{font-size:16px}.generation-card-side{grid-template-columns:auto minmax(150px,1fr)}.generation-ring{width:112px;height:112px}.generation-footer-banner{flex-direction:column;align-items:flex-start}.generation-footer-actions{width:100%;flex-wrap:wrap}}
@media(max-width:700px){.generation-stage{padding:18px 0 0;gap:14px}.generation-hero{padding:26px 18px 22px;border-radius:24px}.generation-hero::before,.generation-hero::after{display:none}.generation-hero h1{font-size:30px}.generation-hero-subtitle{font-size:17px}.generation-hero-copy{font-size:14px}.generation-ai-banner{margin-top:18px;padding:14px 14px;border-radius:16px}.generation-cards{gap:14px}.generation-card{grid-template-columns:1fr;gap:16px;padding:16px;border-radius:22px}.generation-card-main{align-items:flex-start}.generation-cover{width:82px;height:82px;border-radius:18px}.generation-title-row{align-items:flex-start}.generation-title-row h2{font-size:20px}.generation-title-row p{font-size:13px;margin-top:4px}.generation-state-pill{font-size:11px;padding:6px 10px}.generation-wave{height:28px;gap:3px}.generation-wave span{width:3px}.generation-card-note{font-size:13px}.generation-card-side{grid-template-columns:1fr;justify-items:start;gap:12px}.generation-ring{width:108px;height:108px;justify-self:end;margin-top:-58px}.generation-status-list{gap:8px}.generation-status-list li{font-size:14px}.generation-bottom-grid{grid-template-columns:1fr;gap:12px}.generation-tip-card,.generation-notify-card{padding:16px;border-radius:20px}.generation-tip-copy strong{font-size:17px}.generation-tip-copy span{font-size:13px}.generation-footer-banner{padding:18px 16px;border-radius:22px}.generation-footer-banner strong{font-size:18px}.generation-footer-banner span{font-size:13px}.generation-footer-actions{width:100%;display:grid;grid-template-columns:1fr}.generation-link-button,.generation-secondary-button{width:100%}.audio-preview-player{padding:10px 12px}.audio-preview-row{font-size:11px}.audio-preview-row strong{font-size:12px}}
`+approvedBaseCss.replaceAll("Manrope","Inter")+approvedMenuCss+approvedCreditCss+approvedDesignCss.replaceAll("Manrope","Inter")+approvedPlayerCss;

const uploadAudioForVoice = async (token, file) => {
  const name = (file?.name || 'audio').toString().trim() || 'audio';
  const ext = name.toLowerCase().split('.').pop() || '';
  const contentType =
    (file?.type || '').toString().trim() ||
    (ext === 'wav' ? 'audio/wav' : ext === 'ogg' ? 'audio/ogg' :
     ext === 'webm' ? 'audio/webm' : ext === 'aac' ? 'audio/aac' :
     ext === 'm4a' || ext === 'mp4' ? 'audio/mp4' : 'audio/mpeg');
  const sizeBytes = Number(file?.size || 0);
  const SKIP_INLINE_BYTES = 3 * 1024 * 1024;
  const skipInline = sizeBytes > SKIP_INLINE_BYTES;

  const isPayloadTooLarge = (statusCode, text) => {
    if (statusCode === 413) return true;
    const haystack = (text || '').toString().toLowerCase();
    if (!haystack) return false;
    return haystack.includes('function_payload_too_large') || haystack.includes('request entity too large') || haystack.includes('payload too large') || haystack.includes('body is too large') || haystack.includes('413');
  };

  const parseJsonSafe = (raw) => {
    try { return raw ? JSON.parse(raw) : {}; } catch { return { error: raw || '' }; }
  };

  const sizeMb = sizeBytes / (1024 * 1024);
  const timeoutPrep = 30000;
  const timeoutPut = Math.max(45000, Math.min(240000, Math.ceil(sizeMb) * 15000 + 45000));
  const timeoutInline = Math.max(55000, Math.min(240000, Math.ceil(sizeMb) * 30000 + 55000));

  const fetchWithTimeout = (input, init = {}, timeoutMs = 45000) => {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(t));
  };

  const useInline = sizeBytes > 0 && sizeBytes <= SKIP_INLINE_BYTES;
  let prep;
  try {
    if (useInline) {
      const arrayBuffer = await file.arrayBuffer();
      const fileArray = Array.from(new Uint8Array(arrayBuffer));
      prep = await fetchWithTimeout('/api/upload-audio-supabase', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ title: name, contentType, file: fileArray }),
      }, timeoutInline);
    } else {
      prep = await fetchWithTimeout('/api/upload-audio-supabase', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ title: name, contentType }),
      }, timeoutPrep);
    }
    const prepRaw = await prep.text().catch(() => '');
    if (isPayloadTooLarge(prep.status, prepRaw)) {
      throw new Error('(supabase_inline_oversize_skip)');
    }
    const prepOut = parseJsonSafe(prepRaw);
    if (!(prep.ok && prepOut?.ok)) {
      throw new Error((prepOut?.detail || prepOut?.error || `No pude preparar la subida final (HTTP ${prep.status}).`).toString());
    }
    const initialUrl = (prepOut?.url || '').toString().trim();
    const key = (prepOut?.key || '').toString().trim();
    const uploadUrl = (prepOut?.uploadUrl || '').toString().trim();
    const modo = String(prepOut?.via || '').toString().trim();
    if (modo === 'supabase_admin_inline' || !uploadUrl) {
      if (!initialUrl) throw new Error('No recibí la URL final del audio en Supabase');
      return { url: initialUrl, key };
    }
    const formData = new FormData();
    const filename = name && name.trim() ? name.trim() : (file?.name || 'audio.mp3').toString().trim();
    const finalBlob = file instanceof Blob ? file : new Blob([file], { type: contentType });
    const method = String(prepOut?.uploadMethod || prepOut?.via || 'POST_FORM').toUpperCase();
    const hasPresignedFields = method === 'POST_FORM_FIELDS' && prepOut?.uploadFields && typeof prepOut.uploadFields === 'object';
    const isPutBlobDirect = method === 'PUT_BLOB';
    let putBody = null;
    let putMethod = 'POST';
    if (isPutBlobDirect) {
      putMethod = 'PUT';
      putBody = finalBlob;
    } else if (hasPresignedFields) {
      const entries = Object.entries(prepOut.uploadFields || {});
      for (const [k, v] of entries) {
        const sVal = (v === null || v === undefined) ? '' : String(v);
        formData.append(k, sVal);
      }
      formData.append('file', finalBlob, filename);
      putBody = formData;
    } else {
      formData.append('file', finalBlob, filename);
      putBody = formData;
    }
    let put;
    try {
      const prepHeaders = (prepOut?.headers && typeof prepOut.headers === 'object') ? prepOut.headers : {};
      const extraHdrs = {};
      for (const [k, v] of Object.entries(prepHeaders)) {
        if (!v) continue;
        const kLower = k.toLowerCase();
        if (!isPutBlobDirect && kLower === 'content-type') continue;
        extraHdrs[k] = String(v);
      }
      if (isPutBlobDirect && !extraHdrs['content-type'] && !extraHdrs['Content-Type']) {
        extraHdrs['content-type'] = finalBlob.type || contentType || 'application/octet-stream';
      }
      put = await fetchWithTimeout(uploadUrl, {
        method: putMethod,
        ...(Object.keys(extraHdrs).length > 0 ? { headers: extraHdrs } : {}),
        body: putBody,
      }, timeoutPut);
    } catch (e) {
      if (isPutBlobDirect) throw e;
      throw new Error('Fallo al subir el audio al bucket final. Revisa tu internet e inténtalo de nuevo.');
    }
    const putStatus = put ? put.status : 0;
    if (!put || putStatus < 200 || putStatus >= 300) {
      const textResp = put ? await put.text().catch(() => '') : '';
      const errOut = parseJsonSafe(textResp);
      const msg = (errOut?.detail || errOut?.error || `No se completó la subida final (HTTP ${putStatus}).`).toString();
      throw new Error(msg);
    }
    let finalUrl = initialUrl;
    const needsFetchSignedUrl = Boolean(prepOut?.needsFetchSignedUrl) || !finalUrl;
    if (needsFetchSignedUrl && key) {
      const signedResp = await fetchWithTimeout('/api/upload-audio-supabase', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ fetchSignedUrl: true, key }),
      }, timeoutPrep);
      const signedRaw = await signedResp.text().catch(() => '');
      const signedOut = parseJsonSafe(signedRaw);
      if (!(signedResp.ok && signedOut?.ok)) {
        throw new Error((signedOut?.detail || signedOut?.error || `No pude obtener la URL final del audio (HTTP ${signedResp.status}).`).toString());
      }
      finalUrl = (signedOut?.url || '').toString().trim() || finalUrl;
    }
    if (!finalUrl) throw new Error('No recibí la URL final del audio.');
    return { url: finalUrl, key };
  } catch (e) {
    const msg = (e instanceof Error ? e.message : String(e || '')).toString();
    if (msg && /\(supabase_inline_oversize_skip\)/i.test(msg)) {
      const prepRetry = await fetchWithTimeout('/api/upload-audio-supabase', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ title: name, contentType }),
      }, timeoutPrep);
      const prepRaw2 = await prepRetry.text().catch(() => '');
      const prepOut2 = parseJsonSafe(prepRaw2);
      if (!(prepRetry.ok && prepOut2?.ok)) {
        throw new Error((prepOut2?.detail || prepOut2?.error || `No pude preparar la subida final (HTTP ${prepRetry.status}).`).toString());
      }
      const retryUploadUrl = (prepOut2?.uploadUrl || '').toString().trim();
      const retryKey = (prepOut2?.key || '').toString().trim();
      const retryInitialUrl = (prepOut2?.url || '').toString().trim();
      if (!retryUploadUrl || !retryKey) {
        throw new Error('No recibí la URL de subida final del audio.');
      }

      const retryMethod = String(prepOut2?.uploadMethod || prepOut2?.via || 'POST_FORM').toUpperCase();
      const retryHasPresignedFields = retryMethod === 'POST_FORM_FIELDS' && prepOut2?.uploadFields && typeof prepOut2.uploadFields === 'object';
      const retryIsPutBlobDirect = retryMethod === 'PUT_BLOB';
      const retryFilename = name && name.trim() ? name.trim() : (file?.name || 'audio.mp3').toString().trim();
      const retryBlob = file instanceof Blob ? file : new Blob([file], { type: contentType });
      let retryBody = null;
      let retryPutMethod = 'POST';
      if (retryIsPutBlobDirect) {
        retryPutMethod = 'PUT';
        retryBody = retryBlob;
      } else if (retryHasPresignedFields) {
        const retryForm = new FormData();
        for (const [k, v] of Object.entries(prepOut2.uploadFields || {})) {
          retryForm.append(k, v === null || v === undefined ? '' : String(v));
        }
        retryForm.append('file', retryBlob, retryFilename);
        retryBody = retryForm;
      } else {
        const retryForm = new FormData();
        retryForm.append('file', retryBlob, retryFilename);
        retryBody = retryForm;
      }

      const retryHeaders = (prepOut2?.headers && typeof prepOut2.headers === 'object') ? prepOut2.headers : {};
      const retryExtraHdrs = {};
      for (const [k, v] of Object.entries(retryHeaders)) {
        if (!v) continue;
        const kLower = k.toLowerCase();
        if (!retryIsPutBlobDirect && kLower === 'content-type') continue;
        retryExtraHdrs[k] = String(v);
      }
      if (retryIsPutBlobDirect && !retryExtraHdrs['content-type'] && !retryExtraHdrs['Content-Type']) {
        retryExtraHdrs['content-type'] = retryBlob.type || contentType || 'application/octet-stream';
      }

      const retryPut = await fetchWithTimeout(retryUploadUrl, {
        method: retryPutMethod,
        ...(Object.keys(retryExtraHdrs).length > 0 ? { headers: retryExtraHdrs } : {}),
        body: retryBody,
      }, timeoutPut);
      const retryPutText = await retryPut.text().catch(() => '');
      if (!retryPut.ok) {
        const retryErrOut = parseJsonSafe(retryPutText);
        throw new Error((retryErrOut?.detail || retryErrOut?.error || `No se completó la subida final (HTTP ${retryPut.status}).`).toString());
      }

      let retryFinalUrl = retryInitialUrl;
      const retryNeedsFetchSignedUrl = Boolean(prepOut2?.needsFetchSignedUrl) || !retryFinalUrl;
      if (retryNeedsFetchSignedUrl && retryKey) {
        const signedResp = await fetchWithTimeout('/api/upload-audio-supabase', {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
          body: JSON.stringify({ fetchSignedUrl: true, key: retryKey }),
        }, timeoutPrep);
        const signedRaw = await signedResp.text().catch(() => '');
        const signedOut = parseJsonSafe(signedRaw);
        if (!(signedResp.ok && signedOut?.ok)) {
          throw new Error((signedOut?.detail || signedOut?.error || `No pude obtener la URL final del audio (HTTP ${signedResp.status}).`).toString());
        }
        retryFinalUrl = (signedOut?.url || '').toString().trim() || retryFinalUrl;
      }

      if (!retryFinalUrl) throw new Error('No recibí la URL final del audio.');
      return { url: retryFinalUrl, key: retryKey };
    }
    throw e;
  }
};

function ApprovedCreateContent(props) {
  const {
    credits = 0,
    onSongCreated,
    onGoLibrary,
    onOpenBalance,
    prefill,
    prefillNonce,
  } = props || {};

  const [step, setStep] = useState(0);
  const [creativity, setCreativity] = useState(75);
  const [instruction, setInstruction] = useState(70);
  const [audioWeight, setAudioWeight] = useState(30);
  const [toast, setToast] = useState("");
  const [data, setData] = useState({
    lyrics: "",
    lyricsMode: "manual",
    lyricInstruction: "",
    aiLyricsGenerated: false,
    style: "",
    styleOriginal: "",
    styleTranslated: false,
    negative: "",
    model: "SUNO V5",
    voice: "standard",
    vocalGender: "",
    voiceProfile: null,
    audioSource: "none",
    file: null,
    title: "",
  });
  const [audioUploadUrl, setAudioUploadUrl] = useState("");
  const [audioUploadPath, setAudioUploadPath] = useState("");
  const [isUploadingAudio, setIsUploadingAudio] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isGeneratingLyrics, setIsGeneratingLyrics] = useState(false);
  const [isBoostingStyle, setIsBoostingStyle] = useState(false);
  const [isTranslatingStyle, setIsTranslatingStyle] = useState(false);
  const [isTranscribingAudioLyrics, setIsTranscribingAudioLyrics] = useState(false);
  const [audioLyricsStatus, setAudioLyricsStatus] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [creditsGate, setCreditsGate] = useState(null);
  const [hasPendingTask, setHasPendingTask] = useState(false);
  const [audioUploadError, setAudioUploadError] = useState("");
  const [generationSession, setGenerationSession] = useState(() => readGenerationSession());
  const [currentPendingTask, setCurrentPendingTask] = useState(null);
  const audioRequestVersionRef = useRef(0);

  useEffect(() => { ensureAnonSession().catch(() => {}); }, []);

  useEffect(() => {
    const readList = () => {
      try {
        const raw = window.localStorage.getItem(pendingListKey);
        const arr = raw ? JSON.parse(raw) : null;
        return Array.isArray(arr) ? arr : [];
      } catch { return []; }
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
      } catch { return readList(); }
    };
    const tick = () => {
      const list = migrateLegacyIfNeeded();
      setHasPendingTask(Array.isArray(list) && list.length > 0);
      const session = readGenerationSession();
      setGenerationSession(session);
      const taskId = typeof session?.taskId === 'string' ? session.taskId.trim() : '';
      const match = taskId ? (Array.isArray(list) ? list.find((item) => String(item?.taskId || '').trim() === taskId) : null) : null;
      setCurrentPendingTask(match || null);
    };
    tick();
    const id = window.setInterval(tick, 1500);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!prefillNonce) return;
    if (!prefill) return;
    if (prefill.type !== 'cover') return;
    const song = prefill.song;
    const rawUrl = (song?.audioUrl || '').toString().trim();
    const deriveAudioPath = (value) => {
      const src = (value || '').toString().trim();
      if (!src) return '';
      const normalizeKey = (raw) => {
        const key = (raw || '').toString().trim().replace(/^\/+/, '');
        if (!key) return '';
        const prefixes = ['uploads/audio/', 'uploads/', 'imports/'];
        for (const prefix of prefixes) {
          const idx = key.indexOf(prefix);
          if (idx >= 0) return key.slice(idx);
        }
        return '';
      };
      if (src.startsWith('http')) {
        try {
          const u = new URL(src);
          return normalizeKey(u.pathname || '');
        } catch { return ''; }
      }
      return normalizeKey(src);
    };
    setAudioUploadUrl(rawUrl);
    const nextAudioPath = ((song || {}).audioPath || '').toString().trim() || deriveAudioPath(rawUrl) || '';
    setAudioUploadPath(nextAudioPath);
    setIsUploadingAudio(false);
    setUploadProgress(100);
    setData((prev) => ({
      ...prev,
      audioSource: 'upload',
      title: (song?.title || 'Cover').toString().slice(0, 100),
      lyrics: typeof song?.lyrics === 'string' && song.lyrics.trim() ? song.lyrics : prev.lyrics,
      style: typeof song?.description === 'string' && song.description.trim() ? song.description : prev.style,
    }));
  }, [prefillNonce, prefill]);

  const removeSelectedAudio = (options) => {
    const nextAudioSource = typeof options?.nextAudioSource === 'string' ? options.nextAudioSource : 'upload';
    audioRequestVersionRef.current += 1;
    setAudioUploadUrl('');
    setAudioUploadPath('');
    setIsUploadingAudio(false);
    setUploadProgress(0);
    setAudioUploadError('');
    setIsTranscribingAudioLyrics(false);
    setAudioLyricsStatus('');
    setData((prev) => ({
      ...prev,
      audioSource: nextAudioSource,
      file: null,
      lyrics: '',
      aiLyricsGenerated: false,
    }));
  };

  const uploadAudio = async (file) => {
    const requestVersion = audioRequestVersionRef.current + 1;
    audioRequestVersionRef.current = requestVersion;
    setIsUploadingAudio(true);
    setAudioUploadUrl('');
    setAudioUploadPath('');
    setUploadProgress(0);
    setAudioUploadError('');
    setAudioLyricsStatus('');
    try {
      const t = await getAccessToken();
      if (!t.ok) {
        if (requestVersion !== audioRequestVersionRef.current) return;
        setAudioUploadError(t.error || 'No se pudo iniciar sesión.');
        setToast(t.error || 'No se pudo iniciar sesión.');
        return;
      }
      if (requestVersion !== audioRequestVersionRef.current) return;
      setUploadProgress(40);
      const uploaded = await uploadAudioForVoice(t.token, file);
      if (requestVersion !== audioRequestVersionRef.current) return;
      setAudioUploadUrl((uploaded?.url || '').toString().trim());
      setAudioUploadPath((uploaded?.key || '').toString().trim());
      setUploadProgress(100);
      setAudioUploadError('');
      setToast('Audio MP3 subido correctamente.');
    } catch (e) {
      if (requestVersion !== audioRequestVersionRef.current) return;
      const raw = e instanceof Error ? e.message : String(e || '');
      const looksLikeNetwork = /failed to fetch|networkerror|network error|load failed|fetch failed|typeerror.*failed|abort|timeout|net::/i.test(raw) || !raw.trim();
      const msg = looksLikeNetwork
        ? 'No se pudo conectar con el servidor para subir tu audio. Revisa tu internet e inténtalo de nuevo.'
        : raw || 'No se pudo subir el audio.';
      setAudioUploadUrl('');
      setAudioUploadPath('');
      setAudioUploadError(msg);
      setToast(msg);
    } finally {
      if (requestVersion !== audioRequestVersionRef.current) return;
      setIsUploadingAudio(false);
    }
  };

  const generateLyricsWithAI = async (forcedTopic) => {
    if (isGeneratingLyrics) return false;
    const topic = (forcedTopic || '').toString().trim() || data.lyricInstruction.trim() || data.style.trim() || data.lyrics.trim();
    if (!topic) {
      setToast('Escribe primero en el cuadro de instrucción de qué quieres que trate la canción.');
      return false;
    }
    setIsGeneratingLyrics(true);
    try {
      const t = await getAccessToken();
      if (!t.ok) {
        setToast(t.error || 'No se pudo iniciar sesión.');
        return false;
      }
      const response = await fetch('/api/ai/generate-lyrics', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${t.token}` },
        body: JSON.stringify({
          topic,
          gender: data.vocalGender === 'f' ? 'Femenino' : data.vocalGender === 'm' ? 'Masculino' : '',
          style: data.style.trim() || 'General',
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result?.ok === false) {
        setToast(result.error || result.message || 'No se pudo generar letras con IA.');
        return false;
      }
      const nextLyrics = (result?.lyrics || '').toString().trim();
      if (nextLyrics) {
        setData((prev) => ({ ...prev, aiLyricsGenerated: true, lyrics: normalizeLyricsTags(nextLyrics) }));
        return true;
      }
      setToast((result?.message || 'La IA no devolvió letra. Intenta con un tema más específico o espera unos minutos.').toString());
      return false;
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Error generando letras con IA.');
      return false;
    } finally {
      setIsGeneratingLyrics(false);
    }
  };

  const handleBoostStyle = async () => {
    const content = (data.style || '').trim();
    if (!content) {
      setToast('Escribe primero una instrucción musical para poder mejorarla.');
      return false;
    }
    if (isBoostingStyle) return false;
    const sourceLanguage = detectPromptLanguage(content);
    const translateText = async (text, targetLanguage) => {
      const rawText = (text || '').toString().trim();
      if (!rawText) return '';
      const langpair = targetLanguage === 'en' ? 'es|en' : 'en|es';
      const response = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(rawText)}&langpair=${langpair}`);
      const result = await response.json().catch(() => ({}));
      return (result?.responseData?.translatedText || '').toString().trim();
    };
    setIsBoostingStyle(true);
    try {
      const t = await getAccessToken();
      if (!t.ok) {
        setToast(t.error || 'No se pudo iniciar sesión.');
        return false;
      }
      const r = await fetch('/api/suno/boost-style', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${t.token}` },
        body: JSON.stringify({ content }),
      });
      const out = await r.json().catch(() => ({}));
      if (!r.ok) {
        setToast((out?.detail || out?.error || 'No se pudo mejorar la instrucción.').toString());
        return false;
      }
      const result = (out?.result || out?.data?.result || '').toString().trim();
      if (!result) {
        setToast('No recibí una instrucción mejorada.');
        return false;
      }
      let finalResult = result;
      const resultLanguage = detectPromptLanguage(result);
      if (resultLanguage !== sourceLanguage) {
        const translatedBack = await translateText(result, sourceLanguage);
        if (translatedBack) finalResult = translatedBack;
      }
      setData((prev) => ({ ...prev, style: finalResult, styleTranslated: false }));
      setToast('Instrucción mejorada correctamente.');
      return true;
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'No se pudo mejorar la instrucción.');
      return false;
    } finally {
      setIsBoostingStyle(false);
    }
  };

  const handleTranslateStyle = async () => {
    const sourceText = (data.style || '').trim();
    if (!sourceText) {
      setToast('Escribe primero una instrucción musical para poder traducirla.');
      return false;
    }
    if (isTranslatingStyle) return false;
    const sourceLanguage = detectPromptLanguage(sourceText);
    const targetLanguage = sourceLanguage === 'en' ? 'es' : 'en';
    setIsTranslatingStyle(true);
    try {
      const response = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(sourceText)}&langpair=${sourceLanguage}|${targetLanguage}`);
      const result = await response.json().catch(() => ({}));
      const translatedText = (result?.responseData?.translatedText || '').toString().trim();
      if (!response.ok || !translatedText) {
        setToast(targetLanguage === 'en' ? 'No se pudo traducir la instrucción al inglés.' : 'No se pudo traducir la instrucción al español.');
        return false;
      }
      setData((prev) => ({ ...prev, styleOriginal: sourceText, styleTranslated: true, style: translatedText }));
      setToast(targetLanguage === 'en' ? 'Instrucción traducida al inglés.' : 'Instrucción traducida al español.');
      return true;
    } catch {
      setToast(targetLanguage === 'en' ? 'No se pudo traducir la instrucción al inglés.' : 'No se pudo traducir la instrucción al español.');
      return false;
    } finally {
      setIsTranslatingStyle(false);
    }
  };

  const handleToggleNotifications = async (nextValue) => {
    const session = readGenerationSession();
    if (!session) return false;
    if (!nextValue) {
      const nextSession = { ...session, notifyWhenReady: false, updatedAt: Date.now() };
      writeGenerationSession(nextSession);
      setGenerationSession(nextSession);
      return true;
    }
    if (typeof Notification === 'undefined') {
      const nextSession = { ...session, notifyWhenReady: false, updatedAt: Date.now() };
      writeGenerationSession(nextSession);
      setGenerationSession(nextSession);
      return false;
    }
    let permission = Notification.permission;
    if (permission === 'default') {
      try {
        permission = await Notification.requestPermission();
      } catch {
        permission = Notification.permission;
      }
    }
    const enabled = permission === 'granted';
    const nextSession = {
      ...session,
      notifyWhenReady: enabled,
      notificationPermission: permission,
      updatedAt: Date.now(),
    };
    writeGenerationSession(nextSession);
    setGenerationSession(nextSession);
    if (enabled) setToast('Te notificaremos cuando estén listas.');
    return enabled;
  };

  const transcribeLyricsFromAudio = async () => {
    if (!audioUploadUrl) return;
    if (isTranscribingAudioLyrics) return;
    const requestVersion = audioRequestVersionRef.current;
    setIsTranscribingAudioLyrics(true);
    setAudioLyricsStatus('Transcribiendo letra…');
    try {
      const t = await getAccessToken();
      if (!t.ok) {
        if (requestVersion !== audioRequestVersionRef.current) return;
        setAudioLyricsStatus(t.error || 'No se pudo transcribir automáticamente. Puedes escribir la letra manualmente.');
        return;
      }
      const guessMimeType = (u) => {
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
      const byName = (data.file?.name || '').toString().trim().toLowerCase();
      const mimeType = ((data.file?.type || '').toString().trim() || (byName.endsWith('.mp3') ? 'audio/mpeg' : '') || guessMimeType(audioUploadUrl)).trim();
      const r = await fetch('/api/ai/transcribe-lyrics', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${t.token}` },
        body: JSON.stringify({ uploadUrl: audioUploadUrl, mimeType }),
      });
      const out = await r.json().catch(() => ({}));
      if (requestVersion !== audioRequestVersionRef.current) return;
      if (!r.ok || out?.ok === false) {
        setAudioLyricsStatus((out?.message || out?.detail || out?.error || 'No se pudo transcribir automáticamente. Puedes escribir la letra manualmente.').toString());
        return;
      }
      const status = (out?.status || '').toString().trim().toUpperCase();
      if (status === 'ILEGIBLE' || status === 'SIN_LETRA') {
        setAudioLyricsStatus((out?.message || 'No pude transcribir la letra automáticamente. Puedes escribirla manualmente.').toString());
        return;
      }
      const text = (out?.lyrics || out?.text || '').toString().trim();
      if (!text) {
        setAudioLyricsStatus('No pude detectar la letra automáticamente. Puedes escribirla manualmente.');
        return;
      }
      setData((prev) => ({ ...prev, lyrics: normalizeLyricsTags(text) }));
      setAudioLyricsStatus('');
      setToast('Letra detectada del audio. Puedes revisarla y editarla en el paso 2.');
    } catch {
      if (requestVersion !== audioRequestVersionRef.current) return;
      setAudioLyricsStatus('No se pudo transcribir automáticamente. Puedes escribir la letra manualmente.');
    } finally {
      if (requestVersion !== audioRequestVersionRef.current) return;
      setIsTranscribingAudioLyrics(false);
    }
  };

  useEffect(() => {
    if (!audioUploadUrl) return;
    setUploadProgress(100);
    transcribeLyricsFromAudio().catch(() => {});
  }, [audioUploadUrl]);

  const handleSubmitGenerate = async () => {
    if (isSubmitting) return false;
    const normalizedSongTitle = (data.title || 'Nueva Canción').toString().trim().slice(0, 100) || 'Nueva Canción';
    const baseLyrics = data.lyrics.trim() ? normalizeLyricsTags(stripTitleFromLyrics(normalizedSongTitle, data.lyrics)) : '';
    const requiresUploadedAudio = data.audioSource === 'upload';
    const hasAudioCover = Boolean(audioUploadUrl);
    if (requiresUploadedAudio && !hasAudioCover) {
      const msg = audioUploadError || 'Tu audio todavía no tiene una URL final válida. Espera a que termine de subirse o vuelve a intentarlo antes de generar el cover.';
      setToast(msg);
      return false;
    }
    if (!hasAudioCover && !baseLyrics.trim() && !data.style.trim()) {
      setToast('Necesitamos la letra o al menos una descripción del estilo para crear la canción.');
      return false;
    }

    const costPerSong = 12;
    if ((credits || 0) < costPerSong) {
      if (onOpenBalance) onOpenBalance();
      setCreditsGate({
        title: 'Créditos insuficientes',
        message: `Necesitas al menos ${costPerSong} créditos para generar una canción. Tu saldo actual es ${(credits || 0).toFixed(1)}.`,
      });
      return false;
    }

    setIsSubmitting(true);
    try {
      const t = await getAccessToken();
      if (!t.ok) {
        setToast(t.error || 'No se pudo iniciar sesión.');
        return false;
      }

      let prompt = '';
      if (hasAudioCover) {
        prompt = baseLyrics.trim() ? baseLyrics : (data.style.trim() || 'Cover del audio proporcionado');
      } else {
        prompt = baseLyrics.trim() ? baseLyrics : (data.style.trim() || '');
      }
      if (!prompt) {
        setToast('Escribe una descripción o letra para crear la canción.');
        return false;
      }

      const modelMap = {
        'SUNO V4': 'V4',
        'SUNO V4.5': 'V4_5',
        'SUNO V4.5 Plus': 'V4_5PLUS',
        'SUNO V4.5 All': 'V4_5ALL',
        'SUNO V5': 'V5',
        'SUNO V5.5': 'V5_5',
      };
      const modelCode = modelMap[data.model] || 'V5';
      const hasSelectedVoice = Boolean(data.voice === 'clone' && data.voiceProfile?.voiceId);
      if (hasSelectedVoice && !(modelCode === 'V5' || modelCode === 'V5_5')) {
        setToast('La voz clonada solo es compatible con V5 o V5.5. Cambia el modelo para continuar.');
        return false;
      }
      const requestedVocalGender = !hasSelectedVoice
        ? (data.vocalGender === 'f' ? 'f' : data.vocalGender === 'm' ? 'm' : undefined)
        : undefined;
      const wantsCustomMode = true;
      const payload = {
        prompt,
        instrumental: false,
        customMode: wantsCustomMode,
        model: modelCode,
        vocalGender: requestedVocalGender,
      };

      if (hasAudioCover) {
        payload.audioUrl = audioUploadUrl || undefined;
        payload.audioPath = audioUploadPath || undefined;
        payload.audioAction = 'cover';
      }

      if (wantsCustomMode) {
        const mergedLower = `${data.style.toString().trim().toLowerCase()}\n${prompt.toLowerCase()}`;
        const genrePhrases = [
          'regional mexicano', 'corrido tumbado', 'corridos tumbados', 'corridos', 'corrido',
          'banda', 'norteño', 'norteno', 'sierreño', 'mariachi', 'cumbia',
          'reggaetón', 'reggaeton', 'salsa', 'bachata', 'merengue',
        ];
        const inferredGenre = genrePhrases.find((g) => mergedLower.includes(g)) || '';
        const baseStyle = data.style.toString().trim();
        const hasJazzMention = mergedLower.includes('jazz');
        let finalStyle = baseStyle;
        if (!finalStyle) {
          finalStyle = inferredGenre ? `Género: ${inferredGenre}` : 'General';
        } else if (inferredGenre && !baseStyle.toLowerCase().includes(inferredGenre)) {
          finalStyle = `${baseStyle}\nGénero: ${inferredGenre}`;
        }
        const styleWithGender = !hasSelectedVoice
          ? [finalStyle, requestedVocalGender ? `Voz deseada: ${requestedVocalGender === 'f' ? 'Femenino' : requestedVocalGender === 'm' ? 'Masculino' : 'Auto'}.` : ''].filter(Boolean).join('\n')
          : finalStyle;
        payload.style = styleWithGender.slice(0, 1000);
        payload.title = normalizedSongTitle;
        payload.weirdnessConstraint = creativity / 100;
        payload.styleWeight = instruction / 100;
        payload.audioWeight = audioWeight / 100;
        if (inferredGenre && !hasJazzMention) {
          payload.negativeTags = 'jazz, swing, bebop, saxophone';
        }
        if (data.negative && data.negative.trim()) {
          payload.negativeTags = [payload.negativeTags, data.negative.trim()].filter(Boolean).join(', ');
        }
      }
      if (hasSelectedVoice) {
        payload.personaId = String(data.voiceProfile.voiceId || '').trim();
        payload.personaModel = 'voice_persona';
      }

      const submitUrl = hasAudioCover ? '/api/suno/upload-cover' : '/api/suno/generate';
      const submitPayload = hasAudioCover
        ? {
            uploadUrl: audioUploadUrl,
            uploadBucket: audioUploadPath ? 'ramber-tunes' : undefined,
            uploadPath: audioUploadPath || undefined,
            instrumental: false,
            prompt,
            style: payload.style || data.style.toString().trim() || 'General',
            title: normalizedSongTitle,
            model: modelCode,
            weirdnessConstraint: creativity / 100,
            styleWeight: instruction / 100,
            audioWeight: audioWeight / 100,
            vocalGender: requestedVocalGender,
            negativeTags: payload.negativeTags,
            personaId: payload.personaId,
            personaModel: payload.personaModel,
          }
        : payload;

      const r = await fetch(submitUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${t.token}`,
        },
        body: JSON.stringify(submitPayload),
      });
      const out = await r.json().catch(() => ({}));
      if (!r.ok) {
        const msg = toUserFriendlySunoError(out, 'No se pudo crear la canción.');
        const raw = (out?.detail || out?.error || out?.message || '').toString().trim().toLowerCase();
        const isPlanExpired = raw.includes('paquete vencio') || raw.includes('paquete venció') || (raw.includes('plan') && (raw.includes('vencio') || raw.includes('venció')));
        const isCreditsExpired = raw.includes('creditos han vencido') || raw.includes('créditos han vencido') || raw.includes('tus creditos han vencido') || raw.includes('tus créditos han vencido');
        if (isPlanExpired || isCreditsExpired) {
          setCreditsGate({
            title: isPlanExpired ? 'Plan vencido' : 'Créditos vencidos',
            message: isPlanExpired ? 'Tu plan está vencido. Para seguir creando canciones, necesitas recargar.' : 'Tus créditos vencieron. Para seguir creando canciones, necesitas recargar.',
          });
          return false;
        }
        const looksLikeVoiceExpired = raw.includes('voice has expired') || (raw.includes('voice') && raw.includes('expired')) || (raw.includes('persona') && raw.includes('expired'));
        if (hasSelectedVoice && looksLikeVoiceExpired) {
          setData((prev) => ({ ...prev, voiceProfile: null }));
          const retryPayload = hasAudioCover
            ? {
                uploadUrl: audioUploadUrl,
                uploadBucket: audioUploadPath ? 'ramber-tunes' : undefined,
                uploadPath: audioUploadPath || undefined,
                instrumental: false,
                prompt,
                style: payload.style,
                title: normalizedSongTitle,
                model: modelCode,
                vocalGender: requestedVocalGender,
                weirdnessConstraint: creativity / 100,
                styleWeight: instruction / 100,
                audioWeight: audioWeight / 100,
                negativeTags: payload.negativeTags,
              }
            : {
                prompt,
                instrumental: false,
                customMode: true,
                model: modelCode,
                vocalGender: requestedVocalGender,
                style: payload.style,
                title: normalizedSongTitle,
                weirdnessConstraint: creativity / 100,
                styleWeight: instruction / 100,
                audioWeight: audioWeight / 100,
                negativeTags: payload.negativeTags,
              };
          const rr = await fetch(hasAudioCover ? '/api/suno/upload-cover' : '/api/suno/generate', {
            method: 'POST',
            headers: { 'content-type': 'application/json', authorization: `Bearer ${t.token}` },
            body: JSON.stringify(retryPayload),
          });
          const out2 = await rr.json().catch(() => ({}));
          if (!rr.ok) {
            setToast(toUserFriendlySunoError(out2, 'No se pudo crear la canción.'));
            return false;
          }
          const taskId2 = typeof out2?.taskId === 'string' ? out2.taskId : '';
          if (!taskId2) {
            setToast('No recibí taskId del servidor.');
            return false;
          }
          try {
            const rawPending = window.localStorage.getItem(pendingListKey);
            const arrPending = rawPending ? JSON.parse(rawPending) : [];
            const listPending = Array.isArray(arrPending) ? arrPending : [];
            listPending.push({
              taskId: taskId2,
              kind: hasAudioCover ? 'upload-cover' : 'generate',
              startedAt: Date.now(),
              draft: {
                title: normalizedSongTitle,
                description: data.style.toString(),
                lyrics: baseLyrics || null,
                prompt,
                model: modelCode,
                genre: requestedVocalGender || '',
                isCover: hasAudioCover,
              },
            });
            window.localStorage.setItem(pendingListKey, JSON.stringify(listPending));
            try { window.localStorage.removeItem(pendingLegacyKey); } catch {}
          } catch {}
          setToast('La voz que elegiste expiró. Se generará la canción sin esa voz. Si quieres una voz, elige otra en “Clonador”.');
          if (onGoLibrary) setTimeout(() => onGoLibrary(), 1200);
          return true;
        }
        setToast(msg);
        return false;
      }

      const taskId = typeof out?.taskId === 'string' ? out.taskId : '';
      if (!taskId) {
        setToast('No recibí taskId del servidor.');
        return false;
      }
      try {
        const raw = window.localStorage.getItem(pendingListKey);
        const arr = raw ? JSON.parse(raw) : [];
        const list = Array.isArray(arr) ? arr : [];
        const acceptedAt = Date.now();
        list.push({
          taskId,
          kind: hasAudioCover ? 'upload-cover' : 'generate',
          startedAt: acceptedAt,
          draft: {
            title: normalizedSongTitle,
            description: data.style.toString(),
            lyrics: baseLyrics || null,
            prompt,
            model: modelCode,
            genre: requestedVocalGender || '',
            isCover: hasAudioCover,
          },
        });
        window.localStorage.setItem(pendingListKey, JSON.stringify(list));
        try { window.localStorage.removeItem(pendingLegacyKey); } catch {}
        const session = {
          taskId,
          kind: hasAudioCover ? 'upload-cover' : 'generate',
          title: normalizedSongTitle,
          startedAt: acceptedAt,
          expectedTrackCount: 2,
          readyTrackCount: 0,
          notifyWhenReady: Boolean(readGenerationSession()?.notifyWhenReady),
          notificationPermission: typeof Notification !== 'undefined' ? Notification.permission : 'default',
          completedAt: null,
          failedAt: null,
          error: '',
          updatedAt: acceptedAt,
        };
        writeGenerationSession(session);
        setGenerationSession(session);
        const match = list.find((item) => String(item?.taskId || '').trim() === taskId) || null;
        setCurrentPendingTask(match);
      } catch {}
      setToast('¡Se aceptó la generación! Te mostraremos el progreso real aquí mismo.');
      return true;
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Error creando la canción');
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  const sharedHandlers = {
    uploadAudio,
    generateLyricsWithAI,
    handleBoostStyle,
    handleTranslateStyle,
    handleSubmitGenerate,
    isUploadingAudio,
    uploadProgress,
    isGeneratingLyrics,
    isTranscribingAudioLyrics,
    audioLyricsStatus,
    isBoostingStyle,
    isTranslatingStyle,
    isSubmitting,
    creditsGate,
    setCreditsGate,
    onOpenBalance,
    credits,
    hasPendingTask,
    audioUploadUrl,
    audioUploadError,
    hasUploadedAudio: Boolean(audioUploadUrl),
    handleToggleNotifications,
    clearAudioTranscriptionState: () => setAudioLyricsStatus(''),
    removeSelectedAudio,
  };

  useEffect(() => {
    if (!generationSession?.failedAt) return;
    setToast(generationSession.error || 'La generación no pudo completarse.');
    clearGenerationSession();
    setGenerationSession(null);
    setCurrentPendingTask(null);
  }, [generationSession?.failedAt]);

  const isGeneratingViewOpen = Boolean(generationSession?.taskId && !generationSession?.failedAt);
  const content = useMemo(() => {
    if (isGeneratingViewOpen) {
      return (
        <GeneratingSongsView
          session={generationSession}
          pendingItem={currentPendingTask}
          onGoLibrary={onGoLibrary}
          onToggleNotify={handleToggleNotifications}
          onClearSession={() => {
            clearGenerationSession();
            setGenerationSession(null);
            setCurrentPendingTask(null);
            setStep(0);
          }}
        />
      );
    }
    return step === 0 ? <StartStep data={data} setData={setData} setToast={setToast} handlers={sharedHandlers} /> :
      step === 1 ? <LyricsStep data={data} setData={setData} setToast={setToast} handlers={sharedHandlers} /> :
      step === 2 ? <StyleStep data={data} setData={setData} creativity={creativity} setCreativity={setCreativity} instruction={instruction} setInstruction={setInstruction} audioWeight={audioWeight} setAudioWeight={setAudioWeight} setToast={setToast} handlers={sharedHandlers} /> :
      <ReviewStep data={data} setData={setData} creativity={creativity} instruction={instruction} audioWeight={audioWeight} setToast={setToast} handlers={sharedHandlers} />;
  },
    [isGeneratingViewOpen, generationSession, currentPendingTask, step, data, creativity, instruction, audioWeight, isUploadingAudio, isGeneratingLyrics, isSubmitting, creditsGate, credits, hasPendingTask]
  );

  return (
    <div className="approved-flow-shell">
      <main className="main-area" style={isGeneratingViewOpen ? { gridTemplateRows: 'minmax(0,1fr)' } : undefined}>
        {!isGeneratingViewOpen ? <Stepper step={step} onStep={setStep} /> : null}
        <div className="content-area">
          {content}
          {!isGeneratingViewOpen ? (
            <footer className="step-footer">
              {step > 0 && (
                <button className="back-button" onClick={() => setStep(step - 1)}>
                  <ArrowLeft size={20} />
                  {`Volver a ${steps[step - 1]}`}
                </button>
              )}
              {step < 3 && (
                <button className="next-button" onClick={() => setStep(step + 1)}>
                  Continuar a {steps[step + 1]}
                  <ArrowRight size={21} />
                </button>
              )}
            </footer>
          ) : null}
        </div>
      </main>
      {creditsGate ? (
        <div className="toast" style={{ background: 'rgba(20,15,35,0.95)', border: '1px solid rgba(184,100,240,0.4)', top: '16px', bottom: 'auto', flexDirection: 'column', alignItems: 'stretch', gap: 12, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div style={{ fontWeight: 900, fontSize: 16, color: '#fff' }}>{creditsGate.title}</div>
              <div style={{ fontSize: 13, color: '#c9c9d6', marginTop: 4, whiteSpace: 'pre-line' }}>{creditsGate.message}</div>
            </div>
            <button onClick={() => setCreditsGate(null)} aria-label="Cerrar mensaje" style={{ background: 'transparent', border: 0, color: '#c9c9d6', cursor: 'pointer' }}><X size={18} /></button>
          </div>
          {onOpenBalance && (
            <button onClick={() => { setCreditsGate(null); onOpenBalance(); }} style={{ padding: '10px 16px', borderRadius: 999, border: 0, cursor: 'pointer', fontWeight: 800, background: 'linear-gradient(to right, #fde047, #fb923c)', color: '#111' }}>
              Obtener créditos
            </button>
          )}
        </div>
      ) : null}
      {toast && (
        <div className="toast">
          <Check size={20} />
          <span>{toast}</span>
          <button onClick={() => setToast("")} aria-label="Cerrar mensaje"><X size={18} /></button>
        </div>
      )}
    </div>
  );
}

export function ApprovedCreatePreview(props) {
  const hostRef = useRef(null);
  const [shadowRoot, setShadowRoot] = useState(null);
  useEffect(() => {
    if (!hostRef.current) return;
    const root = hostRef.current.shadowRoot || hostRef.current.attachShadow({ mode: "open" });
    setShadowRoot(root);
  }, []);
  return (
    <div ref={hostRef} style={{ height: "100%", minHeight: 0, width: "100%" }}>
      {shadowRoot ? createPortal(
        <><style>{approvedCss}</style><ApprovedCreateContent {...(props || {})} /></>,
        shadowRoot
      ) : null}
    </div>
  );
}

function ApprovedCloneVoiceContent({ onClose }) {
  const [toast, setToast] = useState("");
  return <div className="approved-clone-shell">
    <CloneVoiceWizard
      setToast={setToast}
      onClose={onClose}
      onComplete={(voiceProfile) => setToast(`Perfil ${voiceProfile.name} listo para usar.`)}
    />
    {toast && <div className="toast"><Check size={20}/><span>{toast}</span><button onClick={()=>setToast("")} aria-label="Cerrar mensaje"><X size={18}/></button></div>}
  </div>;
}

const approvedCloneCss = approvedCss + `
.approved-clone-shell{position:relative;height:100%;min-height:0;overflow:hidden;background:radial-gradient(circle at 70% 25%,rgba(66,38,105,.13),transparent 28%),var(--bg)}
.approved-clone-shell .wizard-overlay{position:absolute}
`;

export function ApprovedCloneVoicePreview({ onClose }) {
  const hostRef = useRef(null);
  const [shadowRoot, setShadowRoot] = useState(null);
  useEffect(() => {
    if (!hostRef.current) return;
    const root = hostRef.current.shadowRoot || hostRef.current.attachShadow({ mode: "open" });
    setShadowRoot(root);
  }, []);
  return <div ref={hostRef} style={{height:"100%",minHeight:0,width:"100%"}}>{shadowRoot ? createPortal(<><style>{approvedCloneCss}</style><ApprovedCloneVoiceContent onClose={onClose}/></>, shadowRoot) : null}</div>;
}
