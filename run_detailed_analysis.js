// Script para ejecutar análisis detallado cargando variables
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Configurar __dirname para ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Cargar variables de entorno
console.log('📁 Cargando variables de entorno...');
dotenv.config();
dotenv.config({ path: join(__dirname, '.env.local'), override: true });

// Verificar credenciales
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ ERROR: No se encontraron credenciales de Supabase');
  process.exit(1);
}

console.log('✅ Credenciales encontradas, ejecutando análisis detallado...\n');

// Importar y ejecutar el análisis
try {
  const { analyzeOtherUrls } = await import('./analyze_other_urls.js');
  // El análisis se ejecuta automáticamente al importar
} catch (error) {
  console.error('❌ Error al ejecutar el análisis:', error.message);
  process.exit(1);
}