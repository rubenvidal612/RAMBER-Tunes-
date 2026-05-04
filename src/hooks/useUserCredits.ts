import { useState, useEffect } from 'react';
import { getAccessToken, supabaseBrowser } from '@/lib/supabaseBrowser';

// Hook personalizado para manejar los créditos del usuario
export function useUserCredits() {
  const [credits, setCredits] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const refreshCredits = async () => {
    setLoading(true);
    try {
      const t = await getAccessToken();
      if (!t.ok) {
        setError(t.error || 'No se pudo iniciar sesión.');
        return;
      }
      const r = await fetch('/api/account/balance', {
        headers: { authorization: `Bearer ${t.token}` },
      });
      const out = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError((out?.error || 'No pude consultar el saldo.').toString());
        return;
      }
      const c = Number(out?.credits);
      if (Number.isFinite(c)) setCredits(c);
      setError('');
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

    const { data } = supabaseBrowser?.auth.onAuthStateChange(() => {
      refreshCredits().catch(() => {});
    }) ?? { data: null as any };

    const interval = window.setInterval(() => {
      refreshCredits().catch(() => {});
    }, 30000);

    return () => {
      data?.subscription?.unsubscribe();
      window.clearInterval(interval);
    };
  }, []);

  return {
    credits,
    loading,
    error,
    refreshCredits,
    consumeCredits,
    addCredits
  };
}
