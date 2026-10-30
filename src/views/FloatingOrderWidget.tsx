import { useCallback, useEffect, useRef, useState } from 'react';
import { getAccessToken } from '../lib/supabaseBrowser';

type OrderInfo = {
  id: string;
  name: string;
  style: string;
  vocal_gender: string;
  lyrics_mode: string;
  story: string;
  lyrics: string;
  observations: string;
  title: string;
  plan: string;
  audio_path: string;
  audio_url: string;
};

const STORE_KEY = 'ramber.pedidoActivo';

function pedidoDeUrl(): string {
  try {
    return new URLSearchParams(window.location.search).get('pedido') || '';
  } catch {
    return '';
  }
}

function copiar(texto: string): Promise<boolean> {
  const t = String(texto || '');
  if (!t) return Promise.resolve(false);
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(t).then(() => true).catch(() => false);
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = t;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return Promise.resolve(ok);
  } catch {
    return Promise.resolve(false);
  }
}

function Campo({ label, value, onCopy }: { label: string; value: string; onCopy: (v: string) => void }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <div className="mb-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wide text-violet-300/80">{label}</span>
        {value ? (
          <button
            type="button"
            onClick={async () => {
              const ok = await copiar(value);
              if (ok) {
                setCopiado(true);
                setTimeout(() => setCopiado(false), 1200);
              }
            }}
            className="h-6 shrink-0 rounded-full border border-white/10 bg-white/5 px-2 text-[10px] font-bold text-slate-200 hover:bg-white/10"
          >
            {copiado ? 'Copiado' : 'Copiar'}
          </button>
        ) : null}
      </div>
      <div className="whitespace-pre-wrap break-words text-[12px] leading-snug text-slate-200">{value || '—'}</div>
    </div>
  );
}

export function FloatingOrderWidget() {
  // Solo se abre sola si vienes de "Hacer manual" (con ?pedido= en la URL).
  // Si el pedido viene guardado de antes, se muestra solo el icono.
  const cameFromUrl = useRef<boolean>(pedidoDeUrl() !== '');
  const [pedidoId, setPedidoId] = useState<string>(() => {
    try {
      return pedidoDeUrl() || (localStorage.getItem(STORE_KEY) || '');
    } catch {
      return pedidoDeUrl();
    }
  });
  const [order, setOrder] = useState<OrderInfo | null>(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);
  const [abierto, setAbierto] = useState(false);
  const [mini, setMini] = useState(false);
  const [maxi, setMaxi] = useState(false);
  const [pos, setPos] = useState(() => {
    try {
      const w = typeof window !== 'undefined' ? window.innerWidth : 390;
      const h = typeof window !== 'undefined' ? window.innerHeight : 780;
      return { x: Math.max(8, w - 348), y: Math.max(8, h - 420) };
    } catch {
      return { x: 16, y: 120 };
    }
  });
  const [confirmando, setConfirmando] = useState(false);
  const [arrastrando, setArrastrando] = useState(false);
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);
  const shownRef = useRef(false);

  useEffect(() => {
    if (!pedidoId) {
      setCargando(false);
      return;
    }
    let activo = true;
    (async () => {
      try {
        setCargando(true);
        setError('');
        const t = await getAccessToken();
        if (!t.ok) throw new Error(t.error || 'No autorizado');
        const r = await fetch(`/api/form/order?id=${encodeURIComponent(pedidoId)}`, {
          headers: { authorization: `Bearer ${t.token}` },
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j?.error || 'No se pudo cargar el pedido');
        if (!activo) return;
        setOrder(j?.order || null);
        try {
          localStorage.setItem(STORE_KEY, pedidoId);
        } catch {}
        // Se abre sola SOLO la primera vez si vienes de "Hacer manual".
        if (cameFromUrl.current && !shownRef.current) {
          shownRef.current = true;
          setAbierto(true);
          // Quitamos "?pedido=" de la URL para que no se vuelva a abrir sola
          // al cambiar de pestana o al recargar.
          try {
            const u = new URL(window.location.href);
            if (u.searchParams.has('pedido')) {
              u.searchParams.delete('pedido');
              window.history.replaceState({}, '', u.pathname + (u.search || '') + (u.hash || ''));
            }
          } catch {}
        }
      } catch (e) {
        if (activo) setError(e instanceof Error ? e.message : 'No se pudo cargar el pedido');
      } finally {
        if (activo) setCargando(false);
      }
    })();
    return () => {
      activo = false;
    };
  }, [pedidoId]);

  useEffect(() => {
    const onResize = () => {
      setPos((p) => ({
        x: Math.max(0, Math.min((window.innerWidth || 390) - 60, p.x)),
        y: Math.max(0, Math.min((window.innerHeight || 780) - 60, p.y)),
      }));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const onPointerDown = useCallback((e: any) => {
    if (e.button !== undefined && e.button !== 0) return;
    const el = e.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    dragRef.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
    setArrastrando(true);
    try {
      el.setPointerCapture(e.pointerId);
    } catch {}
  }, []);

  const onPointerMove = useCallback(
    (e: any) => {
      if (!dragRef.current) return;
      const w = window.innerWidth;
      const h = window.innerHeight;
      const x = Math.max(0, Math.min(w - 60, e.clientX - dragRef.current.dx));
      const y = Math.max(0, Math.min(h - 60, e.clientY - dragRef.current.dy));
      setPos({ x, y });
    },
    [],
  );

  const onPointerUp = useCallback((e: any) => {
    try {
      (e?.currentTarget as HTMLElement)?.releasePointerCapture?.(e.pointerId);
    } catch {}
    dragRef.current = null;
    setArrastrando(false);
  }, []);

  // "Quitar" de verdad: cierra la ventanita, borra el icono y olvida el pedido.
  const quitarFormulario = useCallback(() => {
    try {
      localStorage.removeItem(STORE_KEY);
    } catch {}
    try {
      const u = new URL(window.location.href);
      if (u.searchParams.has('pedido')) {
        u.searchParams.delete('pedido');
        window.history.replaceState({}, '', u.pathname + (u.search || '') + (u.hash || ''));
      }
    } catch {}
    setConfirmando(false);
    setAbierto(false);
    setPedidoId('');
  }, []);

  if (!pedidoId) return null;

  const chipVoz = order?.plan === 'rola_voz' ? '🎤 Voz clonada' : '🎵 Voz del sistema';
  const vozGenero = order?.vocal_gender === 'm' ? 'hombre' : order?.vocal_gender === 'f' ? 'mujer' : '';

  return (
    <>
      {/* Icono flotante: nunca desaparece */}
      <button
        type="button"
        aria-label="Abrir formulario del pedido"
        onClick={() => {
          setConfirmando(false);
          setAbierto((v) => !v);
        }}
        className="fixed bottom-24 right-3 z-[90] grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 text-2xl shadow-[0_8px_24px_rgba(139,92,246,0.45)] ring-2 ring-white/20"
        style={{ display: abierto ? 'none' : undefined }}
      >
        📋
      </button>

      {/* Ventanita */}
      {abierto && (
        <div
          className="fixed z-[95] flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#12101d]/95 shadow-[0_20px_60px_rgba(0,0,0,0.6)] backdrop-blur"
          style={
            maxi
              ? { inset: 8 }
              : {
                  left: pos.x,
                  top: pos.y,
                  width: 340,
                  maxWidth: 'calc(100vw - 16px)',
                  ...(mini ? { height: 44 } : { maxHeight: '70vh' }),
                }
          }
        >
          {/* Barra de título (arrastrable) */}
          <div
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            className="flex cursor-grab select-none items-center gap-2 border-b border-white/10 bg-white/5 px-3 py-2"
            style={{ touchAction: 'none', cursor: arrastrando ? 'grabbing' : 'grab' }}
          >
            <span className="text-base">📋</span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-extrabold text-white">
                {cargando ? 'Cargando…' : order?.name || 'Pedido'}
              </div>
              {!cargando && !error && order ? (
                <div className="truncate text-[11px] text-slate-400">{chipVoz}</div>
              ) : null}
            </div>
            <button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={() => { setMini((v) => !v); setMaxi(false); }} className="grid h-7 w-7 place-items-center rounded-lg bg-white/10 text-slate-200 hover:bg-white/15" aria-label="Minimizar">–</button>
            <button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={() => { setMaxi((v) => !v); setMini(false); }} className="grid h-7 w-7 place-items-center rounded-lg bg-white/10 text-slate-200 hover:bg-white/15" aria-label="Maximizar">□</button>
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => setConfirmando(true)}
              className="grid h-7 w-7 place-items-center rounded-lg bg-white/10 text-slate-200 hover:bg-red-500/30"
              aria-label="Cerrar"
            >
              ✕
            </button>
          </div>

          {/* Confirmacion de cierre (dentro del widget: window.confirm falla en webviews) */}
          {confirmando && (
            <div className="border-b border-red-400/20 bg-red-500/10 px-3 py-2">
              <div className="text-[12px] font-semibold text-red-100">¿Seguro que quieres quitar el formulario?</div>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={quitarFormulario}
                  className="h-8 flex-1 rounded-lg bg-red-500 px-2 text-[12px] font-bold text-white"
                >
                  Sí, quitar
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmando(false)}
                  className="h-8 flex-1 rounded-lg bg-white/10 px-2 text-[12px] font-bold text-slate-200"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* Cuerpo */}
          {!mini && (
            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
              {cargando && <div className="py-6 text-center text-sm text-slate-400">Cargando pedido…</div>}
              {!cargando && error && <div className="py-6 text-center text-sm text-red-300">{error}</div>}
              {!cargando && !error && order && (
                <>
                  <div className="mb-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                    <div className="text-[11px] font-bold uppercase tracking-wide text-violet-300/80">Tipo de voz</div>
                    <div className="text-sm text-white">{chipVoz}</div>
                  </div>
                  <Campo label="Estilo" value={order.style} onCopy={copiar} />
                  {vozGenero ? <Campo label="Voz" value={vozGenero} onCopy={copiar} /> : null}
                  <Campo label="Canción" value={order.title} onCopy={copiar} />
                  <Campo label="Letra" value={order.lyrics} onCopy={copiar} />
                  <Campo label="Historia" value={order.story} onCopy={copiar} />
                  <Campo label="Observaciones" value={order.observations} onCopy={copiar} />
                  {order.audio_url ? (
                    <div className="mt-2">
                      <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-violet-300/80">Audio a capela</div>
                      <audio controls preload="none" src={order.audio_url} className="w-full" />
                      <a
                        href={`${order.audio_url}&dl=1`}
                        target="_blank"
                        rel="noopener"
                        className="mt-1 flex h-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-[12px] font-bold text-slate-200"
                      >
                        Descargar audio
                      </a>
                    </div>
                  ) : (
                    <div className="mt-2 text-[11px] text-slate-500">Este pedido no tiene audio a capela.</div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}
