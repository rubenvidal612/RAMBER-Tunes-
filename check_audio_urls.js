// Script para analizar las URLs de audio en Supabase
// Necesitas configurar las variables de entorno de Supabase primero

import { createClient } from '@supabase/supabase-js';

// Configuración - reemplaza con tus valores reales
const supabaseUrl = process.env.SUPABASE_URL || 'https://your-project.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'your-service-role-key';

if (!supabaseUrl || !supabaseKey || supabaseUrl.includes('your-project') || supabaseKey.includes('your-service-role-key')) {
  console.error('❌ ERROR: Necesitas configurar las variables de entorno de Supabase');
  console.error('   Configura SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY');
  console.error('   Puedes obtener estos valores desde el dashboard de Supabase:');
  console.error('   1. Ve a https://supabase.com/dashboard');
  console.error('   2. Selecciona tu proyecto');
  console.error('   3. Ve a Settings > API');
  console.error('   4. Copia "Project URL" y "service_role" secret');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function analyzeAudioUrls() {
  console.log('🔍 Analizando URLs de audio en la tabla library_items...\n');
  
  try {
    // 1. Total de canciones
    console.log('📊 1. ESTADÍSTICAS GENERALES:');
    const { data: totalStats, error: totalError } = await supabase
      .from('library_items')
      .select('*', { count: 'exact', head: true })
      .eq('type', 'song')
      .is('deleted_at', null);
    
    if (totalError) throw totalError;
    
    const { count: totalCanciones } = await supabase
      .from('library_items')
      .select('*', { count: 'exact' })
      .eq('type', 'song')
      .is('deleted_at', null);
    
    const { count: conAudioUrl } = await supabase
      .from('library_items')
      .select('*', { count: 'exact' })
      .eq('type', 'song')
      .is('deleted_at', null)
      .not('audio_url', 'is', null)
      .not('audio_url', 'eq', '');
    
    const { count: sinAudioUrl } = await supabase
      .from('library_items')
      .select('*', { count: 'exact' })
      .eq('type', 'song')
      .is('deleted_at', null)
      .or('audio_url.is.null,audio_url.eq.');
    
    console.log(`   • Total de canciones: ${totalCanciones}`);
    console.log(`   • Canciones con URL de audio: ${conAudioUrl}`);
    console.log(`   • Canciones sin URL de audio: ${sinAudioUrl}`);
    
    // 2. URLs por tipo
    console.log('\n📊 2. ANÁLISIS POR TIPO DE URL:');
    
    // Obtener todas las canciones con URLs
    const { data: canciones, error: cancionesError } = await supabase
      .from('library_items')
      .select('id, title, audio_url, created_at, suno_task_id, suno_audio_id')
      .eq('type', 'song')
      .is('deleted_at', null)
      .not('audio_url', 'is', null)
      .not('audio_url', 'eq', '');
    
    if (cancionesError) throw cancionesError;
    
    let urlsR2 = 0;
    let urlsSuno = 0;
    let urlsOtras = 0;
    let urlsSunoActivas = 0;
    let urlsSunoExpiradas = 0;
    let urlsSunoSinFecha = 0;
    
    const ahora = new Date();
    const hace14Dias = new Date(ahora.getTime() - (14 * 24 * 60 * 60 * 1000));
    
    canciones.forEach(cancion => {
      const audioUrl = (cancion.audio_url || '').toLowerCase();
      const fechaCreacion = cancion.created_at ? new Date(cancion.created_at) : null;
      
      // Verificar tipo de URL
      if (audioUrl.includes('r2.cloudflarestorage.com') || 
          audioUrl.includes('.r2.dev') || 
          audioUrl.includes('/r2/')) {
        urlsR2++;
      } else if (audioUrl.includes('suno.ai') || 
                 audioUrl.includes('cdn.suno') || 
                 audioUrl.includes('firebasestorage.googleapis.com')) {
        urlsSuno++;
        
        // Verificar antigüedad
        if (!fechaCreacion) {
          urlsSunoSinFecha++;
        } else if (fechaCreacion >= hace14Dias) {
          urlsSunoActivas++;
        } else {
          urlsSunoExpiradas++;
        }
      } else {
        urlsOtras++;
      }
    });
    
    console.log(`   • URLs de R2: ${urlsR2}`);
    console.log(`   • URLs de Suno: ${urlsSuno}`);
    console.log(`   • Otras URLs: ${urlsOtras}`);
    
    // 3. URLs de Suno por antigüedad
    console.log('\n📊 3. ESTADO DE URLs DE SUNO:');
    console.log(`   • URLs activas (menos de 14 días): ${urlsSunoActivas}`);
    console.log(`   • URLs probablemente expiradas (más de 14 días): ${urlsSunoExpiradas}`);
    console.log(`   • URLs sin fecha de creación: ${urlsSunoSinFecha}`);
    
    // 4. Referencias a Suno
    console.log('\n📊 4. REFERENCIAS A SUNO EN LA BASE DE DATOS:');
    
    const { count: conSunoTaskId } = await supabase
      .from('library_items')
      .select('*', { count: 'exact' })
      .eq('type', 'song')
      .is('deleted_at', null)
      .not('suno_task_id', 'is', null)
      .not('suno_task_id', 'eq', '');
    
    const { count: conSunoAudioId } = await supabase
      .from('library_items')
      .select('*', { count: 'exact' })
      .eq('type', 'song')
      .is('deleted_at', null)
      .not('suno_audio_id', 'is', null)
      .not('suno_audio_id', 'eq', '');
    
    console.log(`   • Con suno_task_id: ${conSunoTaskId}`);
    console.log(`   • Con suno_audio_id: ${conSunoAudioId}`);
    
    // 5. Mostrar algunas canciones con URLs probablemente expiradas
    console.log('\n📊 5. EJEMPLOS DE CANCIONES CON URLs PROBABLEMENTE EXPIRADAS:');
    
    const cancionesExpiradas = canciones
      .filter(cancion => {
        const audioUrl = (cancion.audio_url || '').toLowerCase();
        const fechaCreacion = cancion.created_at ? new Date(cancion.created_at) : null;
        
        return (audioUrl.includes('suno.ai') || 
                audioUrl.includes('cdn.suno') || 
                audioUrl.includes('firebasestorage.googleapis.com')) &&
               fechaCreacion && fechaCreacion < hace14Dias;
      })
      .slice(0, 10); // Mostrar solo las primeras 10
    
    if (cancionesExpiradas.length > 0) {
      cancionesExpiradas.forEach((cancion, index) => {
        const fechaCreacion = new Date(cancion.created_at);
        const dias = Math.floor((ahora - fechaCreacion) / (1000 * 60 * 60 * 24));
        console.log(`   ${index + 1}. "${cancion.title || 'Sin título'}"`);
        console.log(`      ID: ${cancion.id}`);
        console.log(`      Creada hace: ${dias} días`);
        console.log(`      URL: ${cancion.audio_url ? cancion.audio_url.substring(0, 80) + '...' : 'N/A'}`);
        console.log(`      suno_task_id: ${cancion.suno_task_id || 'N/A'}`);
        console.log(`      suno_audio_id: ${cancion.suno_audio_id || 'N/A'}`);
        console.log('');
      });
    } else {
      console.log('   No se encontraron canciones con URLs de Suno expiradas.');
    }
    
    // 6. Resumen y recomendaciones
    console.log('\n📊 6. RESUMEN Y RECOMENDACIONES:');
    console.log(`   • Bucket R2 "ramber-tunes-audio" tiene 570 objetos`);
    console.log(`   • En la base de datos hay ${urlsR2} URLs de R2`);
    console.log(`   • Esto significa que ${570 - urlsR2} objetos en R2 no tienen referencia en la base de datos`);
    console.log(`   • Hay ${urlsSunoExpiradas} URLs de Suno probablemente expiradas`);
    console.log(`   • ${urlsSunoActivas} URLs de Suno aún están activas`);
    
    if (urlsSunoExpiradas > 0) {
      console.log('\n⚠️  ALERTA: Se encontraron URLs de Suno probablemente expiradas.');
      console.log('   Estas canciones ya no se podrán reproducir porque Suno borra los audios después de 14 días.');
      console.log('   Recomendación: Implementar un sistema para copiar automáticamente audios a R2.');
    }
    
    if (urlsR2 < 570) {
      console.log('\n⚠️  ALERTA: Hay objetos en R2 sin referencia en la base de datos.');
      console.log('   Esto puede ser: audios huérfanos, archivos temporales, o errores en el guardado.');
      console.log('   Recomendación: Revisar el bucket R2 y limpiar archivos no utilizados.');
    }
    
  } catch (error) {
    console.error('❌ Error al analizar las URLs:', error.message);
    process.exit(1);
  }
}

// Ejecutar el análisis
analyzeAudioUrls();