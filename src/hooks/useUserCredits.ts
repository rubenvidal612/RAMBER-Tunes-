import { useState, useEffect } from 'react';
import { creditsFromProfile } from '@/lib/credits';

// Hook personalizado para manejar los créditos del usuario
export function useUserCredits() {
  const [credits, setCredits] = useState(5100); // Valor por defecto temporal
  const [loading, setLoading] = useState(false);

  // Función para cargar créditos del perfil (cuando tengamos backend)
  const loadCredits = async (profile: any) => {
    if (profile) {
      const userCredits = creditsFromProfile(profile);
      setCredits(userCredits);
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

  return {
    credits,
    loading,
    loadCredits,
    consumeCredits,
    addCredits
  };
}