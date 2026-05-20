import * as React from 'react';
import { Home, Sparkles, Library, User, Repeat2, Coins, Menu, X, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { type ViewTab } from '@/types';

interface BottomNavProps {
  currentTab: ViewTab;
  onChange: (tab: ViewTab) => void;
}

export function BottomNav({ currentTab, onChange }: BottomNavProps) {
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);



  const mainItems: { id: ViewTab; label: string; icon: React.ElementType }[] = [
    { id: 'inicio', label: 'Inicio', icon: Home },
    { id: 'voces', label: 'Clonador', icon: Users },
    { id: 'studio', label: 'Studio', icon: Sparkles },
    { id: 'biblioteca', label: 'Biblioteca', icon: Library },
  ];

  const menuItems: { id: ViewTab; label: string; icon: React.ElementType }[] = [
    { id: 'karaoke', label: 'Video Karaoke', icon: Repeat2 },
    { id: 'afiliados', label: 'Afiliados', icon: Coins },
    { id: 'perfil', label: 'Perfil', icon: User },
  ];

  const isMenuTab = currentTab === 'afiliados' || currentTab === 'perfil' || currentTab === 'karaoke';

  return (
    <div className="fixed bottom-0 left-0 w-full glass-panel border-b-0 border-x-0 pb-safe pt-3 z-30 bg-gradient-to-r from-indigo-500/5 via-transparent to-fuchsia-500/5">
      <div className={cn("grid items-end px-3 pb-3", mainItems.length === 3 ? "grid-cols-4" : "grid-cols-5")}>
        {mainItems.map((item) => {
          const isActive = currentTab === item.id;
          const isStudio = item.id === 'studio';

          if (isStudio) {
            return (
              <button
                key={item.id}
                onClick={() => onChange(item.id)}
                className="flex flex-col items-center gap-1 relative"
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
                "flex flex-col items-center gap-1 transition-colors min-w-[58px] py-1.5",
                isActive ? "text-slate-100" : "text-slate-500 hover:text-slate-300"
              )}
            >
              <item.icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 2} />
              <span className="text-[10px] font-medium">{item.label}</span>
            </button>
          );
        })}

        <button
          onClick={() => setIsMenuOpen(true)}
          className={cn(
            "flex flex-col items-center gap-1 transition-colors min-w-[58px] py-1.5",
            isMenuOpen || isMenuTab ? "text-slate-100" : "text-slate-500 hover:text-slate-300"
          )}
          aria-label="Menú"
          title="Menú"
        >
          <Menu className="w-5 h-5" strokeWidth={2} />
          <span className="text-[10px] font-medium">Menú</span>
        </button>
      </div>

      {isMenuOpen ? (
        <div className="fixed inset-0 z-[120] bg-black/60 flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0"
            onClick={() => setIsMenuOpen(false)}
            aria-label="Cerrar"
          />
          <div className="relative w-full max-w-md rounded-3xl shadow-2xl border border-white/10 bg-[#070a12] overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/20 via-transparent to-fuchsia-500/20" />
            <div className="relative p-5">
              <div className="flex items-center justify-between">
                <div className="gradient-text font-extrabold text-lg">Menú</div>
                <button
                  type="button"
                  onClick={() => setIsMenuOpen(false)}
                  className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/15 border border-white/10 text-slate-200 flex items-center justify-center"
                  aria-label="Cerrar"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-4">
                {menuItems.map((item) => {
                  const isActive = currentTab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setIsMenuOpen(false);
                        onChange(item.id);
                      }}
                      className={cn(
                        "flex flex-col items-center gap-2 rounded-3xl border p-4 transition-colors",
                        "bg-gradient-to-br from-indigo-500/15 via-white/5 to-fuchsia-500/15 hover:from-indigo-500/25 hover:via-white/10 hover:to-fuchsia-500/25",
                        isActive ? "border-indigo-400/45 text-slate-100" : "border-white/10 text-slate-200"
                      )}
                    >
                      <div
                        className={cn(
                          "w-14 h-14 rounded-2xl border flex items-center justify-center",
                          "bg-gradient-to-br from-indigo-500/25 via-white/10 to-fuchsia-500/20",
                          isActive ? "border-indigo-400/45 text-white" : "border-white/10 text-slate-100"
                        )}
                      >
                        <item.icon className="w-7 h-7" />
                      </div>
                      <div className={cn("text-xs font-extrabold", isActive ? "text-slate-100" : "text-slate-200")}>
                        {item.label}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
