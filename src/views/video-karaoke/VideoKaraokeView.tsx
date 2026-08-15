import { KaraokeWizard } from './KaraokeWizard';

export function VideoKaraokeView({ credits }: { credits?: number }) {
  return <KaraokeWizard credits={credits} />;
}
