import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { ageSex, errMsg } from '../lib/format'
import type { BedRow, PatientRow, View, WardRow } from '../types'
import { BackBar, Card, ErrorBox } from './ui'

type BoardBed = BedRow & {
  patient?: PatientRow
  encounterId?: string
  pendingTasks?: number
  overdueTasks?: number
}

export default function WardBoard({ wardId, go }: { wardId: string; go: (v: View) => void }) {
  const [ward, setWard] = useState<WardRow | null>(null)
  const [beds, setBeds] = useState<BoardBed[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const w = await supabase.from('wards').select('id, code, name').eq('id', wardId).maybeSingle()
    if (w.error) return setError(errMsg(w.error))
    setWard(w.data as WardRow)

    const b = await supabase.from('beds').select('id, ward_id, code, active').eq('ward_id', wardId).eq('active', true).order('code')
    if (b.error) return setError(errMsg(b.error))
    const bedIds = (b.data ?? []).map((x) => x.id)

    const stays = bedIds.length
      ? await supabase.from('bed_stays').select('bed_id, encounter_id').in('bed_id', bedIds).is('to_at', null)
      : { data: [] as { bed_id: string; encounter_id: string }[] }
    const encIds = (stays.data ?? []).map((s) => s.encounter_id)

    const encs = encIds.length
      ? await supabase.from('encounters').select('id, patient_id, patients(*)').in('id', encIds)
      : { data: [] as { id: string; patients: PatientRow }[] }
    const patientByEnc = new Map((encs.data ?? []).map((e) => [e.id, e.patients as PatientRow]))

    const tasks = encIds.length
      ? await supabase.from('tasks').select('encounter_id, due_at, status').in('encounter_id', encIds).eq('status', 'pending')
      : { data: [] as { encounter_id: string; due_at: string; status: string }[] }
    const now = Date.now()

    const rows: BoardBed[] = (b.data ?? []).map((bed) => {
      const stay = stays.data?.find((s) => s.bed_id === bed.id)
      const encounterId = stay?.encounter_id
      const patient = encounterId ? patientByEnc.get(encounterId) : undefined
      const myTasks = (tasks.data ?? []).filter((t) => t.encounter_id === encounterId)
      return {
        ...bed, patient, encounterId,
        pendingTasks: myTasks.length,
        overdueTasks: myTasks.filter((t) => new Date(t.due_at).getTime() < now).length,
      }
    })
    setBeds(rows)
    setError(null)
  }, [wardId])

  useEffect(() => {
    load()
    const id = setInterval(load, 20_000)
    return () => clearInterval(id)
  }, [load])

  return (
    <div className="space-y-3">
      <BackBar title={ward?.name ?? 'Ward'} onBack={() => go({ name: 'wards' })} />
      {ward && beds && beds.some((b) => b.patient) && (
        <button onClick={() => go({ name: 'round_mode', wardId })} className="w-full rounded-xl bg-teal-700 text-white font-semibold py-3">
          Start round
        </button>
      )}
      <ErrorBox message={error} />
      {beds === null && <p className="text-slate-500">Loading…</p>}
      <div className="space-y-2">
        {beds?.map((bed) => (
          <button
            key={bed.id}
            onClick={() => bed.encounterId && go({ name: 'ward_patient', encounterId: bed.encounterId })}
            disabled={!bed.encounterId}
            className={`w-full text-left rounded-xl shadow p-3 ${bed.patient ? 'bg-white' : 'bg-slate-100 opacity-70'}`}
          >
            <div className="flex justify-between items-center">
              <span className="text-xs font-semibold text-slate-500">Bed {bed.code}</span>
              {bed.overdueTasks! > 0 && (
                <span className="text-xs font-semibold bg-red-100 text-red-800 rounded-full px-2 py-0.5">
                  {bed.overdueTasks} overdue
                </span>
              )}
            </div>
            {bed.patient ? (
              <>
                <p className="font-medium">
                  <span className="font-mono font-bold text-teal-800">{bed.patient.display_id}</span> · {bed.patient.full_name}
                </p>
                <p className="text-xs text-slate-500">
                  {ageSex(bed.patient.age_years, bed.patient.sex)}
                  {bed.patient.allergy_status === 'known' && <span className="text-red-700 font-semibold"> · Allergy</span>}
                  {bed.pendingTasks ? ` · ${bed.pendingTasks} task(s) due` : ''}
                </p>
              </>
            ) : (
              <p className="text-sm text-slate-500">Empty</p>
            )}
          </button>
        ))}
        {beds && beds.length === 0 && <Card><p className="text-sm text-slate-600">No beds set up in this ward yet.</p></Card>}
      </div>
    </div>
  )
}
