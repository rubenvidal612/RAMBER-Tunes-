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
          outputFormat: 'wav',
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const msg = [errorData?.error, errorData?.detail, errorData?.hint]
          .map((x: any) => (typeof x === 'string' ? x.trim() : ''))
          .filter(Boolean)
          .join('\n\n');
        alert(msg || 'Error al crear el cover');
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
          <div className="text-white font-bold mb-2">No tienes voces</div>
          <div className="text-slate-400 text-sm mb-4">
            Ve a Studio → Clonador para crear tu primer clon
          </div>
          <div className="inline-block bg-emerald-500/15 border border-emerald-500/25 text-emerald-200 font-bold py-2 px-6 rounded-full">
            Crear primer clon
          </div>
        </div>
      ) : (
        <div className="max-h-96 overflow-y-auto pr-2">
          <div className="grid grid-cols-3 gap-3">
            {voices.map((voice) => {
              const displayName = (voice.voiceProfileName || voice.name || 'Voz').toString().trim() || 'Voz';
              const isSelected = selectedVoiceId === voice.id;
              const isReady = voice.status === 'ready';
              const isPlaying = playingVoiceId === voice.id;
              return (
                <button
                  key={voice.id}
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!isReady) {
                      alert('Esta voz todavía se está entrenando. Intenta de nuevo cuando esté lista.');
                      return;
                    }
                    handleSelectVoice(voice.id);
                  }}
                  className={cn(
                    "relative aspect-square rounded-[26px] overflow-hidden border transition-colors text-left",
                    isSelected ? "border-emerald-500 bg-emerald-500/10" : "border-white/10 bg-white/5 hover:bg-white/10",
                    !isReady ? "opacity-80" : ""
                  )}
                  title={displayName}
                  aria-label={displayName}
                >
                  {voice.profileImageUrl ? (
                    <img src={voice.profileImageUrl} alt={displayName} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-200 font-extrabold text-3xl bg-white/5">
                      {displayName.slice(0, 1).toUpperCase()}
                    </div>
                  )}

                  <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/85 via-black/45 to-transparent">
                    <div className="text-white font-extrabold truncate text-sm leading-tight">{displayName}</div>
                  </div>



                  <div className="absolute right-2 top-2 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleEditVoice(voice);
                      }}
                      className="w-11 h-11 rounded-full bg-black/45 border border-white/10 text-white flex items-center justify-center hover:bg-black/60"
                      title="Editar"
                      aria-label="Editar"
                    >
                      <Edit className="w-5 h-5" />
                    </button>
                    {voice.sampleUrl ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (isPlaying) {
                            handleStopPlayback();
                            return;
                          }
                          handlePlaySample(voice);
                        }}
                        className="w-11 h-11 rounded-full bg-black/45 border border-white/10 text-white flex items-center justify-center hover:bg-black/60"
                        title={isPlaying ? "Detener" : "Escuchar"}
                        aria-label={isPlaying ? "Detener" : "Escuchar"}
                      >
                        {isPlaying ? <X className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
                      </button>
                    ) : null}
                    <div
                      className={cn(
                        "w-11 h-11 rounded-full border flex items-center justify-center",
                        isSelected ? "bg-emerald-500/35 border-emerald-500/40 text-emerald-200" : "bg-black/45 border-white/10 text-white"
                      )}
                      title={isSelected ? "Seleccionada" : "Seleccionar"}
                      aria-label={isSelected ? "Seleccionada" : "Seleccionar"}
                    >
                      {isSelected ? <Check className="w-5 h-5" /> : <div className="w-2.5 h-2.5 rounded-full bg-current" />}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {playingVoiceId ? (
            <div className="mt-4 flex items-center justify-between text-slate-400 text-sm">
              <div>Reproduciendo muestra…</div>
              <button
                onClick={handleStopPlayback}
                className="text-slate-300 hover:text-white transition-colors flex items-center gap-2"
              >
                <X className="w-5 h-5" /> Detener
              </button>
            </div>
          ) : null}
        </div>
      )}

      {playingVoiceId ? (
        <div className="mt-4 text-center text-slate-500 text-xs">
          Toca “Detener” para parar la muestra
        </div>
      ) : null}

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
