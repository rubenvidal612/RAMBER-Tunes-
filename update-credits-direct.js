// Script para actualizar créditos directamente en Supabase
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// Cargar variables de entorno
dotenv.config();
dotenv.config({ path: '.env.local', override: true });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Faltan variables de entorno de Supabase');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function updateCreditsDirectly() {
  console.log('🎵 RAMBER Tunes - Actualización directa de créditos');
  console.log('===================================================\n');
  
  const email = 'forsanchez412@gmail.com';
  const creditsToAdd = 1200; // $375 MXN = Pack Inicio
  
  console.log(`📧 Usuario: ${email}`);
  console.log(`💰 Monto: $375 MXN`);
  console.log(`🎫 Créditos a añadir: ${creditsToAdd} (Pack Inicio)`);
  console.log('');
  
  try {
    // Primero, obtener el perfil actual
    const { data: currentProfile, error: fetchError } = await supabase
      .from('profiles')
      .select('*')
      .eq('email', email)
      .maybeSingle();
    
    if (fetchError) {
      console.error('❌ Error al obtener perfil:', fetchError);
      return;
    }
    
    if (!currentProfile) {
      console.error('❌ Usuario no encontrado');
      return;
    }
    
    console.log('📊 Estado actual del usuario:');
    console.log(`   Créditos RAMBER: ${currentProfile.ramber_credits || 0}`);
    console.log(`   Créditos ZINGY: ${currentProfile.zingy_credits || 0}`);
    console.log(`   Créditos generales: ${currentProfile.credits || 0}`);
    console.log('');
    
    // Determinar qué columna actualizar
    // Según el código, primero intenta ramber_credits, luego zingy_credits, luego credits
    let columnToUpdate = 'ramber_credits';
    let currentCredits = currentProfile.ramber_credits || 0;
    
    console.log(`🔄 Actualizando columna: ${columnToUpdate}`);
    console.log(`   Créditos anteriores: ${currentCredits}`);
    console.log(`   Créditos a añadir: ${creditsToAdd}`);
    console.log(`   Nuevos créditos: ${currentCredits + creditsToAdd}`);
    console.log('');
    
    // Actualizar los créditos
    const { data: updatedProfile, error: updateError } = await supabase
      .from('profiles')
      .update({
        [columnToUpdate]: currentCredits + creditsToAdd,
        updated_at: new Date().toISOString()
      })
      .eq('email', email)
      .select()
      .maybeSingle();
    
    if (updateError) {
      console.error('❌ Error al actualizar créditos:', updateError);
      return;
    }
    
    console.log('✅ ¡CRÉDITOS ACTUALIZADOS EXITOSAMENTE!');
    console.log('=========================================');
    console.log(`📧 Email: ${updatedProfile.email}`);
    console.log(`📊 Créditos anteriores: ${currentCredits}`);
    console.log(`➕ Créditos añadidos: ${creditsToAdd}`);
    console.log(`📈 Nuevos créditos RAMBER: ${updatedProfile.ramber_credits}`);
    console.log('');
    console.log('🎉 ¡Listo! forsanchez412@gmail.com ahora tiene 1200 créditos RAMBER.');
    console.log('   Puede crear hasta 100 canciones con el Pack Inicio.');
    
    // Verificar la actualización
    console.log('\n🔍 Verificando actualización...');
    const { data: verifiedProfile, error: verifyError } = await supabase
      .from('profiles')
      .select('*')
      .eq('email', email)
      .maybeSingle();
    
    if (!verifyError && verifiedProfile) {
      console.log('✅ Verificación exitosa:');
      console.log(`   Créditos RAMBER: ${verifiedProfile.ramber_credits}`);
      console.log(`   Créditos ZINGY: ${verifiedProfile.zingy_credits}`);
      console.log(`   Créditos generales: ${verifiedProfile.credits}`);
    }
    
  } catch (error) {
    console.error('❌ Error inesperado:', error.message);
  }
}

updateCreditsDirectly();