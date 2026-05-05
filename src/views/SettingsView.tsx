import { useEffect, useState } from 'react';
import { ChevronRight, Share, HelpCircle, MessageSquare, FileText, Shield, RefreshCw } from 'lucide-react';
import { useUserCredits } from '@/hooks/useUserCredits';
import { signInWithGoogle, supabaseBrowser } from '@/lib/supabaseBrowser';
import { cn } from '@/lib/utils';

export function SettingsView({ onClose, onOpenPricing }: { onClose: () => void; onOpenPricing?: () => void }) {
  const [isAuthBusy, setIsAuthBusy] = useState(false);
  const { credits, refreshCredits } = useUserCredits();
  const [userName, setUserName] = useState('Usuario');
  const [userInitial, setUserInitial] = useState('U');
  const [isAdmin, setIsAdmin] = useState(false);
  const [isStartingLogin, setIsStartingLogin] = useState(false);
  const [isOfficeOpen, setIsOfficeOpen] = useState(false);
  const [officeLoading, setOfficeLoading] = useState(false);
  const [officeError, setOfficeError] = useState('');
  const [officeData, setOfficeData] = useState<any>(null);
  const [grantEmail, setGrantEmail] = useState('');
  const [grantCredits, setGrantCredits] = useState('50');
  const [grantBusy, setGrantBusy] = useState(false);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [feedbackName, setFeedbackName] = useState('');
  const [feedbackWhatsapp, setFeedbackWhatsapp] = useState('');
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackBusy, setFeedbackBusy] = useState(false);
  const [adminUnreadFeedback, setAdminUnreadFeedback] = useState(0);
  const [planEmail, setPlanEmail] = useState('');
  const [planKey, setPlanKey] = useState<'ninguno' | 'gratis' | 'inicio' | 'productor'>('inicio');
  const [planCreditsMode, setPlanCreditsMode] = useState<'none' | 'default' | 'set'>('none');
  const [planCreditsManual, setPlanCreditsManual] = useState('0');
  const [planBusy, setPlanBusy] = useState(false);
  const [isUsersOpen, setIsUsersOpen] = useState(false);
  const [usersSearch, setUsersSearch] = useState('');
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState('');
  const [usersList, setUsersList] = useState<Array<{ id: string; email: string; created_at: string }>>([]);
  const [usersTotal, setUsersTotal] = useState<number | null>(null);

  useEffect(() => {
    if (!supabaseBrowser) return;
    supabaseBrowser.auth
      .getUser()
      .then(({ data }) => {
        const email = (data?.user?.email || '').toString().trim().toLowerCase();
        if (email === 'rubenfiverr612@gmail.com') setIsAdmin(true);
      })
      .catch(() => {});

    supabaseBrowser.auth
      .getSession()
      .then(async ({ data }) => {
        const token = data?.session?.access_token;
        if (!token) return;
        const r = await fetch('/api/account/balance', { headers: { authorization: `Bearer ${token}` } }).catch(() => null as any);
        if (!r?.ok) return;
        const out = await r.json().catch(() => ({}));
        setIsAdmin((prev) => prev || Boolean(out?.is_admin));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!supabaseBrowser) return;
    supabaseBrowser.auth
      .getUser()
      .then(({ data }) => {
        const user = data?.user;
        const email = (user?.email || '').toString().trim();
        if (email.toLowerCase() === 'rubenfiverr612@gmail.com') setIsAdmin(true);
        const meta: any = user?.user_metadata || {};
        const name = (meta?.full_name || meta?.name || '').toString().trim();
        const display = (name || email || 'Usuario').toString().trim();
        setUserName(display);
        setUserInitial(display.slice(0, 1).toUpperCase() || 'U');
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!supabaseBrowser) return;
    if (!isAdmin) return;
    let alive = true;
    const load = async () => {
      try {
        const { data } = await supabaseBrowser.auth.getSession();
        const token = data?.session?.access_token;
        if (!token) return;
        const r = await fetch('/api/admin/feedback?mode=count', { headers: { authorization: `Bearer ${token}` } }).catch(() => null as any);
        if (!r?.ok) return;
        const out = await r.json().catch(() => ({}));
        if (!alive) return;
        setAdminUnreadFeedback(Number(out?.unread_count ?? 0) || 0);
      } catch {
      }
    };
    load().catch(() => {});
    const id = window.setInterval(() => load().catch(() => {}), 15000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [isAdmin]);

  const signOut = async () => {
    if (!supabaseBrowser) return;
    setIsAuthBusy(true);
    try {
      await supabaseBrowser.auth.signOut().catch(() => {});
      await refreshCredits();
      alert('Sesión cerrada.');
    } finally {
      setIsAuthBusy(false);
    }
  };

  const openOffice = async () => {
    if (!supabaseBrowser) return;
    setIsOfficeOpen(true);
    setOfficeError('');
    setOfficeData(null);
    setOfficeLoading(true);
    try {
      const { data } = await supabaseBrowser.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) {
        setOfficeError('No se pudo iniciar sesión.');
        return;
      }
      const r = await fetch('/api/admin/stats', { headers: { authorization: `Bearer ${token}` } });
      const out = await r.json().catch(() => ({}));
      if (!r.ok) {
        setOfficeError((out?.error || 'No pude cargar tu reporte.').toString());
        return;
      }

      let balance: any = null;
      try {
        const rb = await fetch('/api/account/balance', { headers: { authorization: `Bearer ${token}` } });
        const ob = await rb.json().catch(() => ({}));
        if (rb.ok) balance = ob;
        else balance = { error: ob?.error || 'No pude consultar saldo.' };
      } catch {
        balance = { error: 'No pude consultar saldo.' };
      }

      let diag: any = null;
      try {
        const rd = await fetch('/api/admin/diag', { headers: { authorization: `Bearer ${token}` } });
        const od = await rd.json().catch(() => ({}));
        if (rd.ok) diag = od;
        else diag = { error: od?.error || 'No pude diagnosticar.' };
      } catch {
        diag = { error: 'No pude diagnosticar.' };
      }

      let feedback: any = null;
      try {
        const rf = await fetch('/api/admin/feedback', { headers: { authorization: `Bearer ${token}` } });
        const of = await rf.json().catch(() => ({}));
        if (rf.ok) feedback = of;
        else feedback = { error: of?.error || 'No pude cargar mensajes.' };
      } catch {
        feedback = { error: 'No pude cargar mensajes.' };
      }

      const unread = Number(feedback?.unread_count ?? 0) || 0;
      setAdminUnreadFeedback(unread);
      setOfficeData({ ...out, balance, diag, feedback });
    } finally {
      setOfficeLoading(false);
    }
  };

  const grant = async () => {
    if (!supabaseBrowser) return;
    const email = (grantEmail || '').toString().trim().toLowerCase();
    const n = Number((grantCredits || '').toString().trim().replaceAll(',', '.'));
    if (!email) {
      alert('Pon el correo del usuario.');
      return;
    }
    if (!Number.isFinite(n) || n <= 0) {
      alert('Pon una cantidad válida de créditos.');
      return;
    }
    setGrantBusy(true);
    try {
      const { data } = await supabaseBrowser.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) {
        alert('No se pudo iniciar sesión.');
        return;
      }
      const r = await fetch('/api/admin/grant-credits', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ email, credits: n }),
      });
      const out = await r.json().catch(() => ({}));
      if (!r.ok) {
        const msg = (out?.error || 'No pude enviar créditos.').toString();
        const detail = (out?.detail || '').toString();
        alert([msg, detail].filter(Boolean).join('\n'));
        return;
      }
      alert(`Listo. Se enviaron ${n} créditos a ${email}.`);
      openOffice().catch(() => {});
    } finally {
      setGrantBusy(false);
    }
  };

  const submitFeedback = async () => {
    if (!supabaseBrowser) return;
    const name = feedbackName.trim();
    const whatsapp = feedbackWhatsapp.trim();
    const text = feedbackText.trim();
    if (!name) {
      alert('Pon tu nombre.');
      return;
    }
    if (!whatsapp) {
      alert('Pon tu WhatsApp.');
      return;
    }
    if (!text) {
      alert('Escribe tu mensaje.');
      return;
    }
    setFeedbackBusy(true);
    try {
      const { data } = await supabaseBrowser.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) {
        alert('No se pudo iniciar sesión.');
        return;
      }
      const r = await fetch('/api/support/feedback', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ name, whatsapp, message: text }),
      });
      const out = await r.json().catch(() => ({}));
      if (!r.ok) {
        alert((out?.error || 'No pude enviar tu mensaje.').toString());
        return;
      }
      alert('Listo. Recibimos tu mensaje.');
      setIsFeedbackOpen(false);
      setFeedbackText('');
    } finally {
      setFeedbackBusy(false);
    }
  };

  const setPlan = async () => {
    if (!supabaseBrowser) return;
    const email = planEmail.trim().toLowerCase();
    if (!email) {
      alert('Pon el correo del usuario.');
      return;
    }
    const manual = Number(planCreditsManual);
    if (planCreditsMode === 'set' && (!Number.isFinite(manual) || manual < 0)) {
      alert('Créditos manuales inválidos.');
      return;
    }
    setPlanBusy(true);
    try {
      const { data } = await supabaseBrowser.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) {
        alert('No se pudo iniciar sesión.');
        return;
      }
      const r = await fetch('/api/admin/set-plan', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({
          email,
          plan_key: planKey,
          credits_mode: planCreditsMode,
          credits: planCreditsMode === 'set' ? manual : undefined,
        }),
      });
      const out = await r.json().catch(() => ({}));
      if (!r.ok) {
        const msg = (out?.error || 'No pude cambiar el plan.').toString();
        const detail = (out?.detail || '').toString();
        alert([msg, detail].filter(Boolean).join('\n'));
        return;
      }
      alert('Listo. Se actualizó el plan.');
      openOffice().catch(() => {});
    } finally {
      setPlanBusy(false);
    }
  };

  const markFeedbackRead = async (id: string) => {
    if (!supabaseBrowser) return;
    const clean = (id || '').toString().trim();
    if (!clean) return;
    try {
      const { data } = await supabaseBrowser.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) return;
      await fetch('/api/admin/feedback-mark-read', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: clean }),
      }).catch(() => null as any);
      openOffice().catch(() => {});
    } catch {
    }
  };

  const loadUsers = async (search: string) => {
    if (!supabaseBrowser) return;
    setUsersLoading(true);
    setUsersError('');
    try {
      const { data } = await supabaseBrowser.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) {
        setUsersError('No se pudo iniciar sesión.');
        return;
      }
      const url = `/api/admin/users?limit=200&search=${encodeURIComponent((search || '').toString())}`;
      const r = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
      const text = await r.text().catch(() => '');
      let out: any = {};
      try {
        out = text ? JSON.parse(text) : {};
      } catch {
        out = {};
      }
      if (!r.ok) {
        const msg = (out?.error || '').toString().trim() || `No pude cargar usuarios (HTTP ${r.status}).`;
        const detail = (out?.detail || '').toString().trim();
        const raw = !out?.error && !out?.detail ? text.slice(0, 200).trim() : '';
        setUsersError([msg, detail, raw].filter(Boolean).join('\n'));
        return;
      }
      const items = Array.isArray(out?.items) ? out.items : [];
      setUsersTotal(typeof out?.total === 'number' ? out.total : null);
      setUsersList(
        items
          .map((x: any) => ({
            id: String(x?.id || ''),
            email: String(x?.email || ''),
            created_at: String(x?.created_at || ''),
          }))
          .filter((x: any) => x.email)
      );
    } finally {
      setUsersLoading(false);
    }
  };

  if (isOfficeOpen) {
    const users = officeData?.users || {};
    const payments = officeData?.payments || {};
    const daily = Array.isArray(payments?.daily_7d) ? payments.daily_7d : [];
    const balance = officeData?.balance || {};
    const diag = officeData?.diag || {};
    const feedback = officeData?.feedback || {};
    const feedbackItems = Array.isArray(feedback?.items) ? feedback.items : [];
    return (
      <div className="flex flex-col overflow-y-auto animate-in slide-in-from-right-8 duration-300 z-[100] bg-gradient-to-b from-[#0b1224] via-[#070a12] to-black/95 backdrop-blur-3xl fixed inset-0 pb-safe">
        <div className="flex items-center gap-4 p-4 sticky top-0 bg-gradient-to-r from-black/40 via-indigo-950/40 to-black/30 z-10 backdrop-blur-xl border-b border-white/10">
          <button onClick={() => setIsOfficeOpen(false)} className="p-2 text-slate-300 hover:text-white glass-card rounded-full">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6"><path d="M15 18l-6-6 6-6"></path></svg>
          </button>
          <div className="text-white font-extrabold">OFICINA</div>
        </div>

        <div className="p-6 space-y-6 max-w-3xl mx-auto w-full">
          {officeError && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 text-sm text-red-200">
              {officeError}
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-gradient-to-br from-emerald-500/20 to-transparent border border-emerald-400/15 rounded-2xl p-4">
              <div className="text-xs text-slate-200/80 font-semibold">Usuarios</div>
              <div className="text-2xl font-extrabold text-white mt-1">{Number(users?.total ?? 0)}</div>
              <div className="text-[11px] text-slate-300/80 mt-1">Activos 30d: {Number(users?.active30d ?? 0)}</div>
            </div>
            <div className="bg-gradient-to-br from-cyan-500/20 to-transparent border border-cyan-400/15 rounded-2xl p-4">
              <div className="text-xs text-slate-200/80 font-semibold">Registros</div>
              <div className="text-2xl font-extrabold text-white mt-1">{Number(users?.new7d ?? 0)}</div>
              <div className="text-[11px] text-slate-300/80 mt-1">Últimos 7 días</div>
            </div>
            <div className="bg-gradient-to-br from-yellow-500/25 to-transparent border border-yellow-400/15 rounded-2xl p-4">
              <div className="text-xs text-slate-200/80 font-semibold">Ventas (hoy)</div>
              <div className="text-2xl font-extrabold text-white mt-1">${Number(payments?.today?.mxn ?? 0).toFixed(0)}</div>
              <div className="text-[11px] text-slate-300/80 mt-1">{Number(payments?.today?.count ?? 0)} pagos</div>
            </div>
            <div className="bg-gradient-to-br from-violet-500/20 to-transparent border border-violet-400/15 rounded-2xl p-4">
              <div className="text-xs text-slate-200/80 font-semibold">Mes</div>
              <div className="text-2xl font-extrabold text-white mt-1">${Number(payments?.month?.mxn ?? 0).toFixed(0)}</div>
              <div className="text-[11px] text-slate-300/80 mt-1">{Number(payments?.month?.count ?? 0)} pagos</div>
            </div>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-3xl p-5">
            <button
              onClick={() => {
                setIsUsersOpen((v) => {
                  const next = !v;
                  if (!v && usersList.length === 0 && !usersLoading) loadUsers(usersSearch).catch(() => {});
                  return next;
                });
              }}
              className="w-full flex items-center justify-between"
            >
              <div>
                <div className="text-white font-extrabold">Correos de usuarios</div>
                <div className="text-[11px] text-slate-400 mt-1">
                  Registros: {Number(users?.total ?? 0)}
                  {usersTotal != null ? ` (Auth: ${usersTotal})` : ''}
                </div>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-full px-4 py-2 text-xs font-extrabold text-slate-200 hover:bg-white/10 transition-colors">
                {isUsersOpen ? 'Ocultar' : 'Ver'}
              </div>
            </button>

            {isUsersOpen ? (
              <div className="mt-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <input
                    value={usersSearch}
                    onChange={(e) => setUsersSearch(e.target.value)}
                    placeholder="Buscar correo…"
                    className="bg-black/20 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-slate-500 outline-none focus:border-white/20 md:col-span-2"
                  />
                  <button
                    onClick={() => loadUsers(usersSearch).catch(() => {})}
                    disabled={usersLoading}
                    className="bg-emerald-500 hover:bg-emerald-400 text-black rounded-2xl px-4 py-3 font-extrabold text-sm disabled:opacity-60"
                  >
                    {usersLoading ? 'Buscando…' : 'Buscar'}
                  </button>
                </div>

                {usersError ? (
                  <div className="mt-3 bg-red-500/10 border border-red-500/20 rounded-2xl p-3 text-sm text-red-200">{usersError}</div>
                ) : null}

                <div className="mt-3 text-[11px] text-slate-400">Mostrando: {usersList.length} correos</div>

                <div className="mt-3 max-h-[320px] overflow-y-auto rounded-2xl border border-white/10">
                  <div className="grid grid-cols-1 divide-y divide-white/5">
                    {usersList.length === 0 ? (
                      <div className="p-4 text-sm text-slate-400">{usersLoading ? 'Cargando…' : 'No encontré usuarios con esa búsqueda.'}</div>
                    ) : (
                      usersList.map((u) => {
                        let dateLabel = '';
                        try {
                          const d = new Date(u.created_at);
                          if (!Number.isNaN(d.getTime())) dateLabel = d.toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: '2-digit' });
                        } catch {
                          dateLabel = '';
                        }
                        return (
                          <div key={u.id || u.email} className="p-4 flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-slate-100 font-semibold truncate">{u.email}</div>
                              <div className="text-[11px] text-slate-500 truncate">{dateLabel ? `Registro: ${dateLabel}` : '—'}</div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <div className="bg-white/5 border border-white/10 rounded-3xl p-5">
            <div className="text-white font-extrabold">Reporte</div>
            <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="bg-black/20 border border-white/10 rounded-2xl p-4">
                <div className="text-xs text-slate-300 font-semibold">Semana</div>
                <div className="text-xl text-white font-extrabold mt-1">${Number(payments?.week?.mxn ?? 0).toFixed(0)}</div>
                <div className="text-[11px] text-slate-400 mt-1">{Number(payments?.week?.count ?? 0)} pagos</div>
              </div>
              <div className="bg-black/20 border border-white/10 rounded-2xl p-4">
                <div className="text-xs text-slate-300 font-semibold">Mes</div>
                <div className="text-xl text-white font-extrabold mt-1">${Number(payments?.month?.mxn ?? 0).toFixed(0)}</div>
                <div className="text-[11px] text-slate-400 mt-1">{Number(payments?.month?.count ?? 0)} pagos</div>
              </div>
              <div className="bg-black/20 border border-white/10 rounded-2xl p-4">
                <div className="text-xs text-slate-300 font-semibold">Total</div>
                <div className="text-xl text-white font-extrabold mt-1">${Number(payments?.all?.mxn ?? 0).toFixed(0)}</div>
                <div className="text-[11px] text-slate-400 mt-1">{Number(payments?.all?.count ?? 0)} pagos</div>
              </div>
            </div>
            <button
              onClick={() => openOffice().catch(() => {})}
              disabled={officeLoading}
              className="mt-4 w-full bg-white/5 border border-white/10 rounded-full py-3 text-slate-200 font-semibold hover:bg-white/10 transition-colors disabled:opacity-60"
            >
              {officeLoading ? 'Actualizando…' : 'Actualizar'}
            </button>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-3xl p-5">
            <div className="flex items-center justify-between">
              <div className="text-white font-extrabold">Ventas por día</div>
              <div className="text-[11px] text-slate-400">Últimos 7 días</div>
            </div>
            <div className="mt-3 overflow-hidden rounded-2xl border border-white/10">
              <div className="grid grid-cols-3 bg-black/30 px-4 py-2 text-[11px] text-slate-300 font-semibold">
                <div>Día</div>
                <div className="text-center">Pagos</div>
                <div className="text-right">MXN</div>
              </div>
              <div className="divide-y divide-white/5">
                {(daily.length ? daily : new Array(7).fill(null)).map((row: any, idx: number) => {
                  const day = (row?.day || '').toString();
                  const count = Number(row?.count ?? 0);
                  const mxn = Number(row?.mxn ?? 0);
                  const bg =
                    idx % 3 === 0
                      ? 'from-emerald-500/10'
                      : idx % 3 === 1
                        ? 'from-cyan-500/10'
                        : 'from-violet-500/10';
                  return (
                    <div key={day || idx} className={`grid grid-cols-3 px-4 py-3 text-sm bg-gradient-to-r ${bg} to-transparent`}>
                      <div className="text-slate-200 font-semibold">{day || '—'}</div>
                      <div className="text-center text-slate-300">{Number.isFinite(count) ? count : 0}</div>
                      <div className="text-right text-white font-extrabold">${Number.isFinite(mxn) ? mxn.toFixed(0) : '0'}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-3xl p-5">
            <div className="flex items-center justify-between">
              <div className="text-white font-extrabold">Diagnóstico de saldo</div>
              <div className="text-[11px] text-slate-400">{(balance?.source || '').toString() || '—'}</div>
            </div>
            {balance?.error ? (
              <div className="mt-3 bg-red-500/10 border border-red-500/20 rounded-2xl p-3 text-sm text-red-200">
                {(balance?.error || 'No pude consultar saldo.').toString()}
              </div>
            ) : (
              <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="bg-black/20 border border-white/10 rounded-2xl p-4">
                  <div className="text-xs text-slate-300 font-semibold">Créditos mostrados</div>
                  <div className="text-xl text-white font-extrabold mt-1">{Number(balance?.credits ?? 0).toString()}</div>
                </div>
                <div className="bg-black/20 border border-white/10 rounded-2xl p-4">
                  <div className="text-xs text-slate-300 font-semibold">Créditos internos</div>
                  <div className="text-xl text-white font-extrabold mt-1">{Number(balance?.internal_credits ?? 0).toString()}</div>
                </div>
                <div className="bg-black/20 border border-white/10 rounded-2xl p-4">
                  <div className="text-xs text-slate-300 font-semibold">Créditos proveedor</div>
                  <div className="text-xl text-white font-extrabold mt-1">{balance?.provider_credits == null ? '—' : Number(balance?.provider_credits ?? 0).toString()}</div>
                </div>
              </div>
            )}
            {balance?.provider_error ? (
              <div className="mt-3 text-[11px] text-slate-400">
                Proveedor: {(balance?.provider_error || '').toString()}
              </div>
            ) : null}
            {diag?.error ? (
              <div className="mt-3 text-[11px] text-slate-400">
                Diagnóstico: {(diag?.error || '').toString()}
              </div>
            ) : diag?.provider || diag?.env ? (
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="bg-black/20 border border-white/10 rounded-2xl p-4">
                  <div className="text-xs text-slate-300 font-semibold">Variables (Vercel)</div>
                  <div className="mt-2 space-y-1 text-[11px] text-slate-300">
                    <div>SUPABASE_URL: {diag?.env?.has_supabase_url ? 'OK' : 'FALTA'}</div>
                    <div>SUPABASE_ANON_KEY: {diag?.env?.has_supabase_anon ? 'OK' : 'FALTA'}</div>
                    <div>SUPABASE_SERVICE_ROLE_KEY: {diag?.env?.has_supabase_service ? 'OK' : 'FALTA'}</div>
                    <div>SUNO_API_BASE_URL: {diag?.env?.has_suno_base ? 'OK' : 'FALTA'}</div>
                    <div>SUNO_API_KEY: {diag?.env?.has_suno_key ? 'OK' : 'FALTA'}</div>
                  </div>
                </div>
                <div className="bg-black/20 border border-white/10 rounded-2xl p-4">
                  <div className="text-xs text-slate-300 font-semibold">Prueba proveedor</div>
                  <div className="mt-2 text-[11px] text-slate-300">
                    <div>HTTP: {Number(diag?.provider?.status ?? 0).toString() || '—'}</div>
                    <div>code: {diag?.provider?.code == null ? '—' : Number(diag?.provider?.code ?? 0).toString()}</div>
                    <div>credits: {diag?.provider?.credits == null ? '—' : Number(diag?.provider?.credits ?? 0).toString()}</div>
                  </div>
                  {diag?.provider?.error ? (
                    <div className="mt-2 text-[11px] text-red-200">{String(diag?.provider?.error || '').slice(0, 200)}</div>
                  ) : diag?.provider?.text ? (
                    <div className="mt-2 text-[11px] text-slate-400 break-words">{String(diag?.provider?.text || '').slice(0, 240)}</div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>

          <div className="bg-white/5 border border-white/10 rounded-3xl p-5">
            <div className="flex items-center justify-between">
              <div className="text-white font-extrabold">Mensajes</div>
              <div className="text-[11px] text-slate-400">{Number(feedback?.unread_count ?? 0) ? `${Number(feedback?.unread_count ?? 0)} sin leer` : '—'}</div>
            </div>
            {feedback?.error ? (
              <div className="mt-3 bg-red-500/10 border border-red-500/20 rounded-2xl p-3 text-sm text-red-200">
                {(feedback?.error || 'No pude cargar mensajes.').toString()}
              </div>
            ) : feedbackItems.length === 0 ? (
              <div className="mt-3 text-sm text-slate-400">Aún no hay mensajes.</div>
            ) : (
              <div className="mt-3 space-y-3">
                {feedbackItems.slice(0, 30).map((m: any) => {
                  const id = String(m?.id || '');
                  const name = String(m?.name || 'Usuario');
                  const whatsapp = String(m?.whatsapp || '');
                  const msg = String(m?.message || '');
                  const isRead = Boolean(m?.is_read);
                  const createdAt = String(m?.created_at || '');
                  let dateLabel = createdAt;
                  try {
                    const d = new Date(createdAt);
                    if (!Number.isNaN(d.getTime())) dateLabel = d.toLocaleString('es-MX', { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
                  } catch {
                  }
                  return (
                    <div key={id} className={cn('bg-black/20 border border-white/10 rounded-2xl p-4', !isRead ? 'ring-1 ring-emerald-500/30' : '')}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-white font-extrabold truncate">{name}</div>
                          <div className="text-[11px] text-slate-400 truncate">{whatsapp ? `WhatsApp: ${whatsapp}` : '—'}</div>
                        </div>
                        <div className="text-[11px] text-slate-400 shrink-0">{dateLabel}</div>
                      </div>
                      <div className="mt-3 text-sm text-slate-200 whitespace-pre-wrap break-words">{msg}</div>
                      {!isRead && id ? (
                        <button
                          onClick={() => markFeedbackRead(id)}
                          className="mt-3 bg-emerald-500 hover:bg-emerald-400 text-black rounded-full px-4 py-2 text-xs font-extrabold transition-colors"
                        >
                          Marcar como leído
                        </button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="bg-white/5 border border-white/10 rounded-3xl p-5">
            <div className="text-white font-extrabold">Enviar créditos</div>
            <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
              <input
                value={grantEmail}
                onChange={(e) => setGrantEmail(e.target.value)}
                placeholder="correo@gmail.com"
                className="bg-black/20 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-slate-500 outline-none focus:border-white/20"
              />
              <input
                value={grantCredits}
                onChange={(e) => setGrantCredits(e.target.value)}
                placeholder="Créditos"
                className="bg-black/20 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-slate-500 outline-none focus:border-white/20"
              />
              <button
                onClick={() => grant().catch(() => {})}
                disabled={grantBusy}
                className="bg-yellow-400 hover:bg-yellow-300 text-black rounded-2xl px-4 py-3 font-extrabold text-sm disabled:opacity-60"
              >
                {grantBusy ? 'Enviando…' : 'Enviar'}
              </button>
            </div>
            <div className="mt-3 text-[11px] text-slate-400">Solo admin. Se suma al saldo del usuario.</div>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-3xl p-5">
            <div className="text-white font-extrabold">Cambiar plan</div>
            <div className="mt-3 grid grid-cols-1 md:grid-cols-4 gap-3">
              <input
                value={planEmail}
                onChange={(e) => setPlanEmail(e.target.value)}
                placeholder="correo@gmail.com"
                className="bg-black/20 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-slate-500 outline-none focus:border-white/20 md:col-span-2"
              />
              <select
                value={planKey}
                onChange={(e) => setPlanKey(e.target.value as any)}
                className="bg-black/20 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white outline-none focus:border-white/20"
              >
                <option value="ninguno">Sin plan</option>
                <option value="gratis">Gratis</option>
                <option value="inicio">Inicio</option>
                <option value="productor">Productor</option>
              </select>
              <select
                value={planCreditsMode}
                onChange={(e) => setPlanCreditsMode(e.target.value as any)}
                className="bg-black/20 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white outline-none focus:border-white/20"
              >
                <option value="none">No tocar créditos</option>
                <option value="default">Créditos del plan</option>
                <option value="set">Créditos manuales</option>
              </select>
            </div>
            {planCreditsMode === 'set' ? (
              <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
                <input
                  value={planCreditsManual}
                  onChange={(e) => setPlanCreditsManual(e.target.value)}
                  placeholder="Créditos (ej: 500)"
                  className="bg-black/20 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-slate-500 outline-none focus:border-white/20"
                />
                <button
                  onClick={() => setPlan().catch(() => {})}
                  disabled={planBusy}
                  className="bg-emerald-500 hover:bg-emerald-400 text-black rounded-2xl px-4 py-3 font-extrabold text-sm disabled:opacity-60 md:col-span-2"
                >
                  {planBusy ? 'Guardando…' : 'Guardar'}
                </button>
              </div>
            ) : (
              <button
                onClick={() => setPlan().catch(() => {})}
                disabled={planBusy}
                className="mt-3 w-full bg-emerald-500 hover:bg-emerald-400 text-black rounded-2xl px-4 py-3 font-extrabold text-sm disabled:opacity-60"
              >
                {planBusy ? 'Guardando…' : 'Guardar'}
              </button>
            )}
            <div className="mt-3 text-[11px] text-slate-400">
              Esto cambia el plan sin obligar a regalar créditos extra (si eliges “No tocar créditos”). Si eliges “Créditos del plan”, se suman los créditos del paquete.
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col overflow-y-auto animate-in slide-in-from-right-8 duration-300 z-[100] bg-gradient-to-b from-[#0b1224] via-[#070a12] to-black/95 backdrop-blur-3xl fixed inset-0 pb-safe">
      <div className="flex items-center gap-4 p-4 sticky top-0 bg-gradient-to-r from-black/40 via-indigo-950/40 to-black/30 z-10 backdrop-blur-xl border-b border-white/10">
        <button onClick={onClose} className="p-2 text-slate-300 hover:text-white glass-card rounded-full">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6"><path d="M15 18l-6-6 6-6"></path></svg>
        </button>
      </div>

      <div className="p-6 space-y-6 max-w-2xl mx-auto w-full">
        <div className="flex items-center gap-4 mb-2">
          <div className="w-16 h-16 rounded-full bg-white/10 border border-white/10 flex items-center justify-center text-2xl font-extrabold text-white shadow-inner">
            {userInitial}
          </div>
          <h2 className="text-2xl font-bold text-white">{userName}</h2>
        </div>

        <div className="bg-gradient-to-r from-yellow-500/20 to-transparent border border-yellow-400/20 rounded-2xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-yellow-500 flex items-center justify-center text-black font-bold text-xs">♪</div>
            <span className="font-semibold text-slate-200">{credits} Créditos</span>
            <HelpCircle className="w-4 h-4 text-slate-500" />
          </div>
          <button 
            onClick={() => {
              onOpenPricing?.();
              onClose();
            }}
            className="bg-yellow-400 hover:bg-yellow-300 text-black font-extrabold text-xs px-4 py-2 rounded-full transition-colors"
          >
            Obtener más canciones
          </button>
        </div>

        <div className="glass-card rounded-2xl overflow-hidden">
          <button className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors border-b border-white/5">
            <div className="flex items-center gap-3 text-sm font-medium text-slate-200">
              <Share className="w-5 h-5 text-slate-400" /> Compartir RAMBER Tunes
            </div>
            <ChevronRight className="w-5 h-5 text-slate-500" />
          </button>
          <button
            className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors border-b border-white/5"
            onClick={() => window.open('https://t.me/+sgw5bsAX9utmZDEx', '_blank')}
          >
            <div className="flex items-center gap-3 text-sm font-medium text-slate-200">
              <MessageSquare className="w-5 h-5 text-slate-400" /> Grupo de Telegram
            </div>
            <ChevronRight className="w-5 h-5 text-slate-500" />
          </button>
          <button
            className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors"
            onClick={() => {
              setFeedbackName((prev) => prev || userName);
              setIsFeedbackOpen(true);
            }}
          >
            <div className="flex items-center gap-3 text-sm font-medium text-slate-200">
              <span className="text-lg">⭐</span> Ayúdanos a mejorar
            </div>
            <ChevronRight className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {isAdmin && (
          <div className="glass-card rounded-2xl overflow-hidden">
            <button
              className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors"
              onClick={() => openOffice().catch(() => {})}
            >
              <div className="flex items-center gap-3 text-sm font-medium text-slate-200">
                <div className="relative">
                  <Shield className="w-5 h-5 text-yellow-300" />
                  {adminUnreadFeedback > 0 ? <div className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full border-[2px] border-black" /> : null}
                </div>
                OFICINA
              </div>
              <ChevronRight className="w-5 h-5 text-slate-500" />
            </button>
          </div>
        )}

        <div className="glass-card rounded-2xl overflow-hidden">
          <button className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors border-b border-white/5">
            <div className="flex items-center gap-3 text-sm font-medium text-slate-200">
              <HelpCircle className="w-5 h-5 text-slate-400" /> Preguntas frecuentes
            </div>
            <ChevronRight className="w-5 h-5 text-slate-500" />
          </button>
          <button className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors border-b border-white/5">
            <div className="flex items-center gap-3 text-sm font-medium text-slate-200">
              <FileText className="w-5 h-5 text-slate-400" /> Términos de Servicio
            </div>
            <ChevronRight className="w-5 h-5 text-slate-500" />
          </button>
          <button className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors border-b border-white/5">
            <div className="flex items-center gap-3 text-sm font-medium text-slate-200">
              <Shield className="w-5 h-5 text-slate-400" /> Política de Privacidad
            </div>
            <ChevronRight className="w-5 h-5 text-slate-500" />
          </button>
          <button className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors">
            <div className="flex items-center gap-3 text-sm font-medium text-slate-200">
              <RefreshCw className="w-5 h-5 text-slate-400" /> Buscar actualizaciones
            </div>
            <ChevronRight className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {isFeedbackOpen && (
          <div className="fixed inset-0 z-[200] bg-black/70 flex items-end md:items-center justify-center">
            <button className="absolute inset-0 w-full h-full" onClick={() => setIsFeedbackOpen(false)} aria-label="Cerrar" />
            <div className="relative w-full md:max-w-[560px] bg-[#0b0f16] border border-white/10 rounded-t-3xl md:rounded-3xl overflow-hidden shadow-[0_-20px_60px_rgba(0,0,0,0.6)]">
              <div className="p-4 border-b border-white/10 flex items-center justify-between">
                <div className="text-white font-extrabold">Ayúdanos a mejorar</div>
                <button onClick={() => setIsFeedbackOpen(false)} className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-200">
                  ✕
                </button>
              </div>
              <div className="p-5 space-y-3">
                <div>
                  <div className="text-[11px] text-slate-400 font-semibold">Nombre</div>
                  <input
                    value={feedbackName}
                    onChange={(e) => setFeedbackName(e.target.value)}
                    className="mt-2 w-full bg-black/20 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-slate-500 outline-none focus:border-white/20"
                    placeholder="Tu nombre"
                  />
                </div>
                <div>
                  <div className="text-[11px] text-slate-400 font-semibold">WhatsApp</div>
                  <input
                    value={feedbackWhatsapp}
                    onChange={(e) => setFeedbackWhatsapp(e.target.value)}
                    className="mt-2 w-full bg-black/20 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-slate-500 outline-none focus:border-white/20"
                    placeholder="Ej: +52 999 000 0000"
                  />
                </div>
                <div>
                  <div className="text-[11px] text-slate-400 font-semibold">Mensaje</div>
                  <textarea
                    value={feedbackText}
                    onChange={(e) => setFeedbackText(e.target.value)}
                    className="mt-2 w-full bg-black/20 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-slate-500 outline-none focus:border-white/20 min-h-[140px] resize-none"
                    placeholder="Cuéntanos qué mejorar o qué error viste…"
                  />
                </div>
              </div>
              <div className="p-5 border-t border-white/10 flex items-center gap-3">
                <button
                  onClick={() => setIsFeedbackOpen(false)}
                  className="w-[140px] bg-white/5 hover:bg-white/10 text-slate-200 border border-white/10 h-[48px] rounded-full font-extrabold text-sm transition-colors"
                  disabled={feedbackBusy}
                >
                  Cancelar
                </button>
                <button
                  onClick={() => submitFeedback().catch(() => {})}
                  className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-black h-[48px] rounded-full font-extrabold text-sm transition-colors disabled:opacity-60"
                  disabled={feedbackBusy}
                >
                  {feedbackBusy ? 'Enviando…' : 'Enviar'}
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="glass-card rounded-2xl p-4">
          <p className="text-sm font-medium text-slate-200 mb-4">Síguenos</p>
          <div className="flex items-center justify-center gap-4">
            {['youtube', 'tiktok', 'discord', 'x'].map(social => (
              <button key={social} className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-colors uppercase text-[10px] font-bold">
                {social.slice(0, 2)}
              </button>
            ))}
          </div>
        </div>

        <div className="py-4 text-center">
           <button
             onClick={() => {
               if (isStartingLogin) return;
               setIsStartingLogin(true);
               signInWithGoogle()
                 .then((r) => {
                   if (!r.ok) alert(r.error);
                 })
                 .catch(() => alert('No pude iniciar sesión con Google.'))
                 .finally(() => setIsStartingLogin(false));
             }}
             disabled={isStartingLogin}
             className="mb-5 text-slate-200 text-sm font-semibold hover:text-white transition-colors underline underline-offset-4 disabled:opacity-60"
           >
             {isStartingLogin ? 'Abriendo Google…' : 'Entrar con Google'}
           </button>
           <button
             onClick={() => signOut().catch(() => {})}
             disabled={isAuthBusy}
             className="text-slate-400 text-sm font-medium hover:text-white transition-colors underline underline-offset-4 disabled:opacity-60"
           >
             Cerrar sesión
           </button>
        </div>
      </div>
    </div>
  );
}
