import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { ageSex, errMsg, priorityRank, vitalsLine, waitLabel } from '../lib/format'
import { useNow } from '../hooks'
import type { EncounterRow, TriageData, View } from '../types'
import { Card, ErrorBox, PriorityBadge } from './ui'

type Row = EncounterRow & { triage?: TriageData | null }

export default function OpdQueue({
  facilityId, staffId, go,
}: { facilityId: string; staffId: string; go: (v: View) => void }) {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const now = useNow(30_000)

  const load = useCallback(async () => {
    const enc = await supabase
      .from('encounters')
      .select(
        'id, patient_id, facility_id, status, arrived_at, triage_priority, triage_decision, opd_doctor_id, patients(*), doctor:staff!opd_doctor_id(full_name)',
      )
      .eq('facility_id', facilityId)
      .in('status', ['waiting_opd', 'in_opd'])
    if (enc.error) return setError(errMsg(enc.error))
    const list = (enc.data ?? []) as unknown as Row[]

    const ids = list.map((r) => r.id)
    if (ids.length > 0) {
      const docs = await supabase
        .from('documents')
        .select('encounter_id, data')
        .eq('doc_type', 'first_assessment')
        .in('encounter_id', ids)
      const byEnc = new Map((docs.data ?? []).map((d) => [d.encounter_id as string, d.data as TriageData]))
      list.forEach((r) => (r.triage = byEnc.get(r.id) ?? null))
    }
    // most urgent first, then longest waiting
    list.sort((a, b) => priorityRank(a.triage_priority) - priorityRank(b.triage_priority) || a.arrived_at.localeCompare(b.arrived_at))
    setError(null)
    setRows(list)
  }, [facilityId])

  useEffect(() => {
    load()
    const id = setInterval(load, 15_000)
    return () => clearInterval(id)
  }, [load])

  async function take(encId: string) {
    setBusyId(encId)
    setError(null)
    const { error } = await supabase.rpc('claim_opd', { p_encounter_id: encId })
    setBusyId(null)
    if (error) {
      setError(errMsg(error))
      load()
    } else go({ name: 'opd_visit', encounterId: encId })
  }

  const waiting = rows?.filter((r) => r.status === 'waiting_opd') ?? []
  const inOpd = rows?.filter((r) => r.status === 'in_opd') ?? []

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">OPD queue</h1>
        <button onClick={load} className="text-sm rounded-lg bg-white border border-slate-300 px-3 py-2">Refresh</button>
      </div>
      <ErrorBox message={error} />
      {rows === null && <p className="text-slate-500">Loading…</p>}

      {inOpd.length > 0 && (
        <>
          <h2 className="text-sm font-semibold text-slate-600">Being seen</h2>
          {inOpd.map((r) => {
            const mine = r.opd_doctor_id === staffId
            return (
              <Card key={r.id} className="space-y-1">
                <Header r={r} now={now} />
                <p className="text-xs text-slate-600">{mine ? 'With you' : `With ${r.doctor?.full_name ?? 'another doctor'}`}</p>
                {mine && (
                  <button onClick={() => go({ name: 'opd_visit', encounterId: r.id })} className="w-full rounded-xl bg-teal-700 text-white font-semibold py-3">
                    Continue
                  </button>
                )}
              </Card>
            )
          })}
        </>
      )}

      <h2 className="text-sm font-semibold text-slate-600">Waiting ({waiting.length})</h2>
      {rows && waiting.length === 0 && (
        <Card><p className="text-sm text-slate-600">Nobody is waiting for the doctor.</p></Card>
      )}
      {waiting.map((r) => (
        <Card key={r.id} className="space-y-2">
          <Header r={r} now={now} />
          {r.triage?.injury_description && <p className="text-sm">{r.triage.injury_description}</p>}
          <p className="text-xs text-slate-600">{vitalsLine(r.triage)}</p>
          <button
            onClick={() => take(r.id)}
            disabled={busyId === r.id}
            className="w-full rounded-xl bg-teal-700 text-white font-semibold py-3 disabled:opacity-60"
          >
            {busyId === r.id ? 'Opening…' : 'See this patient'}
          </button>
        </Card>
      ))}
    </div>
  )
}

function Header({ r, now }: { r: Row; now: Date }) {
  return (
    <>
      <div className="flex items-center justify-between">
        <span className="font-mono font-bold text-teal-800">{r.patients?.display_id}</span>
        <PriorityBadge priority={r.triage_priority} />
      </div>
      <div className="flex items-center justify-between">
        <p className="font-medium">{r.patients?.full_name}</p>
        <p className="text-xs text-slate-500">{ageSex(r.patients?.age_years, r.patients?.sex)} · {waitLabel(r.arrived_at, now)}</p>
      </div>
      {r.patients?.allergy_status === 'known' && (
        <p className="text-xs font-semibold text-red-700">Allergy: {r.patients.allergy_details}</p>
      )}
    </>
  )
}
