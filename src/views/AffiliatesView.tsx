import { useEffect, useMemo, useState } from 'react';
import { Copy, RefreshCw, Users, Search, Wallet, UserCheck, UserX, X, DollarSign, Sparkles, Megaphone, Calculator, ArrowRight, TrendingUp, CheckCircle2 } from 'lucide-react';
import { getAccessToken } from '@/lib/supabaseBrowser';
import { cn } from '@/lib/utils';
import { UserProfileView } from '@/views/UserProfileView';

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
  inactive_referrals: Array<{ user_id: string; full_name: string }>;
};

type ReferralFilter = 'active' | 'inactive' | 'all';

export function AffiliatesView() {
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState<AffiliateMeResponse | null>(null);
  const [isListOpen, setIsListOpen] = useState(true);
  const [search, setSearch] = useState('');
  const [payoutEmail, setPayoutEmail] = useState('');
  const [filter, setFilter] = useState<ReferralFilter>('active');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [landingPlan, setLandingPlan] = useState<100 | 200>(100);
  const [landingInvites, setLandingInvites] = useState<number>(1);
  const [landingRetention, setLandingRetention] = useState<number>(100);
  console.log('isListOpen:', isListOpen);

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
    console.log('Calculating filtered list:', { filter, data: data ? 'has data' : 'no data' });
    let list: Array<{ user_id: string; full_name: string }> = [];
    if (filter === 'active') {
      list = data?.active_referrals || [];
      console.log('Active referrals:', data?.active_referrals?.length || 0);
    } else if (filter === 'inactive') {
      list = data?.inactive_referrals || [];
      console.log('Inactive referrals:', data?.inactive_referrals?.length || 0);
    } else if (filter === 'all') {
      list = [...(data?.active_referrals || []), ...(data?.inactive_referrals || [])];
      console.log('All referrals:', list.length);
    }
    
    const q = (search || '').toString().trim().toLowerCase();
    if (!q) return list;
    return list.filter((x) => (x.full_name || '').toString().toLowerCase().includes(q));
  }, [data, search, filter]);

  // Calculos del simulador reactivo
  const landingInvitesPerMonth = landingInvites * 30;

  const getLandingMonthlyForecast = () => {
    const months = Array.from({ length: 12 }, (_, i) => i + 1);
    let cumulativeEarned = 0;
    return months.map((month) => {
      // Calculamos los usuarios que siguen activos considerando la retencion acumulada
      const activeUsers = Math.round((month * landingInvitesPerMonth) * (landingRetention / 100));
      const incomeThisMonth = activeUsers * landingPlan;
      cumulativeEarned += incomeThisMonth;
      return {
        month,
        activeUsers,
        incomeThisMonth,
        cumulativeEarned,
      };
    });
  };

  const landingForecast = getLandingMonthlyForecast();
  const landingYearTotal = landingForecast.reduce((sum, item) => sum + item.incomeThisMonth, 0);
  const landingPassiveSalaryMonth12 = landingForecast[11].incomeThisMonth;

  const simulator = useMemo(() => {
    const invitesPerDay = Math.max(1, Math.floor(Number(landingInvites || 1)));
    const retention = Math.max(50, Math.min(100, Math.floor(Number(landingRetention || 100))));
    const earningsPerDay = (landingForecast[0]?.incomeThisMonth || 0) / 30;
    const earningsPerWeek = earningsPerDay * 7;
    const earningsPerMonth = landingForecast[0]?.incomeThisMonth || 0;
    return {
      invitesPerDay,
      retention,
      earningsPerDay,
      earningsPerWeek,
      earningsPerMonth,
      yearTotal: landingYearTotal,
      month12Income: landingPassiveSalaryMonth12,
      month12ActiveUsers: landingForecast[11]?.activeUsers || 0,
    };
  }, [landingForecast, landingInvites, landingPassiveSalaryMonth12, landingRetention, landingYearTotal]);

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
      try { document.body.appendChild(ta); } catch {}
      ta.focus();
      ta.select();
      document.execCommand('copy');
      try { if (ta.parentNode) ta.parentNode.removeChild(ta); } catch {}
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

        {/* SECCIÓN COMPLETA DE INGRESOS Y AFILIADOS CON SIMULADOR REACTIVO */}
        <section className="mb-32">
          <div className="max-w-6xl mx-auto px-6">
            
            {/* Encabezado explicativo corporativo */}
            <div className="text-center mb-16 max-w-3xl mx-auto">
              <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-black uppercase tracking-wider mb-4 animate-pulse">
                <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                Diferente a cualquier otra IA de Música
              </span>
              <h2 className="text-3xl md:text-5xl font-display font-black text-white mb-6 tracking-tight leading-tight">
                Gana Dinero Real en Efectivo con <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-teal-300 to-purple-400">LucIAna | Music</span>
              </h2>
              <p className="text-slate-400 text-sm md:text-base leading-relaxed font-semibold">
                Mientras otras plataformas solo te permiten escuchar, LucIAna está diseñada como un motor de negocio digital. Te pagamos comisiones recurrentes en efectivo por invitar recomendados y te capacitamos para explotar el mercado.
              </p>
            </div>
            
            {/* Pilares de Beneficios (3 Columnas) */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-16">
              
              {/* Columna 1 */}
              <div className="p-6 md:p-8 bg-slate-900/40 rounded-3xl border border-white/5 relative hover:border-emerald-500/25 hover:bg-slate-900/60 transition-all group text-left">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-6 text-emerald-400 group-hover:scale-110 transition-transform">
                  <Users className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-white mb-3">1. Invitados y Socios</h3>
                <p className="text-slate-400 text-xs font-medium leading-relaxed mb-4">
                  Recibes un <strong>enlace exclusivo de afiliado</strong> al registrarte. Comparte tu link en redes sociales o WhatsApp para generar altos ingresos pasivos.
                </p>
                <div className="space-y-2 border-t border-white/5 pt-3">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                    <CheckCircle2 className="w-4.5 h-4.5 text-emerald-400 shrink-0" />
                    <span>Plan Básico: ganas <strong className="text-emerald-300">$100 MXN</strong> netos.</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                    <CheckCircle2 className="w-4.5 h-4.5 text-emerald-400 shrink-0" />
                    <span>Plan Premium: ganas <strong className="text-emerald-300">$200 MXN</strong> netos.</span>
                  </div>
                </div>
              </div>
              
              {/* Columna 2 */}
              <div className="p-6 md:p-8 bg-slate-900/40 rounded-3xl border border-white/5 relative hover:border-purple-500/25 hover:bg-slate-900/60 transition-all group text-left">
                <div className="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mb-6 text-purple-400 group-hover:scale-110 transition-transform">
                  <Sparkles className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-white mb-3">2. Maquetas Musicales</h3>
                <p className="text-slate-400 text-xs font-medium leading-relaxed mb-4">
                  Utiliza las herramientas avanzadas de voz y stems para estructurar bocetos musicales originales para cantautores, solistas y bandas de tu zona.
                </p>
                <div className="space-y-2 border-t border-white/5 pt-3">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                    <CheckCircle2 className="w-4.5 h-4.5 text-purple-400 shrink-0" />
                    <span>Clona voces para maquetas personalizadas.</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                    <CheckCircle2 className="w-4.5 h-4.5 text-purple-400 shrink-0" />
                    <span>Vende producciones completas de manera local.</span>
                  </div>
                </div>
              </div>
              
              {/* Columna 3 */}
              <div className="p-6 md:p-8 bg-slate-900/40 rounded-3xl border border-white/5 relative hover:border-blue-500/25 hover:bg-slate-900/60 transition-all group text-left">
                <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mb-6 text-blue-400 group-hover:scale-110 transition-transform">
                  <Megaphone className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-white mb-3">3. Publicidad Digital Gratis</h3>
                <p className="text-slate-400 text-xs font-medium leading-relaxed mb-4">
                  ¿Te da miedo no saber vender? Te capacitamos en marketing digital y anuncios de Meta <strong>sin costo adicional</strong> para que logres expandir tu alcance.
                </p>
                <div className="space-y-2 border-t border-white/5 pt-3">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                    <CheckCircle2 className="w-4.5 h-4.5 text-blue-400 shrink-0" />
                    <span>Anuncios atractivos para prospectos de todo México.</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                    <CheckCircle2 className="w-4.5 h-4.5 text-blue-400 shrink-0" />
                    <span>Estrategias automáticas todos los días del año.</span>
                  </div>
                </div>
              </div>
              
            </div>
            
            {/* Caja Fuerte del Simulador Interactivo */}
            <div className="bg-slate-900/40 border border-white/5 rounded-3xl p-6 md:p-10 relative overflow-hidden text-left">
              <div className="absolute top-0 right-0 p-24 bg-purple-500/[0.03] rounded-full blur-3xl pointer-events-none"></div>
              
              <div className="relative z-10 flex flex-col md:flex-row items-center justify-between border-b border-white/5 pb-6 mb-8 gap-4 text-left">
                <div>
                  <h3 className="text-xl md:text-2xl font-display font-black text-white flex items-center gap-2">
                    <Calculator className="w-5 h-5 text-purple-400 animate-pulse" />
                    Simulador de Ingreso Mensual Pasivo
                  </h3>
                  <p className="text-slate-400 text-xs font-semibold mt-1">Configura cuántas personas vas a invitar al día para ver crecer tus ganancias acumuladas.</p>
                </div>
                
                <button
                  onClick={() => setCurrentPage('earn')}
                  className="px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-black text-xs font-extrabold rounded-xl hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer shadow-lg shadow-teal-500/10 flex items-center gap-2 whitespace-nowrap self-start md:self-center"
                >
                  <span>Ver Plan Completo</span>
                  <ArrowRight className="w-3.5 h-3.5 text-black" />
                </button>
              </div>
              
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start text-left">
                
                {/* Entradas del simulador (Sliders y Selector) */}
                <div className="lg:col-span-5 space-y-6 bg-slate-950 p-5 rounded-2xl border border-white/5">
                  
                  {/* 1. Selector de Comisión */}
                  <div className="space-y-4">
                    <label className="text-[11px] font-extrabold text-slate-400 uppercase tracking-widest block">1. Comisión por recarga:</label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => setLandingPlan(100)}
                        className={`py-2 px-3 rounded-xl border text-center transition-all cursor-pointer ${
                          landingPlan === 100
                            ? 'bg-purple-600/20 border-purple-500 text-purple-300 font-bold'
                            : 'bg-slate-900 border-white/5 text-slate-400 hover:border-white/10'
                        }`}
                      >
                        <span className="block text-[8px] uppercase font-bold tracking-wider text-slate-500">Plan Básico</span>
                        <span className="text-xs">$100 MXN</span>
                      </button>
                      <button
                        onClick={() => setLandingPlan(200)}
                        className={`py-2 px-3 rounded-xl border text-center transition-all cursor-pointer ${
                          landingPlan === 200
                            ? 'bg-purple-600/20 border-purple-500 text-purple-300 font-bold'
                            : 'bg-slate-900 border-white/5 text-slate-400 hover:border-white/10'
                        }`}
                      >
                        <span className="block text-[8px] uppercase font-bold tracking-wider text-slate-500">Plan Premium</span>
                        <span className="text-xs">$200 MXN</span>
                      </button>
                    </div>
                  </div>
                  
                  {/* 2. Barra de Invitados Diarios */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-extrabold text-slate-400 uppercase tracking-widest">2. Invitados al día:</label>
                      <span className="text-xs font-black bg-purple-500/20 text-purple-300 px-2.5 py-0.5 rounded-full">
                        {landingInvites} {landingInvites === 1 ? 'persona' : 'personas'} / día
                      </span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={10}
                      step={1}
                      value={landingInvites}
                      onChange={(e) => setLandingInvites(Number(e.target.value))}
                      className="w-full accent-purple-500 h-1.5 bg-slate-900 rounded-lg appearance-none cursor-pointer"
                    />
                    <div className="flex items-center justify-between text-[9px] text-slate-500 font-bold">
                      <span>1 Persona / Día</span>
                      <span>10 Personas / Día</span>
                    </div>
                  </div>
                  
                  {/* 3. Barra de Retención */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-extrabold text-slate-400 uppercase tracking-widest">3. Tasa de retención:</label>
                      <span className="text-xs font-black bg-emerald-500/20 text-emerald-300 px-2.5 py-0.5 rounded-full">
                        {landingRetention}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={50}
                      max={100}
                      step={5}
                      value={landingRetention}
                      onChange={(e) => setLandingRetention(Number(e.target.value))}
                      className="w-full accent-emerald-500 h-1.5 bg-slate-900 rounded-lg appearance-none cursor-pointer"
                    />
                    <span className="text-[9px] text-slate-500 font-bold leading-none block">* Medida de recomendados que continúan su segundo mes.</span>
                  </div>
                  
                </div>
                
                {/* Resultados del simulador (Panel Derecho) */}
                <div className="lg:col-span-7 space-y-6">
                  
                  {/* Tarjetas primarias de totales */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    
                    <div className="p-5 bg-slate-950 rounded-2xl border border-white/5 relative overflow-hidden">
                      <span className="block text-[9px] text-slate-500 font-extrabold uppercase tracking-widest mb-1.5">Sueldo Pasivo al Mes 12</span>
                      <div className="flex items-baseline gap-1 text-white">
                        <span className="text-2xl md:text-3xl font-display font-black text-emerald-400">${landingPassiveSalaryMonth12.toLocaleString('es-MX')}</span>
                        <span className="text-xs font-semibold text-slate-400">MXN / mes</span>
                      </div>
                      <span className="block text-[8px] text-slate-500 font-semibold mt-1">Con {landingInvitesPerMonth * 12 * (landingRetention / 100)} recomendados activos</span>
                    </div>
                    
                    <div className="p-5 bg-gradient-to-r from-purple-950/20 to-slate-950 rounded-2xl border border-purple-500/20 relative overflow-hidden">
                      <span className="block text-[9px] text-purple-300 font-extrabold uppercase tracking-widest mb-1.5">Ganancia Sumada al Año</span>
                      <div className="flex items-baseline gap-1 text-white">
                        <span className="text-2xl md:text-3xl font-display font-black text-purple-400">${landingYearTotal.toLocaleString('es-MX')}</span>
                        <span className="text-xs font-semibold text-purple-300">MXN acumulado</span>
                      </div>
                      <span className="block text-[8px] text-purple-400/80 font-semibold mt-1">Suma total de los 12 meses de trabajo</span>
                    </div>
                    
                  </div>
                  
                  {/* Gráfico/Tabla Desglosada Mes por Mes */}
                  <div className="p-1 border border-white/5 rounded-2xl bg-slate-950 overflow-hidden">
                    <div className="px-4 py-2 bg-slate-900 border-b border-white/5 flex items-center justify-between">
                      <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest flex items-center gap-1.5">
                        <TrendingUp className="w-3.5 h-3.5 text-purple-400 animate-bounce" />
                        Crecimiento Progresivo Mes con Mes
                      </span>
                      <span className="text-[9px] text-slate-500 font-mono font-bold">12 Meses</span>
                    </div>
                    
                    <div className="max-h-40 overflow-y-auto custom-scrollbar">
                      <div className="divide-y divide-white/5">
                        {landingForecast.map((item, idx) => (
                          <div key={idx} className="flex items-center justify-between px-4 py-2 hover:bg-white/[0.02] transition-colors">
                            <span className="text-xs font-bold text-slate-300">Mes {item.month}</span>
                            <div className="flex gap-4 text-right text-xs">
                              <div>
                                <span className="text-slate-500 text-[10px] mr-1">Activos:</span>
                                <span className="font-semibold text-slate-300">{item.activeUsers}</span>
                              </div>
                              <div>
                                <span className="text-slate-500 text-[10px] mr-1 font-semibold">Mensual:</span>
                                <span className="font-extrabold text-emerald-400">${item.incomeThisMonth.toLocaleString('es-MX')} MXN</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  
                </div>
                
              </div>
            </div>
            
          </div>
        </section>

        <div className="glass-card rounded-3xl border border-white/10 p-5">
          <button onClick={() => setIsListOpen((v) => !v)} className="w-full flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-100">
                <Users className="w-6 h-6" />
              </div>
              <div className="min-w-0 text-left">
                <div className="text-white font-extrabold">
                  {filter === 'active' && 'Personas registradas (activas)'}
                  {filter === 'inactive' && 'Personas registradas (inactivas)'}
                  {filter === 'all' && 'Personas registradas (todas)'}
                </div>
                <div className="text-xs text-slate-300">
                  {filter === 'active' && `${data?.stats?.referrals_active || 0} activos`}
                  {filter === 'inactive' && `${data?.stats ? data.stats.referrals_total - data.stats.referrals_active : 0} inactivos`}
                  {filter === 'all' && `${data?.stats?.referrals_total || 0} total`}
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

              <div className="flex flex-wrap gap-2 mb-4">
                <button
                  onClick={() => { console.log('Setting filter to active'); setFilter('active'); }}
                  className={cn(
                    "px-4 py-2 rounded-full text-sm font-semibold transition-all duration-200 flex items-center gap-2 border",
                    filter === 'active' 
                      ? 'bg-emerald-500 text-black border-emerald-600 shadow-lg shadow-emerald-500/20' 
                      : 'bg-white/5 text-slate-200 hover:bg-white/10 border-white/10 hover:border-white/20'
                  )}
                >
                  <UserCheck className="w-4 h-4" />
                  Activos ({data?.stats?.referrals_active || 0})
                </button>
                <button
                  onClick={() => { console.log('Setting filter to inactive'); setFilter('inactive'); }}
                  className={cn(
                    "px-4 py-2 rounded-full text-sm font-semibold transition-all duration-200 flex items-center gap-2 border",
                    filter === 'inactive' 
                      ? 'bg-yellow-500 text-black border-yellow-600 shadow-lg shadow-yellow-500/20' 
                      : 'bg-white/5 text-slate-200 hover:bg-white/10 border-white/10 hover:border-white/20'
                  )}
                >
                  <UserX className="w-4 h-4" />
                  Inactivos ({data?.stats ? data.stats.referrals_total - data.stats.referrals_active : 0})
                </button>
                <button
                  onClick={() => { console.log('Setting filter to all'); setFilter('all'); }}
                  className={cn(
                    "px-4 py-2 rounded-full text-sm font-semibold transition-all duration-200 flex items-center gap-2 border",
                    filter === 'all' 
                      ? 'bg-blue-500 text-black border-blue-600 shadow-lg shadow-blue-500/20' 
                      : 'bg-white/5 text-slate-200 hover:bg-white/10 border-white/10 hover:border-white/20'
                  )}
                >
                  <Users className="w-4 h-4" />
                  Todos ({data?.stats?.referrals_total || 0})
                </button>
              </div>

              {filtered.length === 0 ? (
                <div className="text-slate-400 text-sm py-6 text-center">
                  {filter === 'active' && 'No hay usuarios activos en tu lista.'}
                  {filter === 'inactive' && 'No hay usuarios inactivos en tu lista.'}
                  {filter === 'all' && 'No hay usuarios en tu lista.'}
                </div>
              ) : (
                <div className="space-y-2">
                  {filtered.slice(0, 80).map((u) => (
                    <button
                      key={u.user_id}
                      type="button"
                      onClick={() => setSelectedUserId(u.user_id)}
                      className="block bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-slate-200 hover:bg-white/10 transition-colors cursor-pointer"
                    >
                      {u.full_name || 'Usuario'}
                    </button>
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

      {selectedUserId ? (
        <div className="fixed inset-0 z-[140] bg-black/50 flex items-end md:items-center justify-center">
          <button
            type="button"
            className="absolute inset-0"
            onClick={() => setSelectedUserId(null)}
            aria-label="Cerrar"
          />
          <div className="relative w-full md:max-w-[720px] glass-panel border border-white/10 rounded-t-[2rem] md:rounded-3xl overflow-hidden shadow-[0_-20px_60px_rgba(0,0,0,0.55)] max-h-[92vh] md:max-h-[88vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-gradient-to-r from-indigo-500/10 via-transparent to-fuchsia-500/10">
              <div className="text-white font-extrabold">Perfil</div>
              <button
                type="button"
                onClick={() => setSelectedUserId(null)}
                className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 flex items-center justify-center"
                aria-label="Cerrar"
                title="Cerrar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <UserProfileView userId={selectedUserId} />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
