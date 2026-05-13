import { useState, useEffect } from 'react';
import { VoiceItem } from '@/types';
import { getAccessToken } from '@/lib/supabaseBrowser';
import { AudioLines, Check, Edit, Loader2, Play, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { VoiceEditor, VoiceEffects } from './VoiceEditor';

interface VoiceSelectorProps {
  onSelectVoice: (voiceId: string) => void;
  selectedVoiceId?: string;
  songId?: string;
  className?: string;
}

export function VoiceSelector({ onSelectVoice, selectedVoiceId, songId, className }: VoiceSelectorProps) {
  const [voices, setVoices] = useState<VoiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);
  const [editingVoiceId, setEditingVoiceId] = useState<string | null>(null);
  const [editingVoiceUrl, setEditingVoiceUrl] = useState<string>('');

  useEffect(() => {
    loadVoices();
  }, []);

  const loadVoices = async () => {
    try {
      setLoading(true);
      setError('');
      
      const token = await getAccessToken();
      if (!token.ok) {
        setError('No se pudo iniciar sesión');
        return;
      }

      const response = await fetch('/api/voices/list', {
        headers: {
          'Authorization': `Bearer ${token.token}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        setError(errorData.error || 'Error al cargar las voces');
        return;
      }

      const data = await response.json().catch(() => ({}));
      const rawList = Array.isArray((data as any)?.voices) ? (data as any).voices : [];

      const mapped = rawList
        .map((v: any) => {
          const id = String(v?.id || '').trim() || String(v?.voice_id || '').trim() || String(v?.replicate_id || '').trim();
          if (!id) return null;
          const name =
            String(v?.voice_profile_name || '').trim() ||
            String(v?.voice_name || '').trim() ||
            String(v?.name || '').trim() ||
            'Voz';
          const description = String(v?.description || '').trim();
          const statusRaw = String(v?.status || '').trim().toLowerCase();
          const status: VoiceItem['status'] =
            statusRaw === 'ready' ? 'ready' : statusRaw === 'failed' ? 'failed' : 'training';
          const createdAt = String(v?.created_at || v?.createdAt || '').trim() || new Date().toISOString();
          const modelUrl = v?.model_url == null ? undefined : String(v?.model_url || '').trim() || undefined;
          const sampleUrl = v?.sample_url == null ? undefined : String(v?.sample_url || '').trim() || undefined;
          const profileImageUrl = v?.profile_image_url == null ? undefined : String(v?.profile_image_url || '').trim() || undefined;
          const userId = String(v?.user_id || v?.userId || '').trim();
          const voiceProfileName = String(v?.voice_profile_name || '').trim() || undefined;
          return {
            id,
            name,
            description: description || undefined,
            modelUrl,
            sampleUrl,
            createdAt,
            status,
            userId,
            profileImageUrl,
            voiceProfileName,
          } satisfies VoiceItem;
        })
        .filter(Boolean) as VoiceItem[];

      setVoices(mapped);
    } catch (err) {
      setError('Error de conexión');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handlePlaySample = async (voice: VoiceItem) => {
    if (!voice.sampleUrl) return;

    // Detener audio actual si está reproduciendo
    if (audioElement) {
      audioElement.pause();
      audioElement.currentTime = 0;
      setPlayingVoiceId(null);
    }

    // Crear nuevo elemento de audio
    const audio = new Audio(voice.sampleUrl);
    setAudioElement(audio);
    setPlayingVoiceId(voice.id);

    audio.addEventListener('ended', () => {
      setPlayingVoiceId(null);
    });

    audio.addEventListener('error', () => {
      setPlayingVoiceId(null);
      alert('Error al reproducir la muestra de voz');
    });

    try {
      await audio.play();
    } catch (err) {
      console.error('Error al reproducir audio:', err);
      setPlayingVoiceId(null);
    }
  };

  const handleStopPlayback = () => {
    if (audioElement) {
      audioElement.pause();
      audioElement.currentTime = 0;
      setPlayingVoiceId(null);
    }
  };

  const handleSelectVoice = (voiceId: string) => {
    onSelectVoice(voiceId);
  };

  const handleEditVoice = (voice: VoiceItem) => {
    setEditingVoiceId(voice.id);
    setEditingVoiceUrl(voice.sampleUrl || '');
  };

  const handleSaveVoiceEffects = async (voiceId: string, effects: VoiceEffects) => {
    try {
      const token = await getAccessToken();
      if (!token.ok) {
        alert('No se pudo iniciar sesión');
        return;
      }

      const response = await fetch('/api/voices/apply-effects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token.token}`,
        },
        body: JSON.stringify({
          voiceId,
          effects,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        alert(errorData.error || 'Error al aplicar efectos');
        return;
      }

      alert('Efectos aplicados exitosamente!');
      setEditingVoiceId(null);
      loadVoices(); // Recargar la lista de voces
    } catch (err) {
      alert('Error al aplicar efectos');
      console.error(err);
    }
  };

  const handleCreateCover = async (voiceId: string) => {
    if (!songId) {
      alert('Selecciona una canción primero');
      return;
    }

    try {
      const token = await getAccessToken();
      if (!token.ok) {
        alert('No se pudo iniciar sesión');
        return;
      }

      const response = await fetch('/api/suno/create-cover', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token.token}`,
        },
        body: JSON.stringify({
          songId,
          voiceId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        alert(errorData.error || 'Error al crear el cover');
        return;
      }

      const data = await response.json();
      alert(`Cover creado exitosamente! ID: ${data.coverId}`);
      
      // Recargar la biblioteca si es necesario
      window.location.reload();
    } catch (err) {
      alert('Error al crear el cover');
      console.error(err);
    }
  };

  return (
    <div className={cn("bg-[#0b0f16] border border-white/10 rounded-2xl p-4", className)}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-white font-extrabold text-lg">Seleccionar Voz</h3>
          <p className="text-slate-400 text-sm">Elige una voz clonada para aplicar a la canción</p>
        </div>
        
        <button
          onClick={loadVoices}
          disabled={loading}
          className="bg-white/5 hover:bg-white/10 border border-white/10 px-4 py-2 rounded-full text-sm font-semibold text-slate-200 transition-colors flex items-center gap-2"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Actualizar'}
        </button>
      </div>

      {error && (
        <div className="glass-card rounded-2xl p-4 border border-red-500/30 text-red-200 text-sm mb-4">
          {error}
        </div>
      )}

      {loading && voices.length === 0 ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
          <span className="ml-3 text-slate-400">Cargando voces...</span>
        </div>
      ) : voices.length === 0 ? (
        <div className="glass-card rounded-2xl p-6 text-center border border-white/10">
          <AudioLines className="w-12 h-12 text-slate-500 mx-auto mb-3" />
          <div className="text-white font-bold mb-2">No tienes voces clonadas</div>
          <div className="text-slate-400 text-sm mb-4">
            Ve a la sección "Clonar voz" para entrenar tu primera voz
          </div>
          <a
            href="#clonar-voz"
            className="inline-block bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-2 px-6 rounded-full transition-colors"
          >
            Crear primera voz
          </a>
        </div>
      ) : (
        <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
          {voices.map((voice) => (
            <div
              key={voice.id}
              className={cn(
                "glass-card rounded-2xl p-4 border transition-colors",
                selectedVoiceId === voice.id
                  ? "border-emerald-500 bg-emerald-500/10"
                  : "border-white/10 hover:bg-white/5"
              )}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 overflow-hidden flex items-center justify-center shrink-0">
                    {voice.profileImageUrl ? (
                      <img src={voice.profileImageUrl} alt={voice.voiceProfileName || voice.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-200 font-extrabold">
                        {(voice.voiceProfileName || voice.name || 'V').toString().trim().slice(0, 1).toUpperCase()}
                      </div>
                    )}
                  </div>
                  
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="text-white font-bold truncate">{voice.voiceProfileName || voice.name}</div>
                      {voice.status === 'training' && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300">
                          Entrenando
                        </span>
                      )}
                      {voice.status === 'ready' && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300">
                          Lista
                        </span>
                      )}
                      {voice.status === 'failed' && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-300">
                          Falló
                        </span>
                      )}
                    </div>
                    
                    {voice.description && (
                      <div className="text-slate-400 text-sm truncate mt-1">{voice.description}</div>
                    )}
                    
                    <div className="text-slate-500 text-xs mt-1">
                      Creada: {(() => {
                        try {
                          const d = new Date(voice.createdAt);
                          return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('es-MX');
                        } catch {
                          return '';
                        }
                      })()}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {voice.sampleUrl && (
                    <button
                      onClick={() => handlePlaySample(voice)}
                      disabled={playingVoiceId === voice.id}
                      className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-200 hover:bg-white/10 transition-colors disabled:opacity-50"
                      title="Escuchar muestra"
                    >
                      {playingVoiceId === voice.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Play className="w-4 h-4" />
                      )}
                    </button>
                  )}

                  <button
                    onClick={() => handleEditVoice(voice)}
                    className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-200 hover:bg-white/10 transition-colors"
                    title="Editar efectos de voz"
                  >
                    <Edit className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => handleSelectVoice(voice.id)}
                    className={cn(
                      "w-9 h-9 rounded-full flex items-center justify-center transition-colors",
                      selectedVoiceId === voice.id
                        ? "bg-emerald-500 text-white"
                        : "bg-white/5 border border-white/10 text-slate-200 hover:bg-white/10"
                    )}
                    title={selectedVoiceId === voice.id ? "Seleccionada" : "Seleccionar"}
                  >
                    {selectedVoiceId === voice.id ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      <div className="w-2 h-2 rounded-full bg-current" />
                    )}
                  </button>

                  {songId && voice.status === 'ready' && (
                    <button
                      onClick={() => handleCreateCover(voice.id)}
                      className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-1.5 px-4 rounded-full text-sm transition-colors"
                    >
                      Aplicar
                    </button>
                  )}
                </div>
              </div>

              {playingVoiceId === voice.id && (
                <div className="mt-3 flex items-center justify-between">
                  <div className="text-slate-400 text-sm">Reproduciendo muestra...</div>
                  <button
                    onClick={handleStopPlayback}
                    className="text-slate-400 hover:text-white transition-colors flex items-center gap-1 text-sm"
                  >
                    <X className="w-4 h-4" /> Detener
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {playingVoiceId && (
        <div className="mt-4 text-center text-slate-500 text-xs">
          Haz clic en el ícono de play para escuchar una muestra de cada voz
        </div>
      )}

      {editingVoiceId && editingVoiceUrl && (
        <div className="mt-6">
          <VoiceEditor
            audioUrl={editingVoiceUrl}
            onSave={(effects) => handleSaveVoiceEffects(editingVoiceId, effects)}
          />
        </div>
      )}
    </div>
  );
}
