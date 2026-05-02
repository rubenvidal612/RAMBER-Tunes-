type AnyClient = any;

export function createSupabaseAdminClient(): AnyClient {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: null }),
        }),
      }),
      update: () => ({
        eq: async () => ({ data: null, error: null }),
      }),
      insert: async () => ({ data: null, error: null }),
    }),
  };
}

