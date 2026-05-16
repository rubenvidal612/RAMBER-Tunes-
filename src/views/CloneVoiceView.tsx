import React from 'react';
import { Mic, Construction } from 'lucide-react';

export function CloneVoiceView() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 md:p-6 text-center">
      <div className="max-w-md w-full space-y-8 animate-in fade-in zoom-in duration-500">
        <div className="relative mx-auto w-24 h-24">
          <div className="absolute inset-0 bg-purple-500/20 rounded-full blur-2xl animate-pulse" />
          <div className="relative w-24 h-24 rounded-3xl bg-gradient-to-br from-purple-600 to-indigo-600 border border-white/20 flex items-center justify-center shadow-2xl">
            <Mic className="w-12 h-12 text-white" />
          </div>
          <div className="absolute -bottom-2 -right-2 w-10 h-10 rounded-2xl bg-slate-800 border border-white/10 flex items-center justify-center shadow-lg">
            <Construction className="w-5 h-5 text-yellow-400" />
          </div>
        </div>

        <div className="space-y-4">
          <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-400">
            Próximamente
          </h1>
          <p className="text-lg text-slate-300 leading-relaxed">
            Estamos perfeccionando la tecnología de clonación de voz para ofrecerte la mejor calidad posible. 
          </p>
        </div>

        <div className="p-6 glass-card rounded-3xl border border-white/10 bg-white/5 space-y-4">
          <div className="flex items-center gap-4 text-left">
            <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center shrink-0">
              <div className="w-2 h-2 rounded-full bg-purple-400 animate-ping" />
            </div>
            <div>
              <div className="text-sm font-bold text-white">Entrenamiento RVC v2</div>
              <div className="text-xs text-slate-400">En fase de optimización final</div>
            </div>
          </div>
          <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 w-[85%] rounded-full shadow-[0_0_10px_rgba(168,85,247,0.5)]" />
          </div>
          <div className="text-[10px] text-slate-500 text-right font-medium tracking-wider uppercase">
            Progreso: 85%
          </div>
        </div>

        <p className="text-sm text-slate-500 italic">
          Muy pronto podrás crear tu propia identidad vocal digital.
        </p>
      </div>
    </div>
  );
}
