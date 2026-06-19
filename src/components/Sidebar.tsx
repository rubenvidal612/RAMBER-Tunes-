import { Home, Sparkles, Library, User, MessageCircleMore, HelpCircle, Repeat2, Users, Volume2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { type ViewTab } from '@/types';


interface SidebarProps {
  currentTab: ViewTab;
  onChange: (tab: ViewTab) => void;
}

export function Sidebar({ currentTab, onChange }: SidebarProps) {
  return (
    <div className="w-[240px] flex flex-col glass-panel border-y-0 border-l-0 overflow-y-auto bg-gradient-to-b from-indigo-500/5 via-transparent to-fuchsia-500/5">
      <div className="p-4 space-y-6">
        
        <div>
          <div className="text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Menú</div>

          <button
            onClick={() => onChange('inicio')}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors mb-1",
              currentTab === 'inicio'
                ? "bg-indigo-500/20 text-indigo-400 font-bold"
                : "text-slate-400 hover:text-white hover:bg-white/5 font-medium"
            )}
          >
            <Home className="w-5 h-5" />
            <span className="text-sm">Inicio</span>
          </button>

          <button
            onClick={() => onChange('karaoke')}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors mb-1",
              currentTab === 'karaoke'
                ? "bg-indigo-500/20 text-indigo-400 font-bold"
                : "text-slate-400 hover:text-white hover:bg-white/5 font-medium"
            )}
          >
            <Repeat2 className="w-5 h-5" />
            <span className="text-sm">Video Karaoke</span>
          </button>

          <button
            onClick={() => onChange('voces')}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors mb-1",
              currentTab === 'voces'
                ? "bg-indigo-500/20 text-indigo-400 font-bold"
                : "text-slate-400 hover:text-white hover:bg-white/5 font-medium"
            )}
          >
            <Users className="w-5 h-5" />
            <span className="text-sm">Clonador de Voz</span>
          </button>

          <button
            onClick={() => onChange('studio')}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors mb-1",
              currentTab === 'studio'
                ? "bg-indigo-500/20 text-indigo-400 font-bold"
                : "text-slate-400 hover:text-white hover:bg-white/5 font-medium"
            )}
          >
            <Sparkles className="w-5 h-5" />
            <span className="text-sm">Crear</span>
          </button>

          <button
            onClick={() => onChange('masterizar')}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors mb-1",
              currentTab === 'masterizar'
                ? "bg-indigo-500/20 text-indigo-400 font-bold"
                : "text-slate-400 hover:text-white hover:bg-white/5 font-medium"
            )}
          >
            <Volume2 className="w-5 h-5" />
            <span className="text-sm">Masterizar Ilimitado</span>
          </button>

          <button
            onClick={() => onChange('biblioteca')}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors mb-1",
              currentTab === 'biblioteca'
                ? "bg-indigo-500/20 text-indigo-400 font-bold"
                : "text-slate-400 hover:text-white hover:bg-white/5 font-medium"
            )}
          >
            <Library className="w-5 h-5" />
            <span className="text-sm">Biblioteca</span>
          </button>

          <button
            onClick={() => onChange('perfil')}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors",
              currentTab === 'perfil'
                ? "bg-indigo-500/20 text-indigo-400 font-bold"
                : "text-slate-400 hover:text-white hover:bg-white/5 font-medium"
            )}
          >
            <User className="w-5 h-5" />
            <span className="text-sm">Perfil</span>
          </button>
        </div>

        {/* ASISTENTE */}
        <div>
          <div className="text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Asistente</div>
          <button
            onClick={() => onChange('luciana')}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors",
              currentTab === 'luciana'
                ? "bg-indigo-500/20 text-indigo-400 font-bold"
                : "text-slate-400 hover:text-white hover:bg-white/5 font-medium"
            )}
          >
            <MessageCircleMore className="w-5 h-5" />
            <span className="text-sm">LucIAna Bot</span>
          </button>
        </div>
        
      </div>
      
      <div className="px-4 pb-6 mt-auto">
        <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors">
          <HelpCircle className="w-5 h-5" />
          <span className="text-sm font-medium">Centro de ayuda</span>
        </button>
      </div>

    </div>
  );
}
