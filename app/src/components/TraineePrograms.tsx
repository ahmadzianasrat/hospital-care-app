import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { errMsg } from '../lib/format'
import type { EnrollmentRow, StaffRow, TrainingProgramRow, View } from '../types'
import { BackBar, Card, ErrorBox } from './ui'

type Phase = { name: string; mornings_only: boolean } | null

export default function TraineePrograms({ facilityId, go }: { facilityId: string; go: (v: View) => void }) {
  const [programs, setPrograms] = useState<TrainingProgramRow[]>([])
  const [enrollments, setEnrollments] = useState<EnrollmentRow[]>([])
  const [phases, setPhases] = useState<Record<string, Phase>>({})
  const [staff, setStaff] = useState<StaffRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [chosenStaff, setChosenStaff] = useState('')
  const [chosenProgram, setChosenProgram] = useState('')
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10))

  const load = useCallback(async () => {
    const p = await supabase.from('training_programs').select('id, name, total_weeks').eq('facility_id', facilityId)
    setPrograms((p.data ?? []) as TrainingProgramRow[])
    if (p.data?.[0]) setChosenProgram((c) => c || p.data[0].id)

    const e = await supabase.from('enrollments').select('id, staff_id, program_id, start_date, staff:staff_id(id,full_name,app_role,profession,active)').eq('facility_id', facilityId)
    if (e.error) return setError(errMsg(e.error))
    setEnrollments((e.data ?? []) as unknown as EnrollmentRow[])

    const ph: Record<string, Phase> = {}
    for (const row of (e.data ?? [])) {
      const r = await supabase.rpc('get_trainee_phase', { p_staff_id: row.staff_id })
      ph[row.staff_id] = (r.data as Phase[] | null)?.[0] ?? null
    }
    setPhases(ph)

    const s = await supabase.from('staff').select('id, full_name, app_role, profession, active').eq('facility_id', facilityId).eq('active', true).order('full_name')
    setStaff((s.data ?? []) as StaffRow[])
  }, [facilityId])

  useEffect(() => { load() }, [load])

  async function enroll() {
    if (!chosenStaff || !chosenProgram) return
    setBusy(true)
    setError(null)
    const { error } = await supabase.rpc('enroll_trainee', { p_staff_id: chosenStaff, p_program_id: chosenProgram, p_start_date: startDate })
    setBusy(false)
    if (error) return setError(errMsg(error))
    setChosenStaff('')
    load()
  }

  return (
    <div className="space-y-3">
      <BackBar title="Trainee programs" onBack={() => go({ name: 'home' })} />
      <ErrorBox message={error} />

      <Card className="space-y-3">
        <h2 className="font-semibold">Enroll a trainee</h2>
        <select value={chosenStaff} onChange={(e) => setChosenStaff(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-3 text-base bg-white">
          <option value="">Select staff member…</option>
          {staff.map((s) => <option key={s.id} value={s.id}>{s.full_name} ({s.app_role})</option>)}
        </select>
        <select value={chosenProgram} onChange={(e) => setChosenProgram(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-3 text-base bg-white">
          {programs.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.total_weeks} weeks)</option>)}
        </select>
        <label className="block text-sm">
          <span className="text-slate-600">Start date</span>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-base" />
        </label>
        <button onClick={enroll} disabled={!chosenStaff || busy} className="w-full rounded-xl bg-teal-700 text-white font-semibold py-3 disabled:opacity-50">
          {busy ? 'Enrolling…' : 'Enroll'}
        </button>
      </Card>

      <Card className="space-y-2">
        <h2 className="font-semibold">Enrolled trainees</h2>
        {enrollments.length === 0 && <p className="text-sm text-slate-500">No one enrolled yet.</p>}
        {enrollments.map((e) => {
          const ph = phases[e.staff_id]
          return (
            <div key={e.id} className="border-t border-slate-100 pt-2 first:border-0 first:pt-0 text-sm">
              <p className="font-medium">{e.staff?.full_name}</p>
              <p className="text-xs text-slate-500">
                Started {e.start_date}{ph ? ` · ${ph.name}${ph.mornings_only ? ' (mornings only)' : ''}` : ' · phase not found'}
              </p>
            </div>
          )
        })}
      </Card>
    </div>
  )
}
