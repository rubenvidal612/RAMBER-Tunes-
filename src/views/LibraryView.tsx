import { useState } from 'react';
import { type LibraryTab, type SongItem, type VibeItem } from '@/types';
import { cn } from '@/lib/utils';
import { Sparkles, Plus, Image as ImageIcon, ChevronDown, Play, Pause, Music, ThumbsUp, Settings2, Search, MoreVertical, Share2, Download } from 'lucide-react';

interface LibraryViewProps {
  canciones: SongItem[];
  vibes: VibeItem[];
  onAddVibe: (v: VibeItem) => void;
  onPlaySong: (s: SongItem) => void;
  activeSongId?: string;
  isPlaying?: boolean;
}

export function LibraryView({ canciones, vibes, onAddVibe, onPlaySong, activeSongId, isPlaying }: LibraryViewProps) {
  const [activeTab, setActiveTab] = useState<LibraryTab>('canciones');
  const [isCreateVibeOpen, setIsCreateVibeOpen] = useState(false);
  const [isCreateListOpen, setIsCreateListOpen] = useState(false);
  
  const tabs: {id: LibraryTab, label: string}[] = [
    { id: 'canciones', label: 'Canciones' },
    { id: 'video', label: 'Video' },
    { id: 'vibes', label: 'Vibes' },
    { id: 'listas', label: 'Listas' },
  ];

  return (
    <div className="flex-1 flex flex-col pt-2 relative">
      <div className="p-4 space-y-4">
        {/* Top Filters (Me gusta, Publicado, Filtros) */}
        {activeTab === 'canciones' && (
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
            <button className="flex-shrink-0 bg-white/5 border border-white/10 text-white px-4 py-2 rounded-full text-sm hover:bg-white/10 transition-colors">
              Me gusta
            </button>
            <button className="flex-shrink-0 bg-white/5 border border-white/10 text-white px-4 py-2 rounded-full text-sm hover:bg-white/10 transition-colors">
              Publicado
            </button>
            <button className="flex-shrink-0 bg-white/5 border border-white/10 text-white px-4 py-2 rounded-full text-sm hover:bg-white/10 transition-colors flex items-center gap-2">
              <Settings2 className="w-4 h-4" /> Filtros
            </button>
          </div>
        )}

        {/* Navigation Tabs - Mobile mostly, but hidden on desktop since sidebar covers it */}
        <div className="flex md:hidden border-b border-white/5 space-x-6 overflow-x-auto no-scrollbar">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "py-3 text-sm font-medium relative whitespace-nowrap transition-colors",
                activeTab === tab.id ? "text-slate-100" : "text-slate-500"
              )}
            >
              {tab.label}
              {activeTab === tab.id && (
                <div className="absolute bottom-0 left-0 w-full h-[2px] bg-gradient-to-r from-indigo-400 to-purple-400 rounded-t-full" />
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {activeTab === 'video' && (
          <div className="h-full flex flex-col items-center justify-center p-6 text-center mt-[-40px]">
            <div className="w-24 h-24 mb-6 text-slate-500 opacity-50 relative flex items-center justify-center">
              <div className="w-16 h-12 border-2 border-current rounded-t-md border-b-0 space-y-1 p-2">
                 <div className="w-2 h-0.5 bg-current rounded-full" />
              </div>
              <div className="absolute top-0 flex gap-2">
                <div className="w-1 h-3 bg-current rounded-full rotate-[-30deg] -ml-4" />
                <div className="w-1 h-4 bg-current rounded-full -mt-2" />
                <div className="w-1 h-3 bg-current rounded-full rotate-[30deg] -mr-4" />
              </div>
            </div>
            <p className="text-slate-400 font-medium text-sm mb-6 max-w-[240px]">
              Aún no tienes proyectos. ¡Comienza a crear tu primer MV!
            </p>
            <button className="bg-gradient-to-r from-indigo-500 to-purple-600 hover:opacity-90 active:scale-95 transition-all text-white font-bold uppercase tracking-wider text-sm px-8 py-3.5 rounded-full flex items-center gap-2 shadow-lg shadow-indigo-500/20">
              <Sparkles className="w-4 h-4 text-white" strokeWidth={2} />
              Crear Ahora
            </button>
          </div>
        )}

        {activeTab === 'vibes' && (
          <div className="p-4 grid grid-cols-2 gap-4">
            <div 
              onClick={() => setIsCreateVibeOpen(true)}
              className="w-full aspect-square border border-dashed border-white/20 rounded-2xl flex items-center justify-center cursor-pointer hover:bg-white/5 transition-colors glass-card"
            >
              <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
                <Plus className="w-5 h-5 text-slate-300" />
              </div>
            </div>
            {vibes.map(vibe => (
              <div key={vibe.id} className="w-full aspect-square glass-card rounded-2xl p-3 flex flex-col items-center justify-center text-center hover:bg-white/5 transition-colors">
                <div className="w-12 h-12 rounded-full bg-indigo-500/20 mb-3 flex items-center justify-center">
                  <ImageIcon className="w-6 h-6 text-indigo-400" />
                </div>
                <div className="text-sm font-bold text-white truncate w-full">{vibe.name}</div>
                <div className="text-xs text-slate-400 truncate w-full mt-1">{vibe.description}</div>
              </div>
            ))}
          </div>
        )}
        
        {activeTab === 'canciones' && (
          <div className="p-4 space-y-4">
            {/* Search Bar */}
            <div className="relative">
               <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
               <input 
                 type="text" 
                 placeholder="Buscar por nombre de canci" 
                 className="w-full bg-white/5 border border-white/5 rounded-full py-2.5 pl-10 pr-4 text-sm text-white placeholder:text-slate-500 outline-none focus:border-white/20 transition-colors"
               />
            </div>

            {canciones.length === 0 ? (
              <div className="p-6 text-center text-slate-500 text-sm mt-10">No hay canciones</div>
            ) : (
              canciones.map(song => (
                <div key={song.id} className="flex items-start gap-4 p-2 rounded-xl hover:bg-white/5 transition-colors group">
                  {/* Thumbnail */}
                  <div className="relative w-16 h-16 rounded-md overflow-hidden bg-slate-800 shrink-0 cursor-pointer" onClick={() => onPlaySong(song)}>
                     <img src={`https://picsum.photos/seed/${song.id}/150/150`} alt="Cover" className="w-full h-full object-cover" />
                     <div className="absolute bottom-1 right-1 bg-black/60 px-1 text-[10px] rounded font-medium">4:22</div>
                     <div className="absolute top-1 left-1 bg-white/10 px-1 rounded text-[8px] font-bold">AI</div>
                     
                     <div className={cn(
                        "absolute inset-0 bg-black/40 flex items-center justify-center transition-opacity",
                        activeSongId === song.id && isPlaying ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                     )}>
                        {activeSongId === song.id && isPlaying ? (
                          <Pause className="w-6 h-6 text-white" />
                        ) : (
                          <Play className="w-6 h-6 text-white ml-1" />
                        )}
                     </div>
                  </div>
                  
                  {/* Info */}
                  <div className="flex-1 min-w-0 flex flex-col justify-center">
                     <div className="flex items-center gap-2 mb-1">
                       <h3 className="text-sm font-bold truncate">{song.title}</h3>
                       <span className="shrink-0 bg-green-500/20 text-green-400 text-[9px] font-bold px-1.5 py-0.5 rounded">V3.0</span>
                       <span className="shrink-0 bg-white/10 text-slate-300 text-[9px] font-medium px-1.5 py-0.5 rounded">Cover</span>
                     </div>
                     <p className="text-xs text-slate-400 mb-2 truncate">{song.genre || 'norteño'}</p>
                     
                     {/* Actions */}
                     <div className="flex items-center gap-2">
                       <button className="bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-1 rounded-full text-xs text-slate-200 transition-colors">
                         Publicar
                       </button>
                       <button className="w-7 h-7 rounded-full flex items-center justify-center bg-white/5 hover:bg-white/10 transition-colors">
                         <ThumbsUp className="w-3.5 h-3.5 text-slate-300" />
                       </button>
                       <button className="w-7 h-7 rounded-full flex items-center justify-center bg-white/5 hover:bg-white/10 transition-colors">
                         <Share2 className="w-3.5 h-3.5 text-slate-300" />
                       </button>
                       <button className="w-7 h-7 rounded-full flex items-center justify-center bg-white/5 hover:bg-white/10 transition-colors">
                         <Download className="w-3.5 h-3.5 text-slate-300" />
                       </button>
                     </div>
                  </div>
                  
                  {/* Options Menu */}
                  <button className="w-8 h-8 rounded-full flex items-center justify-center bg-white/5 hover:bg-white/10 transition-colors shrink-0">
                    <MoreVertical className="w-4 h-4 text-slate-400" />
                  </button>
                </div>
              ))
            )}
          </div>
        )}
        {activeTab === 'listas' && (
          <div className="p-4 space-y-4">
            <button className="glass-card rounded-full px-4 py-2 flex items-center gap-2 text-sm text-slate-200 hover:bg-white/10 transition-colors w-max">
              <ThumbsUp className="w-4 h-4" /> Me gusta
            </button>
            
            <div className="grid grid-cols-2 gap-4">
              <div 
                onClick={() => setIsCreateListOpen(true)}
                className="w-full aspect-square border border-dashed border-white/20 rounded-2xl flex items-center justify-center cursor-pointer hover:bg-white/5 transition-colors glass-card"
              >
                <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
                  <Plus className="w-5 h-5 text-slate-300" />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {isCreateVibeOpen && (
        <CreateVibeModal onClose={() => setIsCreateVibeOpen(false)} canciones={canciones} onAddVibe={onAddVibe} />
      )}
      
      {isCreateListOpen && (
        <CreateListModal onClose={() => setIsCreateListOpen(false)} />
      )}
    </div>
  );
}

function CreateVibeModal({ onClose, canciones, onAddVibe }: { onClose: () => void, canciones: SongItem[], onAddVibe: (v: VibeItem) => void }) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  
  const handleCreate = () => {
    if (!name) return;
    onAddVibe({
      id: Math.random().toString(),
      name,
      description: desc
    });
    onClose();
  };

  return (
    <div className="absolute inset-x-0 bottom-0 top-10 glass-panel border-t border-white/10 rounded-t-[2rem] overflow-y-auto z-50 animate-in slide-in-from-bottom-full duration-300 shadow-[0_-20px_50px_rgba(0,0,0,0.5)] flex flex-col pb-safe">
      <div className="flex justify-center py-4 sticky top-0 bg-transparent z-10 backdrop-blur-xl border-b border-white/5">
        <div className="w-12 h-1 bg-white/20 rounded-full" />
      </div>
      
      <div className="p-6 flex-1 flex flex-col gap-6">
        <h2 className="text-2xl font-bold text-white mb-2">Crear Vibe</h2>
        
        <div className="space-y-2">
          <div className="glass-card rounded-xl p-4 flex justify-between items-center text-sm text-slate-300 cursor-pointer hover:bg-white/10 transition-colors">
            {canciones.length > 0 ? canciones[0].title : 'Seleccionar una canción'}
            <ChevronDown className="w-4 h-4 text-slate-500" />
          </div>
        </div>

        <div className="space-y-3">
          <label className="text-sm font-bold text-slate-200 block uppercase tracking-wider">Nombre</label>
          <input 
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ingresa el nombre de tu vibe"
            className="w-full glass-card rounded-xl px-4 py-4 text-sm text-white placeholder:text-slate-500 outline-none focus:border-indigo-500/50 transition-colors"
          />
        </div>

        <div className="space-y-3">
          <label className="text-sm font-bold text-slate-200 block uppercase tracking-wider">Imagen</label>
          <div className="flex items-center gap-4">
            <div className="w-24 h-24 rounded-2xl glass-card flex flex-col items-center justify-center gap-1 relative overflow-hidden group cursor-pointer hover:bg-white/10 transition-colors">
              <ImageIcon className="w-6 h-6 text-indigo-400" />
              <div className="absolute bottom-1.5 right-1.5 bg-black/50 p-1.5 rounded-full backdrop-blur">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 text-white"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
              </div>
            </div>
            <p className="text-xs text-slate-500 max-w-[200px] leading-relaxed">
              (Medidas sugeridas: 175x175 px, máximo 500 KB)
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <label className="text-sm font-bold text-slate-200 block uppercase tracking-wider">Descripción</label>
          <div className="relative">
            <textarea 
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="Ingresa la descripción de su vibe..."
              className="w-full glass-card rounded-xl p-4 text-sm text-white placeholder:text-slate-500 outline-none min-h-[140px] resize-none focus:border-indigo-500/50 transition-colors"
            />
            <div className="absolute bottom-4 right-4 text-xs text-slate-400">{desc.length} / 200</div>
          </div>
        </div>
      </div>

      <div className="p-6 flex gap-4 pb-12">
        <button 
          onClick={onClose}
          className="flex-1 py-4 rounded-full glass-card text-white font-semibold flex items-center justify-center transition-colors hover:bg-white/10"
        >
          Cancelar
        </button>
        <button 
          onClick={handleCreate}
          disabled={!name}
          className="flex-1 py-4 rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/20 text-white hover:opacity-90 font-bold flex items-center justify-center transition-all disabled:opacity-50 disabled:from-slate-700 disabled:to-slate-800 disabled:shadow-none"
        >
          Crear
        </button>
      </div>
    </div>
  );
}

function CreateListModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  
  return (
    <div className="absolute inset-x-0 bottom-0 top-10 glass-panel border-t border-white/10 rounded-t-[2rem] overflow-y-auto z-50 animate-in slide-in-from-bottom-full duration-300 shadow-[0_-20px_50px_rgba(0,0,0,0.5)] flex flex-col pb-safe">
      <div className="flex justify-center py-4 sticky top-0 bg-transparent z-10 backdrop-blur-xl border-b border-white/5">
        <div className="w-12 h-1 bg-white/20 rounded-full" />
      </div>
      
      <div className="p-6 flex-1 flex flex-col gap-6">
        <h2 className="text-2xl font-bold text-white mb-2">Crear lista de reproducción</h2>

        <div className="space-y-3">
          <label className="text-sm font-bold text-slate-200 block uppercase tracking-wider">Nombre</label>
          <div className="relative">
            <input 
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ingresa el nombre de tu lista de reprodu..."
              className="w-full glass-card rounded-xl px-4 py-4 text-sm text-white placeholder:text-slate-500 outline-none focus:border-indigo-500/50 transition-colors"
            />
            <div className="text-right mt-1 text-xs text-slate-400">{name.length}/50</div>
          </div>
        </div>

        <div className="space-y-3">
          <label className="text-sm font-bold text-slate-200 block uppercase tracking-wider">Imagen</label>
          <div className="flex items-center gap-4">
            <div className="w-24 h-24 rounded-2xl glass-card flex flex-col items-center justify-center gap-1 relative overflow-hidden group cursor-pointer hover:bg-white/10 transition-colors">
              <ImageIcon className="w-6 h-6 text-indigo-400" />
              <div className="absolute bottom-1.5 right-1.5 bg-black/50 p-1.5 rounded-full backdrop-blur">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 text-white"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
              </div>
            </div>
            <p className="text-xs text-slate-500 max-w-[200px] leading-relaxed">
              (Mejor tamaño 175*175 px, máx. 500 KB)
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <label className="text-sm font-bold text-slate-200 block uppercase tracking-wider">Descripción</label>
          <div className="relative">
            <textarea 
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="Ingresa la descripción de tu lista de reproducción..."
              className="w-full glass-card rounded-xl p-4 text-sm text-white placeholder:text-slate-500 outline-none min-h-[140px] resize-none focus:border-indigo-500/50 transition-colors"
            />
            <div className="absolute bottom-4 right-4 text-xs text-slate-400">{desc.length} / 200</div>
          </div>
        </div>
      </div>

      <div className="p-6 flex gap-4 pb-12">
        <button 
          onClick={onClose}
          className="flex-1 py-4 rounded-full glass-card text-white font-semibold flex items-center justify-center transition-colors hover:bg-white/10"
        >
          Cancelar
        </button>
        <button 
          onClick={onClose}
          disabled={!name}
          className="flex-1 py-4 rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/20 text-white hover:opacity-90 font-bold flex items-center justify-center transition-all disabled:opacity-50 disabled:from-slate-700 disabled:to-slate-800 disabled:shadow-none"
        >
          Crear
        </button>
      </div>
    </div>
  );
}
