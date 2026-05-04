import { useEffect, useState } from 'react';
import { ChevronRight, Share, HelpCircle, MessageSquare, FileText, Shield, RefreshCw } from 'lucide-react';
import { useUserCredits } from '@/hooks/useUserCredits';
import { signInWithGoogle, supabaseBrowser } from '@/lib/supabaseBrowser';

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
        setIsAdmin(Boolean(out?.is_admin));
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

      setOfficeData({ ...out, balance });
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
        alert((out?.error || 'No pude enviar créditos.').toString());
        return;
      }
      alert(`Listo. Se enviaron ${n} créditos a ${email}.`);
      openOffice().catch(() => {});
    } finally {
      setGrantBusy(false);
    }
  };

  if (isOfficeOpen) {
    const users = officeData?.users || {};
    const payments = officeData?.payments || {};
    const daily = Array.isArray(payments?.daily_7d) ? payments.daily_7d : [];
    const balance = officeData?.balance || {};
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
          <button className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors">
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
                <Shield className="w-5 h-5 text-yellow-300" /> OFICINA
              </div>
              <ChevronRight className="w-5 h-5 text-slate-500" />
            </button>
          </div>
        )}

        <div className="glass-card rounded-2xl overflow-hidden">
          <button className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors border-b border-white/5">
            <div className="flex items-center gap-3 text-sm font-medium text-slate-200">
              <MessageSquare className="w-5 h-5 text-slate-400" /> Contáctanos
            </div>
            <ChevronRight className="w-5 h-5 text-slate-500" />
          </button>
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
