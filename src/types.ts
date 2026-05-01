export type ViewTab = 'inicio' | 'mv' | 'studio' | 'biblioteca' | 'perfil';
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
  audioUrl?: string; // Object URL for blob
}
