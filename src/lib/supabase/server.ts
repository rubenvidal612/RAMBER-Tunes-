type AnyClient = any;

export async function createSupabaseServerClient(): Promise<AnyClient> {
  return {
    auth: {
      getUser: async () => ({ data: { user: null } }),
    },
    from: () => ({
      insert: async () => ({ data: null, error: null }),
      select: async () => ({ data: null, error: null }),
      update: async () => ({ data: null, error: null }),
      eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
      maybeSingle: async () => ({ data: null, error: null }),
    }),
  };
}

