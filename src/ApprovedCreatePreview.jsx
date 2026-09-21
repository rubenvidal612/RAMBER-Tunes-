import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, ArrowRight, Library as Books, BadgeCheck as Certificate,
  MessageCircle as ChatCircle, Check, Coins, Download as DownloadSimple,
  FileText, Film as FilmStrip, Folder, FolderOpen, Home as House, Info, List,
  MoreHorizontal,
  WandSparkles as MagicWand, Mic as Microphone, Music2 as MusicNote, Pause,
  Pencil as PencilSimple, Play, ListMusic as Playlist, CircleHelp as Question,
  Scissors, Share2 as ShareNetwork, SlidersHorizontal, Sparkles as Sparkle,
  Languages as Translate, Upload as UploadSimple, User, Users, Bell,
  AudioWaveform as Waveform, Image as ImageIcon, Trash2 as Trash, X, Loader2,
} from "lucide-react";
import approvedBaseCss from "./approved-create/styles.css?raw";
import approvedMenuCss from "./approved-create/menu-fix.css?raw";
import approvedCreditCss from "./approved-create/credit-fix.css?raw";
import approvedDesignCss from "./approved-create/design-v2.css?raw";
import approvedPlayerCss from "./approved-create/player-options.css?raw";
import { ensureAnonSession, getAccessToken } from "./lib/supabaseBrowser";

const pendingListKey = 'ramber.pendingSunoTasks_v1';
const pendingLegacyKey = 'ramber.pendingSunoTask';
const generationSessionKey = 'ramber.createGenerationSession_v1';
const sunoVoicesCacheKey = 'ramber.suno_voices_v1';
const returnToCreateVoicePickerKey = 'ramber.return_to_create_voice_picker_v1';
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
  for (const hint of spanishHints) if (` ${value} `.includes(hint)) esScore += 2;
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

function isFailureProviderStatus(value) {
  const s = String(value || '').trim().toUpperCase();
  if (!s) return false;
  if (s === 'FAILED') return true;
  if (s.endsWith('_FAILED')) return true;
  if (s === 'CALLBACK_EXCEPTION') return true;
  if (s === 'SENSITIVE_WORD_ERROR') return true;
  return false;
}

function getProviderPct(pendingItem, session) {
  const rawA = Number(pendingItem?.progressPct);
  const rawB = Number(session?.progressPct);
  const picked = Number.isFinite(rawA) ? rawA : Number.isFinite(rawB) ? rawB : null;
  if (picked == null) return null;
  return Math.max(0, Math.min(100, picked));
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
      const innerSafe = innerLower.normalize('NFKD').replaceAll(/[^\p{L}\p{N}\s-]+/gu, '').trim();
      const innerLooksLikeInstruction =
        Boolean(innerSafe) &&
        innerSafe.length <= 48 &&
        (innerIsTag ||
          innerSafe === 'instrumental' ||
          innerSafe.startsWith('intro ') ||
          innerSafe.startsWith('outro ') ||
          innerSafe.startsWith('final') ||
          innerSafe.startsWith('solo') ||
          innerSafe.startsWith('pausa') ||
          innerSafe.startsWith('break') ||
          innerSafe.startsWith('interludio') ||
          innerSafe.startsWith('voz ') ||
          innerSafe.startsWith('voces ') ||
          innerSafe.startsWith('sube ') ||
          innerSafe.startsWith('baja '));
      if (innerLooksLikeInstruction) return `[${inner}]`;
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
    if (s.endsWith(':') && s.length < 32) {
      const candidate = s.slice(0, -1).trim();
      const candidateLower = candidate.toLowerCase();
      const candidateIsTag =
        candidateLower === 'coro' || candidateLower.startsWith('coro ') ||
        candidateLower === 'chorus' || candidateLower.startsWith('chorus ') ||
        candidateLower.startsWith('verso') || candidateLower.startsWith('verse') ||
        candidateLower.startsWith('pre-coro') || candidateLower.startsWith('pre coro') ||
        candidateLower.startsWith('bridge') || candidateLower.startsWith('puente') ||
        candidateLower.startsWith('outro') || candidateLower.startsWith('intro');
      if (candidateIsTag) return `[${candidate}]`;
    }
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
  ["Suno V6", "Calidad total · Ideal para clonar voz"],
  ["Suno V6 Wild", "Estilos más creativos y arriesgados"],
  ["Suno V6 Mini", "Más rápido · Bueno para pruebas rápidas"],
];
const VALID_MODEL_NAMES = new Set(models.map(([name]) => name));
const normalizeModelName = (m) => VALID_MODEL_NAMES.has(m) ? m : "Suno V6";

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

function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      return Boolean(window.matchMedia(query).matches);
    } catch {
      return false;
    }
  });
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    let m = null;
    try {
      m = window.matchMedia(query);
    } catch {
      m = null;
    }
    if (!m) return undefined;
    const onChange = () => setMatches(Boolean(m.matches));
    onChange();
    if (typeof m.addEventListener === 'function') {
      m.addEventListener('change', onChange);
      return () => m.removeEventListener('change', onChange);
    }
    if (typeof m.addListener === 'function') {
      m.addListener(onChange);
      return () => m.removeListener(onChange);
    }
    return undefined;
  }, [query]);
  return matches;
}

function RangeSetting({ label, help, value, onChange, scrollGuard }) {
  const notRecommended = value >= 87;
  const touchStartRef = useRef(null);
  const touchModeRef = useRef('idle');
  const pendingValueRef = useRef(null);
  const onTouchStart = (e) => {
    if (!scrollGuard) return;
    const t = e.touches && e.touches[0];
    if (!t) return;
    touchStartRef.current = { x: t.clientX, y: t.clientY, value: Number(value || 0) };
    touchModeRef.current = 'unknown';
    pendingValueRef.current = null;
  };
  const onTouchMove = (e) => {
    if (!scrollGuard) return;
    const start = touchStartRef.current;
    const t = e.touches && e.touches[0];
    if (!start || !t) return;
    if (touchModeRef.current !== 'unknown') return;
    const dx = Math.abs(t.clientX - start.x);
    const dy = Math.abs(t.clientY - start.y);
    if (dy > 10 && dy > dx + 4) {
      touchModeRef.current = 'scroll';
      pendingValueRef.current = null;
      try {
        e.currentTarget.value = String(start.value);
      } catch {}
      return;
    }
    if (dx > 10 && dx > dy + 4) {
      touchModeRef.current = 'drag';
      const pending = pendingValueRef.current;
      if (pending != null) onChange(Number(pending));
    }
  };
  const onTouchEnd = (e) => {
    if (!scrollGuard) return;
    const mode = touchModeRef.current;
    const pending = pendingValueRef.current;
    const start = touchStartRef.current;
    if (mode === 'unknown' && pending != null) {
      onChange(Number(pending));
    }
    if (mode === 'scroll' && start) {
      onChange(Number(start.value));
      try {
        if (e && e.currentTarget) e.currentTarget.value = String(start.value);
      } catch {}
    }
    touchStartRef.current = null;
    touchModeRef.current = 'idle';
    pendingValueRef.current = null;
  };
  const handleValueChange = (e) => {
    const start = touchStartRef.current;
    if (!scrollGuard || !start) {
      onChange(Number(e.currentTarget.value));
      return;
    }
    const mode = touchModeRef.current;
    const next = Number(e.currentTarget.value);
    if (mode === 'scroll') {
      try {
        e.currentTarget.value = String(start.value);
      } catch {}
      return;
    }
    if (mode === 'unknown') {
      pendingValueRef.current = next;
      try {
        e.currentTarget.value = String(start.value);
      } catch {}
      return;
    }
    onChange(next);
  };
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
      <input
        aria-label={label}
        type="range"
        min="0"
        max="100"
        value={value}
        onInput={handleValueChange}
        onChange={handleValueChange}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      />
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
      <img className="brand-mark" src="/assets/luciana-logo-oficial.png?v=20260918-2" alt="Logo de LucIAna Music" />
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

function VoiceMeter({ onFinished, stream, mode = "default" }) {
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const audioContextRef = useRef(null);
  const animationRef = useRef(null);
  const ownsStreamRef = useRef(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState("");

  const stopListening = () => {
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    if (ownsStreamRef.current) streamRef.current?.getTracks().forEach((track) => track.stop());
    audioContextRef.current?.close();
    streamRef.current = null;
    audioContextRef.current = null;
    ownsStreamRef.current = false;
    setListening(false);
  };

  useEffect(() => () => stopListening(), []);

  const startListeningWithStream = async (nextStream) => {
    setError("");
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const context = new AudioContextClass();
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.78;
      context.createMediaStreamSource(nextStream).connect(analyser);
      streamRef.current = nextStream;
      audioContextRef.current = context;
      setListening(true);

      const data = new Uint8Array(analyser.frequencyBinCount);
      const draw = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        const dpr = Math.max(1, Number(window.devicePixelRatio) || 1);
        const clientWidth = Math.max(1, Math.floor(canvas.clientWidth || canvas.width || 620));
        const clientHeight = Math.max(1, Math.floor(canvas.clientHeight || canvas.height || 82));
        if (canvas.width !== clientWidth * dpr || canvas.height !== clientHeight * dpr) {
          canvas.width = clientWidth * dpr;
          canvas.height = clientHeight * dpr;
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const width = clientWidth;
        const height = clientHeight;
        analyser.getByteFrequencyData(data);
        ctx.clearRect(0, 0, width, height);
        const gradient = ctx.createLinearGradient(0, 0, width, 0);
        gradient.addColorStop(0, "#21c9a7");
        gradient.addColorStop(1, "#a764ed");
        ctx.fillStyle = gradient;
        const bars = 36;
        const half = Math.floor(bars / 2);
        const gap = 4;
        const centerGap = gap;
        const totalGaps = gap * Math.max(0, bars - 2) + centerGap;
        const barWidth = Math.max(2, (width - totalGaps) / bars);
        const centerX = width / 2;
        const leftStart = centerX - centerGap / 2 - barWidth;
        const rightStart = centerX + centerGap / 2;
        for (let index = 0; index < half; index += 1) {
          const dataIndex = Math.floor((index / half) * data.length);
          const raw = data[Math.max(0, Math.min(dataIndex, data.length - 1))] / 255;
          const value = Math.min(1, raw * 1.25);
          const barHeight = Math.max(5, value * (height - 8));
          const y = (height - barHeight) / 2;
          const xLeft = leftStart - index * (barWidth + gap);
          const xRight = rightStart + index * (barWidth + gap);
          ctx.beginPath();
          ctx.roundRect(xLeft, y, barWidth, barHeight, 4);
          ctx.roundRect(xRight, y, barWidth, barHeight, 4);
          ctx.fill();
        }
        animationRef.current = requestAnimationFrame(draw);
      };
      draw();
    } catch {
      setError("Permite el acceso al micrófono para que la barra pueda detectar tu voz.");
    }
  };

  const startListening = async () => {
    setError("");
    try {
      const nextStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      ownsStreamRef.current = true;
      await startListeningWithStream(nextStream);
    } catch {
      setError("Permite el acceso al micrófono para que la barra pueda detectar tu voz.");
    }
  };

  useEffect(() => {
    if (!stream) return;
    if (mode !== "indicator") return;
    stopListening();
    ownsStreamRef.current = false;
    startListeningWithStream(stream).catch(() => {});
    return () => stopListening();
  }, [stream, mode]);

  const finish = () => {
    stopListening();
    onFinished();
  };

  return (
    <div className="voice-meter">
      <div className={`voice-meter-display ${listening ? "active" : ""}`}>
        <canvas ref={canvasRef} width="620" height="82" style={{ width: "100%", height: 82, display: "block" }} aria-label="Medidor de intensidad de voz" />
        <span>{listening ? "Escuchando tu voz…" : "El medidor comenzará cuando actives el micrófono"}</span>
      </div>
      {error && <small className="voice-meter-error">{error}</small>}
      {mode !== "indicator" ? (
        !listening ? (
          <button className="wizard-next phrase-finish" onClick={startListening}>
            <Microphone size={19} /> Comenzar a cantar
          </button>
        ) : (
          <button className="wizard-next phrase-finish recording" onClick={finish}>
            <Check size={19} weight="bold" /> Terminé de cantar
          </button>
        )
      ) : null}
    </div>
  );
}

function CloneVoiceWizard({ onClose, onComplete, setToast, onShowAlert }) {
  const [wizardStep, setWizardStep] = useState(0);
  const showAlert = (input) => {
    if (typeof onShowAlert === "function") {
      onShowAlert(input);
      return;
    }
    const text = typeof input === "string" ? input : String(input?.message || "");
    if (text) setToast(text);
  };
  const [profile, setProfile] = useState({
    name: "",
    description: "",
    style: "Pop",
    level: "beginner",
    sourceAudio: null,
    verifyAudio: null,
    audioDuration: 420,
    start: 0,
    end: 10,
  });
  const [sourceUpload, setSourceUpload] = useState({ url: "", key: "", loading: false, error: "" });
  const [verifyUpload, setVerifyUpload] = useState({ clientAttemptId: "", url: "", key: "", loading: false, error: "" });
  const [validation, setValidation] = useState({
    clientAttemptId: "",
    taskId: "",
    status: "",
    phrase: "",
    loading: false,
    error: "",
  });
  const [voiceGen, setVoiceGen] = useState({
    taskId: "",
    status: "",
    voiceId: "",
    loading: false,
    error: "",
    isAvailable: null,
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const sourceUploadReqRef = useRef(0);
  const verifyUploadReqRef = useRef(0);
  const phraseRecordingTimerRef = useRef(0);
  const phraseRecordingStreamRef = useRef(null);
  const phraseRecorderRef = useRef(null);
  const phraseRecorderChunksRef = useRef([]);
  const phraseRecorderUrlRef = useRef("");
  const verifyAutoRef = useRef({ key: "", attempt: 0, running: false });
  const verifyFlowRunRef = useRef(0);
  const verifyLastErrorRef = useRef("");
  const [sourceInputMode, setSourceInputMode] = useState("upload");
  const sourceRecordingTimerRef = useRef(0);
  const sourceRecordingStreamRef = useRef(null);
  const sourceRecorderRef = useRef(null);
  const sourceRecorderChunksRef = useRef([]);
  const sourceRecorderUrlRef = useRef("");
  const [sourceRecording, setSourceRecording] = useState({
    recording: false,
    seconds: 0,
    error: "",
    mimeType: "",
    url: "",
  });
  const [sourceMeterStream, setSourceMeterStream] = useState(null);
  const [sourceRecordedFile, setSourceRecordedFile] = useState(null);
  const sourceRecordedAudioRef = useRef(null);
  const [phraseRecording, setPhraseRecording] = useState({
    recording: false,
    seconds: 0,
    error: "",
    mimeType: "",
    url: "",
  });
  const [phraseMeterStream, setPhraseMeterStream] = useState(null);
  const phrasePreparedStreamRef = useRef(null);
  const phraseCountdownTimerRef = useRef(0);
  const phraseCountdownStepTimerRef = useRef(0);
  const phraseLoadingSlowTimerRef = useRef(0);
  const [phraseCountdown, setPhraseCountdown] = useState({ active: false, step: "", error: "" });
  const [phraseLoadingSlow, setPhraseLoadingSlow] = useState(false);
  const sourcePlayerUrlRef = useRef("");
  const [sourcePlayer, setSourcePlayer] = useState({
    localUrl: "",
    mode: "local",
    remoteFailed: false,
    error: "",
    hardError: false,
  });
  const regenPhraseReqRef = useRef(0);
  const [regenPhraseBusy, setRegenPhraseBusy] = useState(false);
  const [wizardNotice, setWizardNotice] = useState(null);
  const [sourceContinueBusy, setSourceContinueBusy] = useState(false);
  const wizardBodyRef = useRef(null);
  const postRejectValidateReqRef = useRef(0);
  const activeClientAttemptIdRef = useRef("");
  const validateAttemptRef = useRef("");
  const validateStartReqRef = useRef(0);
  const validateLockRef = useRef({ running: false, clientAttemptId: "" });
  const regenPhraseLockRef = useRef({ running: false, clientAttemptId: "" });
  const verifyAttemptIdRef = useRef("");
  const pendingAutoRecoverRef = useRef({ nonce: 0, requested: false });
  const wizardSteps = ["Perfil", "Audio original", "Frase", "Verificación", "Listo"];
  const sourceReady = Boolean(profile.sourceAudio);
  const verificationReady = Boolean(profile.verifyAudio);
  const language = "es";
  const sourcePlayerSrc = (sourcePlayer.mode === "remote" && sourceUpload.url && !sourcePlayer.remoteFailed)
    ? sourceUpload.url
    : (sourcePlayer.localUrl || sourceUpload.url || "");
  const sourcePlayerBlocking = Boolean(sourcePlayer.hardError);

  const cancelVerificationFlow = () => {
    verifyFlowRunRef.current += 1;
    verifyAutoRef.current.running = false;
  };

  const cleanupPhraseRecording = () => {
    if (phraseRecordingTimerRef.current) window.clearInterval(phraseRecordingTimerRef.current);
    phraseRecordingTimerRef.current = 0;
    if (phraseCountdownTimerRef.current) window.clearInterval(phraseCountdownTimerRef.current);
    phraseCountdownTimerRef.current = 0;
    if (phraseCountdownStepTimerRef.current) window.clearTimeout(phraseCountdownStepTimerRef.current);
    phraseCountdownStepTimerRef.current = 0;
    setPhraseCountdown({ active: false, step: "", error: "" });
    setPhraseMeterStream(null);
    try {
      if (phraseRecorderRef.current && phraseRecorderRef.current.state !== "inactive") {
        phraseRecorderRef.current.stop();
      }
    } catch {}
    phraseRecorderRef.current = null;
    if (phrasePreparedStreamRef.current) {
      try {
        phrasePreparedStreamRef.current.getTracks().forEach((t) => t.stop());
      } catch {}
    }
    phrasePreparedStreamRef.current = null;
    if (phraseRecordingStreamRef.current) {
      try {
        phraseRecordingStreamRef.current.getTracks().forEach((t) => t.stop());
      } catch {}
    }
    phraseRecordingStreamRef.current = null;
    phraseRecorderChunksRef.current = [];
    if (phraseRecorderUrlRef.current) {
      try {
        URL.revokeObjectURL(phraseRecorderUrlRef.current);
      } catch {}
    }
    phraseRecorderUrlRef.current = "";
    setPhraseRecording((current) => ({
      ...current,
      recording: false,
      seconds: 0,
      error: "",
      mimeType: "",
      url: "",
    }));
  };

  const cleanupSourcePlayer = () => {
    if (sourcePlayerUrlRef.current) {
      try {
        URL.revokeObjectURL(sourcePlayerUrlRef.current);
      } catch {}
    }
    sourcePlayerUrlRef.current = "";
    setSourcePlayer((current) => ({ ...current, localUrl: "", mode: "local", remoteFailed: false, error: "", hardError: false }));
  };

  useEffect(() => {
    return () => {
      activeClientAttemptIdRef.current = "";
      validateLockRef.current = { running: false, clientAttemptId: "" };
      regenPhraseLockRef.current = { running: false, clientAttemptId: "" };
      cancelVerificationFlow();
      cleanupPhraseRecording();
      cleanupSourceRecording();
      cleanupSourcePlayer();
    };
  }, []);

  useEffect(() => {
    activeClientAttemptIdRef.current = String(validation.clientAttemptId || "").trim();
  }, [validation.clientAttemptId]);

  useEffect(() => {
    if (!validation.loading || validation.phrase || validation.error) {
      if (phraseLoadingSlowTimerRef.current) window.clearTimeout(phraseLoadingSlowTimerRef.current);
      phraseLoadingSlowTimerRef.current = 0;
      setPhraseLoadingSlow(false);
      return;
    }
    setPhraseLoadingSlow(false);
    if (phraseLoadingSlowTimerRef.current) window.clearTimeout(phraseLoadingSlowTimerRef.current);
    phraseLoadingSlowTimerRef.current = window.setTimeout(() => setPhraseLoadingSlow(true), 6500);
    return () => {
      if (phraseLoadingSlowTimerRef.current) window.clearTimeout(phraseLoadingSlowTimerRef.current);
      phraseLoadingSlowTimerRef.current = 0;
    };
  }, [validation.loading, validation.phrase, validation.error]);

  useEffect(() => {
    if (wizardStep !== 3) cancelVerificationFlow();
  }, [wizardStep]);

  useEffect(() => {
    if (wizardStep !== 1) setSourceContinueBusy(false);
  }, [wizardStep]);

  useEffect(() => {
    if (!wizardBodyRef.current) return;
    if (wizardStep === 2 || wizardStep === 3) {
      try {
        wizardBodyRef.current.scrollTop = 0;
      } catch {}
    }
  }, [wizardStep, wizardNotice]);

  useEffect(() => {
    if (!profile.sourceAudio) {
      cleanupSourcePlayer();
      return;
    }
    if (sourcePlayerUrlRef.current) {
      try {
        URL.revokeObjectURL(sourcePlayerUrlRef.current);
      } catch {}
    }
    const nextUrl = URL.createObjectURL(profile.sourceAudio);
    sourcePlayerUrlRef.current = nextUrl;
    setSourcePlayer({ localUrl: nextUrl, mode: "local", remoteFailed: false, error: "", hardError: false });
  }, [profile.sourceAudio]);

  useEffect(() => {
    if (!sourceUpload.url) return;
    setSourcePlayer((current) => (current.remoteFailed ? current : { ...current, mode: "remote" }));
  }, [sourceUpload.url]);

  const pickRecorderMimeType = () => {
    const candidates = [
      "audio/mp4;codecs=mp4a.40.2",
      "audio/mp4",
      "audio/aac",
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus",
      "audio/ogg",
    ];
    if (typeof window === "undefined") return "";
    const Rec = window.MediaRecorder;
    if (!Rec || typeof Rec.isTypeSupported !== "function") return "";
    for (const type of candidates) {
      try {
        if (Rec.isTypeSupported(type)) return type;
      } catch {}
    }
    return "";
  };

  const extFromMime = (mimeType) => {
    const t = String(mimeType || "").toLowerCase();
    if (t.includes("mp4")) return "m4a";
    if (t.includes("aac")) return "aac";
    if (t.includes("ogg")) return "ogg";
    if (t.includes("webm")) return "webm";
    return "m4a";
  };

  const cleanupSourceRecording = () => {
    if (sourceRecordingTimerRef.current) window.clearInterval(sourceRecordingTimerRef.current);
    sourceRecordingTimerRef.current = 0;
    setSourceMeterStream(null);
    try {
      if (sourceRecorderRef.current && sourceRecorderRef.current.state !== "inactive") {
        sourceRecorderRef.current.stop();
      }
    } catch {}
    sourceRecorderRef.current = null;
    if (sourceRecordingStreamRef.current) {
      try {
        sourceRecordingStreamRef.current.getTracks().forEach((t) => t.stop());
      } catch {}
    }
    sourceRecordingStreamRef.current = null;
    sourceRecorderChunksRef.current = [];
    if (sourceRecorderUrlRef.current) {
      try {
        URL.revokeObjectURL(sourceRecorderUrlRef.current);
      } catch {}
    }
    sourceRecorderUrlRef.current = "";
    setSourceRecordedFile(null);
    setSourceRecording((current) => ({
      ...current,
      recording: false,
      seconds: 0,
      error: "",
      mimeType: "",
      url: "",
    }));
  };

  const resetSourceSelection = () => {
    cleanupSourcePlayer();
    cleanupSourceRecording();
    setSourceUpload({ url: "", key: "", loading: false, error: "" });
    setProfile((current) => ({
      ...current,
      sourceAudio: null,
      audioDuration: 420,
      start: 0,
      end: 10,
    }));
  };

  const encodeWav = (audioBuffer) => {
    const numberOfChannels = Math.min(2, audioBuffer.numberOfChannels || 1);
    const sampleRate = audioBuffer.sampleRate || 44100;
    const length = audioBuffer.length || 0;
    const bytesPerSample = 2;
    const blockAlign = numberOfChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = length * blockAlign;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);
    const writeString = (offset, value) => {
      for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i));
    };
    writeString(0, "RIFF");
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, "WAVE");
    writeString(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numberOfChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bytesPerSample * 8, true);
    writeString(36, "data");
    view.setUint32(40, dataSize, true);
    const channelData = Array.from({ length: numberOfChannels }, (_, idx) => audioBuffer.getChannelData(idx));
    let offset = 44;
    for (let i = 0; i < length; i += 1) {
      for (let ch = 0; ch < numberOfChannels; ch += 1) {
        const sample = Math.max(-1, Math.min(1, channelData[ch]?.[i] || 0));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
        offset += 2;
      }
    }
    return buffer;
  };

  const convertToWavIfNeeded = async (blob, mimeType) => {
    const t = String(mimeType || blob?.type || "").toLowerCase();
    if (!t.includes("webm") && !t.includes("ogg")) return null;
    try {
      const bytes = await blob.arrayBuffer();
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      const ctx = new Ctx();
      const decoded = await new Promise((resolve, reject) => {
        try {
          ctx.decodeAudioData(bytes.slice(0), resolve, reject);
        } catch (e) {
          reject(e);
        }
      });
      try {
        await ctx.close();
      } catch {}
      const wavBuffer = encodeWav(decoded);
      return new File([wavBuffer], `audio_original_${Date.now()}.wav`, { type: "audio/wav" });
    } catch {
      return null;
    }
  };

  const applySourceAudioFile = (file) => {
    if (!file) return;
    let objectUrl = "";
    try {
      objectUrl = URL.createObjectURL(file);
    } catch {
      uploadWizardAudio(file, "source").catch(() => {});
      return;
    }
    const audio = new Audio(objectUrl);
    audio.addEventListener(
      "loadedmetadata",
      () => {
        const duration = Math.max(1, Math.floor(audio.duration));
        setProfile((current) => ({
          ...current,
          sourceAudio: file,
          audioDuration: duration,
          start: 0,
          end: Math.min(10, duration),
        }));
        try { URL.revokeObjectURL(objectUrl); } catch {}
        uploadWizardAudio(file, "source").catch(() => {});
      },
      { once: true },
    );
    audio.addEventListener(
      "error",
      () => {
        try { URL.revokeObjectURL(objectUrl); } catch {}
        setProfile((current) => ({ ...current, sourceAudio: file, audioDuration: 420, start: 0, end: 10 }));
        uploadWizardAudio(file, "source").catch(() => {});
      },
      { once: true },
    );
  };

  const startSourceRecording = async () => {
    if (sourceRecording.recording) return;
    setSourceRecording((current) => ({ ...current, error: "" }));
    if (typeof window === "undefined" || !navigator?.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      showAlert({ tone: "error", message: "Tu navegador no permite grabar audio. Usa la opción Subir audio." });
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      sourceRecordingStreamRef.current = stream;
      setSourceMeterStream(stream);
      const mimeType = pickRecorderMimeType();
      const recorder = mimeType ? new window.MediaRecorder(stream, { mimeType }) : new window.MediaRecorder(stream);
      sourceRecorderChunksRef.current = [];
      recorder.addEventListener("dataavailable", (event) => {
        if (event?.data?.size) sourceRecorderChunksRef.current.push(event.data);
      });
      recorder.addEventListener("stop", () => {
        (async () => {
          const chunks = sourceRecorderChunksRef.current;
          sourceRecorderChunksRef.current = [];
          const blobType = String(mimeType || recorder.mimeType || "audio/webm").trim();
          const blob = new Blob(chunks, { type: blobType });
          const wav = await convertToWavIfNeeded(blob, blobType);
          const finalFile = wav || new File([blob], `audio_original_${Date.now()}.${extFromMime(blobType)}`, { type: blobType });
          if (sourceRecorderUrlRef.current) {
            try {
              URL.revokeObjectURL(sourceRecorderUrlRef.current);
            } catch {}
          }
          const url = URL.createObjectURL(finalFile);
          sourceRecorderUrlRef.current = url;
          setSourceRecordedFile(finalFile);
          setSourceRecording((current) => ({ ...current, recording: false, mimeType: finalFile.type || blobType, url }));
          setSourceMeterStream(null);
          if (sourceRecordingTimerRef.current) window.clearInterval(sourceRecordingTimerRef.current);
          sourceRecordingTimerRef.current = 0;
          if (sourceRecordingStreamRef.current) {
            try {
              sourceRecordingStreamRef.current.getTracks().forEach((t) => t.stop());
            } catch {}
          }
          sourceRecordingStreamRef.current = null;
        })().catch(() => {});
      });
      sourceRecorderRef.current = recorder;
      recorder.start();
      setSourceRecording((current) => ({ ...current, recording: true, seconds: 0, mimeType: mimeType || "", url: "" }));
      sourceRecordingTimerRef.current = window.setInterval(() => {
        setSourceRecording((current) => (current.recording ? { ...current, seconds: current.seconds + 1 } : current));
      }, 1000);
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e || "");
      const msg = /denied|notallowed|permission/i.test(raw)
        ? "No pudimos acceder al micrófono. Revisa los permisos del navegador e inténtalo de nuevo."
        : "No se pudo iniciar la grabación. Intenta de nuevo.";
      setSourceRecording((current) => ({ ...current, error: msg }));
      showAlert({ tone: "error", message: msg });
    }
  };

  const stopSourceRecording = () => {
    try {
      if (sourceRecorderRef.current && sourceRecorderRef.current.state !== "inactive") {
        sourceRecorderRef.current.stop();
        return;
      }
    } catch {}
    cleanupSourceRecording();
  };

  const validateRecordedBlob = async (blob) => {
    if (!blob || !blob.size) return { ok: false, duration: 0 };
    let url = "";
    try {
      url = URL.createObjectURL(blob);
    } catch {
      return { ok: false, duration: 0 };
    }
    try {
      const duration = await new Promise((resolve, reject) => {
        const audio = new Audio();
        let done = false;
        const finish = (value, isError) => {
          if (done) return;
          done = true;
          if (isError) reject(new Error("invalid_audio"));
          else resolve(value);
        };
        const timer = window.setTimeout(() => finish(0, true), 3500);
        audio.addEventListener(
          "loadedmetadata",
          () => {
            window.clearTimeout(timer);
            const d = Number(audio.duration);
            if (!Number.isFinite(d) || d <= 0.1) finish(0, true);
            else finish(d, false);
          },
          { once: true },
        );
        audio.addEventListener(
          "error",
          () => {
            window.clearTimeout(timer);
            finish(0, true);
          },
          { once: true },
        );
        audio.src = url;
      });
      return { ok: true, duration: Number(duration) || 0 };
    } catch {
      return { ok: false, duration: 0 };
    } finally {
      try {
        if (url) URL.revokeObjectURL(url);
      } catch {}
    }
  };

  const cancelPhraseCountdown = () => {
    if (phraseCountdownTimerRef.current) window.clearInterval(phraseCountdownTimerRef.current);
    phraseCountdownTimerRef.current = 0;
    if (phraseCountdownStepTimerRef.current) window.clearTimeout(phraseCountdownStepTimerRef.current);
    phraseCountdownStepTimerRef.current = 0;
    setPhraseCountdown({ active: false, step: "", error: "" });
    if (phrasePreparedStreamRef.current) {
      try {
        phrasePreparedStreamRef.current.getTracks().forEach((t) => t.stop());
      } catch {}
    }
    phrasePreparedStreamRef.current = null;
  };

  const startMediaRecorderWithStream = (stream) => {
    phraseRecordingStreamRef.current = stream;
    setPhraseMeterStream(stream);
    const mimeType = pickRecorderMimeType();
    let recorder;
    try {
      recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    } catch {
      recorder = new MediaRecorder(stream);
    }
    phraseRecorderChunksRef.current = [];
    recorder.addEventListener("dataavailable", (e) => {
      if (e.data && e.data.size > 0) phraseRecorderChunksRef.current.push(e.data);
    });
    recorder.addEventListener("stop", () => {
      (async () => {
        try {
          if (phraseRecordingTimerRef.current) window.clearInterval(phraseRecordingTimerRef.current);
          phraseRecordingTimerRef.current = 0;
          const chunks = phraseRecorderChunksRef.current;
          phraseRecorderChunksRef.current = [];
          const finalMime = String(recorder.mimeType || mimeType || "audio/mp4").trim() || "audio/mp4";
          const blob = new Blob(chunks, { type: finalMime });
          const check = await validateRecordedBlob(blob);
          if (!check.ok) {
            setPhraseRecording((current) => ({
              ...current,
              recording: false,
              error: "No pudimos guardar correctamente la grabación. Intenta grabarla otra vez.",
            }));
            setProfile((current) => ({ ...current, verifyAudio: null }));
            return;
          }
          const ext = extFromMime(finalMime);
          const file = new File([blob], `verificacion_${Date.now()}.${ext}`, { type: finalMime });
          if (phraseRecorderUrlRef.current) {
            try {
              URL.revokeObjectURL(phraseRecorderUrlRef.current);
            } catch {}
          }
          const url = URL.createObjectURL(blob);
          phraseRecorderUrlRef.current = url;
          verifyAttemptIdRef.current = String(activeClientAttemptIdRef.current || validation.clientAttemptId || "").trim();
          setProfile((current) => ({ ...current, verifyAudio: file }));
          setPhraseRecording((current) => ({ ...current, recording: false, mimeType: finalMime, url, seconds: current.seconds }));
        } finally {
          setPhraseMeterStream(null);
          if (phraseRecordingStreamRef.current) {
            try {
              phraseRecordingStreamRef.current.getTracks().forEach((t) => t.stop());
            } catch {}
          }
          phraseRecordingStreamRef.current = null;
          phraseRecorderRef.current = null;
        }
      })().catch(() => {});
    });
    phraseRecorderRef.current = recorder;
    try {
      if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") navigator.vibrate(35);
    } catch {}
    recorder.start();
    setPhraseRecording((current) => ({ ...current, recording: true, seconds: 0, mimeType: mimeType || "", url: "" }));
    phraseRecordingTimerRef.current = window.setInterval(() => {
      setPhraseRecording((current) => (current.recording ? { ...current, seconds: current.seconds + 1 } : current));
    }, 1000);
  };

  const startPhraseRecording = async () => {
    if (phraseCountdown.active || phraseRecording.recording) return;
    setPhraseRecording((current) => ({ ...current, error: "" }));
    cancelPhraseCountdown();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      phrasePreparedStreamRef.current = stream;
      const steps = ["3", "2", "1", "¡Canta!"];
      setPhraseCountdown({ active: true, step: steps[0], error: "" });
      let index = 0;
      const tick = () => {
        if (!phrasePreparedStreamRef.current) {
          cancelPhraseCountdown();
          return;
        }
        if (index >= steps.length - 1) {
          setPhraseCountdown({ active: false, step: "", error: "" });
          const prepared = phrasePreparedStreamRef.current;
          phrasePreparedStreamRef.current = null;
          if (!prepared) return;
          startMediaRecorderWithStream(prepared);
          return;
        }
        index += 1;
        const nextStep = steps[index];
        setPhraseCountdown({ active: true, step: nextStep, error: "" });
        phraseCountdownStepTimerRef.current = window.setTimeout(tick, 1000);
      };
      phraseCountdownStepTimerRef.current = window.setTimeout(tick, 1000);
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e || "");
      const msg = /denied|notallowed|permission/i.test(raw)
        ? "No pudimos acceder al micrófono. Revisa los permisos del navegador e inténtalo de nuevo."
        : "No se pudo iniciar la grabación. Intenta de nuevo.";
      cancelPhraseCountdown();
      setPhraseRecording((current) => ({ ...current, error: msg }));
      setToast(msg);
    }
  };

  const stopPhraseRecording = () => {
    try {
      if (phraseRecorderRef.current && phraseRecorderRef.current.state !== "inactive") {
        phraseRecorderRef.current.stop();
        return;
      }
    } catch {}
    cleanupPhraseRecording();
  };

  const resetVerificationState = () => {
    const clientAttemptId = String(activeClientAttemptIdRef.current || validation.clientAttemptId || "").trim();
    setVerifyUpload({ clientAttemptId, url: "", key: "", loading: false, error: "" });
    setVoiceGen({ taskId: "", status: "", voiceId: "", loading: false, error: "", isAvailable: null });
    verifyAutoRef.current = { key: "", attempt: 0, running: false };
    verifyLastErrorRef.current = "";
    verifyAttemptIdRef.current = "";
  };

  const uploadWizardAudio = async (file, kind) => {
    if (!file) return null;
    const requestRef = kind === "source" ? sourceUploadReqRef : verifyUploadReqRef;
    const nextReq = requestRef.current + 1;
    requestRef.current = nextReq;
    if (kind === "source") setSourceUpload({ url: "", key: "", loading: true, error: "" });
    if (kind === "verify") {
      const clientAttemptId = String(activeClientAttemptIdRef.current || validation.clientAttemptId || "").trim();
      setVerifyUpload({ clientAttemptId, url: "", key: "", loading: true, error: "" });
    }
    try {
      const t = await getAccessToken();
      if (!t.ok) {
        if (requestRef.current !== nextReq) return;
        const msg = t.error || "No se pudo iniciar sesión.";
        if (kind === "source") setSourceUpload({ url: "", key: "", loading: false, error: msg });
        if (kind === "verify") {
          const clientAttemptId = String(activeClientAttemptIdRef.current || validation.clientAttemptId || "").trim();
          setVerifyUpload({ clientAttemptId, url: "", key: "", loading: false, error: msg });
        }
        setToast(msg);
        return;
      }
      if (requestRef.current !== nextReq) return;
      const uploaded = await uploadAudioForVoice(t.token, file);
      if (requestRef.current !== nextReq) return;
      const url = (uploaded?.url || "").toString().trim();
      const key = (uploaded?.key || "").toString().trim();
      if (!url) throw new Error("No recibí la URL final del audio.");
      if (kind === "source") setSourceUpload({ url, key, loading: false, error: "" });
      if (kind === "verify") {
        const clientAttemptId = String(activeClientAttemptIdRef.current || validation.clientAttemptId || "").trim();
        setVerifyUpload({ clientAttemptId, url, key, loading: false, error: "" });
      }
      setToast(kind === "source" ? "Audio original subido correctamente." : "Audio de verificación subido correctamente.");
      return { url, key };
    } catch (e) {
      if (requestRef.current !== nextReq) return;
      const raw = e instanceof Error ? e.message : String(e || "");
      const looksLikeNetwork = /failed to fetch|networkerror|network error|load failed|fetch failed|typeerror.*failed|abort|timeout|net::/i.test(raw) || !raw.trim();
      const msg = looksLikeNetwork
        ? "No se pudo conectar con el servidor para subir tu audio. Revisa tu internet e inténtalo de nuevo."
        : raw || "No se pudo subir el audio.";
      if (kind === "source") setSourceUpload({ url: "", key: "", loading: false, error: msg });
      if (kind === "verify") {
        const clientAttemptId = String(activeClientAttemptIdRef.current || validation.clientAttemptId || "").trim();
        setVerifyUpload({ clientAttemptId, url: "", key: "", loading: false, error: msg });
      }
      setToast(msg);
      return null;
    }
  };

  const acceptMp3 = (file, field) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".mp3")) {
      setToast("Ese archivo no es MP3. Usa el convertidor gratuito.");
      return;
    }
    if (field !== "sourceAudio") {
      setProfile((current) => ({ ...current, [field]: file }));
      uploadWizardAudio(file, "verify").catch(() => {});
      return;
    }
    let objectUrl = "";
    try {
      objectUrl = URL.createObjectURL(file);
    } catch {
      uploadWizardAudio(file, "source").catch(() => {});
      return;
    }
    const audio = new Audio(objectUrl);
    audio.addEventListener(
      "loadedmetadata",
      () => {
        const duration = Math.max(1, Math.floor(audio.duration));
        setProfile((current) => ({
          ...current,
          sourceAudio: file,
          audioDuration: duration,
          start: 0,
          end: Math.min(10, duration),
        }));
        try { URL.revokeObjectURL(objectUrl); } catch {}
        uploadWizardAudio(file, "source").catch(() => {});
      },
      { once: true },
    );
    audio.addEventListener(
      "error",
      () => {
        try { URL.revokeObjectURL(objectUrl); } catch {}
        setProfile((current) => ({ ...current, sourceAudio: file, audioDuration: 420, start: 0, end: 10 }));
        uploadWizardAudio(file, "source").catch(() => {});
      },
      { once: true },
    );
  };

  const makeClientAttemptId = () => `${Date.now()}_${Math.random().toString(16).slice(2)}`;

  const pollValidateInfo = async (taskId, clientAttemptId) => {
    const t = await getAccessToken();
    if (!t.ok) {
      setValidation((current) =>
        current.clientAttemptId !== clientAttemptId || current.taskId !== taskId
          ? current
          : { ...current, loading: false, error: t.error || "No se pudo iniciar sesión." },
      );
      return null;
    }

    const startedAt = Date.now();
    while (Date.now() - startedAt < 8 * 60 * 1000) {
      await new Promise((r) => setTimeout(r, 2200));
      const qr = await fetch(`/api/suno/voice-validate-info?taskId=${encodeURIComponent(taskId)}`, {
        headers: { authorization: `Bearer ${t.token}` },
      });
      const out = await qr.json().catch(() => ({}));
      if (!qr.ok) continue;
      const status = String(out?.status || "").trim();
      const phrase = String(out?.validateInfo || "").trim();
      if (status) {
        setValidation((current) =>
          current.clientAttemptId !== clientAttemptId || current.taskId !== taskId ? current : { ...current, status },
        );
      }
      if (phrase) {
        setValidation((current) =>
          current.clientAttemptId !== clientAttemptId || current.taskId !== taskId
            ? current
            : { ...current, loading: false, error: "", phrase, status: status || current.status },
        );
        return phrase;
      }
      if (status === "fail" || status === "processing_validate_fail") {
        const raw = String(out?.errorMessage || out?.detail || out?.error || "").trim();
        const friendly = /server exception|contact customer service/i.test(raw)
          ? "No pudimos preparar la frase. Intenta nuevamente."
          : "No pudimos preparar la frase. Intenta nuevamente.";
        setValidation((current) =>
          current.clientAttemptId !== clientAttemptId || current.taskId !== taskId ? current : { ...current, loading: false, error: friendly },
        );
        return null;
      }
    }
    setValidation((current) =>
      current.clientAttemptId !== clientAttemptId || current.taskId !== taskId
        ? current
        : { ...current, loading: false, error: "La frase está tardando demasiado. Intenta más tarde." },
    );
    return null;
  };

  const startValidate = async () => {
    const existingClientAttemptId = String(validation.clientAttemptId || "").trim();
    if (validateLockRef.current.running) return false;
    validateLockRef.current = { running: true, clientAttemptId: existingClientAttemptId || validateLockRef.current.clientAttemptId };
    if (validation.loading) {
      validateLockRef.current.running = false;
      return false;
    }
    const existingTaskId = String(validation.taskId || "").trim();
    if (existingTaskId) {
      if (validation.phrase) return true;
      setValidation((current) => ({ ...current, loading: true, error: "" }));
      try {
        const phrase = await pollValidateInfo(existingTaskId, existingClientAttemptId);
        return Boolean(phrase);
      } finally {
        if (validateLockRef.current.clientAttemptId === existingClientAttemptId) validateLockRef.current.running = false;
      }
    }
    const clientAttemptId = makeClientAttemptId();
    activeClientAttemptIdRef.current = clientAttemptId;
    validateAttemptRef.current = clientAttemptId;
    validateLockRef.current = { running: true, clientAttemptId };
    const reqId = validateStartReqRef.current + 1;
    validateStartReqRef.current = reqId;
    setValidation({ clientAttemptId, taskId: "", status: "", phrase: "", loading: true, error: "" });
    try {
      const t = await getAccessToken();
      if (!t.ok) {
        setValidation((current) =>
          current.clientAttemptId !== clientAttemptId ? current : { ...current, loading: false, error: t.error || "No se pudo iniciar sesión." },
        );
        return false;
      }
      const voiceUrl = (sourceUpload.url || "").toString().trim();
      if (!voiceUrl) {
        setValidation((current) =>
          current.clientAttemptId !== clientAttemptId
            ? current
            : { ...current, loading: false, error: "Primero sube el audio original para obtener una URL válida." },
        );
        return false;
      }
      const vocalStartS = Math.max(0, Math.floor(Number(profile.start) || 0));
      const vocalEndS = Math.max(0, Math.floor(Number(profile.end) || 0));
      const r = await fetch("/api/suno/voice-validate", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${t.token}` },
        body: JSON.stringify({ voiceUrl, vocalStartS, vocalEndS, language, clientAttemptId }),
      });
      const out = await r.json().catch(() => ({}));
      if (!r.ok) {
        const msg = String(out?.detail?.msg || out?.detail || out?.error || "No se pudo iniciar la validación de voz.").trim();
        setValidation((current) =>
          current.clientAttemptId !== clientAttemptId ? current : { ...current, loading: false, error: msg },
        );
        return false;
      }
      const taskId = String(out?.taskId || "").trim();
      if (!taskId) {
        setValidation((current) =>
          current.clientAttemptId !== clientAttemptId ? current : { ...current, loading: false, error: "No recibí taskId de validación." },
        );
        return false;
      }
      if (validateStartReqRef.current !== reqId || validateAttemptRef.current !== clientAttemptId) return false;
      setValidation((current) =>
        current.clientAttemptId !== clientAttemptId ? current : { ...current, taskId, loading: true, error: "", phrase: "" },
      );
      const phrase = await pollValidateInfo(taskId, clientAttemptId);
      return Boolean(phrase);
    } catch (e) {
      setValidation((current) =>
        current.clientAttemptId !== clientAttemptId
          ? current
          : { ...current, loading: false, error: e instanceof Error ? e.message : "Error iniciando validación de voz." },
      );
      return false;
    } finally {
      if (validateLockRef.current.clientAttemptId === clientAttemptId) validateLockRef.current.running = false;
    }
  };

  const regeneratePhrase = async () => {
    const currentTaskId = String(validation.taskId || "").trim();
    if (!currentTaskId) return;
    if (regenPhraseLockRef.current.running) return;
    const nextClientAttemptId = makeClientAttemptId();
    regenPhraseLockRef.current = { running: true, clientAttemptId: nextClientAttemptId };
    activeClientAttemptIdRef.current = nextClientAttemptId;
    validateAttemptRef.current = nextClientAttemptId;
    validateStartReqRef.current += 1;
    cancelVerificationFlow();
    verifyAttemptIdRef.current = "";
    setValidation((current) => ({ ...current, clientAttemptId: nextClientAttemptId, loading: true, error: "", phrase: "" }));
    try {
      const t = await getAccessToken();
      if (!t.ok) {
        setValidation((current) => ({ ...current, loading: false, error: t.error || "No se pudo iniciar sesión." }));
        return;
      }
      const r = await fetch("/api/suno/voice-regenerate", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${t.token}` },
        body: JSON.stringify({ taskId: currentTaskId, clientAttemptId: nextClientAttemptId }),
      });
      const out = await r.json().catch(() => ({}));
      if (!r.ok) {
        const msg = String(out?.detail || out?.error || "No se pudo regenerar la frase.").trim();
        setValidation((current) => ({ ...current, loading: false, error: msg }));
        return;
      }
      const nextTaskId = String(out?.taskId || "").trim();
      if (!nextTaskId) {
        setValidation((current) => ({ ...current, loading: false, error: "No recibí taskId al regenerar la frase." }));
        return;
      }
      setValidation((current) => ({ ...current, clientAttemptId: nextClientAttemptId, taskId: nextTaskId, loading: true, error: "", phrase: "" }));
      await pollValidateInfo(nextTaskId, nextClientAttemptId);
    } catch (e) {
      setValidation((current) => ({ ...current, loading: false, error: e instanceof Error ? e.message : "No se pudo regenerar la frase." }));
    } finally {
      if (regenPhraseLockRef.current.clientAttemptId === nextClientAttemptId) regenPhraseLockRef.current.running = false;
    }
  };

  const pollVoiceRecordInfo = async (taskId) => {
    const t = await getAccessToken();
    if (!t.ok) {
      setVoiceGen((current) => ({ ...current, loading: false, error: t.error || "No se pudo iniciar sesión." }));
      return;
    }
    const startedAt = Date.now();
    while (Date.now() - startedAt < 25 * 60 * 1000) {
      await new Promise((r) => setTimeout(r, 4500));
      const qr = await fetch(`/api/suno/voice-record-info?taskId=${encodeURIComponent(taskId)}`, {
        headers: { authorization: `Bearer ${t.token}` },
      });
      const out = await qr.json().catch(() => ({}));
      if (!qr.ok) continue;
      const status = String(out?.status || "").trim();
      const voiceId = String(out?.voiceId || "").trim();
      setVoiceGen((current) => ({ ...current, status }));
      if (status === "success" && voiceId) {
        setVoiceGen((current) => ({ ...current, loading: false, error: "", voiceId, status }));
        return;
      }
      if (status === "processing_validate_fail" || status === "fail") {
        const reqId = postRejectValidateReqRef.current + 1;
        postRejectValidateReqRef.current = reqId;
        const task = String(validation.taskId || "").trim();
        if (!task) return;
        const info = await getValidateInfoOnce(task);
        if (postRejectValidateReqRef.current !== reqId) return;
        if (!info.ok) {
          setWizardNotice({
            kind: "temp_error",
            title: "No pudimos comprobar la verificación",
            message: "Intenta nuevamente.",
            actionLabel: "Intentar nuevamente",
          });
          setVoiceGen((current) => ({ ...current, loading: false, status: "needs_check", error: "" }));
          return;
        }
        const s = normalizeStatus(info.status);
        if (s === "wait_validating") {
          setWizardNotice({
            kind: "repeat_phrase",
            title: "No pudimos verificar tu voz",
            message: "Vuelve a cantar la misma frase con voz clara, una sola vez y con poco ruido.",
            actionLabel: "Repetir la frase",
          });
          clearRejectedVerification();
          setWizardStep(2);
          return;
        }
        if (s === "success" || isIncompatibleValidationStatus(s) || indicatesInvalidTask(info.status) || indicatesInvalidTask(info.error)) {
          pendingAutoRecoverRef.current = { nonce: pendingAutoRecoverRef.current.nonce + 1, requested: true };
          setWizardNotice({
            kind: "needs_new_phrase",
            title: "Necesitamos preparar una frase nueva",
            message: "La sesión anterior ya no está disponible. Generaremos una frase nueva para que puedas grabarla.",
            actionLabel: "",
          });
          clearRejectedVerification();
          setWizardStep(2);
          setTimeout(() => {
            if (!pendingAutoRecoverRef.current.requested) return;
            handleRegeneratePhrase().catch(() => {});
          }, 0);
          return;
        }
        setWizardNotice({
          kind: "needs_new_phrase",
          title: "Necesitamos preparar una frase nueva",
          message: "La sesión anterior ya no está disponible. Generaremos una frase nueva para que puedas grabarla.",
          actionLabel: "",
        });
        clearRejectedVerification();
        setWizardStep(2);
        setTimeout(() => handleRegeneratePhrase().catch(() => {}), 0);
        return;
      }
    }
    setVoiceGen((current) => ({ ...current, loading: false, error: "La voz está tardando demasiado. Intenta más tarde." }));
  };

  const checkAvailability = async (taskId) => {
    const t = await getAccessToken();
    if (!t.ok) return null;
    const startedAt = Date.now();
    while (Date.now() - startedAt < 3 * 60 * 1000) {
      const r = await fetch("/api/suno/voice-check-voice", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${t.token}` },
        body: JSON.stringify({ task_id: taskId }),
      });
      const out = await r.json().catch(() => ({}));
      if (r.ok) {
        const available = Boolean(out?.isAvailable);
        if (available) return true;
      }
      await new Promise((r2) => setTimeout(r2, 2500));
    }
    return false;
  };

  const normalizeStatus = (value) =>
    String(value || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_");

  const isIncompatibleValidationStatus = (status) => {
    const s = normalizeStatus(status);
    return s === "fail" || s === "processing_validate_fail";
  };

  const isProcessingValidationStatus = (status) => {
    const s = normalizeStatus(status);
    if (!s) return true;
    if (s === "wait_validating") return false;
    if (s === "success") return false;
    if (isIncompatibleValidationStatus(s)) return false;
    return true;
  };

  const getValidateInfoOnce = async (taskId) => {
    const t = await getAccessToken();
    if (!t.ok) return { ok: false, error: t.error || "No se pudo iniciar sesión.", status: "", validateInfo: "", raw: null };
    const qr = await fetch(`/api/suno/voice-validate-info?taskId=${encodeURIComponent(taskId)}`, {
      headers: { authorization: `Bearer ${t.token}` },
    });
    const out = await qr.json().catch(() => ({}));
    if (!qr.ok) {
      const msg = String(out?.detail || out?.error || "No se pudo consultar el estado de validación.").trim();
      return { ok: false, error: msg, status: "", validateInfo: "", raw: out };
    }
    const status = String(out?.status || "").trim();
    const validateInfo = String(out?.validateInfo || "").trim();
    return { ok: true, error: "", status, validateInfo, raw: out };
  };

  const checkExistingResultIfAny = async (validationTaskId, runId) => {
    if (verifyFlowRunRef.current !== runId) return false;
    const t = await getAccessToken();
    if (!t.ok) return false;
    const qr = await fetch(`/api/suno/voice-record-info?taskId=${encodeURIComponent(validationTaskId)}`, {
      headers: { authorization: `Bearer ${t.token}` },
    });
    const out = await qr.json().catch(() => ({}));
    if (!qr.ok) return false;
    const status = String(out?.status || "").trim();
    const voiceId = String(out?.voiceId || "").trim();
    if (status) setVoiceGen((current) => ({ ...current, status }));
    if (normalizeStatus(status) === "success" && voiceId) {
      setVoiceGen((current) => ({ ...current, loading: false, error: "", voiceId, status }));
      setWizardStep(4);
      return true;
    }
    return false;
  };

  const prepareNewPhrase = async (reason, runId) => {
    if (verifyFlowRunRef.current !== runId) return;
    cancelVerificationFlow();
    verifyLastErrorRef.current = "needs_new_phrase";
    const msg = "La sesión de verificación ya no está disponible. Prepararemos una frase nueva.";
    setVoiceGen((current) => ({ ...current, loading: false, error: msg, status: "needs_new_phrase" }));
    setWizardNotice({
      kind: "needs_new_phrase",
      title: "Necesitamos preparar una frase nueva",
      message: "La sesión anterior ya no está disponible. Generaremos una frase nueva para que puedas grabarla.",
      actionLabel: "",
    });
    cleanupPhraseRecording();
    setProfile((current) => ({ ...current, verifyAudio: null }));
    resetVerificationState();
    setWizardStep(2);
    try {
      await regeneratePhrase();
    } catch {
      setToast(msg);
    }
  };

  const clearRejectedVerification = () => {
    cleanupPhraseRecording();
    setProfile((current) => ({ ...current, verifyAudio: null }));
    resetVerificationState();
  };

  const isTemporaryErrorMessage = (raw) => {
    const t = String(raw || "").toLowerCase();
    if (!t) return true;
    return (
      t.includes("server exception") ||
      t.includes("contact customer service") ||
      t.includes("please try again later") ||
      t.includes("rate limit") ||
      t.includes("timeout") ||
      t.includes("failed to fetch") ||
      t.includes("network")
    );
  };

  const indicatesInvalidTask = (raw) => {
    const t = String(raw || "").toLowerCase();
    if (!t) return false;
    return (
      t.includes("expired") ||
      t.includes("venc") ||
      t.includes("not found") ||
      t.includes("invalid") ||
      t.includes("used") ||
      t.includes("already") ||
      t.includes("validate record is not in valid status")
    );
  };

  const startNewValidationTask = async (forcedClientAttemptId) => {
    const clientAttemptId = String(forcedClientAttemptId || "").trim() || makeClientAttemptId();
    if (validateLockRef.current.running) return null;
    validateLockRef.current = { running: true, clientAttemptId };
    activeClientAttemptIdRef.current = clientAttemptId;
    validateAttemptRef.current = clientAttemptId;
    setValidation({ clientAttemptId, taskId: "", status: "", phrase: "", loading: true, error: "" });
    try {
      const t = await getAccessToken();
      if (!t.ok) {
        setValidation((current) =>
          current.clientAttemptId !== clientAttemptId ? current : { ...current, loading: false, error: t.error || "No se pudo iniciar sesión." },
        );
        return null;
      }
      const voiceUrl = (sourceUpload.url || "").toString().trim();
      if (!voiceUrl) {
        setValidation((current) =>
          current.clientAttemptId !== clientAttemptId
            ? current
            : { ...current, loading: false, error: "Tu audio original aún no tiene una URL válida. Vuelve a intentarlo." },
        );
        return null;
      }
      const vocalStartS = Math.max(0, Math.floor(Number(profile.start) || 0));
      const vocalEndS = Math.max(0, Math.floor(Number(profile.end) || 0));
      const r = await fetch("/api/suno/voice-validate", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${t.token}` },
        body: JSON.stringify({ voiceUrl, vocalStartS, vocalEndS, language, clientAttemptId }),
      });
      const out = await r.json().catch(() => ({}));
      if (!r.ok) {
        const raw = String(out?.detail?.msg || out?.detail || out?.error || "").trim();
        const msg = isTemporaryErrorMessage(raw)
          ? "No pudimos preparar la frase. Hubo un problema temporal. Intenta nuevamente."
          : "No pudimos preparar la frase. Intenta nuevamente.";
        setValidation((current) =>
          current.clientAttemptId !== clientAttemptId ? current : { ...current, loading: false, error: msg },
        );
        return null;
      }
      const taskId = String(out?.taskId || "").trim();
      if (!taskId) {
        setValidation((current) =>
          current.clientAttemptId !== clientAttemptId ? current : { ...current, loading: false, error: "No pudimos preparar la frase. Intenta nuevamente." },
        );
        return null;
      }
      setValidation((current) =>
        current.clientAttemptId !== clientAttemptId ? current : { ...current, taskId, loading: true, error: "", phrase: "" },
      );
      const phrase = await pollValidateInfo(taskId, clientAttemptId);
      if (!phrase) return null;
      return taskId;
    } finally {
      if (validateLockRef.current.clientAttemptId === clientAttemptId) validateLockRef.current.running = false;
    }
  };

  const handleRegeneratePhrase = async () => {
    if (regenPhraseBusy) return;
    const currentTaskId = String(validation.taskId || "").trim();
    if (!currentTaskId) return;
    if (regenPhraseLockRef.current.running) return;
    const nextClientAttemptId = makeClientAttemptId();
    regenPhraseLockRef.current = { running: true, clientAttemptId: nextClientAttemptId };
    activeClientAttemptIdRef.current = nextClientAttemptId;
    validateAttemptRef.current = nextClientAttemptId;
    validateStartReqRef.current += 1;
    cancelVerificationFlow();
    const reqId = regenPhraseReqRef.current + 1;
    regenPhraseReqRef.current = reqId;
    setRegenPhraseBusy(true);
    setWizardNotice(null);
    try {
      clearRejectedVerification();
      setValidation((current) => ({ ...current, clientAttemptId: nextClientAttemptId, loading: true, error: "", phrase: "" }));
      const currentInfo = await getValidateInfoOnce(currentTaskId);
      if (regenPhraseReqRef.current !== reqId) return;
      const currentStatus = normalizeStatus(currentInfo.ok ? currentInfo.status : "");
      if (isIncompatibleValidationStatus(currentStatus) || indicatesInvalidTask(currentInfo.error)) {
        const ok = await startNewValidationTask(nextClientAttemptId);
        if (!ok) {
          setWizardNotice({
            kind: "regen_failed",
            title: "No pudimos preparar una frase nueva",
            message: "Intenta nuevamente en unos momentos.",
            actionLabel: "Intentar nuevamente",
          });
        } else {
          setWizardStep(2);
        }
        return;
      }

      const t = await getAccessToken();
      if (!t.ok) {
        setValidation((current) => ({ ...current, loading: false, error: t.error || "No se pudo iniciar sesión." }));
        return;
      }

      const r = await fetch("/api/suno/voice-regenerate", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${t.token}` },
        body: JSON.stringify({ taskId: currentTaskId, clientAttemptId: nextClientAttemptId }),
      });
      const out = await r.json().catch(() => ({}));
      if (!r.ok) {
        const raw = String(out?.detail || out?.error || "").trim();
        if (indicatesInvalidTask(raw) || isIncompatibleValidationStatus(currentStatus)) {
          const ok = await startNewValidationTask(nextClientAttemptId);
          if (!ok) {
            setWizardNotice({
              kind: "regen_failed",
              title: "No pudimos preparar una frase nueva",
              message: "Intenta nuevamente en unos momentos.",
              actionLabel: "Intentar nuevamente",
            });
          } else {
            setWizardStep(2);
          }
          return;
        }
        const msg = isTemporaryErrorMessage(raw)
          ? "No pudimos preparar la frase. Hubo un problema temporal. Intenta nuevamente."
          : "No pudimos preparar la frase. Intenta nuevamente.";
        setValidation((current) => ({ ...current, loading: false, error: msg }));
        setWizardNotice({
          kind: "temp_error",
          title: "No pudimos preparar la frase",
          message: "Hubo un problema temporal. Tu audio original sigue guardado.",
          actionLabel: "Intentar nuevamente",
        });
        return;
      }

      const nextTaskId = String(out?.taskId || "").trim();
      if (!nextTaskId) {
        setWizardNotice({
          kind: "regen_failed",
          title: "No pudimos preparar una frase nueva",
          message: "Intenta nuevamente en unos momentos.",
          actionLabel: "Intentar nuevamente",
        });
        setValidation((current) => ({ ...current, loading: false }));
        return;
      }

      setValidation((current) => ({
        ...current,
        clientAttemptId: nextClientAttemptId,
        taskId: nextTaskId,
        loading: true,
        error: "",
        phrase: "",
      }));
      const phrase = await pollValidateInfo(nextTaskId, nextClientAttemptId);
      if (!phrase) {
        setWizardNotice({
          kind: "regen_failed",
          title: "No pudimos preparar una frase nueva",
          message: "Intenta nuevamente en unos momentos.",
          actionLabel: "Intentar nuevamente",
        });
        return;
      }
      setWizardStep(2);
    } finally {
      if (regenPhraseReqRef.current === reqId) setRegenPhraseBusy(false);
      pendingAutoRecoverRef.current.requested = false;
      if (regenPhraseLockRef.current.clientAttemptId === nextClientAttemptId) regenPhraseLockRef.current.running = false;
    }
  };

  const waitForWaitValidating = async (validationTaskId, runId) => {
    const startedAt = Date.now();
    let attempts = 0;
    let delayMs = 1200;
    while (Date.now() - startedAt < 60 * 1000 && attempts < 18) {
      if (verifyFlowRunRef.current !== runId) return { ok: false, status: "", validateInfo: "" };
      const info = await getValidateInfoOnce(validationTaskId);
      if (!info.ok) return { ok: false, status: "", validateInfo: "" };
      const s = normalizeStatus(info.status);
      if (s === "wait_validating") return { ok: true, status: info.status, validateInfo: info.validateInfo };
      if (s === "success") return { ok: false, status: info.status, validateInfo: info.validateInfo, success: true };
      if (isIncompatibleValidationStatus(s)) return { ok: false, status: info.status, validateInfo: info.validateInfo, incompatible: true };
      if (isProcessingValidationStatus(s)) {
        setVoiceGen((current) => ({ ...current, loading: true, status: "preparing_validation", error: "" }));
        await new Promise((r) => setTimeout(r, delayMs));
        attempts += 1;
        delayMs = Math.min(5200, Math.floor(delayMs * 1.35));
        continue;
      }
      return { ok: false, status: info.status, validateInfo: info.validateInfo, incompatible: true };
    }
    return { ok: false, status: "", validateInfo: "" };
  };

  const startGenerateVoice = async (verifyUrlOverride) => {
    const validationTaskId = String(validation.taskId || "").trim();
    if (!validationTaskId) {
      setVoiceGen((current) => ({ ...current, error: "Falta taskId de validación. Regresa y genera la frase primero." }));
      return false;
    }
    const verifyUrl = String(verifyUrlOverride || verifyUpload.url || "").trim();
    if (!verifyUrl) {
      setVoiceGen((current) => ({ ...current, error: "Primero sube el audio de verificación para obtener una URL válida." }));
      return false;
    }
    setVoiceGen({ taskId: "", status: "", voiceId: "", loading: true, error: "", isAvailable: null });
    setSaveError("");
    try {
      const t = await getAccessToken();
      if (!t.ok) {
        setVoiceGen((current) => ({ ...current, loading: false, error: t.error || "No se pudo iniciar sesión." }));
        return false;
      }
      const body = {
        taskId: validationTaskId,
        verifyUrl,
        voiceName: profile.name,
        description: profile.description,
        style: profile.style,
        singerSkillLevel: profile.level,
        clientAttemptId: String(validation.clientAttemptId || "").trim() || undefined,
      };
      const r = await fetch("/api/suno/voice-generate", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${t.token}` },
        body: JSON.stringify(body),
      });
      const out = await r.json().catch(() => ({}));
      if (!r.ok) {
        const raw = String(out?.detail || out?.error || "No se pudo iniciar la creación de voz.").trim();
        const looksInvalidStatus = /validate record is not in valid status/i.test(raw);
        if (looksInvalidStatus) {
          setVoiceGen((current) => ({ ...current, loading: false, error: "La sesión de verificación ya no está disponible. Prepararemos una frase nueva." }));
          return { ok: false, needsNewPhrase: true, raw };
        }
        const msg = raw || "No se pudo iniciar la creación de voz.";
        setVoiceGen((current) => ({ ...current, loading: false, error: msg }));
        return false;
      }
      const taskId = String(out?.taskId || "").trim();
      if (!taskId) {
        setVoiceGen((current) => ({ ...current, loading: false, error: "No recibí taskId de creación de voz." }));
        return false;
      }
      setVoiceGen((current) => ({ ...current, taskId, loading: true, error: "" }));
      await pollVoiceRecordInfo(taskId);
      const available = await checkAvailability(taskId);
      setVoiceGen((current) => ({ ...current, isAvailable: available }));
      return true;
    } catch (e) {
      setVoiceGen((current) => ({ ...current, loading: false, error: e instanceof Error ? e.message : "No se pudo crear la voz." }));
      return false;
    }
  };

  const startVerificationFlow = async ({ force = false } = {}) => {
    const validationTaskId = String(validation.taskId || "").trim();
    if (!validationTaskId) return;
    const clientAttemptId = String(validation.clientAttemptId || "").trim();
    if (!clientAttemptId) {
      setVoiceGen((current) => ({ ...current, loading: false, error: "Necesitamos preparar la frase antes de verificar tu voz." }));
      return;
    }
    const file = profile.verifyAudio;
    if (!file) return;
    if (verifyAttemptIdRef.current && verifyAttemptIdRef.current !== clientAttemptId) {
      verifyAutoRef.current.running = false;
      setVoiceGen((current) => ({
        ...current,
        loading: false,
        error: "La grabación no corresponde a la frase actual. Prepararemos una frase nueva para que puedas grabarla.",
        status: "needs_new_phrase",
      }));
      return;
    }
    const sig = `${file.name}|${file.size}|${file.lastModified}`;
    const key = `${clientAttemptId}|${validationTaskId}|${sig}|${force ? "force" : "auto"}|${verifyAutoRef.current.attempt}`;
    if (!force && (verifyAutoRef.current.running || verifyAutoRef.current.key === key)) return;
    const runId = verifyFlowRunRef.current + 1;
    verifyFlowRunRef.current = runId;
    verifyAutoRef.current = { key, attempt: verifyAutoRef.current.attempt, running: true };
    verifyLastErrorRef.current = "";
    setVoiceGen((current) => ({ ...current, loading: true, error: "", status: "preparing_validation" }));
    try {
      const current = await getValidateInfoOnce(validationTaskId);
      if (verifyFlowRunRef.current !== runId) return;
      if (current.ok) {
        setValidation((v) =>
          v.taskId !== validationTaskId || v.clientAttemptId !== clientAttemptId
            ? v
            : { ...v, status: current.status || v.status, phrase: current.validateInfo || v.phrase },
        );
      }

      const s0 = normalizeStatus(current.ok ? current.status : "");
      if (s0 === "success") {
        const done = await checkExistingResultIfAny(validationTaskId, runId);
        verifyAutoRef.current.running = false;
        if (done) return;
        setVoiceGen((current2) => ({ ...current2, loading: true, status: "preparing_validation", error: "" }));
        return;
      }

      if (isIncompatibleValidationStatus(s0)) {
        verifyAutoRef.current.running = false;
        await prepareNewPhrase("incompatible_status", runId);
        return;
      }

      if (s0 !== "wait_validating" && isProcessingValidationStatus(s0)) {
        const waited = await waitForWaitValidating(validationTaskId, runId);
        if (verifyFlowRunRef.current !== runId) return;
        if (waited?.incompatible) {
          verifyAutoRef.current.running = false;
          await prepareNewPhrase("incompatible_after_wait", runId);
          return;
        }
        if (waited?.success) {
          const done = await checkExistingResultIfAny(validationTaskId, runId);
          verifyAutoRef.current.running = false;
          if (done) return;
        }
        if (!waited?.ok) {
          verifyAutoRef.current.running = false;
          setVoiceGen((current2) => ({ ...current2, loading: false, error: "La verificación está tardando demasiado. Intenta nuevamente." }));
          verifyLastErrorRef.current = "unknown";
          return;
        }
      }

      if (verifyFlowRunRef.current !== runId) return;
      const readyInfo = await getValidateInfoOnce(validationTaskId);
      if (verifyFlowRunRef.current !== runId) return;
      const readyStatus = normalizeStatus(readyInfo.ok ? readyInfo.status : "");
      if (readyStatus !== "wait_validating") {
        verifyAutoRef.current.running = false;
        await prepareNewPhrase("not_wait_validating", runId);
        return;
      }

      let uploadedUrl = String(verifyUpload.clientAttemptId === clientAttemptId ? verifyUpload.url : "").trim();
      if (!uploadedUrl) {
        setVerifyUpload((c) => ({ ...c, loading: true, error: "" }));
        const uploaded = await uploadWizardAudio(file, "verify");
        if (verifyFlowRunRef.current !== runId) return;
        uploadedUrl = String(uploaded?.url || "").trim();
        if (!uploadedUrl) {
          setVoiceGen((current2) => ({ ...current2, loading: false }));
          verifyAutoRef.current.running = false;
          verifyLastErrorRef.current = "upload";
          return;
        }
      }

      setVoiceGen((current2) => ({ ...current2, loading: true, error: "", status: "" }));
      const gen = await startGenerateVoice(uploadedUrl);
      verifyAutoRef.current.running = false;
      if (gen && typeof gen === "object" && gen.needsNewPhrase) {
        await prepareNewPhrase("provider_invalid_status", runId);
        return;
      }
    } catch {
      verifyAutoRef.current.running = false;
      verifyLastErrorRef.current = "unknown";
    }
  };

  const wantsNewPhrase = (msg) => {
    const text = String(msg || "").toLowerCase();
    if (!text) return false;
    return (
      text.includes("venc") ||
      text.includes("expired") ||
      text.includes("invalid task") ||
      text.includes("not found") ||
      text.includes("validate record is not in valid status")
    );
  };

  useEffect(() => {
    if (wizardStep !== 3) return;
    if (!profile.verifyAudio) return;
    if (!validation.taskId) return;
    if (voiceGen.voiceId) return;
    if (verifyUpload.loading || voiceGen.loading) return;
    if (verifyUpload.url || voiceGen.taskId) return;
    startVerificationFlow({ force: false }).catch(() => {});
  }, [wizardStep, validation.taskId, profile.verifyAudio]);

  useEffect(() => {
    if (wizardStep === 3 && voiceGen.voiceId) {
      setWizardStep(4);
    }
  }, [wizardStep, voiceGen.voiceId]);

  const saveToSunoVoices = async () => {
    const voiceId = String(voiceGen.voiceId || "").trim();
    const taskId = String(voiceGen.taskId || "").trim();
    if (!voiceId) return false;
    setSaving(true);
    setSaveError("");
    try {
      const t = await getAccessToken();
      if (!t.ok) {
        setSaveError(t.error || "No se pudo iniciar sesión.");
        return false;
      }
      const meta = {
        description: profile.description,
        singerSkillLevel: profile.level,
        profileImageUrl: "",
        style: profile.style,
        language,
      };
      const r = await fetch("/api/suno/voices", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${t.token}` },
        body: JSON.stringify({
          sunoVoiceId: voiceId,
          name: profile.name,
          status: voiceGen.isAvailable ? "ready" : "processing",
          taskId,
          meta,
        }),
      });
      const out = await r.json().catch(() => ({}));
      if (!r.ok) {
        const msg = String(out?.detail || out?.error || "No se pudo guardar el personaje.").trim();
        setSaveError(msg);
        return false;
      }
      try {
        const raw = window.localStorage.getItem(sunoVoicesCacheKey);
        const parsed = raw ? JSON.parse(raw) : null;
        const list = Array.isArray(parsed) ? parsed : [];
        const next = [
          { voiceId, name: profile.name, createdAt: new Date().toISOString(), taskId, status: voiceGen.isAvailable ? "ready" : "processing", profileImageUrl: "", description: profile.description, singerSkillLevel: profile.level },
          ...list.filter((x) => String(x?.voiceId || x?.voice_id || "").trim() !== voiceId),
        ];
        window.localStorage.setItem(sunoVoicesCacheKey, JSON.stringify(next.slice(0, 50)));
      } catch {}
      return true;
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "No se pudo guardar el personaje.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="wizard-overlay" data-step={wizardStep} role="dialog" aria-modal="true" aria-label="Crear perfil de voz">
      <div className="voice-wizard">
        <div className="wizard-header"><div><span className="eyebrow">CLONACIÓN DE VOZ · PERFIL PERSONAL</span><h2>Crear perfil de voz</h2></div><button className="wizard-close" aria-label="Cerrar creación de perfil" onClick={() => { cancelVerificationFlow(); cleanupPhraseRecording(); cleanupSourcePlayer(); onClose(); }}><X size={23} /></button></div>
        <div className="wizard-progress">{wizardSteps.map((label,index)=><div key={label} className={index === wizardStep ? "active" : index < wizardStep ? "done" : ""}><span>{index < wizardStep ? <Check size={14} weight="bold" /> : index + 1}</span><small>{label}</small></div>)}</div>
        <div className="wizard-body" ref={wizardBodyRef}>
          {wizardStep === 0 && <div className="wizard-section"><h3>Datos del perfil</h3><p>Estos datos te ayudarán a reconocer y reutilizar esta voz.</p><label>Nombre de la voz<input value={profile.name} onChange={(e)=>setProfile({...profile,name:e.target.value})} placeholder="Ejemplo: Mi voz principal" /></label><label>Descripción<input value={profile.description} onChange={(e)=>setProfile({...profile,description:e.target.value})} placeholder="Ejemplo: Voz cálida para baladas" /></label><div className="wizard-fields"><label>Estilo vocal<select value={profile.style} onChange={(e)=>setProfile({...profile,style:e.target.value})}><option>Pop</option><option>Balada</option><option>Regional</option><option>Rock</option><option>Otro</option></select></label><label>Nivel del cantante<select value={profile.level} onChange={(e)=>setProfile({...profile,level:e.target.value})}><option value="beginner">Principiante</option><option value="intermediate">Intermedio</option><option value="advanced">Avanzado</option><option value="professional">Profesional</option></select></label></div><div className="wizard-info"><Info size={19}/><span>Después subirás dos audios distintos: uno para crear la voz y otro para verificarla.</span></div></div>}
          {wizardStep === 1 && (
            <div className="wizard-section">
              <h3>Audio original</h3>
              <p>¿Cómo quieres proporcionar tu voz?</p>

              <div className="segmented" style={{ marginTop: 10 }}>
                <button
                  className={sourceInputMode === "upload" ? "selected" : ""}
                  type="button"
                  onClick={() => {
                    setSourceInputMode("upload");
                    cleanupSourceRecording();
                    setSourceRecordedFile(null);
                  }}
                >
                  Subir audio
                </button>
                <button
                  className={sourceInputMode === "sing" ? "selected" : ""}
                  type="button"
                  onClick={async () => {
                    if (typeof window === "undefined" || !navigator?.mediaDevices?.getUserMedia) {
                      showAlert({ tone: "error", message: "Tu navegador no permite grabar audio. Usa la opción Subir audio." });
                      return;
                    }
                    try {
                      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                      try {
                        stream.getTracks().forEach((t) => t.stop());
                      } catch {}
                      setSourceInputMode("sing");
                      setSourceRecording((current) => ({ ...current, error: "" }));
                    } catch (e) {
                      const raw = e instanceof Error ? e.message : String(e || "");
                      const msg = /denied|notallowed|permission/i.test(raw)
                        ? "Permiso de micrófono rechazado. Puedes usar Subir audio."
                        : "No pudimos acceder al micrófono. Puedes usar Subir audio.";
                      showAlert({ tone: "error", message: msg });
                    }
                  }}
                >
                  Cantar aquí
                </button>
              </div>

              {sourceInputMode === "upload" ? (
                <>
                  <p style={{ marginTop: 14 }}>Este es el audio que se utilizará para crear el perfil. Busca una parte con voz clara y poco ruido.</p>
                  <label className="wizard-upload">
                    <UploadSimple size={35} />
                    <strong>{profile.sourceAudio?.name || "Subir audio para entrenar la voz"}</strong>
                    <small>Solo archivos MP3</small>
                    <input type="file" accept="audio/mpeg,.mp3" onChange={(e) => acceptMp3(e.target.files[0], "sourceAudio")} />
                  </label>
                  <div className="sample-actions">
                    <a href={mp3ConverterUrl} target="_blank" rel="noopener noreferrer">
                      <Waveform size={18} /> Convertir a MP3
                    </a>
                  </div>
                </>
              ) : (
                <>
                  <p style={{ marginTop: 14 }}>Graba una muestra de tu voz. Cuando termines, podrás escucharla antes de usarla.</p>

                  {sourceRecording.error ? (
                    <div className="wizard-info" style={{ marginTop: 10 }}>
                      <Info size={19} />
                      <span>{sourceRecording.error}</span>
                    </div>
                  ) : null}

                  <div className="sample-actions" style={{ marginTop: 12 }}>
                    {!sourceRecording.recording ? (
                      <button type="button" className="wizard-next phrase-finish" onClick={startSourceRecording}>
                        <Microphone size={19} /> Comenzar grabación
                      </button>
                    ) : (
                      <button type="button" className="wizard-next phrase-finish recording" onClick={stopSourceRecording}>
                        <Check size={19} weight="bold" /> Detener grabación
                      </button>
                    )}
                  </div>

                  {sourceRecording.recording && sourceMeterStream ? <VoiceMeter stream={sourceMeterStream} mode="indicator" /> : null}
                  {sourceRecording.recording ? <small className="phrase-help">Grabando… {formatTime(sourceRecording.seconds)}</small> : null}

                  {sourceRecordedFile && sourceRecording.url ? (
                    <div className="profile-preview" style={{ marginTop: 14 }}>
                      <span>Grabación</span>
                      <strong>{sourceRecordedFile?.name || "Grabación lista"}</strong>
                      <small>{sourceRecording.mimeType || (sourceRecordedFile?.type || "")}</small>
                      <audio ref={sourceRecordedAudioRef} controls src={sourceRecording.url} style={{ width: "100%", marginTop: 10 }} />
                      <div className="sample-actions" style={{ marginTop: 12 }}>
                        <button
                          type="button"
                          onClick={() => {
                            const el = sourceRecordedAudioRef.current;
                            if (!el) return;
                            try {
                              el.currentTime = 0;
                            } catch {}
                            el.play?.().catch?.(() => {});
                          }}
                        >
                          Escuchar
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            cleanupSourceRecording();
                            startSourceRecording().catch(() => {});
                          }}
                        >
                          Grabar de nuevo
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const f = sourceRecordedFile;
                            if (!f) return;
                            applySourceAudioFile(f);
                            cleanupSourceRecording();
                            setSourceInputMode("upload");
                          }}
                        >
                          Usar esta grabación
                        </button>
                      </div>
                      <small className="phrase-help">Al usarla, esta grabación entra al mismo flujo que “Subir audio”.</small>
                    </div>
                  ) : null}
                </>
              )}

              {sourceUpload.loading ? (
                <div className="audio-upload-status" style={{ marginTop: 10 }}>
                  <Loader2 size={18} className="animate-spin" /> Subiendo audio…
                </div>
              ) : sourceUpload.error ? (
                <div className="audio-upload-status error">{sourceUpload.error}</div>
              ) : sourceUpload.url ? (
                <div className="audio-upload-status success">Audio subido. URL lista para validar.</div>
              ) : null}

              {sourceReady ? (
                <div className="profile-preview" style={{ marginTop: 14 }}>
                  <span>Audio seleccionado</span>
                  <strong>{profile.sourceAudio?.name || "Audio"}</strong>
                  <small>Duración: {formatTime(profile.audioDuration)}</small>
                  {sourcePlayerSrc ? (
                    <audio
                      controls
                      preload="metadata"
                      src={sourcePlayerSrc}
                      onError={() => {
                        if (sourcePlayer.mode === "remote" && sourcePlayer.localUrl) {
                          setSourcePlayer((c) => ({ ...c, mode: "local", remoteFailed: true }));
                          return;
                        }
                        setSourcePlayer((c) => ({ ...c, hardError: true, error: "No pudimos reproducir este audio. Vuelve a subirlo." }));
                      }}
                      style={{ width: "100%", marginTop: 10 }}
                    />
                  ) : null}
                  {sourcePlayer.error ? (
                    <div className="wizard-info" style={{ marginTop: 10 }}>
                      <Info size={19} />
                      <span>{sourcePlayer.error}</span>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {sourceReady ? (
                <div className="segment-box">
                  <div>
                    <strong>Selecciona el fragmento vocal</strong>
                    <InfoTip title="¿Qué fragmento elegir?">
                      La línea representa todo el audio. Mueve los controles para seleccionar una parte donde la voz se escuche claramente.
                    </InfoTip>
                  </div>
                  <div className="timeline-summary">
                    <span>
                      Inicio <strong>{formatTime(profile.start)}</strong>
                    </span>
                    <span>
                      Fragmento seleccionado: <strong>{formatTime(profile.end - profile.start)}</strong>
                    </span>
                    <span>
                      Final <strong>{formatTime(profile.end)}</strong>
                    </span>
                  </div>
                  <div
                    className="dual-timeline"
                    style={{
                      "--timeline-start": `${(profile.start / profile.audioDuration) * 100}%`,
                      "--timeline-end": `${(profile.end / profile.audioDuration) * 100}%`,
                    }}
                  >
                    <div className="timeline-track" />
                    <input
                      aria-label="Inicio del fragmento"
                      type="range"
                      min="0"
                      max={Math.max(0, profile.audioDuration - 1)}
                      value={profile.start}
                      onInput={(e) => setProfile({ ...profile, start: Math.min(Number(e.currentTarget.value), profile.end - 1) })}
                    />
                    <input
                      aria-label="Final del fragmento"
                      type="range"
                      min="1"
                      max={profile.audioDuration}
                      value={profile.end}
                      onInput={(e) => setProfile({ ...profile, end: Math.max(Number(e.currentTarget.value), profile.start + 1) })}
                    />
                  </div>
                  <div className="timeline-scale">
                    <span>0:00</span>
                    <span>Audio completo</span>
                    <Waveform size={20} />
                    <span>{formatTime(profile.audioDuration)}</span>
                  </div>
                </div>
              ) : null}
            </div>
          )}
          {wizardStep === 2 && (
            <div className="wizard-section phrase-section">
              <h3>Frase de verificación</h3>

              {wizardNotice ? (
                <div className={`wizard-state-card ${wizardNotice.kind === "temp_error" ? "warning" : "error"}`}>
                  <h4>{wizardNotice.title}</h4>
                  <p>{wizardNotice.message}</p>
                  {wizardNotice.actionLabel ? (
                    <div className="sample-actions">
                      <button
                        type="button"
                        disabled={regenPhraseBusy || validation.loading || phraseCountdown.active}
                        onClick={() => {
                          if (wizardNotice.kind === "repeat_phrase") {
                            setWizardNotice(null);
                            return;
                          }
                          handleRegeneratePhrase().catch(() => {});
                        }}
                      >
                        {wizardNotice.actionLabel}
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <p><strong>Canta la frase una sola vez</strong></p>
              <p>Canta exactamente las palabras mostradas, con voz clara y sin ruido. Puedes usar la melodía que prefieras. Cuando termines, pulsa Detener grabación.</p>
              <small className="phrase-help">Si quieres intentarlo otra vez, utiliza Repetir grabación.</small>

              {(validation.loading || (!validation.phrase && !validation.error)) ? (
                <div className="wizard-loading-card" aria-live="polite">
                  <div className="wizard-loading-title">
                    <Loader2 size={22} className="luciana-spin" />
                    <strong>Preparando tu frase…</strong>
                  </div>
                  <p>Estamos creando una frase única para verificar tu voz.</p>
                  {phraseLoadingSlow ? <small>Está tardando un poco más de lo esperado. Seguimos preparando tu frase.</small> : null}
                </div>
              ) : null}

              {validation.error ? (
                <div className="wizard-state-card warning">
                  <h4>No pudimos preparar tu frase</h4>
                  <p>{String(validation.error || "Intenta nuevamente.").trim() || "Intenta nuevamente."}</p>
                  <div className="sample-actions">
                    <button
                      type="button"
                      disabled={validation.loading || regenPhraseBusy || phraseCountdown.active}
                      onClick={() => {
                        const taskId = String(validation.taskId || "").trim();
                        if (taskId) {
                          setValidation((current) => ({ ...current, loading: true, error: "", phrase: "" }));
                          pollValidateInfo(taskId, validation.clientAttemptId).catch(() => {});
                          return;
                        }
                        startValidate().catch(() => {});
                      }}
                    >
                      Intentar nuevamente
                    </button>
                  </div>
                </div>
              ) : null}

              {(!validation.loading && validation.phrase) ? (
                <div className="phrase-card">
                  <Microphone size={32} />
                  <blockquote>“{validation.phrase}”</blockquote>
                </div>
              ) : null}

              <div className="sample-actions">
                <button
                  disabled={!validation.taskId || validation.loading || regenPhraseBusy || phraseCountdown.active || phraseRecording.recording}
                  onClick={() => handleRegeneratePhrase().catch(() => {})}
                >
                  <ArrowRight size={18} /> Regenerar frase
                </button>
              </div>
              <div className="wizard-info"><Info size={19} /><span>Usa Regenerar frase solo si el sistema te pide una frase nueva o si la frase ya no funciona.</span></div>

              {phraseRecording.error ? <div className="wizard-info"><Info size={19} /><span>{phraseRecording.error}</span></div> : null}

              {phraseCountdown.active ? (
                <div className="wizard-countdown">
                  <div className="wizard-countdown-number">{phraseCountdown.step}</div>
                  <div className="sample-actions" style={{ marginTop: 10 }}>
                    <button type="button" onClick={cancelPhraseCountdown}>Cancelar</button>
                  </div>
                </div>
              ) : null}

              {(!validation.loading && validation.phrase && !verificationReady) ? (
                <div className="sample-actions">
                  {!phraseRecording.recording ? (
                    <button className="wizard-next phrase-finish" type="button" disabled={phraseCountdown.active} onClick={startPhraseRecording}>
                      <Microphone size={19} /> Comenzar grabación
                    </button>
                  ) : (
                    <button className="wizard-next phrase-finish recording" type="button" onClick={stopPhraseRecording}>
                      <Check size={19} weight="bold" /> Detener grabación
                    </button>
                  )}
                </div>
              ) : null}

              {phraseRecording.recording && phraseMeterStream ? <VoiceMeter stream={phraseMeterStream} mode="indicator" /> : null}
              {phraseRecording.recording ? <small className="phrase-help">Grabando… {formatTime(phraseRecording.seconds)}</small> : null}

              {verificationReady && phraseRecording.url ? (
                <div className="profile-preview" style={{ marginTop: 14 }}>
                  <span>Grabación</span>
                  <strong>{profile.verifyAudio?.name || "Grabación lista"}</strong>
                  <small>{phraseRecording.mimeType || (profile.verifyAudio?.type || "")}</small>
                  <audio controls src={phraseRecording.url} style={{ width: "100%", marginTop: 10 }} />
                  <div className="sample-actions" style={{ marginTop: 12 }}>
                    <button
                      type="button"
                      onClick={() => {
                        cleanupPhraseRecording();
                        setProfile((current) => ({ ...current, verifyAudio: null }));
                        resetVerificationState();
                        startPhraseRecording().catch(() => {});
                      }}
                    >
                      Repetir grabación
                    </button>
                  </div>
                  <small className="phrase-help">Esto reemplaza solo esta grabación. La frase seguirá siendo la misma.</small>
                </div>
              ) : null}

              <small className="phrase-help">Necesitas una grabación válida para continuar.</small>
            </div>
          )}
          {wizardStep === 3 && <div className="wizard-section"><h3>Verificación</h3><p>Estamos verificando tu voz con la grabación de la frase.</p>{!verificationReady ? <div className="wizard-info"><Info size={19}/><span>No encontré una grabación. Regresa al paso anterior y graba la frase.</span></div> : <div className="profile-preview"><span>Grabación</span><strong>{profile.verifyAudio?.name || "Grabación lista"}</strong><small>{(profile.verifyAudio?.type || "").toString()}</small>{phraseRecording.url ? <audio controls src={phraseRecording.url} style={{ width: "100%", marginTop: 10 }} /> : null}</div>}{(verifyUpload.loading || voiceGen.loading) ? <div className="wizard-info" style={{ marginTop: 12 }}><Loader2 size={18} className="animate-spin" /><span>{verifyUpload.loading ? "Subiendo la grabación…" : voiceGen.status === "preparing_validation" ? "Preparando la verificación…" : "Verificando tu voz…"}</span></div> : null}{verifyUpload.error ? <div className="wizard-info" style={{ marginTop: 12 }}><Info size={19}/><span>{verifyUpload.error}</span></div> : null}{voiceGen.error ? <div className="wizard-info" style={{ marginTop: 12 }}><Info size={19}/><span>{voiceGen.error}</span></div> : null}{(verifyUpload.error || (voiceGen.error && !wantsNewPhrase(voiceGen.error))) && voiceGen.status !== "needs_new_phrase" ? <div className="sample-actions" style={{ marginTop: 12 }}><button type="button" disabled={verifyUpload.loading || voiceGen.loading} onClick={() => { verifyAutoRef.current.attempt += 1; startVerificationFlow({ force: true }).catch(() => {}); }}>Intentar nuevamente</button></div> : null}{(voiceGen.error && wantsNewPhrase(voiceGen.error)) ? <div className="sample-actions" style={{ marginTop: 12 }}><button type="button" disabled={!validation.taskId || validation.loading || regenPhraseBusy} onClick={() => handleRegeneratePhrase().catch(() => {})}>Regenerar frase</button></div> : null}</div>}
          {wizardStep === 4 && <div className="wizard-section ready-section"><div className="ready-icon">{voiceGen.loading ? <Loader2 size={28} className="animate-spin" /> : <Check size={34} weight="bold"/>}</div><h3>{voiceGen.loading ? "Creando tu personaje…" : voiceGen.voiceId ? "Personaje creado" : "Listo"}</h3><p>{voiceGen.loading ? "Estamos esperando el ID final." : voiceGen.voiceId ? "Tu personaje de voz ya tiene un ID válido." : "Completa los pasos anteriores para crear tu perfil de voz."}</p><div className="profile-preview"><span>Perfil</span><strong>{profile.name}</strong><small>{profile.style} · {profile.level}</small><span>Estado</span><strong>{voiceGen.voiceId ? `voiceId: ${voiceGen.voiceId}` : voiceGen.status || "Procesando"}</strong></div>{voiceGen.error ? <div className="wizard-info"><Info size={19}/><span>{voiceGen.error}</span></div> : null}{saveError ? <div className="wizard-info"><Info size={19}/><span>{saveError}</span></div> : null}{voiceGen.isAvailable === false ? <div className="wizard-info"><Info size={19}/><span>Tu voz aún no aparece como disponible. Puedes guardarla y estará lista en unos minutos.</span></div> : null}</div>}
        </div>
        <div className="wizard-footer">
          <button
            className="wizard-back"
            disabled={wizardStep === 0 || sourceContinueBusy || validation.loading || voiceGen.loading || saving || phraseRecording.recording || phraseCountdown.active}
            onClick={() => setWizardStep(Math.max(0, wizardStep - 1))}
          >
            <ArrowLeft size={18} /> Atrás
          </button>

          {wizardStep < 4 ? (
            <button
              className="wizard-next"
              disabled={
                sourceContinueBusy ||
                (wizardStep === 0 && !profile.name.trim()) ||
                (wizardStep === 1 &&
                  (!sourceReady ||
                    profile.end <= profile.start ||
                    sourceUpload.loading ||
                    !sourceUpload.url ||
                    sourcePlayerBlocking ||
                    validation.loading)) ||
                (wizardStep === 2 &&
                  (validation.loading || !validation.phrase || !verificationReady || phraseRecording.recording || phraseCountdown.active)) ||
                wizardStep === 3 ||
                wizardStep === 4
              }
              onClick={async () => {
                if (wizardStep === 1) {
                  if (sourceContinueBusy) return;
                  setSourceContinueBusy(true);
                  const ok = await startValidate().catch(() => false);
                  if (ok) {
                    setWizardStep(2);
                    return;
                  }
                  setSourceContinueBusy(false);
                  return;
                }
                if (wizardStep === 2) {
                  resetVerificationState();
                  setWizardStep(3);
                  return;
                }
                setWizardStep(wizardStep + 1);
              }}
            >
              {wizardStep === 1 && sourceContinueBusy ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  <span style={{ marginLeft: 8 }}>Procesando audio...</span>
                </>
              ) : (
                <>
                  Continuar <ArrowRight size={18} />
                </>
              )}
            </button>
          ) : (
            <button
              className="wizard-next"
              disabled={!voiceGen.voiceId || saving || voiceGen.loading}
              onClick={async () => {
                const ok = await saveToSunoVoices();
                if (!ok) return;
                cleanupPhraseRecording();
                onComplete({ name: profile.name, style: profile.style, level: profile.level, voiceId: voiceGen.voiceId });
              }}
            >
              <Check size={18} weight="bold" /> Guardar y usar
            </button>
          )}

          {wizardStep === 1 && sourceContinueBusy ? (
            <small style={{ display: "block", margin: "10px auto 0", maxWidth: 420, textAlign: "center", color: "rgba(220,220,240,.86)", lineHeight: 1.25 }}>
              Estamos preparando tu audio para crear la frase de verificación. Esto puede tardar unos segundos.
            </small>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function StartStep({ data, setData, setToast, handlers }) {
  const [clonePickerOpen, setClonePickerOpen] = useState(false);
  const [personasLoading, setPersonasLoading] = useState(false);
  const [personasError, setPersonasError] = useState('');
  const [personas, setPersonas] = useState([]);
  const [personaMenuOpen, setPersonaMenuOpen] = useState('');
  const [editingPersona, setEditingPersona] = useState(null);
  const [editingName, setEditingName] = useState('');
  const [deletingPersona, setDeletingPersona] = useState(null);
  const [personaActionLoading, setPersonaActionLoading] = useState(false);
  const previousVoiceRef = useRef(null);
  const fileName = data.file?.name;
  const uploading = Boolean(handlers?.isUploadingAudio);
  const uploadedAudioUrl = (handlers?.audioUploadUrl || '').toString().trim();
  const uploadError = (handlers?.audioUploadError || '').toString().trim();
  const hasSelectedAudio = Boolean(data.file || uploadedAudioUrl || uploading || uploadError);
  const needsAudioReupload = Boolean(handlers?.audioReuploadNeeded) && data.audioSource === 'upload' && !hasSelectedAudio;
  const [audioChoiceMode, setAudioChoiceMode] = useState(() => data.audioInputMode || (data.audioSource === 'upload' ? 'upload' : 'none'));
  const [singCountdown, setSingCountdown] = useState({ active: false, value: '' });
  const [singRecording, setSingRecording] = useState({ recording: false, seconds: 0, error: '', url: '', mimeType: '' });
  const [singMeterStream, setSingMeterStream] = useState(null);
  const [recordedTake, setRecordedTake] = useState(null);
  const [takePlaying, setTakePlaying] = useState(false);
  const singRecorderRef = useRef(null);
  const singStreamRef = useRef(null);
  const singChunksRef = useRef([]);
  const singCountdownTimerRef = useRef(0);
  const singRecordingTimerRef = useRef(0);
  const recordedTakeUrlRef = useRef('');
  const discardRecordedTakeRef = useRef(false);
  const recordedTakeAudioRef = useRef(null);
  const singStudioRef = useRef(null);
  const uploadInputRef = useRef(null);

  useEffect(() => {
    if (singRecording.recording || singCountdown.active) return;
    const nextMode = data.audioInputMode || (data.audioSource === 'upload' ? 'upload' : 'none');
    setAudioChoiceMode(nextMode);
  }, [data.audioInputMode, data.audioSource, singRecording.recording, singCountdown.active]);

  useEffect(() => () => {
    if (singCountdownTimerRef.current) window.clearTimeout(singCountdownTimerRef.current);
    if (singRecordingTimerRef.current) window.clearInterval(singRecordingTimerRef.current);
    try {
      if (singRecorderRef.current && singRecorderRef.current.state !== 'inactive') singRecorderRef.current.stop();
    } catch {}
    try {
      singStreamRef.current?.getTracks?.().forEach((track) => track.stop());
    } catch {}
    if (recordedTakeUrlRef.current) {
      try { URL.revokeObjectURL(recordedTakeUrlRef.current); } catch {}
    }
  }, []);

  const normalizePersona = (raw) => {
    const meta = raw?.meta && typeof raw.meta === 'object' && !Array.isArray(raw.meta) ? raw.meta : null;
    const voiceId = String(raw?.suno_voice_id || raw?.voiceId || raw?.voice_id || '').trim();
    if (!voiceId) return null;
    return {
      voiceId,
      name: String(raw?.name || raw?.voice_name || 'Voz').trim(),
      createdAt: String(raw?.created_at || raw?.createdAt || new Date().toISOString()).trim() || new Date().toISOString(),
      status: String(raw?.status || '').trim() || undefined,
      taskId: String(raw?.last_task_id || raw?.task_id || raw?.taskId || '').trim() || undefined,
      profileImageUrl: meta && typeof meta?.profileImageUrl === 'string' ? String(meta.profileImageUrl).trim() : typeof raw?.profileImageUrl === 'string' ? String(raw.profileImageUrl).trim() : undefined,
      description: meta && typeof meta?.description === 'string' ? String(meta.description) : typeof raw?.description === 'string' ? String(raw.description) : undefined,
      singerSkillLevel: meta && typeof meta?.singerSkillLevel === 'string' ? String(meta.singerSkillLevel) : typeof raw?.singerSkillLevel === 'string' ? String(raw.singerSkillLevel) : undefined,
      tags: meta && Array.isArray(meta?.tags) ? meta.tags.filter((x) => typeof x === 'string' && x.trim()).map((x) => String(x).trim()) : Array.isArray(raw?.tags) ? raw.tags.filter((x) => typeof x === 'string' && x.trim()).map((x) => String(x).trim()) : undefined,
      isPublic: meta && typeof meta?.isPublic === 'boolean' ? Boolean(meta.isPublic) : typeof raw?.isPublic === 'boolean' ? Boolean(raw.isPublic) : undefined,
    };
  };

  const sortPersonas = (list) =>
    list.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

  const writePersonasCache = (list) => {
    try {
      window.localStorage.setItem(sunoVoicesCacheKey, JSON.stringify((Array.isArray(list) ? list : []).slice(0, 50)));
    } catch {}
  };

  const applyPersonas = (list) => {
    const clean = sortPersonas(
      (Array.isArray(list) ? list : [])
        .map((v) => normalizePersona(v))
        .filter(Boolean),
    );
    setPersonas(clean);
    writePersonasCache(clean);
    return clean;
  };

  const loadPersonasFromLocalCache = () => {
    try {
      const raw = window.localStorage.getItem(sunoVoicesCacheKey);
      const parsed = raw ? JSON.parse(raw) : null;
      return applyPersonas(Array.isArray(parsed) ? parsed : []);
    } catch {
      setPersonas([]);
      return [];
    }
  };

  const loadPersonasFromDb = async () => {
    const t = await getAccessToken();
    if (!t.ok) return loadPersonasFromLocalCache();
    const r = await fetch('/api/suno/voices', { headers: { authorization: `Bearer ${t.token}` } });
    const out = await r.json().catch(() => ({}));
    if (!r.ok) return loadPersonasFromLocalCache();
    return applyPersonas(Array.isArray(out?.voices) ? out.voices : []);
  };

  const updateSelectedPersona = (persona) => {
    setData((current) => ({
      ...current,
      voice: 'clone',
      model: 'Suno V6',
      voiceProfile: persona,
    }));
  };

  const clearSelectedPersonaByVoiceId = (voiceId) => {
    setData((current) =>
      String(current?.voiceProfile?.voiceId || '').trim() === String(voiceId || '').trim()
        ? { ...current, voiceProfile: null }
        : current,
    );
    if (previousVoiceRef.current && String(previousVoiceRef.current?.voiceProfile?.voiceId || '').trim() === String(voiceId || '').trim()) {
      previousVoiceRef.current = {
        ...previousVoiceRef.current,
        voiceProfile: null,
      };
    }
  };

  const handleSelectStandardVoice = () => {
    setData((current) => ({
      ...current,
      voice: 'standard',
      model: current.model === 'Suno V6' || current.model === 'Suno V6 Wild' || current.model === 'Suno V6 Mini' ? current.model : 'Suno V6',
      voiceProfile: null,
    }));
    setClonePickerOpen(false);
    setPersonaMenuOpen('');
  };

  const closeClonePicker = ({ keepSelection } = {}) => {
    setClonePickerOpen(false);
    setPersonaMenuOpen('');
    setEditingPersona(null);
    setDeletingPersona(null);
    if (keepSelection) return;
    const prev = previousVoiceRef.current;
    if (!prev) return;
    setData((current) => ({
      ...current,
      voice: prev.voice,
      model: prev.model,
      voiceProfile: prev.voiceProfile,
    }));
  };

  const openClonePicker = () => {
    previousVoiceRef.current = { voice: data.voice, model: data.model, voiceProfile: data.voiceProfile };
    setData((current) => ({ ...current, voice: 'clone', model: 'Suno V6', voiceProfile: null }));
    setClonePickerOpen(true);
  };

  const goCreatePersona = () => {
    try {
      window.localStorage.setItem(returnToCreateVoicePickerKey, '1');
    } catch {}
    closeClonePicker({ keepSelection: true });
    handlers?.onGoCloneVoice?.();
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const shouldOpen = window.localStorage.getItem(returnToCreateVoicePickerKey);
      if (!shouldOpen) return;
      window.localStorage.removeItem(returnToCreateVoicePickerKey);
      openClonePicker();
    } catch {}
  }, []);

  useEffect(() => {
    if (!clonePickerOpen) return;
    let cancelled = false;
    setPersonasLoading(true);
    setPersonasError('');
    loadPersonasFromDb()
      .catch(() => loadPersonasFromLocalCache())
      .catch(() => [])
      .then((list) => {
        if (cancelled) return;
        if (Array.isArray(list)) return;
        setPersonas([]);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setPersonasLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clonePickerOpen]);

  const openRenamePersona = (persona) => {
    setPersonaMenuOpen('');
    setDeletingPersona(null);
    setEditingPersona(persona);
    setEditingName(String(persona?.name || ''));
  };

  const openDeletePersona = (persona) => {
    setPersonaMenuOpen('');
    setEditingPersona(null);
    setDeletingPersona(persona);
  };

  const savePersonaRename = async () => {
    const persona = editingPersona;
    const nextName = String(editingName || '').trim();
    if (!persona) return;
    if (!nextName) {
      setToast('Escribe un nombre para el personaje.');
      return;
    }
    setPersonaActionLoading(true);
    try {
      const t = await getAccessToken();
      if (!t.ok) {
        setToast(t.error || 'No se pudo iniciar sesión.');
        return;
      }
      const r = await fetch('/api/suno/voices', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${t.token}` },
        body: JSON.stringify({ sunoVoiceId: persona.voiceId, name: nextName }),
      });
      const out = await r.json().catch(() => ({}));
      if (!r.ok) {
        setToast((out?.error || out?.detail || 'No se pudo actualizar el nombre del personaje.').toString());
        return;
      }
      const saved = normalizePersona(out?.voice || { ...persona, name: nextName });
      const nextList = sortPersonas(personas.map((item) => (item.voiceId === persona.voiceId ? saved : item)).filter(Boolean));
      setPersonas(nextList);
      writePersonasCache(nextList);
      setData((current) =>
        String(current?.voiceProfile?.voiceId || '').trim() === persona.voiceId
          ? { ...current, voiceProfile: { ...current.voiceProfile, name: saved.name } }
          : current,
      );
      if (previousVoiceRef.current && String(previousVoiceRef.current?.voiceProfile?.voiceId || '').trim() === persona.voiceId) {
        previousVoiceRef.current = {
          ...previousVoiceRef.current,
          voiceProfile: {
            ...previousVoiceRef.current.voiceProfile,
            name: saved.name,
          },
        };
      }
      setEditingPersona(null);
      setEditingName('');
      setToast('Nombre del personaje actualizado.');
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'No se pudo actualizar el nombre del personaje.');
    } finally {
      setPersonaActionLoading(false);
    }
  };

  const deletePersona = async () => {
    const persona = deletingPersona;
    if (!persona) return;
    setPersonaActionLoading(true);
    try {
      const t = await getAccessToken();
      if (!t.ok) {
        setToast(t.error || 'No se pudo iniciar sesión.');
        return;
      }
      const r = await fetch('/api/suno/voices', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${t.token}` },
        body: JSON.stringify({ sunoVoiceId: persona.voiceId }),
      });
      const out = await r.json().catch(() => ({}));
      if (!r.ok) {
        setToast((out?.error || out?.detail || 'No se pudo eliminar el personaje.').toString());
        return;
      }
      const nextList = personas.filter((item) => item.voiceId !== persona.voiceId);
      setPersonas(nextList);
      writePersonasCache(nextList);
      clearSelectedPersonaByVoiceId(persona.voiceId);
      setDeletingPersona(null);
      setToast('Personaje eliminado.');
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'No se pudo eliminar el personaje.');
    } finally {
      setPersonaActionLoading(false);
    }
  };

  const revokeRecordedTakeUrl = () => {
    if (!recordedTakeUrlRef.current) return;
    try { URL.revokeObjectURL(recordedTakeUrlRef.current); } catch {}
    recordedTakeUrlRef.current = '';
  };

  const stopTakePlayback = () => {
    const audio = recordedTakeAudioRef.current;
    if (!audio) return;
    try {
      audio.pause();
      audio.currentTime = 0;
    } catch {}
    setTakePlaying(false);
  };

  const clearSingingTake = () => {
    stopTakePlayback();
    revokeRecordedTakeUrl();
    setRecordedTake(null);
    setSingRecording((current) => ({ ...current, url: '', seconds: 0, mimeType: '', error: '' }));
  };

  const stopSingingCapture = ({ discardTake = false, preservePreview = false } = {}) => {
    discardRecordedTakeRef.current = discardTake;
    if (singCountdownTimerRef.current) window.clearTimeout(singCountdownTimerRef.current);
    singCountdownTimerRef.current = 0;
    if (singRecordingTimerRef.current) window.clearInterval(singRecordingTimerRef.current);
    singRecordingTimerRef.current = 0;
    setSingCountdown({ active: false, value: '' });
    setSingMeterStream(null);
    try {
      if (singRecorderRef.current && singRecorderRef.current.state !== 'inactive') {
        singRecorderRef.current.stop();
      }
    } catch {}
    if (!preservePreview && discardTake) clearSingingTake();
    if (!singRecorderRef.current || singRecorderRef.current.state === 'inactive') {
      try {
        singStreamRef.current?.getTracks?.().forEach((track) => track.stop());
      } catch {}
      singStreamRef.current = null;
      setSingRecording((current) => ({ ...current, recording: false }));
    }
  };

  const pickRecordingMimeType = () => {
    if (typeof window === 'undefined' || typeof window.MediaRecorder !== 'function' || typeof window.MediaRecorder.isTypeSupported !== 'function') {
      return '';
    }
    const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/ogg'];
    return candidates.find((candidate) => window.MediaRecorder.isTypeSupported(candidate)) || '';
  };

  const extensionFromMimeType = (mimeType) => {
    const value = String(mimeType || '').toLowerCase();
    if (value.includes('webm')) return 'webm';
    if (value.includes('wav')) return 'wav';
    if (value.includes('ogg')) return 'ogg';
    if (value.includes('aac')) return 'aac';
    if (value.includes('mp4') || value.includes('m4a')) return 'm4a';
    return 'mp3';
  };

  const startRecorderWithStream = (stream) => {
    const RecorderClass = window.MediaRecorder;
    const mimeType = pickRecordingMimeType();
    let recorder;
    try {
      recorder = mimeType ? new RecorderClass(stream, { mimeType }) : new RecorderClass(stream);
    } catch {
      recorder = new RecorderClass(stream);
    }
    singRecorderRef.current = recorder;
    singChunksRef.current = [];
    discardRecordedTakeRef.current = false;
    recorder.addEventListener('dataavailable', (event) => {
      if (event?.data?.size) singChunksRef.current.push(event.data);
    });
    recorder.addEventListener('stop', () => {
      const shouldDiscard = discardRecordedTakeRef.current;
      discardRecordedTakeRef.current = false;
      if (singRecordingTimerRef.current) window.clearInterval(singRecordingTimerRef.current);
      singRecordingTimerRef.current = 0;
      try {
        singStreamRef.current?.getTracks?.().forEach((track) => track.stop());
      } catch {}
      singStreamRef.current = null;
      setSingMeterStream(null);
      singRecorderRef.current = null;
      if (shouldDiscard) {
        setSingRecording((current) => ({ ...current, recording: false, seconds: 0, url: '', mimeType: '', error: '' }));
        singChunksRef.current = [];
        return;
      }
      const finalMimeType = String(recorder.mimeType || mimeType || 'audio/webm').trim() || 'audio/webm';
      const blob = new Blob(singChunksRef.current, { type: finalMimeType });
      singChunksRef.current = [];
      const nextFile = new File([blob], `luciana-take-${Date.now()}.${extensionFromMimeType(finalMimeType)}`, { type: finalMimeType });
      stopTakePlayback();
      revokeRecordedTakeUrl();
      const nextUrl = URL.createObjectURL(nextFile);
      recordedTakeUrlRef.current = nextUrl;
      setRecordedTake(nextFile);
      setSingRecording((current) => ({ ...current, recording: false, url: nextUrl, mimeType: finalMimeType, error: '' }));
    });
    recorder.start();
    setSingRecording({ recording: true, seconds: 0, error: '', url: '', mimeType: mimeType || '' });
    singRecordingTimerRef.current = window.setInterval(() => {
      setSingRecording((current) => (current.recording ? { ...current, seconds: current.seconds + 1 } : current));
    }, 1000);
  };

  const scrollToSingStudio = () => {
    const el = singStudioRef.current;
    if (!el) return;
    if (typeof window === 'undefined') return;
    const isMobile = typeof window.matchMedia === 'function' ? window.matchMedia('(max-width: 700px)').matches : (window.innerWidth || 0) <= 700;
    if (!isMobile) return;
    const container = el.closest('.content-area');
    if (!container || typeof container.scrollTo !== 'function') {
      try {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch {}
      return;
    }
    const elRect = el.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    if (elRect.top >= containerRect.top + 18 && elRect.bottom <= containerRect.bottom - 18) return;
    const padding = 110;
    const deltaTop = elRect.top - containerRect.top;
    const nextTop = Math.max(0, container.scrollTop + deltaTop - padding);
    container.scrollTo({ top: nextTop, behavior: 'smooth' });
  };

  const openSingFlow = async () => {
    stopSingingCapture({ discardTake: true, preservePreview: false });
    setAudioChoiceMode('record');
    setData((current) => ({ ...current, audioInputMode: 'record' }));
    setSingRecording((current) => ({ ...current, error: '' }));
    window.setTimeout(scrollToSingStudio, 30);
    if (typeof window === 'undefined' || !navigator?.mediaDevices?.getUserMedia || typeof window.MediaRecorder !== 'function') {
      setToast('Tu navegador no permite grabar audio aquí. Usa “Subir mi audio”.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      singStreamRef.current = stream;
      setSingMeterStream(stream);
      const countdownSteps = ['3', '2', '1'];
      let index = 0;
      setSingCountdown({ active: true, value: countdownSteps[0] });
      const tick = () => {
        if (!singStreamRef.current) {
          setSingCountdown({ active: false, value: '' });
          return;
        }
        index += 1;
        if (index >= countdownSteps.length) {
          setSingCountdown({ active: false, value: '' });
          startRecorderWithStream(stream);
          return;
        }
        setSingCountdown({ active: true, value: countdownSteps[index] });
        singCountdownTimerRef.current = window.setTimeout(tick, 1000);
      };
      singCountdownTimerRef.current = window.setTimeout(tick, 1000);
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e || '');
      const message = /denied|notallowed|permission/i.test(raw)
        ? 'No se pudo acceder al micrófono. Revisa los permisos del navegador e inténtalo de nuevo.'
        : 'No se pudo iniciar la grabación. Inténtalo otra vez.';
      stopSingingCapture({ discardTake: true, preservePreview: false });
      setSingRecording((current) => ({ ...current, error: message }));
      setToast(message);
    }
  };

  const chooseFile = async (file, options = {}) => {
    if (!file) return false;
    const ext = (file.name || '').toString().toLowerCase().split('.').pop() || '';
    const isAudioOk = ext === 'mp3' || ext === 'wav' || ext === 'm4a' || ext === 'aac' || ext === 'ogg' || ext === 'webm' || (file.type || '').toString().startsWith('audio/');
    if (!isAudioOk) {
      setToast("Ese archivo no es de audio. Usa MP3, WAV o M4A.");
      return false;
    }
    const nextInputMode = typeof options?.inputMode === 'string' ? options.inputMode : 'upload';
    setAudioChoiceMode(nextInputMode);
    setData((current) => ({ ...current, audioInputMode: nextInputMode, audioSource: "upload", file }));
    if (handlers?.uploadAudio) {
      try {
        const ok = await handlers.uploadAudio(file);
        if (ok && options?.autoAdvance) handlers?.goToLyricsStep?.();
        return Boolean(ok);
      } catch {
        return false;
      }
    } else {
      setToast("Audio recibido. En el paso 2 verás la letra detectada.");
      if (options?.autoAdvance) handlers?.goToLyricsStep?.();
      return true;
    }
  };

  return (
    <section className="start-step">
      <div className="section-title"><span className="eyebrow">PASO 1 DE 4</span><h1>¿Cómo quieres comenzar?</h1><p>Primero elige la voz/personaje y después decide si tienes un audio.</p></div>
      <div className="start-grid">
        <div className="decision-group">
          <div className="decision-heading"><span>1</span><div><h2>¿Qué voz quieres usar?</h2><p>Podrás cambiar esta elección antes de generar.</p></div></div>
          <button className={data.voice === "standard" ? "decision-card selected" : "decision-card"} onClick={handleSelectStandardVoice}>
            <span className="choice-icon"><Microphone size={28} /></span>
            <span><strong>Voz estándar</strong><small>Una voz de alta calidad generada por IA</small></span>
            <InfoTip title="Voz estándar">Elige esta opción si no necesitas usar una voz clonada.</InfoTip>
            <span className="radio" />
          </button>
          <button className={data.voice === "clone" ? "decision-card selected" : "decision-card"} onClick={openClonePicker}>
            <span className="choice-icon"><Users size={28} /></span>
            <span><strong>Clonar voz <em>Suno V6</em></strong><small>Usa una voz clonada para tu canción</small></span>
            <InfoTip title="Clonación de Voz">Compatible con Suno V6, V6 Wild y V6 Mini. Elige una voz que ya hayas clonado antes.</InfoTip>
            <span className="radio" />
          </button>
          <div className="selection-summary"><Check size={18} weight="bold" /><span>{audioChoiceMode === "record" ? "Quiero cantarlo" : data.audioSource === "upload" ? "Audio MP3" : "Sin audio"} · {data.voice === "clone" ? "Clonar voz" : "Voz estándar"}</span></div>
          {data.voiceProfile && <div className="voice-profile-chip"><Users size={19}/><span><small>Personaje seleccionado</small><strong>{data.voiceProfile.name}</strong></span><button onClick={openClonePicker}>Cambiar</button></div>}
          {typeof handlers?.credits === 'number' && (
            <div className="selection-summary" style={{ marginTop: 12, padding: '10px 14px', borderRadius: 16, background: 'rgba(138,69,217,0.1)', border: '1px solid rgba(184,100,240,0.25)' }}>
              <Coins size={18} style={{ color: '#b864f0' }}/>
              <span style={{ fontSize: 13 }}><strong style={{ color: '#fff' }}>{handlers.credits.toFixed ? handlers.credits.toFixed(1) : handlers.credits}</strong> créditos disponibles</span>
            </div>
          )}
        </div>

        <div className="decision-group">
          <div className="decision-heading"><span>2</span><div><h2>¿Tienes un audio?</h2><p>Si lo subes, obtendremos la letra para el siguiente paso.</p></div></div>
          <div className="audio-choice-switcher">
            <label className={audioChoiceMode === "upload" ? "decision-card selected audio-upload-card" : "decision-card audio-upload-card"}>
              <span className="choice-icon teal">{uploading ? <Loader2 size={28} className="animate-spin"/> : <UploadSimple size={28} />}</span>
              <span><strong>{uploading ? "Subiendo audio…" : "Subir mi audio"}</strong><small>{uploading ? `Progreso ${handlers?.uploadProgress || 0}%` : fileName || "MP3 · WAV · M4A"}</small></span>
              {hasSelectedAudio && audioChoiceMode === "upload" ? (
                <button
                  type="button"
                  className="audio-remove-button"
                  aria-label="Quitar audio seleccionado"
                  title="Quitar audio"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handlers?.removeSelectedAudio?.({ nextAudioSource: "upload", nextAudioInputMode: "upload" });
                  }}
                >
                  <Trash size={15} />
                </button>
              ) : null}
              <span className="radio" />
              <input
                type="file"
                accept="audio/*,.mp3,.wav,.m4a"
                ref={uploadInputRef}
                onClick={() => {
                  stopSingingCapture({ discardTake: true, preservePreview: false });
                  setAudioChoiceMode('upload');
                  setData((current) => ({ ...current, audioInputMode: 'upload' }));
                }}
                onChange={(e) => chooseFile(e.target.files[0], { inputMode: 'upload' })}
                disabled={uploading}
              />
            </label>

            <button
              className={audioChoiceMode === "record" ? "decision-card selected" : "decision-card"}
              onClick={openSingFlow}
              disabled={uploading}
            >
              <span className="choice-icon"><Microphone size={27} /></span>
              <span><strong>Quiero cantarlo</strong><small>Grábalo aquí con micrófono y úsalo como audio de referencia</small></span>
              <span className="radio" />
            </button>

            <button
              className={audioChoiceMode === "none" ? "decision-card selected" : "decision-card"}
              onClick={() => {
                stopSingingCapture({ discardTake: true, preservePreview: false });
                setAudioChoiceMode('none');
                handlers?.removeSelectedAudio?.({ nextAudioSource: "none", nextAudioInputMode: "none" });
              }}
              disabled={uploading}
            >
              <span className="choice-icon"><MusicNote size={27} /></span>
              <span><strong>No tengo audio</strong><small>Escribiré o crearé la letra en el paso 2</small></span>
              <span className="radio" />
            </button>
          </div>

          {audioChoiceMode === "upload" ? (
            <>
              {data.audioSource === "upload" && uploadedAudioUrl ? (
                <CompactAudioPlayer src={uploadedAudioUrl} />
              ) : null}
              {data.audioSource === "upload" && uploadError ? (
                <div className="audio-upload-status error">{uploadError}</div>
              ) : data.audioSource === "upload" && uploadedAudioUrl ? (
                <div className="audio-upload-status success">Audio subido correctamente. Ya puedes escucharlo aquí y continuar.</div>
              ) : null}
              {hasSelectedAudio ? (
                <button
                  type="button"
                  className="record-action-button soft-danger"
                  onClick={() => {
                    try {
                      const input = uploadInputRef.current;
                      if (input) input.value = '';
                    } catch {}
                    handlers?.removeSelectedAudio?.({ nextAudioSource: "upload", nextAudioInputMode: "upload" });
                    setAudioChoiceMode('upload');
                    setData((current) => ({ ...current, audioInputMode: 'upload' }));
                  }}
                  disabled={uploading}
                  style={{ width: "100%" }}
                >
                  <Trash size={18} />
                  Eliminar audio
                </button>
              ) : null}
            </>
          ) : null}

          {audioChoiceMode === "record" ? (
            <div className="sing-studio-card" ref={singStudioRef}>
              <div className="sing-studio-header">
                <div>
                  <strong>Estudio rápido</strong>
                  <small>Grabaremos tu referencia y la enviaremos por el mismo flujo de “Subir mi audio”.</small>
                </div>
                <span className="sing-studio-pill">Micrófono</span>
              </div>

              {singCountdown.active ? (
                <div className="sing-countdown-panel">
                  <small>Prepárate...</small>
                  <div className="sing-countdown-number">{singCountdown.value}</div>
                  <p>La grabación comenzará automáticamente al terminar la cuenta regresiva.</p>
                </div>
              ) : null}

              {singRecording.recording ? (
                <div className="sing-live-panel">
                  <div className="sing-live-status">
                    <span className="sing-live-dot" />
                    <strong>Grabando...</strong>
                    <span>{formatTime(singRecording.seconds)}</span>
                  </div>
                  <VoiceMeter stream={singMeterStream} mode="indicator" />
                  <button className="record-action-button danger" onClick={() => stopSingingCapture({ discardTake: false, preservePreview: true })}>
                    <Pause size={18} />
                    Detener
                  </button>
                </div>
              ) : null}

              {!singCountdown.active && !singRecording.recording && singRecording.url ? (
                <div className="sing-preview-panel">
                  <audio
                    ref={recordedTakeAudioRef}
                    src={singRecording.url}
                    controls
                    className="sing-preview-player"
                    onPlay={() => setTakePlaying(true)}
                    onPause={() => setTakePlaying(false)}
                    onEnded={() => setTakePlaying(false)}
                  />
                  <div className="sing-preview-actions">
                    <button
                      className="record-action-button"
                      onClick={() => {
                        const audio = recordedTakeAudioRef.current;
                        if (!audio) return;
                        if (audio.paused) audio.play().catch(() => {});
                        else audio.pause();
                      }}
                    >
                      <Play size={18} />
                      {takePlaying ? 'Pausar escucha' : 'Escuchar'}
                    </button>
                    <button className="record-action-button secondary" onClick={openSingFlow} disabled={uploading}>
                      <Waveform size={18} />
                      Empezar de nuevo
                    </button>
                    <button
                      className="record-action-button soft-danger"
                      onClick={() => stopSingingCapture({ discardTake: true, preservePreview: false })}
                      disabled={uploading}
                    >
                      <Trash size={18} />
                      Eliminar audio
                    </button>
                    <button
                      className="record-action-button primary"
                      onClick={async () => {
                        if (!recordedTake) return;
                        const ok = await chooseFile(recordedTake, { inputMode: 'record', autoAdvance: true });
                        if (ok) setToast('Grabación usada correctamente. Pasamos al siguiente paso.');
                      }}
                      disabled={uploading}
                    >
                      {uploading ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
                      {uploading ? 'Subiendo grabación...' : 'Usar esta grabación'}
                    </button>
                  </div>
                </div>
              ) : null}

              {!singCountdown.active && !singRecording.recording && !singRecording.url ? (
                <div className="sing-idle-panel">
                  <div className="sing-idle-copy">
                    <strong>Graba tu idea aquí</strong>
                    <small>Te pediremos permiso del micrófono, haremos una cuenta regresiva 3, 2, 1 y empezaremos a grabar automáticamente.</small>
                  </div>
                  <button className="record-action-button primary" onClick={openSingFlow} disabled={uploading}>
                    <Microphone size={18} />
                    Comenzar grabación
                  </button>
                </div>
              ) : null}

              {singRecording.error ? (
                <div className="audio-upload-status error">{singRecording.error}</div>
              ) : null}
            </div>
          ) : null}

          {needsAudioReupload ? (
            <div className="audio-upload-status error">Este borrador tenía un audio anterior. Vuelve a subirlo para continuar.</div>
          ) : null}
          <a className="converter-button" href={mp3ConverterUrl} target="_blank" rel="noopener noreferrer"><Waveform size={20} /> Convertir mi archivo a MP3 <ArrowRight size={18} /></a>
          <p className="external-note">Ayuda opcional: abre un convertidor gratuito externo</p>
        </div>
      </div>
      {clonePickerOpen ? (
        <div className="wizard-overlay" role="dialog" aria-modal="true" aria-label="Elegir personaje de voz">
          <div className="persona-modal">
            <div className="persona-modal-header">
              <div>
                <small>CLONAR VOZ</small>
                <h2>Elige tu personaje</h2>
              </div>
              <button type="button" className="wizard-close" aria-label="Cerrar" onClick={() => closeClonePicker({ keepSelection: false })}>
                <X size={22} />
              </button>
            </div>

            <div className="persona-modal-options">
              <div className="persona-option is-active">
                <strong>Opción A</strong>
                <span>Usar un personaje de voz guardado</span>
                <small>Selecciona uno de tus personajes existentes.</small>
              </div>
              <button type="button" className="persona-option action" onClick={goCreatePersona}>
                <strong>Opción B</strong>
                <span>Crear personaje de voz nuevo</span>
                <small>Te llevaremos al Clonador de voz.</small>
              </button>
            </div>

            <div className="persona-modal-body">
              {personasLoading ? (
                <div className="persona-state">
                  <Loader2 size={20} className="animate-spin" />
                  <span>Cargando tus personajes…</span>
                </div>
              ) : personasError ? (
                <div className="persona-state error">
                  <Info size={18} />
                  <span>{personasError}</span>
                </div>
              ) : personas.length === 0 ? (
                <div className="persona-empty">
                  <div className="persona-empty-title">Aún no tienes personajes de voz creados.</div>
                  <button type="button" className="wizard-next" onClick={goCreatePersona}>
                    <Users size={18} />
                    Crear mi primer personaje
                  </button>
                </div>
              ) : (
                <div className="persona-grid">
                  {personas.map((p) => (
                    <div key={p.voiceId} className={data.voiceProfile?.voiceId === p.voiceId ? "persona-card is-selected" : "persona-card"}>
                      <button
                        type="button"
                        className="persona-card-select"
                        onClick={() => {
                          updateSelectedPersona({
                            voiceId: p.voiceId,
                            name: p.name,
                            profileImageUrl: p.profileImageUrl,
                            description: p.description,
                            singerSkillLevel: p.singerSkillLevel,
                          });
                          closeClonePicker({ keepSelection: true });
                          setToast("Personaje seleccionado para la canción.");
                        }}
                      >
                        <span className="persona-avatar">
                          {p.profileImageUrl ? <img src={p.profileImageUrl} alt="" /> : <Users size={18} />}
                        </span>
                        <span className="persona-card-text">
                          <strong>{p.name}</strong>
                          <small>{p.singerSkillLevel || p.description || `ID: ${p.voiceId.slice(0, 8)}`}</small>
                        </span>
                      </button>
                      <button
                        type="button"
                        className="persona-card-menu-trigger"
                        aria-label={`Opciones de ${p.name}`}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setPersonaMenuOpen((current) => (current === p.voiceId ? '' : p.voiceId));
                        }}
                      >
                        <MoreHorizontal size={18} />
                      </button>
                      {personaMenuOpen === p.voiceId ? (
                        <div className="persona-card-menu">
                          <button type="button" onClick={() => openRenamePersona(p)}>
                            <PencilSimple size={16} />
                            Editar nombre
                          </button>
                          <button type="button" className="danger" onClick={() => openDeletePersona(p)}>
                            <Trash size={16} />
                            Eliminar personaje
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          {editingPersona ? (
            <div className="persona-dialog-backdrop" role="dialog" aria-modal="true" aria-label="Editar nombre del personaje">
              <div className="persona-dialog">
                <h3>Editar nombre</h3>
                <p>Cambia el nombre visible de este personaje. Su voiceId no cambia.</p>
                <label>
                  Nombre actual
                  <input value={editingName} onChange={(e) => setEditingName(e.target.value)} placeholder="Nombre del personaje" maxLength={160} />
                </label>
                <div className="persona-dialog-actions">
                  <button type="button" className="wizard-back" disabled={personaActionLoading} onClick={() => setEditingPersona(null)}>Cancelar</button>
                  <button type="button" className="wizard-next" disabled={personaActionLoading || !editingName.trim()} onClick={savePersonaRename}>
                    {personaActionLoading ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} weight="bold" />}
                    Guardar
                  </button>
                </div>
              </div>
            </div>
          ) : null}
          {deletingPersona ? (
            <div className="persona-dialog-backdrop" role="dialog" aria-modal="true" aria-label="Eliminar personaje">
              <div className="persona-dialog">
                <h3>¿Eliminar este personaje?</h3>
                <p>Esta acción no se puede deshacer.</p>
                <div className="persona-delete-name">{deletingPersona.name}</div>
                <div className="persona-dialog-actions">
                  <button type="button" className="wizard-back" disabled={personaActionLoading} onClick={() => setDeletingPersona(null)}>Cancelar</button>
                  <button type="button" className="wizard-next danger" disabled={personaActionLoading} onClick={deletePersona}>
                    {personaActionLoading ? <Loader2 size={18} className="animate-spin" /> : <Trash size={18} />}
                    Eliminar
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
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
  const switchToManual = () => {
    if (data.aiLyricsGenerated || data.lyrics.trim()) {
      setData({
        ...data,
        lyricsMode: "manual",
        aiLyricsGenerated: false,
        lyrics: "",
      });
      setToast("Letra anterior descartada. Escribe tu letra manual.");
    } else {
      setData({ ...data, lyricsMode: "manual" });
    }
  };
  const discardGeneratedLyrics = () => {
    setData({
      ...data,
      lyricsMode: "manual",
      aiLyricsGenerated: false,
      lyrics: "",
    });
    setToast("Letra de IA descartada. Ahora escribe la tuya en el cajón de arriba (Tengo mi letra).");
  };
  const switchToAI = () => {
    let next = { ...data, lyricsMode: "ai" };
    if (!data.aiLyricsGenerated && data.lyrics.trim()) {
      next.lyrics = "";
      setToast("Letra manual descartada. Ahora describe la instrucción para que la IA la escriba.");
    }
    if (!next.lyricInstruction) next.lyricInstruction = aiExample;
    setData(next);
  };
  return (
    <section className="single-column">
      <div className="section-title"><span className="eyebrow">PASO 2 DE 4</span><h1>{data.audioSource === "upload" ? "Revisa la letra de tu audio" : "Escribe o crea tu letra"}</h1><p>{data.audioSource === "upload" ? "La letra detectada aparece aquí para que puedas corregirla antes de continuar." : "Pega tu letra completa. La usaremos tal como está para crear la canción."}</p></div>
      <div className="segmented">
        <button className={!usingAI ? "selected" : ""} onClick={switchToManual}>Tengo mi letra</button>
        <button className={usingAI ? "selected" : ""} onClick={switchToAI}><MagicWand size={18} /> Crear con IA</button>
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
          {Boolean(audioLyricsStatus) && /no pudimos transcribir este audio/i.test(String(audioLyricsStatus || '')) && !isTranscribingAudioLyrics ? (
            <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" onClick={() => transcribeLyricsFromAudio().catch(() => {})} style={{ padding: '8px 12px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.06)', color: '#fff', fontWeight: 800 }}>
                Reintentar
              </button>
              <button type="button" onClick={() => { setAudioLyricsStatus(''); setToast('Pega la letra manualmente en el campo de abajo.'); }} style={{ padding: '8px 12px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.06)', color: '#fff', fontWeight: 800 }}>
                Escribir letra
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
      {usingAI ? <>
        <div className="ai-label-row"><label className="field-label">Instrucción para crear la letra <InfoTip title="¿Qué debo escribir?">Explica de qué tratará la canción, para quién es, qué historia debe contar y qué emoción quieres transmitir.</InfoTip></label><button className="example-button" onClick={() => setData({ ...data, lyricInstruction: aiExample })}><MagicWand size={16} /> Poner ejemplo</button></div>
        <textarea className="lyrics-box ai-instruction-box" value={data.lyricInstruction} onChange={(e) => setData({ ...data, lyricInstruction: e.target.value })} placeholder="Ejemplo: Escribe una canción para una persona especial y cuenta la historia que quiero transmitir..." disabled={aiLoading} />
        <div className="field-footer"><span>Describe todos los detalles que quieras incluir</span><span>{data.lyricInstruction.length}/1,000</span></div>
        <div className="ai-explanation"><Info size={19} /><span>Con esta instrucción, la IA escribirá una letra completa que después podrás revisar y editar.</span></div>
        <div className="ai-actions-row">
          <button className="generate-lyrics-button" disabled={!data.lyricInstruction.trim() || aiLoading} onClick={doGenerateAI}>
            {aiLoading ? <Loader2 size={20} className="animate-spin" /> : <MagicWand size={20} weight="fill" />}
            <span style={{ marginLeft: 8 }}>
              {aiLoading ? "Escribiendo la letra…" : data.aiLyricsGenerated ? "Volver a generar la letra" : "Generar letra con IA"}
            </span>
          </button>
          {data.aiLyricsGenerated && (
            <button className="discard-lyrics-button" onClick={discardGeneratedLyrics} disabled={aiLoading}>
              <X size={18} />
              <span style={{ marginLeft: 8 }}>Cancelar y descartar letra</span>
            </button>
          )}
        </div>
        {data.aiLyricsGenerated && <div className="generated-lyrics"><div className="generated-heading"><span><Check size={18} weight="bold" /> Letra generada</span><small>Resultado editable · Si no te gusta, pulsa Cancelar arriba</small></div><textarea className="lyrics-box" value={data.lyrics} onChange={(e) => setData({ ...data, lyrics: e.target.value })} /><div className="field-footer"><span>Puedes cambiar cualquier parte de la letra</span><span>{data.lyrics.length}/5,000</span></div></div>}
      </> : <>
        <label className="field-label">Letra de la canción <InfoTip title="Cómo escribir la letra">Puedes usar secciones como [Verso], [Coro] y [Puente]. Si antes generaste una letra con IA, ya fue descartada para que escribas la tuya limpia.</InfoTip></label>
        <textarea className="lyrics-box" value={data.lyrics} onChange={(e) => setData({ ...data, lyrics: e.target.value })} placeholder="Escribe o pega aquí la letra de tu canción..." />
        <div className="field-footer"><span>Admite hasta 5,000 caracteres</span><span>{data.lyrics.length}/5,000</span></div>
      </>}
    </section>
  );
}

function StyleStep({ data, setData, creativity, setCreativity, instruction, setInstruction, audioWeight, setAudioWeight, setToast, handlers }) {
  const [modelOpen, setModelOpen] = useState(false);
  const isMobileLayout = useMediaQuery('(max-width: 700px)');
  const [precisionOpen, setPrecisionOpen] = useState(() => !isMobileLayout);
  useEffect(() => { setPrecisionOpen(!isMobileLayout); }, [isMobileLayout]);
  const improving = Boolean(handlers?.isBoostingStyle);
  const translating = Boolean(handlers?.isTranslatingStyle);
  const showAudioInfluence = data.audioSource === 'upload' && (Boolean(data.file) || Boolean(handlers?.audioUploadUrl) || Boolean(handlers?.isUploadingAudio) || Boolean(handlers?.audioUploadError));
  const needsAudioReupload =
    Boolean(handlers?.audioReuploadNeeded) &&
    data.audioSource === 'upload' &&
    !showAudioInfluence;
  const openPrecisionHelp = () => {
    const text =
      "Rareza\n" +
      "Controla qué tan tradicional o creativa puede ser la canción.\n\n" +
      "- Un porcentaje bajo produce resultados más seguros, predecibles y convencionales.\n" +
      "- Un porcentaje alto permite combinaciones más originales, inesperadas o experimentales.\n" +
      "- Se recomienda comenzar en 50%.\n" +
      "- Bájalo si la canción sale desordenada, extraña o se aleja demasiado de lo solicitado.\n" +
      "- Súbelo si las canciones se sienten demasiado parecidas, simples o predecibles.\n\n" +
      "Influencia del estilo\n" +
      "Controla qué tanto debe respetarse la descripción escrita en el campo de estilo musical.\n\n" +
      "- Un porcentaje bajo da mayor libertad para interpretar el estilo.\n" +
      "- Un porcentaje alto intenta seguir con más fuerza los géneros, instrumentos, ritmo y ambiente solicitados.\n" +
      "- Se recomienda comenzar en 50%.\n" +
      "- Bájalo si el resultado se siente rígido o poco natural.\n" +
      "- Súbelo si no está respetando suficientemente el género, los instrumentos o el ambiente solicitado.\n\n" +
      "Influencia del audio\n" +
      "Solo aparece cuando se utiliza un audio de referencia. Controla cuánto debe conservarse de su melodía, ritmo, estructura o interpretación.\n\n" +
      "- Un porcentaje bajo permite crear una versión más diferente.\n" +
      "- Un porcentaje alto intenta conservar más características del audio original.\n" +
      "- Se recomienda comenzar en 25%.\n" +
      "- Bájalo si el resultado se parece demasiado al audio original.\n" +
      "- Súbelo si se está perdiendo la melodía, el ritmo o la esencia de la referencia.\n" +
      "- Los valores altos pueden limitar la libertad creativa, por lo que conviene aumentarlo gradualmente.";
    if (handlers?.onShowAlert) {
      handlers.onShowAlert({ title: 'Ajustes de precisión', message: text, tone: 'info' });
      return;
    }
    setToast(text);
  };
  const currentStyleLanguage = detectPromptLanguage(data.style);
  const translateLabel = currentStyleLanguage === 'en' ? 'Traducir al español' : 'Traducir al inglés';
  const updateStyle = (value) => setData({ ...data, style: value, styleTranslated: false });
  const precisionControlsId = 'precision-controls';
  return (
    <section className="two-columns">
      <div>
        <div className="section-title"><span className="eyebrow">PASO 3 DE 4</span><h1>Define el estilo de tu canción</h1><p>Elige el motor y describe cómo quieres que suene.</p></div>
        <label className="field-label">Motor y versión <InfoTip title="Motor y versión">Cada versión ofrece una forma distinta de interpretar tu canción.</InfoTip></label>
        <div className="select-wrap">
          <button className="select-button" onClick={() => setModelOpen(!modelOpen)}><span>{normalizeModelName(data.model)}</span><SlidersHorizontal size={20} /></button>
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
      <div className={isMobileLayout ? "settings-panel precision-collapsible" : "settings-panel"}>
        {isMobileLayout ? (
          <>
            <button
              type="button"
              className="precision-toggle"
              aria-expanded={precisionOpen}
              aria-controls={precisionControlsId}
              onClick={() => setPrecisionOpen((v) => !v)}
            >
              <span className="precision-toggle-text">Ajustes de precisión</span>
              <span className={precisionOpen ? "precision-toggle-icon open" : "precision-toggle-icon"} aria-hidden="true">▾</span>
            </button>
            <div id={precisionControlsId} className="precision-collapsible-body" hidden={!precisionOpen}>
              <div className="precision-help-row">
                <span className="precision-help-title">Ajustes de precisión</span>
                <button className="icon-button info-button" type="button" aria-label="Ayuda: Ajustes de precisión" onClick={openPrecisionHelp}>
                  <Info size={19} weight="bold" />
                </button>
              </div>
              <p className="panel-intro">Puedes moverlos o dejarlos como están.</p>
              <RangeSetting label="Rareza" help="Qué tan tradicional o creativa puede ser la canción" value={creativity} onChange={setCreativity} scrollGuard />
              <RangeSetting label="Influencia del estilo" help="Qué tanto respetará la descripción del estilo musical" value={instruction} onChange={setInstruction} scrollGuard />
              {showAudioInfluence ? (
                <RangeSetting label="Influencia del audio" help="Qué tanto conservará la melodía y ritmo del audio de referencia" value={audioWeight} onChange={setAudioWeight} scrollGuard />
              ) : null}
            </div>
          </>
        ) : (
          <>
            <div className="settings-panel-title">
              <h2>Ajustes de precisión</h2>
              <button className="icon-button info-button" type="button" aria-label="Ayuda: Ajustes de precisión" onClick={openPrecisionHelp}>
                <Info size={19} weight="bold" />
              </button>
            </div>
            <p className="panel-intro">Puedes moverlos o dejarlos como están.</p>
            <RangeSetting label="Rareza" help="Qué tan tradicional o creativa puede ser la canción" value={creativity} onChange={setCreativity} />
            <RangeSetting label="Influencia del estilo" help="Qué tanto respetará la descripción del estilo musical" value={instruction} onChange={setInstruction} />
            {showAudioInfluence ? (
              <RangeSetting label="Influencia del audio" help="Qué tanto conservará la melodía y ritmo del audio de referencia" value={audioWeight} onChange={setAudioWeight} />
            ) : null}
          </>
        )}
      </div>
      {needsAudioReupload ? (
        <div className="audio-lyrics-notice info" style={{ marginTop: 16 }}>
          <Info size={18} />
          <div>
            <div style={{ fontWeight: 900 }}>Vuelve a subir tu audio para continuar</div>
            <div style={{ marginTop: 2 }}>Guardamos tu letra y tus ajustes, pero por seguridad no conservamos el audio al restaurar un borrador.</div>
          </div>
        </div>
      ) : null}
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
          <button className={data.voice === "standard" ? "voice-choice selected" : "voice-choice"} onClick={() => setData({ ...data, voice: "standard", model: (data.model === "Suno V6" || data.model === "Suno V6 Wild" || data.model === "Suno V6 Mini") ? data.model : "Suno V6" })}><span className="choice-icon"><Microphone size={28} /></span><span><strong>Voz estándar</strong><small>Elige una voz de alta calidad generada por IA.</small></span><span className="radio" /></button>
          <button className={data.voice === "clone" ? "voice-choice selected" : "voice-choice"} onClick={() => setData({ ...data, voice: "clone", model: "Suno V6" })}><span className="choice-icon"><Users size={28} /></span><span><strong>Clonar voz <em>Suno V6</em></strong><small>Usa una voz clonada para tu canción.</small></span><span className="radio" /></button>
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
        <div className="engine-summary"><span>Motor seleccionado</span><strong>{data.voice === "clone" ? "Suno V6 · Clonar voz" : normalizeModelName(data.model)}</strong></div>
      </div>
    </section>
  );
}

function RangeSummary({ label, value, help }) {
  const notRecommended = value >= 87;
  return <div className={notRecommended ? "range-setting read-only warning-range" : "range-setting read-only"}><div className="range-heading"><div><span className="range-label">{label}</span><InfoTip title={label}>{help}</InfoTip><p>{help}</p></div><output><span>{value}%</span>{notRecommended && <small>No recomendable</small>}</output></div><div className="progress"><span style={{ width: `${value}%` }} /></div></div>;
}

function ReviewStep({ data, setData, creativity, instruction, audioWeight, setToast, handlers }) {
  const lyricsOk = data.lyricsMode === "ai"
    ? Boolean(data.aiLyricsGenerated && data.lyrics.trim())
    : Boolean(data.lyrics.trim());
  const requirements = [
    ["Título de la canción", Boolean(data.title.trim())],
    ["Letra completa", lyricsOk],
    ["Instrucción o estilo musical", Boolean(data.style.trim())],
    ["Voz seleccionada", Boolean(data.voice)],
    ["Voz de hombre o de mujer", Boolean(data.vocalGender)],
    ["Audio MP3 de referencia", data.audioSource !== "upload" || Boolean(handlers?.hasUploadedAudio)],
    ["Perfil de voz clonado", data.voice !== "clone" || Boolean(data.voiceProfile)],
  ];
  const isReady = requirements.every(([, complete]) => complete);
  const submitting = Boolean(handlers?.isSubmitting);
  const usingAI = data.lyricsMode === "ai";
  const lyricsLabel = usingAI
    ? (lyricsOk ? "Letra generada por IA" : "Sin letra generada todavía")
    : (lyricsOk ? "Letra lista" : "Sin letra todavía");
  const lyricsSub = usingAI
    ? (lyricsOk ? `${data.lyrics.length} caracteres · Puedes editarla en el Paso 2` : "Vuelve al Paso 2 y pulsa 'Generar letra con IA'")
    : (lyricsOk ? `${data.lyrics.length} caracteres` : "Vuelve al Paso 2 para escribirla");
  return (
    <section className="review-wrap">
      <div className="section-title"><span className="eyebrow">PASO 4 DE 4</span><h1>Revisa tu canción</h1><p>Comprueba toda la información antes de enviarla a generar.</p></div>
      <div className="review-grid">
        <div className="review-card"><span>Nombre de la canción</span><strong>{data.title || "Sin nombre todavía"}</strong><small>{data.title ? "Nombre listo para generar" : "Vuelve al paso 3 para escribirlo"}</small></div>
        <div className="review-card"><span>Letra · {usingAI ? "Modo IA" : "Modo manual"}</span><strong>{lyricsLabel}</strong><small>{lyricsSub}</small></div>
        <div className="review-card"><span>Motor</span><strong>{data.voice === "clone" ? "Suno V6" : normalizeModelName(data.model)}</strong><small>{data.voice === "clone" ? "Clonar voz" : "Modelo seleccionado"}</small></div>
        <div className="review-card"><span>Voz y audio</span><strong>{data.voice === "clone" ? "Clonar voz" : data.voice === "upload" ? "Audio propio" : "Voz estándar"}</strong><small>{data.file?.name || "Sin archivo cargado"}</small></div>
        <div className="review-card"><span>Tipo de voz</span><strong>{data.vocalGender === "m" ? "Voz de hombre" : data.vocalGender === "f" ? "Voz de mujer" : "Sin seleccionar"}</strong><small>{data.vocalGender ? "Selección guardada" : "Vuelve al paso 3 para elegirla"}</small></div>
        <div className="review-card"><span>Ajustes</span><strong>{creativity}% rareza</strong><small>{instruction}% estilo{data.audioSource === 'upload' && Boolean(handlers?.hasUploadedAudio) ? ` · ${audioWeight}% audio` : ''}</small></div>
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

function CompletedSongsView({ title, songs, isLoading, error, onRetry, onGoLibrary, onCreateAnother }) {
  return (
    <section className="generation-stage ready">
      <div className="generation-hero">
        <div className="generation-hero-icon"><Check size={28} /></div>
        <h1>Tus 2 canciones ya están listas</h1>
        <p className="generation-hero-subtitle">Ya puedes escucharlas aquí mismo.</p>
        <p className="generation-hero-copy">{title ? `Canción: ${title}` : 'Listo. Puedes reproducirlas ahora.'}</p>
      </div>

      <div className="generation-cards">
        {isLoading ? (
          <div className="glass-card rounded-3xl p-6 border border-white/10 bg-white/[0.03] text-slate-200">
            <div className="flex items-center gap-3">
              <Loader2 size={22} className="animate-spin" />
              <div>
                <div className="font-extrabold">Cargando tus audios…</div>
                <div className="text-xs text-slate-400">Ya se guardaron en “Mis Canciones”. Estamos trayéndolos para reproducirlos aquí.</div>
              </div>
            </div>
          </div>
        ) : error ? (
          <div className="glass-card rounded-3xl p-6 border border-white/10 bg-white/[0.03] text-slate-200">
            <div className="flex items-start gap-3">
              <AlertCircle size={22} className="text-amber-200 shrink-0" />
              <div className="min-w-0">
                <div className="font-extrabold">Tus canciones ya terminaron, pero no pude cargarlas aquí</div>
                <div className="text-xs text-slate-400 break-words">{error}</div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" className="generation-secondary-button" onClick={() => onRetry?.()}>
                    Reintentar aquí
                  </button>
                  <button type="button" className="generation-secondary-button" onClick={() => onGoLibrary?.()}>
                    Ver en Mis canciones
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          (Array.isArray(songs) ? songs : []).map((song, idx) => (
            <article key={song?.id || idx} className={`generation-card ${idx === 0 ? 'purple' : 'cyan'} done`}>
              <div className="generation-card-main">
                <div className="generation-cover">
                  <div className="generation-cover-glow" />
                  <MusicNote size={46} />
                </div>
                <div className="generation-copy">
                  <div className="generation-title-row">
                    <div className="min-w-0">
                      <h2 className="truncate">{String(song?.title || `Canción ${idx + 1}`)}</h2>
                      <p>{idx === 0 ? 'Canción 1' : 'Canción 2'}</p>
                    </div>
                    <span className={`generation-state-pill ${idx === 0 ? 'purple' : 'cyan'}`}>Lista</span>
                  </div>
                  {song?.audioUrl ? <CompactAudioPlayer src={String(song.audioUrl)} /> : null}
                </div>
              </div>
              <div className="generation-card-side">
                <div className={`generation-ring ${idx === 0 ? 'purple' : 'cyan'} done`}>
                  <div className="generation-ring-inner">
                    <Check size={24} />
                  </div>
                </div>
                <ul className="generation-status-list">
                  {getStageItems('ready').map((item) => (
                    <li key={`${song?.id || idx}-${item.key}`} className={item.key === 'ready' ? 'active' : 'complete'}>
                      <span className="dot" />
                      <span>{item.label}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </article>
          ))
        )}
      </div>

      {!isLoading && !error && Array.isArray(songs) && songs.length > 0 ? (
        <div className="audio-lyrics-notice info" style={{ marginTop: 16 }}>
          <Info size={18} />
          <div>
            <div style={{ fontWeight: 900 }}>Tus canciones se guardarán durante 14 días en ‘Mis Canciones’.</div>
          </div>
        </div>
      ) : null}

      <div className="generation-footer-banner">
        <div>
          <strong>¿Qué quieres hacer ahora?</strong>
          <span>Puedes escucharlas aquí o verlas en “Mis Canciones”.</span>
        </div>
        <div className="generation-footer-actions">
          <button type="button" className="generation-link-button" onClick={() => onGoLibrary?.()}>
            Ver en Mis canciones
            <ArrowRight size={18} />
          </button>
          <button type="button" className="generation-secondary-button" onClick={() => onRetry?.()}>
            Reintentar cargar aquí
          </button>
          <button type="button" className="generation-secondary-button" onClick={() => onCreateAnother?.()}>
            Crear otra canción
          </button>
        </div>
      </div>
    </section>
  );
}

function GeneratingSongsView({ session, pendingItem, onGoLibrary, onToggleNotify, onClearSession }) {
  const stage = getGenerationStage(session, pendingItem);
  const readyCount = Number(session?.readyTrackCount || 0);
  const notificationsEnabled = Boolean(session?.notifyWhenReady);
  const notificationPermission = typeof Notification !== 'undefined' ? Notification.permission : 'default';
  const heroTitle =
    stage === 'failed'
      ? 'No se pudo completar la generación'
      : stage === 'ready'
        ? 'Tus 2 canciones ya están listas'
        : '¡Se están generando tus 2 canciones!';
  const heroSubtitle =
    stage === 'failed'
      ? 'Ocurrió un error mientras LucIAna generaba tu canción.'
      : stage === 'ready'
        ? 'Ya puedes escucharlas en tu Biblioteca.'
        : 'Esto puede tardar unos minutos.';
  const heroMessage =
    stage === 'failed'
      ? (session?.error || 'Intenta de nuevo o cambia un poco el audio / instrucción y vuelve a generar.')
      : stage === 'ready'
        ? 'Puedes abrir tu Biblioteca ahora mismo para escucharlas.'
        : 'Puedes seguir usando LucIAna. Te avisaremos cuando estén listas.';
  const providerPct = getProviderPct(pendingItem, session);
  const cards = [
    { key: 'song-1', title: 'Canción 1', subtitle: 'Versión original', accent: 'purple' },
    { key: 'song-2', title: 'Canción 2', subtitle: 'Segunda versión', accent: 'cyan' },
  ];

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
          const cardStage = readyCount >= index + 1 ? 'ready' : stage;
          const done = cardStage === 'ready';
          const stageItems = getStageItems(cardStage);
          const suffix = providerPct != null && cardStage !== 'ready' ? ` · ${Math.round(providerPct)}%` : '';
          const pillLabel =
            cardStage === 'failed'
              ? 'Error'
              : cardStage === 'ready'
                ? 'Lista'
                : `${stageItems.find((x) => x.state === 'active')?.label || 'En generación'}${suffix}`;
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
                    <span className={`generation-state-pill ${card.accent}`}>{pillLabel}</span>
                  </div>
                  <div className={`generation-wave ${card.accent}`} aria-hidden="true">
                    {Array.from({ length: 26 }).map((_, bar) => (
                      <span key={`${card.key}-${bar}`} style={{ animationDelay: `${bar * 0.08}s`, height: `${12 + ((bar * 11) % 24)}px` }} />
                    ))}
                  </div>
                  <div className="generation-card-note">
                    {stage === 'failed'
                      ? 'Ocurrió un error. No se hará redirección automática.'
                      : done
                        ? 'Audio real disponible en tu Biblioteca.'
                        : 'LucIAna sigue consultando el estado real de la generación.'}
                  </div>
                </div>
              </div>
              <div className="generation-card-side">
                <div className={`generation-ring ${card.accent} ${done ? 'done' : 'indeterminate'}`}>
                  <div className="generation-ring-inner">
                    <div style={{ display: 'grid', placeItems: 'center', gap: 10 }}>
                      {cardStage === 'failed' ? <X size={22} /> : done ? <Check size={24} /> : <Loader2 size={24} className="animate-spin" />}
                      {providerPct != null && cardStage !== 'ready' ? <div style={{ fontSize: 18, fontWeight: 900 }}>{Math.round(providerPct)}%</div> : null}
                    </div>
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
          <button type="button" className="generation-secondary-button" onClick={() => onClearSession?.()}>
            Seguir creando
          </button>
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
.audio-choice-switcher{display:grid;gap:14px}
.sing-studio-card{margin-top:14px;padding:18px;border-radius:24px;border:1px solid rgba(168,107,255,.2);background:radial-gradient(circle at top,rgba(113,51,189,.18),transparent 38%),linear-gradient(180deg,rgba(8,15,28,.98),rgba(10,18,33,.92));box-shadow:0 18px 42px rgba(0,0,0,.24);display:grid;gap:16px}
.sing-studio-header{display:flex;align-items:flex-start;justify-content:space-between;gap:14px}
.sing-studio-header strong,.sing-idle-copy strong{display:block;font-size:18px;color:#fff}
.sing-studio-header small,.sing-idle-copy small{display:block;margin-top:6px;font-size:13px;line-height:1.55;color:#bfc9da}
.sing-studio-pill{display:inline-flex;align-items:center;justify-content:center;padding:7px 12px;border-radius:999px;border:1px solid rgba(190,151,255,.24);background:rgba(122,60,224,.18);font-size:12px;font-weight:800;color:#ead7ff;white-space:nowrap}
.sing-countdown-panel,.sing-live-panel,.sing-preview-panel,.sing-idle-panel{padding:16px;border-radius:20px;border:1px solid rgba(255,255,255,.08);background:rgba(8,14,26,.72)}
.sing-countdown-panel{text-align:center;display:grid;gap:8px;justify-items:center}
.sing-countdown-panel small{font-size:15px;font-weight:700;letter-spacing:.04em;color:#d6c3ff}
.sing-countdown-panel p{margin:0;max-width:420px;font-size:13px;line-height:1.5;color:#aeb8ca}
.sing-countdown-number{width:108px;height:108px;border-radius:999px;display:grid;place-items:center;font-size:48px;font-weight:900;color:#fff;background:radial-gradient(circle,rgba(184,100,240,.42),rgba(91,45,155,.12));box-shadow:0 0 0 1px rgba(186,123,255,.18),0 0 40px rgba(164,94,234,.28);animation:singCountdownPulse 1s ease-in-out infinite}
.sing-live-panel{display:grid;gap:14px}
.sing-live-status{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;font-size:14px;color:#f5f7fb}
.sing-live-status strong{font-size:16px}
.sing-live-dot{width:10px;height:10px;border-radius:999px;background:#ff5d73;box-shadow:0 0 0 0 rgba(255,93,115,.55);animation:singPulse 1.2s ease-in-out infinite}
.sing-preview-panel{display:grid;gap:14px}
.sing-preview-player{width:100%;border-radius:16px;accent-color:#a855f7;background:#0b1220}
.sing-preview-actions{display:flex;flex-wrap:wrap;gap:10px}
.sing-idle-panel{display:flex;align-items:center;justify-content:space-between;gap:16px}
.record-action-button{min-height:46px;padding:0 16px;border-radius:999px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04);color:#edf2ff;font-weight:800;display:inline-flex;align-items:center;justify-content:center;gap:8px;cursor:pointer;transition:transform .18s ease,border-color .18s ease,background .18s ease}
.record-action-button:hover{transform:translateY(-1px);border-color:rgba(184,100,240,.34);background:rgba(184,100,240,.12)}
.record-action-button:disabled{opacity:.6;cursor:not-allowed;transform:none}
.record-action-button.primary{background:linear-gradient(90deg,rgba(124,58,237,.98),rgba(184,100,240,.96));border-color:rgba(206,170,255,.24);color:#fff}
.record-action-button.secondary{background:rgba(20,31,49,.88)}
.record-action-button.soft-danger{background:rgba(255,93,115,.12);border-color:rgba(255,110,147,.18);color:#ffd9e2;font-weight:700}
.record-action-button.soft-danger:hover{border-color:rgba(255,110,147,.34);background:rgba(255,93,115,.18)}
.record-action-button.danger{background:rgba(112,31,56,.24);border-color:rgba(255,110,147,.22);color:#ffd9e2}
.audio-lyrics-notice{margin:16px 0 6px;padding:12px 14px;border-radius:16px;border:1px solid rgba(255,255,255,.08);background:rgba(11,20,31,.76);display:flex;align-items:flex-start;gap:10px;font-size:14px;line-height:1.55;color:#d8e2f0}
.audio-lyrics-notice.info{border-color:rgba(33,201,167,.18);color:#bfeee5}
.audio-lyrics-notice.success{border-color:rgba(135,100,240,.24);background:rgba(56,28,110,.16);color:#ebdefe}
.audio-lyrics-notice.warning{border-color:rgba(255,189,105,.18);color:#ffe4b8}
@keyframes singPulse{0%{box-shadow:0 0 0 0 rgba(255,93,115,.55)}70%{box-shadow:0 0 0 10px rgba(255,93,115,0)}100%{box-shadow:0 0 0 0 rgba(255,93,115,0)}}
@keyframes singCountdownPulse{0%,100%{transform:scale(.94)}50%{transform:scale(1)}}
@keyframes generationWave{0%,100%{transform:scaleY(.45);opacity:.45}50%{transform:scaleY(1);opacity:1}}
@keyframes generationSpin{to{transform:rotate(360deg)}}
@media(max-width:980px){.generation-hero h1{font-size:42px}.generation-title-row h2{font-size:28px}.generation-title-row p{font-size:16px}.generation-card-side{grid-template-columns:auto minmax(150px,1fr)}.generation-ring{width:112px;height:112px}.generation-footer-banner{flex-direction:column;align-items:flex-start}.generation-footer-actions{width:100%;flex-wrap:wrap}}
@media(max-width:700px){.generation-stage{padding:18px 0 0;gap:14px}.generation-hero{padding:26px 18px 22px;border-radius:24px}.generation-hero::before,.generation-hero::after{display:none}.generation-hero h1{font-size:30px}.generation-hero-subtitle{font-size:17px}.generation-hero-copy{font-size:14px}.generation-ai-banner{margin-top:18px;padding:14px 14px;border-radius:16px}.generation-cards{gap:14px}.generation-card{grid-template-columns:1fr;gap:16px;padding:16px;border-radius:22px}.generation-card-main{align-items:flex-start}.generation-cover{width:82px;height:82px;border-radius:18px}.generation-title-row{align-items:flex-start}.generation-title-row h2{font-size:20px}.generation-title-row p{font-size:13px;margin-top:4px}.generation-state-pill{font-size:11px;padding:6px 10px}.generation-wave{height:28px;gap:3px}.generation-wave span{width:3px}.generation-card-note{font-size:13px}.generation-card-side{grid-template-columns:1fr;justify-items:start;gap:12px}.generation-ring{width:108px;height:108px;justify-self:end;margin-top:-58px}.generation-status-list{gap:8px}.generation-status-list li{font-size:14px}.generation-bottom-grid{grid-template-columns:1fr;gap:12px}.generation-tip-card,.generation-notify-card{padding:16px;border-radius:20px}.generation-tip-copy strong{font-size:17px}.generation-tip-copy span{font-size:13px}.generation-footer-banner{padding:18px 16px;border-radius:22px}.generation-footer-banner strong{font-size:18px}.generation-footer-banner span{font-size:13px}.generation-footer-actions{width:100%;display:grid;grid-template-columns:1fr}.generation-link-button,.generation-secondary-button{width:100%}.audio-preview-player{padding:10px 12px}.audio-preview-row{font-size:11px}.audio-preview-row strong{font-size:12px}.sing-studio-card{padding:14px;border-radius:20px}.sing-studio-header,.sing-idle-panel{grid-template-columns:1fr;display:grid}.sing-countdown-number{width:90px;height:90px;font-size:40px}.sing-live-status{font-size:13px}.sing-preview-actions,.record-action-button{width:100%}}
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
    onGoCloneVoice,
    onOpenBalance,
    onShowAlert,
    authUserId,
    prefill,
    prefillNonce,
  } = props || {};

  const makeInitialData = () => ({
    lyrics: "",
    lyricsMode: "manual",
    lyricInstruction: "",
    aiLyricsGenerated: false,
    style: "",
    styleOriginal: "",
    styleTranslated: false,
    negative: "",
    model: "Suno V6",
    voice: "standard",
    vocalGender: "",
    voiceProfile: null,
    audioInputMode: "none",
    audioSource: "none",
    file: null,
    title: "",
  });

  const safeUserId = (authUserId || '').toString().trim();
  const draftKey = safeUserId ? `ramber.approved_create_draft_v1.uid_${safeUserId}` : '';
  const [step, setStep] = useState(0);
  const [creativity, setCreativity] = useState(50);
  const [instruction, setInstruction] = useState(50);
  const [audioWeight, setAudioWeight] = useState(25);
  const [toast, setToast] = useState("");
  const [data, setData] = useState(() => makeInitialData());
  const [audioUploadUrl, setAudioUploadUrl] = useState("");
  const [audioUploadPath, setAudioUploadPath] = useState("");
  const [isUploadingAudio, setIsUploadingAudio] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [audioReuploadNeeded, setAudioReuploadNeeded] = useState(false);
  const [isGeneratingLyrics, setIsGeneratingLyrics] = useState(false);
  const [isBoostingStyle, setIsBoostingStyle] = useState(false);
  const [isTranslatingStyle, setIsTranslatingStyle] = useState(false);
  const [isTranscribingAudioLyrics, setIsTranscribingAudioLyrics] = useState(false);
  const [audioLyricsStatus, setAudioLyricsStatus] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [creditsGate, setCreditsGate] = useState(null);
  const [hasPendingTask, setHasPendingTask] = useState(false);
  const [audioUploadError, setAudioUploadError] = useState("");
  const audioRequestVersionRef = useRef(0);
  const contentAreaRef = useRef(null);
  const previousStepRef = useRef(step);
  const previousUserIdRef = useRef(safeUserId);

  useEffect(() => { ensureAnonSession().catch(() => {}); }, []);
  useEffect(() => { clearGenerationSession(); }, []);

  useEffect(() => {
    if (previousUserIdRef.current === safeUserId) return;
    previousUserIdRef.current = safeUserId;
    audioRequestVersionRef.current += 1;
    setStep(0);
    setCreativity(50);
    setInstruction(50);
    setAudioWeight(25);
    setToast("");
    setData(makeInitialData());
    setAudioUploadUrl('');
    setAudioUploadPath('');
    setIsUploadingAudio(false);
    setUploadProgress(0);
    setAudioReuploadNeeded(false);
    setAudioUploadError('');
    setIsGeneratingLyrics(false);
    setIsBoostingStyle(false);
    setIsTranslatingStyle(false);
    setIsTranscribingAudioLyrics(false);
    setAudioLyricsStatus('');
    setIsSubmitting(false);
    setCreditsGate(null);
  }, [safeUserId]);

  useEffect(() => {
    if (!draftKey) return;
    try {
      const raw = window.localStorage.getItem(draftKey);
      const parsed = raw ? JSON.parse(raw) : null;
      if (!parsed || typeof parsed !== 'object') return;
      if (typeof parsed.step === 'number' && parsed.step >= 0 && parsed.step <= 3) setStep(parsed.step);
      if (typeof parsed.creativity === 'number') setCreativity(Math.max(0, Math.min(100, parsed.creativity)));
      if (typeof parsed.instruction === 'number') setInstruction(Math.max(0, Math.min(100, parsed.instruction)));
      if (typeof parsed.audioWeight === 'number') setAudioWeight(Math.max(0, Math.min(100, parsed.audioWeight)));
      if (parsed.data && typeof parsed.data === 'object') {
        const nextData = { ...parsed.data };
        if (!VALID_MODEL_NAMES.has(nextData?.model)) {
          nextData.model = "Suno V6";
        }
        const hadAudioRef = Boolean(parsed?.hadAudioReference);
        setAudioReuploadNeeded(Boolean(nextData?.audioSource === 'upload' && hadAudioRef));
        setData((prev) => ({ ...prev, ...nextData, file: null }));
      }
      setAudioUploadUrl('');
      setAudioUploadPath('');
      setUploadProgress(0);
    } catch {}
  }, [draftKey]);

  const resetForNewSong = () => {
    audioRequestVersionRef.current += 1;
    if (draftKey) {
      try { window.localStorage.removeItem(draftKey); } catch {}
    }
    setStep(0);
    setCreativity(50);
    setInstruction(50);
    setAudioWeight(25);
    setToast("");
    setData(makeInitialData());
    setAudioUploadUrl('');
    setAudioUploadPath('');
    setIsUploadingAudio(false);
    setUploadProgress(0);
    setAudioReuploadNeeded(false);
    setIsTranscribingAudioLyrics(false);
    setAudioLyricsStatus('');
    setAudioUploadError('');
    setIsGeneratingLyrics(false);
    setIsBoostingStyle(false);
    setIsTranslatingStyle(false);
    setIsSubmitting(false);
    setCreditsGate(null);
  };

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    if (!draftKey) return undefined;
    const id = window.setTimeout(() => {
      try {
        const safeData = { ...data, file: null };
        const hadAudioReference = Boolean(
          safeData.audioSource === 'upload' &&
            (Boolean(data.file) || Boolean(audioUploadUrl) || Boolean(isUploadingAudio) || Boolean(audioUploadError) || Number(uploadProgress || 0) > 0)
        );
        const payload = {
          step,
          creativity,
          instruction,
          audioWeight,
          data: safeData,
          hadAudioReference,
        };
        window.localStorage.setItem(draftKey, JSON.stringify(payload));
      } catch {}
    }, 350);
    return () => window.clearTimeout(id);
  }, [draftKey, step, creativity, instruction, audioWeight, data]);

  useEffect(() => {
    const previousStep = previousStepRef.current;
    previousStepRef.current = step;
    if (previousStep === step) return;
    if (contentAreaRef.current && typeof contentAreaRef.current.scrollTo === 'function') {
      contentAreaRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
    if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [step]);

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
    };
    tick();
    const id = window.setInterval(tick, 1500);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!prefillNonce) return;
    if (!prefill) return;
    if (prefill.type !== 'cover') return;
    resetForNewSong();
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
      audioInputMode: 'upload',
      audioSource: 'upload',
      title: (song?.title || 'Cover').toString().slice(0, 100),
      lyrics: typeof song?.lyrics === 'string' && song.lyrics.trim() ? song.lyrics : prev.lyrics,
      style: typeof song?.description === 'string' && song.description.trim() ? song.description : prev.style,
    }));
  }, [prefillNonce, prefill]);

  const removeSelectedAudio = (options) => {
    const nextAudioSource = typeof options?.nextAudioSource === 'string' ? options.nextAudioSource : 'upload';
    const nextAudioInputMode = typeof options?.nextAudioInputMode === 'string'
      ? options.nextAudioInputMode
      : (nextAudioSource === 'none' ? 'none' : 'upload');
    audioRequestVersionRef.current += 1;
    setAudioUploadUrl('');
    setAudioUploadPath('');
    setIsUploadingAudio(false);
    setUploadProgress(0);
    setAudioReuploadNeeded(false);
    setAudioUploadError('');
    setIsTranscribingAudioLyrics(false);
    setAudioLyricsStatus('');
    setData((prev) => ({
      ...prev,
      audioInputMode: nextAudioInputMode,
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
        return false;
      }
      if (requestVersion !== audioRequestVersionRef.current) return;
      setUploadProgress(40);
      const uploaded = await uploadAudioForVoice(t.token, file);
      if (requestVersion !== audioRequestVersionRef.current) return;
      setAudioUploadUrl((uploaded?.url || '').toString().trim());
      setAudioUploadPath((uploaded?.key || '').toString().trim());
      setUploadProgress(100);
      setAudioUploadError('');
      setAudioReuploadNeeded(false);
      setToast('Audio MP3 subido correctamente.');
      return true;
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
      return false;
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
    const translateText = async (text, fromLanguage, toLanguage) => {
      const rawText = (text || '').toString().trim();
      if (!rawText) return '';
      const from = (fromLanguage || '').toString().trim().toLowerCase();
      const to = (toLanguage || '').toString().trim().toLowerCase();
      if (!from || !to || from === to) return rawText;
      const response = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(rawText)}&langpair=${from}|${to}`);
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
        const translatedBack = await translateText(result, resultLanguage, sourceLanguage);
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
    if (!nextValue) {
      return true;
    }
    if (typeof Notification === 'undefined') {
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
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 60000);
      const r = await fetch('/api/ai/transcribe-lyrics', {
        method: 'POST',
        signal: controller.signal,
        headers: { 'content-type': 'application/json', authorization: `Bearer ${t.token}` },
        body: JSON.stringify({ uploadUrl: audioUploadUrl, mimeType }),
      }).finally(() => window.clearTimeout(timer));
      const out = await r.json().catch(() => ({}));
      if (requestVersion !== audioRequestVersionRef.current) return;
      if (!r.ok || out?.ok === false) {
        const msg = (out?.message || out?.error || 'No pudimos transcribir este audio. Intenta de nuevo o pega la letra manualmente.').toString();
        const id = (out?.error_id || '').toString();
        setAudioLyricsStatus([msg, id ? `(Error ${id})` : ''].filter(Boolean).join(' '));
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
    } catch (e) {
      if (requestVersion !== audioRequestVersionRef.current) return;
      const msg = e instanceof Error ? e.message : '';
      if (/aborted|abort|timeout|timed out/i.test(msg)) {
        setAudioLyricsStatus('No pudimos transcribir este audio. Intenta de nuevo o pega la letra manualmente.');
      } else {
        setAudioLyricsStatus('No se pudo transcribir automáticamente. Puedes escribir la letra manualmente.');
      }
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
      const msg = audioReuploadNeeded
        ? 'Vuelve a subir tu audio para continuar. Por seguridad no conservamos el audio al restaurar un borrador.'
        : audioUploadError || 'Necesitas subir tu audio antes de generar con audio de referencia.';
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
        'Suno V6': 'V6',
        'Suno V6 Wild': 'V6_WILD',
        'Suno V6 Mini': 'V6_MINI',
      };
      const modelCode = modelMap[data.model] || 'V6';
      const hasSelectedVoice = Boolean(data.voice === 'clone' && data.voiceProfile?.voiceId);
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
        if (hasAudioCover) payload.audioWeight = audioWeight / 100;
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
                negativeTags: payload.negativeTags,
              };
          if (!hasAudioCover) {
            delete retryPayload.audioWeight;
          }
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
          clearGenerationSession();
          removeSelectedAudio({ nextAudioSource: 'none' });
          setData((prev) => ({
            ...prev,
            title: '',
            lyrics: '',
            lyricInstruction: '',
            aiLyricsGenerated: false,
            style: '',
            styleOriginal: '',
            styleTranslated: false,
            negative: '',
            audioSource: 'none',
            file: null,
          }));
          setStep(0);
          if (onGoLibrary) onGoLibrary();
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
      } catch {}
      clearGenerationSession();
      removeSelectedAudio({ nextAudioSource: 'none' });
      setData((prev) => ({
        ...prev,
        title: '',
        lyrics: '',
        lyricInstruction: '',
        aiLyricsGenerated: false,
        style: '',
        styleOriginal: '',
        styleTranslated: false,
        negative: '',
        audioSource: 'none',
        file: null,
      }));
      setStep(0);
      if (onGoLibrary) onGoLibrary();
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
    audioReuploadNeeded,
    isGeneratingLyrics,
    isTranscribingAudioLyrics,
    audioLyricsStatus,
    isBoostingStyle,
    isTranslatingStyle,
    isSubmitting,
    creditsGate,
    setCreditsGate,
    onOpenBalance,
    onGoCloneVoice,
    credits,
    hasPendingTask,
    audioUploadUrl,
    audioUploadError,
    hasUploadedAudio: Boolean(audioUploadUrl),
    onShowAlert,
    handleToggleNotifications,
    clearAudioTranscriptionState: () => setAudioLyricsStatus(''),
    removeSelectedAudio,
    goToLyricsStep: () => setStep(1),
  };
  const content = useMemo(() => {
    return step === 0 ? <StartStep data={data} setData={setData} setToast={setToast} handlers={sharedHandlers} /> :
      step === 1 ? <LyricsStep data={data} setData={setData} setToast={setToast} handlers={sharedHandlers} /> :
      step === 2 ? <StyleStep data={data} setData={setData} creativity={creativity} setCreativity={setCreativity} instruction={instruction} setInstruction={setInstruction} audioWeight={audioWeight} setAudioWeight={setAudioWeight} setToast={setToast} handlers={sharedHandlers} /> :
      <ReviewStep data={data} setData={setData} creativity={creativity} instruction={instruction} audioWeight={audioWeight} setToast={setToast} handlers={sharedHandlers} />;
  },
    [step, data, creativity, instruction, audioWeight, isUploadingAudio, isGeneratingLyrics, isSubmitting, creditsGate, credits, hasPendingTask]
  );

  const hasMeaningfulContent = Boolean(
    step > 0 ||
      (data.title || '').toString().trim() ||
      (data.lyrics || '').toString().trim() ||
      (data.style || '').toString().trim() ||
      (data.negative || '').toString().trim() ||
      (data.lyricInstruction || '').toString().trim() ||
      data.audioSource !== 'none' ||
      data.voice !== 'standard' ||
      data.voiceProfile ||
      creativity !== 50 ||
      instruction !== 50 ||
      audioWeight !== 25
  );
  const requestResetForNewSong = () => {
    if (!hasMeaningfulContent) return;
    if (typeof onShowAlert === 'function') {
      onShowAlert({
        title: '¿Crear otra canción?',
        message: 'Se eliminará el borrador actual y comenzarás una canción nueva. Esta acción no se puede deshacer.',
        tone: 'warning',
        actions: [
          { label: 'Cancelar', kind: 'cancel' },
          { label: 'Crear otra canción', kind: 'danger', onPress: resetForNewSong },
        ],
      });
      return;
    }
    resetForNewSong();
  };

  return (
    <div className="approved-flow-shell">
      <main className="main-area">
        <Stepper step={step} onStep={setStep} />
        <div className="content-area" ref={contentAreaRef}>
          {content}
          <footer className="step-footer">
            {hasMeaningfulContent ? (
              <button className="back-button reset-button" type="button" onClick={requestResetForNewSong}>
                Crear otra canción
              </button>
            ) : null}
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
  // On some Android devices the file picker / media flow can destabilize React
  // cleanup when this screen lives inside a portal mounted in a shadow root.
  // Render in the normal tree so the validation phrase step keeps stable DOM
  // ownership while upload, polling and step transitions happen.
  return (
    <div style={{ height: "100%", minHeight: 0, width: "100%" }}>
      <style>{approvedCss}</style>
      <ApprovedCreateContent {...(props || {})} />
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
  // In Android file pickers, this flow could crash during React cleanup when the
  // file input lived inside a portal mounted in a shadow root. Render it in the
  // regular tree to keep the DOM ownership stable while the picker opens/closes.
  return (
    <div style={{ height: "100%", minHeight: 0, width: "100%" }}>
      <style>{approvedCloneCss}</style>
      <ApprovedCloneVoiceContent onClose={onClose} />
    </div>
  );
}
