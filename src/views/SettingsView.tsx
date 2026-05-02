import { useEffect, useState } from 'react';
import { ChevronRight, Share, HelpCircle, MessageSquare, FileText, Shield, RefreshCw } from 'lucide-react';
import { PricingView } from './PricingView';
import { useUserCredits } from '@/hooks/useUserCredits';
import { ensureAnonSession, getAccessToken, supabaseBrowser } from '@/lib/supabaseBrowser';
import { CREDIT_COSTS } from '@/lib/credits';

export function SettingsView({ onClose }: { onClose: () => void }) {
  const [showPricing, setShowPricing] = useState(false);
  const [showOffice, setShowOffice] = useState(false);
  const [isOfficeLoading, setIsOfficeLoading] = useState(false);
  const [officeError, setOfficeError] = useState<string | null>(null);
  const [officeStats, setOfficeStats] = useState<{ users_total: number | null; personas_total: number | null; payments_total: number | null } | null>(null);
  const [balance, setBalance] = useState<{ credits: number; song_balance: number; downloads_allowed: boolean; free_claimed: boolean } | null>(null);
  const [providerCredits, setProviderCredits] = useState<number | null>(null);
  const [userEmail, setUserEmail] = useState<string>('');
  const [transferEmail, setTransferEmail] = useState('');
  const [transferCredits, setTransferCredits] = useState('');
  const [isAuthBusy, setIsAuthBusy] = useState(false);
  const { credits, refreshCredits } = useUserCredits();
  const ADMIN_EMAIL = 'rubenvfiverr612@gmail.com';
  const isAdmin = userEmail.trim().toLowerCase() === ADMIN_EMAIL;

  if (showPricing) {
    return <PricingView onClose={() => setShowPricing(false)} />;
  }

  const loadOffice = async () => {
    setIsOfficeLoading(true);
    setOfficeError(null);
    try {
      const t = await getAccessToken();
      if (!t.ok) {
        setOfficeError(t.error || 'No se pudo iniciar sesión.');
        return;
      }

      const rBal = await fetch('/api/account/balance', {
        headers: { authorization: `Bearer ${t.token}` },
      });
      const b = await rBal.json().catch(() => ({}));
      if (!rBal.ok) {
        setOfficeError(b?.error || 'No pude cargar tu saldo.');
        return;
      }
      setBalance({
        credits: Number(b?.credits || 0),
        song_balance: Number(b?.song_balance || 0),
        downloads_allowed: Boolean(b?.downloads_allowed),
        free_claimed: Boolean(b?.free_claimed),
      });

      const rStats = await fetch('/api/admin/stats', {
        headers: { authorization: `Bearer ${t.token}` },
      });
      const s = await rStats.json().catch(() => ({}));
      if (!rStats.ok) {
        setOfficeError(s?.error || 'No pude cargar la oficina.');
        return;
      }
      setOfficeStats({
        users_total: typeof s?.users_total === 'number' ? s.users_total : null,
        personas_total: typeof s?.personas_total === 'number' ? s.personas_total : null,
        payments_total: typeof s?.payments_total === 'number' ? s.payments_total : null,
      });
    } finally {
      setIsOfficeLoading(false);
    }
  };

  useEffect(() => {
    if (!supabaseBrowser) return;
    supabaseBrowser.auth.getUser().then(({ data }) => {
      const email = (data?.user?.email || '').toString();
      setUserEmail(email);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    fetch('/api/account/balance?source=provider')
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (!ok) return;
        const c = Number(j?.credits);
        if (Number.isFinite(c)) setProviderCredits(c);
      })
      .catch(() => {});
  }, []);

  const sendAdminLink = async () => {
    if (!supabaseBrowser) return;
    setIsAuthBusy(true);
    try {
      const redirectTo = window.location.origin;
      const { error } = await supabaseBrowser.auth.signInWithOtp({
        email: ADMIN_EMAIL,
        options: { emailRedirectTo: redirectTo },
      });
      if (error) {
        alert(error.message);
        return;
      }
      alert('Te mandé un link al correo del admin. Ábrelo y vuelve a entrar a la app.');
    } finally {
      setIsAuthBusy(false);
    }
  };

  const signOut = async () => {
    if (!supabaseBrowser) return;
    setIsAuthBusy(true);
    try {
      await supabaseBrowser.auth.signOut().catch(() => {});
      setUserEmail('');
      await ensureAnonSession();
      await refreshCredits();
      alert('Sesión cerrada.');
    } finally {
      setIsAuthBusy(false);
    }
  };

  const sendCredits = async (email: string, amount: number) => {
    setIsOfficeLoading(true);
    setOfficeError(null);
    try {
      const t = await getAccessToken();
      if (!t.ok) {
        setOfficeError(t.error || 'No se pudo iniciar sesión.');
        return;
      }
      const r = await fetch('/api/admin/transfer', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${t.token}`,
        },
        body: JSON.stringify({ email, credits: amount }),
      });
      const out = await r.json().catch(() => ({}));
      if (!r.ok) {
        setOfficeError(out?.error || 'No se pudo enviar.');
        return;
      }
      alert('Listo: créditos enviados.');
      await loadOffice();
    } finally {
      setIsOfficeLoading(false);
    }
  };

  if (showOffice) {
    const songsLeft = Math.floor((balance?.credits || credits || 0) / CREDIT_COSTS.generate_music);
    return (
      <div className="flex flex-col overflow-y-auto animate-in slide-in-from-right-8 duration-300 z-[100] bg-black/90 backdrop-blur-3xl fixed inset-0 pb-safe">
        <div className="flex items-center gap-4 p-4 sticky top-0 bg-transparent z-10 backdrop-blur-xl border-b border-white/5">
          <button
            onClick={() => setShowOffice(false)}
            className="p-2 text-slate-300 hover:text-white glass-card rounded-full"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6">
              <path d="M15 18l-6-6 6-6"></path>
            </svg>
          </button>
          <div className="text-white font-bold">Oficina</div>
          <div className="flex-1" />
          <button
            onClick={() => loadOffice()}
            className="px-3 py-2 rounded-full glass-card text-slate-200 text-xs font-semibold hover:bg-white/10"
            disabled={isOfficeLoading}
          >
            Actualizar
          </button>
        </div>

        <div className="p-6 space-y-4 max-w-2xl mx-auto w-full">
          {officeError && (
            <div className="glass-card rounded-2xl p-4 border border-red-500/30 text-red-200 text-sm">
              {officeError}
            </div>
          )}

          <div className="glass-card rounded-2xl p-4">
            <div className="text-slate-200 font-semibold mb-3">Tu saldo</div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="glass-card rounded-xl p-3">
                <div className="text-slate-400 text-xs mb-1">Créditos</div>
                <div className="text-white font-bold">{balance?.credits ?? credits ?? 0}</div>
              </div>
              <div className="glass-card rounded-xl p-3">
                <div className="text-slate-400 text-xs mb-1">Canciones restantes</div>
                <div className="text-white font-bold">{songsLeft}</div>
              </div>
              <div className="glass-card rounded-xl p-3">
                <div className="text-slate-400 text-xs mb-1">Descargas</div>
                <div className="text-white font-bold">{balance?.downloads_allowed ? 'Habilitadas' : 'Bloqueadas'}</div>
              </div>
              <div className="glass-card rounded-xl p-3">
                <div className="text-slate-400 text-xs mb-1">Plan gratis</div>
                <div className="text-white font-bold">{balance?.free_claimed ? 'Ya usado' : 'Disponible'}</div>
              </div>
            </div>
          </div>

          <div className="glass-card rounded-2xl p-4">
            <div className="text-slate-200 font-semibold mb-3">Tu app</div>
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div className="glass-card rounded-xl p-3">
                <div className="text-slate-400 text-xs mb-1">Usuarios</div>
                <div className="text-white font-bold">{officeStats?.users_total ?? '-'}</div>
              </div>
              <div className="glass-card rounded-xl p-3">
                <div className="text-slate-400 text-xs mb-1">Personas</div>
                <div className="text-white font-bold">{officeStats?.personas_total ?? '-'}</div>
              </div>
              <div className="glass-card rounded-xl p-3">
                <div className="text-slate-400 text-xs mb-1">Pagos</div>
                <div className="text-white font-bold">{officeStats?.payments_total ?? '-'}</div>
              </div>
            </div>
            <div className="text-slate-500 text-xs mt-2">Personas = voces clonadas (si las usas).</div>
          </div>

          <div className="glass-card rounded-2xl p-4">
            <div className="text-slate-200 font-semibold mb-3">Enviar créditos a otra cuenta</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input
                value={transferEmail}
                onChange={(e) => setTransferEmail(e.target.value)}
                placeholder="Correo del usuario"
                className="w-full glass-card rounded-xl p-3 text-sm text-white placeholder:text-slate-500 outline-none"
              />
              <input
                value={transferCredits}
                onChange={(e) => setTransferCredits(e.target.value)}
                placeholder="Créditos (ej: 24)"
                className="w-full glass-card rounded-xl p-3 text-sm text-white placeholder:text-slate-500 outline-none"
              />
            </div>
            <div className="mt-3 flex justify-end">
              <button
                onClick={() => {
                  const email = transferEmail.trim();
                  const n = Number(transferCredits);
                  if (!email || !Number.isFinite(n) || n <= 0) {
                    setOfficeError('Pon el correo y los créditos a enviar.');
                    return;
                  }
                  sendCredits(email, n).catch(() => {});
                }}
                disabled={isOfficeLoading}
                className="bg-indigo-500 hover:bg-indigo-400 text-[#020617] font-semibold text-xs px-4 py-2 rounded-full transition-colors disabled:opacity-60"
              >
                Enviar
              </button>
            </div>
            <div className="text-slate-500 text-xs mt-2">El usuario debe iniciar sesión al menos una vez para que podamos encontrar su correo.</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col overflow-y-auto animate-in slide-in-from-right-8 duration-300 z-[100] bg-black/90 backdrop-blur-3xl fixed inset-0 pb-safe">
      <div className="flex items-center gap-4 p-4 sticky top-0 bg-transparent z-10 backdrop-blur-xl border-b border-white/5">
        <button onClick={onClose} className="p-2 text-slate-300 hover:text-white glass-card rounded-full">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6"><path d="M15 18l-6-6 6-6"></path></svg>
        </button>
      </div>

      <div className="p-6 space-y-6 max-w-2xl mx-auto w-full">
        <div className="flex items-center gap-4 mb-2">
          <div className="w-16 h-16 rounded-full bg-teal-600 border border-teal-500/30 flex items-center justify-center text-2xl font-bold text-white shadow-inner">
            R
          </div>
          <h2 className="text-2xl font-bold text-white">Ruben</h2>
        </div>

        <div className="glass-card rounded-2xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-yellow-500 flex items-center justify-center text-black font-bold text-xs">♪</div>
            <span className="font-semibold text-slate-200">{typeof providerCredits === 'number' ? providerCredits : credits} Créditos</span>
            <HelpCircle className="w-4 h-4 text-slate-500" />
          </div>
          <button 
            onClick={() => setShowPricing(true)}
            className="bg-green-500 hover:bg-green-400 text-[#020617] font-semibold text-xs px-4 py-2 rounded-full transition-colors"
          >
            Obtener más canciones
          </button>
        </div>

        {isAdmin && (
          <div className="glass-card rounded-2xl overflow-hidden">
            <button
              onClick={() => {
                setShowOffice(true);
                loadOffice().catch(() => {});
              }}
              className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors"
            >
              <div className="flex items-center gap-3 text-sm font-medium text-slate-200">
                <Shield className="w-5 h-5 text-slate-400" /> Oficina
              </div>
              <ChevronRight className="w-5 h-5 text-slate-500" />
            </button>
          </div>
        )}

        

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
