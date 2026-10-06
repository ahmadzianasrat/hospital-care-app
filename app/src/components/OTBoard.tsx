import { useCallback, useEffect, useState } from 'react'
import { supabase, FACILITY_TZ } from '../lib/supabase'
import { ageSex, errMsg } from '../lib/format'
import type { EncounterRow, PatientRow, SurgeryRow, TheatreRow, View } from '../types'
import { BackBar, Card, ErrorBox } from './ui'

const dt = (iso: string) => new Date(iso).toLocaleString('en-GB', { timeZone: FACILITY_TZ, dateStyle: 'short', timeStyle: 'short' })

const URGENCY_STYLE: Record<string, string> = { emergency: 'bg-red-100 text-red-800', elective: 'bg-slate-100 text-slate-700' }

export default function OTBoard({ facilityId, go, readOnly = false }: { facilityId: string; go: (v: View) => void; readOnly?: boolean }) {
  const [theatres, setTheatres] = useState<TheatreRow[]>([])
  const [cases, setCases] = useState<SurgeryRow[]>([])
  const [unbooked, setUnbooked] = useState<EncounterRow[]>([])
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const t = await supabase.from('theatres').select('*').eq('facility_id', facilityId).eq('active', true).order('code')
    if (t.error) return setError(errMsg(t.error))
    setTheatres((t.data ?? []) as TheatreRow[])

    const since = new Date(Date.now() - 6 * 3600_000).toISOString()
    const s = await supabase
      .from('surgeries')
      .select('*, theatres(*), surgeon:staff!surgeon_id(full_name), encounters(patients(*))')
      .eq('facility_id', facilityId)
      .in('status', ['scheduled', 'in_progress'])
      .gte('scheduled_start', since)
      .order('scheduled_start')
    if (s.error) return setError(errMsg(s.error))
    setCases((s.data ?? []) as unknown as SurgeryRow[])

    const e = await supabase
      .from('encounters')
      .select('id, patient_id, facility_id, status, arrived_at, triage_priority, triage_decision, opd_doctor_id, patients(*)')
      .eq('facility_id', facilityId)
      .eq('status', 'admitted')
    const admitted = (e.data ?? []) as unknown as EncounterRow[]
    const booked = new Set((s.data ?? []).map((x) => x.encounter_id))
    setUnbooked(admitted.filter((x) => !booked.has(x.id)))
    setError(null)
  }, [facilityId])

  useEffect(() => {
    load()
    const id = setInterval(load, 20_000)
    return () => clearInterval(id)
  }, [load])

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">Operating theatre</h1>
        <button onClick={load} className="text-sm rounded-lg bg-white border border-slate-300 px-3 py-2">Refresh</button>
      </div>
      <ErrorBox message={error} />

      {unbooked.length > 0 && (
        <Card className="border-2 border-amber-400 bg-amber-50 space-y-2">
          <h2 className="font-semibold text-amber-900">Admitted, not yet booked for surgery ({unbooked.length})</h2>
          {unbooked.map((e) => {
            const p = e.patients as PatientRow
            return readOnly ? (
              <div key={e.id} className="w-full bg-white rounded-xl p-3 shadow opacity-75">
                <span className="font-mono font-bold text-teal-800">{p?.display_id}</span> · {p?.full_name}
                <span className="text-xs text-slate-500"> · {ageSex(p?.age_years, p?.sex)}</span>
              </div>
            ) : (
              <button key={e.id} onClick={() => go({ name: 'book_surgery', encounterId: e.id })} className="w-full text-left bg-white rounded-xl p-3 shadow">
                <span className="font-mono font-bold text-teal-800">{p?.display_id}</span> · {p?.full_name}
                <span className="text-xs text-slate-500"> · {ageSex(p?.age_years, p?.sex)}</span>
              </button>
            )
          })}
        </Card>
      )}

      <h2 className="text-sm font-semibold text-slate-600">Upcoming and in-progress cases</h2>
      {cases.length === 0 && <Card><p className="text-sm text-slate-600">Nothing booked.</p></Card>}
      {theatres.map((t) => {
        const rows = cases.filter((c) => c.theatre_id === t.id)
        if (rows.length === 0) return null
        return (
          <div key={t.id} className="space-y-2">
            <p className="text-xs font-semibold text-slate-500">{t.name}</p>
            {rows.map((c) => {
              const p = c.encounters?.patients
              const Wrapper = readOnly ? 'div' : 'button'
              return (
                <Wrapper key={c.id} onClick={readOnly ? undefined : () => go({ name: 'surgery_detail', surgeryId: c.id })} className={`w-full text-left bg-white rounded-xl shadow p-3 ${readOnly ? 'opacity-75' : ''}`}>
                  <div className="flex justify-between items-center">
                    <span className="font-mono font-bold text-teal-800">{p?.display_id}</span>
                    <span className={`text-xs font-semibold rounded-full px-2 py-0.5 ${URGENCY_STYLE[c.urgency]}`}>{c.urgency}</span>
                  </div>
                  <p className="text-sm">{p?.full_name} · {c.planned_procedure}</p>
                  <p className="text-xs text-slate-500">
                    {c.status === 'in_progress' ? 'In progress since ' + dt(c.actual_start ?? c.scheduled_start) : dt(c.scheduled_start)}
                    {' · Dr ' + (c.surgeon?.full_name ?? '')}
                  </p>
                </Wrapper>
              )
            })}
          </div>
        )
      })}
      <BackBar title="" onBack={() => go({ name: 'home' })} />
    </div>
  )
}
