// Provider responses can contain booleans or serialized booleans. Unknown values
// must never make an unconfirmed voice usable.
export function isVoiceAvailable(value: unknown): boolean {
  return value === true || value === 'true';
}

export function requireVoiceAvailable(value: unknown): void {
  if (!isVoiceAvailable(value)) {
    throw new Error('El proveedor todavía no confirmó que esta voz esté disponible. No se generó la canción. Vuelve a comprobarla más tarde; si sigue fallando, repite la validación de la voz.');
  }
}

export type VoiceReadiness = {
  status: 'ready' | 'processing' | 'unavailable' | 'expired' | 'failed' | 'unconfirmed';
  isAvailable: boolean;
  reason: string;
  checkedAt: string;
};

// A successful creation status describes the original task, not necessarily the
// current voice. Suno can return success + voiceId + an expiry error together.
export function voiceRecordError(record: any): string {
  const code = Number(record?.errorCode);
  const message = String(record?.errorMessage || '').trim();
  if ((Number.isFinite(code) && code !== 0 && code !== 200) || (message && !/^success$/i.test(message))) {
    return message || `Error de voz del proveedor (${code}).`;
  }
  return '';
}

export async function inspectVoiceReadiness(
  taskId: string,
  expectedVoiceId: string | undefined,
  fetchProvider: (path: string, init?: RequestInit) => Promise<any>,
): Promise<VoiceReadiness> {
  const checkedAt = new Date().toISOString();
  const result = (status: VoiceReadiness['status'], reason = ''): VoiceReadiness =>
    ({ status, isAvailable: status === 'ready', reason, checkedAt });
  if (!taskId) return result('unconfirmed', 'Falta la tarea de creación de esta voz. Repite su validación.');
  const record = await fetchProvider(`/api/v1/voice/record-info?taskId=${encodeURIComponent(taskId)}`, { method: 'GET' });
  if (!record.res.ok || Number(record.data?.code) !== 200) throw new Error('No se pudo comprobar el registro de voz con Suno. Intenta más tarde.');
  const info = record.data?.data;
  const error = voiceRecordError(info);
  if (error) return result(/expir/i.test(error) ? 'expired' : 'failed', error);
  if (info?.status === 'fail' || info?.status === 'processing_validate_fail') return result('failed', 'Suno rechazó la verificación de voz.');
  if (info?.status !== 'success' || !info?.voiceId) return result('processing', 'Suno aún está verificando esta voz.');
  if (expectedVoiceId && info.voiceId !== expectedVoiceId) return result('unconfirmed', 'El identificador guardado no coincide con la voz confirmada por Suno.');
  const check = await fetchProvider('/api/v1/voice/check-voice', { method: 'POST', body: JSON.stringify({ task_id: taskId }) });
  if (!check.res.ok || Number(check.data?.code) !== 200) throw new Error('No se pudo comprobar la disponibilidad con Suno. Intenta más tarde.');
  return isVoiceAvailable(check.data?.data?.isAvailable)
    ? result('ready')
    : result('unavailable', 'Suno no permite usar esta voz en este momento. Vuelve a comprobarla o repite su validación.');
}

export function requireVoiceReady(state: VoiceReadiness): void {
  if (state.isAvailable && state.status === 'ready') return;
  const message = state.status === 'expired'
    ? 'Suno informa que esta voz expiró. Conservamos tu perfil, pero debes repetir la validación en el Clonador. No se generó ni se cobró la canción.'
    : `${state.reason || 'Suno no confirmó que esta voz esté disponible.'} No se generó ni se cobró la canción.`;
  throw Object.assign(new Error(message), { httpStatus: 409, code: `VOICE_${state.status.toUpperCase()}` });
}
