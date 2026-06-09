// Script para actualizar el perfil en Supabase
const { createClient } = require('@supabase/supabase-js');

// Credenciales de Supabase (debes reemplazar con las tuyas)
const SUPABASE_URL = "https://your-project.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = "tu-service-role-key-aqui";

// ID del usuario a actualizar
const USER_ID = "84d841ec-e6f3-447b-96b1-74460d4034ab";

async function updateProfile() {
  try {
    console.log("Conectando a Supabase...");
    
    // Crear cliente de Supabase con service role key
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

    console.log("Actualizando perfil del usuario:", USER_ID);
    console.log("Datos a actualizar:", updates);

    // Actualizar el registro
    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', USER_ID)
      .select();

    if (error) {
      console.error("Error al actualizar:", error);
      return;
    }

    if (data && data.length > 0) {
      console.log("✅ Perfil actualizado exitosamente!");
      console.log("Datos actualizados:", data[0]);
    } else {
      console.log("⚠️  No se encontró el usuario o no se actualizó ningún registro");
    }

  } catch (error) {
    console.error("Error en el script:", error);
  }
}

// Ejecutar la función
updateProfile();