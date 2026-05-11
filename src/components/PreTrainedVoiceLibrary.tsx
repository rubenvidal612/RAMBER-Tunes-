import { useState, useMemo } from 'react';
import { Search, Filter, Star, Music, Mic, Globe, Users, Play, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { 
  PRETRAINED_VOICES, 
  VOICE_CATEGORIES, 
  VOICE_LANGUAGES, 
  VOICE_GENDERS,
  PreTrainedVoice,
  filterVoices,
  searchVoices 
} from '@/lib/preTrainedVoices';

interface PreTrainedVoiceLibraryProps {
  onSelectVoice?: (voiceId: string) => void;
  selectedVoiceId?: string;
  className?: string;
}

export function PreTrainedVoiceLibrary({ 
  onSelectVoice, 
  selectedVoiceId, 
  className 
}: PreTrainedVoiceLibraryProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedLanguage, setSelectedLanguage] = useState<string>('');
  const [selectedGender, setSelectedGender] = useState<string>('');
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);

  // Filtrar voces basadas en los filtros activos
  const filteredVoices = useMemo(() => {
    let voices = PRETRAINED_VOICES;
    
    // Aplicar búsqueda si hay query
    if (searchQuery.trim()) {
      voices = searchVoices(searchQuery);
    }
    
    // Aplicar filtros
    const filters: any = {};
    if (selectedCategory) filters.category = selectedCategory;
    if (selectedLanguage) filters.language = selectedLanguage;
    if (selectedGender) filters.gender = selectedGender;
    
    if (Object.keys(filters).length > 0) {
      voices = filterVoices(filters);
    }
    
    return voices;
  }, [searchQuery, selectedCategory, selectedLanguage, selectedGender]);

  const handlePlaySample = (voice: PreTrainedVoice) => {
    if (!voice.sampleUrl) return;
    
    // Detener reproducción actual si hay una
    if (playingVoiceId) {
      // Aquí iría la lógica para detener el audio
      setPlayingVoiceId(null);
    }
    
    // Simular reproducción
    setPlayingVoiceId(voice.id);
    
    // Simular que el audio se detiene después de 5 segundos
    setTimeout(() => {
      setPlayingVoiceId(null);
    }, 5000);
  };

  const handleSelectVoice = (voiceId: string) => {
    if (onSelectVoice) {
      onSelectVoice(voiceId);
    }
  };

  const clearFilters = () => {
    setSearchQuery('');
    setSelectedCategory('');
    setSelectedLanguage('');
    setSelectedGender('');
  };

  const getCategoryIcon = (categoryId: string) => {
    const category = VOICE_CATEGORIES.find(c => c.id === categoryId);
    return category?.icon || '🔊';
  };

  const getLanguageFlag = (languageId: string) => {
    const language = VOICE_LANGUAGES.find(l => l.id === languageId);
    return language?.flag || '🌐';
  };

  const getGenderIcon = (genderId: string) => {
    const gender = VOICE_GENDERS.find(g => g.id === genderId);
    return gender?.icon || '⚧️';
  };

  return (
    <div className={cn("bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-6 shadow-2xl border border-slate-700", className)}>
      {/* Encabezado */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold text-white flex items-center gap-3">
              <Star className="w-6 h-6 text-yellow-400" />
              Biblioteca de Voces Pre-entrenadas
            </h2>
            <p className="text-slate-400 mt-2">
              Selecciona entre una variedad de voces profesionales para usar en tus canciones
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-white font-bold text-xl">{filteredVoices.length}</div>
              <div className="text-slate-400 text-sm">Voces disponibles</div>
            </div>
          </div>
        </div>

        {/* Barra de búsqueda */}
        <div className="relative mb-6">
          <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Buscar voces por nombre, descripción o etiquetas..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-slate-800/50 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-4 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-white"
            >
              ✕
            </button>
          )}
        </div>

        {/* Filtros */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white font-bold flex items-center gap-2">
              <Filter className="w-4 h-4" />
              Filtros
            </h3>
            {(selectedCategory || selectedLanguage || selectedGender || searchQuery) && (
              <button
                onClick={clearFilters}
                className="text-sm text-slate-400 hover:text-white transition-colors"
              >
                Limpiar filtros
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Categorías */}
            <div>
              <label className="block text-slate-300 text-sm mb-2">Categoría</label>
              <div className="flex flex-wrap gap-2">
                {VOICE_CATEGORIES.map(category => (
                  <button
                    key={category.id}
                    onClick={() => setSelectedCategory(
                      selectedCategory === category.id ? '' : category.id
                    )}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5",
                      selectedCategory === category.id
                        ? "bg-purple-500 text-white"
                        : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                    )}
                  >
                    <span>{category.icon}</span>
                    {category.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Idiomas */}
            <div>
              <label className="block text-slate-300 text-sm mb-2">Idioma</label>
              <div className="flex flex-wrap gap-2">
                {VOICE_LANGUAGES.map(language => (
                  <button
                    key={language.id}
                    onClick={() => setSelectedLanguage(
                      selectedLanguage === language.id ? '' : language.id
                    )}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5",
                      selectedLanguage === language.id
                        ? "bg-blue-500 text-white"
                        : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                    )}
                  >
                    <span>{language.flag}</span>
                    {language.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Género */}
            <div>
              <label className="block text-slate-300 text-sm mb-2">Género</label>
              <div className="flex flex-wrap gap-2">
                {VOICE_GENDERS.map(gender => (
                  <button
                    key={gender.id}
                    onClick={() => setSelectedGender(
                      selectedGender === gender.id ? '' : gender.id
                    )}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5",
                      selectedGender === gender.id
                        ? "bg-pink-500 text-white"
                        : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                    )}
                  >
                    <span>{gender.icon}</span>
                    {gender.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Lista de voces */}
      <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
        {filteredVoices.length === 0 ? (
          <div className="text-center py-12">
            <Search className="w-16 h-16 text-slate-600 mx-auto mb-4" />
            <h3 className="text-white text-xl font-bold mb-2">No se encontraron voces</h3>
            <p className="text-slate-400">
              Intenta con otros términos de búsqueda o ajusta los filtros
            </p>
            <button
              onClick={clearFilters}
              className="mt-4 px-6 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-full font-bold hover:from-purple-700 hover:to-blue-700 transition-all"
            >
              Mostrar todas las voces
            </button>
          </div>
        ) : (
          filteredVoices.map(voice => (
            <div
              key={voice.id}
              className={cn(
                "bg-slate-800/30 rounded-xl p-4 border transition-all hover:border-slate-600",
                selectedVoiceId === voice.id
                  ? "border-emerald-500 bg-emerald-500/10"
                  : "border-slate-700"
              )}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{getCategoryIcon(voice.category)}</span>
                      <h4 className="text-white font-bold text-lg truncate">{voice.name}</h4>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <span className="text-sm bg-slate-700/50 px-2 py-0.5 rounded">
                        {getLanguageFlag(voice.language)}
                      </span>
                      <span className="text-sm bg-slate-700/50 px-2 py-0.5 rounded">
                        {getGenderIcon(voice.gender)}
                      </span>
                    </div>
                  </div>

                  <p className="text-slate-300 mb-3">{voice.description}</p>

                  <div className="flex flex-wrap gap-2 mb-4">
                    {voice.tags.slice(0, 5).map(tag => (
                      <span
                        key={tag}
                        className="text-xs bg-slate-700/50 text-slate-300 px-2 py-1 rounded"
                      >
                        {tag}
                      </span>
                    ))}
                    {voice.tags.length > 5 && (
                      <span className="text-xs bg-slate-700/50 text-slate-300 px-2 py-1 rounded">
                        +{voice.tags.length - 5}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-4 text-sm text-slate-400">
                    <div className="flex items-center gap-1">
                      <Music className="w-4 h-4" />
                      <span>{voice.category}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Globe className="w-4 h-4" />
                      <span>{voice.language.toUpperCase()}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Users className="w-4 h-4" />
                      <span>{voice.gender}</span>
                    </div>
                    {voice.accent && (
                      <div className="flex items-center gap-1">
                        <Mic className="w-4 h-4" />
                        <span>{voice.accent}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 ml-4">
                  {voice.sampleUrl && (
                    <button
                      onClick={() => handlePlaySample(voice)}
                      disabled={playingVoiceId === voice.id}
                      className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-200 hover:bg-white/10 transition-colors disabled:opacity-50"
                      title="Escuchar muestra"
                    >
                      {playingVoiceId === voice.id ? (
                        <div className="w-4 h-4 bg-emerald-500 rounded-sm animate-pulse" />
                      ) : (
                        <Play className="w-4 h-4" />
                      )}
                    </button>
                  )}

                  <button
                    onClick={() => handleSelectVoice(voice.id)}
                    className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center transition-colors",
                      selectedVoiceId === voice.id
                        ? "bg-emerald-500 text-white"
                        : "bg-white/5 border border-white/10 text-slate-200 hover:bg-white/10"
                    )}
                    title={selectedVoiceId === voice.id ? "Seleccionada" : "Seleccionar"}
                  >
                    {selectedVoiceId === voice.id ? (
                      <Check className="w-5 h-5" />
                    ) : (
                      <div className="w-3 h-3 rounded-full bg-current" />
                    )}
                  </button>
                </div>
              </div>

              {playingVoiceId === voice.id && (
                <div className="mt-4 flex items-center gap-3">
                  <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 animate-pulse w-1/2"></div>
                  </div>
                  <span className="text-sm text-emerald-400">Reproduciendo muestra...</span>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Estadísticas */}
      <div className="mt-8 pt-6 border-t border-slate-700">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-white">
              {PRETRAINED_VOICES.filter(v => v.category === 'celebrity').length}
            </div>
            <div className="text-slate-400 text-sm">Celebridades</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-white">
              {PRETRAINED_VOICES.filter(v => v.category === 'artist').length}
            </div>
            <div className="text-slate-400 text-sm">Artistas</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-white">
              {PRETRAINED_VOICES.filter(v => v.language === 'es').length}
            </div>
            <div className="text-slate-400 text-sm">Español</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-white">
              {PRETRAINED_VOICES.filter(v => v.language === 'en').length}
            </div>
            <div className="text-slate-400 text-sm">Inglés</div>
          </div>
        </div>
      </div>
    </div>
  );
}