import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import {
  ArrowRight,
  Check,
  Coins,
  Home,
  Layers3,
  Library,
  Loader2,
  MessageCircleMore,
  Mic,
  MicOff,
  Music2,
  RefreshCw,
  Send,
  Sparkles,
  Trash2,
  Upload,
  PencilLine,
  FileText,
  Link as LinkIcon,
  Video,
} from 'lucide-react';
import { getAccessToken } from '@/lib/supabaseBrowser';
import { cn } from '@/lib/utils';

type QuickReply = {
  id: string;
  label: string;
  value: string;
  icon?: string;
  variant?: 'primary' | 'secondary' | 'ghost';
};

type SongCard = {
  id: string;
  title: string;
  audioUrl?: string;
  coverUrl?: string;
  createdAt?: string;
  acceptedAt?: string | null;
};

type ChatMessage = {
  id: string;
  role: 'assistant' | 'user';
  text?: string;
  quickReplies?: QuickReply[];
  inputMode?: 'text' | 'multiline' | 'audio' | 'audio_mp3' | 'disabled';
  inputPlaceholder?: string;
  songs?: SongCard[];
  credits?: {
    credits: number;
    songBalance?: number;
    downloadsAllowed?: boolean;
    planKey?: string;
    planActive?: boolean;
    planExpiresAt?: string | null;
  };
  links?: Array<{ label: string; url: string }>;
  statusKey?: string;
};

type ChatSession = {
  version: 1;
  flow: 'home' | 'generate' | 'cover' | 'separate' | 'mastering';
  step: string;
  messages: ChatMessage[];
  composer: {
    mode: 'text' | 'multiline' | 'audio' | 'audio_mp3' | 'disabled';
    placeholder: string;
    sendLabel: string;
  };
  draft?: {
    pendingTaskId?: string;
    pendingKind?: string;
  };
};

const STORAGE_KEY = 'ramber.luciana.chat.v1';

function createEmptySession(): ChatSession {
  return {
    version: 1,
    flow: 'home',
    step: 'home',
    messages: [],
    composer: {
      mode: 'text',
      placeholder: 'Escribe aquí…',
      sendLabel: 'Enviar',
    },
    draft: {},
  };
}

function iconForName(name?: string) {
  const n = (name || '').toLowerCase();
  if (n === 'sparkles') return Sparkles;
  if (n === 'coins') return Coins;
  if (n === 'library') return Library;
  if (n === 'home') return Home;
  if (n === 'music') return Music2;
  if (n === 'mic') return Mic;
  if (n === 'mic-off') return MicOff;
  if (n === 'layers') return Layers3;
  if (n === 'refresh') return RefreshCw;
  if (n === 'upload') return Upload;
  if (n === 'edit') return PencilLine;
  if (n === 'file-text') return FileText;
  if (n === 'video') return Video;
  if (n === 'check') return Check;
  return ArrowRight;
}

function formatDate(raw?: string | null) {
  if (!raw) return '';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('es-MX', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function renderTextWithLinks(text: string) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g).filter(Boolean);
  return parts.map((part, idx) => {
    if (/^https?:\/\//i.test(part)) {
      return (
        <a
          key={`${part}-${idx}`}
          href={part}
          target="_blank"
          rel="noreferrer"
          className="underline text-cyan-300 break-all"
        >
          {part}
        </a>
      );
    }
    return <span key={`${idx}-${part.slice(0, 12)}`}>{part}</span>;
  });
}

async function fileToBase64(file: File) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No pude leer el archivo.'));
    reader.onload = () => {
      const raw = typeof reader.result === 'string' ? reader.result : '';
      resolve(raw);
    };
    reader.readAsDataURL(file);
  });
}

export function LucianaBotView() {
  const [session, setSession] = useState<ChatSession>(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        // Verificar si hay una fecha de expiración
        if (data.expiresAt) {
          const expiresAt = new Date(data.expiresAt);
          const now = new Date();
          // Si ha expirado, crear nueva sesión
          if (expiresAt < now) {
            return createEmptySession();
          }
        }
        // Verificar que data.session existe y tiene la estructura correcta
        if (data.session && data.session.messages && Array.isArray(data.session.messages)) {
          return data.session as ChatSession;
        }
      }
      return createEmptySession();
    } catch {
      return createEmptySession();
    }
  });
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pollingRef = useRef(false);

  useEffect(() => {
    try {
      // Calcular fecha de expiración (24 horas desde ahora)
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);
      
      // Guardar sesión con fecha de expiración
      const dataToStore = {
        session,
        expiresAt: expiresAt.toISOString(),
        storedAt: new Date().toISOString()
      };
      
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(dataToStore));
    } catch {}
  }, [session]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [session?.messages?.length, isSending, uploading]);

  const composer = session?.composer || createEmptySession().composer;
  const canType = composer.mode === 'text' || composer.mode === 'multiline';
  const canUpload = composer.mode === 'audio' || composer.mode === 'audio_mp3';

  const handleDeleteChat = () => {
    // Crear una nueva sesión vacía
    const emptySession = createEmptySession();
    
    // Limpiar el localStorage
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {}
    
    // Limpiar cualquier estado pendiente
    setIsSending(false);
    setUploading(false);
    setError('');
    
    // Establecer la sesión vacía
    setSession(emptySession);
    setShowDeleteConfirm(false);
    
    // Enviar evento de apertura para iniciar nueva conversación usando la sesión vacía
    sendEvent({ type: 'open' }, { silent: false }, emptySession).catch(() => {});
  };

  const sendEvent = async (
    event: Record<string, any>,
    opts?: { silent?: boolean },
    customSession?: ChatSession,
  ) => {
    if (!opts?.silent) setIsSending(true);
    setError('');
    try {
      const t = await getAccessToken();
      if (!t.ok) throw new Error(t.error || 'No se pudo iniciar sesión.');
      const r = await fetch('/api/luciana-bot/chat', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${t.token}`,
        },
        body: JSON.stringify({ session: customSession || session, event }),
      });
      const out = await r.json().catch(() => ({}));
      if (!r.ok || !out?.session) {
        throw new Error((out?.detail || out?.error || 'No pude hablar con LucIAna Bot.').toString());
      }
      setSession(out.session as ChatSession);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ocurrió un error.');
    } finally {
      if (!opts?.silent) setIsSending(false);
    }
  };

  useEffect(() => {
    if (!session?.messages?.length) {
      sendEvent({ type: 'open' }, { silent: false }, session).catch(() => {});
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const needsPolling = Boolean(session?.draft?.pendingTaskId) && /polling/i.test(session?.step || '');
    if (!needsPolling) return;
    const id = window.setInterval(() => {
      if (pollingRef.current) return;
      pollingRef.current = true;
      sendEvent({ type: 'poll' }, { silent: true }, session)
        .catch(() => {})
        .finally(() => {
          pollingRef.current = false;
        });
    }, 15000);
    return () => window.clearInterval(id);
  }, [session?.draft?.pendingTaskId, session?.step]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleQuickReply = async (reply: QuickReply) => {
    if (isSending || uploading) return;
    await sendEvent({
      type: 'quick_reply',
      value: reply.value,
      label: reply.label,
      text: reply.label,
    }, undefined, session);
  };

  const handleSubmit = async () => {
    const text = input.trim();
    if (!text || isSending || uploading || !canType) return;
    setInput('');
    await sendEvent({ type: 'message', text }, undefined, session);
  };

  const uploadAudio = async (file: File) => {
    const t = await getAccessToken();
    if (!t.ok) throw new Error(t.error || 'No se pudo iniciar sesión.');
    const contentType = (file.type || '').trim() || (file.name.toLowerCase().endsWith('.mp3') ? 'audio/mpeg' : 'application/octet-stream');

    const prep = await fetch('/api/upload-audio', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${t.token}`,
      },
      body: JSON.stringify({
        title: file.name,
        contentType,
      }),
    });
    const prepOut = await prep.json().catch(() => ({}));
    if (!prep.ok) {
      throw new Error((prepOut?.detail || prepOut?.error || 'No pude preparar la subida del audio.').toString());
    }

    let url = (prepOut?.url || '').toString().trim();
    let key = (prepOut?.key || '').toString().trim();

    if (prepOut?.uploadUrl) {
      const put = await fetch(prepOut.uploadUrl, {
        method: 'PUT',
        headers: { 'content-type': contentType },
        body: file,
      });
      if (!put.ok) {
        throw new Error(`No pude subir el audio (HTTP ${put.status}).`);
      }
    } else if (!url) {
      const base64 = await fileToBase64(file);
      const direct = await fetch('/api/upload-audio', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${t.token}`,
        },
        body: JSON.stringify({
          title: file.name,
          contentType,
          file: base64,
        }),
      });
      const directOut = await direct.json().catch(() => ({}));
      if (!direct.ok || directOut?.ok === false) {
        throw new Error((directOut?.detail || directOut?.message || directOut?.error || 'No pude subir el audio.').toString());
      }
      url = (directOut?.url || '').toString().trim();
      key = (directOut?.key || '').toString().trim();
    }

    if (!url && key) {
      url = key;
    }

    return {
      url,
      key,
      contentType,
      fileName: file.name,
      size: file.size,
    };
  };

  const handlePickFile = async (ev: ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const uploaded = await uploadAudio(file);
      await sendEvent({
        type: 'file',
        file: uploaded,
      }, undefined, session);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pude subir el audio.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const inputHint = useMemo(() => {
    if (composer.mode === 'audio_mp3') return 'Sube un MP3';
    if (composer.mode === 'audio') return 'Sube un audio';
    return composer.placeholder || 'Escribe aquí…';
  }, [composer]);

  const loadingLabel = useMemo(() => {
    if (!uploading && !isSending) return '';
    if (uploading && session?.flow === 'mastering') return 'Subiendo tu MP3 para masterizar…';
    if (isSending && session?.flow === 'mastering') return 'Aplicando nuestra tecnologia LucIAna SoundCore para masterizar tu cancion...';
    return uploading ? 'Subiendo audio…' : 'LucIAna está pensando…';
  }, [uploading, isSending, session?.flow]);

  return (
    <div className="h-full min-h-0 flex flex-col bg-[#05070d]">
      <div className="shrink-0 border-b border-white/10 bg-gradient-to-r from-indigo-500/10 via-white/5 to-fuchsia-500/10 px-4 md:px-6 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-500/40 to-fuchsia-600/40 flex items-center justify-center shadow-lg shadow-indigo-500/20 ring-1 ring-white/10 overflow-hidden">
              <img src="/assets/Luciana%20SIN%20FONDO..png?v=20260918-1" alt="LucIAna Bot" className="w-full h-full object-contain" />
            </div>
            <div className="min-w-0">
              <div className="text-transparent bg-clip-text bg-gradient-to-r from-fuchsia-400 via-violet-400 to-indigo-300 font-black text-lg leading-none">LucIAna Bot</div>
              <div className="text-slate-300 text-xs md:text-sm mt-1">Te guía paso a paso para crear, hacer covers y revisar tu saldo.</div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            className="p-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 transition-colors"
            title="Eliminar historial del chat"
          >
            <Trash2 className="w-5 h-5 text-red-400" />
          </button>
        </div>
      </div>

      <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto px-3 md:px-5 py-4 space-y-4">
        {(session?.messages || []).map((message) => {
          const isAssistant = message.role === 'assistant';
          return (
            <div key={message.id} className={cn('flex', isAssistant ? 'justify-start' : 'justify-end')}>
              <div
                className={cn(
                  'max-w-[92%] md:max-w-[80%] rounded-3xl px-4 py-3 border shadow-sm',
                  isAssistant
                    ? 'bg-white/5 border-white/10 text-slate-100'
                    : 'bg-gradient-to-r from-indigo-500 to-fuchsia-600 border-indigo-400/40 text-white'
                )}
              >
                {message.text ? (
                  <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                    {renderTextWithLinks(message.text)}
                  </div>
                ) : null}

                {message.credits ? (
                  <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 p-3">
                    <div className="flex items-center gap-2 text-white font-extrabold">
                      <Coins className="w-4 h-4 text-amber-300" />
                      <span>{Number(message.credits.credits || 0).toLocaleString('es-MX')} créditos</span>
                    </div>
                    <div className="mt-2 text-xs text-slate-300 space-y-1">
                      <div>Canciones aprox.: {Number(message.credits.songBalance || 0).toLocaleString('es-MX')}</div>
                      <div>Plan: {(message.credits.planKey || 'ninguno').toString()}</div>
                      <div>Descargas: {message.credits.downloadsAllowed ? 'Sí' : 'No'}</div>
                      {message.credits.planExpiresAt ? <div>Vence: {formatDate(message.credits.planExpiresAt)}</div> : null}
                    </div>
                  </div>
                ) : null}

                {Array.isArray(message.songs) && message.songs.length > 0 ? (
                  <div className="mt-3 space-y-3">
                    {message.songs.map((song) => (
                      <div key={song.id} className="rounded-2xl border border-white/10 bg-black/25 overflow-hidden">
                        <div className="flex gap-3 p-3">
                          <div className="w-16 h-16 rounded-2xl overflow-hidden shrink-0 bg-white/5 border border-white/10">
                            {song.coverUrl ? (
                              <img src={song.coverUrl} alt={song.title} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <Music2 className="w-6 h-6 text-slate-400" />
                              </div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-white font-bold truncate">{song.title}</div>
                            <div className="text-[11px] text-slate-400 mt-1">
                              {song.acceptedAt ? 'Aceptada' : formatDate(song.createdAt)}
                            </div>
                          </div>
                        </div>
                        {song.audioUrl ? (
                          <div className="px-3 pb-3">
                            <audio controls className="w-full" src={song.audioUrl} preload="none" />
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}

                {Array.isArray(message.links) && message.links.length > 0 ? (
                  <div className="mt-3 space-y-2">
                    {message.links.map((link) => (
                      <a
                        key={`${link.label}-${link.url}`}
                        href={link.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-slate-100 hover:bg-white/10"
                      >
                        <LinkIcon className="w-4 h-4 text-cyan-300" />
                        <span className="truncate">{link.label}</span>
                      </a>
                    ))}
                  </div>
                ) : null}

                {isAssistant && Array.isArray(message.quickReplies) && message.quickReplies.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {message.quickReplies.map((reply) => {
                      const Icon = iconForName(reply.icon);
                      return (
                        <button
                          key={reply.id}
                          type="button"
                          onClick={() => handleQuickReply(reply)}
                          disabled={isSending || uploading}
                          className={cn(
                            'rounded-2xl px-3 py-2 text-xs md:text-sm font-bold border transition-all inline-flex items-center gap-2',
                            reply.variant === 'ghost'
                              ? 'bg-transparent border-white/10 text-slate-300 hover:bg-white/5'
                              : reply.variant === 'secondary'
                                ? 'bg-white/5 border-white/10 text-white hover:bg-white/10'
                                : 'bg-gradient-to-r from-indigo-500 to-fuchsia-600 border-indigo-400/30 text-white hover:opacity-95'
                          )}
                        >
                          <Icon className="w-4 h-4" />
                          <span>{reply.label}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}

        {isSending || uploading ? (
          <div className="flex justify-start">
            <div className="max-w-[92%] rounded-3xl px-4 py-3 border border-white/10 bg-white/5 text-slate-200 inline-flex items-center gap-2 text-sm">
              <Loader2 className="w-4 h-4 animate-spin text-indigo-300" />
              <span>{loadingLabel}</span>
            </div>
          </div>
        ) : null}
      </div>

      <div className="shrink-0 border-t border-white/10 bg-[#070a12]/95 backdrop-blur-xl px-3 md:px-5 py-3">
        {error ? (
          <div className="mb-3 rounded-2xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        <div className="rounded-[28px] border border-white/10 bg-white/5 p-2 md:p-3">
          {canType ? (
            <div className="flex items-end gap-2">
              {composer.mode === 'multiline' ? (
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={inputHint}
                  rows={3}
                  className="flex-1 min-h-[68px] resize-none rounded-2xl bg-transparent px-3 py-3 text-sm text-white placeholder:text-slate-500 outline-none"
                />
              ) : (
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSubmit().catch(() => {});
                    }
                  }}
                  placeholder={inputHint}
                  className="flex-1 h-12 rounded-2xl bg-transparent px-3 text-sm text-white placeholder:text-slate-500 outline-none"
                />
              )}
              <button
                type="button"
                onClick={() => handleSubmit().catch(() => {})}
                disabled={!input.trim() || isSending || uploading}
                className="h-12 px-4 rounded-2xl bg-gradient-to-r from-indigo-500 to-fuchsia-600 text-white font-extrabold inline-flex items-center gap-2 disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                <span className="hidden sm:inline">{composer.sendLabel || 'Enviar'}</span>
              </button>
            </div>
          ) : canUpload ? (
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1 px-2">
                <div className="text-white font-bold text-sm">{composer.mode === 'audio_mp3' ? 'Sube un MP3' : 'Sube un audio'}</div>
                <div className="text-xs text-slate-400 mt-1">{inputHint}</div>
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isSending || uploading}
                className="h-12 px-4 rounded-2xl bg-gradient-to-r from-indigo-500 to-fuchsia-600 text-white font-extrabold inline-flex items-center justify-center gap-2"
              >
                <Upload className="w-4 h-4" />
                <span>Subir archivo</span>
              </button>
            </div>
          ) : (
            <div className="px-2 py-2 text-sm text-slate-400">
              Elige una de las opciones de arriba para continuar.
            </div>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept={composer.mode === 'audio_mp3' ? '.mp3,audio/mpeg' : 'audio/*'}
          onChange={handlePickFile}
          className="hidden"
        />
      </div>

      {/* Modal de confirmación para eliminar chat */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-md rounded-3xl border border-white/20 bg-gradient-to-b from-[#0f172a] to-[#1e293b] p-6 shadow-2xl">
            <div className="mb-4 flex items-center gap-3">
              <div className="rounded-2xl bg-red-500/20 p-2">
                <Trash2 className="w-6 h-6 text-red-400" />
              </div>
              <div>
                <h3 className="text-xl font-extrabold text-white">¿Seguro que quieres eliminar el historial?</h3>
                <p className="mt-1 text-sm text-slate-300">
                  Se borrarán todos los mensajes de esta conversación. Esta acción no se puede deshacer.
                </p>
              </div>
            </div>
            
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 rounded-2xl border border-slate-600 bg-slate-800/50 px-4 py-3 text-white font-bold hover:bg-slate-700/50 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDeleteChat}
                className="flex-1 rounded-2xl bg-gradient-to-r from-red-500 to-red-600 px-4 py-3 text-white font-bold hover:from-red-600 hover:to-red-700 transition-all"
              >
                Sí, eliminar chat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
