import * as React from 'react';
import { Bot, CircleHelp, Clock3, Coins, Home, Library, LogOut, Menu, Mic2, Shield, Sparkles, User, Volume2, WalletCards, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { type ViewTab } from '@/types';
import { supabaseBrowser } from '@/lib/supabaseBrowser';

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

const accountItemsAdmin: Array<{ id: ViewTab; label: string; icon: typeof Home; adminOnly?: boolean }> = [
  { id: 'oficina', label: 'Oficina', icon: Shield, adminOnly: true },
  { id: 'vendedor', label: 'Vendedor', icon: Clock3 },
];

export function BottomNav({ currentTab, onChange, isAdmin = false }: BottomNavProps) {
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const [authEmail, setAuthEmail] = React.useState('');
  const [authName, setAuthName] = React.useState('');
  const [isSigningOut, setIsSigningOut] = React.useState(false);
  const menuActive = menuItems.some((item) => item.id === currentTab);
  const loadedRef = React.useRef(false);

  React.useEffect(() => {
    if (loadedRef.current) return;
    if (!supabaseBrowser) return;
    loadedRef.current = true;
    const setFromSession = (session: any) => {
      const email = (session?.user?.email || '').toString().trim();
      const meta = (session?.user?.user_metadata || {}) as any;
      const nameRaw = (meta?.full_name || meta?.name || meta?.display_name || '').toString().trim();
      setAuthEmail(email);
      setAuthName(nameRaw);
    };
    supabaseBrowser.auth.getSession().then(({ data }) => setFromSession(data?.session)).catch(() => {});
    const { data: sub } = supabaseBrowser.auth.onAuthStateChange((_evt, session) => setFromSession(session));
    return () => {
      try {
        sub?.subscription?.unsubscribe?.();
      } catch {}
    };
  }, []);

  const displayName = React.useMemo(() => {
    const fromMeta = (authName || '').toString().trim();
    if (fromMeta) return fromMeta;
    const email = (authEmail || '').toString().trim();
    const base = email.includes('@') ? email.split('@')[0] : '';
    if (!base) return 'Tu cuenta';
    const cleaned = base.replace(/[._-]+/g, ' ').trim();
    return cleaned ? cleaned.split(' ').map((w) => (w ? `${w[0].toUpperCase()}${w.slice(1)}` : '')).join(' ') : 'Tu cuenta';
  }, [authEmail, authName]);

  const go = (tab: ViewTab) => {
    setIsMenuOpen(false);
    onChange(tab);
  };

  const doSignOut = async () => {
    try {
      setIsSigningOut(true);
      if (supabaseBrowser) await supabaseBrowser.auth.signOut().catch(() => {});
    } finally {
      setIsSigningOut(false);
      setIsMenuOpen(false);
      try {
        window.location.href = '/crear';
      } catch {}
    }
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

            <div className="mt-5 mb-2 px-3">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-slate-500 mb-2">Cuenta</p>
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] px-3 py-3">
                <div className="text-[15px] font-bold text-white truncate">{displayName}</div>
                <div className="mt-0.5 text-[11px] text-slate-400 break-all">{authEmail || '—'}</div>
              </div>
              <div className="mt-2 space-y-1">
                {accountItemsAdmin.filter((i) => !i.adminOnly || isAdmin).map((item) => {
                  const active = currentTab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => go(item.id)}
                      className={cn('luciana-mobile-drawer-item', active && 'is-active')}
                    >
                      <item.icon className="w-[18px] h-[18px]" strokeWidth={active ? 2.25 : 1.8} />
                      <span className="luciana-mobile-drawer-text"><strong>{item.label}</strong></span>
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => void doSignOut()}
                  disabled={isSigningOut}
                  className="luciana-mobile-drawer-item disabled:opacity-60"
                >
                  <LogOut className="w-[18px] h-[18px]" strokeWidth={1.8} />
                  <span className="luciana-mobile-drawer-text"><strong>{isSigningOut ? 'Cerrando sesión…' : 'Cerrar sesión'}</strong></span>
                </button>
              </div>
            </div>

            <div className="mt-3 mb-4 px-3 space-y-2">
              <button type="button" className="w-full text-left rounded-2xl border border-white/10 bg-gradient-to-br from-indigo-500/10 via-white/[0.02] to-fuchsia-500/10 px-3 py-3">
                <div className="flex items-center gap-3">
                  <span className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-indigo-300">
                    <CircleHelp className="w-[18px] h-[18px]" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <strong className="block text-[14px] text-white">¿Necesitas ayuda?</strong>
                    <small className="block text-[11px] text-slate-400">Centro de ayuda</small>
                  </div>
                </div>
              </button>
              <button type="button" onClick={() => go('planes')} className="w-full text-left rounded-2xl border border-yellow-400/15 bg-gradient-to-br from-yellow-400/12 to-yellow-500/5 px-3 py-3">
                <div className="flex items-center gap-3">
                  <span className="w-9 h-9 rounded-xl bg-yellow-400/10 border border-yellow-400/20 flex items-center justify-center text-yellow-300">
                    <WalletCards className="w-[18px] h-[18px]" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <small className="block text-[10px] text-yellow-300/80 uppercase tracking-wide">Créditos disponibles</small>
                    <strong className="block text-[14px] text-yellow-100">Obtener créditos</strong>
                  </div>
                </div>
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
