import { useState, useRef, useEffect } from 'react';
import { Play, Pause, RotateCcw, Volume2, Music, Waves, Zap, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface VoiceEditorProps {
  audioUrl: string;
  onSave?: (effects: VoiceEffects) => void;
  className?: string;
}

export interface VoiceEffects {
  pitch: number; // -12 to +12 semitones
  reverb: number; // 0 to 100
  tempo: number; // 50 to 150%
  volume: number; // 0 to 200%
  eqLow: number; // -12 to +12 dB
  eqMid: number; // -12 to +12 dB
  eqHigh: number; // -12 to +12 dB
  distortion: number; // 0 to 100
  chorus: number; // 0 to 100
  delay: number; // 0 to 100
}

const DEFAULT_EFFECTS: VoiceEffects = {
  pitch: 0,
  reverb: 0,
  tempo: 100,
  volume: 100,
  eqLow: 0,
  eqMid: 0,
  eqHigh: 0,
  distortion: 0,
  chorus: 0,
  delay: 0,
};

export function VoiceEditor({ audioUrl, onSave, className }: VoiceEditorProps) {
  const [effects, setEffects] = useState<VoiceEffects>(DEFAULT_EFFECTS);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  const [sourceNode, setSourceNode] = useState<AudioBufferSourceNode | null>(null);
  const [gainNode, setGainNode] = useState<GainNode | null>(null);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  
  const audioRef = useRef<HTMLAudioElement>(null);

  // Cargar el audio cuando cambia la URL
  useEffect(() => {
    if (!audioUrl) return;

    const loadAudio = async () => {
      try {
        const response = await fetch(audioUrl);
        const arrayBuffer = await response.arrayBuffer();
        
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const buffer = await ctx.decodeAudioData(arrayBuffer);
        
        setAudioContext(ctx);
        setAudioBuffer(buffer);
        
        // Configurar nodos de audio
        const gain = ctx.createGain();
        setGainNode(gain);
        
      } catch (error) {
        console.error('Error cargando audio:', error);
      }
    };

    loadAudio();

    // Limpiar al desmontar
    return () => {
      if (audioContext) {
        audioContext.close();
      }
    };
  }, [audioUrl]);

  const handleEffectChange = (key: keyof VoiceEffects, value: number) => {
    setEffects(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const resetEffects = () => {
    setEffects(DEFAULT_EFFECTS);
  };

  const playAudioWithEffects = async () => {
    if (!audioContext || !audioBuffer || !gainNode) return;

    // Detener reproducción actual
    if (sourceNode) {
      sourceNode.stop();
      setSourceNode(null);
    }

    setIsPlaying(true);

    // Crear nueva fuente
    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    setSourceNode(source);

    // Configurar efectos
    // Pitch (cambio de tono)
    source.playbackRate.value = Math.pow(2, effects.pitch / 12);

    // Volumen
    gainNode.gain.value = effects.volume / 100;

    // Conectar nodos
    source.connect(gainNode);
    gainNode.connect(audioContext.destination);

    // Manejar fin de reproducción
    source.onended = () => {
      setIsPlaying(false);
      setSourceNode(null);
    };

    // Iniciar reproducción
    source.start();
  };

  const stopAudio = () => {
    if (sourceNode) {
      sourceNode.stop();
      setSourceNode(null);
    }
    setIsPlaying(false);
  };

  const handleSave = () => {
    if (onSave) {
      onSave(effects);
    }
  };

  const formatValue = (value: number, suffix: string = '') => {
    if (value > 0) return `+${value}${suffix}`;
    if (value < 0) return `${value}${suffix}`;
    return `0${suffix}`;
  };

  return (
    <div className={cn("bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-6 shadow-2xl border border-slate-700", className)}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <Music className="w-5 h-5 text-purple-400" />
            Editor de Voz
          </h3>
          <p className="text-slate-400 text-sm mt-1">Ajusta los efectos para personalizar tu voz</p>
        </div>
        
        <div className="flex items-center gap-3">
          <button
            onClick={resetEffects}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg flex items-center gap-2 transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            Reiniciar
          </button>
          
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white rounded-lg flex items-center gap-2 transition-all"
          >
            <Check className="w-4 h-4" />
            Guardar
          </button>
        </div>
      </div>

      {/* Controles de reproducción */}
      <div className="mb-8 p-4 bg-slate-800/50 rounded-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={isPlaying ? stopAudio : playAudioWithEffects}
              disabled={!audioBuffer || isProcessing}
              className={cn(
                "w-12 h-12 rounded-full flex items-center justify-center transition-all",
                isPlaying 
                  ? "bg-red-500 hover:bg-red-600 text-white" 
                  : "bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 text-white"
              )}
            >
              {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
            </button>
            
            <div>
              <p className="text-white font-medium">Previsualización</p>
              <p className="text-slate-400 text-sm">Escucha los efectos aplicados</p>
            </div>
          </div>
          
          <div className="text-right">
            <p className="text-slate-300 text-sm">Duración: {audioBuffer ? `${audioBuffer.duration.toFixed(1)}s` : 'Cargando...'}</p>
            <p className="text-slate-400 text-xs">Formato: WAV 48kHz</p>
          </div>
        </div>
      </div>

      {/* Efectos principales */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        {/* Pitch */}
        <div className="bg-slate-800/50 p-4 rounded-xl">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Music className="w-4 h-4 text-purple-400" />
              <span className="text-white font-medium">Tono (Pitch)</span>
            </div>
            <span className="text-purple-300 font-bold">{formatValue(effects.pitch, 'st')}</span>
          </div>
          <input
            type="range"
            min="-12"
            max="12"
            step="1"
            value={effects.pitch}
            onChange={(e) => handleEffectChange('pitch', parseInt(e.target.value))}
            className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-purple-500"
          />
          <div className="flex justify-between text-xs text-slate-400 mt-2">
            <span>-12st</span>
            <span>0</span>
            <span>+12st</span>
          </div>
        </div>

        {/* Reverb */}
        <div className="bg-slate-800/50 p-4 rounded-xl">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Waves className="w-4 h-4 text-blue-400" />
              <span className="text-white font-medium">Reverb</span>
            </div>
            <span className="text-blue-300 font-bold">{effects.reverb}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            value={effects.reverb}
            onChange={(e) => handleEffectChange('reverb', parseInt(e.target.value))}
            className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-500"
          />
          <div className="flex justify-between text-xs text-slate-400 mt-2">
            <span>Seco</span>
            <span>50%</span>
            <span>Húmedo</span>
          </div>
        </div>

        {/* Volumen */}
        <div className="bg-slate-800/50 p-4 rounded-xl">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Volume2 className="w-4 h-4 text-green-400" />
              <span className="text-white font-medium">Volumen</span>
            </div>
            <span className="text-green-300 font-bold">{effects.volume}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="200"
            step="1"
            value={effects.volume}
            onChange={(e) => handleEffectChange('volume', parseInt(e.target.value))}
            className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-green-500"
          />
          <div className="flex justify-between text-xs text-slate-400 mt-2">
            <span>0%</span>
            <span>100%</span>
            <span>200%</span>
          </div>
        </div>

        {/* Tempo */}
        <div className="bg-slate-800/50 p-4 rounded-xl">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-yellow-400" />
              <span className="text-white font-medium">Tempo</span>
            </div>
            <span className="text-yellow-300 font-bold">{effects.tempo}%</span>
          </div>
          <input
            type="range"
            min="50"
            max="150"
            step="1"
            value={effects.tempo}
            onChange={(e) => handleEffectChange('tempo', parseInt(e.target.value))}
            className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-yellow-500"
          />
          <div className="flex justify-between text-xs text-slate-400 mt-2">
            <span>50%</span>
            <span>100%</span>
            <span>150%</span>
          </div>
        </div>

        {/* EQ Bajo */}
        <div className="bg-slate-800/50 p-4 rounded-xl">
          <div className="flex items-center justify-between mb-3">
            <span className="text-white font-medium">EQ Bajo</span>
            <span className="text-orange-300 font-bold">{formatValue(effects.eqLow, 'dB')}</span>
          </div>
          <input
            type="range"
            min="-12"
            max="12"
            step="1"
            value={effects.eqLow}
            onChange={(e) => handleEffectChange('eqLow', parseInt(e.target.value))}
            className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-orange-500"
          />
          <div className="flex justify-between text-xs text-slate-400 mt-2">
            <span>-12dB</span>
            <span>0</span>
            <span>+12dB</span>
          </div>
        </div>

        {/* EQ Medio */}
        <div className="bg-slate-800/50 p-4 rounded-xl">
          <div className="flex items-center justify-between mb-3">
            <span className="text-white font-medium">EQ Medio</span>
            <span className="text-pink-300 font-bold">{formatValue(effects.eqMid, 'dB')}</span>
          </div>
          <input
            type="range"
            min="-12"
            max="12"
            step="1"
            value={effects.eqMid}
            onChange={(e) => handleEffectChange('eqMid', parseInt(e.target.value))}
            className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-pink-500"
          />
          <div className="flex justify-between text-xs text-slate-400 mt-2">
            <span>-12dB</span>
            <span>0</span>
            <span>+12dB</span>
          </div>
        </div>
      </div>

      {/* Efectos avanzados */}
      <div className="bg-slate-800/30 p-4 rounded-xl">
        <h4 className="text-white font-medium mb-4">Efectos Avanzados</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Distorsión */}
          <div>
            <div className="flex justify-between mb-2">
              <span className="text-slate-300 text-sm">Distorsión</span>
              <span className="text-red-300 text-sm font-bold">{effects.distortion}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={effects.distortion}
              onChange={(e) => handleEffectChange('distortion', parseInt(e.target.value))}
              className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-red-500"
            />
          </div>

          {/* Chorus */}
          <div>
            <div className="flex justify-between mb-2">
              <span className="text-slate-300 text-sm">Chorus</span>
              <span className="text-cyan-300 text-sm font-bold">{effects.chorus}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={effects.chorus}
              onChange={(e) => handleEffectChange('chorus', parseInt(e.target.value))}
              className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-cyan-500"
            />
          </div>

          {/* Delay */}
          <div>
            <div className="flex justify-between mb-2">
              <span className="text-slate-300 text-sm">Delay</span>
              <span className="text-indigo-300 text-sm font-bold">{effects.delay}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={effects.delay}
              onChange={(e) => handleEffectChange('delay', parseInt(e.target.value))}
              className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-indigo-500"
            />
          </div>
        </div>
      </div>

      {/* Estado actual de efectos */}
      <div className="mt-6 p-4 bg-gradient-to-r from-purple-900/20 to-blue-900/20 rounded-xl">
        <p className="text-slate-300 text-sm">
          <span className="font-medium">Efectos aplicados:</span>{' '}
          {effects.pitch !== 0 && `Tono ${formatValue(effects.pitch, 'st')} `}
          {effects.reverb !== 0 && `Reverb ${effects.reverb}% `}
          {effects.volume !== 100 && `Volumen ${effects.volume}% `}
          {effects.tempo !== 100 && `Tempo ${effects.tempo}% `}
          {(effects.pitch === 0 && effects.reverb === 0 && effects.volume === 100 && effects.tempo === 100) && 'Sin efectos'}
        </p>
      </div>
    </div>
  );
}