import {
  Bot, CircleHelp, Clock3, Coins, Home, Library, MessageSquare, Mic2, Sparkles,
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

        <p className="luciana-sidebar-label mt-7" style={{ color: '#b77aff', textShadow: '0 0 18px rgba(183,122,255,.35)' }}>✨ ASISTENTE PREMIUM</p>
        <button
          type="button"
          onClick={() => onChange('copiloto')}
          className="luciana-sidebar-item luciana-sidebar-copiloto"
          style={{
            border: '1px solid rgba(183,122,255,.35)',
            background: 'linear-gradient(135deg, rgba(124,58,237,.22) 0%, rgba(7,10,18,1) 55%, rgba(236,72,153,.14) 100%)',
            boxShadow: '0 0 0 1px rgba(183,122,255,.08) inset, 0 8px 28px rgba(124,58,237,.18)',
            color: 'white',
            fontWeight: 800,
            letterSpacing: '-0.01em',
          }}
        >
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 overflow-hidden"
            style={{
              background: 'radial-gradient(circle at 30% 20%, rgba(255,255,255,.22), rgba(183,122,255,.08) 55%, transparent 75%)',
              boxShadow: '0 0 0 1px rgba(183,122,255,.28) inset, 0 6px 18px rgba(183,122,255,.25)',
            }}
          >
            <img
              src="/assets/luciana-logo-oficial.png?v=20260918-2"
              alt="LucIAna Bot"
              className="w-[118%] h-[118%] object-contain"
              style={{ transform: 'scale(1.04)' }}
            />
          </div>
          <div className="min-w-0 flex-1 flex flex-col items-start">
            <span
              style={{
                background: 'linear-gradient(90deg,#f0abfc 0%,#c4b5fd 40%,#93c5fd 100%)',
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                color: 'transparent',
                fontWeight: 900,
              }}
            >
              LucIAna Bot
            </span>
            <span
              style={{
                fontSize: '9.5px',
                color: '#c4b5fd',
                fontWeight: 700,
                letterSpacing: '.14em',
                textTransform: 'uppercase',
                marginTop: '1px',
              }}
            >
              Nueva versión · 24/7
            </span>
          </div>
          <span
            className="ml-1 shrink-0 px-1.5 py-0.5 rounded-md text-[9px] font-black"
            style={{
              background: 'linear-gradient(135deg,#ec4899,#b77aff)',
              color: 'white',
              letterSpacing: '.05em',
              boxShadow: '0 4px 14px rgba(236,72,153,.35)',
            }}
          >
            BETA
          </span>
        </button>

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
