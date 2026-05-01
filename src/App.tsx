import { useState, useEffect, useRef } from 'react';
import { TopBar } from './components/TopBar';
import { BottomNav } from './components/BottomNav';
import { MiniPlayer } from './components/MiniPlayer';
import { CreateView } from './views/CreateView';
import { LibraryView } from './views/LibraryView';
import { type ViewTab, type SongItem, type VibeItem } from './types';
import { store } from './lib/store';

export default function App() {
  const [currentTab, setCurrentTab] = useState<ViewTab>('inicio');
  const [canciones, setCanciones] = useState<SongItem[]>([]);
  const [vibes, setVibes] = useState<VibeItem[]>([]);
  
  const [activeSong, setActiveSong] = useState<SongItem | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    store.getData().then(data => {
      setCanciones(data.canciones || []);
      setVibes(data.vibes || []);
    });
  }, []);

  const addVibe = async (vibe: VibeItem) => {
    const updatedVibes = [vibe, ...vibes];
    setVibes(updatedVibes);
    await store.saveData({ canciones, vibes: updatedVibes });
  };

  const addCancion = async (cancion: SongItem, audioBlob?: Blob) => {
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
    <div className="h-[100dvh] w-full text-white flex flex-col font-sans overflow-hidden">
      <TopBar className="flex-shrink-0" />
      
      <main className="flex-1 overflow-hidden flex flex-col relative w-full h-full pb-[76px]">
        {currentTab === 'inicio' && <CreateView onSongCreated={addCancion} />}
        {currentTab === 'biblioteca' && <LibraryView canciones={canciones} vibes={vibes} onAddVibe={addVibe} onPlaySong={playSong} activeSongId={activeSong?.id} isPlaying={isPlaying} />}
        
        {/* Placeholders */}
        {currentTab === 'mv' && <div className="flex-1 flex items-center justify-center text-slate-500">Music Videos (Próximamente)</div>}
        {currentTab === 'studio' && <div className="flex-1 flex items-center justify-center text-slate-500">Studio (Próximamente)</div>}
        {currentTab === 'perfil' && <div className="flex-1 flex items-center justify-center text-slate-500">Perfil (Próximamente)</div>}
      </main>

      <MiniPlayer 
        song={activeSong} 
        isPlaying={isPlaying} 
        onPlayPause={togglePlay}
        onClose={() => setActiveSong(null)}
      />
      <BottomNav currentTab={currentTab} onChange={setCurrentTab} />
      
      <audio 
        ref={audioRef} 
        onEnded={() => setIsPlaying(false)} 
        onPause={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
        className="hidden" 
      />
    </div>
  );
}
