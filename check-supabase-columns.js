import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Cargar variables de entorno
dotenv.config();

// Obtener credenciales de Supabase
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Faltan variables de entorno de Supabase');
  console.log('SUPABASE_URL:', supabaseUrl ? 'PRESENT' : 'MISSING');
  console.log('SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceKey ? 'PRESENT' : 'MISSING');
  process.exit(1);
}

console.log('🔍 Conectando a Supabase...');
console.log('URL:', supabaseUrl);

// Crear cliente de Supabase
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkColumns() {
  console.log('\n📋 Verificando columnas de créditos en la tabla "profiles"...');
  
  try {
    // Consulta SQL para verificar columnas
    const { data, error } = await supabase.rpc('check_credits_columns');
    
    if (error) {
      // Si la función RPC no existe, intentamos con consulta directa
      console.log('⚠️  Intentando consulta directa...');
      
      const { data: columnsData, error: columnsError } = await supabase
        .from('profiles')
        .select('*')
        .limit(1);
      
      if (columnsError) {
        console.error('❌ Error al acceder a la tabla profiles:', columnsError.message);
        return;
      }
      
      if (columnsData && columnsData.length > 0) {
        const profile = columnsData[0];
        console.log('\n🔍 Columnas encontradas en el primer registro:');
        
        const creditColumns = ['ramber_credits', 'zingy_credits', 'credits', 'song_balance'];
        let foundColumns = [];
        
        for (const col of creditColumns) {
          if (profile[col] !== undefined) {
            foundColumns.push(col);
            console.log(`   ✅ ${col}: ${profile[col]} (tipo: ${typeof profile[col]})`);
          }
        }
        
        if (foundColumns.length === 0) {
          console.log('   ❌ No se encontraron columnas de créditos');
          console.log('\n📊 Columnas disponibles en el registro:');
          Object.keys(profile).forEach(key => {
            console.log(`   - ${key}: ${profile[key]} (tipo: ${typeof profile[key]})`);
          });
        } else {
          console.log(`\n✅ Se encontraron ${foundColumns.length} columnas de créditos`);
        }
      } else {
        console.log('ℹ️  La tabla profiles está vacía o no existe');
      }
    } else {
      console.log('📊 Resultados de la consulta:');
      console.log(data);
    }
    
  } catch (err) {
    console.error('❌ Error inesperado:', err.message);
  }
}

// Ejecutar la verificación
checkColumns();