import { useCallback, useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { get, set } from 'idb-keyval'
import { supabase } from './lib/supabase'
import { classify } from './lib/offline/engine'
import type { AccessStatus } from './types'

export function useSession() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  return { session, loading }
}

const CACHE_KEY = 'access_status_cache'

// Asks the database "am I on duty right now?" and re-asks every 30 seconds, so access closes on
// its own when the shift ends. IMPORTANT: a network failure here must NOT hide the whole app -
// it only means we can't re-confirm duty status right now. We keep showing the last answer we
// got (cached on the device, so it survives an offline page reload too) and mark it "stale".
// A real error (wrong permissions, corrupted data) still surfaces normally.
export function useAccessStatus(session: Session | null) {
  const [status, setStatus] = useState<AccessStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [stale, setStale] = useState(false)
  const [checkedAt, setCheckedAt] = useState<string | null>(null)
  const gotOneYet = useRef(false)

  const refresh = useCallback(async () => {
    const { data, error } = await supabase.rpc('my_access_status')

    if (error) {
      const kind = classify({ message: error.message, code: error.code })

      if (kind === 'network' && gotOneYet.current) {
        // Offline (or the connection is bad) after we already knew who this is: keep going with
        // what we last confirmed. SyncBar already tells the person they are offline.
        setStale(true)
        setLoading(false)
        return
      }

      if (kind === 'network' && !gotOneYet.current) {
        // Never confirmed anything yet in this browser tab (e.g. the page was reloaded while
        // offline). Fall back to whatever was cached from the last time it worked.
        const cached = await get<{ status: AccessStatus; at: string }>(CACHE_KEY).catch(() => undefined)
        if (cached) {
          setStatus(cached.status)
          setCheckedAt(cached.at)
          setStale(true)
          gotOneYet.current = true
          setError(null)
        } else {
          setError('No internet connection, and nothing saved on this device yet. Connect once to sign in.')
        }
        setLoading(false)
        return
      }

      // Not a network problem: a real error. Show it.
      setError(error.message)
      setLoading(false)
      return
    }

    setError(null)
    setStale(false)
    const row = (data as AccessStatus[] | null)?.[0] ?? null
    setStatus(row)
    const now = new Date().toISOString()
    setCheckedAt(now)
    gotOneYet.current = true
    setLoading(false)
    if (row) set(CACHE_KEY, { status: row, at: now }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!session) {
      setStatus(null)
      gotOneYet.current = false
      return
    }
    refresh()
    const id = setInterval(refresh, 30_000)
    return () => clearInterval(id)
  }, [session, refresh])

  return { status, error, loading, refresh, stale, checkedAt }
}

// Shared ward tablets: sign out automatically after a period of no touching.
export function useIdleLogout(enabled: boolean, minutes: number) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!enabled) return
    const reset = () => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => supabase.auth.signOut(), minutes * 60_000)
    }
    const events = ['pointerdown', 'keydown', 'touchstart'] as const
    events.forEach((e) => window.addEventListener(e, reset))
    reset()
    return () => {
      events.forEach((e) => window.removeEventListener(e, reset))
      if (timer.current) clearTimeout(timer.current)
    }
  }, [enabled, minutes])
}

export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

// Number of referrals sent TO this facility that nobody has acknowledged yet.
export function useIncomingReferralCount(facilityId: string, enabled: boolean) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    if (!enabled) return
    let stop = false
    const load = async () => {
      const { count } = await supabase
        .from('referrals')
        .select('id', { count: 'exact', head: true })
        .eq('to_facility_id', facilityId)
        .eq('status', 'sent')
      if (!stop) setCount(count ?? 0)
    }
    load()
    const id = setInterval(load, 30_000)
    return () => {
      stop = true
      clearInterval(id)
    }
  }, [facilityId, enabled])
  return count
}
