// Script para actualizar perfil en Supabase
// INSTRUCCIONES:
// 1. Reemplaza SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY con tus credenciales reales
// 2. Ejecuta: node update_supabase_profile.js

const { createClient } = require('@supabase/supabase-js');

// ⚠️ REEMPLAZA ESTAS CREDENCIALES CON LAS TUYAS ⚠️
const SUPABASE_URL = "https://tu-proyecto.supabase.co"; // Tu URL de Supabase
const SUPABASE_SERVICE_ROLE_KEY = "tu-service-role-key-aqui"; // Tu Service Role Key

// ID del usuario a actualizar (rubenfiverr612@gmail.com)
const USER_ID = "84d841ec-e6f3-447b-96b1-74460d4034ab";

async function updateProfile() {
  try {
    console.log("=== ACTUALIZACIÓN DE PERFIL EN SUPABASE ===");
    console.log("Usuario ID:", USER_ID);
    console.log("URL de Supabase:", SUPABASE_URL ? "✅ Configurada" : "❌ Faltante");
    console.log("Service Role Key:", SUPABASE_SERVICE_ROLE_KEY ? "✅ Configurada" : "❌ Faltante");
    
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error("\n❌ ERROR: Faltan credenciales de Supabase");
      console.log("Por favor, reemplaza SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY con tus credenciales reales");
      return;
    }

    // Crear cliente de Supabase
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // Datos a actualizar
    const updates = {
      plan_active: true,
      ramber_credits: 9999,
      renewal_paid_successfully: true,
      updated_at: new Date().toISOString()
    };

    console.log("\n📋 Datos a actualizar:");
    console.log("- plan_active: true");
    console.log("- ramber_credits: 9999");
    console.log("- renewal_paid_successfully: true");

    console.log("\n🔄 Actualizando perfil...");
    
    // Actualizar el registro
    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', USER_ID)
      .select();

    if (error) {
      console.error("\n❌ Error al actualizar:", error.message);
      console.log("Código de error:", error.code);
      return;
    }

    if (data && data.length > 0) {
      console.log("\n✅ ¡PERFIL ACTUALIZADO EXITOSAMENTE!");
      console.log("Usuario:", data[0].email || "No tiene email");
      console.log("plan_active:", data[0].plan_active);
      console.log("ramber_credits:", data[0].ramber_credits);
      console.log("renewal_paid_successfully:", data[0].renewal_paid_successfully);
    } else {
      console.log("\n⚠️  No se encontró el usuario con ID:", USER_ID);
      console.log("Verifica que el ID sea correcto");
    }

  } catch (error) {
    console.error("\n❌ Error en el script:", error.message);
  }
}

// Ejecutar la función
updateProfile();