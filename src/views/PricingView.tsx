import { useEffect, useState } from 'react';
import { Check, Sparkles, Package, Zap, Crown, Gift } from 'lucide-react';
import { useUserCredits } from '@/hooks/useUserCredits';
import { getAccessToken } from '@/lib/supabaseBrowser';
import { CREDIT_COSTS } from '@/lib/credits';
const isDev = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

interface PricingViewProps {
  onClose: () => void;
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
];

const miniPackIcon = (idx: number) => {
  const icons = [Gift, Zap, Package, Crown];
  const colors = [
    { bg: 'from-rose-500/20 to-pink-500/20', border: 'border-rose-500/30', text: 'text-rose-300', btn: 'bg-rose-500 hover:bg-rose-400', tag: 'bg-rose-500 text-white', ring: 'ring-rose-400/30' },
    { bg: 'from-amber-500/20 to-yellow-500/20', border: 'border-amber-500/30', text: 'text-amber-300', btn: 'bg-amber-500 hover:bg-amber-400', tag: 'bg-amber-500 text-black', ring: 'ring-amber-400/30' },
    { bg: 'from-orange-500/20 to-red-500/20', border: 'border-orange-500/30', text: 'text-orange-300', btn: 'bg-orange-500 hover:bg-orange-400', tag: 'bg-orange-500 text-white', ring: 'ring-orange-400/30' },
    { bg: 'from-fuchsia-500/20 to-purple-500/20', border: 'border-fuchsia-500/30', text: 'text-fuchsia-300', btn: 'bg-fuchsia-500 hover:bg-fuchsia-400', tag: 'bg-fuchsia-500 text-white', ring: 'ring-fuchsia-400/30' },
  ];
  const i = Math.max(0, Math.min(icons.length - 1, idx));
  return { Icon: icons[i], ...colors[i] };
};

export function PricingView({ onClose }: PricingViewProps) {
  const { credits, refreshCredits } = useUserCredits();
  const [isBusy, setIsBusy] = useState(false);
  const [miniPacks, setMiniPacks] = useState<MiniPack[] | null>(null);
  const [loadingMini, setLoadingMini] = useState(true);

  const songs = Math.floor((credits || 0) / CREDIT_COSTS.generate_music);
  const versions = songs * 2;

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

        // Filtrar packs inactivos y quitar el pack Grande $350 (duplicado de Pack Inicio)
        const filtered = list.filter((p) => {
          if ((p as any).is_active === false) return false;
          if (String(p.pack_key || '').toLowerCase() === 'grande_80') return false;
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
        alert(out?.error || 'No se pudo iniciar el pago.');
        return;
      }

      const initPoint = typeof out?.init_point === 'string' ? out.init_point : '';
      if (!initPoint) {
        alert('No recibí link de pago.');
        return;
      }
      window.location.href = initPoint;
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
        alert(out?.error || 'No se pudo iniciar el pago.');
        return;
      }
      const initPoint = typeof out?.init_point === 'string' ? out.init_point : '';
      if (!initPoint) {
        alert('No recibí link de pago.');
        return;
      }
      window.location.href = initPoint;
    } finally {
      setIsBusy(false);
    }
  };

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
                const nSongs = Number(p.songs || 0);
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
                        <Check className={`w-5 h-5 ${text} shrink-0`} /> Clonación de voz
                      </div>
                      <div className="flex items-center gap-2 text-slate-200">
                        <Check className={`w-5 h-5 ${text} shrink-0`} /> Videos musicales
                      </div>
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
                      onClick={() => buyMini(p.pack_key)}
                      disabled={isBusy}
                      className={`relative w-full ${btn} text-white h-[46px] rounded-full font-extrabold text-base transition-colors disabled:opacity-60 shadow-lg shadow-black/30`}
                    >
                      Comprar ${price.toFixed(0)}
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
                  onClick={() => buy('inicio')}
                  disabled={isBusy}
                  className="relative w-full bg-blue-500 hover:bg-blue-400 text-white h-[46px] rounded-full font-extrabold text-base transition-colors disabled:opacity-60 shadow-lg shadow-black/30"
                >
                  Comprar $350 / mes
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {miniPacks.map((p, idx) => {
                const { Icon, bg, border, text, btn, tag, ring } = miniPackIcon(idx);
                const price = Number(p.price_mxn || 0);
                const nSongs = Number(p.songs || 0);
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
                        <Check className={`w-5 h-5 ${text} shrink-0`} /> Clonación de voz
                      </div>
                      <div className="flex items-center gap-2 text-slate-200">
                        <Check className={`w-5 h-5 ${text} shrink-0`} /> Videos musicales
                      </div>
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
                      onClick={() => buyMini(p.pack_key)}
                      disabled={isBusy}
                      className={`relative w-full ${btn} text-white h-[46px] rounded-full font-extrabold text-base transition-colors disabled:opacity-60 shadow-lg shadow-black/30`}
                    >
                      Comprar ${price.toFixed(0)}
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
                  onClick={() => buy('inicio')}
                  disabled={isBusy}
                  className="relative w-full bg-blue-500 hover:bg-blue-400 text-white h-[46px] rounded-full font-extrabold text-base transition-colors disabled:opacity-60 shadow-lg shadow-black/30"
                >
                  Comprar $350 / mes
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

          <div className="mt-8 bg-white text-black p-5 rounded-2xl flex justify-between items-center shadow-lg">
            <div>
              <p className="font-bold text-base">Te quedan {songs} canciones</p>
              <p className="text-slate-600 text-sm">≈ {versions} versiones (A y B)</p>
            </div>
            <button
              onClick={() => refreshCredits()}
              disabled={isBusy}
              className="border border-slate-300 hover:bg-slate-100 text-black px-4 py-2 rounded-full font-bold text-sm transition-colors disabled:opacity-60"
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
