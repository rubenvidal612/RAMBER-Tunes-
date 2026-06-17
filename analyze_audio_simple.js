// Script simple para analizar URLs de audio
// Usa las mismas variables de entorno que el código principal

import { createClient } from '@supabase/supabase-js';

// Obtener variables de entorno (igual que en [...route].ts)
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseService = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

console.log('🔍 Iniciando análisis de URLs de audio...');
console.log(`📊 Supabase URL configurada: ${supabaseUrl ? '✅ Sí' : '❌ No'}`);
console.log(`📊 Service Role Key configurada: ${supabaseService ? '✅ Sí' : '❌ No'}`);

if (!supabaseUrl || !supabaseService) {
  console.error('\n❌ ERROR: Faltan variables de entorno de Supabase');
  console.error('   El código necesita:');
  console.error('   - SUPABASE_URL');
  console.error('   - SUPABASE_SERVICE_ROLE_KEY');
  console.error('\n   Estas variables deberían estar en:');
  console.error('   1. Archivo .env local');
  console.error('   2. Variables de entorno de Vercel');
  console.error('   3. Configuración del entorno de ejecución');
  process.exit(1);
}

// Crear cliente de Supabase
const supabase = createClient(supabaseUrl, supabaseService, { 
  auth: { persistSession: false } 
});

async function analyzeAudioUrls() {
  try {
    console.log('\n📊 CONECTANDO A SUPABASE...');
    
    // 1. Obtener total de canciones
    console.log('\n1. 📈 ESTADÍSTICAS GENERALES:');
    const { count: totalCanciones, error: countError } = await supabase
      .from('library_items')
      .select('*', { count: 'exact', head: true })
      .eq('type', 'song')
      .is('deleted_at', null);
    
    if (countError) throw countError;
    console.log(`   • Total de canciones activas: ${totalCanciones}`);
    
    // 2. Obtener canciones con URLs de audio
    const { data: canciones, error: songsError } = await supabase
      .from('library_items')
      .select('id, title, audio_url, created_at, suno_task_id, suno_audio_id')
      .eq('type', 'song')
      .is('deleted_at', null)
      .not('audio_url', 'is', null)
      .not('audio_url', 'eq', '');
    
    if (songsError) throw songsError;
    
    const cancionesConAudio = canciones.length;
    console.log(`   • Canciones con URL de audio: ${cancionesConAudio}`);
    console.log(`   • Canciones sin URL de audio: ${totalCanciones - cancionesConAudio}`);
    
    // 3. Analizar tipos de URLs
    console.log('\n2. 🔗 ANÁLISIS POR TIPO DE URL:');
    
    let urlsR2 = 0;
    let urlsSuno = 0;
    let urlsOtras = 0;
    
    canciones.forEach(cancion => {
      const audioUrl = (cancion.audio_url || '').toLowerCase();
      
      if (audioUrl.includes('r2.cloudflarestorage.com') || 
          audioUrl.includes('.r2.dev') || 
          audioUrl.includes('/r2/')) {
        urlsR2++;
      } else if (audioUrl.includes('suno.ai') || 
                 audioUrl.includes('cdn.suno') || 
                 audioUrl.includes('firebasestorage.googleapis.com')) {
        urlsSuno++;
      } else {
        urlsOtras++;
      }
    });
    
    console.log(`   • URLs de R2: ${urlsR2}`);
    console.log(`   • URLs de Suno: ${urlsSuno}`);
    console.log(`   • Otras URLs: ${urlsOtras}`);
    
    // 4. Analizar antigüedad de URLs de Suno
    console.log('\n3. ⏰ ESTADO DE URLs DE SUNO:');
    
    const ahora = new Date();
    const hace14Dias = new Date(ahora.getTime() - (14 * 24 * 60 * 60 * 1000));
    
    let urlsSunoActivas = 0;
    let urlsSunoExpiradas = 0;
    let urlsSunoSinFecha = 0;
    
    canciones.forEach(cancion => {
      const audioUrl = (cancion.audio_url || '').toLowerCase();
      
      if (audioUrl.includes('suno.ai') || 
          audioUrl.includes('cdn.suno') || 
          audioUrl.includes('firebasestorage.googleapis.com')) {
        
        const fechaCreacion = cancion.created_at ? new Date(cancion.created_at) : null;
        
        if (!fechaCreacion) {
          urlsSunoSinFecha++;
        } else if (fechaCreacion >= hace14Dias) {
          urlsSunoActivas++;
        } else {
          urlsSunoExpiradas++;
        }
      }
    });
    
    console.log(`   • URLs activas (menos de 14 días): ${urlsSunoActivas}`);
    console.log(`   • URLs probablemente expiradas (más de 14 días): ${urlsSunoExpiradas}`);
    console.log(`   • URLs sin fecha de creación: ${urlsSunoSinFecha}`);
    
    // 5. Referencias a Suno
    console.log('\n4. 🔍 REFERENCIAS A SUNO EN LA BASE DE DATOS:');
    
    const { count: conSunoTaskId, error: taskIdError } = await supabase
      .from('library_items')
      .select('*', { count: 'exact' })
      .eq('type', 'song')
      .is('deleted_at', null)
      .not('suno_task_id', 'is', null)
      .not('suno_task_id', 'eq', '');
    
    if (taskIdError) throw taskIdError;
    
    const { count: conSunoAudioId, error: audioIdError } = await supabase
      .from('library_items')
      .select('*', { count: 'exact' })
      .eq('type', 'song')
      .is('deleted_at', null)
      .not('suno_audio_id', 'is', null)
      .not('suno_audio_id', 'eq', '');
    
    if (audioIdError) throw audioIdError;
    
    console.log(`   • Con suno_task_id: ${conSunoTaskId}`);
    console.log(`   • Con suno_audio_id: ${conSunoAudioId}`);
    
    // 6. Resumen
    console.log('\n5. 📋 RESUMEN FINAL:');
    console.log(`   • Total canciones: ${totalCanciones}`);
    console.log(`   • URLs de R2 en base de datos: ${urlsR2}`);
    console.log(`   • URLs de Suno en base de datos: ${urlsSuno}`);
    console.log(`   • URLs de Suno expiradas: ${urlsSunoExpiradas}`);
    console.log(`   • Objetos en bucket R2: 570 (según tu información)`);
    console.log(`   • Objetos R2 sin referencia: ${570 - urlsR2}`);
    
    // 7. Recomendaciones
    console.log('\n6. 💡 RECOMENDACIONES:');
    
    if (urlsSunoExpiradas > 0) {
      console.log(`   ⚠️  ALERTA: ${urlsSunoExpiradas} canciones probablemente perdieron su audio`);
      console.log('      • Suno borra audios después de 14 días');
      console.log('      • Estas canciones ya no se pueden reproducir');
      console.log('      • Solución: Implementar copia automática a R2');
    }
    
    if (urlsR2 < 570) {
      console.log(`   ⚠️  ALERTA: ${570 - urlsR2} objetos en R2 no tienen referencia`);
      console.log('      • Pueden ser audios huérfanos o archivos temporales');
      console.log('      • Solución: Revisar bucket R2 y limpiar archivos no usados');
    }
    
    if (urlsSunoActivas > 0) {
      console.log(`   ℹ️  INFO: ${urlsSunoActivas} URLs de Suno aún están activas`);
      console.log('      • Estas se perderán si no se copian a R2 pronto');
    }
    
    console.log('\n✅ Análisis completado');
    
  } catch (error) {
    console.error('\n❌ ERROR durante el análisis:', error.message);
    console.error('Detalles:', error);
    process.exit(1);
  }
}

// Ejecutar análisis
analyzeAudioUrls();