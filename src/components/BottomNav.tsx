import * as React from 'react';
import { Home, Sparkles, Library, User, Menu, X, Users, MessageCircleMore, Volume2, Clock3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { type ViewTab } from '@/types';

function WhatsAppIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 32 32" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M19.11 17.79c-.27-.14-1.6-.79-1.85-.88-.25-.09-.43-.14-.61.14-.18.27-.7.88-.86 1.06-.16.18-.32.2-.59.07-.27-.14-1.14-.42-2.17-1.34-.8-.71-1.34-1.6-1.5-1.86-.16-.27-.02-.41.12-.55.12-.12.27-.32.41-.48.14-.16.18-.27.27-.45.09-.18.05-.34-.02-.48-.07-.14-.61-1.47-.84-2.01-.22-.53-.45-.46-.61-.47l-.52-.01c-.18 0-.48.07-.73.34-.25.27-.95.93-.95 2.27 0 1.34.98 2.63 1.12 2.81.14.18 1.93 2.95 4.68 4.14.65.28 1.16.45 1.55.58.65.21 1.25.18 1.72.11.53-.08 1.6-.65 1.83-1.28.23-.63.23-1.17.16-1.28-.07-.11-.25-.18-.52-.32z" />
      <path d="M26.69 5.3A14.92 14.92 0 0 0 16.05 1C7.85 1 1.18 7.67 1.18 15.87c0 2.62.69 5.18 2 7.44L1 31l7.86-2.06a14.8 14.8 0 0 0 7.19 1.83h.01c8.2 0 14.87-6.67 14.87-14.87 0-3.97-1.55-7.71-4.24-10.4zm-10.64 23.0h-.01c-2.22 0-4.4-.6-6.3-1.74l-.45-.27-4.66 1.22 1.25-4.54-.29-.47a12.3 12.3 0 0 1-1.89-6.6c0-6.78 5.52-12.3 12.3-12.3 3.28 0 6.36 1.28 8.68 3.6a12.2 12.2 0 0 1 3.6 8.68c0 6.78-5.52 12.3-12.3 12.3z" />
    </svg>
  );
}

interface BottomNavProps {
  currentTab: ViewTab;
  onChange: (tab: ViewTab) => void;
}

type MenuItem =
  | { kind: 'tab'; id: ViewTab; label: string; icon: React.ElementType }
  | { kind: 'link'; href: string; label: string; icon: React.ElementType };

export function BottomNav({ currentTab, onChange }: BottomNavProps) {
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);



  const mainItems: { id: ViewTab; label: string; icon: React.ElementType }[] = [
    { id: 'inicio', label: 'Canciones', icon: Home },
    { id: 'landing', label: 'Inicio', icon: MessageCircleMore },
    { id: 'studio', label: 'Crear', icon: Sparkles },
    { id: 'biblioteca', label: 'Biblioteca', icon: Library },
  ];

  const menuItems: MenuItem[] = [
    { kind: 'tab', id: 'luciana', label: 'LucIAna Bot', icon: MessageCircleMore },
    { kind: 'link', href: 'https://wa.me/529931520202', label: 'WhatsApp', icon: WhatsAppIcon },
    { kind: 'tab', id: 'masterizar', label: 'Masterizar', icon: Volume2 },
    { kind: 'tab', id: 'voces', label: 'Clonador', icon: Users },
    { kind: 'tab', id: 'vendedor', label: 'Vendedor', icon: Clock3 },
    { kind: 'tab', id: 'perfil', label: 'Perfil', icon: User },
  ];

  const isMenuTab = currentTab === 'voces' || currentTab === 'perfil' || currentTab === 'karaoke' || currentTab === 'masterizar' || currentTab === 'vendedor' || currentTab === 'luciana';

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
                  const isActive = item.kind === 'tab' ? currentTab === item.id : false;
                  return (
                    <button
                      key={item.kind === 'tab' ? item.id : item.href}
                      type="button"
                      onClick={() => {
                        setIsMenuOpen(false);
                        if (item.kind === 'tab') {
                          onChange(item.id);
                          return;
                        }
                        try {
                          const w = window.open(item.href, '_blank', 'noopener,noreferrer');
                          if (w) {
                            try {
                              (w as any).opener = null;
                            } catch {}
                            return;
                          }
                        } catch {}
                        try {
                          window.location.href = item.href;
                        } catch {}
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
