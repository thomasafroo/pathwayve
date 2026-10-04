# Google accounts and private schedules

Anyone can plan a trip or generate an AI schedule. Generation is a preview and
does not persist it. **Save schedule** saves the current version to the signed-in
account. Guests see a Google sign-in dialog; their exact pending document/workspace
and retry UUID stay in this tab's sessionStorage during the redirect. After a
successful login, the application restores and saves that snapshot without
regenerating it. Cancelling login keeps the draft available for retry.

**Log in** and **Sign up** both use Google; a first login creates an account.
**My schedules** lists the latest 30 saves for that account. Sign-out clears the
visible schedule and private list. Edits are not autosaved: Save schedule creates
a new snapshot. Repeated retries with the same request ID return the existing save.

## Configure Google

1. Configure the OAuth consent screen in Google Cloud / Google Auth Platform.
2. Create an OAuth client with application type **Web application**.
3. Register `http://localhost:3000/api/auth/callback/google` as an authorized
   redirect URI. Use the same hostname/port as the app's base URL.
4. Add these server-only settings in `.env` or `.env.local`:

   ```dotenv
   GOOGLE_CLIENT_ID=your-google-oauth-client-id
   GOOGLE_CLIENT_SECRET=your-google-oauth-client-secret
   BETTER_AUTH_SECRET=a-random-secret-at-least-32-characters-long
   BETTER_AUTH_URL=http://localhost:3000
   ```

   Generate the secret with `openssl rand -base64 32`. Keep it stable across
   restarts and across instances. Never add a `NEXT_PUBLIC_` prefix to secrets.

5. Restart the dev server. If Google restricts the app to test users, add the
   Google accounts used for testing in its Audience settings.

Google login requests only basic identity/profile/email permissions. These OAuth
credentials are separate from the existing Google Maps and Gemini API keys.
No Gmail or Calendar access is requested. For production configure a production
OAuth client, HTTPS base URL and matching callback, then run `npm run db:migrate`
against the production PostgreSQL connection before starting the updated app.

References: [Better Auth Google setup](https://better-auth.com/docs/authentication/google)
and [Google web OAuth](https://developers.google.com/identity/protocols/oauth2/web-server).

## Storage and authorization

Better Auth owns `public.auth_users`, `auth_accounts`, `auth_sessions`, and
`auth_verifications`. Provider tokens are encrypted with the auth secret.
The existing `pathwayve.schedules.user_id` now references `auth_users.id`.
All list/read/save routes verify the server session; caller-supplied ownership is
ignored, and saved copies get fresh server-generated IDs. Unknown and other-user
IDs both return 404. Unauthenticated list/read/save requests return 401.
This is application-level authorization; database credentials remain server-only.

The existing schedules/items/runs tables still store schedule documents. The
new `schedules.workspace` JSONB column preserves manual edits and attached tasks.
Guest previews never write to these tables. Old anonymous-cookie saves remain on
disk but are not attached to any account or exposed by the new API. The account
foreign key is `NOT VALID` to retain those legacy rows while enforcing valid users
on new writes. There is no automatic claim of old anonymous data.

Development uses one shared PGlite connection for schedules and authentication.
Its Kysely driver serializes leases, including complete transactions. Production
uses the existing `pg` pool. Local migrations run automatically; remote migrations
run only through the migration command. Auth settings are lazy so public planning
still works before Google credentials are configured.

| Endpoint                      | Access and purpose                                           |
| ----------------------------- | ------------------------------------------------------------ |
| `/api/auth/*`                 | Better Auth Google callbacks, sessions, sign-in and sign-out |
| `POST /api/schedules/preview` | Public generation; no save                                   |
| `POST /api/schedules`         | Authenticated; `{requestId, document, workspace}` snapshot   |
| `GET /api/schedules`          | Authenticated; own latest 30 summaries                       |
| `GET /api/schedules/:id`      | Authenticated; owned `{document, workspace}`                 |

## Verification

`tests/auth.test.ts` uses Better Auth and real in-memory PostgreSQL to check session
verification, account isolation, foreign keys, exact workspace saves, retries,
expired/revoked sessions, cross-origin requests, and Google authorization URLs.
Browser tests mock the Google redirect and verify resume-save, cancellation,
private library access, and sign-out. Completing a real Google consent flow requires
the app's OAuth credentials and a Google account; these tests do not claim to test
Google's external service. Public AI/Maps endpoints still need deployment-level
quota controls/shared rate limiting.
