// Script para asignar 1200 créditos ($375 MXN) a forsanchez412@gmail.com
// Ejecutar con: node grant-forsanchez.js

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

async function grantCreditsToForsanchez() {
  console.log('🎵 RAMBER Tunes - Asignación de créditos');
  console.log('=========================================\n');
  
  const email = 'forsanchez412@gmail.com';
  const credits = 1200; // $375 MXN = Pack Inicio
  
  console.log(`📧 Usuario: ${email}`);
  console.log(`💰 Monto: $375 MXN`);
  console.log(`🎫 Créditos: ${credits} (Pack Inicio)`);
  console.log('');
  
  // Obtener token de admin
  const adminToken = await getAdminToken();
  if (!adminToken) {
    console.log('⚠️  Intentando método alternativo...');
    console.log('🔑 Necesitas un token de admin válido.');
    console.log('   Puedes obtenerlo:');
    console.log('   1. Inicia sesión en http://localhost:3000');
    console.log('   2. Abre las herramientas de desarrollador (F12)');
    console.log('   3. Ve a Application > Local Storage > http://localhost:3000');
    console.log('   4. Busca "supabase.auth.token" y copia el access_token');
    console.log('   5. Ejecuta:');
    console.log('      curl -X POST http://localhost:3001/api/admin/grant-credits \\');
    console.log('        -H "Content-Type: application/json" \\');
    console.log('        -H "Authorization: Bearer TU_TOKEN_AQUI" \\');
    console.log('        -d \'{"email":"forsanchez412@gmail.com","credits":1200}\'');
    return;
  }
  
  try {
    console.log('🔄 Enviando créditos...');
    
    const response = await fetch('http://localhost:3001/api/admin/grant-credits', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        email,
        credits
      })
    });
    
    const result = await response.json();
    
    if (response.ok) {
      console.log('\n✅ ¡CRÉDITOS ASIGNADOS EXITOSAMENTE!');
      console.log('=========================================');
      console.log(`📧 Email: ${result.email}`);
      console.log(`📊 Créditos anteriores: ${result.previous_credits}`);
      console.log(`➕ Créditos añadidos: ${result.credits_added}`);
      console.log(`📈 Nuevos créditos: ${result.new_credits}`);
      console.log('');
      console.log('🎉 ¡Listo! forsanchez412@gmail.com ahora tiene 1200 créditos.');
      console.log('   Puede crear hasta 100 canciones con el Pack Inicio.');
    } else {
      console.error('\n❌ Error al asignar créditos:');
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
grantCreditsToForsanchez();