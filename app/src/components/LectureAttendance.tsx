import { useCallback, useEffect, useState } from 'react'
import { supabase, FACILITY_TZ } from '../lib/supabase'
import { errMsg } from '../lib/format'
import type { EnrollmentRow, LectureSessionRow, View } from '../types'
import { BackBar, Card, ErrorBox } from './ui'

const dt = (iso: string) => new Date(iso).toLocaleString('en-GB', { timeZone: FACILITY_TZ, dateStyle: 'medium', timeStyle: 'short' })
const STATUSES: { value: 'present' | 'absent' | 'excused'; label: string }[] = [
  { value: 'present', label: 'Present' }, { value: 'absent', label: 'Absent' }, { value: 'excused', label: 'Excused' },
]

export default function LectureAttendance({ sessionId, go }: { sessionId: string; go: (v: View) => void }) {
  const [session, setSession] = useState<LectureSessionRow | null>(null)
  const [trainees, setTrainees] = useState<EnrollmentRow[]>([])
  const [marks, setMarks] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const s = await supabase.from('lecture_sessions').select('*').eq('id', sessionId).maybeSingle()
    if (s.error) return setError(errMsg(s.error))
    if (!s.data) return setError('Lecture not found.')
    setSession(s.data as LectureSessionRow)

    const e = await supabase.from('enrollments').select('id, staff_id, program_id, start_date, staff:staff_id(id,full_name,app_role,profession,active)').eq('program_id', s.data.program_id)
    setTrainees((e.data ?? []) as unknown as EnrollmentRow[])

    const a = await supabase.from('lecture_attendance').select('staff_id, status').eq('session_id', sessionId)
    const m: Record<string, string> = {}
    for (const row of a.data ?? []) m[row.staff_id] = row.status
    setMarks(m)
  }, [sessionId])

  useEffect(() => { load() }, [load])

  async function mark(staffId: string, status: string) {
    setBusyId(staffId)
    const { error } = await supabase.rpc('record_attendance', { p_session_id: sessionId, p_staff_id: staffId, p_status: status })
    setBusyId(null)
    if (error) setError(errMsg(error))
    else setMarks((m) => ({ ...m, [staffId]: status }))
  }

  if (error && !session) {
    return (
      <div className="space-y-3">
        <BackBar title="Attendance" onBack={() => go({ name: 'trainer_hub' })} />
        <ErrorBox message={error} />
      </div>
    )
  }
  if (!session) return <p className="text-slate-500">Loading…</p>

  return (
    <div className="space-y-3">
      <BackBar title="Attendance" onBack={() => go({ name: 'trainer_hub' })} />
      <Card>
        <p className="font-semibold">{session.topic}</p>
        <p className="text-sm text-slate-500">{dt(session.scheduled_at)} · {session.duration_minutes} min</p>
      </Card>
      <ErrorBox message={error} />
      {trainees.length === 0 && <Card><p className="text-sm text-slate-600">No one enrolled in this program.</p></Card>}
      {trainees.map((t) => (
        <Card key={t.staff_id} className="space-y-2">
          <p className="font-medium">{t.staff?.full_name}</p>
          <div className="flex gap-2">
            {STATUSES.map((s) => (
              <button
                key={s.value} onClick={() => mark(t.staff_id, s.value)} disabled={busyId === t.staff_id}
                className={`flex-1 rounded-lg py-2 text-xs font-medium border disabled:opacity-50 ${marks[t.staff_id] === s.value ? 'bg-teal-700 text-white border-teal-700' : 'bg-white border-slate-300'}`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </Card>
      ))}
    </div>
  )
}
