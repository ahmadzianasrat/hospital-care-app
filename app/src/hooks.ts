import { useCallback, useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
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

// Asks the database "am I on duty right now?" and re-asks every 30 seconds,
// so access closes on its own when the shift ends.
export function useAccessStatus(session: Session | null) {
  const [status, setStatus] = useState<AccessStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const { data, error } = await supabase.rpc('my_access_status')
    if (error) {
      setError(error.message)
    } else {
      setError(null)
      setStatus((data as AccessStatus[] | null)?.[0] ?? null)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!session) {
      setStatus(null)
      return
    }
    refresh()
    const id = setInterval(refresh, 30_000)
    return () => clearInterval(id)
  }, [session, refresh])

  return { status, error, loading, refresh }
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
