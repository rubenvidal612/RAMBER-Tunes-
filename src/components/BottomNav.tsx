import * as React from 'react';
import { Home, Sparkles, Library, User, Repeat2, Coins, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { type ViewTab } from '@/types';

interface BottomNavProps {
  currentTab: ViewTab;
  onChange: (tab: ViewTab) => void;
}

export function BottomNav({ currentTab, onChange }: BottomNavProps) {
  const items: { id: ViewTab; label: string; icon: React.ElementType }[] = [
    { id: 'inicio', label: 'Inicio', icon: Home },
    { id: 'convertidor', label: 'Clonar Voz', icon: Repeat2 },
    { id: 'studio', label: 'Studio', icon: Sparkles },
    { id: 'biblioteca', label: 'Biblioteca', icon: Library },
    { id: 'afiliados', label: 'Afiliados', icon: Coins },
    { id: 'perfil', label: 'Perfil', icon: User },
  ];

  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const studioRef = React.useRef<HTMLButtonElement | null>(null);
  const [showLeftHint, setShowLeftHint] = React.useState(false);
  const [showRightHint, setShowRightHint] = React.useState(false);

  const updateHints = React.useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const left = el.scrollLeft;
    const eps = 6;
    setShowLeftHint(left > eps);
    setShowRightHint(max - left > eps);
  }, []);

  const centerStudio = React.useCallback(() => {
    const scroller = scrollRef.current;
    const studio = studioRef.current;
    if (!scroller || !studio) return;
    const scrollerRect = scroller.getBoundingClientRect();
    const studioRect = studio.getBoundingClientRect();
    const studioCenter = (studioRect.left - scrollerRect.left) + (studioRect.width / 2);
    const target = Math.max(0, studioCenter - (scroller.clientWidth / 2));
    scroller.scrollLeft = target;
    updateHints();
  }, [updateHints]);

  React.useLayoutEffect(() => {
    const raf = requestAnimationFrame(() => {
      centerStudio();
      requestAnimationFrame(() => centerStudio());
    });
    const onResize = () => centerStudio();
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
    };
  }, [centerStudio]);

  React.useEffect(() => {
    updateHints();
  }, [updateHints]);

  return (
    <div className="fixed bottom-0 left-0 w-full glass-panel border-b-0 border-x-0 pb-safe pt-3 z-30 bg-gradient-to-r from-indigo-500/5 via-transparent to-fuchsia-500/5">
      <div className="relative px-3 pb-3">
        <div
          ref={scrollRef}
          onScroll={updateHints}
          className="flex items-center justify-center overflow-x-auto scrollbar-hide overscroll-x-contain"
        >
          <div className="flex items-center justify-center min-w-max gap-0">
            {items.map((item) => {
              const isActive = currentTab === item.id;
              const isStudio = item.id === 'studio';

              if (isStudio) {
                return (
                  <button
                    ref={studioRef}
                    key={item.id}
                    onClick={() => onChange(item.id)}
                    className="flex flex-col items-center gap-1 min-w-[76px] mx-3 relative"
                  >
                    <div className={cn(
                      "w-12 h-12 rounded-full flex items-center justify-center transition-transform relative z-10",
                      "bg-gradient-to-br from-[#6366f1] to-[#a855f7] text-white shadow-lg shadow-indigo-500/25",
                      isActive ? "scale-105" : "scale-100 opacity-90"
                    )}>
                      <item.icon className="w-6 h-6 text-white" strokeWidth={1.5} />
                    </div>
                    <span className="text-[10px] font-medium text-slate-300">{item.label}</span>
                  </button>
                );
              }

              return (
                <button
                  key={item.id}
                  onClick={() => onChange(item.id)}
                  className={cn(
                    "flex flex-col items-center gap-1 transition-colors min-w-[58px] mx-1.5 py-1.5",
                    isActive ? "text-slate-100" : "text-slate-500 hover:text-slate-300"
                  )}
                >
                  <item.icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 2} />
                  <span className="text-[10px] font-medium">{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {showLeftHint ? (
          <div className="pointer-events-none absolute left-0 top-0 bottom-0 flex items-center pl-1">
            <div className="w-9 h-9 rounded-full bg-black/30 border border-white/10 text-slate-200 flex items-center justify-center">
              <ChevronLeft className="w-5 h-5" />
            </div>
          </div>
        ) : null}
        {showRightHint ? (
          <div className="pointer-events-none absolute right-0 top-0 bottom-0 flex items-center pr-1">
            <div className="w-9 h-9 rounded-full bg-black/30 border border-white/10 text-slate-200 flex items-center justify-center">
              <ChevronRight className="w-5 h-5" />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
