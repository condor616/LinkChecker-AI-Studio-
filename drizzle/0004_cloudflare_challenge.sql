ALTER TABLE "links" ADD COLUMN IF NOT EXISTS "cloudflare_challenge" boolean DEFAULT false NOT NULL;
ALTER TABLE "links" ADD COLUMN IF NOT EXISTS "bypass_attempted" boolean DEFAULT false NOT NULL;
