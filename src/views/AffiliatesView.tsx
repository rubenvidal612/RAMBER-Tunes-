import { useEffect, useMemo, useState } from 'react';
import { Copy, RefreshCw, Users, Search, Wallet } from 'lucide-react';
import { getAccessToken } from '@/lib/supabaseBrowser';
import { cn } from '@/lib/utils';

type AffiliateMeResponse = {
  ok: boolean;
  code: string;
  link: string;
  plan_active: boolean;
  is_admin?: boolean;
  payout_email: string | null;
  stats: {
    referrals_total: number;
    referrals_active: number;
    commissions_paid_mxn: number;
    commissions_pending_mxn: number;
    commissions_blocked_mxn: number;
  };
  active_referrals: Array<{ user_id: string; full_name: string }>;
};

export function AffiliatesView() {
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState<AffiliateMeResponse | null>(null);
  const [isListOpen, setIsListOpen] = useState(true);
  const [search, setSearch] = useState('');
  const [payoutEmail, setPayoutEmail] = useState('');

  const CACHE_KEY = 'ramber.affiliates_cache_v1';

  const load = async (silent?: boolean) => {
    if (!silent) setIsLoading(true);
    setError('');
    try {
      const t = await getAccessToken();
      if (!t.ok) {
        setError(t.error || 'No se pudo iniciar sesión.');
        return;
      }
      const r = await fetch('/api/affiliates/me', { headers: { authorization: `Bearer ${t.token}` } });
      const out = (await r.json().catch(() => null)) as AffiliateMeResponse | null;
      if (!r.ok || !out?.ok) {
        setError((out as any)?.error || 'No se pudo cargar Afiliados.');
        return;
      }
      setData(out);
      setPayoutEmail((out.payout_email || '').toString());
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), data: out }));
      } catch {}
    } catch {
      setError('No se pudo cargar Afiliados.');
    } finally {
      if (!silent) setIsLoading(false);
    }
  };

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const cached = parsed?.data;
        if (cached?.ok && typeof cached?.link === 'string') {
          setData(cached);
          setPayoutEmail((cached.payout_email || '').toString());
        }
      }
    } catch {}
    load(true).catch(() => {});
  }, []);

  const filtered = useMemo(() => {
    const list = data?.active_referrals || [];
    const q = (search || '').toString().trim().toLowerCase();
    if (!q) return list;
    return list.filter((x) => (x.full_name || '').toString().toLowerCase().includes(q));
  }, [data, search]);

  const copy = async (text: string) => {
    const t = (text || '').toString();
    if (!t) return;
    try {
      await navigator.clipboard.writeText(t);
      alert('Copiado.');
      return;
    } catch {}
    try {
      const ta = document.createElement('textarea');
      ta.value = t;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand('copy');
      ta.remove();
      alert('Copiado.');
    } catch {
      alert('No pude copiar. Copia manualmente.');
    }
  };

  const savePayoutEmail = async () => {
    setIsSaving(true);
    setError('');
    try {
      const t = await getAccessToken();
      if (!t.ok) {
        setError(t.error || 'No se pudo iniciar sesión.');
        return;
      }
      const r = await fetch('/api/affiliates/payout-email', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${t.token}` },
        body: JSON.stringify({ payoutEmail }),
      });
      const out = await r.json().catch(() => ({}));
      if (!r.ok || !out?.ok) {
        setError(out?.error || 'No se pudo guardar.');
        return;
      }
      await load().catch(() => {});
      alert('Guardado.');
    } catch {
      setError('No se pudo guardar.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col p-4 md:p-6 overflow-y-auto">
      <div className="max-w-[720px] mx-auto w-full space-y-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white">Afiliados</h1>
            <p className="text-sm text-slate-300 mt-1">
              Comparte tu link. Por cada pago aprobado de un usuario referido, ganas $100 MXN.
            </p>
          </div>
          <button
            onClick={() => load().catch(() => {})}
            disabled={isLoading}
            className="shrink-0 w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-200 hover:bg-white/10 transition-colors disabled:opacity-60"
            title="Actualizar"
          >
            <RefreshCw className={cn('w-4 h-4', isLoading ? 'animate-spin' : '')} />
          </button>
        </div>

        {error ? (
          <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 text-red-200 text-sm">
            {error}
          </div>
        ) : null}

        <div className="glass-card rounded-3xl border border-white/10 p-5">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="text-white font-extrabold">Tu link de afiliado</div>
            <button
              onClick={() => copy(data?.link || '')}
              disabled={!data?.link}
              className="bg-white/5 hover:bg-white/10 border border-white/10 px-4 py-2 rounded-full text-sm font-semibold text-slate-200 transition-colors flex items-center gap-2 disabled:opacity-60"
            >
              <Copy className="w-4 h-4" />
              Copiar
            </button>
          </div>
          <div className="bg-black/20 border border-white/10 rounded-2xl px-4 py-3 text-sm text-slate-200 break-all">
            {data?.link || 'Cargando…'}
          </div>
          {!data?.plan_active && !data?.is_admin ? (
            <div className="mt-3 bg-yellow-500/10 border border-yellow-500/30 rounded-2xl p-4 text-yellow-200 text-sm">
              Tu plan está inactivo. Mientras esté inactivo, no se generan comisiones.
            </div>
          ) : null}
        </div>

        <div className="glass-card rounded-3xl border border-white/10 p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-100">
              <Wallet className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <div className="text-white font-extrabold">Cobro de comisiones</div>
              <div className="text-xs text-slate-300">Pon tu correo de Mercado Pago para recibir el pago automático</div>
            </div>
          </div>
          <div className="flex flex-col md:flex-row gap-3">
            <input
              value={payoutEmail}
              onChange={(e) => setPayoutEmail(e.target.value)}
              placeholder="Correo de Mercado Pago"
              className="flex-1 bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-white placeholder:text-slate-500 outline-none focus:border-emerald-500/50 transition-colors"
            />
            <button
              onClick={() => savePayoutEmail().catch(() => {})}
              disabled={isSaving}
              className="bg-emerald-500 hover:bg-emerald-400 text-black rounded-2xl px-5 py-3 font-extrabold text-sm disabled:opacity-60"
            >
              {isSaving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>

        <div className="glass-card rounded-3xl border border-white/10 p-5">
          <button onClick={() => setIsListOpen((v) => !v)} className="w-full flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-100">
                <Users className="w-6 h-6" />
              </div>
              <div className="min-w-0 text-left">
                <div className="text-white font-extrabold">Personas registradas (activas)</div>
                <div className="text-xs text-slate-300">
                  {data?.stats ? `${data.stats.referrals_active}/${data.stats.referrals_total}` : '—'} activos
                </div>
              </div>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-full px-4 py-2 text-xs font-extrabold text-slate-200 hover:bg-white/10 transition-colors">
              {isListOpen ? 'Ocultar' : 'Ver'}
            </div>
          </button>

          {isListOpen ? (
            <div className="mt-4">
              <div className="relative mb-3">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por nombre…"
                  className="w-full bg-white/5 border border-white/10 rounded-2xl pl-11 pr-4 py-3 text-white placeholder:text-slate-500 outline-none focus:border-emerald-500/50 transition-colors"
                />
              </div>

              {filtered.length === 0 ? (
                <div className="text-slate-400 text-sm py-6 text-center">No hay usuarios activos en tu lista.</div>
              ) : (
                <div className="space-y-2">
                  {filtered.slice(0, 80).map((u) => (
                    <div key={u.user_id} className="bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-slate-200">
                      {u.full_name}
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="bg-black/20 border border-white/10 rounded-2xl p-4">
                  <div className="text-xs text-slate-400 font-semibold">Comisiones pagadas</div>
                  <div className="text-white font-extrabold">${Number(data?.stats?.commissions_paid_mxn ?? 0).toFixed(0)} MXN</div>
                </div>
                <div className="bg-black/20 border border-white/10 rounded-2xl p-4">
                  <div className="text-xs text-slate-400 font-semibold">Comisiones pendientes</div>
                  <div className="text-white font-extrabold">${Number(data?.stats?.commissions_pending_mxn ?? 0).toFixed(0)} MXN</div>
                </div>
                <div className="bg-black/20 border border-white/10 rounded-2xl p-4">
                  <div className="text-xs text-slate-400 font-semibold">Comisiones bloqueadas</div>
                  <div className="text-white font-extrabold">${Number(data?.stats?.commissions_blocked_mxn ?? 0).toFixed(0)} MXN</div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
