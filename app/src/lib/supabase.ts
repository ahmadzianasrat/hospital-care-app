import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isConfigured = Boolean(url && key)

// Placeholders keep the app from crashing when .env is missing; App.tsx shows a setup message instead.
export const supabase = createClient(url ?? 'http://localhost', key ?? 'missing-key')

// All facilities use Afghanistan time (matches the database).
export const FACILITY_TZ = 'Asia/Kabul'
