import { get, set } from 'idb-keyval';
import { type VibeItem, type SongItem } from '../types';

interface AppData {
  vibes: VibeItem[];
  canciones: SongItem[];
}

const defaultData: AppData = {
  vibes: [],
  canciones: []
};

// Simple hook-like or observable pattern is overkill, let's just make async getters/setters.
export const store = {
  getData: async (): Promise<AppData> => {
    try {
      const data = await get('maquetas-data');
      return data || defaultData;
    } catch {
      return defaultData;
    }
  },
  saveData: async (data: AppData) => {
    await set('maquetas-data', data);
  },
  saveAudio: async (id: string, blob: Blob) => {
    await set(`audio-${id}`, blob);
  },
  getAudio: async (id: string): Promise<Blob | undefined> => {
    return await get(`audio-${id}`);
  }
};
