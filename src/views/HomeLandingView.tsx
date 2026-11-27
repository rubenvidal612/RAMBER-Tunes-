import * as React from 'react';
import {
  ArrowRight,
  AudioLines,
  BadgeCheck,
  Bot,
  Download,
  FileAudio2,
  FileText,
  Headphones,
  Instagram,
  Mic2,
  Music2,
  RefreshCcw,
  SlidersHorizontal,
  Sparkles,
  Video,
  WandSparkles,
  Youtube,
} from 'lucide-react';
import './home-landing.css';

type HomeLandingViewProps = {
  onGoStudio: () => void;
  onOpenPlans: () => void;
};

const tools = [
  { icon: Music2, tone: 'pink', title: 'Crear musica\ncon IA', text: 'Genera canciones completas con voz o instrumental en cualquier estilo.', action: 'Crear ahora', image: '/assets/tool-create-music.png', imageAlt: 'Productor creando musica con inteligencia artificial' },
  { icon: FileText, tone: 'purple', title: 'Escribir letras\ncon IA', text: 'LucIAna te ayuda a crear letras increibles para tus canciones en segundos.', action: 'Escribir letra', image: '/assets/tool-write-lyrics.png', imageAlt: 'Composicion de letras en un estudio musical' },
  { icon: Mic2, tone: 'blue', title: 'Clonar tu voz', text: 'Clona tu voz con IA y usala en tus canciones o proyectos.', action: 'Probar clonacion', image: '/assets/tool-clone-voice.png', imageAlt: 'Microfono y ondas para clonacion de voz' },
  { icon: RefreshCcw, tone: 'pink', title: 'Cover / Nueva\nversion', text: 'Transforma cualquier cancion en una nueva version unica.', action: 'Crear cover', image: '/assets/tool-cover-version.png', imageAlt: 'Produccion de una nueva version musical' },
  { icon: SlidersHorizontal, tone: 'green', title: 'Separar voz e\ninstrumental', text: 'Obten stems de alta calidad: voz, bateria, bajo y mas.', action: 'Separar ahora', image: '/assets/tool-separate-stems.png', imageAlt: 'Pistas de voz e instrumentos separadas' },
  { icon: WandSparkles, tone: 'gold', title: 'Masterizar\ntu musica', text: 'Mejora el sonido de tu cancion con IA y sonido profesional.', action: 'Masterizar', image: '/assets/tool-mastering.png', imageAlt: 'Consola profesional de masterizacion musical' },
  { icon: Video, tone: 'purple', title: 'Videos\nmusicales', text: 'Crea videos espectaculares para tu musica con IA.', action: 'Crear video', image: '/assets/tool-music-video.png', imageAlt: 'Produccion cinematografica de un video musical' },
  { icon: FileAudio2, tone: 'blue', title: 'WAV\nprofesional', text: 'Descarga tu musica en formato WAV de alta calidad.', action: 'Convertir a WAV', image: '/assets/tool-wav-audio.png', imageAlt: 'Equipo profesional de audio de alta resolucion' },
];

export function HomeLandingView({ onGoStudio }: HomeLandingViewProps) {
  return (
    <div className="landing-showcase">
      <section className="music-home-hero" aria-labelledby="music-home-title">
        <div className="music-home-hero-inner">
          <img src="/assets/tool-clone-voice.png" alt="" className="music-home-microphone" fetchPriority="high" />
          <div className="music-home-copy">
            <h1 id="music-home-title">Crea una canción que suene a ti</h1>
            <p>Convierte tu idea o letra en una canción completa.</p>
            <a href="/crear" className="music-home-button">Crear mi canción <ArrowRight aria-hidden="true" size={19} /></a>
          </div>
        </div>
      </section>

      <section className="music-home-discover landing-shell" aria-label="Descubre el estudio">
        <div className="music-home-voice">
          <span className="music-home-wave" aria-hidden="true"><AudioLines size={44} strokeWidth={1.35} /></span>
          <h2>Escucha tu voz en una canción</h2>
          <p>Clona tu voz y úsala para interpretar tus propias canciones.</p>
          <a className="music-home-button music-home-button-outline" href="/clonador">Probar con mi voz <ArrowRight aria-hidden="true" size={18} /></a>
        </div>
        <div className="music-home-genres">
          <h2>Explora más géneros</h2>
          <ul>
            {[{name: 'Regional mexicano', image: '/assets/landing-producer-studio.png'},
              {name: 'Cumbia', image: '/assets/tool-cover-version.png'},
              {name: 'Balada', image: '/assets/tool-create-music.png'}].map(({ name, image }) => (
              <li key={name}>
                <a href="/crear" className="music-home-genre" aria-label={`Abrir el estudio para crear ${name.toLowerCase()}`}>
                  <img src={image} alt="" loading="lazy" />
                  <span>{name}</span>
                  <ArrowRight aria-hidden="true" size={17} />
                </a>
              </li>
            ))}
          </ul>
        </div>
      </section>
      <section className="landing-intro">
        <div className="landing-shell landing-section-title music-home-tools-title"><h2>Herramientas para tu música</h2></div>
        <div className="landing-shell landing-tools-grid">
          {tools.map(({ icon: Icon, ...tool }) => (
            <article className={`landing-tool-card is-${tool.tone}`} key={tool.title}>
              <span className="landing-tool-icon"><Icon size={28} /></span>
              <h2>{tool.title.split('\n').map((line, index) => <React.Fragment key={line}>{index > 0 && <br />}{line}</React.Fragment>)}</h2>
              <p>{tool.text}</p>
              <div className="landing-tool-image"><img src={tool.image} alt={tool.imageAlt} /></div>
              <button type="button" onClick={onGoStudio}>{tool.action}<ArrowRight size={15} /></button>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-shell landing-technology">
        <div className="landing-section-title"><h2>Tecnologia de <em>ultima generacion</em><br />en <span>una sola plataforma</span></h2><p>Trabajamos con los modelos de IA mas avanzados para darte los mejores resultados.</p></div>
        <div className="landing-tech-grid">
          <article className="landing-tech-card is-purple"><header><Sparkles /><strong>Suno</strong></header><h3>Generacion musical con IA</h3><p>Modelos Suno V5.5, V5, V4.5 Plus, V4.5 All, V4.5 y V4 para crear musica de alta calidad.</p><small>Disponible ahora</small></article>
          <article className="landing-tech-card is-gold"><header><Sparkles /><strong>LucIAna</strong></header><h3>Escritura y creatividad con IA</h3><p>LucIAna te ayuda a crear letras, ideas, títulos y conceptos increíbles para tus canciones.</p><small>Disponible ahora</small></article>
          <article className="landing-tech-card is-pink"><header><AudioLines /><strong>Lyria</strong><b>PROXIMAMENTE</b></header><h3>Nueva generacion musical</h3><p>La nueva tecnologia de Google DeepMind que llevara tu musica al siguiente nivel.</p><small>Proximamente</small></article>
        </div>
        <div className="landing-quality-strip">
          <span><BadgeCheck /><strong>99.9%</strong><small>Uptime garantizado</small></span>
          <span><AudioLines /><strong>20s</strong><small>Streaming rapido</small></span>
          <span><Bot /><strong>Alta</strong><small>Concurrencia</small></span>
          <span><Sparkles /><strong>Sin marcas</strong><small>De agua</small></span>
          <span><FileAudio2 /><strong>Uso comercial</strong><small>Sin restricciones</small></span>
          <span><Headphones /><strong>24/7</strong><small>Soporte tecnico</small></span>
        </div>
      </section>

      <section className="landing-shell landing-process">
        <div className="landing-process-content">
          <div className="landing-section-title"><h2>Asi de facil es <em>crear tu musica</em></h2></div>
          <div className="landing-step-grid">
            {[
              [FileText, 'Elige o escribe tu idea', 'Cuentanos que quieres crear.'],
              [SlidersHorizontal, 'Personaliza tu musica', 'Selecciona estilo, genero, instrumentos y mas.'],
              [Sparkles, 'Generamos con IA', 'Nuestra IA crea tu cancion en segundos.'],
              [Download, 'Descarga y comparte', 'Obten tu musica en MP3 o WAV y compartela.'],
            ].map(([Icon, title, text], index) => <article key={String(title)}><span>{index + 1}</span><i><Icon size={24} /></i><h3>{String(title)}</h3><p>{String(text)}</p></article>)}
          </div>
        </div>
        <img src="/assets/luciana-studio-hero.png" alt="Cantante grabando una cancion en un estudio" />
      </section>

      <section className="landing-shell landing-final-cta">
        <div><h2>Listo para crear tu proxima cancion?</h2><p>Unete a miles de creadores y lleva tu musica al siguiente nivel con IA.</p></div>
        <button type="button" onClick={onGoStudio}>Crear mi primera cancion<ZapMark /></button>
      </section>

      <footer className="landing-shell landing-footer">
        <div className="landing-brand"><strong>Luc<span>IA</span>na <small>| Music</small></strong><p>La plataforma musical mas completa con IA para compositores, productores y creadores.</p><div><Youtube size={15} /><Instagram size={15} /><Music2 size={15} /></div></div>
        <div><strong>Producto</strong><a>Funciones</a><a>Precios</a><a>Planes</a><a>Novedades</a></div>
        <div><strong>Recursos</strong><a>Blog</a><a>Tutoriales</a><a>Centro de ayuda</a><a>Integraciones</a></div>
        <div><strong>Comunidad</strong><a>Comunidad</a><a>Artistas</a><a>Eventos</a><a>Afiliados</a></div>
        <div><strong>Empresa</strong><a>Acerca de</a><a>Contacto</a><a>Terminos</a><a>Privacidad</a></div>
        <div className="landing-support"><strong><Headphones size={16} />Soporte 24/7</strong><p>Estamos para ayudarte</p><button type="button">Contactar soporte</button><small>contacto@lucianamusic.app</small></div>
        <small className="landing-copyright">© 2026 LucIAna Music. Todos los derechos reservados.</small>
      </footer>
    </div>
  );
}

function ZapMark() {
  return <Sparkles size={15} fill="currentColor" />;
}
