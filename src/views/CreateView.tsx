import { useEffect, useRef, useState } from 'react';
import { Dices, RefreshCw, Plus, ListMusic, Music, Maximize2, List, X, ChevronDown, User, AudioLines, Pencil, Library } from 'lucide-react';
import { cn } from '@/lib/utils';
import { type CreateMode, type SongItem } from '@/types';
import { GoogleGenAI } from "@google/genai";
import { ensureAnonSession, getAccessToken, supabaseBrowser } from '@/lib/supabaseBrowser';

interface CreateViewProps {
  onSongCreated?: (song: SongItem, audioBlob?: Blob) => void;
  credits?: number;
  openPersonaPickerSignal?: number;
  onGoLibrary?: () => void;
}

export function CreateView({ onSongCreated, credits, openPersonaPickerSignal, onGoLibrary }: CreateViewProps) {
  const [mode, setMode] = useState<CreateMode>('personalizado');
  const [instrumental, setInstrumental] = useState(false);
  const [description, setDescription] = useState('');
  const [instructions, setInstructions] = useState('');
  
  const [title, setTitle] = useState('');
  const [lyrics, setLyrics] = useState('');
  const [gender, setGender] = useState<'Masculino' | 'Femenino'>('Masculino');
  const [isGenerating, setIsGenerating] = useState(false);
  
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioUploadUrl, setAudioUploadUrl] = useState<string>('');
  const [isUploadingAudio, setIsUploadingAudio] = useState(false);
  const [audioAction, setAudioAction] = useState<'cover' | 'extend' | 'library'>('cover');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isAudioModalOpen, setIsAudioModalOpen] = useState(false);
  const [audioUploadError, setAudioUploadError] = useState<string | null>(null);

  const [model, setModel] = useState<'V5' | 'V5_5' | 'V4_5PLUS' | 'V4_5ALL' | 'V4_5' | 'V4'>('V5');

  const [weirdness, setWeirdness] = useState(50);
  const [styleInfluence, setStyleInfluence] = useState(50);
  const [audioInfluence, setAudioInfluence] = useState(25);
  const [showMoreOptions, setShowMoreOptions] = useState(false);

  const [isPersonaPickerOpen, setIsPersonaPickerOpen] = useState(false);
  const [personas, setPersonas] = useState<Array<{ persona_id: string; name: string; photo_url?: string }>>([]);
  const [selectedPersona, setSelectedPersona] = useState<{ persona_id: string; name: string; photo_url?: string } | null>(null);

  const audioInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('ramber_create_draft_v1');
      if (!raw) return;
      const d = JSON.parse(raw);
      const m = typeof d?.mode === 'string' ? d.mode : '';
      if (m === 'simple' || m === 'personalizado') setMode(m);
      setInstrumental(Boolean(d?.instrumental));
      if (typeof d?.description === 'string') setDescription(d.description);
      if (typeof d?.instructions === 'string') setInstructions(d.instructions);
      if (typeof d?.title === 'string') setTitle(d.title);
      if (typeof d?.lyrics === 'string') setLyrics(d.lyrics);
      const g = typeof d?.gender === 'string' ? d.gender : '';
      if (g === 'Masculino' || g === 'Femenino') setGender(g);
      const w = Number(d?.weirdness);
      const si = Number(d?.styleInfluence);
      const ai = Number(d?.audioInfluence);
      if (Number.isFinite(w)) setWeirdness(Math.max(0, Math.min(100, Math.round(w))));
      if (Number.isFinite(si)) setStyleInfluence(Math.max(0, Math.min(100, Math.round(si))));
      if (Number.isFinite(ai)) setAudioInfluence(Math.max(0, Math.min(100, Math.round(ai))));
      const pid = typeof d?.persona_id === 'string' ? d.persona_id : '';
      const pn = typeof d?.persona_name === 'string' ? d.persona_name : '';
      if (pid) setSelectedPersona({ persona_id: pid, name: pn || 'Persona' });
    } catch {
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        'ramber_create_draft_v1',
        JSON.stringify({
          mode,
          instrumental,
          description,
          instructions,
          title,
          lyrics,
          gender,
          weirdness,
          styleInfluence,
          audioInfluence,
          persona_id: selectedPersona?.persona_id || '',
          persona_name: selectedPersona?.name || '',
        }),
      );
    } catch {
    }
  }, [mode, instrumental, description, instructions, title, lyrics, gender, model, selectedPersona, weirdness, styleInfluence, audioInfluence]);

  useEffect(() => {
    if (!openPersonaPickerSignal) return;
    setIsPersonaPickerOpen(true);
  }, [openPersonaPickerSignal]);

  useEffect(() => {
    if (!isPersonaPickerOpen) return;
    if (!supabaseBrowser) return;
    ensureAnonSession()
      .then(async (s) => {
        if (!s.ok) return;
        const { data } = await supabaseBrowser.auth.getUser();
        const user = data?.user;
        if (!user) return;
        const { data: rows } = await supabaseBrowser
          .from('suno_personas')
          .select('persona_id, name, photo_url')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(50);
        const list = Array.isArray(rows)
          ? rows
              .map((r: any) => ({
                persona_id: String(r?.persona_id || '').trim(),
                name: String(r?.name || '').trim(),
                photo_url: typeof r?.photo_url === 'string' ? r.photo_url : '',
              }))
              .filter((x: any) => x.persona_id)
          : [];
        setPersonas(list);
        setSelectedPersona((prev) => {
          if (!prev?.persona_id) return prev;
          const match = list.find((p) => p.persona_id === prev.persona_id);
          if (!match) return prev;
          if (prev.photo_url) return prev;
          if (!match.photo_url) return prev;
          return { ...prev, photo_url: match.photo_url };
        });
      })
      .catch(() => {});
  }, [isPersonaPickerOpen]);

  const clearAudio = () => {
    setAudioFile(null);
    setAudioUploadUrl('');
    setIsUploadingAudio(false);
    setAudioAction('cover');
    setUploadProgress(0);
    setIsAudioModalOpen(false);
    setAudioUploadError(null);
    if (audioInputRef.current) audioInputRef.current.value = '';
  };

  useEffect(() => {
    if (!isUploadingAudio) return;
    setUploadProgress((p) => (p > 0 ? p : 1));
    const id = window.setInterval(() => {
      setUploadProgress((p) => {
        const next = p <= 0 ? 1 : p + 3;
        return Math.min(next, 95);
      });
    }, 400);
    return () => window.clearInterval(id);
  }, [isUploadingAudio]);

  useEffect(() => {
    if (!audioUploadUrl) return;
    if (!audioFile) return;
    setUploadProgress((p) => (p >= 95 ? 100 : 100));
  }, [audioUploadUrl, audioFile]);

  const uploadAudio = async (file: File) => {
    if (!supabaseBrowser) {
      setAudioUploadError('Supabase no está configurado.');
      alert('Supabase no está configurado.');
      return;
    }
    setAudioUploadError(null);
    setIsUploadingAudio(true);
    setAudioUploadUrl('');
    try {
      const s = await ensureAnonSession();
      if (!s.ok) {
        setAudioUploadError(s.error || 'No se pudo iniciar sesión.');
        alert(s.error || 'No se pudo iniciar sesión.');
        return;
      }
      const { data } = await supabaseBrowser.auth.getUser();
      const user = data?.user;
      if (!user) {
        setAudioUploadError('No se pudo identificar tu usuario.');
        alert('No se pudo identificar tu usuario.');
        return;
      }
      const safeName = (file.name || 'audio')
        .trim()
        .replaceAll(/[^a-zA-Z0-9._-]+/g, '_')
        .slice(0, 80);
      const path = `uploads/${user.id}/${Date.now()}_${safeName}`;
      const { error } = await supabaseBrowser.storage.from('ramber-tunes').upload(path, file, {
        upsert: true,
        contentType: file.type || undefined,
        cacheControl: '31536000',
      });
      if (error) {
        setAudioUploadError(error.message || 'No se pudo subir el audio.');
        alert(error.message || 'No se pudo subir el audio.');
        return;
      }
      const { data: pub } = supabaseBrowser.storage.from('ramber-tunes').getPublicUrl(path);
      const url = (pub?.publicUrl || '').toString();
      if (!url) {
        setAudioUploadError('No pude obtener el link del audio subido.');
        alert('No pude obtener el link del audio subido.');
        return;
      }
      setAudioUploadUrl(url);
      setAudioUploadError(null);
    } finally {
      setIsUploadingAudio(false);
    }
  };

  const pickAudio = async (file: File) => {
    setAudioFile(file);
    setAudioUploadUrl('');
    setAudioAction('cover');
    setUploadProgress(1);
    setIsAudioModalOpen(true);
    setAudioUploadError(null);
    uploadAudio(file).catch(() => {});
  };

  const saveUploadedAudioToLibrary = async () => {
    if (!onSongCreated) return;
    if (!audioFile) return;
    if (!audioUploadUrl) {
      alert('Todavía se está subiendo el audio. Espera un momento.');
      return;
    }
    const titleFromFile = (audioFile.name || 'Audio').toString().slice(0, 120);
    onSongCreated({
      id: `upload_${Date.now()}`,
      title: titleFromFile,
      description: (instructions || 'Audio subido').toString().slice(0, 2000),
      lyrics: lyrics || undefined,
      genre: gender,
      audioUrl: audioUploadUrl,
      coverUrl: undefined,
      sunoTaskId: null,
      sunoAudioId: null,
      isCover: false,
    });
    clearAudio();
    onGoLibrary?.();
  };

  const continueFromAudio = async () => {
    if (audioAction === 'library') return saveUploadedAudioToLibrary();
    if (audioAction === 'extend') {
      alert('Extender: Próximamente');
      return;
    }
    return handleCoverFromAudio();
  };

  const handleCoverFromAudio = async () => {
    if (!onSongCreated) return;
    if (!audioUploadUrl) {
      alert('Primero sube tu audio.');
      return;
    }
    setIsGenerating(true);
    try {
      const t = await getAccessToken();
      if (!t.ok) {
        alert(t.error || 'No se pudo iniciar sesión.');
        return;
      }

      const prompt = (lyrics || description || ' ').trim() || ' ';
      const payload: any = {
        uploadUrl: audioUploadUrl,
        instrumental,
        prompt,
        style: (instructions || 'General').trim(),
        title: (title || 'Cover').trim(),
        model,
        weirdnessConstraint: weirdness / 100,
        styleWeight: styleInfluence / 100,
        audioWeight: audioInfluence / 100,
      };
      if (selectedPersona?.persona_id) {
        payload.personaId = selectedPersona.persona_id;
        payload.personaModel = 'voice_persona';
      }

      const r = await fetch('/api/suno/upload-cover', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${t.token}`,
        },
        body: JSON.stringify(payload),
      });
      const out = await r.json().catch(() => ({}));
      if (!r.ok) {
        alert(out?.error || 'No se pudo hacer el cover.');
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
          headers: { authorization: `Bearer ${t.token}` },
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
          const tTitle = (track?.title || title || 'Cover').toString();
          if (!audioUrl) {
            alert('El cover se generó, pero no recibí el audio.');
            return;
          }
          onSongCreated({
            id: audioId || taskId,
            title: tTitle,
            description: instructions || 'Cover',
            lyrics: lyrics || undefined,
            genre: gender,
            audioUrl,
            coverUrl: (track?.image_url || track?.imageUrl || '').toString() || undefined,
            sunoTaskId: taskId,
            sunoAudioId: audioId || null,
            isCover: true,
          });
          clearAudio();
          alert('Cover creado y guardado en Biblioteca.');
          return;
        }

        if (status === 'FAILED' || status === 'CREATE_TASK_FAILED' || status === 'GENERATE_AUDIO_FAILED') {
          const msg = data?.errorMessage || data?.error_message || 'Error en el cover';
          alert(String(msg));
          return;
        }
      }
      alert(`Sigue generándose... estado: ${lastStatus || 'PENDIENTE'}`);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error haciendo cover');
    } finally {
      setIsGenerating(false);
    }
  };

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

      const wantsCustomMode = mode === 'personalizado';
      const payload: any = {
        prompt,
        instrumental,
        customMode: wantsCustomMode,
        model,
      };
      if (wantsCustomMode) {
        payload.style = (instructions || 'General').trim();
        payload.title = (title || 'Nueva Canción').trim();
        payload.weirdnessConstraint = weirdness / 100;
        payload.styleWeight = styleInfluence / 100;
        payload.audioWeight = audioInfluence / 100;
      }
      if (selectedPersona?.persona_id) {
        payload.personaId = selectedPersona.persona_id;
        payload.personaModel = 'voice_persona';
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
            description: mode === 'simple' ? description : instructions,
            lyrics: mode === 'personalizado' ? lyrics : undefined,
            genre: gender,
            audioUrl,
            coverUrl: (track?.image_url || track?.imageUrl || '').toString() || undefined,
            sunoTaskId: taskId,
            sunoAudioId: audioId || null,
            isCover: Boolean(audioFile || audioUploadUrl),
          });

          setAudioFile(null);
          setTitle('');
          setLyrics('');
          setDescription('');
          setInstructions('');
          setAudioUploadUrl('');
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
        
        <div className="border border-white/20 hover:border-white/40 block rounded-full px-3 py-1.5 hover:bg-white/5 transition-colors">
          <div className="flex items-center gap-2">
            <select
              value={model}
              onChange={(e) => {
                const v = e.target.value as any;
                setModel(v);
              }}
              className="bg-transparent text-xs font-semibold text-slate-200 outline-none appearance-none pr-4"
            >
              <option value="V5">V5</option>
              <option value="V5_5">V5.5</option>
              <option value="V4_5PLUS">V4.5+</option>
              <option value="V4_5ALL">V4.5 All</option>
              <option value="V4_5">V4.5</option>
              <option value="V4">V4</option>
            </select>
            <ChevronDown className="w-4 h-4 text-slate-200 -ml-3 pointer-events-none" />
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
            instructions={instructions}
            setInstructions={setInstructions}
            showMoreOptions={showMoreOptions}
            setShowMoreOptions={setShowMoreOptions}
            weirdness={weirdness}
            setWeirdness={setWeirdness}
            styleInfluence={styleInfluence}
            setStyleInfluence={setStyleInfluence}
            audioInfluence={audioInfluence}
            setAudioInfluence={setAudioInfluence}
            audioFile={audioFile}
            setAudioFile={setAudioFile}
            audioInputRef={audioInputRef}
            audioUploadUrl={audioUploadUrl}
            isUploadingAudio={isUploadingAudio}
            onUploadAudio={uploadAudio}
            onClearAudio={clearAudio}
            onCoverFromAudio={handleCoverFromAudio}
            onOpenPersonaPicker={() => setIsPersonaPickerOpen(true)}
            onPickAudio={pickAudio}
            uploadProgress={uploadProgress}
            onOpenAudioModal={() => setIsAudioModalOpen(true)}
            selectedPersona={selectedPersona}
            onClearPersona={() => setSelectedPersona(null)}
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

      {isPersonaPickerOpen && (
        <div className="fixed inset-0 z-[120] bg-black/70 flex items-end md:items-center justify-center">
          <button className="absolute inset-0 w-full h-full" onClick={() => setIsPersonaPickerOpen(false)} aria-label="Cerrar" />
          <div className="relative w-full md:max-w-[520px] bg-[#0b0f16] border border-white/10 rounded-t-3xl md:rounded-3xl overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-white/10">
              <div className="text-white font-extrabold">Persona</div>
              <button
                onClick={() => setIsPersonaPickerOpen(false)}
                className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 max-h-[60vh] overflow-y-auto">
              {personas.length === 0 ? (
                <div className="text-slate-400 text-sm">No tienes Personas todavía.</div>
              ) : (
                <div className="space-y-2">
                  {personas.map((p) => (
                    <button
                      key={p.persona_id}
                      onClick={() => {
                        setSelectedPersona(p);
                        setIsPersonaPickerOpen(false);
                      }}
                      className="w-full glass-card rounded-2xl p-4 flex items-center gap-3 hover:bg-white/10 transition-colors"
                    >
                      {p.photo_url ? (
                        <div className="w-10 h-10 rounded-xl overflow-hidden bg-white/5 border border-white/10 shrink-0">
                          <img src={p.photo_url} alt="" className="w-full h-full object-cover" />
                        </div>
                      ) : (
                        <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-200 shrink-0">
                          <User className="w-5 h-5" />
                        </div>
                      )}
                      <div className="flex-1 text-left min-w-0">
                        <div className="text-white font-bold truncate">{p.name || 'Persona'}</div>
                        <div className="text-slate-500 text-xs truncate">Voz guardada</div>
                      </div>
                      <ChevronDown className="w-5 h-5 text-slate-500 rotate-[-90deg]" />
                    </button>
                  ))}
                </div>
              )}
              {selectedPersona?.persona_id && (
                <button
                  onClick={() => {
                    setSelectedPersona(null);
                    setIsPersonaPickerOpen(false);
                  }}
                  className="w-full mt-3 bg-white/5 border border-white/10 rounded-full py-3 text-slate-200 font-semibold hover:bg-white/10 transition-colors"
                >
                  Quitar Persona
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {isAudioModalOpen && audioFile && (
        <div className="fixed inset-0 z-[130] bg-black/70 flex items-end md:items-center justify-center">
          <button className="absolute inset-0 w-full h-full" onClick={() => setIsAudioModalOpen(false)} aria-label="Cerrar" />
          <div className="relative w-full md:max-w-[520px] bg-[#0b0f16] border border-white/10 rounded-t-3xl md:rounded-3xl overflow-hidden shadow-[0_-20px_60px_rgba(0,0,0,0.6)]">
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <div className="text-white font-extrabold">Crear desde tu audio</div>
              <button
                onClick={() => setIsAudioModalOpen(false)}
                className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4">
              {(() => {
                const hot = Number(uploadProgress || 0) >= 87;
                const deg = Math.max(0, Math.min(100, Number(uploadProgress || 0))) * 3.6;
                const ringColor = hot ? '#ef4444' : '#22c55e';
                const pctText = `${Math.max(0, Math.min(100, Math.round(Number(uploadProgress || 0))))}%`;
                return (
                  <>
              <div className="flex items-center gap-4">
                <div
                  className="w-14 h-14 rounded-full p-[2px] shrink-0"
                  style={{
                    background: `conic-gradient(${ringColor} ${deg}deg, rgba(255,255,255,0.10) 0deg)`,
                  }}
                >
                  <div className="w-full h-full rounded-full bg-[#0b0f16] border border-white/10 flex items-center justify-center">
                    <div className={cn("text-xs font-extrabold", hot ? "text-red-400" : "text-slate-100")}>{pctText}</div>
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="text-white font-extrabold truncate">{audioFile.name}</div>
                  <div className="text-slate-400 text-sm">{isUploadingAudio ? 'Subiendo…' : audioUploadUrl ? 'Listo' : 'Preparando…'}</div>
                </div>
              </div>

              {audioUploadError && (
                <div className="mt-4 bg-red-500/10 border border-red-500/20 rounded-2xl p-3 text-sm text-red-200">
                  {audioUploadError}
                </div>
              )}

              <div className="mt-4 text-slate-300 text-sm">Elige qué quieres hacer</div>
                  </>
                );
              })()}

              <div className="grid grid-cols-3 gap-3 mt-3">
                <button
                  onClick={() => setAudioAction('cover')}
                  className={cn(
                    "rounded-2xl p-4 border transition-colors text-left",
                    audioAction === 'cover' ? "border-emerald-400/70 bg-emerald-500/10" : "border-white/10 bg-white/5 hover:bg-white/10"
                  )}
                  disabled={isUploadingAudio}
                >
                  <div className="w-10 h-10 rounded-xl bg-black/30 border border-white/10 flex items-center justify-center text-slate-200">
                    <AudioLines className="w-5 h-5" />
                  </div>
                  <div className="mt-3 text-white font-bold">Cover</div>
                </button>

                <button
                  onClick={() => setAudioAction('extend')}
                  className={cn(
                    "rounded-2xl p-4 border transition-colors text-left",
                    audioAction === 'extend' ? "border-emerald-400/70 bg-emerald-500/10" : "border-white/10 bg-white/5 hover:bg-white/10"
                  )}
                  disabled={isUploadingAudio}
                >
                  <div className="w-10 h-10 rounded-xl bg-black/30 border border-white/10 flex items-center justify-center text-slate-200">
                    <Pencil className="w-5 h-5" />
                  </div>
                  <div className="mt-3 text-white font-bold">Extender</div>
                </button>

                <button
                  onClick={() => setAudioAction('library')}
                  className={cn(
                    "rounded-2xl p-4 border transition-colors text-left",
                    audioAction === 'library' ? "border-emerald-400/70 bg-emerald-500/10" : "border-white/10 bg-white/5 hover:bg-white/10"
                  )}
                  disabled={isUploadingAudio}
                >
                  <div className="w-10 h-10 rounded-xl bg-black/30 border border-white/10 flex items-center justify-center text-slate-200">
                    <Library className="w-5 h-5" />
                  </div>
                  <div className="mt-3 text-white font-bold">Biblioteca</div>
                </button>
              </div>

              <button
                onClick={() => {
                  setIsAudioModalOpen(false);
                  continueFromAudio().catch(() => {});
                }}
                disabled={
                  isUploadingAudio ||
                  (audioAction === 'cover' && !audioUploadUrl) ||
                  (audioAction === 'library' && !audioUploadUrl)
                }
                className="mt-4 w-full bg-green-500 hover:bg-green-400 text-[#020617] h-[52px] rounded-full font-extrabold text-sm transition-colors disabled:opacity-60"
              >
                Continuar
              </button>

              <button
                onClick={() => {
                  if (audioFile) {
                    uploadAudio(audioFile).catch(() => {});
                    return;
                  }
                }}
                disabled={isUploadingAudio || !audioFile}
                className="mt-3 w-full bg-white/5 border border-white/10 rounded-full py-3 text-slate-200 font-semibold hover:bg-white/10 transition-colors disabled:opacity-60"
              >
                Reintentar subida
              </button>

              <button
                onClick={clearAudio}
                className="mt-3 w-full bg-white/5 border border-white/10 rounded-full py-3 text-slate-200 font-semibold hover:bg-white/10 transition-colors"
              >
                Cambiar audio
              </button>
            </div>
          </div>
        </div>
      )}
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

function CustomForm({
  instrumental,
  setInstrumental,
  lyrics,
  setLyrics,
  gender,
  setGender,
  title,
  setTitle,
  instructions,
  setInstructions,
  showMoreOptions,
  setShowMoreOptions,
  weirdness,
  setWeirdness,
  styleInfluence,
  setStyleInfluence,
  audioInfluence,
  setAudioInfluence,
  audioFile,
  setAudioFile,
  audioInputRef,
  audioUploadUrl,
  isUploadingAudio,
  onUploadAudio,
  onClearAudio,
  onCoverFromAudio,
  onOpenPersonaPicker,
  onPickAudio,
  uploadProgress,
  onOpenAudioModal,
  selectedPersona,
  onClearPersona,
}: any) {
  const [isGeneratingLyrics, setIsGeneratingLyrics] = useState(false);
  const [isLyricsExpanded, setIsLyricsExpanded] = useState(false);

  const normalizeLyrics = (t: string) => {
    const lines = (t || '').toString().replaceAll('\r\n', '\n').split('\n');
    const mapped = lines.map((line) => {
      const s = line.trim();
      if (!s) return '';
      const lower = s.toLowerCase();
      const isTag =
        lower === 'coro' ||
        lower.startsWith('coro ') ||
        lower === 'chorus' ||
        lower.startsWith('chorus ') ||
        lower.startsWith('verso') ||
        lower.startsWith('verse') ||
        lower.startsWith('pre-coro') ||
        lower.startsWith('pre coro') ||
        lower.startsWith('bridge') ||
        lower.startsWith('puente') ||
        lower.startsWith('outro') ||
        lower.startsWith('intro');
      if (isTag && !s.startsWith('[')) return `[${s.replaceAll(':', '').trim()}]`;
      if (s.startsWith('[') && s.endsWith(']')) return s;
      if (s.endsWith(':') && s.length < 20) return `[${s.slice(0, -1).trim()}]`;
      return line;
    });
    return mapped.join('\n').replaceAll(/\n{3,}/g, '\n\n').trim();
  };

  const handleGenerateLyrics = async (auto?: boolean) => {
    if (!process.env.GEMINI_API_KEY) {
      if (!auto) alert("La clave de Gemini no está configurada. Agrégala en Vercel (GEMINI_API_KEY).");
      return;
    }
    setIsGeneratingLyrics(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const contextTitle = (typeof title === 'string' && title.trim()) ? title.trim() : '';
      const contextStyle = (typeof instructions === 'string' && instructions.trim()) ? instructions.trim() : '';
      const prompt = [
        'Actúa como un compositor profesional.',
        'Escribe una letra en español.',
        'Requisitos:',
        '- Usa etiquetas de sección siempre entre corchetes, por ejemplo: [Verso 1], [Pre-Coro], [Coro], [Verso 2], [Puente], [Outro].',
        '- No escribas explicaciones, solo la letra.',
        contextTitle ? `Título (opcional): ${contextTitle}` : '',
        contextStyle ? `Instrucciones/estilo: ${contextStyle}` : '',
      ].filter(Boolean).join('\n');
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });
      const text = normalizeLyrics(response.text || '');
      if (text) setLyrics(text);
    } catch (e) {
      if (!auto) alert("Error al generar letra.");
    }
    setIsGeneratingLyrics(false);
  };

  useEffect(() => {
    if (!audioFile) return;
    if (instrumental) return;
    const hasLyrics = (lyrics || '').toString().trim().length > 0;
    if (hasLyrics) return;
    handleGenerateLyrics(true).catch(() => {});
  }, [audioFile, instrumental]);

  return (
    <>
      <div className="flex gap-4">
        <button
          type="button"
          onClick={() => {
            if (audioFile) {
              onOpenAudioModal?.();
              return;
            }
            audioInputRef?.current?.click?.();
          }}
          className="flex-1 flex items-center justify-center gap-2 py-3 bg-white/5 hover:bg-white/10 rounded-2xl text-sm font-semibold border border-white/5 text-slate-300 hover:text-white cursor-pointer relative transition-colors shadow-inner"
        >
          <Plus className="w-5 h-5 text-slate-400" /> 
          {audioFile ? 'Audio cargado' : 'Audio'}
        </button>
        <input 
          type="file" 
          accept="audio/*" 
          className="hidden" 
          ref={audioInputRef}
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              const f = e.target.files[0];
              setAudioFile(f);
              onPickAudio(f);
            }
          }}
        />
        <button
          onClick={onOpenPersonaPicker}
          className="flex-1 flex items-center justify-center gap-2 py-3 bg-white/5 hover:bg-white/10 rounded-2xl text-sm font-semibold border border-white/5 text-slate-300 hover:text-white transition-colors shadow-inner"
        >
          <Plus className="w-5 h-5 text-slate-400" /> Persona
        </button>
      </div>

      {selectedPersona?.persona_id && (
        <div className="glass-card rounded-2xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            {selectedPersona.photo_url ? (
              <div className="w-10 h-10 rounded-xl overflow-hidden bg-white/5 border border-white/10 shrink-0">
                <img src={selectedPersona.photo_url} alt="" className="w-full h-full object-cover" />
              </div>
            ) : (
              <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-200 shrink-0">
                <User className="w-5 h-5" />
              </div>
            )}
            <div className="min-w-0">
              <div className="text-white font-bold truncate">{selectedPersona.name || 'Persona'}</div>
              <div className="text-slate-500 text-xs">Usando voz</div>
            </div>
          </div>
          <button onClick={onClearPersona} className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-200">
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

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
          <button
            className="absolute top-0 right-0 text-slate-400 hover:text-white"
            onClick={() => setIsLyricsExpanded(true)}
            type="button"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
          
          <div className="flex justify-end mt-2">
            <button 
              onClick={() => handleGenerateLyrics(false).catch(() => {})}
              disabled={isGeneratingLyrics}
              className="bg-white/5 hover:bg-white/10 text-slate-200 border border-white/10 px-4 py-2 rounded-full text-sm font-semibold transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {isGeneratingLyrics && <RefreshCw className="w-4 h-4 animate-spin" />}
              Generar letra
            </button>
          </div>
        </div>
      </div>

      {isLyricsExpanded && (
        <div className="fixed inset-0 z-[140] bg-black/70 flex items-end md:items-center justify-center">
          <button className="absolute inset-0 w-full h-full" onClick={() => setIsLyricsExpanded(false)} aria-label="Cerrar" />
          <div className="relative w-full md:max-w-[720px] bg-[#0b0f16] border border-white/10 rounded-t-3xl md:rounded-3xl overflow-hidden">
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <div className="text-white font-extrabold">Letras</div>
              <button
                onClick={() => setIsLyricsExpanded(false)}
                className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4">
              <textarea
                value={lyrics}
                onChange={(e) => setLyrics(e.target.value)}
                placeholder="Agrega tu propia letra o ingresa un tema para generar"
                className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-[15px] text-white placeholder:text-slate-500 outline-none min-h-[55vh] resize-none"
              />
            </div>
          </div>
        </div>
      )}

      <div className="bg-[#111318] border border-white/5 rounded-2xl p-5 shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)] mt-4">
        <button
          type="button"
          onClick={() => setShowMoreOptions(!showMoreOptions)}
          className="w-full flex items-center justify-between"
        >
          <div className="text-white font-bold text-base">Más opciones</div>
          <ChevronDown className={cn("w-5 h-5 text-slate-400 transition-transform", showMoreOptions ? "rotate-180" : "rotate-0")} />
        </button>

        {showMoreOptions && (
          <div className="mt-4 space-y-4">
            <SliderRow
              label="Weirdness"
              value={weirdness}
              onChange={setWeirdness}
            />
            <SliderRow
              label="Influencia de estilo"
              value={styleInfluence}
              onChange={setStyleInfluence}
            />
            <SliderRow
              label="Influencia de audio"
              value={audioInfluence}
              onChange={setAudioInfluence}
            />
          </div>
        )}
      </div>

      {/* Instrucciones (Estilos) */}
      <div className="bg-[#111318] border border-white/5 rounded-2xl p-5 shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)] mt-4">
        <label className="font-bold text-white text-base mb-4 block">Instrucciones</label>
        <textarea
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
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

function SliderRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  const v = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-slate-300 text-sm font-semibold">{label}</div>
        <div className="text-slate-400 text-sm">{v}%</div>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={v}
        onChange={(e) => onChange(Math.max(0, Math.min(100, Number(e.target.value))))}
        className="w-full accent-emerald-500"
      />
    </div>
  );
}
