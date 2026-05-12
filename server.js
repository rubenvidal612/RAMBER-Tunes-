import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// Cargar variables de entorno
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Configurar CORS
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? process.env.FRONTEND_URL 
    : 'http://localhost:3000',
  credentials: true
}));

// Middleware para parsear JSON
app.use(express.json());

// Inicializar cliente de Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Faltan variables de entorno de Supabase');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Middleware para verificar autenticación
const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  
  const token = authHeader.split(' ')[1];
  
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      return res.status(401).json({ error: 'Token inválido' });
    }
    
    req.user = user;
    next();
  } catch (error) {
    console.error('Error de autenticación:', error);
    return res.status(500).json({ error: 'Error de autenticación' });
  }
};

// Endpoint para listar voces del usuario
app.get('/api/voices/list', authenticate, async (req, res) => {
  try {
    const { data: voices, error } = await supabase
      .from('kits_voices')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error obteniendo voces:', error);
      return res.status(500).json({ error: 'Error obteniendo voces' });
    }

    // Formatear las voces para el frontend
    const formattedVoices = (voices || []).map(voice => ({
      id: voice.id,
      name: voice.voice_name || 'Voz sin nombre',
      description: voice.description || '',
      modelUrl: voice.model_url,
      sampleUrl: voice.sample_url,
      profileImageUrl: voice.profile_image_url,
      voiceProfileName: voice.voice_profile_name || voice.voice_name,
      category: voice.category || 'personal',
      language: voice.language || 'es',
      gender: voice.gender || 'unknown',
      accent: voice.accent,
      tags: voice.tags || [],
      isPublic: voice.is_public || false,
      createdAt: voice.created_at,
      status: voice.status || 'ready',
      userId: voice.user_id
    }));

    return res.json({ voices: formattedVoices });
  } catch (error) {
    console.error('Error en /api/voices/list:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Endpoint para crear una nueva voz
app.post('/api/voices/create', authenticate, async (req, res) => {
  try {
    const { 
      name, 
      description, 
      audioUrl, 
      profileImageUrl, 
      voiceProfileName,
      category,
      language,
      gender,
      accent,
      tags,
      isPublic
    } = req.body;
    
    if (!name || !audioUrl) {
      return res.status(400).json({ 
        error: 'Faltan campos requeridos: name y audioUrl' 
      });
    }

    // Obtener el correo del usuario para verificar si es el dueño
    const { data: userData, error: userError } = await supabase
      .from('profiles')
      .select('email')
      .eq('id', req.user.id)
      .single();

    if (userError) {
      console.error('Error obteniendo email del usuario:', userError);
    }

    const userEmail = userData?.email || '';
    const isOwnerEmail = 
      userEmail.toLowerCase() === 'rubenfiverr612@gmail.com' ||
      userEmail.toLowerCase() === 'rubenvidal612@gmail.com';

    // Crear registro en la base de datos
    const { data: voice, error } = await supabase
      .from('kits_voices')
      .insert({
        user_id: req.user.id,
        voice_name: name,
        description: description || '',
        profile_image_url: profileImageUrl || null,
        voice_profile_name: voiceProfileName || name,
        category: category || 'personal',
        language: language || 'es',
        gender: gender || 'unknown',
        accent: accent || null,
        tags: tags || [],
        is_public: isPublic || false,
        status: 'training',
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('Error creando voz:', error);
      return res.status(500).json({ error: 'Error creando voz' });
    }

    // Aquí iría la lógica para enviar el audio a Replicate API
    // Por ahora, simulamos una respuesta exitosa
    const formattedVoice = {
      id: voice.id,
      name: voice.voice_name,
      description: voice.description,
      profileImageUrl: voice.profile_image_url,
      voiceProfileName: voice.voice_profile_name,
      category: voice.category,
      language: voice.language,
      gender: voice.gender,
      accent: voice.accent,
      tags: voice.tags,
      isPublic: voice.is_public,
      status: voice.status,
      createdAt: voice.created_at,
      userId: voice.user_id
    };

    return res.status(201).json({ 
      message: 'Voz creada exitosamente',
      voice: formattedVoice
    });
  } catch (error) {
    console.error('Error en /api/voices/create:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Endpoint para obtener el estado de una voz específica
app.get('/api/voices/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    
    const { data: voice, error } = await supabase
      .from('kits_voices')
      .select('*')
      .eq('id', id)
      .eq('user_id', req.user.id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Voz no encontrada' });
      }
      console.error('Error obteniendo voz:', error);
      return res.status(500).json({ error: 'Error obteniendo voz' });
    }

    const formattedVoice = {
      id: voice.id,
      name: voice.voice_name,
      description: voice.description,
      modelUrl: voice.model_url,
      sampleUrl: voice.sample_url,
      profileImageUrl: voice.profile_image_url,
      voiceProfileName: voice.voice_profile_name || voice.voice_name,
      category: voice.category || 'personal',
      language: voice.language || 'es',
      gender: voice.gender || 'unknown',
      accent: voice.accent,
      tags: voice.tags || [],
      isPublic: voice.is_public || false,
      createdAt: voice.created_at,
      status: voice.status,
      userId: voice.user_id
    };

    return res.json({ voice: formattedVoice });
  } catch (error) {
    console.error('Error en /api/voices/:id:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Endpoint para eliminar una voz
app.delete('/api/voices/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    
    const { error } = await supabase
      .from('kits_voices')
      .delete()
      .eq('id', id)
      .eq('user_id', req.user.id);

    if (error) {
      console.error('Error eliminando voz:', error);
      return res.status(500).json({ error: 'Error eliminando voz' });
    }

    return res.json({ 
      message: 'Voz eliminada exitosamente',
      voiceId: id
    });
  } catch (error) {
    console.error('Error en /api/voices/:id (DELETE):', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Endpoint para aplicar efectos a una voz
app.post('/api/voices/apply-effects', authenticate, async (req, res) => {
  try {
    const { voiceId, effects } = req.body;
    
    if (!voiceId || !effects) {
      return res.status(400).json({ 
        error: 'Faltan campos requeridos: voiceId y effects' 
      });
    }

    // Verificar que la voz pertenece al usuario
    const { data: voice, error: voiceError } = await supabase
      .from('kits_voices')
      .select('*')
      .eq('id', voiceId)
      .eq('user_id', req.user.id)
      .single();

    if (voiceError) {
      if (voiceError.code === 'PGRST116') {
        return res.status(404).json({ error: 'Voz no encontrada' });
      }
      console.error('Error obteniendo voz:', voiceError);
      return res.status(500).json({ error: 'Error obteniendo voz' });
    }

    // Aquí iría la lógica para aplicar efectos usando Replicate API
    // Por ahora, simulamos una respuesta exitosa
    
    // Actualizar la voz con los efectos aplicados
    const { error: updateError } = await supabase
      .from('kits_voices')
      .update({
        effects_applied: true,
        effects_config: effects,
        updated_at: new Date().toISOString()
      })
      .eq('id', voiceId);

    if (updateError) {
      console.error('Error actualizando voz:', updateError);
      return res.status(500).json({ error: 'Error actualizando voz' });
    }

    return res.json({ 
      message: 'Efectos aplicados exitosamente',
      voiceId,
      effects
    });
  } catch (error) {
    console.error('Error en /api/voices/apply-effects:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Endpoint para el catálogo público de voces de usuarios
app.get('/api/voices/catalog', async (req, res) => {
  try {
    const { 
      category, 
      language, 
      gender, 
      search,
      limit = 20,
      offset = 0 
    } = req.query;
    
    // Construir consulta base
    let query = supabase
      .from('kits_voices')
      .select('*, user_profiles!inner(username, avatar_url)', { count: 'exact' })
      .eq('is_public', true)
      .eq('status', 'ready')
      .order('created_at', { ascending: false });

    // Aplicar filtros
    if (category) {
      query = query.eq('category', category);
    }
    
    if (language) {
      query = query.eq('language', language);
    }
    
    if (gender) {
      query = query.eq('gender', gender);
    }
    
    if (search) {
      query = query.or(`voice_name.ilike.%${search}%,description.ilike.%${search}%,voice_profile_name.ilike.%${search}%`);
    }

    // Aplicar paginación
    query = query.range(offset, offset + limit - 1);

    const { data: voices, error, count } = await query;

    if (error) {
      console.error('Error obteniendo catálogo de voces:', error);
      return res.status(500).json({ error: 'Error obteniendo catálogo de voces' });
    }

    // Formatear las voces para el frontend
    const formattedVoices = (voices || []).map(voice => ({
      id: voice.id,
      name: voice.voice_name,
      description: voice.description,
      modelUrl: voice.model_url,
      sampleUrl: voice.sample_url,
      profileImageUrl: voice.profile_image_url,
      voiceProfileName: voice.voice_profile_name || voice.voice_name,
      category: voice.category || 'personal',
      language: voice.language || 'es',
      gender: voice.gender || 'unknown',
      accent: voice.accent,
      tags: voice.tags || [],
      isPublic: voice.is_public,
      createdAt: voice.created_at,
      status: voice.status,
      userId: voice.user_id,
      userProfile: {
        username: voice.user_profiles?.username || 'Usuario',
        avatarUrl: voice.user_profiles?.avatar_url
      }
    }));

    return res.json({ 
      voices: formattedVoices,
      total: count || 0,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('Error en /api/voices/catalog:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Endpoint para actualizar una voz (incluyendo foto de perfil)
app.put('/api/voices/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      name, 
      description, 
      profileImageUrl, 
      voiceProfileName,
      category,
      language,
      gender,
      accent,
      tags,
      isPublic
    } = req.body;
    
    // Verificar que la voz pertenece al usuario
    const { data: existingVoice, error: checkError } = await supabase
      .from('kits_voices')
      .select('*')
      .eq('id', id)
      .eq('user_id', req.user.id)
      .single();

    if (checkError) {
      if (checkError.code === 'PGRST116') {
        return res.status(404).json({ error: 'Voz no encontrada' });
      }
      console.error('Error obteniendo voz:', checkError);
      return res.status(500).json({ error: 'Error obteniendo voz' });
    }

    // Actualizar la voz
    const { data: voice, error: updateError } = await supabase
      .from('kits_voices')
      .update({
        voice_name: name || existingVoice.voice_name,
        description: description || existingVoice.description,
        profile_image_url: profileImageUrl || existingVoice.profile_image_url,
        voice_profile_name: voiceProfileName || existingVoice.voice_profile_name,
        category: category || existingVoice.category,
        language: language || existingVoice.language,
        gender: gender || existingVoice.gender,
        accent: accent || existingVoice.accent,
        tags: tags || existingVoice.tags,
        is_public: isPublic !== undefined ? isPublic : existingVoice.is_public,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('Error actualizando voz:', updateError);
      return res.status(500).json({ error: 'Error actualizando voz' });
    }

    const formattedVoice = {
      id: voice.id,
      name: voice.voice_name,
      description: voice.description,
      modelUrl: voice.model_url,
      sampleUrl: voice.sample_url,
      profileImageUrl: voice.profile_image_url,
      voiceProfileName: voice.voice_profile_name || voice.voice_name,
      category: voice.category || 'personal',
      language: voice.language || 'es',
      gender: voice.gender || 'unknown',
      accent: voice.accent,
      tags: voice.tags || [],
      isPublic: voice.is_public || false,
      createdAt: voice.created_at,
      status: voice.status,
      userId: voice.user_id
    };

    return res.json({ 
      message: 'Voz actualizada exitosamente',
      voice: formattedVoice
    });
  } catch (error) {
    console.error('Error en /api/voices/:id (PUT):', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Endpoint de salud
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Manejo de errores
app.use((err, req, res, next) => {
  console.error('Error no manejado:', err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`Servidor backend ejecutándose en http://localhost:${PORT}`);
  console.log(`Endpoints disponibles:`);
  console.log(`  GET  /api/voices/list`);
  console.log(`  POST /api/voices/create`);
  console.log(`  GET  /api/voices/:id`);
  console.log(`  PUT  /api/voices/:id`);
  console.log(`  DELETE /api/voices/:id`);
  console.log(`  POST /api/voices/apply-effects`);
  console.log(`  GET  /api/voices/catalog`);
  console.log(`  GET  /health`);
});