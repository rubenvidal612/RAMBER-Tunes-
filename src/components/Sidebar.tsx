import {
  Bot, CircleHelp, Clock3, Coins, Home, Library, Mic2, Sparkles,
  Shield, Volume2, WalletCards, Video,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { type ViewTab } from '@/types';

interface SidebarProps {
  currentTab: ViewTab;
  onChange: (tab: ViewTab) => void;
  isAdmin?: boolean;
}

const primaryItems: Array<{ id: ViewTab; label: string; icon: typeof Home; badge?: string }> = [
  { id: 'landing', label: 'Inicio', icon: Home },
  { id: 'studio', label: 'Crear', icon: Sparkles },
  { id: 'biblioteca', label: 'Mis canciones', icon: Library },
  { id: 'voces', label: 'Clonador de voz', icon: Mic2 },
  { id: 'masterizar', label: 'Masterizar', icon: Volume2 },
  { id: 'planes', label: 'Comprar créditos', icon: Coins },
  { id: 'karaoke', label: 'Video Karaoke', icon: Video, badge: 'Nuevo' },
];

const accountItems: Array<{ id: ViewTab; label: string; icon: typeof Home; adminOnly?: boolean }> = [
  { id: 'oficina', label: 'Oficina', icon: Shield, adminOnly: true },
  { id: 'vendedor', label: 'Vendedor', icon: Clock3 },
];

function NavButton({ id, label, icon: Icon, badge, currentTab, onChange }: {
  key?: ViewTab;
  id: ViewTab;
  label: string;
  icon: typeof Home;
  badge?: string;
  currentTab: ViewTab;
  onChange: (tab: ViewTab) => void;
}) {
  const active = currentTab === id;
  return (
    <button type="button" onClick={() => onChange(id)} className={cn('luciana-sidebar-item', active && 'is-active')}>
      <Icon className="w-[18px] h-[18px]" strokeWidth={active ? 2.25 : 1.8} />
      <span>{label}</span>
      {badge ? <small className="ml-auto rounded-full bg-pink-600 px-2 py-0.5 text-[8px] font-black uppercase tracking-wide text-white">{badge}</small> : null}
      {id === 'landing' ? <small>Próximamente</small> : null}
    </button>
  );
}

export function Sidebar({ currentTab, onChange, isAdmin = false }: SidebarProps) {
  return (
    <aside className="luciana-sidebar">
      <nav className="luciana-sidebar-scroll">
        <p className="luciana-sidebar-label">MENÚ</p>
        <div className="space-y-1">
          {primaryItems.map((item) => (
            <NavButton key={item.id} id={item.id} label={item.label} icon={item.icon} badge={item.badge} currentTab={currentTab} onChange={onChange} />
          ))}
        </div>

        <p className="luciana-sidebar-label mt-7">ASISTENTE</p>
        <NavButton id="luciana" label="LucIAna Bot" icon={Bot} currentTab={currentTab} onChange={onChange} />

        <p className="luciana-sidebar-label mt-7">CUENTA</p>
        <div className="space-y-1">
          {accountItems.filter((item) => !item.adminOnly || isAdmin).map((item) => (
            <NavButton key={item.id} id={item.id} label={item.label} icon={item.icon} currentTab={currentTab} onChange={onChange} />
          ))}
        </div>
      </nav>

      <div className="luciana-sidebar-footer">
        <button type="button" className="luciana-help-card">
          <span><CircleHelp className="w-5 h-5" /></span>
          <div><strong>¿Necesitas ayuda?</strong><small>Centro de ayuda</small></div>
        </button>
        <button type="button" onClick={() => onChange('planes')} className="luciana-sidebar-credits">
          <div><small>Créditos disponibles</small><strong><WalletCards className="w-4 h-4" /> Obtener créditos</strong></div>
        </button>
      </div>
    </aside>
  );
}
