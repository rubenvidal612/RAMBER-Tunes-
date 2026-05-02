import { Menu, Bell } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TopBarProps {
  className?: string;
  onMenuClick?: () => void;
  credits?: number;
}

export function TopBar({ className, onMenuClick, credits }: TopBarProps) {
  return (
    <header className={cn('flex items-center justify-between px-4 py-3 border-b border-white/5 bg-black/50 backdrop-blur-xl z-20', className)}>
      <div className="flex items-center gap-2">
        <span className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
          {/* Logo mock replacing SVG */}
          <div className="w-8 h-8 rounded-full bg-green-500/20 text-green-400 flex items-center justify-center font-serif italic text-lg shadow-[0_0_15px_rgba(74,222,128,0.2)]">
            R
          </div>
          <span className="text-base font-bold text-slate-100">RAMBER Tunes</span>
        </span>
      </div>
      
      <div className="flex items-center gap-3">
        <button className="w-9 h-9 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-300 transition-colors relative">
           <Bell className="w-4 h-4" />
           <div className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-[2px] border-black" />
        </button>
        
        <div className="flex items-center gap-2 bg-white/5 rounded-full px-3 py-1.5 border border-white/10">
          <div className="w-5 h-5 rounded-full bg-yellow-500 flex items-center justify-center text-black font-bold text-xs">♪</div>
          <span className="text-sm font-semibold text-slate-200">{credits || 0} Créditos</span>
        </div>
        
        <button className="w-9 h-9 rounded-full bg-teal-600 flex items-center justify-center text-white font-bold text-sm shadow-inner overflow-hidden">
          R
        </button>

        <button onClick={onMenuClick} className="p-2 -mr-2 text-slate-300 hover:text-white transition-colors">
          <Menu className="w-6 h-6" />
        </button>
      </div>
    </header>
  );
}
