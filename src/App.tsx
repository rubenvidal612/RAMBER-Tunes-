import { useState, useEffect, useRef } from 'react';
import { TopBar } from './components/TopBar';
import { BottomNav } from './components/BottomNav';
import { MiniPlayer } from './components/MiniPlayer';
import { CreateView } from './views/CreateView';
import { LibraryView } from './views/LibraryView';
import { ProfileView } from './views/ProfileView';
import { SettingsView } from './views/SettingsView';
import { useUserCredits } from './hooks/useUserCredits';
import { type ViewTab, type SongItem, type VibeItem } from './types';
import { store } from './lib/store';
import { ensureAnonSession } from './lib/supabaseBrowser';

import { Banner } from './components/Banner';
import { Sidebar } from './components/Sidebar';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

export default function App() {
  const [currentTab, setCurrentTab] = useState<ViewTab>('inicio');
  const [canciones, setCanciones] = useState<SongItem[]>([]);
  const [vibes, setVibes] = useState<VibeItem[]>([]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  
  const [activeSong, setActiveSong] = useState<SongItem | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const { credits, consumeCredits } = useUserCredits();
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [installPromptEvent, setInstallPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHelp, setShowIosHelp] = useState(false);

  useEffect(() => {
    store.getData().then(data => {
      setCanciones(data.canciones || []);
      setVibes(data.vibes || []);
    });
  }, []);

  useEffect(() => {
    ensureAnonSession().catch(() => {});
  }, []);

  useEffect(() => {
    const isStandalone =
      window.matchMedia?.('(display-mode: standalone)')?.matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    const isMobile = window.matchMedia?.('(max-width: 768px)')?.matches ?? false;

    if (isMobile && !isStandalone) {
      setShowInstallBanner(true);
    }

    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setInstallPromptEvent(e as BeforeInstallPromptEvent);
      setShowInstallBanner(true);
    };

    const onAppInstalled = () => {
      setShowInstallBanner(false);
      setInstallPromptEvent(null);
      setShowIosHelp(false);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt as EventListener);
    window.addEventListener('appinstalled', onAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt as EventListener);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  const onInstallClick = async () => {
    if (installPromptEvent) {
      await installPromptEvent.prompt();
      const choice = await installPromptEvent.userChoice;
      setInstallPromptEvent(null);
      if (choice.outcome === 'accepted') {
        setShowInstallBanner(false);
      }
      return;
    }
    setShowIosHelp(true);
  };

  const addVibe = async (vibe: VibeItem) => {
    const updatedVibes = [vibe, ...vibes];
    setVibes(updatedVibes);
    await store.saveData({ canciones, vibes: updatedVibes });
  };

  const addCancion = async (cancion: SongItem, audioBlob?: Blob) => {
    // Consumir 12 créditos por cada canción creada
    if (!consumeCredits(12)) {
      alert('Créditos insuficientes. Necesitas 12 créditos para crear una canción.');
      return;
    }
    
    const updatedCanciones = [cancion, ...canciones];
    setCanciones(updatedCanciones);
    await store.saveData({ canciones: updatedCanciones, vibes });
    if (audioBlob) {
      await store.saveAudio(cancion.id, audioBlob);
    }
  };

  const playSong = async (song: SongItem) => {
    if (activeSong?.id === song.id) {
      togglePlay();
      return;
    }
    setActiveSong(song);
    setIsPlaying(false);
    
    // We will wait for useEffect to load the object URL
    try {
      const blob = await store.getAudio(song.id);
      if (blob && audioRef.current) {
        audioRef.current.src = URL.createObjectURL(blob);
        audioRef.current.play();
        setIsPlaying(true);
      }
    } catch {
      // Audio not found
      if (audioRef.current) {
        audioRef.current.src = '';
      }
    }
  };

  const togglePlay = () => {
    if (!audioRef.current || !activeSong) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  return (
    <div className="h-[100dvh] w-full text-white flex flex-col font-sans overflow-hidden relative">
      <TopBar className="flex-shrink-0" onMenuClick={() => setIsSettingsOpen(true)} credits={credits} />
      {showInstallBanner && (
        <div className="md:hidden px-3 pt-3">
          <div className="bg-gradient-to-r from-emerald-700/40 to-teal-600/20 border border-emerald-400/15 rounded-2xl px-3 py-3 flex items-center gap-3">
            <button
              onClick={() => setShowInstallBanner(false)}
              className="shrink-0 w-8 h-8 rounded-full bg-black/30 border border-white/10 text-slate-200 flex items-center justify-center"
              aria-label="Cerrar"
            >
              ✕
            </button>
            <div className="shrink-0 w-10 h-10 rounded-xl bg-black/40 border border-white/10 flex items-center justify-center font-extrabold text-white">
              R
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-white leading-tight">RAMBER Tunes</div>
              <div className="text-xs text-slate-200/90 leading-tight">Ponla como app en tu celular</div>
            </div>
            <button
              onClick={onInstallClick}
              className="shrink-0 bg-white text-black px-4 py-2 rounded-full text-xs font-extrabold"
            >
              VER
            </button>
          </div>
        </div>
      )}
      <Banner />
      
      <main className="flex-1 overflow-hidden flex w-full h-full relative">
        {/* Mobile View Switching */}
        <div className="flex-1 flex flex-col md:hidden pb-[76px] relative overflow-hidden">
           {currentTab === 'inicio' && <div className="flex-1 flex items-center justify-center text-slate-500">Inicio (Próximamente)</div>}
           {currentTab === 'studio' && <CreateView onSongCreated={addCancion} credits={credits} />}
           {currentTab === 'biblioteca' && <LibraryView canciones={canciones} vibes={vibes} onAddVibe={addVibe} onPlaySong={playSong} activeSongId={activeSong?.id} isPlaying={isPlaying} />}
           {currentTab === 'perfil' && <ProfileView credits={credits} />}
           
           {/* Placeholders */}
           {currentTab === 'mv' && <div className="flex-1 flex items-center justify-center text-slate-500">Music Videos (Próximamente)</div>}
        </div>
        {/* Desktop 3-column layout */}
        <div className="hidden md:flex flex-1 overflow-hidden">
           {/* Sidebar */}
           <div className="w-[200px] lg:w-[240px] shrink-0 border-r border-white/5 bg-black flex flex-col">
             <Sidebar currentTab={currentTab} onChange={setCurrentTab} />
           </div>

           {currentTab === 'inicio' ? (
             <div className="flex-1 flex items-center justify-center text-slate-500 bg-[#050505]">
               Inicio (Próximamente)
             </div>
           ) : (
             <>
               {/* Create View (Middle) */}
               <div className="w-[340px] lg:w-[420px] shrink-0 border-r border-white/5 bg-[#0a0a0a] flex flex-col relative z-20 shadow-[10px_0_30px_-10px_rgba(0,0,0,0.5)]">
                 <CreateView onSongCreated={addCancion} credits={credits} />
               </div>

               {/* Library / Results View (Right) */}
               <div className="flex-1 flex flex-col bg-[#050505] relative z-10 w-full min-w-[300px]">
                 {currentTab === 'perfil' ? <ProfileView credits={credits} /> : <LibraryView canciones={canciones} vibes={vibes} onAddVibe={addVibe} onPlaySong={playSong} activeSongId={activeSong?.id} isPlaying={isPlaying} />}
               </div>
             </>
           )}
        </div>
      </main>

      <MiniPlayer 
        song={activeSong} 
        isPlaying={isPlaying} 
        onPlayPause={togglePlay}
        onClose={() => setActiveSong(null)}
      />
      <div className="md:hidden">
        <BottomNav currentTab={currentTab} onChange={setCurrentTab} />
      </div>
      
      <audio 
        ref={audioRef} 
        onEnded={() => setIsPlaying(false)} 
        onPause={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
        className="hidden" 
      />

      {isSettingsOpen && <SettingsView onClose={() => setIsSettingsOpen(false)} />}
      {showIosHelp && (
        <div className="fixed inset-0 z-[300] bg-black/70 flex items-end md:hidden">
          <div className="w-full bg-[#0a0a0a] rounded-t-3xl p-5 border-t border-white/10">
            <div className="flex items-center justify-between">
              <div className="text-base font-bold text-white">Instalar como app</div>
              <button
                onClick={() => setShowIosHelp(false)}
                className="w-9 h-9 rounded-full bg-white/5 border border-white/10 text-slate-200 flex items-center justify-center"
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>
            <div className="mt-3 text-sm text-slate-300 space-y-2">
              <div>1) Toca el botón Compartir (cuadrado con flecha)</div>
              <div>2) Elige “Agregar a pantalla de inicio”</div>
              <div>3) Confirma “Agregar”</div>
            </div>
            <button
              onClick={() => setShowIosHelp(false)}
              className="mt-4 w-full bg-emerald-500 hover:bg-emerald-400 text-black h-[46px] rounded-full font-extrabold text-sm transition-colors"
            >
              Listo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
