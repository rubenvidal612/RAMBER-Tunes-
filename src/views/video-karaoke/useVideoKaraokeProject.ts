import { useState } from 'react';

export type KaraokeFormat = '16:9' | '9:16' | '1:1';

export function useVideoKaraokeProject() {
  const [step, setStep] = useState(1);
  const [format, setFormat] = useState<KaraokeFormat>('16:9');
  const [preset, setPreset] = useState('Neon');

  return { step, setStep, format, setFormat, preset, setPreset };
}
