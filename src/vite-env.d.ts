// Declaraciones para imports propios de Vite.
// Importar un archivo como texto crudo con el sufijo ?raw devuelve un string.
// Sin esta declaración, TypeScript marca el import como "módulo no encontrado" (TS2307).
declare module '*?raw' {
  const src: string;
  export default src;
}
