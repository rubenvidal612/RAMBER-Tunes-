import React, { useState, useEffect, useRef } from 'react';
import { Upload, Volume2, Download, CheckCircle, XCircle, Play, Pause, Loader2, AlertCircle, CreditCard, Users, Zap, Shield, Headphones } from 'lucide-react';
import { supabaseBrowser } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';

interface SubscriptionInfo {
  active: boolean;
  expires_at: string | null;
}

export function MasterizarView() {
  const { user, isLoggedIn } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [processingError, setProcessingError] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [isLoadingSubscription, setIsLoadingSubscription] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Cargar información de suscripción
  useEffect(() => {
    if (isLoggedIn && user) {
      loadSubscription(user.id);
    }
  }, [isLoggedIn, user]);

  const loadSubscription = async (userId: string) => {
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

      // Verificar si la suscripción está activa y no ha expirado
      const isActive = data.mastering_subscription_active || false;
      const expiresAt = data.mastering_subscription_expires_at;
      
      let active = isActive;
      if (expiresAt) {
        const expiryDate = new Date(expiresAt);
        const now = new Date();
        if (expiryDate < now) {
          active = false;
          // Opcional: actualizar el estado en la base de datos
          await supabaseBrowser
            .from('profiles')
            .update({ mastering_subscription_active: false })
            .eq('id', userId);
        }
      }

      setSubscription({
        active,
        expires_at: expiresAt
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

    try {
      // Subir archivo a R2
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/masterizar-unlimited', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Error al procesar el archivo');
      }

      // Obtener URLs para preview y descarga
      if (result.previewUrl) {
        setPreviewUrl(result.previewUrl);
      }
      
      if (result.downloadUrl) {
        setDownloadUrl(result.downloadUrl);
      }

      // Si hay error de suscripción pero el procesamiento fue exitoso
      if (result.error === 'subscription_required') {
        setProcessingError('¡Masterización completada! Puedes escuchar el preview gratis. Para descargar el archivo masterizado, necesitas una suscripción activa.');
      }

    } catch (error: any) {
      setProcessingError(error.message || 'Error al procesar el archivo');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDownload = async () => {
    if (!downloadUrl || !isLoggedIn) return;

    // Verificar suscripción activa
    if (!subscription?.active) {
      setProcessingError('Necesitas una suscripción activa para descargar. Suscríbete por $150 MXN/mes.');
      return;
    }

    // Descargar archivo
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = `masterizado_${Date.now()}.mp3`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSubscribe = async () => {
    if (!isLoggedIn) {
      setProcessingError('Por favor inicia sesión o crea una cuenta para suscribirte.');
      return;
    }

    try {
      // Crear preferencia de pago en Mercado Pago
      const response = await fetch('/api/mercadopago', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          pack: 'masterizar',
          userId: user?.id,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Error al crear la suscripción');
      }

      // Redirigir a Mercado Pago
      if (result.init_point) {
        window.location.href = result.init_point;
      }
    } catch (error: any) {
      setProcessingError(error.message || 'Error al crear la suscripción');
    }
  };

  const togglePlay = () => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
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
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black text-white p-4 md:p-8">
      {/* Hero Section */}
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

        {/* Subscription Status */}
        {isLoggedIn && (
          <Card className="mb-8 bg-gray-800 border-purple-500">
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
                        <span className="text-green-400 font-semibold">Suscripción activa</span>
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
                  
                  {!subscription.active && (
                    <Button
                      onClick={handleSubscribe}
                      className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 mt-4"
                    >
                      <CreditCard className="w-4 h-4 mr-2" />
                      Suscribirse por $150 MXN/mes
                    </Button>
                  )}
                </div>
              ) : (
                <div className="text-gray-400">No se pudo cargar la información de suscripción</div>
              )}
            </div>
          </Card>
        )}

        {/* Upload & Preview Section */}
        <div className="grid md:grid-cols-2 gap-8 mb-12">
          {/* Left: Upload */}
          <Card className="bg-gray-800">
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
                  <Button
                    variant="outline"
                    className="border-gray-600 hover:border-purple-500 hover:text-purple-400"
                  >
                    Seleccionar archivo
                  </Button>
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

              <Button
                onClick={handleUpload}
                disabled={!file || isUploading}
                className="w-full mt-6 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
              >
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
              </Button>

              {processingError && (
                <div className="mt-4 p-3 bg-red-900/30 border border-red-700 rounded flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
                  <span className="text-red-300">{processingError}</span>
                </div>
              )}
            </div>
          </Card>

          {/* Right: Preview & Download */}
          <Card className="bg-gray-800">
            <div className="p-6">
              <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
                <Headphones className="w-6 h-6 text-green-400" />
                Resultado Masterizado
              </h2>

              {previewUrl ? (
                <div className="space-y-6">
                  {/* Audio Player */}
                  <div className="bg-gray-900 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-4">
                      <span className="font-semibold">Preview Gratis</span>
                      <Button
                        onClick={togglePlay}
                        size="sm"
                        className="bg-purple-600 hover:bg-purple-700"
                      >
                        {isPlaying ? (
                          <>
                            <Pause className="w-4 h-4 mr-2" />
                            Pausar
                          </>
                        ) : (
                          <>
                            <Play className="w-4 h-4 mr-2" />
                            Escuchar
                          </>
                        )}
                      </Button>
                    </div>
                    
                    <audio
                      ref={audioRef}
                      src={previewUrl}
                      onEnded={() => setIsPlaying(false)}
                      className="w-full"
                    />
                    
                    <div className="text-sm text-gray-400 mt-2">
                      Puedes escuchar el resultado masterizado sin costo
                    </div>
                  </div>

                  {/* Download Section */}
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
                      
                      <Button
                        onClick={handleDownload}
                        disabled={!downloadUrl || !subscription?.active}
                        className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700"
                      >
                        <Download className="w-4 h-4 mr-2" />
                        Descargar MP3 Masterizado
                      </Button>
                      
                      {!subscription?.active && isLoggedIn && (
                        <Button
                          onClick={handleSubscribe}
                          className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
                        >
                          <CreditCard className="w-4 h-4 mr-2" />
                          Suscribirse para Descargar ($150 MXN/mes)
                        </Button>
                      )}
                      
                      {!isLoggedIn && (
                        <div className="text-center">
                          <p className="text-gray-400 mb-2">Para descargar, necesitas:</p>
                          <Button
                            onClick={() => window.location.href = '/login'}
                            className="w-full bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700"
                          >
                            Iniciar Sesión o Crear Cuenta
                          </Button>
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
          </Card>
        </div>

        {/* How It Works & Pricing */}
        <div className="grid md:grid-cols-3 gap-6 mb-12">
          <Card className="bg-gray-800">
            <div className="p-6">
              <div className="w-12 h-12 bg-blue-900/30 rounded-lg flex items-center justify-center mb-4">
                <span className="text-2xl font-bold text-blue-400">1</span>
              </div>
              <h3 className="text-xl font-bold mb-3">Sube tu MP3</h3>
              <p className="text-gray-400">
                Sube cualquier canción en formato MP3. No importa si la grabaste tú o es de otro artista.
              </p>
            </div>
          </Card>
          
          <Card className="bg-gray-800">
            <div className="p-6">
              <div className="w-12 h-12 bg-purple-900/30 rounded-lg flex items-center justify-center mb-4">
                <span className="text-2xl font-bold text-purple-400">2</span>
              </div>
              <h3 className="text-xl font-bold mb-3">Escucha Preview Gratis</h3>
              <p className="text-gray-400">
                Obtén el resultado masterizado al instante y escúchalo gratis sin necesidad de suscripción.
              </p>
            </div>
          </Card>
          
          <Card className="bg-gray-800">
            <div className="p-6">
              <div className="w-12 h-12 bg-green-900/30 rounded-lg flex items-center justify-center mb-4">
                <span className="text-2xl font-bold text-green-400">3</span>
              </div>
              <h3 className="text-xl font-bold mb-3">Descarga Ilimitado</h3>
              <p className="text-gray-400">
                Con suscripción de $150 MXN/mes, descarga todas las canciones masterizadas que quieras.
              </p>
            </div>
          </Card>
        </div>

        {/* FAQ Section */}
        <Card className="bg-gray-800 mb-12">
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
        </Card>

        {/* CTA Section */}
        <div className="text-center">
          <div className="inline-block bg-gradient-to-r from-purple-900/30 to-pink-900/30 rounded-2xl p-8">
            <h2 className="text-3xl font-bold mb-4">¡Comienza a Masterizar Hoy!</h2>
            <p className="text-xl text-gray-300 mb-6">
              Por solo <span className="text-green-400 font-bold">$150 MXN/mes</span>
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button
                onClick={() => document.getElementById('file-upload')?.click()}
                className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 px-8 py-3"
                size="lg"
              >
                <Upload className="w-5 h-5 mr-2" />
                Probar Gratis
              </Button>
              
              {isLoggedIn && !subscription?.active && (
                <Button
                  onClick={handleSubscribe}
                  className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 px-8 py-3"
                  size="lg"
                >
                  <CreditCard className="w-5 h-5 mr-2" />
                  Suscribirse Ahora
                </Button>
              )}
              
              {!isLoggedIn && (
                <Button
                  onClick={() => window.location.href = '/login'}
                  className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 px-8 py-3"
                  size="lg"
                >
                  Crear Cuenta Gratis
                </Button>
              )}
            </div>
            
            <p className="text-gray-400 mt-6 text-sm">
              Comparte este link en WhatsApp y redes sociales: <br />
              <code className="bg-gray-900 px-3 py-1 rounded text-blue-300">
                https://ramber-tunes.vercel.app/masterizar
              </code>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}