import { ArrowRight, AudioLines, Download, Mic, Video } from 'lucide-react';
import './home-landing.css';

const videoUrl = import.meta.env.VITE_HOME_MUSIC_VIDEO_URL?.trim();

function CloneLink() {
  return (
    <a className="album-cta" href="/clonador">
      <Mic size={22} aria-hidden="true" />
      <span>Genera 2 canciones con tu voz <strong>GRATIS</strong></span>
      <ArrowRight size={19} aria-hidden="true" />
    </a>
  );
}

export function HomeLandingView() {
  return (
    <div className="album-home">
      <section className="album-hero">
        <div className="album-glow" aria-hidden="true" />
        <div className="album-shell album-grid">
          <div className="album-copy">
            <p className="album-kicker"><Mic size={21} aria-hidden="true" /> Clonación de voz con IA</p>
            <h1>Crea tu álbum musical con <em>tu voz</em></h1>
            <p className="album-lead">Por lo que te costaría una hamburguesa, crea un álbum <strong>100% tuyo</strong>.</p>
            <p className="album-genres">Canta en cualquier género. Prueba regional mexicano, cumbia, pop, balada o el estilo que tú elijas.</p>
            <CloneLink />
            <p className="album-note">Consulta la disponibilidad de la promoción en el clonador.</p>
          </div>
          <figure className="album-art">
            <img src="/assets/inicio-album-voz.webp" width="825" height="669" alt="Portada Mi Álbum con mi voz junto a un vinilo iluminado en violeta" fetchPriority="high" />
          </figure>
        </div>
      </section>

      <section className="album-shell album-extras" aria-label="Opciones para tus canciones">
        <article><Download aria-hidden="true" /><h2>Descargas ilimitadas</h2><p>Descarga las canciones disponibles en tu biblioteca cuando quieras.</p></article>
        <article><AudioLines aria-hidden="true" /><h2>Elimina la voz de tus canciones</h2><p>Quédate con la pista instrumental de las canciones compatibles.</p><a href="/biblioteca">Ir a Mis canciones <ArrowRight size={16} aria-hidden="true" /></a></article>
        <article><Video aria-hidden="true" /><h2>Crea videos para tus redes</h2><p>Convierte tus canciones en videos para compartir en redes sociales.</p><a href="/biblioteca">Elige una canción <ArrowRight size={16} aria-hidden="true" /></a></article>
      </section>

      {videoUrl && <section className="album-shell album-example">
        <h2>Así se ve un video musical</h2>
        <video src={videoUrl} controls playsInline preload="metadata" />
      </section>}

      <section className="album-shell album-bottom"><CloneLink /></section>
    </div>
  );
}
