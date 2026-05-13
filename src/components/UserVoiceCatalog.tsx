import { useState, useEffect, type FormEvent } from 'react';
import { VoiceItem } from '@/types';
import { Search, Filter, Star, Play, User, Globe, Music, Heart } from 'lucide-react';
import { cn } from '@/lib/utils';

interface UserVoiceCatalogProps {
  className?: string;
  onSelectVoice?: (voiceId: string) => void;
  selectedVoiceId?: string;
}

interface CatalogFilters {
  category: string;
  language: string;
  gender: string;
  search: string;
}

const CATEGORIES = [
  { value: 'all', label: 'Todas las categorías' },
  { value: 'personal', label: 'Personales' },
  { value: 'celebrity', label: 'Celebridades' },
  { value: 'character', label: 'Personajes' },
  { value: 'professional', label: 'Profesionales' },
  { value: 'ai', label: 'IA Generada' }
];

const LANGUAGES = [
  { value: 'all', label: 'Todos los idiomas' },
  { value: 'es', label: 'Español' },
  { value: 'en', label: 'Inglés' },
  { value: 'fr', label: 'Francés' },
  { value: 'pt', label: 'Portugués' },
  { value: 'de', label: 'Alemán' },
  { value: 'it', label: 'Italiano' },
  { value: 'ja', label: 'Japonés' },
  { value: 'ko', label: 'Coreano' },
  { value: 'zh', label: 'Chino' }
];

const GENDERS = [
  { value: 'all', label: 'Todos los géneros' },
  { value: 'male', label: 'Masculino' },
  { value: 'female', label: 'Femenino' },
  { value: 'neutral', label: 'Neutral' },
  { value: 'unknown', label: 'No especificado' }
];

export function UserVoiceCatalog({ className, onSelectVoice, selectedVoiceId }: UserVoiceCatalogProps) {
  const [voices, setVoices] = useState<VoiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState<CatalogFilters>({
    category: 'all',
    language: 'all',
    gender: 'all',
    search: ''
  });
  const [totalVoices, setTotalVoices] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(12);
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  const loadCatalog = async () => {
    try {
      setLoading(true);
      setError('');

      const queryParams = new URLSearchParams();
      if (filters.category !== 'all') queryParams.append('category', filters.category);
      if (filters.language !== 'all') queryParams.append('language', filters.language);
      if (filters.gender !== 'all') queryParams.append('gender', filters.gender);
      if (filters.search) queryParams.append('search', filters.search);
      queryParams.append('limit', pageSize.toString());
      queryParams.append('offset', ((page - 1) * pageSize).toString());

      const response = await fetch(`/api/voices/catalog?${queryParams}`);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Error al cargar el catálogo');
      }

      const data = await response.json();
      setVoices(data.voices || []);
      setTotalVoices(data.total || 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
      console.error('Error loading voice catalog:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCatalog();
  }, [filters, page]);

  const handleFilterChange = (key: keyof CatalogFilters, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPage(1); // Reset to first page when filters change
  };

  const handleSearch = (e: FormEvent) => {
    e.preventDefault();
    loadCatalog();
  };

  const toggleFavorite = (voiceId: string) => {
    const newFavorites = new Set(favorites);
    if (newFavorites.has(voiceId)) {
      newFavorites.delete(voiceId);
    } else {
      newFavorites.add(voiceId);
    }
    setFavorites(newFavorites);
  };

  const playVoice = (voice: VoiceItem) => {
    if (playingVoiceId === voice.id) {
      setPlayingVoiceId(null);
      return;
    }
    
    if (voice.sampleUrl) {
      setPlayingVoiceId(voice.id);
      // Aquí iría la lógica para reproducir el audio
      const audio = new Audio(voice.sampleUrl);
      audio.play();
      audio.onended = () => setPlayingVoiceId(null);
    }
  };

  const totalPages = Math.ceil(totalVoices / pageSize);

  return (
    <div className={cn("bg-[#0b0f16] border border-white/10 rounded-2xl p-6", className)}>
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-500/20 to-emerald-500/20 border border-white/10 flex items-center justify-center">
            <Globe className="w-6 h-6 text-emerald-300" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white">Catálogo de Voces</h2>
            <p className="text-slate-400 text-sm">
              Explora voces clonadas creadas por usuarios de la comunidad
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-6 mt-4">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
            <span className="text-slate-300 text-sm">
              <span className="font-bold text-white">{totalVoices}</span> voces disponibles
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-purple-500"></div>
            <span className="text-slate-300 text-sm">
              <span className="font-bold text-white">{favorites.size}</span> favoritos
            </span>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-8">
        <form onSubmit={handleSearch} className="space-y-4">
          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-500" />
            <input
              type="text"
              value={filters.search}
              onChange={(e) => handleFilterChange('search', e.target.value)}
              placeholder="Buscar voces por nombre, descripción o etiquetas..."
              className="w-full bg-white/5 border border-white/10 rounded-2xl pl-12 pr-4 py-3 text-white placeholder-slate-500 outline-none focus:border-emerald-500/50 transition-colors"
            />
          </div>

          {/* Filter Row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-300 mb-2">
                <Filter className="w-4 h-4 inline mr-2" />
                Categoría
              </label>
              <select
                value={filters.category}
                onChange={(e) => handleFilterChange('category', e.target.value)}
                style={{ colorScheme: 'dark' }}
                className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-white outline-none focus:border-emerald-500/50 transition-colors"
              >
                {CATEGORIES.map(cat => (
                  <option key={cat.value} value={cat.value} className="bg-[#0b0f16] text-slate-200">
                    {cat.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-300 mb-2">
                <Globe className="w-4 h-4 inline mr-2" />
                Idioma
              </label>
              <select
                value={filters.language}
                onChange={(e) => handleFilterChange('language', e.target.value)}
                style={{ colorScheme: 'dark' }}
                className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-white outline-none focus:border-emerald-500/50 transition-colors"
              >
                {LANGUAGES.map(lang => (
                  <option key={lang.value} value={lang.value} className="bg-[#0b0f16] text-slate-200">
                    {lang.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-300 mb-2">
                <User className="w-4 h-4 inline mr-2" />
                Género
              </label>
              <select
                value={filters.gender}
                onChange={(e) => handleFilterChange('gender', e.target.value)}
                style={{ colorScheme: 'dark' }}
                className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-white outline-none focus:border-emerald-500/50 transition-colors"
              >
                {GENDERS.map(gen => (
                  <option key={gen.value} value={gen.value} className="bg-[#0b0f16] text-slate-200">
                    {gen.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </form>
      </div>

      {/* Error Message */}
      {error && (
        <div className="glass-card rounded-2xl p-4 border border-red-500/30 text-red-200 text-sm mb-6">
          {error}
        </div>
      )}

      {/* Loading State */}
      {loading && voices.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-12 h-12 rounded-full border-2 border-emerald-500/30 border-t-emerald-500 animate-spin"></div>
          <span className="ml-4 text-slate-400">Cargando catálogo de voces...</span>
        </div>
      ) : voices.length === 0 ? (
        <div className="glass-card rounded-2xl p-8 text-center border border-white/10">
          <Music className="w-16 h-16 text-slate-500 mx-auto mb-4" />
          <div className="text-white font-bold text-lg mb-2">No se encontraron voces</div>
          <div className="text-slate-400 text-sm">
            Intenta cambiar los filtros o crear tu propia voz
          </div>
        </div>
      ) : (
        <>
          {/* Voice Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            {voices.map((voice) => (
              <div
                key={voice.id}
                className={cn(
                  "glass-card rounded-2xl border transition-all duration-300 hover:scale-[1.02] hover:border-emerald-500/30",
                  selectedVoiceId === voice.id && "border-emerald-500/50 bg-emerald-500/5"
                )}
              >
                {/* Voice Image */}
                <div className="relative h-48 rounded-t-2xl overflow-hidden">
                  {voice.profileImageUrl ? (
                    <img
                      src={voice.profileImageUrl}
                      alt={voice.voiceProfileName || voice.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-purple-500/20 to-emerald-500/20 flex items-center justify-center">
                      <User className="w-16 h-16 text-slate-500" />
                    </div>
                  )}
                  
                  {/* Favorite Button */}
                  <button
                    onClick={() => toggleFavorite(voice.id)}
                    className="absolute top-3 right-3 w-10 h-10 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center hover:bg-black/70 transition-colors"
                  >
                    <Heart
                      className={cn(
                        "w-5 h-5 transition-colors",
                        favorites.has(voice.id)
                          ? "text-red-500 fill-red-500"
                          : "text-white"
                      )}
                    />
                  </button>

                  {/* Play Button */}
                  <button
                    onClick={() => playVoice(voice)}
                    className="absolute bottom-3 right-3 w-12 h-12 rounded-full bg-emerald-500 hover:bg-emerald-600 flex items-center justify-center transition-colors"
                  >
                    {playingVoiceId === voice.id ? (
                      <div className="w-3 h-3 bg-white rounded-sm"></div>
                    ) : (
                      <Play className="w-5 h-5 text-white ml-0.5" />
                    )}
                  </button>

                  {/* Category Badge */}
                  {voice.category && voice.category !== 'personal' && (
                    <div className="absolute top-3 left-3 px-3 py-1 rounded-full bg-black/50 backdrop-blur-sm text-xs font-semibold text-white">
                      {voice.category}
                    </div>
                  )}
                </div>

                {/* Voice Info */}
                <div className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="min-w-0">
                      <h3 className="text-white font-bold text-lg truncate">
                        {voice.voiceProfileName || voice.name}
                      </h3>
                      <p className="text-slate-400 text-sm truncate">
                        {voice.description || 'Sin descripción'}
                      </p>
                    </div>
                    
                    {voice.isPublic && (
                      <div className="flex items-center gap-1 text-xs text-emerald-400">
                        <Globe className="w-3 h-3" />
                        <span>Pública</span>
                      </div>
                    )}
                  </div>

                  {/* Tags */}
                  {voice.tags && voice.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-3">
                      {voice.tags.slice(0, 3).map((tag, index) => (
                        <span
                          key={index}
                          className="px-2 py-1 rounded-full bg-white/5 text-xs text-slate-400"
                        >
                          {tag}
                        </span>
                      ))}
                      {voice.tags.length > 3 && (
                        <span className="px-2 py-1 rounded-full bg-white/5 text-xs text-slate-400">
                          +{voice.tags.length - 3}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Metadata */}
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <div className="flex items-center gap-4">
                      <span className="flex items-center gap-1">
                        <User className="w-3 h-3" />
                        {voice.gender === 'male' ? 'Hombre' : 
                         voice.gender === 'female' ? 'Mujer' : 
                         voice.gender === 'neutral' ? 'Neutral' : 'No especificado'}
                      </span>
                      <span className="flex items-center gap-1">
                        <Globe className="w-3 h-3" />
                        {voice.language === 'es' ? 'ES' : 
                         voice.language === 'en' ? 'EN' : 
                         voice.language === 'fr' ? 'FR' : 
                         voice.language === 'pt' ? 'PT' : voice.language?.toUpperCase()}
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-1">
                      <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
                      <span>4.8</span>
                    </div>
                  </div>

                  {/* Select Button */}
                  {onSelectVoice && (
                    <button
                      onClick={() => onSelectVoice(voice.id)}
                      className={cn(
                        "w-full mt-4 py-2 rounded-xl font-semibold transition-colors",
                        selectedVoiceId === voice.id
                          ? "bg-emerald-500 hover:bg-emerald-600 text-white"
                          : "bg-white/5 hover:bg-white/10 text-slate-300"
                      )}
                    >
                      {selectedVoiceId === voice.id ? 'Seleccionada' : 'Seleccionar'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => setPage(prev => Math.max(1, prev - 1))}
                disabled={page === 1}
                className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Anterior
              </button>
              
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum = i + 1;
                  if (totalPages > 5) {
                    if (page <= 3) pageNum = i + 1;
                    else if (page >= totalPages - 2) pageNum = totalPages - 4 + i;
                    else pageNum = page - 2 + i;
                  }
                  
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setPage(pageNum)}
                      className={cn(
                        "w-10 h-10 rounded-xl font-semibold transition-colors",
                        page === pageNum
                          ? "bg-emerald-500 text-white"
                          : "bg-white/5 hover:bg-white/10 text-slate-300"
                      )}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>
              
              <button
                onClick={() => setPage(prev => Math.min(totalPages, prev + 1))}
                disabled={page === totalPages}
                className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Siguiente
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
