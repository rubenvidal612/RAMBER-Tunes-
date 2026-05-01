import { Home, Sparkles, Video, Music, Image as ImageIcon, ListMusic, Coins, HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { type ViewTab } from '@/types';

interface SidebarProps {
  currentTab: ViewTab;
  onChange: (tab: ViewTab) => void;
}

export function Sidebar({ currentTab, onChange }: SidebarProps) {
  return (
    <div className="w-[240px] flex flex-col glass-panel border-y-0 border-l-0 overflow-y-auto">
      <div className="p-4 space-y-6">
        
        {/* EXPLORAR */}
        <div>
          <div className="text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Explorar</div>
          <button 
            onClick={() => onChange('inicio')}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors",
              currentTab === 'inicio'
                ? "bg-indigo-500/20 text-indigo-400 font-bold"
                : "text-slate-400 hover:text-white hover:bg-white/5 font-medium"
            )}
          >
            <Home className="w-5 h-5" />
            <span className="text-sm">Destacados</span>
          </button>
        </div>

        {/* CREAR */}
        <div>
          <div className="text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Crear</div>
          <button 
            onClick={() => onChange('studio')}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors mb-1",
              currentTab === 'studio' || currentTab === 'biblioteca' 
                ? "bg-indigo-500/20 text-indigo-400 font-bold" 
                : "text-slate-400 hover:text-white hover:bg-white/5 font-medium"
            )}
          >
            <Sparkles className="w-5 h-5" />
            <span className="text-sm">Música IA</span>
          </button>
          <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors mb-1">
            <Music className="w-5 h-5" />
            <span className="text-sm font-medium">Cover IA</span>
          </button>
          <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors">
            <Video className="w-5 h-5" />
            <span className="text-sm font-medium">Video musical IA</span>
          </button>
        </div>

        {/* BIBLIOTECA */}
        <div>
          <div className="text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Biblioteca</div>
          <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors mb-1">
            <ListMusic className="w-5 h-5" />
            <span className="text-sm font-medium">Canciones</span>
          </button>
          <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors mb-1">
            <ImageIcon className="w-5 h-5" />
            <span className="text-sm font-medium">Vibes</span>
          </button>
          <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors mb-1">
            <ListMusic className="w-5 h-5" />
            <span className="text-sm font-medium">Playlists</span>
          </button>
          <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors">
            <Video className="w-5 h-5" />
            <span className="text-sm font-medium">Videos musicales</span>
          </button>
        </div>

        {/* GANAR CRÉDITOS */}
        <div>
          <div className="text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Ganar créditos</div>
          <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors">
            <Coins className="w-5 h-5" />
            <span className="text-sm font-medium">Centro de misiones</span>
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
