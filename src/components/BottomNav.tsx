import * as React from 'react';
import { Bot, Coins, Clock3, Home, Library, Menu, Mic2, Shield, Sparkles, User, Volume2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { type ViewTab } from '@/types';

interface BottomNavProps {
  currentTab: ViewTab;
  onChange: (tab: ViewTab) => void;
  isAdmin?: boolean;
}

const mainItems: Array<{ id: ViewTab; label: string; icon: typeof Home }> = [
  { id: 'landing', label: 'Inicio', icon: Home },
  { id: 'studio', label: 'Crear', icon: Sparkles },
  { id: 'biblioteca', label: 'Mis canciones', icon: Library },
];

const menuItems: Array<{ id: ViewTab; label: string; description: string; icon: typeof Home }> = [
  { id: 'voces', label: 'Clonar voz', description: 'Crea tu perfil de voz', icon: Mic2 },
  { id: 'masterizar', label: 'Masterizar', description: 'Sonido listo para publicar', icon: Volume2 },
  { id: 'planes', label: 'Comprar créditos', description: 'Recarga tu saldo', icon: Coins },
  { id: 'luciana', label: 'LucIAna Bot', description: 'Asistente musical', icon: Bot },
  { id: 'perfil', label: 'Mi perfil', description: 'Cuenta y preferencias', icon: User },
];

const adminItems: Array<{ id: ViewTab; label: string; icon: typeof Home }> = [
  { id: 'vendedor', label: 'Vendedor', icon: Clock3 },
  { id: 'oficina', label: 'Oficina', icon: Shield },
];

export function BottomNav({ currentTab, onChange, isAdmin = false }: BottomNavProps) {
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const menuActive = menuItems.some((item) => item.id === currentTab);

  const go = (tab: ViewTab) => {
    setIsMenuOpen(false);
    onChange(tab);
  };

  const drawerItems: Array<{ id: ViewTab; label: string; description?: string; icon: typeof Home }> = [
    ...mainItems,
    ...menuItems,
    ...adminItems.filter((item) => item.id !== 'oficina' || isAdmin),
  ];

  return (
    <>
      <nav className="luciana-bottom-nav">
        {mainItems.map((item) => {
          const active = currentTab === item.id;
          return (
            <button key={item.id} type="button" onClick={() => go(item.id)} className={cn(active && 'is-active')}>
              <item.icon className="w-[21px] h-[21px]" strokeWidth={active ? 2.4 : 1.8} />
              <span>{item.label}</span>
            </button>
          );
        })}
        <button type="button" onClick={() => setIsMenuOpen(true)} className={cn((isMenuOpen || menuActive) && 'is-active')}>
          <Menu className="w-[21px] h-[21px]" />
          <span>Menú</span>
        </button>
      </nav>

      {isMenuOpen ? (
        <div className="luciana-mobile-drawer" role="dialog" aria-modal="true" aria-label="Menú principal">
          <button type="button" className="luciana-mobile-drawer-backdrop" onClick={() => setIsMenuOpen(false)} aria-label="Cerrar" />
          <section className="luciana-mobile-drawer-panel">
            <header className="luciana-mobile-drawer-header">
              <div>
                <small>Menú</small>
                <h2>LucIAna</h2>
              </div>
              <button type="button" onClick={() => setIsMenuOpen(false)} aria-label="Cerrar">
                <X className="w-5 h-5" />
              </button>
            </header>
            <nav className="luciana-mobile-drawer-list">
              {drawerItems.map((item) => {
                const active = currentTab === item.id;
                return (
                  <button key={item.id} type="button" onClick={() => go(item.id)} className={cn('luciana-mobile-drawer-item', active && 'is-active')}>
                    <item.icon className="w-[18px] h-[18px]" strokeWidth={active ? 2.25 : 1.8} />
                    <span className="luciana-mobile-drawer-text">
                      <strong>{item.label}</strong>
                      {item.description ? <small>{item.description}</small> : null}
                    </span>
                  </button>
                );
              })}
            </nav>
          </section>
        </div>
      ) : null}
    </>
  );
}
