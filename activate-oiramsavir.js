// Script para activar plan de oiramsavir1582@gmail.com
// Ejecutar con: node activate-oiramsavir.js

import dotenv from 'dotenv';
import fetch from 'node-fetch';

// Cargar variables de entorno
dotenv.config();
dotenv.config({ path: '.env.local', override: true });

async function getAdminToken() {
  // Usar las credenciales de admin del archivo .env
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  const adminEmail = process.env.ADMIN_EMAIL || 'rubenfiverr612@gmail.com';
  const adminPassword = process.env.ADMIN_PASSWORD;
  
  if (!adminPassword) {
    console.error('❌ Falta ADMIN_PASSWORD en las variables de entorno');
    console.log('💡 Solución:');
    console.log('1. Crea un archivo .env.local si no existe');
    console.log('2. Agrega: ADMIN_PASSWORD="tu_contraseña_de_admin"');
    console.log('3. Obtén un token manualmente desde el navegador');
    return null;
  }
  
  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseAnonKey
      },
      body: JSON.stringify({
        email: adminEmail,
        password: adminPassword
      })
    });
    
    const data = await response.json();
    
    if (response.ok) {
      console.log('✅ Token de admin obtenido correctamente');
      return data.access_token;
    } else {
      console.error('❌ Error al obtener token:', data);
      return null;
    }
  } catch (error) {
    console.error('❌ Error de conexión:', error.message);
    return null;
  }
}

async function activateUserPlan() {
  console.log('🎵 RAMBER Tunes - Activación de plan');
  console.log('=====================================\n');
  
  const email = 'oiramsavir1582@gmail.com';
  const plan_key = 'inicio'; // Plan Inicio
  const credits_mode = 'default'; // Asignar créditos por defecto (1200)
  
  console.log(`📧 Usuario: ${email}`);
  console.log(`📋 Plan: ${plan_key}`);
  console.log(`💰 Créditos: modo ${credits_mode} (1200 créditos)`);
  console.log('');
  
  // Obtener token de admin
  const adminToken = await getAdminToken();
  if (!adminToken) {
    console.log('⚠️  Intentando método alternativo...');
    console.log('🔑 Necesitas un token de admin válido.');
    console.log('   Puedes obtenerlo:');
    console.log('   1. Inicia sesión en https://ramber-tunes.vercel.app');
    console.log('   2. Abre las herramientas de desarrollador (F12)');
    console.log('   3. Ve a Application > Local Storage > https://ramber-tunes.vercel.app');
    console.log('   4. Busca "supabase.auth.token" y copia el access_token');
    console.log('   5. Ejecuta:');
    console.log('      curl -X POST https://ramber-tunes.vercel.app/api/admin/set-plan \\');
    console.log('        -H "Content-Type: application/json" \\');
    console.log('        -H "Authorization: Bearer TU_TOKEN_AQUI" \\');
    console.log('        -d \'{"email":"oiramsavir1582@gmail.com","plan_key":"inicio","credits_mode":"default"}\'');
    return;
  }
  
  try {
    console.log('🔄 Activando plan...');
    
    const response = await fetch('https://ramber-tunes.vercel.app/api/admin/set-plan', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        email,
        plan_key,
        credits_mode
      })
    });
    
    const result = await response.json();
    
    if (response.ok) {
      console.log('\n✅ ¡PLAN ACTIVADO EXITOSAMENTE!');
      console.log('=====================================');
      console.log(`📧 Email: ${email}`);
      console.log(`📋 Plan: ${plan_key}`);
      console.log(`💰 Créditos asignados: 1200`);
      console.log(`📅 Válido por: 30 días`);
      console.log('');
      console.log('🎉 ¡Listo! oiramsavir1582@gmail.com ahora tiene plan activo.');
      console.log('   Puede crear canciones inmediatamente.');
    } else {
      console.error('\n❌ Error al activar plan:');
      console.error(`   ${result.error}`);
      if (result.detail) {
        console.error(`   Detalles: ${result.detail}`);
      }
    }
    
  } catch (error) {
    console.error('❌ Error de conexión:', error.message);
  }
}

// Ejecutar la función
activateUserPlan();