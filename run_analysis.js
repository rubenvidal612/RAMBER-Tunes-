// Script para ejecutar el análisis cargando variables de entorno
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Configurar __dirname para ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Cargar variables de entorno (igual que en server.js)
console.log('📁 Cargando variables de entorno...');
dotenv.config();
dotenv.config({ path: join(__dirname, '.env.local'), override: true });

// Mostrar qué variables están configuradas
console.log('\n🔍 VARIABLES DE ENTORNO DETECTADAS:');
console.log(`   • SUPABASE_URL: ${process.env.SUPABASE_URL ? '✅ Configurada' : '❌ No configurada'}`);
console.log(`   • SUPABASE_SERVICE_ROLE_KEY: ${process.env.SUPABASE_SERVICE_ROLE_KEY ? '✅ Configurada' : '❌ No configurada'}`);
console.log(`   • NEXT_PUBLIC_SUPABASE_URL: ${process.env.NEXT_PUBLIC_SUPABASE_URL ? '✅ Configurada' : '❌ No configurada'}`);
console.log(`   • NEXT_PUBLIC_SUPABASE_ANON_KEY: ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? '✅ Configurada' : '❌ No configurada'}`);

// Intentar usar diferentes combinaciones de variables
let supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
let supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.error('\n❌ ERROR: No se encontraron credenciales de Supabase');
  console.error('   Busqué en:');
  console.error('   - SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL');
  console.error('   - SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY');
  console.error('\n   Posibles soluciones:');
  console.error('   1. Crear archivo .env.local con las credenciales');
  console.error('   2. Configurar variables de entorno en el sistema');
  console.error('   3. Usar las credenciales de Vercel');
  process.exit(1);
}

console.log('\n✅ Credenciales encontradas, ejecutando análisis...');

// Importar y ejecutar el análisis
try {
  const { analyzeAudioUrls } = await import('./analyze_audio_simple.js');
  // El análisis se ejecuta automáticamente al importar
} catch (error) {
  console.error('❌ Error al ejecutar el análisis:', error.message);
  process.exit(1);
}