import * as React from 'react';
import { Bot, Coins, Home, Library, Menu, Mic2, Sparkles, User, Volume2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { type ViewTab } from '@/types';

interface BottomNavProps {
  currentTab: ViewTab;
  onChange: (tab: ViewTab) => void;
}

const mainItems: Array<{ id: ViewTab; label: string; icon: typeof Home }> = [
  { id: 'landing', label: 'Inicio', icon: Home },
  { id: 'studio', label: 'Crear', icon: Sparkles },
  { id: 'biblioteca', label: 'Mi música', icon: Library },
];

const menuItems: Array<{ id: ViewTab; label: string; description: string; icon: typeof Home }> = [
  { id: 'voces', label: 'Clonar voz', description: 'Crea tu perfil de voz', icon: Mic2 },
  { id: 'masterizar', label: 'Masterizar', description: 'Sonido listo para publicar', icon: Volume2 },
  { id: 'planes', label: 'Comprar créditos', description: 'Recarga tu saldo', icon: Coins },
  { id: 'luciana', label: 'LucIAna Bot', description: 'Asistente musical', icon: Bot },
  { id: 'perfil', label: 'Mi perfil', description: 'Cuenta y preferencias', icon: User },
];

export function BottomNav({ currentTab, onChange }: BottomNavProps) {
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const menuActive = menuItems.some((item) => item.id === currentTab);

  const go = (tab: ViewTab) => {
    onChange(tab);
    setIsMenuOpen(false);
  };

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
        <div className="luciana-mobile-menu" role="dialog" aria-modal="true" aria-label="Menú principal">
          <button type="button" className="luciana-mobile-menu-backdrop" onClick={() => setIsMenuOpen(false)} aria-label="Cerrar" />
          <section>
            <header>
              <div><small>LucIAna Music</small><h2>Todo lo que necesitas</h2></div>
              <button type="button" onClick={() => setIsMenuOpen(false)} aria-label="Cerrar"><X className="w-5 h-5" /></button>
            </header>
            <div className="luciana-mobile-menu-grid">
              {menuItems.map((item) => (
                <button key={item.id} type="button" onClick={() => go(item.id)} className={cn(currentTab === item.id && 'is-active')}>
                  <span><item.icon className="w-5 h-5" /></span>
                  <strong>{item.label}</strong>
                  <small>{item.description}</small>
                </button>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
