import React, { useEffect, useRef, useState } from 'react';
import { Upload, Mic, Play, Pause, Trash2, Loader2, CheckCircle, XCircle } from 'lucide-react';
import { getAccessToken, supabaseBrowser } from '@/lib/supabaseBrowser';
import { cn } from '@/lib/utils';

interface VoiceItem {
  id: string;
  voice_id: string;
  voice_name: string;
  description: string;
  status: 'processing' | 'ready' | 'failed';
  created_at: string;
  cost: number;
}

export function CloneVoiceView() {
  const [isLoading, setIsLoading] = useState(false);
  const [voices, setVoices] = useState<VoiceItem[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [voiceName, setVoiceName] = useState('');
  const [description, setDescription] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadVoices = async () => {
    const t = await getAccessToken();
    if (!t.ok) return;
    try {
      const r = await fetch('/api/kits/voices', {
        headers: { authorization: `Bearer ${t.token}` },
      });
      const out = await r.json();
      if (r.ok && Array.isArray(out?.voices)) {
        setVoices(out.voices);
      }
    } catch (e) {
      console.error('Error loading voices:', e);
    }
  };

  const checkVoiceStatus = async (voiceId: string) => {
    const t = await getAccessToken();
    if (!t.ok) return null;
    try {
      // Para Replicate API, necesitamos verificar el estado de la predicción
      // Primero obtenemos la información de la voz desde nuestra base de datos
      const r = await fetch('/api/kits/voices', {
        headers: { authorization: `Bearer ${t.token}` },
      });
      if (r.ok) {
        const data = await r.json();
        const voice = data.voices?.find((v: any) => v.id === voiceId || v.replicate_id === voiceId);
        if (voice?.replicate_id) {
          // Si tenemos un replicate_id, podemos verificar el estado directamente con Replicate
          const replicateToken = process.env.REPLICATE_API_TOKEN;
          if (replicateToken) {
            const replicateResponse = await fetch(`https://api.replicate.com/v1/predictions/${voice.replicate_id}`, {
              headers: {
                'Authorization': `Token ${replicateToken}`,
              },
            });
            if (replicateResponse.ok) {
              const replicateData = await replicateResponse.json();
              return {
                status: replicateData.status,
                output: replicateData.output,
                error: replicateData.error,
                created_at: replicateData.created_at,
                started_at: replicateData.started_at,
                completed_at: replicateData.completed_at
              };
            }
          }
        }
        return voice;
      }
    } catch (e) {
      console.error('Error checking voice status:', e);
    }
    return null;
  };

  useEffect(() => {
    loadVoices();
  }, []);

  useEffect(() => {
    const interval = setInterval(async () => {
      const processingVoices = voices.filter(v => v.status === 'processing');
      if (processingVoices.length === 0) return;

      const t = await getAccessToken();
      if (!t.ok) return;

      for (const voice of processingVoices) {
        try {
          const statusData = await checkVoiceStatus(voice.id);
          if (statusData) {
            // Mapear estados de Replicate a nuestros estados
            let newStatus = voice.status;
            if (statusData.status === 'starting' || statusData.status === 'processing') {
              newStatus = 'processing';
            } else if (statusData.status === 'succeeded' || statusData.status === 'completed') {
              newStatus = 'ready';
            } else if (statusData.status === 'failed' || statusData.status === 'canceled') {
              newStatus = 'failed';
            }
            
            if (newStatus !== voice.status) {
              setVoices(prev => prev.map(v => 
                v.id === voice.id ? { ...v, status: newStatus } : v
              ));
            }
          }
        } catch (e) {
          console.error('Error updating voice status:', e);
        }
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [voices]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    if (!file) return;

    const allowedTypes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav'];
    if (!allowedTypes.includes(file.type)) {
      setError('Solo se permiten archivos MP3 o WAV.');
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      setError('El archivo es muy pesado. Máximo 50 MB.');
      return;
    }

    setSelectedFile(file);
    setError('');
    if (!voiceName.trim()) {
      setVoiceName(file.name.replace(/\.[^/.]+$/, '').slice(0, 50));
    }
  };

  const uploadAudioToR2 = async (file: File): Promise<{ url: string; path: string }> => {
    const t = await getAccessToken();
    if (!t.ok) throw new Error('No autorizado');

    const arrayBuffer = await file.arrayBuffer();
    const fileArray = Array.from(new Uint8Array(arrayBuffer));
    const userId = (await supabaseBrowser.auth.getUser()).data.user?.id || 'unknown';
    const path = `personas/${userId}/clone_${Date.now()}.mp3`;

    const response = await fetch('/api/account/upload-profile-image', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'authorization': `Bearer ${t.token}`,
      },
      body: JSON.stringify({
        path,
        data: fileArray,
        contentType: file.type,
      }),
    });

    if (!response.ok) {
      const out = await response.json().catch(() => ({}));
      throw new Error(out?.error || 'Error subiendo audio');
    }

    const result = await response.json();
    return { url: result.url, path };
  };

  const cloneVoice = async () => {
    if (!selectedFile) {
      setError('Selecciona un archivo de audio primero.');
      return;
    }

    if (!voiceName.trim()) {
      setError('Escribe un nombre para tu voz.');
      return;
    }

    setIsLoading(true);
    setError('');
    setSuccess('');
    setUploadProgress(0);

    try {
      setIsUploading(true);
      setUploadProgress(30);
      const { url, path } = await uploadAudioToR2(selectedFile);
      setUploadProgress(70);

      const t = await getAccessToken();
      if (!t.ok) throw new Error('No autorizado');

      const response = await fetch('/api/suno/clone-voice', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'authorization': `Bearer ${t.token}`,
        },
        body: JSON.stringify({
          uploadUrl: url,
          uploadPath: path,
          voiceName: voiceName.trim(),
          description: description.trim() || 'Voz clonada desde RAMBER Tunes',
        }),
      });

      const out = await response.json();
      if (!response.ok) {
        let errorMessage = out?.error || 'Error clonando voz';
        let errorDetail = out?.detail || '';
        
        // Mensajes más específicos según el tipo de error
        if (out?.status === 401 || out?.status === 403) {
          errorMessage = 'Error de autenticación';
          errorDetail = 'La API key del servicio de voz no es válida. Contacta al administrador.';
        } else if (out?.status === 422) {
          errorMessage = 'Archivo de audio inválido';
          errorDetail = 'El archivo de audio no cumple con los requisitos. Asegúrate de que sea un archivo MP3 o WAV válido.';
        } else if (out?.status === 429) {
          errorMessage = 'Demasiadas solicitudes';
          errorDetail = 'Has realizado demasiadas solicitudes. Espera unos minutos e intenta de nuevo.';
        } else if (out?.status === 500) {
          errorMessage = 'Error de configuración';
          errorDetail = 'El servicio de voz no está configurado correctamente. Contacta al administrador.';
        }
        
        throw new Error(`${errorMessage}${errorDetail ? ': ' + errorDetail : ''}`);
      }

      setSuccess(`¡Voz "${voiceName}" creada! Se está procesando (puede tardar unos minutos).`);
      setSelectedFile(null);
      setVoiceName('');
      setDescription('');
      setUploadProgress(100);

      setTimeout(() => loadVoices(), 2000);
    } catch (e: any) {
      setError(e.message || 'Error inesperado al clonar la voz');
    } finally {
      setIsLoading(false);
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const deleteVoice = async (voiceId: string) => {
    if (!confirm('¿Eliminar esta voz clonada? No se puede deshacer.')) return;

    const t = await getAccessToken();
    if (!t.ok) return;

    try {
      const r = await fetch('/api/kits/voices', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'authorization': `Bearer ${t.token}`,
        },
        body: JSON.stringify({ voiceId }),
      });

      if (r.ok) {
        setVoices(prev => prev.filter(v => v.id !== voiceId));
        setSuccess('Voz eliminada.');
      } else {
        const out = await r.json();
        setError(out?.error || 'Error eliminando voz');
      }
    } catch (e) {
      setError('Error eliminando voz');
    }
  };

  const playVoice = async (voice: VoiceItem) => {
    if (playingVoiceId === voice.voice_id) {
      if (audioRef.current) {
        audioRef.current.pause();
        setPlayingVoiceId(null);
      }
      return;
    }

    // Para Replicate, necesitamos obtener la URL del modelo entrenado
    // Primero verificamos el estado para ver si hay un output
    const statusData = await checkVoiceStatus(voice.id);
    if (statusData?.output?.model_url) {
      setPlayingVoiceId(voice.voice_id);
      setAudioUrl(statusData.output.model_url);
    } else {
      setError('La voz aún no está lista para reproducir. Está en proceso de entrenamiento.');
    }
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case 'ready': return <CheckCircle className="w-4 h-4 text-emerald-400" />;
      case 'failed': return <XCircle className="w-4 h-4 text-red-400" />;
      default: return <Loader2 className="w-4 h-4 text-yellow-400 animate-spin" />;
    }
  };

  const statusText = (status: string) => {
    switch (status) {
      case 'ready': return 'Lista';
      case 'failed': return 'Falló';
      default: return 'Procesando…';
    }
  };

  return (
    <div className="flex-1 flex flex-col p-4 md:p-6 overflow-y-auto">
      <div className="max-w-[720px] mx-auto w-full space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-white">Clonar Voz</h1>
          <p className="text-sm text-slate-300 mt-1">
            Sube un audio de tu voz (mínimo 10 segundos, máximo 50 MB) para crear un clon que podrás usar en tus canciones.
          </p>
        </div>

        {/* Upload Section */}
        <div className="glass-card rounded-3xl border border-white/10 p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-100">
              <Upload className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <div className="text-white font-extrabold">Subir Audio</div>
              <div className="text-xs text-slate-300">MP3 o WAV, máximo 50 MB</div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex-1 py-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 font-semibold flex items-center justify-center gap-2 transition-colors"
                disabled={isLoading}
              >
                <Upload className="w-4 h-4" /> Seleccionar archivo
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".mp3,.wav,audio/mpeg,audio/wav"
                className="hidden"
                onChange={handleFileSelect}
              />
            </div>

            {selectedFile && (
              <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <div className="text-white font-semibold truncate">{selectedFile.name}</div>
                    <div className="text-xs text-slate-400 mt-1">
                      {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedFile(null)}
                    className="shrink-0 w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-slate-300"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {isUploading && (
              <div className="mt-4">
                <div className="flex items-center justify-between text-xs text-slate-300 mb-1">
                  <span>Subiendo audio…</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full bg-emerald-400 transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-semibold text-slate-300 mb-2">
                  Nombre de la voz
                </label>
                <input
                  type="text"
                  value={voiceName}
                  onChange={(e) => setVoiceName(e.target.value.slice(0, 50))}
                  placeholder="Ej: Mi Voz, Cantante Favorito"
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-white placeholder-slate-500 outline-none focus:border-emerald-500/50 transition-colors"
                  maxLength={50}
                />
                <div className="text-xs text-slate-500 mt-1 text-right">
                  {voiceName.length}/50
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-300 mb-2">
                  Descripción (opcional)
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value.slice(0, 200))}
                  placeholder="Ej: Voz clonada de mis grabaciones personales"
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-white placeholder-slate-500 outline-none focus:border-emerald-500/50 transition-colors resize-none"
                  rows={2}
                  maxLength={200}
                />
                <div className="text-xs text-slate-500 mt-1 text-right">
                  {description.length}/200
                </div>
              </div>
            </div>

            <button
              onClick={cloneVoice}
              disabled={isLoading || !selectedFile}
              className={cn(
                "w-full py-3.5 rounded-full font-extrabold text-sm flex items-center justify-center gap-2 transition-colors",
                isLoading || !selectedFile
                  ? "bg-white/10 text-slate-400 cursor-not-allowed"
                  : "bg-emerald-500 hover:bg-emerald-400 text-black"
              )}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Procesando…
                </>
              ) : (
                <>
                  <Mic className="w-4 h-4" /> Clonar Voz (15 créditos)
                </>
              )}
            </button>

            {error && (
              <div className="mt-3 p-3 bg-red-500/10 border border-red-500/30 rounded-2xl text-red-300 text-sm">
                {error}
              </div>
            )}

            {success && (
              <div className="mt-3 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl text-emerald-300 text-sm">
                {success}
              </div>
            )}
          </div>
        </div>

        {/* Voices List */}
        <div className="glass-card rounded-3xl border border-white/10 p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-100">
              <Mic className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <div className="text-white font-extrabold">Mis Voces Clonadas</div>
              <div className="text-xs text-slate-300">
                {voices.length} {voices.length === 1 ? 'voz' : 'voces'}
              </div>
            </div>
          </div>

          {voices.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-slate-400 text-sm">
                Aún no tienes voces clonadas. Sube un audio para crear la primera.
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {voices.map((voice) => (
                <div
                  key={voice.id}
                  className="bg-white/5 border border-white/10 rounded-2xl p-4"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {statusIcon(voice.status)}
                      <div className="text-white font-semibold truncate">
                        {voice.voice_name}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => playVoice(voice)}
                        className={cn(
                          "w-8 h-8 rounded-full flex items-center justify-center transition-colors",
                          playingVoiceId === voice.voice_id
                            ? "bg-emerald-500/20 border border-emerald-500/30 text-emerald-300"
                            : "bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300"
                        )}
                      >
                        {playingVoiceId === voice.voice_id ? (
                          <Pause className="w-3.5 h-3.5" />
                        ) : (
                          <Play className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <button
                        onClick={() => deleteVoice(voice.id)}
                        className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-slate-300"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="text-xs text-slate-400 mb-2">
                    {voice.description}
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <div className="flex items-center gap-4">
                      <span>{statusText(voice.status)}</span>
                      <span>{formatDate(voice.created_at)}</span>
                    </div>
                    <span>{voice.cost} créditos</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Hidden Audio Element */}
      <audio
        ref={audioRef}
        src={audioUrl || undefined}
        onEnded={() => setPlayingVoiceId(null)}
        onError={() => {
          setPlayingVoiceId(null);
          setError('No se pudo reproducir la voz.');
        }}
      />
    </div>
  );
}