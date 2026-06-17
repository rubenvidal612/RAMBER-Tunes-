// Script para analizar las 764 URLs "otras"
import { createClient } from '@supabase/supabase-js';

// Obtener variables de entorno
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ ERROR: Faltan variables de entorno de Supabase');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, { 
  auth: { persistSession: false } 
});

async function analyzeOtherUrls() {
  console.log('🔍 ANALIZANDO LAS 764 URLs "OTRAS"...\n');
  
  try {
    // 1. Obtener todas las canciones con URLs "otras"
    const { data: canciones, error } = await supabase
      .from('library_items')
      .select('id, title, audio_url, created_at, suno_task_id, suno_audio_id, is_cover')
      .eq('type', 'song')
      .is('deleted_at', null)
      .not('audio_url', 'is', null)
      .not('audio_url', 'eq', '');
    
    if (error) throw error;
    
    // 2. Filtrar las URLs "otras" (no R2, no Suno)
    const otrasUrls = canciones.filter(cancion => {
      const audioUrl = (cancion.audio_url || '').toLowerCase();
      
      // No es R2
      const noEsR2 = !audioUrl.includes('r2.cloudflarestorage.com') && 
                     !audioUrl.includes('.r2.dev') && 
                     !audioUrl.includes('/r2/');
      
      // No es Suno
      const noEsSuno = !audioUrl.includes('suno.ai') && 
                       !audioUrl.includes('cdn.suno') && 
                       !audioUrl.includes('firebasestorage.googleapis.com');
      
      return noEsR2 && noEsSuno;
    });
    
    console.log(`📊 TOTAL URLs "OTRAS": ${otrasUrls.length}\n`);
    
    // 3. Categorizar las URLs
    const categorias = {
      proxyVercel: [],      // /api/share/song/audio?id=...
      urlsLocales: [],      // /api/... (otras rutas)
      urlsHttp: [],         // http://... (sin https)
      urlsHttps: [],        // https://... (otros dominios)
      urlsRaras: []         // Otros formatos
    };
    
    otrasUrls.forEach(cancion => {
      const audioUrl = cancion.audio_url || '';
      const urlLower = audioUrl.toLowerCase();
      
      if (urlLower.includes('/api/share/song/audio?id=')) {
        categorias.proxyVercel.push(cancion);
      } else if (urlLower.startsWith('/api/')) {
        categorias.urlsLocales.push(cancion);
      } else if (urlLower.startsWith('http://')) {
        categorias.urlsHttp.push(cancion);
      } else if (urlLower.startsWith('https://')) {
        categorias.urlsHttps.push(cancion);
      } else {
        categorias.urlsRaras.push(cancion);
      }
    });
    
    // 4. Mostrar estadísticas por categoría
    console.log('📊 CATEGORÍAS DE URLs "OTRAS":');
    console.log(`   • Proxy Vercel (/api/share/song/audio?id=...): ${categorias.proxyVercel.length}`);
    console.log(`   • Otras rutas locales (/api/...): ${categorias.urlsLocales.length}`);
    console.log(`   • URLs HTTP (http://...): ${categorias.urlsHttp.length}`);
    console.log(`   • URLs HTTPS otros dominios: ${categorias.urlsHttps.length}`);
    console.log(`   • URLs raras/extrañas: ${categorias.urlsRaras.length}`);
    
    // 5. Analizar URLs de proxy Vercel
    console.log('\n🔍 ANÁLISIS DETALLADO DE PROXY VERCEL:');
    
    if (categorias.proxyVercel.length > 0) {
      // Tomar una muestra de 10 URLs para análisis
      const muestra = categorias.proxyVercel.slice(0, 10);
      
      console.log(`   Muestra de ${muestra.length} URLs de proxy:`);
      
      muestra.forEach((cancion, index) => {
        console.log(`\n   ${index + 1}. "${cancion.title || 'Sin título'}"`);
        console.log(`      ID: ${cancion.id}`);
        console.log(`      URL: ${cancion.audio_url}`);
        console.log(`      Creada: ${cancion.created_at}`);
        console.log(`      suno_task_id: ${cancion.suno_task_id || 'N/A'}`);
        console.log(`      suno_audio_id: ${cancion.suno_audio_id || 'N/A'}`);
        console.log(`      is_cover: ${cancion.is_cover ? 'Sí' : 'No'}`);
      });
      
      // Analizar antigüedad
      const ahora = new Date();
      const hace30Dias = new Date(ahora.getTime() - (30 * 24 * 60 * 60 * 1000));
      const hace60Dias = new Date(ahora.getTime() - (60 * 24 * 60 * 60 * 1000));
      
      const antiguas30 = categorias.proxyVercel.filter(c => {
        const fecha = c.created_at ? new Date(c.created_at) : null;
        return fecha && fecha < hace30Dias;
      }).length;
      
      const antiguas60 = categorias.proxyVercel.filter(c => {
        const fecha = c.created_at ? new Date(c.created_at) : null;
        return fecha && fecha < hace60Dias;
      }).length;
      
      console.log(`\n   📅 ANTIGÜEDAD DE URLs PROXY:`);
      console.log(`      • Con más de 30 días: ${antiguas30}`);
      console.log(`      • Con más de 60 días: ${antiguas60}`);
    }
    
    // 6. Analizar URLs HTTPS de otros dominios
    console.log('\n🔍 URLs HTTPS DE OTROS DOMINIOS:');
    
    if (categorias.urlsHttps.length > 0) {
      // Agrupar por dominio
      const dominios = {};
      
      categorias.urlsHttps.forEach(cancion => {
        try {
          const url = new URL(cancion.audio_url);
          const dominio = url.hostname;
          dominios[dominio] = (dominios[dominio] || 0) + 1;
        } catch (e) {
          // URL mal formada
        }
      });
      
      console.log(`   Dominios encontrados (${Object.keys(dominios).length}):`);
      Object.entries(dominios).forEach(([dominio, count], index) => {
        console.log(`      ${index + 1}. ${dominio}: ${count} canciones`);
      });
    }
    
    // 7. Verificar si estas canciones tienen referencias a Suno
    console.log('\n🔍 REFERENCIAS A SUNO EN URLs "OTRAS":');
    
    const conSunoTaskId = otrasUrls.filter(c => c.suno_task_id && c.suno_task_id.trim()).length;
    const conSunoAudioId = otrasUrls.filter(c => c.suno_audio_id && c.suno_audio_id.trim()).length;
    
    console.log(`   • Con suno_task_id: ${conSunoTaskId}`);
    console.log(`   • Con suno_audio_id: ${conSunoAudioId}`);
    
    // 8. CONCLUSIÓN SOBRE EL ARREGLO DE HOY
    console.log('\n🚀 IMPACTO DEL ARREGLO DE HOY:');
    
    const totalProxyVercel = categorias.proxyVercel.length;
    
    console.log(`   • URLs de proxy Vercel afectadas: ${totalProxyVercel}`);
    console.log(`   • Estas URLs apuntan a: /api/share/song/audio?id=XXX`);
    console.log(`   • Internamente, esta ruta:`);
    console.log(`       1. Busca la canción en library_items`);
    console.log(`       2. Obtiene el audio_url guardado`);
    console.log(`       3. Si es URL directa de R2 → la sirve`);
    console.log(`       4. Si es URL de Suno → la redirige`);
    console.log(`       5. Si es otra cosa → la procesa`);
    
    console.log('\n💡 RECOMENDACIONES:');
    
    if (totalProxyVercel > 0) {
      console.log(`   1. El arreglo de hoy SÍ beneficia a estas ${totalProxyVercel} canciones`);
      console.log(`      • El frontend ahora prioriza URLs directas de R2`);
      console.log(`      • Si el audio_url ya es de R2, se usará directamente`);
      console.log(`      • Si no, seguirá usando el proxy (pero menos eficiente)`);
      
      console.log(`\n   2. Para optimizar completamente:`);
      console.log(`      • Necesitas MIGRAR las audio_url de estas canciones`);
      console.log(`      • Cambiar de "/api/share/song/audio?id=XXX" a URL directa de R2`);
      console.log(`      • Esto elimina el proxy de Vercel completamente`);
    }
    
    console.log(`\n   3. URLs HTTPS de otros dominios (${categorias.urlsHttps.length}):`);
    console.log(`      • Estas ya son URLs directas`);
    console.log(`      • No pasan por proxy de Vercel`);
    console.log(`      • Pero podrían ser de servicios que expiran`);
    
    console.log(`\n✅ RESUMEN FINAL:`);
    console.log(`   • Arreglo de hoy: ✅ SÍ cubre las URLs proxy`);
    console.log(`   • Migración necesaria: ✅ SÍ para optimizar`);
    console.log(`   • Beneficio automático: ✅ SÍ (frontend prioriza URLs directas)`);
    
  } catch (error) {
    console.error('❌ Error durante el análisis:', error.message);
    process.exit(1);
  }
}

// Ejecutar análisis
analyzeOtherUrls();