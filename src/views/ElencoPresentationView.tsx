import { useEffect, useState, useRef } from 'react';
import { cn } from '../lib/utils';
import { Play, Pause } from 'lucide-react';

interface SongData {
  id: string;
  title: string;
  coverUrl?: string;
  lyrics?: string;
  audioUrl?: string;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
}

export function ElencoPresentationView() {
  const songId = new URLSearchParams(window.location.search).get('songId');
  const [songData, setSongData] = useState<SongData | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [localIsPlaying, setLocalIsPlaying] = useState(false);
  const [localCurrentTime, setLocalCurrentTime] = useState(0);
  const [localDuration, setLocalDuration] = useState(0);
  const [parsedLyrics, setParsedLyrics] = useState<Array<{ text: string; weight: number }>>([]);
  const [activeLyricIndex, setActiveLyricIndex] = useState(-1);

  useEffect(() => {
    if (!songId) {
      setConnectionStatus('disconnected');
      return;
    }

    const handleMessage = (event: MessageEvent) => {
      try {
        const message = JSON.parse(event.data);
        
        switch (message.type) {
          case 'songData':
            setSongData(message.data);
            setConnectionStatus('connected');
            
            if (message.data.lyrics) {
              const raw = message.data.lyrics.toString();
              const lines = raw
                .split(/\r?\n/g)
                .map((x: string) => x.replace(/\s+/g, ' ').trim())
                .filter((x: string) => x.length > 0);
              const items = lines.map((text: string) => {
                const weight = Math.max(1, Math.min(180, text.replace(/[^\p{L}\p{N}\s]/gu, '').length || text.length));
                return { text, weight };
              });
              setParsedLyrics(items);
            }
            
            setLocalIsPlaying(message.data.isPlaying);
            setLocalCurrentTime(message.data.currentTime);
            setLocalDuration(message.data.duration);
            break;
            
          case 'songUpdate':
            setSongData((prev) => ({ ...prev, ...message.data }));
            setLocalIsPlaying(message.data.isPlaying);
            setLocalCurrentTime(message.data.currentTime);
            setLocalDuration(message.data.duration);
            break;
            
          case 'play':
            setLocalIsPlaying(true);
            break;
            
          case 'pause':
            setLocalIsPlaying(false);
            break;
            
          case 'seek':
            setLocalCurrentTime(message.data.time);
            break;
        }
      } catch (error) {
      }
    };

    const handleConnectionClose = () => {
      setConnectionStatus('disconnected');
    };

    window.addEventListener('message', handleMessage);
    
    const presentationConnection = (window as any).presentationConnection;
    if (presentationConnection) {
      presentationConnection.addEventListener('close', handleConnectionClose);
      presentationConnection.addEventListener('terminate', handleConnectionClose);
    }

    return () => {
      window.removeEventListener('message', handleMessage);
      if (presentationConnection) {
        presentationConnection.removeEventListener('close', handleConnectionClose);
        presentationConnection.removeEventListener('terminate', handleConnectionClose);
      }
    };
  }, [songId]);

  useEffect(() => {
    if (!parsedLyrics.length || !localDuration) {
      setActiveLyricIndex(-1);
      return;
    }

    const totalWeight = parsedLyrics.reduce((acc, x) => acc + x.weight, 0);
    const progress = localCurrentTime / localDuration;
    const target = progress * totalWeight;
    
    let accumulated = 0;
    for (let i = 0; i < parsedLyrics.length; i++) {
      accumulated += parsedLyrics[i].weight;
      if (accumulated >= target) {
        setActiveLyricIndex(i);
        return;
      }
    }
    
    setActiveLyricIndex(parsedLyrics.length - 1);
  }, [localCurrentTime, localDuration, parsedLyrics]);

  const togglePlay = () => {
    if (audioRef.current) {
      if (localIsPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setLocalIsPlaying(!localIsPlaying);
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setLocalCurrentTime(audioRef.current.currentTime);
      setLocalDuration(audioRef.current.duration || 0);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (connectionStatus === 'disconnected') {
    return (
      <div className="h-screen w-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="text-white text-2xl font-extrabold mb-2">Conexión perdida</div>
          <div className="text-slate-400">La presentación ha sido desconectada</div>
        </div>
      </div>
    );
  }

  if (connectionStatus === 'connecting') {
    return (
      <div className="h-screen w-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="text-white text-2xl font-extrabold mb-2">Conectando...</div>
          <div className="text-slate-400">Esperando datos de la canción</div>
        </div>
      </div>
    );
  }

  if (!songData) {
    return (
      <div className="h-screen w-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="text-white text-2xl font-extrabold mb-2">Sin datos</div>
          <div className="text-slate-400">No hay información de canción disponible</div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-black overflow-hidden">
      {songData.coverUrl ? (
        <div className="absolute inset-0">
          <img
            src={songData.coverUrl}
            alt="Cover"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-black/60" />
        </div>
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/30 to-purple-900/30" />
      )}

      <div className="relative h-full w-full flex flex-col items-center justify-center p-8">
        <div className="text-center mb-8">
          <h1 className="text-4xl md:text-5xl font-extrabold text-white mb-2">
            {songData.title || 'Canción'}
          </h1>
          <div className="text-lg text-slate-300">Modo Elenco - Presentación</div>
        </div>

        <div className="w-full max-w-4xl bg-black/40 backdrop-blur-lg rounded-3xl p-8 border border-white/10 shadow-2xl">
          {parsedLyrics.length > 0 ? (
            <div className="space-y-4 max-h-[50vh] overflow-y-auto px-4">
              {parsedLyrics.map((line, idx) => (
                <div
                  key={idx}
                  className={cn(
                    'text-3xl md:text-4xl leading-tight font-extrabold transition-all duration-300',
                    idx === activeLyricIndex
                      ? 'text-white drop-shadow-[0_4px_20px_rgba(0,0,0,0.8)] scale-105'
                      : 'text-white/40'
                  )}
                >
                  {line.text}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="text-2xl text-white font-extrabold mb-2">Sin letra disponible</div>
              <div className="text-slate-400">Esta canción no tiene letra guardada</div>
            </div>
          )}

          <div className="mt-8 pt-6 border-t border-white/10">
            <div className="flex items-center justify-between">
              <div className="text-white font-bold">
                {formatTime(localCurrentTime)}
              </div>
              
              <button
                type="button"
                onClick={togglePlay}
                className="w-16 h-16 rounded-full bg-white text-black flex items-center justify-center shadow-2xl hover:scale-105 transition-transform"
                aria-label={localIsPlaying ? 'Pausar' : 'Reproducir'}
              >
                {localIsPlaying ? (
                  <Pause className="w-8 h-8 fill-black" strokeWidth={1} />
                ) : (
                  <Play className="w-8 h-8 fill-black ml-1" strokeWidth={1} />
                )}
              </button>
              
              <div className="text-white font-bold">
                {formatTime(localDuration)}
              </div>
            </div>
            
            <div className="mt-4">
              <input
                type="range"
                min={0}
                max={localDuration || 0}
                value={localCurrentTime}
                onChange={(e) => {
                  const newTime = parseFloat(e.target.value);
                  setLocalCurrentTime(newTime);
                  if (audioRef.current) {
                    audioRef.current.currentTime = newTime;
                  }
                }}
                className="w-full h-2 bg-white/20 rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:cursor-pointer"
              />
            </div>
          </div>
        </div>

        <div className="mt-8 text-center text-slate-400 text-sm">
          Conectado desde Luciana AI - Presentación en pantalla externa
        </div>
      </div>

      <audio
        ref={audioRef}
        src={songData.audioUrl}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleTimeUpdate}
        onEnded={() => setLocalIsPlaying(false)}
        className="hidden"
      />
    </div>
  );
}
