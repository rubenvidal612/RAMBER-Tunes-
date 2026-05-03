import { useEffect, useState } from 'react';
import { ChevronRight, Share, HelpCircle, MessageSquare, FileText, Shield, RefreshCw } from 'lucide-react';
import { useUserCredits } from '@/hooks/useUserCredits';
import { signInWithGoogle, supabaseBrowser } from '@/lib/supabaseBrowser';

export function SettingsView({ onClose, onOpenPricing }: { onClose: () => void; onOpenPricing?: () => void }) {
  const [providerCredits, setProviderCredits] = useState<number | null>(null);
  const [isAuthBusy, setIsAuthBusy] = useState(false);
  const { credits, refreshCredits } = useUserCredits();
  const [userName, setUserName] = useState('Usuario');
  const [userInitial, setUserInitial] = useState('U');
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    fetch('/api/suno/credits')
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (!ok) return;
        const c = Number(j?.credits);
        if (Number.isFinite(c)) setProviderCredits(c);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!supabaseBrowser) return;
    supabaseBrowser.auth.getSession().then(async ({ data }) => {
      const token = data?.session?.access_token;
      if (!token) return;
      const r = await fetch('/api/account/balance', { headers: { authorization: `Bearer ${token}` } }).catch(() => null as any);
      if (!r?.ok) return;
      const out = await r.json().catch(() => ({}));
      setIsAdmin(Boolean(out?.is_admin));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!supabaseBrowser) return;
    supabaseBrowser.auth
      .getUser()
      .then(({ data }) => {
        const user = data?.user;
        const email = (user?.email || '').toString().trim();
        const meta: any = user?.user_metadata || {};
        const name = (meta?.full_name || meta?.name || '').toString().trim();
        const display = (name || email || 'Usuario').toString().trim();
        setUserName(display);
        setUserInitial(display.slice(0, 1).toUpperCase() || 'U');
      })
      .catch(() => {});
  }, []);

  const signOut = async () => {
    if (!supabaseBrowser) return;
    setIsAuthBusy(true);
    try {
      await supabaseBrowser.auth.signOut().catch(() => {});
      await refreshCredits();
      alert('Sesión cerrada.');
    } finally {
      setIsAuthBusy(false);
    }
  };

  return (
    <div className="flex flex-col overflow-y-auto animate-in slide-in-from-right-8 duration-300 z-[100] bg-black/90 backdrop-blur-3xl fixed inset-0 pb-safe">
      <div className="flex items-center gap-4 p-4 sticky top-0 bg-transparent z-10 backdrop-blur-xl border-b border-white/5">
        <button onClick={onClose} className="p-2 text-slate-300 hover:text-white glass-card rounded-full">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6"><path d="M15 18l-6-6 6-6"></path></svg>
        </button>
      </div>

      <div className="p-6 space-y-6 max-w-2xl mx-auto w-full">
        <div className="flex items-center gap-4 mb-2">
          <div className="w-16 h-16 rounded-full bg-white/10 border border-white/10 flex items-center justify-center text-2xl font-extrabold text-white shadow-inner">
            {userInitial}
          </div>
          <h2 className="text-2xl font-bold text-white">{userName}</h2>
        </div>

        <div className="glass-card rounded-2xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-yellow-500 flex items-center justify-center text-black font-bold text-xs">♪</div>
            <span className="font-semibold text-slate-200">{typeof providerCredits === 'number' ? providerCredits : credits} Créditos</span>
            <HelpCircle className="w-4 h-4 text-slate-500" />
          </div>
          <button 
            onClick={() => {
              onOpenPricing?.();
              onClose();
            }}
            className="bg-green-500 hover:bg-green-400 text-[#020617] font-semibold text-xs px-4 py-2 rounded-full transition-colors"
          >
            Obtener más canciones
          </button>
        </div>

        <div className="glass-card rounded-2xl overflow-hidden">
          <button className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors border-b border-white/5">
            <div className="flex items-center gap-3 text-sm font-medium text-slate-200">
              <Share className="w-5 h-5 text-slate-400" /> Compartir RAMBER Tunes
            </div>
            <ChevronRight className="w-5 h-5 text-slate-500" />
          </button>
          <button className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors">
            <div className="flex items-center gap-3 text-sm font-medium text-slate-200">
              <span className="text-lg">⭐</span> Ayúdanos a mejorar
            </div>
            <ChevronRight className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {isAdmin && (
          <div className="glass-card rounded-2xl overflow-hidden">
            <button
              className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors"
              onClick={() => alert('Oficina (solo admin): Próximamente')}
            >
              <div className="flex items-center gap-3 text-sm font-medium text-slate-200">
                <Shield className="w-5 h-5 text-slate-400" /> Oficina (Admin)
              </div>
              <ChevronRight className="w-5 h-5 text-slate-500" />
            </button>
          </div>
        )}

        <div className="glass-card rounded-2xl overflow-hidden">
          <button className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors border-b border-white/5">
            <div className="flex items-center gap-3 text-sm font-medium text-slate-200">
              <MessageSquare className="w-5 h-5 text-slate-400" /> Contáctanos
            </div>
            <ChevronRight className="w-5 h-5 text-slate-500" />
          </button>
          <button className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors border-b border-white/5">
            <div className="flex items-center gap-3 text-sm font-medium text-slate-200">
              <HelpCircle className="w-5 h-5 text-slate-400" /> Preguntas frecuentes
            </div>
            <ChevronRight className="w-5 h-5 text-slate-500" />
          </button>
          <button className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors border-b border-white/5">
            <div className="flex items-center gap-3 text-sm font-medium text-slate-200">
              <FileText className="w-5 h-5 text-slate-400" /> Términos de Servicio
            </div>
            <ChevronRight className="w-5 h-5 text-slate-500" />
          </button>
          <button className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors border-b border-white/5">
            <div className="flex items-center gap-3 text-sm font-medium text-slate-200">
              <Shield className="w-5 h-5 text-slate-400" /> Política de Privacidad
            </div>
            <ChevronRight className="w-5 h-5 text-slate-500" />
          </button>
          <button className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors">
            <div className="flex items-center gap-3 text-sm font-medium text-slate-200">
              <RefreshCw className="w-5 h-5 text-slate-400" /> Buscar actualizaciones
            </div>
            <ChevronRight className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="glass-card rounded-2xl p-4">
          <p className="text-sm font-medium text-slate-200 mb-4">Síguenos</p>
          <div className="flex items-center justify-center gap-4">
            {['youtube', 'tiktok', 'discord', 'x'].map(social => (
              <button key={social} className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-colors uppercase text-[10px] font-bold">
                {social.slice(0, 2)}
              </button>
            ))}
          </div>
        </div>

        <div className="py-4 text-center">
           <button
             onClick={() => {
               signInWithGoogle()
                 .then((r) => {
                   if (!r.ok) alert(r.error);
                 })
                 .catch(() => alert('No pude iniciar sesión con Google.'));
             }}
             className="mb-5 text-slate-200 text-sm font-semibold hover:text-white transition-colors underline underline-offset-4"
           >
             Entrar con Google
           </button>
           <button
             onClick={() => signOut().catch(() => {})}
             disabled={isAuthBusy}
             className="text-slate-400 text-sm font-medium hover:text-white transition-colors underline underline-offset-4 disabled:opacity-60"
           >
             Cerrar sesión
           </button>
        </div>
      </div>
    </div>
  );
}
