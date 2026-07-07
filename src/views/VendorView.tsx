import { useEffect, useMemo, useState } from 'react';
import { BadgeCheck, Clock3, Copy, ExternalLink, Link2 } from 'lucide-react';
import { getAccessToken } from '@/lib/supabaseBrowser';

type PreviewItem = {
  id: string;
  songId: string;
  title: string;
  coverUrl?: string;
  clientLabel?: string;
  hasCountdown: boolean;
  expiresAt?: string | null;
  isPaid: boolean;
  paidAt?: string | null;
  createdAt?: string | null;
  url: string;
};

function formatRemaining(expiresAt?: string | null) {
  if (!expiresAt) return 'Sin reloj';
  const end = new Date(expiresAt).getTime();
  if (!Number.isFinite(end)) return 'Sin fecha';
  const diff = end - Date.now();
  if (diff <= 0) return 'Expirado';
  const total = Math.floor(diff / 1000);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  return `${hours}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function VendorView() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [items, setItems] = useState<PreviewItem[]>([]);
  const [error, setError] = useState('');
  const [defaultValue, setDefaultValue] = useState('24');
  const [defaultUnit, setDefaultUnit] = useState<'hours' | 'days'>('hours');
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setTick((v) => v + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const loadSettings = async () => {
    const t = await getAccessToken();
    if (!t.ok) {
      setError(t.error || 'No se pudo iniciar sesión.');
      return;
    }
    const r = await fetch('/api/vendor/settings', {
      headers: { authorization: `Bearer ${t.token}` },
    });
    const out = await r.json().catch(() => ({}));
    if (!r.ok || out?.ok === false) {
      setError((out?.error || 'No pude cargar la configuración.').toString());
      return;
    }
    const hours = Math.max(1, Number(out?.countdown_default_hours || 24) || 24);
    if (hours % 24 === 0) {
      setDefaultUnit('days');
      setDefaultValue(String(Math.max(1, Math.floor(hours / 24))));
    } else {
      setDefaultUnit('hours');
      setDefaultValue(String(hours));
    }
  };

  const loadItems = async () => {
    setItemsLoading(true);
    try {
      const t = await getAccessToken();
      if (!t.ok) {
        setError(t.error || 'No se pudo iniciar sesión.');
        return;
      }
      const r = await fetch('/api/vendor/preview-shares', {
        headers: { authorization: `Bearer ${t.token}` },
      });
      const out = await r.json().catch(() => ({}));
      if (!r.ok || out?.ok === false) {
        setError((out?.error || 'No pude cargar tus previews.').toString());
        return;
      }
      setItems(Array.isArray(out?.items) ? out.items : []);
    } finally {
      setItemsLoading(false);
    }
  };

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    Promise.all([loadSettings(), loadItems()])
      .catch(() => {
        if (!alive) return;
        setError('No pude cargar Vendedor.');
      })
      .finally(() => {
        if (!alive) return;
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const defaultHours = useMemo(() => {
    const n = Math.max(1, Math.floor(Number(defaultValue) || 1));
    return defaultUnit === 'days' ? n * 24 : n;
  }, [defaultUnit, defaultValue]);

  const saveSettings = async () => {
    setSaving(true);
    setError('');
    try {
      const t = await getAccessToken();
      if (!t.ok) {
        setError(t.error || 'No se pudo iniciar sesión.');
        return;
      }
      const r = await fetch('/api/vendor/settings', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${t.token}` },
        body: JSON.stringify({ countdown_default_hours: defaultHours }),
      });
      const out = await r.json().catch(() => ({}));
      if (!r.ok || out?.ok === false) {
        setError((out?.error || 'No pude guardar la configuración.').toString());
        return;
      }
      alert('Listo. Configuración guardada.');
    } finally {
      setSaving(false);
    }
  };

  const markPaid = async (id: string) => {
    const t = await getAccessToken();
    if (!t.ok) {
      alert(t.error || 'No se pudo iniciar sesión.');
      return;
    }
    const r = await fetch('/api/vendor/mark-paid', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${t.token}` },
      body: JSON.stringify({ id }),
    });
    const out = await r.json().catch(() => ({}));
    if (!r.ok || out?.ok === false) {
      alert((out?.error || 'No pude marcar como pagado.').toString());
      return;
    }
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, isPaid: true, paidAt: out?.paid_at || new Date().toISOString() } : item)));
  };

  const copyLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      alert('Link copiado.');
    } catch {
      alert(url);
    }
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
      <div className="glass-card rounded-3xl p-5 border border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-indigo-500/15 border border-indigo-400/20 flex items-center justify-center">
            <Clock3 className="w-5 h-5 text-indigo-200" />
          </div>
          <div>
            <div className="text-white font-extrabold text-lg">Vendedor</div>
            <div className="text-slate-400 text-sm">Reloj de cuenta regresiva para que compartas a tus clientes y te paguen mas rapido.</div>
          </div>
        </div>
        <div className="mt-4 text-slate-300 text-sm">
          La canción no se elimina, pero sirve para que tu cliente pague más rápido.
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="glass-card rounded-3xl p-5 border border-white/10">
          <div className="flex items-center gap-3">
            <Clock3 className="w-5 h-5 text-slate-200" />
            <div className="text-white font-extrabold">Reloj Temporizador</div>
          </div>
          <div className="mt-2 text-sm text-slate-400">
            Este valor se precarga cuando eliges compartir con cuenta regresiva.
          </div>

          <div className="mt-4 grid grid-cols-[1fr,120px] gap-3">
            <input
              type="number"
              min={1}
              value={defaultValue}
              onChange={(e) => setDefaultValue(e.target.value)}
              className="w-full glass-card rounded-2xl px-4 py-3 text-white outline-none"
            />
            <select
              value={defaultUnit}
              onChange={(e) => setDefaultUnit(e.target.value === 'days' ? 'days' : 'hours')}
              className="w-full glass-card rounded-2xl px-4 py-3 text-white outline-none bg-transparent"
            >
              <option value="hours">Horas</option>
              <option value="days">Días</option>
            </select>
          </div>

          <div className="mt-3 text-xs text-slate-500">
            Equivale a {defaultHours} hora{defaultHours === 1 ? '' : 's'}.
          </div>

          <button
            onClick={() => saveSettings().catch(() => {})}
            disabled={saving}
            className="mt-4 w-full h-[46px] rounded-full bg-white text-black font-extrabold text-sm disabled:opacity-60"
          >
            {saving ? 'Guardando…' : 'Guardar duración por default'}
          </button>
        </div>

        <div className="glass-card rounded-3xl p-5 border border-white/10 opacity-90">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Link2 className="w-5 h-5 text-slate-200" />
              <div className="text-white font-extrabold">Link para Vender LucIAna Music</div>
            </div>
            <span className="text-[10px] px-2 py-1 rounded-full bg-amber-400/15 text-amber-200 font-extrabold">Próximamente</span>
          </div>
          <div className="mt-2 text-sm text-slate-400">
            Esta opción todavía no tiene funcionalidad.
          </div>
        </div>
      </div>

      <div className="glass-card rounded-3xl p-5 border border-white/10">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-white font-extrabold">Mis Cuentas Regresivas Activas</div>
            <div className="text-slate-400 text-sm">Aquí puedes desbloquear manualmente un preview cuando el cliente ya pagó.</div>
          </div>
          <button
            onClick={() => loadItems().catch(() => {})}
            className="h-10 px-4 rounded-full bg-white/5 border border-white/10 text-slate-200 font-semibold text-sm"
          >
            Actualizar
          </button>
        </div>

        {loading || itemsLoading ? (
          <div className="mt-4 text-slate-400 text-sm">Cargando…</div>
        ) : items.length === 0 ? (
          <div className="mt-4 text-slate-400 text-sm">Todavía no has creado previews con cuenta regresiva.</div>
        ) : (
          <div className="mt-4 space-y-3">
            {items.map((item) => {
              void tick;
              return (
                <div key={item.id} className="glass-card rounded-2xl p-4 border border-white/10 flex items-center gap-3">
                  <div className="w-14 h-14 rounded-2xl overflow-hidden bg-white/5 border border-white/10 shrink-0">
                    {item.coverUrl ? <img src={item.coverUrl} alt="" className="w-full h-full object-cover" /> : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-white font-extrabold truncate">{item.title || 'Canción'}</div>
                    <div className="text-slate-400 text-xs truncate">{item.clientLabel || 'Sin nombre de cliente'}</div>
                    <div className="mt-1 text-[11px] text-slate-500">
                      {item.isPaid ? 'Pagado' : formatRemaining(item.expiresAt)}
                    </div>
                  </div>
                  <div className="shrink-0 flex items-center gap-2">
                    <button
                      onClick={() => copyLink(item.url).catch(() => {})}
                      className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-200"
                      title="Copiar link"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                      className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-200"
                      title="Abrir preview"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                    {item.isPaid ? (
                      <div className="h-10 px-4 rounded-full bg-emerald-500/15 border border-emerald-400/20 text-emerald-200 font-extrabold text-xs flex items-center gap-2">
                        <BadgeCheck className="w-4 h-4" /> Pagado
                      </div>
                    ) : (
                      <button
                        onClick={() => markPaid(item.id).catch(() => {})}
                        className="h-10 px-4 rounded-full bg-white text-black font-extrabold text-xs"
                      >
                        Marcar como pagado
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {error ? <div className="mt-4 text-sm text-red-300">{error}</div> : null}
      </div>
    </div>
  );
}
