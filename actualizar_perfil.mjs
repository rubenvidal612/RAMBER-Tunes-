// Script para actualizar perfil en Supabase (ES Module)
import { createClient } from '@supabase/supabase-js';

// ⚠️ CREDENCIALES DE SUPABASE
const SUPABASE_URL = "https://bypfypbypbypbypbypby.supabase.co"; // Reemplaza con tu URL real
const SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ5cGZ5cGJ5cGJ5cGJ5cGJ5cGJ5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTcyOTk5OTk5OSwiZXhwIjoxNzM3Nzc1OTk5fQ.abcdefghijklmnopqrstuvwxyz1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ";

// ID del usuario a actualizar (rubenfiverr612@gmail.com)
const USER_ID = "84d841ec-e6f3-447b-96b1-74460d4034ab";

async function updateProfile() {
  try {
    console.log("=== ACTUALIZACIÓN DE PERFIL EN SUPABASE ===");
    console.log("Usuario ID:", USER_ID);
    console.log("Email: rubenfiverr612@gmail.com");
    
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error("\n❌ ERROR: Faltan credenciales de Supabase");
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
    console.log("- plan_active: true (suscripción activa)");
    console.log("- ramber_credits: 9999 (créditos disponibles)");
    console.log("- renewal_paid_successfully: true (pago de renovación exitoso)");

    console.log("\n🔄 Actualizando perfil en Supabase...");
    
    // Actualizar el registro
    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', USER_ID)
      .select();

    if (error) {
      console.error("\n❌ Error al actualizar:", error.message);
      console.log("Código de error:", error.code);
      console.log("\nPosibles soluciones:");
      console.log("1. Verifica que la URL de Supabase sea correcta");
      console.log("2. Verifica que la Service Role Key sea válida");
      console.log("3. Verifica que el usuario exista en la tabla 'profiles'");
      return;
    }

    if (data && data.length > 0) {
      console.log("\n✅ ¡PERFIL ACTUALIZADO EXITOSAMENTE!");
      console.log("========================================");
      console.log("Usuario:", data[0].email || "rubenfiverr612@gmail.com");
      console.log("plan_active:", data[0].plan_active);
      console.log("ramber_credits:", data[0].ramber_credits);
      console.log("renewal_paid_successfully:", data[0].renewal_paid_successfully);
      console.log("========================================");
      console.log("\n🎯 El usuario ahora puede:");
      console.log("- Generar canciones por Telegram (tiene 9999 créditos)");
      console.log("- Usar el comando /cover para hacer covers");
      console.log("- Acceder a todas las funciones premium");
    } else {
      console.log("\n⚠️  No se encontró el usuario con ID:", USER_ID);
      console.log("Verifica que el ID sea correcto en Supabase");
    }

  } catch (error) {
    console.error("\n❌ Error en el script:", error.message);
  }
}

// Ejecutar la función
updateProfile();