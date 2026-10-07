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
