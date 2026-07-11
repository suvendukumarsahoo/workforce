/**
 * lib/supabase.js
 * Only file that imports Supabase directly.
 * To migrate to AWS: replace this file with your AWS Amplify/API Gateway client.
 * lib/db.js calls this — nothing else does.
 */
import { createClient } from '@supabase/supabase-js'

const url  = import.meta.env.VITE_SUPABASE_URL
const key  = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !key) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in environment variables.')
}

export const supabase = createClient(url, key)
