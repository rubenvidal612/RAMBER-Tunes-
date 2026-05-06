import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { Edit2, Forward, Settings } from 'lucide-react';
import { SettingsView } from './SettingsView';
import { EditProfileView } from './EditProfileView';
import { supabaseBrowser } from '@/lib/supabaseBrowser';

export function ProfileView({ onGoStudio }: { onGoStudio?: () => void }) {
  const [activeTab, setActiveTab] = useState<'canciones' | 'listas'>('canciones');
  const [showSettings, setShowSettings] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [userName, setUserName] = useState('Usuario');
  const [userInitial, setUserInitial] = useState('U');
  const [userEmail, setUserEmail] = useState('');
  const [userAvatarUrl, setUserAvatarUrl] = useState('');
  const [userCoverUrl, setUserCoverUrl] = useState('');

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
        setUserEmail(email);
        setUserAvatarUrl((meta?.avatar_url || '').toString());
        setUserCoverUrl((meta?.cover_url || '').toString());
      })
      .catch(() => {});
  }, []);

  const shareFromProfile = async () => {
    const url = window.location.origin;
    try {
      if (navigator.share && url) {
        await navigator.share({
          title: 'RAMBER Tunes',
          text: 'Haz música con IA en RAMBER Tunes',
          url,
        });
        return;
      }
    } catch {}
    try {
      await navigator.clipboard.writeText(url);
      alert('Copiado al portapapeles.');
      return;
    } catch {}
    alert(url);
  };

  if (showSettings) {
    return <SettingsView onClose={() => setShowSettings(false)} />;
  }

  if (showEditProfile) {
    return <EditProfileView onClose={() => setShowEditProfile(false)} />;
  }

  return (
    <div className="flex-1 flex flex-col pt-4 overflow-y-auto w-full relative z-10">
      <div className="px-6 mb-6">
        <div className="relative rounded-3xl overflow-hidden border border-white/10">
          <div className="h-24 bg-gradient-to-r from-indigo-500/20 via-fuchsia-500/10 to-yellow-500/10" />
          {userCoverUrl ? <img src={userCoverUrl} alt="" className="absolute inset-0 w-full h-full object-cover" /> : null}
          <div className="absolute inset-0 bg-black/35" />
          <div className="relative p-4 flex items-center justify-between">
            <div className="flex items-center gap-4 min-w-0">
              <div className="w-16 h-16 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-2xl font-bold text-indigo-300 overflow-hidden shrink-0">
                {userAvatarUrl ? <img src={userAvatarUrl} alt="" className="w-full h-full object-cover" /> : userInitial}
              </div>
              <div className="min-w-0">
                <h2 className="text-2xl font-bold text-white truncate">{userName}</h2>
                {userEmail ? <div className="text-xs text-slate-300/80 truncate">{userEmail}</div> : null}
              </div>
            </div>
            <button onClick={() => setShowSettings(true)} className="p-2 text-slate-200 hover:text-white transition-colors glass-card rounded-full">
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 px-6 mb-6 text-center">
        <div className="flex flex-col items-center">
          <span className="text-lg font-bold text-slate-100">0</span>
          <span className="text-xs text-slate-400">Me gusta</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-lg font-bold text-slate-100">0</span>
          <span className="text-xs text-slate-400">Seguidores</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-lg font-bold text-slate-100">0</span>
          <span className="text-xs text-slate-400">Siguiendo</span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-4 px-6 mb-8">
        <button 
          onClick={() => setShowEditProfile(true)}
          className="flex-1 py-2.5 rounded-full glass-card border border-indigo-500/50 text-indigo-300 font-semibold flex items-center justify-center gap-2 hover:bg-indigo-500/10 transition-colors text-sm"
        >
          <Edit2 className="w-4 h-4" /> Editar perfil
        </button>
        <button
          onClick={() => shareFromProfile().catch(() => {})}
          className="flex-1 py-2.5 rounded-full glass-card border border-white/10 text-slate-200 font-semibold flex items-center justify-center gap-2 hover:bg-white/5 transition-colors text-sm"
        >
          <Forward className="w-4 h-4" /> Compartir
        </button>
      </div>

      {/* Tabs */}
      <div className="flex px-6 border-b border-white/10 space-x-6 mb-6">
        {(['canciones', 'listas'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "py-3 text-sm font-semibold capitalize relative transition-colors",
              activeTab === tab ? "text-slate-100" : "text-slate-500"
            )}
          >
            {tab}
            {activeTab === tab && (
              <div className="absolute bottom-0 left-0 w-full h-[2px] bg-gradient-to-r from-indigo-400 to-purple-400 rounded-t-full" />
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 px-6 flex flex-col items-center justify-center text-center pb-8 mt-[-30px]">
        <div className="w-24 h-24 mb-6 text-slate-600 opacity-50 relative flex items-center justify-center">
          <div className="w-16 h-12 border-2 border-current rounded-t-md border-b-0 space-y-1 p-2">
             <div className="w-2 h-0.5 bg-current rounded-full" />
          </div>
          <div className="absolute top-0 flex gap-2">
            <div className="w-1 h-3 bg-current rounded-full rotate-[-30deg] -ml-4" />
            <div className="w-1 h-4 bg-current rounded-full -mt-2" />
            <div className="w-1 h-3 bg-current rounded-full rotate-[30deg] -mr-4" />
          </div>
        </div>
        <div className="mb-6 max-w-[320px]">
          <div className="text-base font-extrabold tracking-tight leading-tight bg-gradient-to-r from-yellow-300 via-amber-200 to-fuchsia-200 bg-clip-text text-transparent drop-shadow-[0_0_18px_rgba(250,204,21,0.12)]">
            Haz que Escuchen Tus Canciones en TODO EL MUNDO!
          </div>
          <div className="mt-2 text-slate-300 font-semibold text-sm">
            ¡es hora de hacer <span className="text-white font-extrabold">HISTORIA</span>!
          </div>
        </div>
        <button
          onClick={() => onGoStudio?.()}
          className="bg-gradient-to-r from-indigo-500 to-purple-600 hover:opacity-90 transition-all text-white font-bold text-sm px-6 py-2.5 rounded-full shadow-lg shadow-indigo-500/20"
        >
          ¡Comenzar ahora!
        </button>
      </div>
    </div>
  );
}
