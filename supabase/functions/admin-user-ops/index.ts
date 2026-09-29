// Privileged user-account operations that need the service_role key (Auth admin API) — the one
// thing db.js/supabase.js can never do client-side with just the anon key. Two actions:
//   - "create": Admin adds a new employee (Employees.jsx) — creates the Supabase Auth account with
//     a freshly generated temp password, email pre-confirmed (no email-confirmation flow, no email
//     infra needed). Returns the new auth user's id + the temp password, once, for Employees.jsx to
//     show Admin on screen — never stored in plaintext anywhere, including here.
//   - "reset_password": Admin resets an existing user's password (Employees.jsx's "Reset Password"
//     button) — generates a new temp password and overwrites the target account's password via the
//     Auth admin API. This is impossible from the browser with only the anon key (Supabase Auth
//     deliberately never lets one account overwrite another's password without either service_role
//     or the target completing an email link themselves) — this function is what makes it possible.
//
// SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are auto-provided by the Supabase
// Edge Functions runtime for every deployed function — nothing to configure manually.
//
// Caller check: every request must carry the calling user's own Supabase session JWT (the
// supabase-js client's `functions.invoke()` does this automatically) — verified via a throwaway
// anon-key client, then cross-checked against `users.role_id === 'r1'` using the service_role
// client. Only an Admin's own JWT can ever reach the privileged branches below.

import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } })
}

// Excludes visually-ambiguous characters (0/O, 1/I/l) since this is meant to be read off a screen
// and retyped/relayed by Admin, not copy-pasted programmatically.
function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  let out = ''
  for (let i = 0; i < 10; i++) out += chars[Math.floor(Math.random() * chars.length)]
  return out
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Missing Authorization header' }, 401)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Identify the caller from their own JWT.
    const callerClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } })
    const { data: { user: callerAuthUser }, error: callerErr } = await callerClient.auth.getUser()
    if (callerErr || !callerAuthUser) return json({ error: 'Not authenticated' }, 401)

    // service_role client — used both for the admin-only role check below and every privileged
    // Auth admin call. RLS is disabled app-wide in this project already (a separate, pre-existing,
    // already-flagged gap) so this isn't bypassing a real RLS boundary — but the role check itself
    // is real: only a caller whose own `users` row is role_id 'r1' ever reaches "create"/
    // "reset_password" below, everyone else gets 403 regardless of what they claim in the body.
    const admin = createClient(supabaseUrl, serviceKey)
    const { data: callerRow, error: callerRowErr } = await admin
      .from('users')
      .select('id, role_id')
      .eq('auth_id', callerAuthUser.id)
      .single()
    if (callerRowErr || callerRow?.role_id !== 'r1') return json({ error: 'Admin only' }, 403)

    const body = await req.json()

    if (body.action === 'create') {
      const { email } = body
      if (!email) return json({ error: 'email required' }, 400)
      const tempPassword = generateTempPassword()
      const { data, error } = await admin.auth.admin.createUser({ email, password: tempPassword, email_confirm: true })
      if (error) return json({ error: error.message }, 400)
      return json({ authId: data.user.id, tempPassword })
    }

    if (body.action === 'reset_password') {
      const { authId } = body
      if (!authId) return json({ error: 'authId required' }, 400)
      const tempPassword = generateTempPassword()
      const { error } = await admin.auth.admin.updateUserById(authId, { password: tempPassword })
      if (error) return json({ error: error.message }, 400)
      return json({ tempPassword })
    }

    return json({ error: 'Unknown action' }, 400)
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Unexpected error' }, 500)
  }
})
