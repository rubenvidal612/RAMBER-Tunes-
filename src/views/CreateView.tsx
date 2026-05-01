import { useState } from 'react';
import { Type, Dices, RefreshCw, Plus, Settings2, Trash2, ListMusic, Music, Maximize2, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';
import { type CreateMode, type SongItem } from '@/types';
import { GoogleGenAI } from "@google/genai";

interface CreateViewProps {
  onSongCreated?: (song: SongItem, audioBlob?: Blob) => void;
}

export function CreateView({ onSongCreated }: CreateViewProps) {
  const [mode, setMode] = useState<CreateMode>('simple');
  const [instrumental, setInstrumental] = useState(false);
  const [description, setDescription] = useState('');
  
  const [title, setTitle] = useState('');
  const [lyrics, setLyrics] = useState('');
  const [gender, setGender] = useState<'Masculino' | 'Femenino'>('Masculino');
  const [isGenerating, setIsGenerating] = useState(false);
  
  const [audioFile, setAudioFile] = useState<File | null>(null);

  const handleCreate = () => {
    setIsGenerating(true);
    // Simulate generation process, then save to library
    setTimeout(() => {
      setIsGenerating(false);
      if (onSongCreated) {
        const newSong: SongItem = {
          id: Math.random().toString(36).substring(2, 9),
          title: title || (mode === 'simple' ? 'Nueva Maqueta (Simple)' : 'Nueva Maqueta (Personalizada)'),
          description: description,
          lyrics: lyrics,
          genre: gender,
        };
        onSongCreated(newSong, audioFile || undefined);
        alert('Canción creada y guardada en Biblioteca.');
        setAudioFile(null);
        setTitle('');
      }
    }, 1500);
  };

  return (
    <div className="flex-1 flex flex-col pt-2 relative overflow-y-auto pb-32">
      {/* Top Header Tabs */}
      <div className="flex items-center justify-between px-4 mb-4">
        <div className="flex gap-6">
          <button 
            onClick={() => setMode('simple')}
            className={cn(
              "text-lg font-semibold relative pb-2 transition-colors",
              mode === 'simple' ? "text-slate-100" : "text-slate-400"
            )}
          >
            Simple
            {mode === 'simple' && (
              <div className="absolute bottom-0 left-0 w-full h-[3px] bg-gradient-to-r from-indigo-400 to-purple-400 rounded-t-full" />
            )}
          </button>
          <button 
            onClick={() => setMode('personalizado')}
            className={cn(
              "text-lg font-semibold relative pb-2 transition-colors",
              mode === 'personalizado' ? "text-slate-100" : "text-slate-400"
            )}
          >
            Personalizado
            {mode === 'personalizado' && (
              <div className="absolute bottom-0 left-0 w-full h-[3px] bg-gradient-to-r from-indigo-400 to-purple-400 rounded-t-full" />
            )}
          </button>
        </div>
        
        <div className="glass-card rounded-full px-3 py-1.5 flex items-center gap-1">
          <span className="text-xs font-semibold text-slate-300">V1.0</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </div>
      </div>

      <div className="px-4 space-y-4">
        {mode === 'simple' ? (
          <SimpleForm instrumental={instrumental} setInstrumental={setInstrumental} description={description} setDescription={setDescription} />
        ) : (
          <CustomForm 
            instrumental={instrumental} 
            setInstrumental={setInstrumental}
            lyrics={lyrics}
            setLyrics={setLyrics}
            gender={gender}
            setGender={setGender}
            title={title}
            setTitle={setTitle}
            audioFile={audioFile}
            setAudioFile={setAudioFile}
          />
        )}
      </div>

      {/* Action Buttons & Sticky Create */}
      <div className="fixed bottom-[76px] left-0 w-full px-4 flex items-center gap-3 bg-gradient-to-t from-[#020617] to-transparent pt-8 pb-4 z-20">
        <button className="glass-panel w-12 h-12 rounded-full flex items-center justify-center text-slate-400 hover:text-white transition-colors">
          <Trash2 className="w-5 h-5" />
        </button>
        <button 
          onClick={handleCreate}
          disabled={isGenerating}
          className="flex-1 bg-gradient-to-r from-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/20 text-white h-12 rounded-full font-bold flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-70"
        >
          {isGenerating ? (
            <RefreshCw className="w-5 h-5 animate-spin" />
          ) : (
            <Music className="w-5 h-5" strokeWidth={2} />
          )}
          {isGenerating ? 'Generando pista...' : 'Crear'}
        </button>
      </div>
    </div>
  );
}

function SimpleForm({ instrumental, setInstrumental, description, setDescription }: any) {
  return (
    <>
      <div className="glass-card rounded-3xl p-5 relative">
        <div className="flex items-start justify-between mb-2">
          <label className="text-sm font-semibold text-slate-200">Descripción de la canción</label>
          <button className="bg-white/5 p-1.5 rounded-full text-slate-300 hover:text-white transition-colors">
            <Dices className="w-4 h-4" />
          </button>
        </div>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Ej: una balada pop sobre un amanecer en la playa..."
          className="w-full bg-transparent text-white placeholder:text-slate-500 resize-none outline-none min-h-[80px]"
        />
        
        <div className="mt-4 flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
          <button className="flex-shrink-0 bg-white/5 w-8 h-8 rounded-full flex items-center justify-center text-slate-400">
            <RefreshCw className="w-4 h-4" />
          </button>
          <span className="flex-shrink-0 bg-indigo-500/20 text-indigo-300 px-3 py-1.5 rounded-full text-xs font-medium border border-indigo-500/20 truncate max-w-[150px]">
            female background vocals
          </span>
          <span className="flex-shrink-0 bg-indigo-500/20 text-indigo-300 px-3 py-1.5 rounded-full text-xs font-medium border border-indigo-500/20 truncate max-w-[150px]">
            dungeon neo so...
          </span>
        </div>
      </div>

      <div className="glass-card rounded-2xl p-4 flex items-center justify-between">
        <button className="flex items-center gap-2 text-white font-medium hover:text-gray-300 transition-colors">
          <Plus className="w-5 h-5" /> Letras
        </button>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-300">Instrumental</span>
          <Toggle checked={instrumental} onChange={() => setInstrumental(!instrumental)} />
        </div>
      </div>
    </>
  );
}

function CustomForm({ instrumental, setInstrumental, lyrics, setLyrics, gender, setGender, title, setTitle, audioFile, setAudioFile }: any) {
  const [isGeneratingLyrics, setIsGeneratingLyrics] = useState(false);

  const handleGenerateLyrics = async () => {
    if (!process.env.GEMINI_API_KEY) {
      alert("La clave de Gemini no está configurada. Usa el panel de configuraciones.");
      return;
    }
    setIsGeneratingLyrics(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const prompt = `Actúa como un escritor de canciones. Escribe una letra breve y creativa para una canción en español. Estilo aleatorio. Solo devuelve la letra, sin introducciones ni comentarios.`;
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });
      setLyrics(response.text || '');
    } catch (e) {
      alert("Error al generar letra.");
    }
    setIsGeneratingLyrics(false);
  };

  return (
    <>
      <div className="flex glass-card rounded-xl p-1">
        <label className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-white/10 rounded-lg text-sm font-medium border border-white/5 text-white cursor-pointer relative">
          <Upload className="w-4 h-4" /> 
          {audioFile ? audioFile.name.substring(0, 10) + '...' : '+ Audio'}
          <input 
            type="file" 
            accept="audio/*" 
            className="absolute inset-0 opacity-0 cursor-pointer" 
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                setAudioFile(e.target.files[0]);
              }
            }}
          />
        </label>
        <button className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium text-gray-400">
          <Plus className="w-4 h-4" /> vibra
        </button>
      </div>

      <div className="glass-card rounded-3xl p-5 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <label className="font-semibold text-white text-sm">Letras</label>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">Instrumental</span>
              <Toggle checked={instrumental} onChange={() => setInstrumental(!instrumental)} />
            </div>
          </div>
        </div>
        
        <div className="relative">
          <textarea
            value={lyrics}
            onChange={(e) => setLyrics(e.target.value)}
            placeholder="Agrega tu propia letra o ingresa un tema para generar"
            className="w-full bg-transparent text-sm placeholder:text-slate-500 resize-none outline-none min-h-[100px]"
          />
        </div>
        
        <div className="flex justify-end mt-2">
          <button 
            onClick={handleGenerateLyrics}
            disabled={isGeneratingLyrics}
            className="glass-panel hover:bg-white/10 px-4 py-2 rounded-full text-xs font-semibold uppercase tracking-wider text-white transition-colors flex items-center gap-1 disabled:opacity-50"
          >
            {isGeneratingLyrics && <RefreshCw className="w-3 h-3 animate-spin"/>}
            Generar letra
          </button>
        </div>
      </div>

      <div className="glass-card rounded-3xl p-5">
        <label className="font-semibold text-white mb-2 block text-sm">Estilos</label>
        <p className="text-xs text-slate-400 mb-4 line-clamp-2">
          Describe el estilo, el ambiente o los instrumentos de tu música
        </p>
        
        <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
          <button className="flex-shrink-0 bg-white/5 w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-white transition-colors">
            <ListMusic className="w-4 h-4" />
          </button>
          <button className="flex-shrink-0 bg-white/5 w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-white transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
          <span className="flex-shrink-0 bg-indigo-500/20 text-indigo-300 px-3 py-1.5 rounded-full text-xs font-medium border border-indigo-500/20 truncate">
            youthful
          </span>
          <span className="flex-shrink-0 bg-indigo-500/20 text-indigo-300 px-3 py-1.5 rounded-full text-xs font-medium border border-indigo-500/20 truncate">
            light reverb
          </span>
          <span className="flex-shrink-0 bg-indigo-500/20 text-indigo-300 px-3 py-1.5 rounded-full text-xs font-medium border border-indigo-500/20 truncate max-w-[120px]">
            female bac
          </span>
        </div>
      </div>

      <div className="glass-card rounded-2xl flex items-center p-1">
        <div className="px-3 py-2 text-sm text-white font-medium flex-1">Género</div>
        <div className="flex bg-white/5 rounded-xl p-1 border border-white/5">
          <button 
            onClick={() => setGender('Masculino')}
            className={cn(
              "px-4 py-1.5 rounded-lg text-sm transition-colors",
              gender === 'Masculino' ? "bg-indigo-500/40 text-white shadow" : "text-slate-400"
            )}
          >
            Masculino
          </button>
          <button 
            onClick={() => setGender('Femenino')}
            className={cn(
              "px-4 py-1.5 rounded-lg text-sm transition-colors",
              gender === 'Femenino' ? "bg-indigo-500/40 text-white shadow" : "text-slate-400"
            )}
          >
            Femenino
          </button>
        </div>
      </div>
      
      <div className="glass-card rounded-2xl flex items-center px-4 py-1 flex-1">
        <label className="text-sm font-medium text-white flex-shrink-0 w-36 py-2">Título <span className="text-slate-500 font-normal">(Opcional)</span></label>
        <input 
          type="text" 
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="bg-transparent text-white w-full py-2 outline-none text-sm text-right"
          placeholder="Sin título"
        />
      </div>

    </>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button 
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={cn(
        "w-10 h-6 rounded-full flex items-center px-1 transition-colors relative",
        checked ? "bg-indigo-500" : "bg-white/10"
      )}
    >
      <div 
        className={cn(
          "w-4 h-4 bg-white rounded-full transition-transform shadow-md",
          checked ? "translate-x-4" : "translate-x-0"
        )}
      />
    </button>
  );
}
