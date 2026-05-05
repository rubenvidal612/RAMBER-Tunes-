import { Menu, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TopBarProps {
  className?: string;
  onMenuClick?: () => void;
  onRefreshClick?: () => void;
  onCreditsClick?: () => void;
  credits?: number;
  bankCredits?: number | null;
  showBank?: boolean;
  isUpdateAvailable?: boolean;
  isRefreshing?: boolean;
}

export function TopBar({ className, onMenuClick, onRefreshClick, onCreditsClick, credits, bankCredits, showBank, isUpdateAvailable, isRefreshing }: TopBarProps) {
  const hot = Boolean(isUpdateAvailable);
  return (
    <header className={cn('flex items-center justify-between px-4 py-3 border-b border-white/10 bg-gradient-to-r from-[#070a12] via-indigo-950/50 to-black/60 backdrop-blur-xl z-20', className)}>
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
        <button
          onClick={onRefreshClick}
          className={cn(
            "w-9 h-9 rounded-full flex items-center justify-center transition-colors relative border",
            hot
              ? "bg-red-500/20 hover:bg-red-500/25 text-red-200 border-red-400/30"
              : "bg-white/5 hover:bg-white/10 text-slate-300 border-white/10"
          )}
        >
          <RefreshCw className={cn("w-4 h-4", isRefreshing ? "animate-spin" : "", hot ? "animate-pulse" : "")} />
        </button>
        
        <button
          type="button"
          onClick={onCreditsClick}
          className="flex items-center gap-2 bg-white/5 hover:bg-white/10 rounded-full px-3 py-1.5 border border-white/10 transition-colors"
        >
          <div className="w-5 h-5 rounded-full bg-yellow-500 flex items-center justify-center text-black font-bold text-xs">♪</div>
          <span className="text-sm font-semibold text-slate-200">{credits || 0} Créditos</span>
        </button>

        {showBank ? (
          <div className="hidden md:flex items-center gap-2 bg-white/5 rounded-full px-3 py-1.5 border border-white/10">
            <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center text-black font-bold text-[10px]">B</div>
            <span className="text-sm font-semibold text-slate-200">{Number(bankCredits ?? 0)} Banco</span>
          </div>
        ) : null}

        <button onClick={onMenuClick} className="p-2 -mr-2 text-slate-300 hover:text-white transition-colors">
          <Menu className="w-6 h-6" />
        </button>
      </div>
    </header>
  );
}
