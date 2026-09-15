import { useState } from 'react';
import { Shield, Lock, UserCheck, CreditCard, Music2, FileKey, Eye, X, ArrowLeft, Download, CheckCircle2 } from 'lucide-react';

export interface PrivacyPolicyViewProps {
  onBack?: () => void;
}

export function PrivacyPolicyView({ onBack }: PrivacyPolicyViewProps) {
  const [copied, setCopied] = useState(false);

  const handleBack = () => {
    if (onBack) return onBack();
    try {
      window.history.back();
    } catch {
      window.location.href = '/';
    }
  };

  const handleCopy = async () => {
    const text = document.getElementById('privacy-policy-text')?.innerText || '';
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch {}
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
    try { navigator.vibrate?.(22); } catch {}
  };

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-[#0a0618] via-[#0f0820] to-[#0b0515] text-white relative overflow-x-hidden">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[980px] h-[620px] rounded-full bg-fuchsia-500/10 blur-3xl -z-0 pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[620px] h-[620px] rounded-full bg-indigo-500/10 blur-3xl -z-0 pointer-events-none" />

      <div className="relative z-10 max-w-4xl mx-auto px-4 py-8 sm:px-6 sm:py-12">
        <div className="flex items-center justify-between mb-6 sm:mb-10">
          <button
            onClick={handleBack}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/80 hover:text-white transition text-sm"
          >
            <ArrowLeft size={16} />
            <span>Volver</span>
          </button>
          <button
            onClick={handleCopy}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-fuchsia-500 to-pink-500 hover:from-fuchsia-400 hover:to-pink-400 text-white text-sm font-semibold shadow-lg shadow-fuchsia-500/20 transition"
          >
            {copied ? <><CheckCircle2 size={16} /><span>Copiado ✓</span></> : <><Download size={16} /><span>Copiar política</span></>}
          </button>
        </div>

        <header className="mb-10 sm:mb-14">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-fuchsia-500/10 border border-fuchsia-500/20 text-fuchsia-300 text-xs font-medium mb-4">
            <Shield size={13} />
            GPT Store compliant · Última actualización: 14 de septiembre de 2026
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight leading-tight bg-gradient-to-br from-white via-fuchsia-100 to-pink-200 bg-clip-text text-transparent mb-4">
            Política de Privacidad de LucIAna Music
          </h1>
          <p className="text-white/70 text-base sm:text-lg leading-relaxed max-w-3xl">
            En LucIAna Music S.A.S. (en adelante, "nosotros", "LucIAna" o "el Servicio") respetamos tu privacidad y protegemos tus datos personales. Esta política describe cómo recopilamos, usamos, almacenamos y compartimos tu información cuando usas nuestra aplicación web, nuestro bot de Telegram y/o nuestro Custom GPT publicado en la GPT Store de OpenAI.
          </p>
        </header>

        <div id="privacy-policy-text" className="space-y-8 sm:space-y-10 text-white/85 leading-relaxed">
          <section>
            <h2 className="text-2xl font-bold flex items-center gap-3 text-white mb-3">
              <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-indigo-500/15 border border-indigo-500/25 text-indigo-300"><UserCheck size={20} /></span>
              1. Responsable del tratamiento
            </h2>
            <p>
              El responsable del tratamiento de tus datos personales es LucIAna Music S.A.S. Si tienes preguntas sobre esta política, puedes contactarnos a través de soporte@lucianamusic.app.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold flex items-center gap-3 text-white mb-3">
              <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/25 text-emerald-300"><Lock size={20} /></span>
              2. Información que recopilamos y su finalidad
            </h2>
            <ul className="space-y-3 pl-1 sm:pl-2 mt-2">
              <li className="flex gap-3">
                <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
                <div>
                  <strong className="text-white">Cuenta de Google (OAuth 2.0):</strong> cuando inicias sesión con "Continuar con Google", recibimos tu nombre público, foto de perfil y dirección de correo electrónico asociada a tu cuenta Google. No tenemos acceso a tu contraseña de Google en ningún momento. Esta autenticación se realiza a través del proveedor oficial de OAuth de Google (Supabase Auth). <strong>Finalidad:</strong> identificarte de forma segura, asociar tus créditos y canciones a tu cuenta y personalizar la experiencia.
                </div>
              </li>
              <li className="flex gap-3">
                <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
                <div>
                  <strong className="text-white">Créditos de LucIAna Music:</strong> almacenamos en nuestra base de datos (Supabase PostgreSQL) tu saldo de créditos, compras de paquetes, suscripciones, historial de generaciones, clones de voz y canciones favoritas. <strong>Finalidad:</strong> facilitar el cobro justo por canción generada y llevar tu historial de uso.
                </div>
              </li>
              <li className="flex gap-3">
                <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
                <div>
                  <strong className="text-white">Archivos de audio y letras que subes/generas:</strong> tus MP3, WAV, M4A, OGG, FLAC y AAC subidos por la ruta /subir o por el Custom GPT, así como las letras transcritas o generadas, se almacenan en buckets privados Cloudflare R2 y/o Supabase Storage asociados a tu user ID. <strong>Finalidad:</strong> generar covers, transcripciones, clonación de voces y separación de pistas que tú solicites.
                </div>
              </li>
              <li className="flex gap-3">
                <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
                <div>
                  <strong className="text-white">Datos de uso y técnicos:</strong> tiempo de sesión, agente de navegador, sistema operativo, URLs de salida y errores del servidor. <strong>Finalidad:</strong> diagnosticar bugs, mejorar rendimiento y detectar abusos (spam, robos de cuenta).
                </div>
              </li>
              <li className="flex gap-3">
                <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
                <div>
                  <strong className="text-white">Custom GPT de la GPT Store:</strong> cuando interactúas con LucIAna Music desde la GPT Store de OpenAI, OpenAI actúa como controlador de datos independiente y nos envía solo el mínimo necesario (tu token OAuth de acceso JWT y los parámetros de la petición). No almacenamos el historial de tu chat con ChatGPT; este lo gestiona OpenAI conforme a su propia política.
                </div>
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold flex items-center gap-3 text-white mb-3">
              <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/25 text-amber-300"><Eye size={20} /></span>
              3. No compartimos tus datos con terceros
            </h2>
            <p className="mb-2">
              LucIAna Music <strong className="text-white">NO vende, alquila, comercializa ni comparte tus datos sensibles</strong> (correo electrónico, audios privados, historial de generaciones, tokens OAuth) con terceros con fines comerciales o publicitarios.
            </p>
            <p className="mb-2">
              Solo compartimos datos estrictamente necesarios y a través de contratos de procesamiento oficiales con estos subproveedores, quienes actúan como Encargados del Tratamiento según RGPD (UE) y LFPDPPP (México):
            </p>
            <ul className="space-y-2 pl-1 sm:pl-2">
              <li className="flex gap-3">
                <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                <div><strong className="text-white">Supabase Inc.</strong> (USA/UE): autenticación OAuth, base de datos PostgreSQL y storage de audios. Datos: email, perfil Google, metadata de canciones y créditos.</div>
              </li>
              <li className="flex gap-3">
                <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                <div><strong className="text-white">Vercel Inc.</strong> (USA/UE): hosting serverless y despliegue de la aplicación. Datos: logs de errores, cabeceras HTTP y IP anonimizada.</div>
              </li>
              <li className="flex gap-3">
                <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                <div><strong className="text-white">Cloudflare Inc.</strong> (USA): almacenamiento de buckets R2 con tus archivos de audio. Datos: audios crudos y MP3 generados (cifrados en reposo).</div>
              </li>
              <li className="flex gap-3">
                <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                <div><strong className="text-white">Kie / RedPanda AI (Proveedor Suno V6)</strong> (EEUU): generación musical. Datos: prompts, estilo, audio de referencia para covers y clonación. No envíamos tu correo electrónico real; solo un user ID hash corto.</div>
              </li>
              <li className="flex gap-3">
                <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                <div><strong className="text-white">Google LLC (GenAI Gemini)</strong> (EEUU): transcripción de audio a letra y escritura de letras con IA. Datos: audio MP3/WAV a transcribir y título de la canción. Almacenamiento temporal según política Google AI Studio.</div>
              </li>
              <li className="flex gap-3">
                <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                <div><strong className="text-white">OpenAI LLC</strong> (EEUU): cuando usas el Custom GPT, tu interacción se procesa primero en ChatGPT. Nosotros solo recibimos el bearer token OAuth y los parámetros que tú autorizas.</div>
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold flex items-center gap-3 text-white mb-3">
              <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-sky-500/15 border border-sky-500/25 text-sky-300"><CreditCard size={20} /></span>
              4. Pagos y créditos
            </h2>
            <p>
              Las recargas de créditos y suscripciones se procesan directamente por pasarelas de pago seguras (Stripe, PayPal y/o Mercado Pago). LucIAna NO almacena en sus servidores números de tarjetas, CVV ni fechas de caducidad; únicamente guardamos el ID de transacción, importe abonado y fecha para generar tu factura si la solicitas.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold flex items-center gap-3 text-white mb-3">
              <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/25 text-rose-300"><Music2 size={20} /></span>
              5. Propiedad intelectual y derecho sobre tus creaciones
            </h2>
            <p>
              Los derechos patrimoniales sobre las canciones que generes usando LucIAna Music permanecen en tu poder conforme a los términos de Suno V6/Kie (proveedor de generación musical). Nosotros solo almacenamos una copia en tu biblioteca personal para que la escuches y descargues; no la republicamos ni monetizamos sin tu consentimiento escrito explícito.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold flex items-center gap-3 text-white mb-3">
              <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-violet-500/15 border border-violet-500/25 text-violet-300"><FileKey size={20} /></span>
              6. Seguridad y conservación
            </h2>
            <p>
              Aplicamos medidas técnicas y organizativas de seguridad conforme al estado del arte (cifrado TLS 1.3 en tránsito, cifrado AES-256 en reposo, tokens JWT firmados con rotación de credenciales, firewalls de base de datos RLS en Supabase y rate limiting por IP). Conservamos tus datos mientras mantengas tu cuenta activa y hasta 24 meses después de su baja, a menos que la ley exija plazos mayores.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold flex items-center gap-3 text-white mb-3">
              <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-pink-500/15 border border-pink-500/25 text-pink-300"><Shield size={20} /></span>
              7. Tus derechos ARCO (Acceso, Rectificación, Cancelación y Oposición)
            </h2>
            <p className="mb-2">
              Puedes ejercer tus derechos en cualquier momento: solicitar una copia CSV de tus datos, corregir tu email o nombre, cancelar tu cuenta de forma definitiva y/o pedir la eliminación inmediata de tus archivos de audio. Envía un correo a <strong className="text-white">soporte@lucianamusic.app</strong> desde la misma dirección que usaste para registrarte y atenderemos tu solicitud en un plazo máximo de 15 días hábiles.
            </p>
            <p>
              En el panel <em>Ajustes → Privacidad y datos</em> de la aplicación web también puedes descargar tus datos y eliminar tu cuenta en un clic, sin correos intermedios.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold flex items-center gap-3 text-white mb-3">
              <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-fuchsia-500/15 border border-fuchsia-500/25 text-fuchsia-300"><X size={20} /></span>
              8. Cookies y tecnologías de seguimiento
            </h2>
            <p>
              LucIAna Music solo usa cookies estrictamente necesarias y almacenamiento local (localStorage) para mantener abierta tu sesión OAuth y recuerda la canción que estabas escuchando. NO usamos cookies publicitarias de terceros, ni píxeles de Meta/Google Ads, ni fingerprinting de navegador con fines de publicidad.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold flex items-center gap-3 text-white mb-3">
              <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-teal-500/15 border border-teal-500/25 text-teal-300"><Eye size={20} /></span>
              9. Transferencias internacionales
            </h2>
            <p>
              Almacenamos y procesamos tus datos en centros de datos de la UE (Fráncfort) y EEUU (Virginia), con cláusulas estándar contractuales (SCCs de la Comisión Europea) alineadas con RGPD y Decisión de Adecuación UE-EEUU. Nos reservamos el derecho de transferir datos solo conforme a bases legales y mecanismos adecuados.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold flex items-center gap-3 text-white mb-3">
              <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-indigo-500/15 border border-indigo-500/25 text-indigo-300"><Shield size={20} /></span>
              10. Menores de edad
            </h2>
            <p>
              LucIAna Music no está dirigido a menores de 13 años. Si detectamos una cuenta creada por una persona menor de 13 años sin el consentimiento veraz de su tutor/a legal, procederemos a su bloqueo inmediato y eliminación de datos en un plazo de 72h.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold flex items-center gap-3 text-white mb-3">
              <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/25 text-rose-300"><Lock size={20} /></span>
              11. Custom GPT (GPT Store de OpenAI)
            </h2>
            <p className="mb-2">
              Cuando usas LucIAna Music desde la GPT Store:
            </p>
            <ul className="space-y-2 pl-1 sm:pl-2">
              <li className="flex gap-3">
                <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-rose-400 flex-shrink-0" />
                <div>La autenticación se realiza mediante OAuth 2.0 con el mismo flujo Google OAuth de nuestra web. No almacenamos los tokens de acceso de ChatGPT; se envían mediante Authorization: Bearer y se validan directamente contra Supabase en cada petición. Expiran cada 30 días.</div>
              </li>
              <li className="flex gap-3">
                <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-rose-400 flex-shrink-0" />
                <div>El Custom GPT puede invocar acciones para generar música, consultar estado, subir audios y transcribir letras. Solo tiene acceso a los datos que tú subas dentro de esa misma conversación; no a todo tu historial privado del resto de la web.</div>
              </li>
              <li className="flex gap-3">
                <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-rose-400 flex-shrink-0" />
                <div>OpenAI puede recopilar interacciones con el GPT conforme a su política. Nosotros solo recibimos el mínimo imprescindible para que la acción funcione.</div>
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold flex items-center gap-3 text-white mb-3">
              <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-fuchsia-500/15 border border-fuchsia-500/25 text-fuchsia-300"><ArrowLeft size={20} /></span>
              12. Cambios en esta política
            </h2>
            <p>
              Podemos actualizar esta Política de Privacidad ocasionalmente para reflejar cambios legales o nuevas funcionalidades. Cuando lo hagamos, publicaremos la nueva versión en esta misma URL (<code className="px-2 py-0.5 rounded bg-white/10 border border-white/10 text-fuchsia-200 text-sm">/privacy</code>) con fecha actualizada visible arriba y, si los cambios son significativos, te lo notificaremos por email o banner dentro de la app al menos 7 días antes de que entren en vigor.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold flex items-center gap-3 text-white mb-3">
              <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/25 text-emerald-300"><CheckCircle2 size={20} /></span>
              13. Base legal del tratamiento (RGPD)
            </h2>
            <p>
              Tratamos tus datos bajo las siguientes bases legales: (a) ejecución del contrato de servicios LucIAna Music que aceptas al crearte una cuenta; (b) tu consentimiento explícito cuando haces login con Google OAuth; (c) intereses legítimos para mejorar el servicio y detectar abusos; y (d) obligaciones legales de retención tributaria y comercial aplicables en México y la UE.
            </p>
          </section>

          <section className="border-t border-white/10 pt-8 mt-8">
            <p className="text-white/60 text-sm">
              Al usar LucIAna Music (web, Telegram o Custom GPT en la GPT Store), confirmas que has leído, entendido y aceptado esta Política de Privacidad en su totalidad. Para cualquier duda, escribe a <strong className="text-white">soporte@lucianamusic.app</strong>.
            </p>
            <p className="mt-2 text-white/50 text-xs">
              LucIAna Music S.A.S. · RFC: LUCI000000XXX · Domicilio fiscal: Ciudad de México, México · Vigente desde el 14/09/2026.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
