import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { errMsg } from '../format'
import { useOffline } from './context'
import type { EncounterRow, PatientRow } from '../../types'

// A visit may exist only on this device (queued start_visit, not yet on the server).
// This looks at the server first, then falls back to the local queue, so triage and the
// OPD queue still work while offline.
export function useEncounterView(encounterId: string, userId: string) {
  const { engine, version } = useOffline()
  const [enc, setEnc] = useState<EncounterRow | null | undefined>(undefined) // undefined = still loading
  const [error, setError] = useState<string | null>(null)
  const [source, setSource] = useState<'server' | 'local'>('server')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const local = engine.pendingEncounters(userId).get(encounterId)

      const { data, error } = await supabase
        .from('encounters')
        .select(
          'id, patient_id, facility_id, status, arrived_at, triage_priority, triage_decision, opd_doctor_id, patients(*)',
        )
        .eq('id', encounterId)
        .maybeSingle()

      if (cancelled) return

      if (data) {
        setSource('server')
        // apply any local changes that have not reached the server yet (e.g. triage saved offline)
        const merged = local
          ? { ...(data as unknown as EncounterRow), status: local.status, triage_priority: local.triage_priority, triage_decision: local.triage_decision }
          : (data as unknown as EncounterRow)
        setEnc(merged)
        setError(null)
        return
      }

      if (error && !navigator.onLine) {
        // offline, and this visit only exists locally so far
        if (local) {
          const localPatient = engine.pendingPatients(userId).find((p) => p.id === local.patient_id) as PatientRow | undefined
          setSource('local')
          setEnc({
            id: local.id,
            patient_id: local.patient_id,
            facility_id: local.facility_id,
            status: local.status,
            arrived_at: local.arrived_at,
            triage_priority: local.triage_priority,
            triage_decision: local.triage_decision,
            opd_doctor_id: null,
            patients: (local.patients as PatientRow) ?? localPatient ?? null,
            doctor: null,
          })
          setError(null)
          return
        }
        setEnc(null)
        setError('This visit is only saved on a different device, or you are offline and it has not synced here yet.')
        return
      }

      setEnc(null)
      setError(error ? errMsg(error) : 'Visit not found.')
    })()
    return () => {
      cancelled = true
    }
    // re-run whenever the outbox changes (e.g. sync just completed) so the screen catches up
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [encounterId, userId, version])

  return { enc, error, source }
}
