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
  Pause,
  Play,
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
  { icon: FileText, tone: 'purple', title: 'Escribir letras\ncon IA', text: 'Gemini te ayuda a crear letras increibles para tus canciones en segundos.', action: 'Escribir letra', image: '/assets/tool-write-lyrics.png', imageAlt: 'Composicion de letras en un estudio musical' },
  { icon: Mic2, tone: 'blue', title: 'Clonar tu voz', text: 'Clona tu voz con IA y usala en tus canciones o proyectos.', action: 'Probar clonacion', image: '/assets/tool-clone-voice.png', imageAlt: 'Microfono y ondas para clonacion de voz' },
  { icon: RefreshCcw, tone: 'pink', title: 'Cover / Nueva\nversion', text: 'Transforma cualquier cancion en una nueva version unica.', action: 'Crear cover', image: '/assets/tool-cover-version.png', imageAlt: 'Produccion de una nueva version musical' },
  { icon: SlidersHorizontal, tone: 'green', title: 'Separar voz e\ninstrumental', text: 'Obten stems de alta calidad: voz, bateria, bajo y mas.', action: 'Separar ahora', image: '/assets/tool-separate-stems.png', imageAlt: 'Pistas de voz e instrumentos separadas' },
  { icon: WandSparkles, tone: 'gold', title: 'Masterizar\ntu musica', text: 'Mejora el sonido de tu cancion con IA y sonido profesional.', action: 'Masterizar', image: '/assets/tool-mastering.png', imageAlt: 'Consola profesional de masterizacion musical' },
  { icon: Video, tone: 'purple', title: 'Videos\nmusicales', text: 'Crea videos espectaculares para tu musica con IA.', action: 'Crear video', image: '/assets/tool-music-video.png', imageAlt: 'Produccion cinematografica de un video musical' },
  { icon: FileAudio2, tone: 'blue', title: 'WAV\nprofesional', text: 'Descarga tu musica en formato WAV de alta calidad.', action: 'Convertir a WAV', image: '/assets/tool-wav-audio.png', imageAlt: 'Equipo profesional de audio de alta resolucion' },
];

const demos = [
  { icon: Mic2, title: 'Clonacion de voz', before: 'Voz original', after: 'Voz clonada', tone: 'purple', caption: 'Escucha como replicamos tu voz con increible precision.' },
  { icon: Music2, title: 'Cover / Nueva version', before: 'Version original', after: 'Nueva version', tone: 'pink', caption: 'Transforma cualquier cancion en una nueva interpretacion unica.' },
  { icon: AudioLines, title: 'Masterizacion', before: 'Antes', after: 'Masterizado', tone: 'blue', caption: 'Mejoramos el sonido para que tu musica suene profesional y potente.' },
];

function WaveLine({ tone }: { tone: string }) {
  return (
    <span className={`landing-wave-line is-${tone}`} aria-hidden="true">
      {Array.from({ length: 7 }, (_, index) => <AudioLines key={index} size={22} strokeWidth={1.6} />)}
    </span>
  );
}

function DemoCard({ demo, playing, onToggle }: { demo: typeof demos[number]; playing: string; onToggle: (id: string) => void }) {
  const Icon = demo.icon;
  return (
    <article className={`landing-demo is-${demo.tone}`}>
      <header><Icon size={18} /><strong>{demo.title}</strong></header>
      {[demo.before, demo.after].map((label, index) => {
        const id = `${demo.title}-${label}`;
        const active = playing === id;
        return (
          <button type="button" key={label} className="landing-demo-row" onClick={() => onToggle(id)}>
            <span className="landing-demo-dot">{index + 1}</span>
            <span className="landing-demo-info"><strong>{label}</strong><span><i>{active ? <Pause size={12} /> : <Play size={12} fill="currentColor" />}</i><WaveLine tone={index ? demo.tone : 'muted'} /><small>{demo.title === 'Clonacion de voz' ? '00:30' : '00:45'}</small></span></span>
          </button>
        );
      })}
      <p>{demo.caption}</p>
    </article>
  );
}

export function HomeLandingView({ onGoStudio }: HomeLandingViewProps) {
  const [playing, setPlaying] = React.useState('');
  const toggleDemo = (id: string) => setPlaying((current) => current === id ? '' : id);

  return (
    <div className="landing-showcase">
      <section className="landing-intro">
        <img className="landing-intro-photo" src="/assets/landing-producer-studio.png" alt="Productor creando musica en un estudio con iluminacion neon" />
        <div className="landing-intro-shade" />
        <div className="landing-shell landing-intro-copy">
          <h1>Todo lo que puedes hacer<br />en <em>LucIAna Music</em></h1>
          <p>Una suite completa de herramientas con IA para crear,<br />producir y llevar tu musica al siguiente nivel.</p>
        </div>

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

      <section className="landing-shell landing-difference">
        <div className="landing-section-title"><h2>Escucha la diferencia: <em>antes y despues</em></h2><p>Ejemplos reales creados con LucIAna Music</p></div>
        <div className="landing-demo-grid">
          {demos.map((demo) => <DemoCard key={demo.title} demo={demo} playing={playing} onToggle={toggleDemo} />)}
        </div>
        <button type="button" className="landing-outline-button"><Headphones size={15} />Escucha mas ejemplos<ArrowRight size={15} /></button>
      </section>

      <section className="landing-shell landing-technology">
        <div className="landing-section-title"><h2>Tecnologia de <em>ultima generacion</em><br />en <span>una sola plataforma</span></h2><p>Trabajamos con los modelos de IA mas avanzados para darte los mejores resultados.</p></div>
        <div className="landing-tech-grid">
          <article className="landing-tech-card is-purple"><header><Sparkles /><strong>Suno</strong></header><h3>Generacion musical con IA</h3><p>Modelos Suno V5.5, V5, V4.5 Plus, V4.5 All, V4.5 y V4 para crear musica de alta calidad.</p><small>Disponible ahora</small></article>
          <article className="landing-tech-card is-gold"><header><Sparkles /><strong>Gemini</strong></header><h3>Escritura y creatividad con IA</h3><p>Gemini te ayuda a crear letras, ideas, titulos y conceptos increibles para tus canciones.</p><small>Disponible ahora</small></article>
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
        <div><strong>Recursos</strong><a>Blog</a><a>Tutoriales</a><a>Centro de ayuda</a><a>API</a></div>
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
