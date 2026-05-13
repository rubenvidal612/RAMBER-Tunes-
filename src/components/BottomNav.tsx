import * as React from 'react';
import { Home, Sparkles, Library, User, Repeat2, Coins } from 'lucide-react';
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
  const leftItems = items.filter((x) => x.id === 'inicio' || x.id === 'convertidor');
  const rightItems = items.filter((x) => x.id === 'biblioteca' || x.id === 'afiliados' || x.id === 'perfil');
  const studioItem = items.find((x) => x.id === 'studio')!;

  return (
    <div className="fixed bottom-0 left-0 w-full glass-panel border-b-0 border-x-0 pb-safe pt-3 z-30 bg-gradient-to-r from-indigo-500/5 via-transparent to-fuchsia-500/5">
      <div className="flex items-center px-3 pb-3">
        <div className="flex-1 flex items-center justify-start">
          <div className="flex items-center justify-start min-w-max">
            {leftItems.map((item) => {
              const isActive = currentTab === item.id;
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

        <div className="shrink-0">
          {(() => {
            const isActive = currentTab === studioItem.id;
            return (
              <button
                key={studioItem.id}
                onClick={() => onChange(studioItem.id)}
                className="flex flex-col items-center gap-1 min-w-[76px] mx-3 relative"
              >
                <div className={cn(
                  "w-12 h-12 rounded-full flex items-center justify-center transition-transform relative z-10",
                  "bg-gradient-to-br from-[#6366f1] to-[#a855f7] text-white shadow-lg shadow-indigo-500/25",
                  isActive ? "scale-105" : "scale-100 opacity-90"
                )}>
                  <studioItem.icon className="w-6 h-6 text-white" strokeWidth={1.5} />
                </div>
                <span className="text-[10px] font-medium text-slate-300">{studioItem.label}</span>
              </button>
            );
          })()}
        </div>

        <div className="flex-1 flex items-center justify-end">
          <div className="max-w-[150px] overflow-x-auto scrollbar-hide sm:max-w-none">
            <div className="flex items-center justify-start min-w-max">
              {rightItems.map((item) => {
                const isActive = currentTab === item.id;
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
        </div>
      </div>
    </div>
  );
}
