import { Menu, Bell } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TopBarProps {
  className?: string;
  onMenuClick?: () => void;
  onCreditsClick?: () => void;
  credits?: number;
}

export function TopBar({ className, onMenuClick, onCreditsClick, credits }: TopBarProps) {
  return (
    <header className={cn('flex items-center justify-between px-4 py-3 border-b border-white/5 bg-black/50 backdrop-blur-xl z-20', className)}>
      <div className="flex items-center gap-2">
        <span className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
          {/* Logo mock replacing SVG */}
          <div className="w-9 h-9 rounded-full bg-yellow-400 text-black flex items-center justify-center font-light text-2xl shadow-[0_0_18px_rgba(250,204,21,0.35)]">
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
        
        <button
          type="button"
          onClick={onCreditsClick}
          className="flex items-center gap-2 bg-white/5 hover:bg-white/10 rounded-full px-3 py-1.5 border border-white/10 transition-colors"
        >
          <div className="w-5 h-5 rounded-full bg-yellow-500 flex items-center justify-center text-black font-bold text-xs">♪</div>
          <span className="text-sm font-semibold text-slate-200">{credits || 0} Créditos</span>
        </button>
        
        <button className="w-10 h-10 rounded-full bg-yellow-400 flex items-center justify-center text-black font-light text-2xl shadow-[0_0_18px_rgba(250,204,21,0.35)] overflow-hidden">
          R
        </button>

        <button onClick={onMenuClick} className="p-2 -mr-2 text-slate-300 hover:text-white transition-colors">
          <Menu className="w-6 h-6" />
        </button>
      </div>
    </header>
  );
}
