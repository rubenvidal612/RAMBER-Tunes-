import { Menu } from 'lucide-react';
import { cn } from '@/lib/utils';

export function TopBar({ className }: { className?: string }) {
  return (
    <header className={cn('flex items-center justify-between px-4 py-3 glass-panel border-x-0 border-t-0 border-white/10 z-10', className)}>
      <button className="p-2 -ml-2 text-white">
        <Menu className="w-6 h-6" />
      </button>
      <div className="flex items-center gap-2">
        <span className="text-xl font-bold tracking-tight text-white flex items-center gap-1">
          <svg
            viewBox="0 0 24 24"
            width="24"
            height="24"
            stroke="currentColor"
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-primary w-6 h-6"
          >
            <path d="M9 18V5l12-2v13"></path>
            <circle cx="6" cy="18" r="3"></circle>
            <circle cx="18" cy="16" r="3"></circle>
          </svg>
          <span className="text-base font-bold gradient-text">Maquetas</span>
        </span>
      </div>
      <div className="flex items-center gap-1.5 glass-card rounded-full px-3 py-1.5">
        <div className="w-5 h-5 rounded-full bg-yellow-500 flex items-center justify-center">
          <span className="text-black text-[10px] font-bold">♪</span>
        </div>
        <span className="text-sm font-semibold text-white">5100</span>
      </div>
    </header>
  );
}
