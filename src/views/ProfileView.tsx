import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Edit2, Forward, Settings, ChevronRight, Share, HelpCircle, MessageSquare, FileText, Shield, RefreshCw } from 'lucide-react';

export function ProfileView() {
  const [activeTab, setActiveTab] = useState<'canciones' | 'listas'>('canciones');
  const [showSettings, setShowSettings] = useState(false);

  if (showSettings) {
    return <SettingsView onClose={() => setShowSettings(false)} />;
  }

  return (
    <div className="flex-1 flex flex-col pt-4 overflow-y-auto w-full relative z-10">
      {/* Profile Header */}
      <div className="flex items-center justify-between px-6 mb-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-2xl font-bold text-indigo-300">
            R
          </div>
          <h2 className="text-2xl font-bold text-white">Ruben</h2>
        </div>
        <button onClick={() => setShowSettings(true)} className="p-2 text-slate-400 hover:text-white transition-colors glass-card rounded-full">
          <Settings className="w-5 h-5" />
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-2 px-6 mb-6 text-center">
        <div className="flex flex-col items-center">
          <span className="text-lg font-bold text-slate-100">0</span>
          <span className="text-xs text-slate-400">Escuchas</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-lg font-bold text-slate-100">0</span>
          <span className="text-xs text-slate-400">Me gusta</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-lg font-bold text-slate-100">0</span>
          <span className="text-xs text-slate-400">Seguidores</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-lg font-bold text-slate-100">0</span>
          <span className="text-xs text-slate-400">Siguiendo</span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-4 px-6 mb-8">
        <button className="flex-1 py-2.5 rounded-full glass-card border border-indigo-500/50 text-indigo-300 font-semibold flex items-center justify-center gap-2 hover:bg-indigo-500/10 transition-colors text-sm">
          <Edit2 className="w-4 h-4" /> Editar perfil
        </button>
        <button className="flex-1 py-2.5 rounded-full glass-card border border-white/10 text-slate-200 font-semibold flex items-center justify-center gap-2 hover:bg-white/5 transition-colors text-sm">
          <Forward className="w-4 h-4" /> Compartir
        </button>
      </div>

      {/* Tabs */}
      <div className="flex px-6 border-b border-white/10 space-x-6 mb-6">
        {(['canciones', 'listas'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "py-3 text-sm font-semibold capitalize relative transition-colors",
              activeTab === tab ? "text-slate-100" : "text-slate-500"
            )}
          >
            {tab}
            {activeTab === tab && (
              <div className="absolute bottom-0 left-0 w-full h-[2px] bg-gradient-to-r from-indigo-400 to-purple-400 rounded-t-full" />
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 px-6 flex flex-col items-center justify-center text-center pb-8 mt-[-30px]">
        <div className="w-24 h-24 mb-6 text-slate-600 opacity-50 relative flex items-center justify-center">
          <div className="w-16 h-12 border-2 border-current rounded-t-md border-b-0 space-y-1 p-2">
             <div className="w-2 h-0.5 bg-current rounded-full" />
          </div>
          <div className="absolute top-0 flex gap-2">
            <div className="w-1 h-3 bg-current rounded-full rotate-[-30deg] -ml-4" />
            <div className="w-1 h-4 bg-current rounded-full -mt-2" />
            <div className="w-1 h-3 bg-current rounded-full rotate-[30deg] -mr-4" />
          </div>
        </div>
        <p className="text-slate-400 font-medium text-sm mb-6 max-w-[260px]">
          No hay nada aquí, ¡es hora de hacer historia!
        </p>
        <button className="bg-gradient-to-r from-indigo-500 to-purple-600 hover:opacity-90 transition-all text-white font-bold text-sm px-6 py-2.5 rounded-full shadow-lg shadow-indigo-500/20">
          ¡Comenzar ahora!
        </button>
      </div>
    </div>
  );
}

function SettingsView({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto animate-in slide-in-from-right-8 duration-300 z-50 bg-black/40 backdrop-blur-3xl absolute inset-0 pb-safe">
      <div className="flex items-center gap-4 p-4 sticky top-0 bg-transparent z-10 backdrop-blur-xl border-b border-white/5">
        <button onClick={onClose} className="p-2 text-slate-300 hover:text-white glass-card rounded-full">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6"><path d="M15 18l-6-6 6-6"></path></svg>
        </button>
      </div>

      <div className="p-6 space-y-6">
        <div className="flex items-center gap-4 mb-2">
          <div className="w-16 h-16 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-2xl font-bold text-indigo-300">
            R
          </div>
          <h2 className="text-2xl font-bold text-white">Ruben</h2>
        </div>

        <div className="glass-card rounded-2xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-yellow-500 flex items-center justify-center text-black font-bold text-xs">♪</div>
            <span className="font-semibold text-slate-200">5100 Créditos</span>
            <HelpCircle className="w-4 h-4 text-slate-500" />
          </div>
          <button className="bg-gradient-to-r from-[#6366f1] to-[#a855f7] text-white font-semibold text-xs px-4 py-2 rounded-full hover:opacity-90 transition-opacity">
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
           <button className="text-slate-400 text-sm font-medium hover:text-white transition-colors underline underline-offset-4">Cerrar sesión</button>
        </div>
      </div>
    </div>
  );
}
