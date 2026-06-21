import { useState } from 'react';
import { Check, Sparkles } from 'lucide-react';
import { useUserCredits } from '@/hooks/useUserCredits';
import { getAccessToken } from '@/lib/supabaseBrowser';
import { CREDIT_COSTS } from '@/lib/credits';
const isDev = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

interface PricingViewProps {
  onClose: () => void;
}

export function PricingView({ onClose }: PricingViewProps) {
  const { credits, refreshCredits } = useUserCredits();
  const [isBusy, setIsBusy] = useState(false);

  const songs = Math.floor((credits || 0) / CREDIT_COSTS.generate_music);
  const versions = songs * 2;

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

  return (
    <div className="flex flex-col h-full w-full bg-[#0a0a0a] overflow-y-auto animate-in slide-in-from-bottom-8 duration-300 z-[200] fixed inset-0 pb-safe text-white md:bg-black/80 md:backdrop-blur-sm md:items-center md:justify-center md:p-8">
      
      <div className="w-full h-full flex flex-col md:h-[90vh] md:max-w-4xl md:bg-[#0a0a0a] md:border md:border-white/10 md:rounded-3xl md:overflow-hidden md:shadow-2xl">
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

        <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-3 flex items-center gap-2 text-indigo-300 font-medium text-sm">
          <Sparkles className="w-4 h-4" /> Cada canción crea 2 versiones (A y B)
        </div>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-sm text-slate-300 space-y-2">
          <p className="font-semibold text-white">Importante sobre los planes</p>
          <p>Los precios son mensuales.</p>
          <p>Si no gastas todo tu saldo, en tu siguiente pago se suma al nuevo saldo.</p>
          <p>El saldo dura hasta 2 meses. Si en 2 meses no se recibe tu pago, el saldo acumulado se elimina.</p>
          <p>El saldo acumulado tiene un tope de 2,000 créditos.</p>
        </div>

        {/* Saldo actual */}
        <div className="bg-indigo-500/5 border border-indigo-500/10 rounded-2xl p-5 mt-4">
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

        <div className="grid grid-cols-1 gap-5">

          {/* Pack Inicio */}
          <div className="bg-gradient-to-b from-blue-900/30 to-transparent border border-blue-500/20 rounded-3xl p-6 relative overflow-hidden">
            <div className="flex justify-between items-start mb-2">
              <div>
                <h3 className="text-xl font-bold text-white">Pack Inicio</h3>
                <p className="text-slate-300 text-sm mt-1">200 canciones • 1200 créditos</p>
                <p className="text-slate-400 text-sm mt-1">Ideal para empezar • Plan mensual</p>
              </div>
            </div>

            <div className="flex items-end gap-2 mt-4 mb-6">
              <div className="flex flex-col">
                <span className="text-lg font-bold text-slate-400 line-through">$375 MXN</span>
                <div className="flex items-center gap-2">
                  <span className="text-4xl font-bold text-white">$199 MXN</span>
                  <span className="text-slate-300 text-sm font-semibold">/ mes</span>
                  <span className="bg-red-500 text-white px-3 py-1 rounded-full text-xs font-bold">PROMO</span>
                </div>
              </div>
              <span className="bg-blue-500/20 text-blue-300 px-3 py-1 rounded-full text-sm font-semibold mb-1">200 versiones</span>
            </div>

            <div className="space-y-3 mb-6">
              <div className="flex items-center gap-3 text-slate-300 text-sm">
                <Check className="w-5 h-5 text-blue-500" /> Incluye 200 canciones
              </div>
              <div className="flex items-center gap-3 text-slate-300 text-sm">
                <Check className="w-5 h-5 text-blue-500" /> Total: 1200 créditos
              </div>
              <div className="flex items-center gap-3 text-slate-300 text-sm">
                <Check className="w-5 h-5 text-blue-500" /> Incluye ChatBot
              </div>
              <div className="flex items-center gap-3 text-slate-300 text-sm">
                <Check className="w-5 h-5 text-blue-500" /> Descargas activas
              </div>
              <div className="flex items-center gap-3 text-slate-300 text-sm">
                <Check className="w-5 h-5 text-blue-500" /> Karaoke / STEMS
              </div>
              <div className="flex items-start gap-3 text-slate-300 text-sm">
                <Check className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                <span>Saldo mensual acumulable si renuevas a tiempo</span>
              </div>
              <div className="flex items-start gap-3 text-slate-300 text-sm">
                <Check className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                <span>El saldo no usado dura hasta 2 meses</span>
              </div>
              <div className="flex items-start gap-3 text-slate-300 text-sm">
                <Check className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                <span>Video MP4 con autor (opcional)<br/>Marca de agua: LucIAna</span>
              </div>
            </div>

            <button
              onClick={() => buy('inicio')}
              disabled={isBusy}
              className="w-full bg-blue-500 hover:bg-blue-400 text-white h-[48px] rounded-full font-bold text-base transition-colors disabled:opacity-60"
            >
              Comprar ahora
            </button>
          </div>

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
