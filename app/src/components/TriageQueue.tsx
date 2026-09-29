import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { ageSex, errMsg, waitLabel } from '../lib/format'
import { useNow } from '../hooks'
import { useOffline } from '../lib/offline/context'
import type { EncounterRow, PatientRow, View } from '../types'
import { Card, ErrorBox } from './ui'

export default function TriageQueue({ facilityId, staffId, go }: { facilityId: string; staffId: string; go: (v: View) => void }) {
  const { engine, version } = useOffline()
  void version // re-render when the offline queue changes
  const [rows, setRows] = useState<EncounterRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const now = useNow(30_000)

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('encounters')
      .select('id, patient_id, facility_id, status, arrived_at, triage_priority, triage_decision, opd_doctor_id, patients(*)')
      .eq('facility_id', facilityId)
      .eq('status', 'waiting_triage')
      .order('arrived_at')
    if (error) setError(errMsg(error))
    else {
      setError(null)
      setRows((data ?? []) as unknown as EncounterRow[])
    }
  }, [facilityId])

  useEffect(() => {
    load()
    const id = setInterval(load, 15_000) // refresh every 15 seconds
    return () => clearInterval(id)
  }, [load])

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">Waiting for triage</h1>
        <button onClick={load} className="text-sm rounded-lg bg-white border border-slate-300 px-3 py-2">Refresh</button>
      </div>
      <ErrorBox message={error} />
      {rows === null && <p className="text-slate-500">Loading…</p>}
      {rows?.length === 0 && (
        <Card><p className="text-sm text-slate-600">Nobody is waiting. Register a patient to start a visit.</p></Card>
      )}
      <ul className="space-y-2">
        {rows?.map((e) => (
          <li key={e.id}>
            <button
              onClick={() => go({ name: 'triage_form', encounterId: e.id })}
              className="w-full text-left bg-white rounded-xl shadow p-3"
            >
              <div className="flex justify-between">
                <span className="font-mono font-bold text-teal-800">{e.patients?.display_id}</span>
                <span className="text-sm font-semibold text-amber-700">Waiting {waitLabel(e.arrived_at, now)}</span>
              </div>
              <p className="font-medium">{e.patients?.full_name}</p>
              <p className="text-xs text-slate-500">{ageSex(e.patients?.age_years, e.patients?.sex)}</p>
            </button>
          </li>
        ))}
        {[...engine.pendingEncounters(staffId).values()]
          .filter((e) => e.status === 'waiting_triage' && e.facility_id === facilityId)
          .map((e) => {
            const p = e.patients as PatientRow | undefined
            return (
              <li key={e.id}>
                <button
                  onClick={() => go({ name: 'triage_form', encounterId: e.id })}
                  className="w-full text-left bg-white rounded-xl shadow p-3 border-2 border-dashed border-slate-300"
                >
                  <div className="flex justify-between">
                    <span className="font-mono font-bold text-teal-800">{p?.display_id}</span>
                    <span className="text-xs font-semibold text-slate-500">Saved on this phone</span>
                  </div>
                  <p className="font-medium">{p?.full_name}</p>
                </button>
              </li>
            )
          })}
      </ul>
      <button onClick={() => go({ name: 'patients' })} className="w-full rounded-xl bg-white border border-slate-300 py-3">
        Register / find a patient
      </button>
    </div>
  )
}
