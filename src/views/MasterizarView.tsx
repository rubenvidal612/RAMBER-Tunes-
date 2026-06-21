import React, { useEffect, useMemo, useState } from 'react';
import { Upload, Volume2, Download, CheckCircle, XCircle, Loader2, AlertCircle, CreditCard, Zap, Shield, Headphones } from 'lucide-react';
import { getAccessToken, signInWithGoogle, supabaseBrowser } from '../lib/supabaseBrowser';

interface SubscriptionInfo {
  active: boolean;
  expires_at: string | null;
}

type SessionUser = {
  id: string;
  email?: string;
};

const OWNER_EMAILS = ['rubenfiverr612@gmail.com', 'rubenvidal612@gmail.com'];

function cardClass(extra?: string) {
  return `rounded-3xl border border-white/10 bg-[#111827]/85 shadow-[0_20px_60px_rgba(0,0,0,0.35)] ${extra || ''}`.trim();
}

function buttonClass(kind: 'primary' | 'secondary' | 'success' | 'ghost' = 'primary', block = false) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-60';
  const width = block ? ' w-full' : '';
  if (kind === 'secondary') return `${base}${width} bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:from-purple-700 hover:to-pink-700`;
  if (kind === 'success') return `${base}${width} bg-gradient-to-r from-green-600 to-emerald-600 text-white hover:from-green-700 hover:to-emerald-700`;
  if (kind === 'ghost') return `${base}${width} border border-white/15 bg-white/5 text-white hover:bg-white/10`;
  return `${base}${width} bg-gradient-to-r from-blue-600 to-cyan-600 text-white hover:from-blue-700 hover:to-cyan-700`;
}

export function MasterizarView() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [originalPreviewUrl, setOriginalPreviewUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [processingError, setProcessingError] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [isLoadingSubscription, setIsLoadingSubscription] = useState(false);
  const isLoggedIn = !!user?.id;
  const isOwner = OWNER_EMAILS.includes((user?.email || '').trim().toLowerCase());
  const publicShareUrl = useMemo(() => {
    if (typeof window === 'undefined') return 'https://ramber-tunes.vercel.app/masterizar';
    return `${window.location.origin.replace(/\/+$/, '')}/masterizar`;
  }, []);
  const directDownloadUrl = useMemo(() => {
    if (!subscription?.active && !isOwner) return null;
    return downloadUrl || previewUrl || null;
  }, [downloadUrl, isOwner, previewUrl, subscription?.active]);

  useEffect(() => {
    if (!supabaseBrowser) return;
    let alive = true;

    const syncUser = async () => {
      const { data } = await supabaseBrowser.auth.getUser();
      if (!alive) return;
      const nextUser = data?.user ? { id: data.user.id, email: data.user.email || undefined } : null;
      setUser(nextUser);
      if (nextUser?.id) {
        loadSubscription(nextUser.id, nextUser.email).catch(() => {});
      } else {
        setSubscription(null);
      }
    };

    syncUser().catch(() => {});
    const { data: authSub } = supabaseBrowser.auth.onAuthStateChange(() => {
      syncUser().catch(() => {});
    });

    return () => {
      alive = false;
      try {
        authSub?.subscription?.unsubscribe?.();
      } catch {
      }
    };
  }, []);

  useEffect(() => {
    if (!file) {
      setOriginalPreviewUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setOriginalPreviewUrl(objectUrl);
    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [file]);

  const getOptionalToken = async () => {
    if (!supabaseBrowser) return '';
    const { data } = await supabaseBrowser.auth.getSession();
    return data?.session?.access_token || '';
  };

  const apiHeaders = async (json = true) => {
    const token = await getOptionalToken();
    return {
      ...(json ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    };
  };

  const loadSubscription = async (userId: string, userEmail?: string) => {
    if (!supabaseBrowser) return;
    const owner = OWNER_EMAILS.includes((userEmail || user?.email || '').trim().toLowerCase());
    if (owner) {
      setSubscription({
        active: true,
        expires_at: null,
      });
      return;
    }
    setIsLoadingSubscription(true);
    try {
      const { data, error } = await supabaseBrowser
        .from('profiles')
        .select('mastering_subscription_active, mastering_subscription_expires_at')
        .eq('id', userId)
        .single();

      if (error) {
        console.error('Error loading subscription:', error);
        return;
      }

      const isActive = !!data?.mastering_subscription_active;
      const expiresAt = data?.mastering_subscription_expires_at || null;
      let active = isActive;

      if (expiresAt && new Date(expiresAt) < new Date()) {
        active = false;
        await supabaseBrowser
          .from('profiles')
          .update({ mastering_subscription_active: false })
          .eq('id', userId);
      }

      setSubscription({
        active,
        expires_at: expiresAt,
      });
    } catch (error) {
      console.error('Error loading subscription:', error);
    } finally {
      setIsLoadingSubscription(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    // Validar que sea MP3
    if (!selectedFile.type.includes('audio/mpeg') && !selectedFile.name.toLowerCase().endsWith('.mp3')) {
      setProcessingError('Por favor sube un archivo MP3. Si no tienes MP3, puedes convertir tu audio en: https://online-audio-converter.com/sp/');
      return;
    }

    setFile(selectedFile);
    setProcessingError(null);
    setDownloadUrl(null);
    setPreviewUrl(null);
  };

  const handleUpload = async () => {
    if (!file) return;

    setIsUploading(true);
    setProcessingError(null);
    setPreviewUrl(null);
    setDownloadUrl(null);

    try {
      const response = await fetch('/api/masterizar-unlimited', {
        method: 'POST',
        headers: await apiHeaders(true),
        body: JSON.stringify({
          action: 'upload',
          fileName: file.name,
          fileType: file.type || 'audio/mpeg',
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Error al procesar el archivo');
      }

      const uploadUrl = String(result?.uploadUrl || '').trim();
      const filePath = String(result?.filePath || '').trim();
      if (!uploadUrl || !filePath) {
        throw new Error('No recibí la URL para subir el archivo.');
      }

      const uploadToR2 = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'audio/mpeg' },
        body: file,
      });
      if (!uploadToR2.ok) {
        throw new Error('No pude subir tu MP3 para masterizarlo.');
      }

      const processResponse = await fetch('/api/masterizar-unlimited', {
        method: 'POST',
        headers: await apiHeaders(true),
        body: JSON.stringify({
          action: 'process',
          filePath,
          isPreview: true,
        }),
      });
      const processResult = await processResponse.json().catch(() => ({}));
      if (!processResponse.ok) {
        throw new Error(processResult?.message || processResult?.error || 'No pude masterizar tu archivo.');
      }
      if (processResult?.previewUrl) setPreviewUrl(processResult.previewUrl);
      if (processResult?.downloadUrl) setDownloadUrl(processResult.downloadUrl);
      setSubscription((prev) => ({
        active: isOwner || !!processResult?.subscriptionActive || !!prev?.active,
        expires_at: processResult?.expiresAt || prev?.expires_at || null,
      }));
      if (!processResult?.downloadUrl && !isOwner) {
        setProcessingError('Preview listo. Para descargar el MP3 completo necesitas iniciar sesión y tener la suscripción activa.');
      }
    } catch (error: any) {
      setProcessingError(error?.message || 'Error al procesar el archivo');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDownload = async () => {
    if (!directDownloadUrl) return;
    if (!isLoggedIn) {
      setProcessingError('Para descargar necesitas iniciar sesión primero.');
      return;
    }
    if (!subscription?.active && !isOwner) {
      setProcessingError('Necesitas una suscripción activa para descargar. Suscríbete por $150 MXN/mes.');
      return;
    }

    const link = document.createElement('a');
    link.href = directDownloadUrl;
    link.download = `masterizado_${Date.now()}.mp3`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSubscribe = async () => {
    if (!isLoggedIn) {
      const login = await signInWithGoogle();
      if (!login.ok) setProcessingError(login.error || 'No pude iniciar sesión.');
      return;
    }

    try {
      const t = await getAccessToken();
      if (!t.ok) {
        setProcessingError(t.error || 'Necesitas iniciar sesión.');
        return;
      }

      const response = await fetch('/api/mercadopago/create-preference', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${t.token}`,
        },
        body: JSON.stringify({
          packKey: 'masterizar',
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Error al crear la suscripción');
      }

      if (result.init_point) {
        window.location.href = result.init_point;
      }
    } catch (error: any) {
      setProcessingError(error.message || 'Error al crear la suscripción');
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('es-MX', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  return (
    <div className="h-full overflow-y-auto bg-gradient-to-b from-gray-900 to-black text-white p-4 pb-[140px] md:p-8 md:pb-8">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <div className="flex items-center justify-center gap-3 mb-6">
            <Volume2 className="w-12 h-12 text-purple-500" />
            <h1 className="text-4xl md:text-5xl font-bold">Masterizar Ilimitado</h1>
          </div>
          <p className="text-xl text-gray-300 mb-4">
            Masteriza todas tus canciones por solo <span className="text-green-400 font-bold">$150 MXN/mes</span>
          </p>
          <p className="text-gray-400 max-w-2xl mx-auto">
            Sube cualquier canción en MP3 y obtén un preview gratis. Con suscripción, descargas ilimitadas.
          </p>
        </div>

        {isLoggedIn && (
          <div className={cardClass('mb-8 border-purple-500/40')}>
            <div className="p-6">
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                <Shield className="w-5 h-5" />
                Estado de tu suscripción
              </h2>
              
              {isLoadingSubscription ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Cargando...</span>
                </div>
              ) : subscription ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    {subscription.active ? (
                      <>
                        <CheckCircle className="w-5 h-5 text-green-500" />
                        <span className="text-green-400 font-semibold">
                          {isOwner ? 'Acceso ilimitado de propietario' : 'Suscripción activa'}
                        </span>
                      </>
                    ) : (
                      <>
                        <XCircle className="w-5 h-5 text-red-500" />
                        <span className="text-red-400">Sin suscripción activa</span>
                      </>
                    )}
                  </div>
                  
                  {subscription.expires_at && subscription.active && (
                    <div className="text-gray-300">
                      Válida hasta: {formatDate(subscription.expires_at)}
                    </div>
                  )}

                  {isOwner && (
                    <div className="text-gray-300">
                      Tu cuenta de propietario tiene masterización ilimitada.
                    </div>
                  )}
                  
                  {!subscription.active && !isOwner && (
                    <button onClick={handleSubscribe} className={`${buttonClass('secondary')} mt-4`}>
                      <CreditCard className="w-4 h-4 mr-2" />
                      Suscribirse por $150 MXN/mes
                    </button>
                  )}
                </div>
              ) : (
                <div className="text-gray-400">No se pudo cargar la información de suscripción</div>
              )}
            </div>
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-8 mb-12">
          <div className={cardClass()}>
            <div className="p-6">
              <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
                <Upload className="w-6 h-6 text-blue-400" />
                Sube tu canción
              </h2>
              
              <div className="border-2 border-dashed border-gray-600 rounded-lg p-8 text-center hover:border-purple-500 transition-colors">
                <Upload className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                <p className="mb-4">Arrastra tu archivo MP3 aquí o haz clic para seleccionar</p>
                
                <input
                  type="file"
                  accept=".mp3,audio/mpeg"
                  onChange={handleFileChange}
                  className="hidden"
                  id="file-upload"
                />
                
                <label htmlFor="file-upload">
                  <span className={buttonClass('ghost')}>
                    Seleccionar archivo
                  </span>
                </label>
                
                {file && (
                  <div className="mt-4 p-3 bg-gray-700 rounded">
                    <div className="flex items-center justify-between">
                      <span className="truncate">{file.name}</span>
                      <span className="text-sm text-gray-400">
                        {(file.size / (1024 * 1024)).toFixed(2)} MB
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <button onClick={handleUpload} disabled={!file || isUploading} className={`${buttonClass('primary', true)} mt-6`}>
                {isUploading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Procesando...
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4 mr-2" />
                    Masterizar Gratis (Preview)
                  </>
                )}
              </button>

              {processingError && (
                <div className="mt-4 p-3 bg-red-900/30 border border-red-700 rounded flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
                  <span className="text-red-300">{processingError}</span>
                </div>
              )}
            </div>
          </div>

          <div className={cardClass()}>
            <div className="p-6">
              <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
                <Headphones className="w-6 h-6 text-green-400" />
                Resultado Masterizado
              </h2>

              {previewUrl ? (
                <div className="space-y-6">
                  <div className="bg-gray-900 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-4">
                      <span className="font-semibold">Compara los 2 audios</span>
                      <span className="text-xs text-gray-400">Dale play a cada uno para escuchar la diferencia</span>
                    </div>

                    <div className="space-y-4">
                      <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <span className="font-semibold text-white">Audio original</span>
                          <span className="text-xs text-slate-400">Tu archivo tal como lo subiste</span>
                        </div>
                        {originalPreviewUrl ? (
                          <audio controls preload="metadata" src={originalPreviewUrl} className="w-full" />
                        ) : (
                          <div className="text-sm text-slate-400">Selecciona un MP3 para escucharlo aqui.</div>
                        )}
                      </div>

                      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <span className="font-semibold text-white">Audio masterizado</span>
                          <span className="text-xs text-emerald-300">Resultado listo para comparar</span>
                        </div>
                        <audio controls preload="metadata" src={previewUrl} className="w-full" />
                      </div>
                    </div>

                    <div className="text-sm text-gray-400 mt-4">
                      Puedes reproducir el original y el masterizado para compararlos antes de descargar.
                    </div>
                  </div>

                  <div className="bg-gray-900 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-4">
                      <span className="font-semibold">Descargar Archivo</span>
                      {subscription?.active ? (
                        <CheckCircle className="w-5 h-5 text-green-500" />
                      ) : (
                        <XCircle className="w-5 h-5 text-red-500" />
                      )}
                    </div>
                    
                    <div className="space-y-4">
                      <div className="text-sm text-gray-300">
                        {subscription?.active ? (
                          <span className="text-green-400">
                            ¡Suscripción activa! Puedes descargar ilimitadamente.
                          </span>
                        ) : (
                          <span className="text-red-400">
                            Se requiere suscripción activa para descargar
                          </span>
                        )}
                      </div>
                      
                      <button
                        onClick={handleDownload}
                        disabled={!directDownloadUrl || !subscription?.active}
                        className={buttonClass('success', true)}
                      >
                        <Download className="w-4 h-4 mr-2" />
                        Descargar MP3 Masterizado Aqui
                      </button>
                      
                      {!subscription?.active && isLoggedIn && (
                        <button onClick={handleSubscribe} className={buttonClass('secondary', true)}>
                          <CreditCard className="w-4 h-4 mr-2" />
                          Suscribirse para Descargar ($150 MXN/mes)
                        </button>
                      )}
                      
                      {!isLoggedIn && (
                        <div className="text-center">
                          <p className="text-gray-400 mb-2">Para descargar, necesitas:</p>
                          <button onClick={() => handleSubscribe()} className={buttonClass('primary', true)}>
                            Iniciar Sesión o Crear Cuenta
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12">
                  <Volume2 className="w-16 h-16 mx-auto mb-4 text-gray-600" />
                  <p className="text-gray-400">
                    Sube una canción para ver el resultado masterizado aquí
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-6 mb-12">
          <div className={cardClass()}>
            <div className="p-6">
              <div className="w-12 h-12 bg-blue-900/30 rounded-lg flex items-center justify-center mb-4">
                <span className="text-2xl font-bold text-blue-400">1</span>
              </div>
              <h3 className="text-xl font-bold mb-3">Sube tu MP3</h3>
              <p className="text-gray-400">
                Sube cualquier canción en formato MP3. No importa si la grabaste tú o es de otro artista.
              </p>
            </div>
          </div>
          
          <div className={cardClass()}>
            <div className="p-6">
              <div className="w-12 h-12 bg-purple-900/30 rounded-lg flex items-center justify-center mb-4">
                <span className="text-2xl font-bold text-purple-400">2</span>
              </div>
              <h3 className="text-xl font-bold mb-3">Escucha Preview Gratis</h3>
              <p className="text-gray-400">
                Obtén el resultado masterizado al instante y escúchalo gratis sin necesidad de suscripción.
              </p>
            </div>
          </div>
          
          <div className={cardClass()}>
            <div className="p-6">
              <div className="w-12 h-12 bg-green-900/30 rounded-lg flex items-center justify-center mb-4">
                <span className="text-2xl font-bold text-green-400">3</span>
              </div>
              <h3 className="text-xl font-bold mb-3">Descarga Ilimitado</h3>
              <p className="text-gray-400">
                Con suscripción de $150 MXN/mes, descarga todas las canciones masterizadas que quieras.
              </p>
            </div>
          </div>
        </div>

        <div className={cardClass('mb-12')}>
          <div className="p-6">
            <h2 className="text-2xl font-bold mb-6">Preguntas Frecuentes</h2>
            
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold mb-2">¿Qué es la masterización?</h3>
                <p className="text-gray-400">
                  La masterización es el proceso final de producción musical que optimiza el sonido para que suene bien en cualquier dispositivo (teléfono, auto, altavoces). Ajusta volumen, ecualización y compresión.
                </p>
              </div>
              
              <div>
                <h3 className="text-lg font-semibold mb-2">¿Necesito suscripción para usar el servicio?</h3>
                <p className="text-gray-400">
                  No. Puedes subir canciones y escuchar el preview gratis sin suscripción. Solo necesitas suscripción para descargar los archivos masterizados.
                </p>
              </div>
              
              <div>
                <h3 className="text-lg font-semibold mb-2">¿La suscripción consume mis créditos de LucIAna Music?</h3>
                <p className="text-gray-400">
                  No. La suscripción de Masterizar Ilimitado es completamente independiente. No consume tus créditos para crear canciones en LucIAna Music.
                </p>
              </div>
              
              <div>
                <h3 className="text-lg font-semibold mb-2">¿Puedo cancelar mi suscripción?</h3>
                <p className="text-gray-400">
                  Sí. Puedes cancelar en cualquier momento desde Mercado Pago. Tu suscripción seguirá activa hasta la fecha de expiración.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="text-center">
          <div className="inline-block bg-gradient-to-r from-purple-900/30 to-pink-900/30 rounded-2xl p-8">
            <h2 className="text-3xl font-bold mb-4">¡Comienza a Masterizar Hoy!</h2>
            <p className="text-xl text-gray-300 mb-6">
              Por solo <span className="text-green-400 font-bold">$150 MXN/mes</span>
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button onClick={() => document.getElementById('file-upload')?.click()} className={buttonClass('primary')}>
                <Upload className="w-5 h-5 mr-2" />
                Probar Gratis
              </button>
              
              {isLoggedIn && !subscription?.active && (
                <button onClick={handleSubscribe} className={buttonClass('secondary')}>
                  <CreditCard className="w-5 h-5 mr-2" />
                  Suscribirse Ahora
                </button>
              )}
              
              {!isLoggedIn && (
                <button onClick={() => handleSubscribe()} className={buttonClass('success')}>
                  Crear Cuenta Gratis
                </button>
              )}
            </div>
            
            <p className="text-gray-400 mt-6 text-sm">
              Comparte este link en WhatsApp y redes sociales: <br />
              <code className="bg-gray-900 px-3 py-1 rounded text-blue-300">
                {publicShareUrl}
              </code>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
