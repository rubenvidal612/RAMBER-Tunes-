import { VideoKaraokePreview } from '../VideoKaraokePreview';

export function KaraokeWizard({ credits }: { credits?: number }) {
  return <VideoKaraokePreview credits={credits} />;
}
