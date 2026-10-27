import { Webhook } from 'npm:standardwebhooks@1.0.0';

export function verifyPayload(body: string, headers: Record<string, string>, secret: string) {
  return new Webhook(secret.replace(/^v1,/, '')).verify(body, headers);
}
