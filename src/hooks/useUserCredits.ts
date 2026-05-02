import { useState, useEffect } from 'react';
import { creditsFromProfile } from '@/lib/credits';
import { supabaseBrowser, ensureAnonSession } from '@/lib/supabaseBrowser';

// Hook personalizado para manejar los créditos del usuario
export function useUserCredits() {
  const [credits, setCredits] = useState(0);
  const [loading, setLoading] = useState(false);

  const refreshCredits = async () => {
    if (!supabaseBrowser) return;
    setLoading(true);
    try {
      const s = await ensureAnonSession();
      if (!s.ok) return;
      const { data } = await supabaseBrowser.auth.getUser();
      const user = data?.user;
      if (!user) return;
      const { data: profile } = await supabaseBrowser.from('profiles').select('id, song_balance, ramber_credits').eq('id', user.id).maybeSingle();
      if (profile) setCredits(creditsFromProfile(profile));
    } finally {
      setLoading(false);
    }
  };

  // Función para consumir créditos
  const consumeCredits = (amount: number) => {
    if (credits >= amount) {
      setCredits(prev => prev - amount);
      return true;
    }
    return false;
  };

  // Función para agregar créditos
  const addCredits = (amount: number) => {
    setCredits(prev => prev + amount);
  };

  useEffect(() => {
    refreshCredits().catch(() => {});
  }, []);

  return {
    credits,
    loading,
    refreshCredits,
    consumeCredits,
    addCredits
  };
}
