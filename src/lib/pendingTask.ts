export function readSunoTaskState(payload: any) {
  let data = payload;
  for (let depth = 0; depth < 5 && data && typeof data === 'object'; depth++) {
    if (data.status != null || data.successFlag != null) {
      const status = String(data.status ?? data.successFlag).trim().toUpperCase();
      return {
        status,
        failed: /(?:^|_)(?:FAIL|FAILED|FAILURE|ERROR|EXCEPTION)(?:_|$)/.test(status) || /^(?:CANCELLED|CANCELED)$/.test(status),
        error: String(data.errorMessage || data.error_message || data.message || 'Error en la generación'),
      };
    }
    data = data.data;
  }
  throw new Error('No se recibió un estado válido del proveedor. La tarea sigue guardada; vuelve a actualizar.');
}

export function removePendingTask<T extends {taskId: string}>(tasks: T[], taskId: string): T[] {
  return tasks.filter(task => task.taskId !== taskId);
}

export async function fetchPendingTaskJson(url: string, headers: Record<string, string>, fetcher: typeof fetch = fetch) {
  const response = await fetcher(url, { headers, cache: 'no-store', signal: AbortSignal.timeout(55_000) });
  const result = await response.json();
  if (!response.ok) {
    const error = new Error(String(result?.detail || result?.error || result?.message || `HTTP ${response.status}`));
    Object.assign(error, {httpStatus: response.status});
    throw error;
  }
  return result;
}
