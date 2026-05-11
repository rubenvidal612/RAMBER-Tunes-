import { VoiceItem } from '@/types';

export interface PreTrainedVoice extends VoiceItem {
  category: 'celebrity' | 'character' | 'artist' | 'generic';
  language: string;
  gender: 'male' | 'female' | 'neutral';
  accent?: string;
  tags: string[];
}

export const PRETRAINED_VOICES: PreTrainedVoice[] = [
  {
    id: 'pretrained_taylor_swift',
    name: 'Taylor Swift',
    description: 'Voz pop suave y melódica con tono claro y expresivo',
    modelUrl: 'https://replicate.com/replicate/taylor-swift-rvc',
    sampleUrl: 'https://example.com/samples/taylor_swift_sample.wav',
    createdAt: '2024-01-01T00:00:00Z',
    status: 'ready',
    userId: 'system',
    category: 'celebrity',
    language: 'en',
    gender: 'female',
    accent: 'American',
    tags: ['pop', 'female', 'english', 'celebrity', 'singing']
  },
  {
    id: 'pretrained_donald_trump',
    name: 'Donald Trump',
    description: 'Voz característica con tono nasal y enfático',
    modelUrl: 'https://replicate.com/replicate/trump-rvc',
    sampleUrl: 'https://example.com/samples/trump_sample.wav',
    createdAt: '2024-01-01T00:00:00Z',
    status: 'ready',
    userId: 'system',
    category: 'celebrity',
    language: 'en',
    gender: 'male',
    accent: 'New York',
    tags: ['male', 'english', 'celebrity', 'speaking', 'politics']
  },
  {
    id: 'pretrained_squidward',
    name: 'Squidward Tentacles',
    description: 'Voz nasal y quejumbrosa del personaje de Bob Esponja',
    modelUrl: 'https://replicate.com/replicate/squidward-rvc',
    sampleUrl: 'https://example.com/samples/squidward_sample.wav',
    createdAt: '2024-01-01T00:00:00Z',
    status: 'ready',
    userId: 'system',
    category: 'character',
    language: 'en',
    gender: 'male',
    accent: 'Cartoon',
    tags: ['cartoon', 'male', 'english', 'character', 'funny']
  },
  {
    id: 'pretrained_bad_bunny',
    name: 'Bad Bunny',
    description: 'Voz de reggaetón con flow característico y tono ronco',
    modelUrl: 'https://replicate.com/replicate/bad-bunny-rvc',
    sampleUrl: 'https://example.com/samples/bad_bunny_sample.wav',
    createdAt: '2024-01-01T00:00:00Z',
    status: 'ready',
    userId: 'system',
    category: 'artist',
    language: 'es',
    gender: 'male',
    accent: 'Puerto Rican',
    tags: ['reggaeton', 'male', 'spanish', 'artist', 'latin']
  },
  {
    id: 'pretrained_shakira',
    name: 'Shakira',
    description: 'Voz única con vibrato característico y tono medio',
    modelUrl: 'https://replicate.com/replicate/shakira-rvc',
    sampleUrl: 'https://example.com/samples/shakira_sample.wav',
    createdAt: '2024-01-01T00:00:00Z',
    status: 'ready',
    userId: 'system',
    category: 'artist',
    language: 'es',
    gender: 'female',
    accent: 'Colombian',
    tags: ['pop', 'female', 'spanish', 'artist', 'latin']
  },
  {
    id: 'pretrained_michael_jackson',
    name: 'Michael Jackson',
    description: 'Voz icónica con tono alto y estilo único',
    modelUrl: 'https://replicate.com/replicate/michael-jackson-rvc',
    sampleUrl: 'https://example.com/samples/michael_jackson_sample.wav',
    createdAt: '2024-01-01T00:00:00Z',
    status: 'ready',
    userId: 'system',
    category: 'artist',
    language: 'en',
    gender: 'male',
    accent: 'American',
    tags: ['pop', 'male', 'english', 'artist', 'legend']
  },
  {
    id: 'pretrained_radio_announcer',
    name: 'Locutor de Radio',
    description: 'Voz profesional clara y proyectada para narración',
    modelUrl: 'https://replicate.com/replicate/radio-announcer-rvc',
    sampleUrl: 'https://example.com/samples/radio_announcer_sample.wav',
    createdAt: '2024-01-01T00:00:00Z',
    status: 'ready',
    userId: 'system',
    category: 'generic',
    language: 'es',
    gender: 'male',
    accent: 'Neutral',
    tags: ['professional', 'male', 'spanish', 'narration', 'clear']
  },
  {
    id: 'pretrained_asistent_virtual',
    name: 'Asistente Virtual',
    description: 'Voz amigable y clara para asistentes digitales',
    modelUrl: 'https://replicate.com/replicate/virtual-assistant-rvc',
    sampleUrl: 'https://example.com/samples/virtual_assistant_sample.wav',
    createdAt: '2024-01-01T00:00:00Z',
    status: 'ready',
    userId: 'system',
    category: 'generic',
    language: 'es',
    gender: 'female',
    accent: 'Neutral',
    tags: ['assistant', 'female', 'spanish', 'clear', 'friendly']
  },
  {
    id: 'pretrained_rock_singer',
    name: 'Cantante de Rock',
    description: 'Voz potente con raspado característico del rock',
    modelUrl: 'https://replicate.com/replicate/rock-singer-rvc',
    sampleUrl: 'https://example.com/samples/rock_singer_sample.wav',
    createdAt: '2024-01-01T00:00:00Z',
    status: 'ready',
    userId: 'system',
    category: 'generic',
    language: 'en',
    gender: 'male',
    accent: 'American',
    tags: ['rock', 'male', 'english', 'powerful', 'raspy']
  },
  {
    id: 'pretrained_opera_singer',
    name: 'Cantante de Ópera',
    description: 'Voz clásica con amplio rango y vibrato controlado',
    modelUrl: 'https://replicate.com/replicate/opera-singer-rvc',
    sampleUrl: 'https://example.com/samples/opera_singer_sample.wav',
    createdAt: '2024-01-01T00:00:00Z',
    status: 'ready',
    userId: 'system',
    category: 'generic',
    language: 'it',
    gender: 'female',
    accent: 'Classical',
    tags: ['opera', 'female', 'italian', 'classical', 'powerful']
  }
];

export const VOICE_CATEGORIES = [
  { id: 'celebrity', name: 'Celebridades', icon: '⭐' },
  { id: 'character', name: 'Personajes', icon: '🎭' },
  { id: 'artist', name: 'Artistas', icon: '🎤' },
  { id: 'generic', name: 'Genéricas', icon: '🔊' }
];

export const VOICE_LANGUAGES = [
  { id: 'es', name: 'Español', flag: '🇲🇽' },
  { id: 'en', name: 'Inglés', flag: '🇺🇸' },
  { id: 'it', name: 'Italiano', flag: '🇮🇹' },
  { id: 'fr', name: 'Francés', flag: '🇫🇷' },
  { id: 'de', name: 'Alemán', flag: '🇩🇪' },
  { id: 'pt', name: 'Portugués', flag: '🇧🇷' }
];

export const VOICE_GENDERS = [
  { id: 'male', name: 'Masculino', icon: '♂️' },
  { id: 'female', name: 'Femenino', icon: '♀️' },
  { id: 'neutral', name: 'Neutral', icon: '⚧️' }
];

export function filterVoices(filters: {
  category?: string;
  language?: string;
  gender?: string;
  tags?: string[];
}): PreTrainedVoice[] {
  return PRETRAINED_VOICES.filter(voice => {
    if (filters.category && voice.category !== filters.category) return false;
    if (filters.language && voice.language !== filters.language) return false;
    if (filters.gender && voice.gender !== filters.gender) return false;
    
    if (filters.tags && filters.tags.length > 0) {
      const hasAllTags = filters.tags.every(tag => voice.tags.includes(tag));
      if (!hasAllTags) return false;
    }
    
    return true;
  });
}

export function getVoiceById(id: string): PreTrainedVoice | undefined {
  return PRETRAINED_VOICES.find(voice => voice.id === id);
}

export function getVoicesByCategory(category: string): PreTrainedVoice[] {
  return PRETRAINED_VOICES.filter(voice => voice.category === category);
}

export function searchVoices(query: string): PreTrainedVoice[] {
  const searchTerm = query.toLowerCase();
  return PRETRAINED_VOICES.filter(voice => 
    voice.name.toLowerCase().includes(searchTerm) ||
    voice.description.toLowerCase().includes(searchTerm) ||
    voice.tags.some(tag => tag.toLowerCase().includes(searchTerm))
  );
}