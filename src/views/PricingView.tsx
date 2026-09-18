import { useEffect, useState } from 'react';
import { Check, Sparkles, Package, Zap, Crown, Gift, ShieldCheck, Headphones, LockKeyhole, Info, ArrowRight, RefreshCcw } from 'lucide-react';
import { useUserCredits } from '@/hooks/useUserCredits';
import { getAccessToken } from '@/lib/supabaseBrowser';
import { CREDIT_COSTS } from '@/lib/credits';
const isDev = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

interface PricingViewProps {
  onClose: () => void;
  pageMode?: boolean;
}

interface MiniPack {
  id: number;
  pack_key: string;
  name: string;
  songs: number;
  credits_amount: number;
  price_mxn: number;
  validity_days: number;
  sort_order: number;
  description?: string | null;
}

const FALLBACK_MINI_PACKS: MiniPack[] = [
  { id: 1, pack_key: 'mini_3', name: 'Mini', songs: 6, credits_amount: 36, price_mxn: 25, validity_days: 30, sort_order: 1 },
  { id: 2, pack_key: 'chico_10', name: 'Chico', songs: 20, credits_amount: 120, price_mxn: 70, validity_days: 30, sort_order: 2 },
  { id: 3, pack_key: 'mediano_30', name: 'Mediano', songs: 60, credits_amount: 360, price_mxn: 180, validity_days: 30, sort_order: 3 },
  { id: 4, pack_key: 'pack_grande_250', name: 'Grande', songs: 100, credits_amount: 600, price_mxn: 250, validity_days: 30, sort_order: 4 },
];

const miniPackIcon = (idx: number) => {
  const icons = [Gift, Zap, Package, Crown];
  const colors = [
    { bg: 'from-rose-500/20 to-pink-500/20', border: 'border-rose-500/30', text: 'text-rose-300', btn: 'bg-rose-500 hover:bg-rose-400', tag: 'bg-rose-500 text-white', ring: 'ring-rose-400/30' },
    { bg: 'from-amber-500/20 to-yellow-500/20', border: 'border-amber-500/30', text: 'text-amber-300', btn: 'bg-amber-500 hover:bg-amber-400', tag: 'bg-amber-500 text-gray-900 shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] ring-1 ring-inset ring-black/10', ring: 'ring-amber-400/30' },
    { bg: 'from-orange-500/20 to-red-500/20', border: 'border-orange-500/30', text: 'text-orange-300', btn: 'bg-orange-500 hover:bg-orange-400', tag: 'bg-orange-500 text-white', ring: 'ring-orange-400/30' },
    { bg: 'from-fuchsia-500/20 to-purple-500/20', border: 'border-fuchsia-500/30', text: 'text-fuchsia-300', btn: 'bg-fuchsia-500 hover:bg-fuchsia-400', tag: 'bg-fuchsia-500 text-white', ring: 'ring-fuchsia-400/30' },
  ];
  const i = Math.max(0, Math.min(icons.length - 1, idx));
  return { Icon: icons[i], ...colors[i] };
};

export function PricingView({ onClose, pageMode = false }: PricingViewProps) {
  const { credits, refreshCredits } = useUserCredits();
  const [isBusy, setIsBusy] = useState(false);
  const [miniPacks, setMiniPacks] = useState<MiniPack[] | null>(null);
  const [loadingMini, setLoadingMini] = useState(true);

  const songs = Math.floor((credits || 0) / CREDIT_COSTS.generate_music);
  const versions = songs * 2;

  const displaySongsForPack = (p: MiniPack) => {
    const creditsAmount = Number((p as any)?.credits_amount ?? 0);
    const baseSongs = Math.floor((Number.isFinite(creditsAmount) ? creditsAmount : 0) / CREDIT_COSTS.generate_music);
    const marketingSongs = baseSongs * 2;
    if (Number.isFinite(marketingSongs) && marketingSongs > 0) return marketingSongs;
    const fallback = Number((p as any)?.songs ?? 0);
    return Number.isFinite(fallback) && fallback > 0 ? fallback : 0;
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch('/api/mercadopago/packs');
        const out = await r.json().catch(() => []);
        if (!alive) return;
        let list: MiniPack[] = [];
        if (Array.isArray(out?.packs)) list = out.packs;
        else if (Array.isArray(out)) list = out;

        // Filtrar packs inactivos y quitar packs que son duplicados antiguos (grande viejo o clone del plan mensual)
        const filtered = list.filter((p) => {
          if ((p as any).is_active === false) return false;
          const k = String(p.pack_key || '').toLowerCase();
          if (k === 'grande_80' && false) return false;
          if (k === 'grande_80' && Number(p.credits_amount || 0) < 600 && Number(p.price_mxn || 0) < 200) return false;
          if (Number(p.price_mxn || 0) === 350 && Number(p.songs || 0) === 200) return false;
          return true;
        });

        const final = Array.isArray(filtered) && filtered.length > 0 ? filtered : FALLBACK_MINI_PACKS;
        // Ordenar por sort_order
        final.sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
        setMiniPacks(final);
      } catch {
        if (alive) setMiniPacks(FALLBACK_MINI_PACKS);
      } finally {
        if (alive) setLoadingMini(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const buy = async (packKey: 'inicio') => {
    setIsBusy(true);
    try {
      const t = await getAccessToken();
      if (!t.ok) {
        alert(t.error || 'No se pudo iniciar sesión.');
        return;
      }

      const r = await fetch('/api/mercadopago/create-preference', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${t.token}`,
        },
        body: JSON.stringify({ packKey }),
      });
      const out = await r.json().catch(() => ({}));
      if (!r.ok) {
        const detail = (out?.detail || '').toString().trim();
        alert([out?.error || 'No se pudo iniciar el pago.', detail].filter(Boolean).join('\n\n'));
        return;
      }

      const initPoint = typeof out?.init_point === 'string' ? out.init_point : '';
      if (!initPoint) {
        alert('No recibí link de pago.');
        return;
      }
      window.location.href = initPoint;
    } catch (e) {
      console.error(e);
      alert('No pude iniciar el pago. Revisa tu conexión e intenta de nuevo.');
    } finally {
      setIsBusy(false);
    }
  };

  const buyMini = async (packKey: string) => {
    setIsBusy(true);
    try {
      const t = await getAccessToken();
      if (!t.ok) {
        alert(t.error || 'No se pudo iniciar sesión.');
        return;
      }
      const r = await fetch('/api/mercadopago/create-mini-pack-preference', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${t.token}`,
        },
        body: JSON.stringify({ packKey }),
      });
      const out = await r.json().catch(() => ({}));
      if (!r.ok) {
        const detail = (out?.detail || '').toString().trim();
        alert([out?.error || 'No se pudo iniciar el pago.', detail].filter(Boolean).join('\n\n'));
        return;
      }
      const initPoint = typeof out?.init_point === 'string' ? out.init_point : '';
      if (!initPoint) {
        alert('No recibí link de pago.');
        return;
      }
      window.location.href = initPoint;
    } catch (e) {
      console.error(e);
      alert('No pude iniciar el pago. Revisa tu conexión e intenta de nuevo.');
    } finally {
      setIsBusy(false);
    }
  };

  const packsToShow = miniPacks && miniPacks.length > 0 ? miniPacks.slice(0, 4) : FALLBACK_MINI_PACKS;
  const miniLabel = (index: number) =>
    index === 0 ? 'Mini Pack' : index === 1 ? 'Pack Chico' : index === 2 ? 'Pack Mediano' : 'Pack Grande';
  const miniIcon = (index: number) => (index === 0 ? Gift : index === 1 ? Zap : index === 2 ? Package : Crown);
  const miniAccent = (index: number) =>
    index === 0 ? 'rose' : index === 1 ? 'amber' : index === 2 ? 'orange' : 'fuchsia';
  const planCards = [
    ...packsToShow.map((pack, index) => ({
      type: 'mini' as const,
      pack,
      label: miniLabel(index),
      icon: miniIcon(index),
      accent: miniAccent(index),
      popular: index === 3,
    })),
    { type: 'inicio' as const, label: 'Pack Inicio', icon: Crown, accent: 'blue', popular: false },
  ];

  const accentClasses: Record<string, { border: string; text: string; badge: string; button: string; glow: string }> = {
    rose: { border: 'border-rose-500/50', text: 'text-rose-400', badge: 'bg-rose-500', button: 'from-rose-600 to-pink-500', glow: 'shadow-rose-950/30' },
    amber: { border: 'border-amber-500/50', text: 'text-amber-400', badge: 'bg-amber-500', button: 'from-amber-500 to-orange-400', glow: 'shadow-amber-950/30' },
    orange: { border: 'border-orange-500/70', text: 'text-orange-400', badge: 'bg-orange-500', button: 'from-orange-600 to-orange-400', glow: 'shadow-orange-950/40' },
    fuchsia: { border: 'border-fuchsia-500/60', text: 'text-fuchsia-400', badge: 'bg-fuchsia-600', button: 'from-fuchsia-700 to-fuchsia-500', glow: 'shadow-fuchsia-950/35' },
    blue: { border: 'border-blue-500/50', text: 'text-blue-400', badge: 'bg-blue-600', button: 'from-blue-700 to-blue-500', glow: 'shadow-blue-950/30' },
  };

  if (pageMode) {
    return (
      <div className="relative flex-1 min-h-0 overflow-y-auto bg-[#050911] text-white">
        <div className="relative overflow-hidden border-b border-white/10 px-5 py-7 sm:px-8 lg:px-10">
          <img src="/assets/landing-neon-headphones.png" alt="" className="absolute inset-y-0 right-0 h-full w-[62%] object-cover opacity-45" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#050911] via-[#050911]/90 to-[#050911]/35" />
          <div className="relative max-w-[1420px] mx-auto">
            <h1 className="text-3xl font-black tracking-tight sm:text-4xl">Planes de Recarga</h1>
            <p className="mt-2 text-sm text-slate-400">Elige la opción que mejor se adapte a ti y sigue creando música sin límites.</p>
            <div className="mt-7 grid max-w-4xl grid-cols-2 gap-4 sm:grid-cols-4">
              {[
                { icon: ShieldCheck, title: 'Pago seguro', detail: 'Transacciones 100% protegidas' },
                { icon: Zap, title: 'Activación inmediata', detail: 'Recibe tus créditos al instante' },
                { icon: Headphones, title: 'Soporte 24/7', detail: 'Estamos para ayudarte' },
                { icon: LockKeyhole, title: 'Confidencialidad', detail: 'Tu información siempre segura' },
              ].map((item) => {
                const Icon = item.icon;
                return <div key={item.title} className="flex min-w-0 items-center gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-violet-400/20 bg-violet-500/10 text-blue-300"><Icon className="h-4 w-4" /></span><span className="min-w-0"><span className="block text-xs font-bold text-white">{item.title}</span><span className="mt-0.5 block text-[9px] text-slate-500">{item.detail}</span></span></div>;
              })}
            </div>
          </div>
        </div>

        <div className="mx-auto w-full max-w-[1420px] space-y-5 px-5 py-6 pb-28 sm:px-8 lg:px-10">
          <div className="flex items-start gap-3 rounded-2xl border border-blue-400/15 bg-blue-500/[0.07] p-4 text-sm text-slate-300">
            <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-blue-400" />
            <div className="flex-1"><span className="block">Los <b className="text-blue-300">Mini Packs</b> son compras únicas con vigencia de 30 días.</span><span className="block">El <b className="text-blue-300">Pack Inicio</b> es un plan mensual con renovación automática.</span></div>
            <Info className="h-4 w-4 shrink-0 text-slate-400" />
          </div>

          {loadingMini ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{[0,1,2,3].map((item) => <div key={item} className="h-[500px] animate-pulse rounded-3xl border border-white/10 bg-white/5" />)}</div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {planCards.map((card, index) => {
                const isInicio = card.type === 'inicio';
                const pack = card.type === 'mini' ? card.pack : null;
                const songsCount = isInicio ? 200 : displaySongsForPack(pack!);
                const creditsCount = isInicio ? 1200 : Number(pack?.credits_amount || 0);
                const price = isInicio ? 350 : Number(pack?.price_mxn || 0);
                const Icon = card.icon;
                const accent = accentClasses[card.accent];
                const features = isInicio
                  ? ['200 canciones', 'Total 1200 créditos', 'Agente Bot 24/7 para ayudarte a generar canciones', 'Clonación de voz', 'Videos musicales', 'Audio karaoke', 'Eliminar voz / STEMS', 'Descargas activas', 'Saldo mensual acumulable si renuevas a tiempo']
                  : [`${songsCount} canciones`, `Total ${creditsCount} créditos`, 'Agente Bot 24/7 para ayudarte a generar canciones', 'Clonación de voz', ...(index >= 2 ? ['Videos musicales'] : []), 'Audio karaoke', 'Eliminar voz / STEMS', 'Descargas activas', 'Cada compra es un lote independiente'];
                return (
                  <article key={isInicio ? 'inicio' : pack!.pack_key} className={`relative flex min-h-[500px] flex-col overflow-hidden rounded-3xl border ${accent.border} bg-gradient-to-b from-white/[0.055] via-[#090b11] to-[#07080c] p-5 shadow-2xl ${accent.glow}`}>
                    <div className={`pointer-events-none absolute -right-16 -top-14 h-44 w-44 rounded-full blur-3xl opacity-20 ${accent.badge}`} />
                    {card.popular ? <span className="absolute right-0 top-0 rounded-bl-2xl bg-orange-950/70 px-4 py-2 text-[10px] font-black text-orange-400">Más popular</span> : null}
                    <div className="relative">
                      <span className={`inline-flex rounded-full px-3 py-1 text-[10px] font-black text-white ${accent.badge}`}>{card.label}</span>
                      <Icon className={`mt-5 h-9 w-9 ${accent.text}`} />
                      <div className="mt-4 text-lg font-extrabold">{isInicio ? 'Plan mensual' : `${songsCount} Canciones`}</div>
                      <div className="mt-2 flex items-end gap-2"><span className="text-4xl font-black">${price.toFixed(0)}</span><span className="pb-1 text-xs font-bold text-slate-300">MXN{isInicio ? ' / mes' : ''}</span></div>
                      <div className="mt-1 text-[10px] text-slate-400">{isInicio ? 'Plan recurrente' : `Pago único · Vigencia ${Number(pack?.validity_days || 30)} días`}</div>
                    </div>
                    <ul className="relative mt-6 flex-1 space-y-3">
                      {features.map((feature) => <li key={feature} className="flex items-start gap-2 text-[11px] text-slate-300"><span className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border ${accent.border}`}><Check className={`h-2.5 w-2.5 ${accent.text}`} /></span><span>{feature}</span></li>)}
                    </ul>
                    <button type="button" disabled={isBusy} onClick={() => isInicio ? buy('inicio') : buyMini(pack!.pack_key)} className={`relative mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r ${accent.button} text-sm font-black text-white shadow-lg disabled:opacity-60`}>
                      {isBusy ? 'Abriendo…' : isInicio ? 'Elegir Pack Inicio' : `Comprar $${price.toFixed(0)}`}<ArrowRight className="h-4 w-4" />
                    </button>
                  </article>
                );
              })}
            </div>
          )}

          <div className="flex flex-col items-center justify-between gap-4 rounded-2xl border border-white/10 bg-[#0b101c] p-5 sm:flex-row">
            <div className="flex items-center gap-4"><span className="grid h-12 w-12 place-items-center rounded-2xl border border-violet-400/20 bg-violet-500/10 text-violet-300"><ShieldCheck className="h-6 w-6" /></span><span><span className="block font-extrabold text-violet-300">Tus compras están protegidas</span><span className="mt-1 block text-xs text-slate-400">Tus pagos son 100% seguros y tu información está encriptada.</span></span></div>
            <div className="flex items-center gap-2 text-[10px] font-black text-slate-300"><span className="rounded border border-white/10 bg-white/5 px-3 py-2">VISA</span><span className="rounded border border-white/10 bg-white/5 px-3 py-2">Mastercard</span><span className="rounded border border-white/10 bg-white/5 px-3 py-2">AMEX</span><span className="rounded border border-white/10 bg-white/5 px-3 py-2">OXXO</span></div>
          </div>

          <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] p-4"><div><div className="text-sm font-bold">Saldo disponible: {Number(credits || 0).toLocaleString('es-MX')}</div><div className="mt-1 text-[10px] text-slate-500">Aproximadamente {songs} canciones · {versions} versiones A y B</div></div><button type="button" onClick={() => refreshCredits()} disabled={isBusy} className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"><RefreshCcw className="h-4 w-4" /></button></div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full bg-[#0a0a0a] overflow-y-auto animate-in slide-in-from-bottom-8 duration-300 z-[200] fixed inset-0 pb-safe text-white md:bg-black/80 md:backdrop-blur-sm md:items-center md:justify-center md:p-8">
      
      <div className="w-full h-full flex flex-col md:h-[90vh] md:max-w-5xl md:bg-[#0a0a0a] md:border md:border-white/10 md:rounded-3xl md:overflow-hidden md:shadow-2xl">
        {/* Header */}
        <div className="flex items-center p-4 sticky top-0 bg-[#0a0a0a] z-10 border-b border-white/5">
          <button onClick={onClose} className="p-2 text-slate-300 hover:text-white glass-card rounded-full mr-2">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6"><path d="M15 18l-6-6 6-6"></path></svg>
          </button>
          <h2 className="text-xl font-bold flex-1 text-center pr-10">Planes de Recarga</h2>
        </div>

        <div className="p-6 space-y-6 pb-32 max-w-5xl mx-auto w-full overflow-y-auto">
        
        <p className="text-slate-300 text-[15px]">
          Compra canciones para poder descargar y seguir creando.
        </p>

        {/* ========= PAQUETES (MINI + INICIO) — HASTA ARRIBA ========= */}
        <div className="relative pt-2">
          <div className="absolute left-0 right-0 top-1/2 h-px bg-gradient-to-r from-transparent via-orange-400/40 to-transparent"></div>
          <div className="relative flex justify-center">
            <div className="bg-[#0a0a0a] px-5 py-1.5 rounded-full border border-orange-400/40 shadow-lg shadow-orange-500/10 flex items-center gap-2">
              <Zap className="w-4 h-4 text-orange-300 fill-orange-300/30" />
              <span className="text-orange-300 font-extrabold text-base tracking-wide">PAQUETES</span>
              <Zap className="w-4 h-4 text-orange-300 fill-orange-300/30" />
            </div>
          </div>
          <p className="text-center text-slate-400 text-sm mt-3 mb-4">
            👉 Elige la opción que necesites. Los mini paquetes son pago único (30 días). El Pack Inicio es mensual.
          </p>

          {loadingMini ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[0,1,2,3].map(i => (
                <div key={i} className="h-64 rounded-3xl border border-white/10 bg-white/5 animate-pulse"></div>
              ))}
            </div>
          ) : (!miniPacks || miniPacks.length === 0) ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {FALLBACK_MINI_PACKS.map((p, idx) => {
                const { Icon, bg, border, text, btn, tag, ring } = miniPackIcon(idx);
                const price = Number(p.price_mxn || 0);
                const nSongs = displaySongsForPack(p);
                const validity = Number(p.validity_days || 30);
                return (
                  <div
                    key={p.id}
                    className={`relative overflow-hidden rounded-3xl border ${border} bg-gradient-to-b ${bg} p-5 ring-1 ${ring} hover:scale-[1.02] transition-transform duration-200`}
                  >
                    <div className="absolute -right-6 -top-6 opacity-10">
                      <Icon className="w-28 h-28" />
                    </div>
                    <div className="flex items-start justify-between mb-1 relative">
                      <div className={`inline-flex items-center gap-1.5 ${tag} px-3 py-1 rounded-full text-xs font-black shadow-md`}>
                        <Icon className="w-3.5 h-3.5" /> {p.name}
                      </div>
                    </div>
                    <div className="flex items-end gap-2 mt-4 mb-5 relative">
                      <div className="flex flex-col">
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-5xl font-black text-white drop-shadow">${price.toFixed(0)}</span>
                          <span className="text-slate-200 font-semibold text-sm">MXN</span>
                        </div>
                        <span className="text-slate-300 text-xs mt-1 font-medium">Vigencia {validity} días</span>
                      </div>
                    </div>
                    <div className="space-y-2 mb-5 text-sm relative">
                      <div className="flex items-center gap-2 text-slate-100 font-bold text-base">
                        <Check className={`w-5 h-5 ${text} shrink-0`} /> {nSongs} canciones
                      </div>
                      <div className="flex items-center gap-2 text-slate-200">
                        <Check className={`w-5 h-5 ${text} shrink-0`} /> Total {Number(p.credits_amount || 0)} créditos
                      </div>
                      <div className="flex items-center gap-2 text-slate-200">
                        <Check className={`w-5 h-5 ${text} shrink-0`} /> Agente Bot 24/7 para ayudarte a generar canciones
                      </div>
                      <div className="flex items-center gap-2 text-slate-200">
                        <Check className={`w-5 h-5 ${text} shrink-0`} /> Clonación de voz
                      </div>
                      {idx >= 2 ? (
                        <div className="flex items-center gap-2 text-slate-200">
                          <Check className={`w-5 h-5 ${text} shrink-0`} /> Videos musicales
                        </div>
                      ) : null}
                      <div className="flex items-center gap-2 text-slate-200">
                        <Check className={`w-5 h-5 ${text} shrink-0`} /> Audio karaoke
                      </div>
                      <div className="flex items-center gap-2 text-slate-200">
                        <Check className={`w-5 h-5 ${text} shrink-0`} /> Eliminar voz / STEMS
                      </div>
                      <div className="flex items-center gap-2 text-slate-200">
                        <Check className={`w-5 h-5 ${text} shrink-0`} /> Descargas activas
                      </div>
                      <div className="flex items-center gap-2 text-slate-200">
                        <Check className={`w-5 h-5 ${text} shrink-0`} /> Cada compra es un lote independiente
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        buyMini(p.pack_key);
                      }}
                      disabled={isBusy}
                      className={`relative w-full ${btn} text-white h-[46px] rounded-full font-extrabold text-base transition-colors disabled:opacity-60 shadow-lg shadow-black/30`}
                    >
                      {isBusy ? 'Abriendo…' : `Comprar $${price.toFixed(0)}`}
                    </button>
                  </div>
                );
              })}
              {/* Pack Inicio (en fallback también) */}
              <div className="relative overflow-hidden rounded-3xl border border-blue-500/30 bg-gradient-to-b from-blue-900/30 to-transparent p-5 ring-1 ring-blue-400/30 hover:scale-[1.02] transition-transform duration-200">
                <div className="absolute -right-6 -top-6 opacity-10">
                  <Crown className="w-28 h-28 text-blue-400" />
                </div>
                <div className="flex items-start justify-between mb-1 relative">
                  <div className="inline-flex items-center gap-1.5 bg-blue-500 text-white px-3 py-1 rounded-full text-xs font-black shadow-md">
                    <Crown className="w-3.5 h-3.5" /> Pack Inicio
                  </div>
                </div>
                <div className="flex items-end gap-2 mt-4 mb-5 relative">
                      <div className="flex flex-col">
                        <span className="text-lg font-bold text-slate-400 line-through">$500 MXN</span>
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-5xl font-black text-white drop-shadow">$350</span>
                          <span className="text-slate-200 font-semibold text-sm">MXN</span>
                        </div>
                        <span className="text-slate-300 text-xs mt-1 font-medium">/ mes · Plan recurrente</span>
                      </div>
                    </div>
                    <div className="space-y-2 mb-5 text-sm relative">
                      <div className="flex items-center gap-2 text-slate-100 font-bold text-base">
                        <Check className="w-5 h-5 text-blue-400 shrink-0" /> 200 canciones
                      </div>
                      <div className="flex items-center gap-2 text-slate-200">
                        <Check className="w-5 h-5 text-blue-400 shrink-0" /> Total 1200 créditos
                      </div>
                      <div className="flex items-center gap-2 text-slate-200">
                        <Check className="w-5 h-5 text-blue-400 shrink-0" /> Agente Bot 24/7 para ayudarte a generar canciones
                      </div>
                      <div className="flex items-center gap-2 text-slate-200">
                        <Check className="w-5 h-5 text-blue-400 shrink-0" /> Clonación de voz
                      </div>
                      <div className="flex items-center gap-2 text-slate-200">
                        <Check className="w-5 h-5 text-blue-400 shrink-0" /> Videos musicales
                      </div>
                      <div className="flex items-center gap-2 text-slate-200">
                        <Check className="w-5 h-5 text-blue-400 shrink-0" /> Audio karaoke
                      </div>
                      <div className="flex items-center gap-2 text-slate-200">
                        <Check className="w-5 h-5 text-blue-400 shrink-0" /> Eliminar voz / STEMS
                      </div>
                      <div className="flex items-center gap-2 text-slate-200">
                        <Check className="w-5 h-5 text-blue-400 shrink-0" /> Descargas activas
                      </div>
                      <div className="flex items-start gap-2 text-slate-200">
                        <Check className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
                        <span>Saldo mensual acumulable si renuevas a tiempo</span>
                      </div>
                    </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    buy('inicio');
                  }}
                  disabled={isBusy}
                  className="relative w-full bg-blue-500 hover:bg-blue-400 text-white h-[46px] rounded-full font-extrabold text-base transition-colors disabled:opacity-60 shadow-lg shadow-black/30"
                >
                  {isBusy ? 'Abriendo…' : 'Comprar $350 / mes'}
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {miniPacks.map((p, idx) => {
                const { Icon, bg, border, text, btn, tag, ring } = miniPackIcon(idx);
                const price = Number(p.price_mxn || 0);
                const nSongs = displaySongsForPack(p);
                const validity = Number(p.validity_days || 30);
                return (
                  <div
                    key={p.id}
                    className={`relative overflow-hidden rounded-3xl border ${border} bg-gradient-to-b ${bg} p-5 ring-1 ${ring} hover:scale-[1.02] transition-transform duration-200`}
                  >
                    <div className="absolute -right-6 -top-6 opacity-10">
                      <Icon className="w-28 h-28" />
                    </div>

                    <div className="flex items-start justify-between mb-1 relative">
                      <div className={`inline-flex items-center gap-1.5 ${tag} px-3 py-1 rounded-full text-xs font-black shadow-md`}>
                        <Icon className="w-3.5 h-3.5" /> {p.name}
                      </div>
                    </div>

                    <div className="flex items-end gap-2 mt-4 mb-5 relative">
                      <div className="flex flex-col">
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-5xl font-black text-white drop-shadow">${price.toFixed(0)}</span>
                          <span className="text-slate-200 font-semibold text-sm">MXN</span>
                        </div>
                        <span className="text-slate-300 text-xs mt-1 font-medium">Vigencia {validity} días</span>
                      </div>
                    </div>

                    <div className="space-y-2 mb-5 text-sm relative">
                      <div className="flex items-center gap-2 text-slate-100 font-bold text-base">
                        <Check className={`w-5 h-5 ${text} shrink-0`} /> {nSongs} canciones
                      </div>
                      <div className="flex items-center gap-2 text-slate-200">
                        <Check className={`w-5 h-5 ${text} shrink-0`} /> Total {Number(p.credits_amount || 0)} créditos
                      </div>
                      <div className="flex items-center gap-2 text-slate-200">
                        <Check className={`w-5 h-5 ${text} shrink-0`} /> Agente Bot 24/7 para ayudarte a generar canciones
                      </div>
                      <div className="flex items-center gap-2 text-slate-200">
                        <Check className={`w-5 h-5 ${text} shrink-0`} /> Clonación de voz
                      </div>
                      {idx >= 2 ? (
                        <div className="flex items-center gap-2 text-slate-200">
                          <Check className={`w-5 h-5 ${text} shrink-0`} /> Videos musicales
                        </div>
                      ) : null}
                      <div className="flex items-center gap-2 text-slate-200">
                        <Check className={`w-5 h-5 ${text} shrink-0`} /> Audio karaoke
                      </div>
                      <div className="flex items-center gap-2 text-slate-200">
                        <Check className={`w-5 h-5 ${text} shrink-0`} /> Eliminar voz / STEMS
                      </div>
                      <div className="flex items-center gap-2 text-slate-200">
                        <Check className={`w-5 h-5 ${text} shrink-0`} /> Descargas activas
                      </div>
                      <div className="flex items-center gap-2 text-slate-200">
                        <Check className={`w-5 h-5 ${text} shrink-0`} /> Cada compra es un lote independiente
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        buyMini(p.pack_key);
                      }}
                      disabled={isBusy}
                      className={`relative w-full ${btn} text-white h-[46px] rounded-full font-extrabold text-base transition-colors disabled:opacity-60 shadow-lg shadow-black/30`}
                    >
                      {isBusy ? 'Abriendo…' : `Comprar $${price.toFixed(0)}`}
                    </button>
                  </div>
                );
              })}

              {/* Pack Inicio — MISMA TARJETA, MISMO TAMAÑO */}
              <div className="relative overflow-hidden rounded-3xl border border-blue-500/30 bg-gradient-to-b from-blue-900/30 to-transparent p-5 ring-1 ring-blue-400/30 hover:scale-[1.02] transition-transform duration-200">
                <div className="absolute -right-6 -top-6 opacity-10">
                  <Crown className="w-28 h-28 text-blue-400" />
                </div>

                <div className="flex items-start justify-between mb-1 relative">
                  <div className="inline-flex items-center gap-1.5 bg-blue-500 text-white px-3 py-1 rounded-full text-xs font-black shadow-md">
                    <Crown className="w-3.5 h-3.5" /> Pack Inicio
                  </div>
                </div>

                <div className="flex items-end gap-2 mt-4 mb-5 relative">
                  <div className="flex flex-col">
                    <span className="text-lg font-bold text-slate-400 line-through">$500 MXN</span>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-5xl font-black text-white drop-shadow">$350</span>
                      <span className="text-slate-200 font-semibold text-sm">MXN</span>
                    </div>
                    <span className="text-slate-300 text-xs mt-1 font-medium">/ mes · Plan recurrente</span>
                  </div>
                </div>

                <div className="space-y-2 mb-5 text-sm relative">
                  <div className="flex items-center gap-2 text-slate-100 font-bold text-base">
                    <Check className="w-5 h-5 text-blue-400 shrink-0" /> 200 canciones
                  </div>
                  <div className="flex items-center gap-2 text-slate-200">
                    <Check className="w-5 h-5 text-blue-400 shrink-0" /> Total 1200 créditos
                  </div>
                  <div className="flex items-center gap-2 text-slate-200">
                    <Check className="w-5 h-5 text-blue-400 shrink-0" /> Incluye ChatBot
                  </div>
                  <div className="flex items-center gap-2 text-slate-200">
                    <Check className="w-5 h-5 text-blue-400 shrink-0" /> Clonación de voz
                  </div>
                  <div className="flex items-center gap-2 text-slate-200">
                    <Check className="w-5 h-5 text-blue-400 shrink-0" /> Videos musicales
                  </div>
                  <div className="flex items-center gap-2 text-slate-200">
                    <Check className="w-5 h-5 text-blue-400 shrink-0" /> Audio karaoke
                  </div>
                  <div className="flex items-center gap-2 text-slate-200">
                    <Check className="w-5 h-5 text-blue-400 shrink-0" /> Eliminar voz / STEMS
                  </div>
                  <div className="flex items-center gap-2 text-slate-200">
                    <Check className="w-5 h-5 text-blue-400 shrink-0" /> Descargas activas
                  </div>
                  <div className="flex items-start gap-2 text-slate-200">
                    <Check className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
                    <span>Saldo mensual acumulable si renuevas a tiempo</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    buy('inicio');
                  }}
                  disabled={isBusy}
                  className="relative w-full bg-blue-500 hover:bg-blue-400 text-white h-[46px] rounded-full font-extrabold text-base transition-colors disabled:opacity-60 shadow-lg shadow-black/30"
                >
                  {isBusy ? 'Abriendo…' : 'Comprar $350 / mes'}
                </button>
              </div>

            </div>
          )}
        </div>
        {/* ========= FIN SECCION DE PAQUETES (ARRIBA) ========= */}

        <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-3 flex items-center gap-2 text-indigo-300 font-medium text-sm">
          <Sparkles className="w-4 h-4" /> Cada canción crea 2 versiones (A y B)
        </div>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-sm text-slate-300 space-y-2">
          <p className="font-semibold text-white">Importante sobre los planes</p>
          <p>Los precios son mensuales (excepto mini paquetes, que son pago único por 30 días).</p>
          <p>Si no gastas todo tu saldo, en tu siguiente pago se suma al nuevo saldo.</p>
          <p>El saldo dura hasta 2 meses. Si en 2 meses no se recibe tu pago, el saldo acumulado se elimina.</p>
          <p>El saldo acumulado tiene un tope de 2,000 créditos.</p>
        </div>

        {/* Saldo actual */}
        <div className="bg-indigo-500/5 border border-indigo-500/10 rounded-2xl p-5 mt-8">
          <h3 className="text-lg font-bold text-white mb-1">Te quedan {songs} canciones disponibles</h3>
          <p className="text-slate-400 text-sm mb-4">
            Se descuenta 1 canción solo cuando la música se genera con éxito.
          </p>
          <button
            onClick={() => refreshCredits()}
            className="bg-white/5 hover:bg-white/10 text-white border border-white/10 px-5 py-2.5 rounded-full text-sm font-bold transition-colors disabled:opacity-60"
            disabled={isBusy}
          >
            Actualizar saldo
          </button>
        </div>

        {/* Costos por acción */}
        <div className="bg-white/5 border border-white/10 rounded-3xl p-6 mt-8">
          <h3 className="text-lg font-bold text-white mb-2">Costos por acción (en créditos)</h3>
          <p className="text-slate-400 text-sm mb-6">
            Estos son los créditos que se descuentan cuando usas cada herramienta.
          </p>

          <div className="space-y-3">
            {[
              { name: 'Crear canción (genera A y B)', cost: '12 créditos' },
              { name: 'Extender canción', cost: '12 créditos' },
              { name: 'Karaoke (quitar voz)', cost: '10 créditos' },
              { name: 'Masterizar', cost: '12 créditos' },
              { name: 'Separación de instrumentos (STEMS)', cost: '50 créditos' },
              { name: 'Video musical', cost: '2 créditos' },
              { name: 'Reemplazar sección', cost: '5 créditos' },
              { name: 'Generar WAV', cost: '0.4 créditos' },
              { name: 'Letras', cost: '0.4 créditos', devOnly: true },
              { name: 'Letras con tiempo', cost: '0.5 créditos', devOnly: true },
              { name: 'Mejorar estilo', cost: '0.4 créditos' },
            ].filter(item => !item.devOnly || isDev).map((item, i) => (
              <div key={i} className="flex justify-between items-center p-4 bg-white/5 border border-white/5 rounded-2xl">
                <span className="text-slate-200 font-medium">{item.name}</span>
                <span className="text-white font-bold">{item.cost}</span>
              </div>
            ))}
          </div>

          <div className="mt-8 bg-white text-gray-900 shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] ring-1 ring-inset ring-black/10 p-5 rounded-2xl flex justify-between items-center shadow-lg">
            <div>
              <p className="font-bold text-base">Te quedan {songs} canciones</p>
              <p className="text-slate-600 text-sm">≈ {versions} versiones (A y B)</p>
            </div>
            <button
              onClick={() => refreshCredits()}
              disabled={isBusy}
              className="border border-slate-300 hover:bg-slate-100 text-gray-900 shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.05)] ring-1 ring-inset ring-black/10 px-4 py-2 rounded-full font-bold text-sm transition-colors disabled:opacity-60"
            >
              Actualizar
            </button>
          </div>
        </div>

      </div>
      </div>
    </div>
  );
}
