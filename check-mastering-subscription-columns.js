// Script para verificar y agregar columnas de suscripción de masterización en Supabase
// Ejecuta estos comandos en el editor SQL de Supabase

console.log('=== VERIFICACIÓN DE COLUMNAS PARA MASTERIZAR ILIMITADO ===\n');

console.log('Para agregar las columnas necesarias, ejecuta estos comandos en el editor SQL de Supabase:\n');

console.log('-- 1. Agregar columna mastering_subscription_active (booleano)');
console.log('ALTER TABLE profiles ADD COLUMN IF NOT EXISTS mastering_subscription_active BOOLEAN DEFAULT false;\n');

console.log('-- 2. Agregar columna mastering_subscription_expires_at (timestamp)');
console.log('ALTER TABLE profiles ADD COLUMN IF NOT EXISTS mastering_subscription_expires_at TIMESTAMP WITH TIME ZONE;\n');

console.log('-- 3. Verificar que las columnas se agregaron correctamente');
console.log('SELECT column_name, data_type, is_nullable, column_default');
console.log('FROM information_schema.columns');
console.log("WHERE table_name = 'profiles' AND column_name IN ('mastering_subscription_active', 'mastering_subscription_expires_at');\n");

console.log('=== INSTRUCCIONES ===');
console.log('1. Ve a https://supabase.com/dashboard/project/[tu-proyecto]/sql');
console.log('2. Copia y pega los comandos SQL anteriores');
console.log('3. Haz clic en "Run" para ejecutarlos');
console.log('4. Las columnas estarán listas para usar en la app');