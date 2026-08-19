import {
  Bot, CircleHelp, Clock3, Coins, Home, Library, Mic2, Sparkles,
  LogOut, Shield, Volume2, WalletCards,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { type ViewTab } from '@/types';
import { supabaseBrowser } from '@/lib/supabaseBrowser';

interface SidebarProps {
  currentTab: ViewTab;
  onChange: (tab: ViewTab) => void;
  isAdmin?: boolean;
}

const primaryItems: Array<{ id: ViewTab; label: string; icon: typeof Home }> = [
  { id: 'landing', label: 'Inicio', icon: Home },
  { id: 'studio', label: 'Crear', icon: Sparkles },
  { id: 'biblioteca', label: 'Mis canciones', icon: Library },
  { id: 'voces', label: 'Clonador de voz', icon: Mic2 },
  { id: 'masterizar', label: 'Masterizar', icon: Volume2 },
  { id: 'planes', label: 'Comprar créditos', icon: Coins },
];

const accountItems: Array<{ id: ViewTab; label: string; icon: typeof Home; adminOnly?: boolean }> = [
  { id: 'oficina', label: 'Oficina', icon: Shield, adminOnly: true },
  { id: 'vendedor', label: 'Vendedor', icon: Clock3 },
];

function NavButton({ id, label, icon: Icon, currentTab, onChange }: {
  key?: ViewTab;
  id: ViewTab;
  label: string;
  icon: typeof Home;
  currentTab: ViewTab;
  onChange: (tab: ViewTab) => void;
}) {
  const active = currentTab === id;
  return (
    <button type="button" onClick={() => onChange(id)} className={cn('luciana-sidebar-item', active && 'is-active')}>
      <Icon className="w-[18px] h-[18px]" strokeWidth={active ? 2.25 : 1.8} />
      <span>{label}</span>
    </button>
  );
}

function ActionButton({ label, icon: Icon, onClick }: {
  label: string;
  icon: typeof Home;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className="luciana-sidebar-item">
      <Icon className="w-[18px] h-[18px]" strokeWidth={1.8} />
      <span>{label}</span>
    </button>
  );
}

export function Sidebar({ currentTab, onChange, isAdmin = false }: SidebarProps) {
  const [authEmail, setAuthEmail] = useState('');
  const [authName, setAuthName] = useState('');

  useEffect(() => {
    if (!supabaseBrowser) return;
    let alive = true;
    const setFromSession = (session: any) => {
      if (!alive) return;
      const email = (session?.user?.email || '').toString().trim();
      const meta = (session?.user?.user_metadata || {}) as any;
      const nameRaw = (meta?.full_name || meta?.name || meta?.display_name || '').toString().trim();
      setAuthEmail(email);
      setAuthName(nameRaw);
    };
    supabaseBrowser.auth.getSession().then(({ data }) => setFromSession(data?.session)).catch(() => {});
    const { data: sub } = supabaseBrowser.auth.onAuthStateChange((_evt, session) => setFromSession(session));
    return () => {
      alive = false;
      try {
        sub?.subscription?.unsubscribe?.();
      } catch {
      }
    };
  }, []);

  const displayName = useMemo(() => {
    const fromMeta = (authName || '').toString().trim();
    if (fromMeta) return fromMeta;
    const email = (authEmail || '').toString().trim();
    const base = email.includes('@') ? email.split('@')[0] : '';
    if (!base) return 'Tu cuenta';
    const cleaned = base.replace(/[._-]+/g, ' ').trim();
    return cleaned ? cleaned.split(' ').map((w) => (w ? `${w[0].toUpperCase()}${w.slice(1)}` : '')).join(' ') : 'Tu cuenta';
  }, [authEmail, authName]);

  const handleSignOut = async () => {
    try {
      await supabaseBrowser?.auth?.signOut?.();
    } catch {
    }
    try {
      window.location.href = '/crear';
    } catch {
    }
  };

  return (
    <aside className="luciana-sidebar">
      <nav className="luciana-sidebar-scroll">
        <p className="luciana-sidebar-label">MENÚ</p>
        <div className="space-y-1">
          {primaryItems.map((item) => (
            <NavButton key={item.id} id={item.id} label={item.label} icon={item.icon} currentTab={currentTab} onChange={onChange} />
          ))}
        </div>

        <p className="luciana-sidebar-label mt-7">ASISTENTE</p>
        <NavButton id="luciana" label="LucIAna Bot" icon={Bot} currentTab={currentTab} onChange={onChange} />

        <p className="luciana-sidebar-label mt-7">CUENTA</p>
        <div className="mt-2 rounded-2xl border border-white/10 bg-white/[.02] px-3 py-3">
          <div className="text-sm font-extrabold text-white">{displayName}</div>
          <div className="mt-0.5 text-xs text-slate-400 break-all">{authEmail || '—'}</div>
        </div>
        <div className="space-y-1">
          {accountItems.filter((item) => !item.adminOnly || isAdmin).map((item) => (
            <NavButton key={item.id} id={item.id} label={item.label} icon={item.icon} currentTab={currentTab} onChange={onChange} />
          ))}
          <ActionButton label="Cerrar sesión" icon={LogOut} onClick={handleSignOut} />
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
