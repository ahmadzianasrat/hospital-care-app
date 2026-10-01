import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { errMsg } from '../lib/format'
import type { EncounterRow, PatientRow, View, WardRow } from '../types'
import { BackBar, Card, ErrorBox } from './ui'

type WardCount = WardRow & { total: number; occupied: number }

export default function WardList({ facilityId, go }: { facilityId: string; go: (v: View) => void }) {
  const [wards, setWards] = useState<WardCount[] | null>(null)
  const [unassigned, setUnassigned] = useState<EncounterRow[]>([])
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const w = await supabase.from('wards').select('id, code, name').eq('facility_id', facilityId).order('code')
    if (w.error) return setError(errMsg(w.error))
    const beds = await supabase.from('beds').select('id, ward_id, active').eq('facility_id', facilityId)
    const stays = await supabase.from('bed_stays').select('bed_id').eq('facility_id', facilityId).is('to_at', null)
    const occupiedBeds = new Set((stays.data ?? []).map((s) => s.bed_id as string))
    const counts = (w.data ?? []).map((ward) => {
      const wardBeds = (beds.data ?? []).filter((b) => b.ward_id === ward.id && b.active)
      return { ...ward, total: wardBeds.length, occupied: wardBeds.filter((b) => occupiedBeds.has(b.id)).length }
    })
    setWards(counts)

    const e = await supabase
      .from('encounters')
      .select('id, patient_id, facility_id, status, arrived_at, triage_priority, triage_decision, opd_doctor_id, patients(*)')
      .eq('facility_id', facilityId)
      .eq('status', 'admitted')
    const admitted = (e.data ?? []) as unknown as EncounterRow[]
    const bedded = new Set((await supabase.from('bed_stays').select('encounter_id').eq('facility_id', facilityId).is('to_at', null)).data?.map((s) => s.encounter_id) ?? [])
    setUnassigned(admitted.filter((x) => !bedded.has(x.id)))
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
        <h1 className="text-lg font-bold">Wards</h1>
        <button onClick={load} className="text-sm rounded-lg bg-white border border-slate-300 px-3 py-2">Refresh</button>
      </div>
      <ErrorBox message={error} />

      {unassigned.length > 0 && (
        <Card className="border-2 border-amber-400 bg-amber-50 space-y-2">
          <h2 className="font-semibold text-amber-900">Admitted, waiting for a bed ({unassigned.length})</h2>
          {unassigned.map((e) => {
            const p = e.patients as PatientRow
            return (
              <button
                key={e.id} onClick={() => go({ name: 'assign_bed', encounterId: e.id })}
                className="w-full text-left bg-white rounded-xl p-3 shadow"
              >
                <span className="font-mono font-bold text-teal-800">{p?.display_id}</span> · {p?.full_name}
              </button>
            )
          })}
        </Card>
      )}

      {wards === null && <p className="text-slate-500">Loading…</p>}
      {wards?.map((w) => (
        <button key={w.id} onClick={() => go({ name: 'ward', wardId: w.id })} className="w-full text-left bg-white rounded-xl shadow p-4">
          <div className="flex justify-between items-center">
            <p className="font-semibold">{w.name}</p>
            <span className="text-sm font-mono">{w.occupied}/{w.total} beds</span>
          </div>
        </button>
      ))}
      {wards && wards.length === 0 && <Card><p className="text-sm text-slate-600">No wards set up yet.</p></Card>}
      <BackBar title="" onBack={() => go({ name: 'home' })} />
    </div>
  )
}
