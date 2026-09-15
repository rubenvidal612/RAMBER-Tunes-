import * as React from 'react';
import { Bot, Coins, Clock3, Home, Library, Menu, Mic2, Shield, Sparkles, User, Volume2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { type ViewTab } from '@/types';
import { supabaseBrowser } from '@/lib/supabaseBrowser';
import { isAdminEmail } from '@/lib/authz';

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
  const [userName, setUserName] = React.useState('Usuario');
  const [userInitial, setUserInitial] = React.useState('U');
  const [userEmail, setUserEmail] = React.useState('');
  const [isSigningOut, setIsSigningOut] = React.useState(false);
  const menuActive = menuItems.some((item) => item.id === currentTab);
  const loadedRef = React.useRef(false);

  React.useEffect(() => {
    if (loadedRef.current) return;
    if (!supabaseBrowser) return;
    loadedRef.current = true;
    supabaseBrowser.auth
      .getUser()
      .then(({ data }) => {
        const user = data?.user;
        const email = (user?.email || '').toString().trim();
        void isAdminEmail;
        const meta: any = user?.user_metadata || {};
        const name = (meta?.full_name || meta?.name || '').toString().trim();
        const display = (name || email || 'Usuario').toString().trim();
        setUserName(display);
        setUserInitial(display.slice(0, 1).toUpperCase() || 'U');
        setUserEmail(email);
      })
      .catch(() => {});
  }, []);

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
        window.location.reload();
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

            <div className="mt-2 mb-2 mx-3 rounded-2xl overflow-hidden border border-white/10 bg-gradient-to-br from-white/5 to-white/[0.02] backdrop-blur-xl">
              <div className="px-3 pt-3 pb-2 flex items-center gap-3">
                <div className="shrink-0 w-9 h-9 rounded-full bg-gradient-to-br from-fuchsia-500 to-indigo-500 border border-white/10 flex items-center justify-center text-white font-extrabold text-sm shadow-md shadow-fuchsia-600/25">
                  {userInitial}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-white font-bold text-[15px] truncate">{userName}</div>
                  <div className="text-[11px] text-slate-400 truncate mt-0.5 break-all">{userEmail || 'Sin sesión activa'}</div>
                </div>
              </div>
              <div className="px-3 pb-3">
                <button
                  type="button"
                  onClick={() => void doSignOut()}
                  disabled={isSigningOut}
                  className="w-full h-[40px] rounded-full bg-gradient-to-r from-rose-500/90 to-red-500/90 hover:from-rose-400 hover:to-red-400 text-white font-bold text-[13px] shadow-md shadow-rose-600/20 ring-1 ring-white/10 active:scale-[0.98] transition-all disabled:opacity-60"
                >
                  {isSigningOut ? 'Cerrando sesión…' : 'Cerrar sesión'}
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
