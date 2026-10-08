# Voice clone availability correction — 2026-10-08

## Baseline and rollback

- Repository: rubenvidal612/RAMBER-Tunes-
- Live baseline: `1eb83c41e6b91e6af1e28c12f1d10320aad6014a`.
- Retained Git tag: `backup/pre-voice-fix-live-20261008`.
- Previous production deployment: `dpl_ArL6XLa2LsyMQKPUfuftMftBDiP9`.
- Working branch: `fix/voice-expiry-20261008`.
- The unrelated, unpublished direct-Suno-audio work on local main (`d43350e`) is preserved separately, not included in this fix.

To roll back, redeploy the baseline commit / previous Vercel deployment, or revert this PR. No database migration or deletion is part of this change. Availability status updates retain profile IDs, names, metadata, tasks and history. A renewed provider confirmation can restore a saved voice to ready; no local expiry timestamp can reactivate a provider-rejected voice.

## Evidence

Read-only checks on 2026-10-08 found records with status=success and voiceId alongside errorCode=400 and an explicit expiry message. One returned availability=false; two others returned availability=true, contradicting the record. Existing generation results corroborate actual rejection (SENSITIVE_WORD_ERROR / 553 with the voice-expired message), including one approximately three minutes after profile creation. Parameters used model V6, the correct saved personaId and personaModel voice_persona. Failed tasks already show consumed=false; no manual credit adjustment was made. Identifiers and user names are kept out of this repository report.

The current provider documentation describes checking the final voiceId and availability, but does not specify a four-day voice lifetime:

- https://docs.sunoapi.org/suno-api/suno-voice-record-info
- https://docs.sunoapi.org/suno-api/suno-voice-check-voice

Do not promise 24 hours, four days or fourteen days for voice profiles. The 24-hour timer belongs to a separate legacy bot flow, not the suno_voices records above. The provider's audio-file retention is not a voice-profile lifetime.

## Changes

- Validate current record errors, ID and explicit availability together; success cannot hide an expiry error.
- Recheck saved voice ownership and readiness on generate, extend and upload-cover, before credit charging, audio preparation or generation.
- Refresh the actual ApprovedCreatePreview picker; reject stale cached readiness and disable unavailable profiles.
- The actual clone wizard no longer advances or offers Save and Use until availability is confirmed. Recovered results keep their taskId for future checks.
- Provider outages fail closed for the current request without persisting a fictitious permanent expiry.
- Preserve all existing audio, profiles and history. No storage cleanup, plan change or new paid real generation was performed for testing.

## Verification

- Node tests: voice-availability, voice-readiness, voice-api-guard and pending-task; 18 passing.
- API integration tests invoke the real route handler with mocked HTTP services: expired voices blocked before credit/storage/generation calls on all three routes; ready voice reaches generation with IDs unchanged; outage does not mark it expired.
- Browser test uses an isolated fake session and mocked APIs, not a real account: two expired voices disabled, a confirmed voice selectable.
- Production Vite build passes.
- Full TypeScript check has existing failures; comparative compiler check: baseline 305 diagnostics, changed tree 302, no new diagnostic messages. This is not a clean whole-project type check.

## Remaining provider limitation

This application fix does not revive rejected profiles upstream or prove a four-day lifetime. The provider explicitly requests recreation or another voice; the owner must complete a new legitimate phrase verification, or Suno API support must restore the profiles. A private support report may include task IDs, timestamps and contradictory responses, never API keys or recordings without consent.
