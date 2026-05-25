import { useState, useEffect } from 'react';
import { getAccessToken, supabaseBrowser } from '@/lib/supabaseBrowser';

// Hook personalizado para manejar los créditos del usuario
export function useUserCredits() {
  const [credits, setCredits] = useState(0);
  const [internalCredits, setInternalCredits] = useState<number | null>(null);
  const [providerCredits, setProviderCredits] = useState<number | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [source, setSource] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const cacheKey = 'ramber.cached_balance_v1';

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
      const ic = Number(out?.internal_credits);
      setInternalCredits(Number.isFinite(ic) ? ic : null);
      const pc = Number(out?.provider_credits);
      setProviderCredits(Number.isFinite(pc) ? pc : null);
      setIsAdmin(Boolean(out?.is_admin));
      setSource(String(out?.source || ''));
      setError('');
      try {
        window.localStorage.setItem(
          cacheKey,
          JSON.stringify({
            credits: Number.isFinite(c) ? c : null,
            internal_credits: Number.isFinite(ic) ? ic : null,
            provider_credits: Number.isFinite(pc) ? pc : null,
            is_admin: Boolean(out?.is_admin),
            source: String(out?.source || ''),
            saved_at: new Date().toISOString(),
          }),
        );
      } catch {
      }
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
    try {
      const raw = window.localStorage.getItem(cacheKey);
      if (raw) {
        const cached: any = JSON.parse(raw);
        const c = Number(cached?.credits);
        if (Number.isFinite(c) && c >= 0) setCredits(c);
        const ic = Number(cached?.internal_credits);
        setInternalCredits(Number.isFinite(ic) ? ic : null);
        const pc = Number(cached?.provider_credits);
        setProviderCredits(Number.isFinite(pc) ? pc : null);
        setIsAdmin(Boolean(cached?.is_admin));
        setSource(String(cached?.source || ''));
      }
    } catch {
    }
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
    internalCredits,
    providerCredits,
    isAdmin,
    source,
    loading,
    error,
    refreshCredits,
    consumeCredits,
    addCredits
  };
}
