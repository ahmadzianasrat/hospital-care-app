import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { errMsg } from '../lib/format'
import type { PatientRow, View } from '../types'
import { BackBar, Card, ErrorBox, PatientHeader } from './ui'

type FreeBed = { id: string; code: string; ward: { id: string; name: string } }

export default function AssignBed({
  encounterId, facilityId, go, notify,
}: { encounterId: string; facilityId: string; go: (v: View) => void; notify: (m: string) => void }) {
  const [patient, setPatient] = useState<PatientRow | null>(null)
  const [beds, setBeds] = useState<FreeBed[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    const enc = await supabase.from('encounters').select('patient_id, patients(*)').eq('id', encounterId).maybeSingle()
    if (enc.error) return setError(errMsg(enc.error))
    setPatient((enc.data?.patients as unknown as PatientRow) ?? null)

    const b = await supabase
      .from('beds')
      .select('id, code, ward:wards(id, name)')
      .eq('facility_id', facilityId)
      .eq('active', true)
    const occ = await supabase.from('bed_stays').select('bed_id').eq('facility_id', facilityId).is('to_at', null)
    const occupied = new Set((occ.data ?? []).map((s) => s.bed_id))
    setBeds(((b.data ?? []) as unknown as FreeBed[]).filter((x) => !occupied.has(x.id)))
    setError(null)
  }, [encounterId, facilityId])

  useEffect(() => {
    load()
  }, [load])

  async function assign(bedId: string) {
    setBusy(bedId)
    setError(null)
    const { error } = await supabase.rpc('assign_bed', { p_encounter_id: encounterId, p_bed_id: bedId })
    setBusy(null)
    if (error) {
      setError(errMsg(error))
      load()
    } else {
      notify(`${patient?.display_id} assigned to a bed.`)
      go({ name: 'ward_patient', encounterId })
    }
  }

  return (
    <div className="space-y-3">
      <BackBar title="Assign a bed" onBack={() => go({ name: 'wards' })} />
      {patient && <PatientHeader patient={patient} />}
      <ErrorBox message={error} />
      {beds === null && <p className="text-slate-500">Loading…</p>}
      {beds?.length === 0 && <Card><p className="text-sm text-slate-600">No free beds right now.</p></Card>}
      <div className="grid grid-cols-2 gap-2">
        {beds?.map((b) => (
          <button
            key={b.id} onClick={() => assign(b.id)} disabled={busy !== null}
            className="rounded-xl bg-white shadow p-4 text-left disabled:opacity-50"
          >
            <p className="text-xs text-slate-500">{b.ward?.name}</p>
            <p className="font-semibold">Bed {b.code}</p>
          </button>
        ))}
      </div>
    </div>
  )
}
