import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Library,
  Loader2,
  MessageSquare,
  Music2,
  Send,
  Sparkles,
  Trash2,
  WalletCards,
} from 'lucide-react';
import { getAccessToken, supabaseBrowser } from '@/lib/supabaseBrowser';
import { cn } from '@/lib/utils';
import type { ViewTab } from '@/types';

type ChatRole = 'user' | 'assistant';

type ChatMessage = {
  id: string;
  role: ChatRole;
  text: string;
  createdAt: number;
  structured?: null | {
    action: 'ready_to_generate';
    prompt: string;
    style: string;
    title: string;
    instrumental: boolean;
  };
};

type ReadyToGenerate = {
  prompt: string;
  style: string;
  title: string;
  instrumental: boolean;
};

type PendingGeneration = {
  task_id?: string;
  status?: string;
  startedAt: number;
};

function uid() {
  if (typeof crypto !== 'undefined' && typeof (crypto as any).randomUUID === 'function') {
    return (crypto as any).randomUUID();
  }
  return 'm_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function escapeHTML(s: string) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function simpleMarkdown(text: string): string {
  const raw = String(text || '');
  if (!raw) return '';
  let out = escapeHTML(raw);
  out = out.replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-white">$1</strong>');
  out = out.replace(/`([^`\n]+)`/g, '<code class="rounded bg-white/10 px-1.5 py-0.5 text-[0.8em] text-fuchsia-200">$1</code>');
  out = out.replace(/\n{2,}/g, '\n\n');
  out = out.replace(/\n/g, '<br/>');
  return out;
}

export function DifyCopilotView({ onChange }: { onChange: (t: ViewTab) => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: uid(),
      role: 'assistant',
      text:
        '✨ Hola! Soy tu **LucIAna Bot**.\n\nCuentame de qué quieres cantar (estilo, tema, estado de ánimo, público objetivo…) y juntos definimos:\n· **Letra / Prompt**\n· **Título**\n· **Estilo musical**\n· ¿**Instrumental** o con voz?\n\nCuando todo esté OK te mostraré un botón **"Generar canción"** y se cobrarán 12 créditos a tu cuenta real de LucIAna. 🎵',
      createdAt: Date.now(),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string>('');
  const [activeReady, setActiveReady] = useState<ReadyToGenerate | null>(null);
  const [generating, setGenerating] = useState(false);
  const [lastPending, setLastPending] = useState<PendingGeneration | null>(null);
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, loading, activeReady, generating]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  const canSend = useMemo(() => {
    if (loading || generating) return false;
    if (!String(input || '').trim()) return false;
    return true;
  }, [input, loading, generating]);

  const pushAssistantAck = useCallback(() => {
    if (!supabaseBrowser) return;
    // No-op; el fetch es bloqueante y empujamos al terminar
  }, []);

  const signOutAndReload = useCallback(() => {
    try {
      void supabaseBrowser?.auth?.signOut?.().catch(() => {});
    } catch {}
    try {
      const base = window.location.origin.toString().replace(/\/+$/, '');
      window.location.href = `${base}/crear`;
    } catch {}
  }, []);

  const getValidBearerToken = useCallback(async (): Promise<string | null> => {
    if (!supabaseBrowser) return null;
    let accessToken = '';
    let sessionOk = false;
    try {
      const result = await getAccessToken();
      if (result && typeof result === 'object' && result.ok && typeof result.token === 'string' && result.token.trim()) {
        accessToken = String(result.token).trim();
        sessionOk = true;
      }
    } catch {}
    if (!sessionOk) {
      try {
        const { data } = await supabaseBrowser.auth.getSession();
        const s = data?.session;
        if (s && typeof (s as any).access_token === 'string' && String((s as any).access_token).trim()) {
          accessToken = String((s as any).access_token).trim();
          sessionOk = true;
        }
      } catch {}
    }
    if (!sessionOk) {
      try {
        const { data } = await supabaseBrowser.auth.refreshSession();
        const s = data?.session;
        if (s && typeof (s as any).access_token === 'string' && String((s as any).access_token).trim()) {
          accessToken = String((s as any).access_token).trim();
          sessionOk = true;
        }
      } catch {}
    }
    return sessionOk && accessToken ? accessToken : null;
  }, [signOutAndReload]);

  const sendMessage = useCallback(async () => {
    const text = String(input || '').trim();
    if (!text) return;
    if (!supabaseBrowser) {
      setToast({ kind: 'err', text: 'No se pudo conectar con LucIAna. Cierra y abre la app de nuevo.' });
      return;
    }
    setLoading(true);
    try {
      const userMsg: ChatMessage = {
        id: uid(),
        role: 'user',
        text,
        createdAt: Date.now(),
      };
      setMessages((m) => [...m, userMsg]);
      setInput('');
      if (textareaRef.current) textareaRef.current.value = '';

      const accessToken = await getValidBearerToken();
      if (!accessToken) {
        setLoading(false);
        setToast({ kind: 'err', text: 'Sesión expirada. Vuelve a iniciar sesión con Google.' });
        const errMsg: ChatMessage = {
          id: uid(),
          role: 'assistant',
          text: '⚠️ Tu sesión de LucIAna expiró. Por favor, vuelve a iniciar sesión con Google para seguir usando a LucIAna Bot.',
          createdAt: Date.now(),
        };
        setMessages((m) => [...m, errMsg]);
        return;
      }

      const bodyPayload: any = { message: text };
      if (conversationId) bodyPayload.conversation_id = conversationId;

      let json: any = null;
      let httpStatus = 0;
      try {
        const r = await fetch('/api/dify/chat', {
          method: 'POST',
          headers: {
            'content-type': 'application/json; charset=utf-8',
            authorization: `Bearer ${accessToken}`,
            accept: 'application/json',
          },
          body: JSON.stringify(bodyPayload),
        });
        httpStatus = r.status;
        const rawText = await r.text();
        try {
          json = rawText ? JSON.parse(rawText) : null;
        } catch {
          json = { reply_text: rawText, error: 'invalid_json' };
        }
      } catch (e: any) {
        httpStatus = 0;
        json = { error: 'network_error', reply_text: e instanceof Error ? String(e.message) : String(e || '') };
      }

      const replyText = String(
        (json && typeof (json as any).reply_text === 'string')
          ? (json as any).reply_text
          : (json && typeof (json as any).message === 'string')
          ? (json as any).message
          : 'No pude leer la respuesta de LucIAna Bot.'
      ).trim();
      const newCid = String((json && typeof (json as any).conversation_id === 'string') ? (json as any).conversation_id : conversationId || '').trim();
      if (newCid && newCid !== conversationId) setConversationId(newCid);

      const rawStructured = (json && typeof (json as any).structured_action === 'object' && (json as any).structured_action !== null) ? (json as any).structured_action : null;
      let structured: ChatMessage['structured'] = null;
      if (rawStructured && String(rawStructured.action || '').toLowerCase() === 'ready_to_generate') {
        const stOk: ReadyToGenerate = {
          prompt: String(rawStructured.prompt || '').trim(),
          style: String(rawStructured.style || '').trim(),
          title: String(rawStructured.title || '').trim(),
          instrumental: Boolean(rawStructured.instrumental),
        };
        if (stOk.prompt) {
          structured = { action: 'ready_to_generate', ...stOk };
        }
      }

      if (httpStatus >= 400 || (json && typeof (json as any).error === 'string')) {
        const errCode = String((json as any).error || '').trim();
        const isAuth = httpStatus === 401 || errCode === 'unauthorized' || errCode === 'missing_bearer_authorization_header' || errCode === 'sesion_expirada' || errCode === 'session_expired';
        const fallbackText = (
          isAuth
            ? '⚠️ Tu sesión de LucIAna expiró. Cierra y vuelve a iniciar sesión con Google para seguir usando a LucIAna Bot.'
            : replyText || (
              errCode === 'dify_copilot_not_configured'
                ? '⚠️ Falta configurar el asistente en el servidor. Avisa a tu administrador/a.'
                : '⚠️ Hubo un problema al contactar con LucIAna Bot. Inténtalo de nuevo en 30 segundos.'
            )
        );
        setLoading(false);
        const mappedCode = (() => {
          if (isAuth) return 'sesión expirada, vuelve a iniciar sesión';
          const c = String(errCode || '').trim();
          if (c === 'dify_copilot_not_configured') return 'asistente no configurado';
          if (c === 'network_error') return 'error de conexión';
          if (!c) return '';
          return 'operación rechazada';
        })();
        setToast({ kind: 'err', text: httpStatus ? `Error ${httpStatus} · ${mappedCode || 'petición rechazada'}` : 'Error de red' });
        if (isAuth) {
          setTimeout(() => signOutAndReload(), 1200);
        }
        const errMsg: ChatMessage = {
          id: uid(),
          role: 'assistant',
          text: fallbackText,
          createdAt: Date.now(),
        };
        setMessages((m) => [...m, errMsg]);
        return;
      }

      const assistantMsg: ChatMessage = {
        id: uid(),
        role: 'assistant',
        text: replyText || 'Listo.',
        createdAt: Date.now(),
        structured,
      };
      setMessages((m) => [...m, assistantMsg]);
      if (structured) {
        setActiveReady({
          prompt: structured.prompt,
          style: structured.style,
          title: structured.title,
          instrumental: structured.instrumental,
        });
      }
      setLoading(false);
    } catch (e: any) {
      setLoading(false);
      setToast({ kind: 'err', text: e instanceof Error ? e.message : String(e || '') });
    }
  }, [input, conversationId]);

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      void sendMessage();
    }
  };

  const resetChat = () => {
    setMessages([
      {
        id: uid(),
        role: 'assistant',
        text: 'Empezamos de nuevo ✨. Cuéntame de qué quieres hacer la canción (estilo, tema, público, título sugerido…).',
        createdAt: Date.now(),
      },
    ]);
    setConversationId('');
    setActiveReady(null);
    setLastPending(null);
    setToast({ kind: 'ok', text: 'Conversación reiniciada' });
  };

  const clearReady = () => {
    setActiveReady(null);
  };

  const handleGenerate = async () => {
    if (!activeReady) return;
    if (!activeReady.prompt) {
      setToast({ kind: 'err', text: 'El campo Letra / Prompt no puede estar vacío.' });
      return;
    }
    if (!supabaseBrowser) {
      setToast({ kind: 'err', text: 'Supabase no está disponible. No puedo cobrar a tu cuenta.' });
      return;
    }
    setGenerating(true);
    try {
      const accessToken = await getValidBearerToken();
      if (!accessToken) {
        setGenerating(false);
        setToast({ kind: 'err', text: 'Sesión expirada. Vuelve a iniciar sesión con Google.' });
        setTimeout(() => signOutAndReload(), 1200);
        return;
      }
      const payload = {
        prompt: String(activeReady.prompt || '').trim().slice(0, 12000),
        style: String(activeReady.style || '').trim().slice(0, 600),
        title: String(activeReady.title || '').trim().slice(0, 220),
        instrumental: Boolean(activeReady.instrumental),
        model: 'V6',
      };
      const r = await fetch('/api/gpt/generate', {
        method: 'POST',
        headers: {
          'content-type': 'application/json; charset=utf-8',
          authorization: `Bearer ${accessToken}`,
          accept: 'application/json',
        },
        body: JSON.stringify(payload),
      });
      const rawText = await r.text();
      let json: any = null;
      try { json = rawText ? JSON.parse(rawText) : null; } catch { json = null; }
      if (r.status < 200 || r.status >= 300) {
        const code = String((json as any)?.error_code || (json as any)?.code || '').trim();
        const msgRaw = String(
          (json as any)?.message || (json as any)?.detail || (json as any)?.error || `HTTP ${r.status}`
        ).trim();
        const msg = msgRaw
          || (code === 'insufficient_credits' || /insufficient/i.test(code) ? 'No tienes créditos suficientes. Recarga saldo en Planes.' : '')
          || (r.status === 401 ? 'Tu sesión expiró. Vuelve a iniciar sesión con Google.' : '');
        setGenerating(false);
        setToast({ kind: 'err', text: msg || 'Error al generar la canción.' });
        return;
      }
      const taskId = String((json as any)?.task_id || (json as any)?.taskId || '').trim() || undefined;
      const statusRaw = String((json as any)?.status || (taskId ? 'queued' : 'unknown')).trim();
      setLastPending({ task_id: taskId, status: statusRaw, startedAt: Date.now() });
      const titleOk = payload.title || 'Canción sin título';
      const okMsg: ChatMessage = {
        id: uid(),
        role: 'assistant',
        text:
          `🎵 **¡Canción en cola!**\n\n` +
          `· Título: **${titleOk || '-'}**\n` +
          `· Créditos cobrados: **12 créditos**\n` +
          (taskId ? `· Task ID: \`${taskId}\`\n` : '') +
          `\nLa generación tarda ~30-60s. Ve a tu **Biblioteca** para escucharla cuando esté lista.`,
        createdAt: Date.now(),
      };
      setMessages((m) => [...m, okMsg]);
      setActiveReady(null);
      setGenerating(false);
      setToast({ kind: 'ok', text: '🎵 Canción en cola. Ir a Biblioteca.' });
      setTimeout(() => {
        try { onChange('biblioteca'); } catch {}
      }, 1200);
    } catch (e: any) {
      setGenerating(false);
      setToast({ kind: 'err', text: e instanceof Error ? e.message : String(e || 'Error desconocido') });
    }
  };

  const readyIsValid = !!(activeReady && String(activeReady.prompt || '').trim());

  return (
    <div className="relative mx-auto w-full max-w-4xl px-3 py-5 md:px-5 md:py-7">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-fuchsia-500 via-violet-500 to-indigo-500 shadow-[0_0_22px_rgba(168,85,247,0.35)] ring-1 ring-white/10">
              <Bot className="h-5 w-5 text-white" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-lg font-black text-white md:text-xl">
                  LucIAna <span className="bg-gradient-to-r from-fuchsia-300 to-amber-200 bg-clip-text text-transparent">Bot</span>
                </h1>
              </div>
              <p className="mt-0.5 text-xs text-slate-400 md:text-sm">
                LucIAna te ayuda a definir tu letra, título y estilo musical. La generación real y el cobro de créditos (12 créditos) ocurren desde LucIAna y se asocian a tu cuenta.
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {lastPending?.task_id && (
            <button
              type="button"
              onClick={() => onChange('biblioteca')}
              className="inline-flex h-10 items-center gap-2 rounded-2xl border border-emerald-400/25 bg-emerald-400/10 px-3 text-xs font-bold text-emerald-200 ring-1 ring-inset ring-emerald-400/10 transition hover:bg-emerald-400/15"
            >
              <Library className="h-4 w-4" /> Biblioteca
            </button>
          )}
          <button
            type="button"
            onClick={resetChat}
            className="inline-flex h-10 items-center gap-1.5 rounded-2xl border border-white/10 bg-white/[.03] px-3 text-xs font-bold text-slate-300 ring-1 ring-inset ring-white/5 transition hover:bg-white/[.06]"
          >
            <Trash2 className="h-4 w-4" /> Reiniciar
          </button>
        </div>
      </div>

      {conversationId && (
        <div className="mb-3 flex items-center gap-2 rounded-xl border border-white/10 bg-white/[.02] px-3 py-2 text-[11px] text-slate-400 ring-1 ring-inset ring-white/5">
          <MessageSquare className="h-3.5 w-3.5 text-fuchsia-300" />
          <span className="truncate">Conversación: <code className="text-fuchsia-200">{conversationId.slice(0, 8)}…{conversationId.slice(-6)}</code> (se guarda en tu perfil de LucIAna)</span>
        </div>
      )}

      <div className="rounded-[28px] border border-white/10 bg-white/[.02] p-4 shadow-[0_10px_40px_rgba(0,0,0,0.25)] ring-1 ring-inset ring-white/5 md:p-5">
        <div
          ref={listRef}
          className="max-h-[62vh] min-h-[42vh] space-y-3 overflow-y-auto pr-1"
        >
          {messages.map((m) => {
            const isUser = m.role === 'user';
            return (
              <div key={m.id} className={cn('flex w-full', isUser ? 'justify-end' : 'justify-start')}>
                <div
                  className={cn(
                    'flex max-w-[94%] items-start gap-2 md:max-w-[88%]',
                    isUser ? 'flex-row-reverse' : 'flex-row',
                  )}
                >
                  <div
                    className={cn(
                      'mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-1 ring-inset',
                      isUser
                        ? 'bg-gradient-to-br from-indigo-500 to-fuchsia-500 ring-white/10'
                        : 'bg-gradient-to-br from-fuchsia-500/20 to-amber-400/20 ring-fuchsia-400/15',
                    )}
                  >
                    {isUser ? (
                      <WalletCards className="h-4 w-4 text-white" />
                    ) : (
                      <Bot className="h-4 w-4 text-fuchsia-200" />
                    )}
                  </div>
                  <div
                    className={cn(
                      'overflow-hidden rounded-2xl px-4 py-3 text-sm leading-relaxed ring-1 ring-inset shadow-[0_4px_18px_rgba(0,0,0,0.18)]',
                      isUser
                        ? 'rounded-br-md bg-gradient-to-br from-indigo-600 to-violet-600 text-white ring-white/10 text-gray-50 shadow-[0_6px_18px_rgba(139,92,246,0.25)]'
                        : 'rounded-bl-md border border-white/10 bg-white/[.04] text-slate-100 ring-white/5 backdrop-blur-md',
                    )}
                  >
                    <div
                      className={cn('whitespace-pre-wrap break-words', isUser ? '' : 'prose prose-invert max-w-none')}
                      dangerouslySetInnerHTML={{ __html: simpleMarkdown(m.text) }}
                    />
                    {m.structured?.action === 'ready_to_generate' && (
                      <div className="mt-3 flex items-center gap-2 rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-3 py-2 text-[11px] font-bold text-emerald-200 ring-1 ring-inset ring-emerald-400/10">
                        <CheckCircle2 className="h-4 w-4" /> LucIAna Bot confirma: ¡resumen listo para generar la canción!
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {loading && (
            <div className="flex w-full justify-start">
              <div className="flex items-center gap-2 rounded-2xl rounded-bl-md border border-white/10 bg-white/[.04] px-4 py-3 text-sm text-slate-300 ring-1 ring-inset ring-white/5 backdrop-blur-md">
                <Loader2 className="h-4 w-4 animate-spin text-fuchsia-300" />
                <span className="text-xs text-slate-300 md:text-sm">LucIAna Bot está escribiendo…</span>
              </div>
            </div>
          )}
        </div>

        <div className="mt-4 flex flex-col gap-2 border-t border-white/5 pt-4 md:flex-row md:items-end">
          <div className="relative flex-1">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setInput(e.target.value)}
              onKeyDown={onInputKeyDown}
              rows={2}
              placeholder="Cuéntame de qué quieres la canción… (Ctrl/Cmd + Enter para enviar)"
              className={cn(
                'block w-full resize-none rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white placeholder:text-slate-500 ring-1 ring-inset ring-white/5 focus:border-fuchsia-400/40 focus:outline-none focus:ring-fuchsia-400/20',
                loading || generating ? 'opacity-60' : '',
              )}
              disabled={loading || generating}
            />
            <div className="pointer-events-none absolute right-3 top-2 text-[10px] text-slate-500">
              {String(input || '').length} / 20,000
            </div>
          </div>
          <button
            type="button"
            onClick={() => void sendMessage()}
            disabled={!canSend}
            className={cn(
              'inline-flex h-[50px] items-center justify-center gap-2 rounded-2xl px-5 text-sm font-black text-gray-50 shadow-[0_10px_30px_rgba(168,85,247,0.25)] ring-1 ring-inset transition md:w-[160px]',
              canSend
                ? 'bg-gradient-to-br from-fuchsia-500 via-violet-500 to-indigo-600 ring-white/10 hover:from-fuchsia-400 hover:to-indigo-500'
                : 'cursor-not-allowed bg-slate-700/60 ring-white/5 opacity-70',
            )}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Pensando…
              </>
            ) : (
              <>
                <Send className="h-4 w-4" /> Enviar
              </>
            )}
          </button>
        </div>
      </div>

      {activeReady && (
        <div className="mt-5 overflow-hidden rounded-[28px] border border-fuchsia-400/30 bg-gradient-to-br from-fuchsia-500/10 via-violet-500/5 to-indigo-500/10 p-5 shadow-[0_18px_60px_rgba(168,85,247,0.18)] ring-1 ring-inset ring-fuchsia-400/10 backdrop-blur-md md:p-6">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-to-br from-fuchsia-500 to-amber-400 ring-1 ring-white/10">
                <Music2 className="h-4 w-4 text-white" />
              </span>
              <div>
                <h2 className="text-base font-black text-white md:text-lg">Resumen para generar canción</h2>
                <p className="text-xs text-slate-300 md:text-sm">
                  Revisa, edita si quieres y pulsa <strong className="text-fuchsia-200">Generar canción</strong>. Se cobran <strong className="text-amber-200">12 créditos</strong> a tu cuenta real.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={clearReady}
              className="inline-flex h-9 items-center gap-1.5 rounded-2xl border border-white/10 bg-white/[.03] px-3 text-xs font-bold text-slate-300 ring-1 ring-inset ring-white/5 transition hover:bg-white/[.08]"
            >
              <Trash2 className="h-3.5 w-3.5" /> Quitar resumen
            </button>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="md:col-span-2 block">
              <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-fuchsia-200">
                Letra / Prompt
              </span>
              <textarea
                rows={8}
                value={activeReady.prompt}
                onChange={(e) => setActiveReady({ ...activeReady, prompt: e.target.value })}
                className="block w-full resize-y rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white ring-1 ring-inset ring-white/5 focus:border-fuchsia-400/40 focus:outline-none focus:ring-fuchsia-400/20"
              />
              <div className="mt-1 text-[10px] text-slate-500">{String(activeReady.prompt || '').length} / 12,000 caracteres</div>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-fuchsia-200">Título</span>
              <input
                type="text"
                value={activeReady.title}
                onChange={(e) => setActiveReady({ ...activeReady, title: e.target.value })}
                placeholder="Ej: Noches de verano"
                className="block h-11 w-full rounded-2xl border border-white/10 bg-black/30 px-4 text-sm text-white ring-1 ring-inset ring-white/5 placeholder:text-slate-500 focus:border-fuchsia-400/40 focus:outline-none focus:ring-fuchsia-400/20"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-fuchsia-200">Estilo musical</span>
              <input
                type="text"
                value={activeReady.style}
                onChange={(e) => setActiveReady({ ...activeReady, style: e.target.value })}
                placeholder="Ej: Pop español, guitarra acústica, voz femenina suave"
                className="block h-11 w-full rounded-2xl border border-white/10 bg-black/30 px-4 text-sm text-white ring-1 ring-inset ring-white/5 placeholder:text-slate-500 focus:border-fuchsia-400/40 focus:outline-none focus:ring-fuchsia-400/20"
              />
            </label>

            <label className="md:col-span-2 inline-flex cursor-pointer items-center gap-3 rounded-2xl border border-white/10 bg-white/[.03] px-4 py-3 ring-1 ring-inset ring-white/5">
              <input
                type="checkbox"
                checked={activeReady.instrumental}
                onChange={(e) => setActiveReady({ ...activeReady, instrumental: e.target.checked })}
                className="h-5 w-5 rounded accent-fuchsia-500"
              />
              <div className="min-w-0">
                <div className="text-sm font-bold text-white">¿Es una canción instrumental?</div>
                <div className="text-xs text-slate-400">Si marcas esta opción se generará sin letra cantada (solo música).</div>
              </div>
            </label>
          </div>

          <div className="mt-5 flex flex-col-reverse items-stretch gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-2 rounded-2xl border border-amber-300/25 bg-amber-400/5 px-4 py-3 text-xs text-amber-100 ring-1 ring-inset ring-amber-300/10">
              <WalletCards className="h-4 w-4 text-amber-200" />
              <div>
                <div className="font-black text-amber-200">12 créditos</div>
                <div className="text-[11px] text-amber-100/80">se descontarán de tu cuenta real de LucIAna cuando pulses el botón.</div>
              </div>
            </div>
            <div className="flex flex-col items-stretch gap-2 md:flex-row md:items-center">
              <button
                type="button"
                onClick={clearReady}
                disabled={generating}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[.03] px-5 text-sm font-bold text-slate-200 ring-1 ring-inset ring-white/5 transition hover:bg-white/[.08] disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleGenerate()}
                disabled={generating || !readyIsValid}
                className={cn(
                  'inline-flex h-12 min-w-[240px] items-center justify-center gap-2 rounded-2xl px-6 text-base font-black text-gray-50 shadow-[0_14px_40px_rgba(217,70,239,0.35)] ring-1 ring-inset ring-white/10 transition',
                  generating || !readyIsValid
                    ? 'cursor-not-allowed bg-slate-600/70 opacity-80'
                    : 'bg-gradient-to-br from-fuchsia-500 via-pink-500 to-amber-400 hover:brightness-110',
                )}
              >
                {generating ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" /> Generando canción…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-5 w-5" /> ✨ Generar canción
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div
          className={cn(
            'pointer-events-none fixed bottom-24 left-1/2 z-50 w-[min(92vw,520px)] -translate-x-1/2 rounded-2xl px-4 py-3 text-sm font-bold shadow-[0_10px_40px_rgba(0,0,0,0.35)] ring-1 ring-inset backdrop-blur-md md:bottom-8',
            toast.kind === 'ok'
              ? 'bg-emerald-500/15 text-emerald-100 ring-emerald-300/20'
              : 'bg-rose-500/15 text-rose-100 ring-rose-300/20',
          )}
        >
          <div className="flex items-center gap-2">
            {toast.kind === 'ok' ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-200" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-rose-200" />
            )}
            <span className="break-words leading-snug">{toast.text}</span>
          </div>
        </div>
      )}
    </div>
  );
}
