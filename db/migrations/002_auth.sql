-- Better Auth core tables. UUIDs also match schedules.user_id.
CREATE TABLE IF NOT EXISTS public.auth_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  "emailVerified" BOOLEAN NOT NULL DEFAULT false,
  image TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.auth_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL REFERENCES public.auth_users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_sessions_user_idx ON public.auth_sessions("userId");
CREATE TABLE IF NOT EXISTS public.auth_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL REFERENCES public.auth_users(id) ON DELETE CASCADE,
  "accountId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "accessToken" TEXT,
  "refreshToken" TEXT,
  "idToken" TEXT,
  "accessTokenExpiresAt" TIMESTAMPTZ,
  "refreshTokenExpiresAt" TIMESTAMPTZ,
  scope TEXT,
  password TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE("providerId", "accountId")
);
CREATE INDEX IF NOT EXISTS auth_accounts_user_idx ON public.auth_accounts("userId");
CREATE TABLE IF NOT EXISTS public.auth_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_verifications_identifier_idx ON public.auth_verifications(identifier);

ALTER TABLE pathwayve.schedules ADD COLUMN IF NOT EXISTS workspace JSONB;
-- Keep legacy anonymous saves on disk, but do not expose them to accounts.
-- NOT VALID preserves those old rows while enforcing account ownership for new writes.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'schedules_account_fk'
    AND conrelid = 'pathwayve.schedules'::regclass) THEN
    ALTER TABLE pathwayve.schedules ADD CONSTRAINT schedules_account_fk
      FOREIGN KEY (user_id) REFERENCES public.auth_users(id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;
