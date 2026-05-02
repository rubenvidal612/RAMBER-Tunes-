import { Play, Pause, X } from 'lucide-react';
import { type SongItem } from '../types';

interface MiniPlayerProps {
  song: SongItem | null;
  isPlaying: boolean;
  onPlayPause: () => void;
  onClose: () => void;
  placement?: 'default' | 'aboveCreate';
}

export function MiniPlayer({ song, isPlaying, onPlayPause, onClose, placement = 'default' }: MiniPlayerProps) {
  if (!song) return null;

  const bottomClass = placement === 'aboveCreate' ? 'bottom-[168px]' : 'bottom-[76px]';

  return (
    <div
      className={`fixed ${bottomClass} md:bottom-4 left-2 right-2 glass-panel rounded-2xl p-3 flex items-center justify-between shadow-2xl shadow-indigo-900/20 z-40 animate-in slide-in-from-bottom-5`}
    >
      <div className="flex items-center gap-3 flex-1 overflow-hidden">
        <div className="w-10 h-10 bg-white/10 rounded-md flex items-center justify-center flex-shrink-0 relative overflow-hidden">
           {/* Simple gradient or cover art */}
           <div className="absolute inset-0 bg-gradient-to-br from-indigo-500 to-purple-600 opacity-70" />
           <div className="w-3 h-3 bg-white rounded-full relative z-10" />
        </div>
        <div className="flex-1 truncate">
          <p className="text-sm font-bold text-white truncate">{song.title || 'Pista sin título'}</p>
          <p className="text-xs text-gray-400 truncate">{song.description || 'Maqueta'}</p>
        </div>
      </div>
      
      <div className="flex items-center gap-2">
        <button onClick={onPlayPause} className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center shadow-lg active:scale-95 transition-transform">
          {isPlaying ? <Pause className="w-5 h-5 fill-black" strokeWidth={1} /> : <Play className="w-5 h-5 fill-black ml-1" strokeWidth={1} />}
        </button>
        <button onClick={onClose} className="p-2 text-slate-400 hover:text-white">
          <X className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
