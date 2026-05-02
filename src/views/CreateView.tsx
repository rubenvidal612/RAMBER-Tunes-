import { useState } from 'react';
import { Type, Dices, RefreshCw, Plus, Settings2, Trash2, ListMusic, Music, Maximize2, Upload, List } from 'lucide-react';
import { cn } from '@/lib/utils';
import { type CreateMode, type SongItem } from '@/types';
import { GoogleGenAI } from "@google/genai";
import { getAccessToken } from '@/lib/supabaseBrowser';

interface CreateViewProps {
  onSongCreated?: (song: SongItem, audioBlob?: Blob) => void;
  credits?: number;
}

export function CreateView({ onSongCreated, credits }: CreateViewProps) {
  const [mode, setMode] = useState<CreateMode>('simple');
  const [instrumental, setInstrumental] = useState(false);
  const [description, setDescription] = useState('');
  const [style, setStyle] = useState('');
  
  const [title, setTitle] = useState('');
  const [lyrics, setLyrics] = useState('');
  const [gender, setGender] = useState<'Masculino' | 'Femenino'>('Masculino');
  const [isGenerating, setIsGenerating] = useState(false);
  
  const [audioFile, setAudioFile] = useState<File | null>(null);

  const handleCreate = async () => {
    if (!onSongCreated) return;

    const prompt = (mode === 'simple' ? description : (lyrics || description)).trim();
    if (!prompt) {
      alert('Escribe una descripción o letra para crear la canción.');
      return;
    }

    setIsGenerating(true);
    try {
      const t = await getAccessToken();
      if (!t.ok) {
        alert(t.error || 'No se pudo iniciar sesión.');
        return;
      }

      const wantsCustomMode = mode === 'personalizado' && (style.trim() || title.trim());
      const payload: any = {
        prompt,
        instrumental,
        customMode: wantsCustomMode,
      };
      if (wantsCustomMode) {
        payload.style = (style || 'General').trim();
        payload.title = (title || 'Nueva Canción').trim();
      }

      const r = await fetch('/api/suno/generate', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${t.token}`,
        },
        body: JSON.stringify(payload),
      });
      const out = await r.json().catch(() => ({}));
      if (!r.ok) {
        alert(out?.error || 'No se pudo crear la canción.');
        return;
      }

      const taskId = typeof out?.taskId === 'string' ? out.taskId : '';
      if (!taskId) {
        alert('No recibí taskId del servidor.');
        return;
      }

      let lastStatus = '';
      for (let i = 0; i < 60; i++) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        const s = await fetch(`/api/suno/task?taskId=${encodeURIComponent(taskId)}&kind=generate`, {
          headers: {
            authorization: `Bearer ${t.token}`,
          },
        });
        const st = await s.json().catch(() => ({}));
        const data = st?.data || st?.data?.data || st?.data;
        const status = String(data?.status || data?.successFlag || '').toUpperCase();
        lastStatus = status || lastStatus;

        if (status === 'SUCCESS') {
          const list =
            (Array.isArray(data?.response?.data) && data.response.data) ||
            (Array.isArray(data?.response?.sunoData) && data.response.sunoData) ||
            [];
          const track = list[0] || null;
          const audioUrl = (track?.audio_url || track?.audioUrl || track?.streamAudioUrl || '').toString();
          const audioId = (track?.id || '').toString();
          const tTitle = (track?.title || title || 'Nueva Canción').toString();
          if (!audioUrl) {
            alert('La canción se generó, pero no recibí el audio.');
            return;
          }

          onSongCreated({
            id: audioId || taskId,
            title: tTitle,
            description: mode === 'simple' ? description : style,
            lyrics: mode === 'personalizado' ? lyrics : undefined,
            genre: gender,
            audioUrl,
          });

          setAudioFile(null);
          setTitle('');
          setLyrics('');
          setDescription('');
          setStyle('');
          alert('Canción creada y guardada en Biblioteca.');
          return;
        }

        if (status === 'FAILED' || status === 'CREATE_TASK_FAILED' || status === 'GENERATE_AUDIO_FAILED') {
          const msg = data?.errorMessage || data?.error_message || 'Error en la generación';
          alert(String(msg));
          return;
        }
      }

      alert(`Sigue generándose... estado: ${lastStatus || 'PENDIENTE'}`);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error creando la canción');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col relative overflow-y-auto">
      {/* Top Header Tabs */}
      <div className="flex items-center justify-between px-4 mt-4 mb-4">
        <div className="flex bg-white/5 rounded-full p-1 border border-white/5">
          <button 
            onClick={() => setMode('simple')}
            className={cn(
              "px-5 py-1.5 rounded-full text-sm font-semibold transition-colors",
              mode === 'simple' ? "bg-white text-black" : "text-slate-300 hover:text-white"
            )}
          >
            Simple
          </button>
          <button 
            onClick={() => setMode('personalizado')}
            className={cn(
              "px-5 py-1.5 rounded-full text-sm font-semibold transition-colors",
              mode === 'personalizado' ? "bg-white text-black" : "text-slate-300 hover:text-white"
            )}
          >
            Personalizado
          </button>
        </div>
        
        <div className="border border-white/20 hover:border-white/40 block rounded-full px-3 py-1.5 cursor-pointer hover:bg-white/5 transition-colors">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-200">V1.0</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-200">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </div>
        </div>
        
        <div className="flex items-center gap-2 bg-white/5 rounded-full px-3 py-1.5 border border-white/10">
          <div className="w-5 h-5 rounded-full bg-yellow-500 flex items-center justify-center text-black font-bold text-xs">♪</div>
          <span className="text-sm font-semibold text-slate-200">{credits || 0}</span>
        </div>
      </div>

      <div className="px-4 space-y-4 pb-[220px] md:pb-32">
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
            style={style}
            setStyle={setStyle}
            audioFile={audioFile}
            setAudioFile={setAudioFile}
          />
        )}
      </div>

      {/* Action Buttons & Sticky Create */}
      <div className="fixed md:sticky bottom-[76px] md:bottom-0 left-0 right-0 w-full px-4 flex flex-col gap-2 bg-gradient-to-t from-[#020617] via-[#020617] to-transparent pt-12 pb-6 z-30">
        <button 
          onClick={handleCreate}
          disabled={isGenerating}
          className="w-full bg-green-500 hover:bg-green-400 text-[#020617] h-[48px] rounded-full font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-70"
        >
          {isGenerating ? (
            <RefreshCw className="w-5 h-5 animate-spin" />
          ) : (
            <Music className="w-5 h-5" strokeWidth={2} />
          )}
          <span>Crear</span>
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

function CustomForm({ instrumental, setInstrumental, lyrics, setLyrics, gender, setGender, title, setTitle, style, setStyle, audioFile, setAudioFile }: any) {
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
      <div className="glass-card rounded-2xl p-4">
        <label className="block text-sm font-semibold text-slate-200 mb-2">Estilo</label>
        <input
          value={style}
          onChange={(e) => setStyle(e.target.value)}
          placeholder="Ej: corrido tumbado, reggaetón, pop, banda..."
          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-slate-500 outline-none focus:border-white/20 transition-colors"
        />
      </div>

      <div className="flex gap-4">
        <label className="flex-1 flex items-center justify-center gap-2 py-3 bg-white/5 hover:bg-white/10 rounded-2xl text-sm font-semibold border border-white/5 text-slate-300 hover:text-white cursor-pointer relative transition-colors shadow-inner">
          <Plus className="w-5 h-5 text-slate-400" /> 
          {audioFile ? audioFile.name.substring(0, 10) + '...' : 'Audio'}
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
        <button className="flex-1 flex items-center justify-center gap-2 py-3 bg-white/5 hover:bg-white/10 rounded-2xl text-sm font-semibold border border-white/5 text-slate-300 hover:text-white transition-colors shadow-inner">
          <Plus className="w-5 h-5 text-slate-400" /> Vibe
        </button>
      </div>

      <div className="bg-[#111318] border border-white/5 rounded-2xl p-5 flex flex-col mt-2 shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)]">
        <div className="flex items-center justify-between mb-4">
          <label className="font-bold text-white text-base">Letras</label>
          <div className="flex items-center gap-3">
            <button className="text-slate-400 hover:text-white transition-colors">
              <ListMusic className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-300">Instrumental</span>
              <Toggle checked={instrumental} onChange={() => setInstrumental(!instrumental)} />
            </div>
          </div>
        </div>
        
        <div className="relative flex flex-col">
          <textarea
            value={lyrics}
            onChange={(e) => setLyrics(e.target.value)}
            placeholder="Agrega tu propia letra o ingresa un tema para generar"
            className="w-full bg-transparent text-[15px] placeholder:text-slate-500 font-medium resize-none outline-none min-h-[120px] text-white"
          />
          <button className="absolute top-0 right-0 text-slate-400 hover:text-white">
             <Maximize2 className="w-4 h-4" />
          </button>
          
          <div className="flex justify-end mt-2">
            <button 
              onClick={handleGenerateLyrics}
              disabled={isGeneratingLyrics}
              className="bg-white/5 hover:bg-white/10 text-slate-200 border border-white/10 px-4 py-2 rounded-full text-sm font-semibold transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {isGeneratingLyrics && <RefreshCw className="w-4 h-4 animate-spin" />}
              Generar letra
            </button>
          </div>
        </div>
      </div>

      {/* Instrucciones (Estilos) */}
      <div className="bg-[#111318] border border-white/5 rounded-2xl p-5 shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)] mt-4">
        <label className="font-bold text-white text-base mb-4 block">Instrucciones</label>
        <textarea
          placeholder="Describe el estilo, el ambiente o los instrumentos de tu música"
          className="w-full bg-transparent text-[15px] placeholder:text-slate-500 font-medium resize-none outline-none min-h-[80px] text-white"
        />
        
        <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar mt-4">
          <button className="flex-shrink-0 bg-white/5 w-9 h-9 rounded-full flex items-center justify-center text-slate-400 border border-white/5">
            <List className="w-4 h-4" />
          </button>
          <button className="flex-shrink-0 bg-white/5 w-9 h-9 rounded-full flex items-center justify-center text-slate-400 border border-white/5">
            <RefreshCw className="w-4 h-4" />
          </button>
          <span className="flex-shrink-0 bg-white/5 text-slate-300 px-4 py-2 rounded-full text-sm font-medium border border-white/5 truncate max-w-[200px]">
            raspy female vocals
          </span>
          <span className="flex-shrink-0 bg-white/5 text-slate-300 px-4 py-2 rounded-full text-sm font-medium border border-white/5 truncate max-w-[200px]">
            modern danceh...
          </span>
        </div>
      </div>

      {/* Género */}
      <div className="bg-[#111318] border border-white/5 rounded-2xl p-5 shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)] mt-4 flex items-center justify-between">
        <label className="font-bold text-white text-base">Género</label>
        <div className="flex gap-4">
          <button 
            onClick={() => setGender('Masculino')}
            className={cn("text-sm font-semibold transition-colors", gender === 'Masculino' ? "text-slate-200" : "text-slate-500")}
          >
            Masculino
          </button>
          <button 
            onClick={() => setGender('Femenino')}
            className={cn("text-sm font-semibold transition-colors", gender === 'Femenino' ? "text-slate-200" : "text-slate-500")}
          >
            Femenino
          </button>
        </div>
      </div>

      {/* Título de la canción */}
      <div className="bg-[#111318] border border-white/5 rounded-2xl p-5 shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)] mt-4 mb-4">
        <label className="font-bold text-white text-base mb-4 block">Título de la canción <span className="text-slate-500 font-normal">(Opcional)</span></label>
        <div className="flex items-center justify-between bg-white/5 rounded-xl px-4 py-3 border border-white/5">
          <input 
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value.substring(0, 80))}
            placeholder="Introduce el título de tu canción"
            className="bg-transparent text-white placeholder:text-slate-500 outline-none flex-1 text-[15px]"
          />
          <span className="text-slate-500 text-sm">{title.length}/80</span>
        </div>
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
