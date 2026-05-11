export type ViewTab = 'inicio' | 'mv' | 'studio' | 'convertidor' | 'biblioteca' | 'perfil' | 'clonar-voz';
export type CreateMode = 'simple' | 'personalizado';
export type LibraryTab = 'canciones' | 'video' | 'vibes' | 'listas';

export interface VibeItem {
  id: string;
  name: string;
  description: string;
  image?: string;
  songUrl?: string; // or an ID reference
}

export interface SongItem {
  id: string;
  title: string;
  description?: string;
  lyrics?: string;
  style?: string[];
  genre?: string;
  isPublic?: boolean;
  publicGenre?: string | null;
  publishedAt?: string | null;
  authorName?: string;
  authorAvatarUrl?: string;
  audioUrl?: string;
  coverUrl?: string;
  createdAt?: string;
  deletedAt?: string | null;
  deletedReason?: string | null;
  sunoTaskId?: string | null;
  sunoAudioId?: string | null;
  isCover?: boolean;
}

export interface VoiceItem {
  id: string;
  name: string;
  description?: string;
  modelUrl?: string;
  sampleUrl?: string;
  createdAt: string;
  status: 'training' | 'ready' | 'failed';
  userId: string;
  profileImageUrl?: string;
  voiceProfileName?: string;
  category?: string;
  language?: string;
  gender?: string;
  accent?: string;
  tags?: string[];
  isPublic?: boolean;
}
