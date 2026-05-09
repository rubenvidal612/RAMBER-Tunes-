import { Play, Pause, X } from 'lucide-react';
import { type SongItem } from '../types';

interface MiniPlayerProps {
  song: SongItem | null;
  isPlaying: boolean;
  onPlayPause: () => void;
  onClose: () => void;
  placement?: 'default' | 'aboveCreate';
  currentTime?: number;
  duration?: number;
  onSeek?: (timeSeconds: number) => void;
}

export function MiniPlayer({ song, isPlaying, onPlayPause, onClose, placement = 'default', currentTime, duration, onSeek }: MiniPlayerProps) {
  if (!song) return null;

  const bottomClass = placement === 'aboveCreate' ? 'bottom-[168px]' : 'bottom-[76px]';
  const ct = Number.isFinite(Number(currentTime)) ? Number(currentTime) : 0;
  const dur = Number.isFinite(Number(duration)) && Number(duration) > 0 ? Number(duration) : 0;
  const canSeek = Boolean(onSeek) && dur > 0;

  const formatTime = (sec: number) => {
    const s = Math.max(0, Math.floor(Number.isFinite(sec) ? sec : 0));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${String(r).padStart(2, '0')}`;
  };

  return (
    <div
      className={`fixed ${bottomClass} md:bottom-4 left-2 right-2 bg-[#0b0f16] border border-white/10 rounded-2xl p-3 shadow-2xl shadow-black/50 z-[120] animate-in slide-in-from-bottom-5`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-1 overflow-hidden">
          <div className="w-10 h-10 bg-white/10 rounded-md flex items-center justify-center flex-shrink-0 relative overflow-hidden">
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

      <div className="mt-2">
        <input
          type="range"
          min={0}
          max={dur || 0}
          step={0.1}
          value={dur ? Math.min(ct, dur) : 0}
          disabled={!canSeek}
          onChange={(e) => onSeek?.(Number(e.target.value))}
          className="w-full accent-yellow-400 disabled:opacity-40"
        />
        <div className="mt-1 flex justify-between text-[10px] text-slate-400 tabular-nums">
          <span>{formatTime(ct)}</span>
          <span>{formatTime(dur)}</span>
        </div>
      </div>
    </div>
  );
}
