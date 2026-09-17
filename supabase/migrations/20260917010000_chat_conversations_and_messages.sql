-- ================================================================
-- 20260917010000_chat_conversations_and_messages.sql
-- Proyecto: LucIAna Music (RAMBER-Tunes-real)
-- Responsable: Rubén Vidal Hernández
-- Tipo: Migración manual (se ejecuta 1 VEZ en Supabase SQL Editor).
-- Seguridad: RLS 100% activado. Ningún usuario ve chats ajenos.
-- NO EJECUTES ESTE ARCHIVO MÁS DE UNA VEZ. Si quieres regenerar,
-- haz DROP TABLE chat_messages; DROP TABLE chat_conversations; CASCADE primero.
-- ================================================================

-- Extensión pgcrypto para gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Función propia para actualizar updated_at (sin depender de extensión moddatetime)
CREATE OR REPLACE FUNCTION chat_set_updated_at()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql VOLATILE;

-- ================================================================
-- TABLA 1: chat_conversations (un registro por cada chat del usuario)
-- ================================================================
CREATE TABLE IF NOT EXISTS public.chat_conversations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title text NOT NULL DEFAULT 'Nuevo chat',
    summary_snapshot jsonb DEFAULT '{}'::jsonb,
    internal_dify_conversation_id text DEFAULT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    archived_at timestamptz DEFAULT NULL
);

-- ================================================================
-- TABLA 2: chat_messages (cada mensaje dentro de una conversación)
-- ================================================================
CREATE TABLE IF NOT EXISTS public.chat_messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id uuid NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
    role text NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content text NOT NULL,
    structured_action jsonb DEFAULT NULL,
    tokens integer DEFAULT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- ================================================================
-- ÍNDICES (rendimiento)
-- ================================================================
CREATE INDEX IF NOT EXISTS idx_chat_conv_user_created
    ON public.chat_conversations (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_msg_conv_created
    ON public.chat_messages (conversation_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_chat_msg_conversation
    ON public.chat_messages (conversation_id);

-- ================================================================
-- TRIGGER: actualizar updated_at en chat_conversations al editar
-- ================================================================
DROP TRIGGER IF EXISTS chat_conversations_updated_at ON public.chat_conversations;

CREATE TRIGGER chat_conversations_updated_at
BEFORE UPDATE ON public.chat_conversations
FOR EACH ROW
EXECUTE FUNCTION chat_set_updated_at();

-- ================================================================
-- ROW LEVEL SECURITY (RLS) — HABILITAR en AMBAS tablas
-- ================================================================
ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages    ENABLE ROW LEVEL SECURITY;

-- ================================================================
-- PERMISOS EXPLÍCITOS para el rol authenticated
-- (sin esto, incluso con RLS, los usuarios autenticados no
--  tendrían privilegios de acceso a las tablas)
-- ================================================================
GRANT SELECT, INSERT, UPDATE, DELETE
ON public.chat_conversations
TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
ON public.chat_messages
TO authenticated;

-- =================== POLICIES chat_conversations =================
-- El usuario solo puede SELECT / INSERT / UPDATE / DELETE sus propios chats.
-- (user_id === auth.uid())
-- ================================================================
DROP POLICY IF EXISTS chat_conv_select_policy ON public.chat_conversations;
CREATE POLICY chat_conv_select_policy
    ON public.chat_conversations
    FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS chat_conv_insert_policy ON public.chat_conversations;
CREATE POLICY chat_conv_insert_policy
    ON public.chat_conversations
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS chat_conv_update_policy ON public.chat_conversations;
CREATE POLICY chat_conv_update_policy
    ON public.chat_conversations
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS chat_conv_delete_policy ON public.chat_conversations;
CREATE POLICY chat_conv_delete_policy
    ON public.chat_conversations
    FOR DELETE
    USING (auth.uid() = user_id);

-- =================== POLICIES chat_messages ====================
-- El usuario solo puede interactuar con mensajes de SUS conversaciones.
-- (EXISTS JOIN al chat padre y comprobar user_id === auth.uid())
-- ================================================================
DROP POLICY IF EXISTS chat_msg_select_policy ON public.chat_messages;
CREATE POLICY chat_msg_select_policy
    ON public.chat_messages
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM public.chat_conversations c
            WHERE c.id = chat_messages.conversation_id
              AND c.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS chat_msg_insert_policy ON public.chat_messages;
CREATE POLICY chat_msg_insert_policy
    ON public.chat_messages
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.chat_conversations c
            WHERE c.id = chat_messages.conversation_id
              AND c.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS chat_msg_update_policy ON public.chat_messages;
CREATE POLICY chat_msg_update_policy
    ON public.chat_messages
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1
            FROM public.chat_conversations c
            WHERE c.id = chat_messages.conversation_id
              AND c.user_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.chat_conversations c
            WHERE c.id = chat_messages.conversation_id
              AND c.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS chat_msg_delete_policy ON public.chat_messages;
CREATE POLICY chat_msg_delete_policy
    ON public.chat_messages
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1
            FROM public.chat_conversations c
            WHERE c.id = chat_messages.conversation_id
              AND c.user_id = auth.uid()
        )
    );

-- ================================================================
-- FIN DE LA MIGRACIÓN
-- Resultado esperado en SQL Editor: "Success. No rows returned."
-- Después verifica en Table Editor:
--   Tablas: chat_conversations, chat_messages
--   RLS activado (candado verde en ambas).
--   4 policies por tabla.
-- ================================================================
