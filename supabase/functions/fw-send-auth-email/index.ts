import { createHandler } from './handler.mjs';
import { verifyPayload } from './webhook.ts';

// Supabase Auth uses a Standard Webhooks signature, not an end-user JWT.
// Keep verify_jwt=false and verify the raw request before using any payload field.
const handler = createHandler({
  env: (name: string) => Deno.env.get(name),
  verify: verifyPayload,
});

Deno.serve(handler);
