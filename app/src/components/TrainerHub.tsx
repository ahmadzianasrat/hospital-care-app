import { useCallback, useEffect, useState } from 'react'
import { supabase, FACILITY_TZ } from '../lib/supabase'
import { errMsg } from '../lib/format'
import { ASSESSMENT_LABELS, type AssessmentRow, type EnrollmentRow, type LectureSessionRow, type TrainingProgramRow, type View } from '../types'
import { BackBar, Card, Choice, ErrorBox, NumField, TextArea } from './ui'

const dt = (iso: string) => new Date(iso).toLocaleString('en-GB', { timeZone: FACILITY_TZ, dateStyle: 'short', timeStyle: 'short' })

export default function TrainerHub({ facilityId, go }: { facilityId: string; go: (v: View) => void }) {
  const [programs, setPrograms] = useState<TrainingProgramRow[]>([])
  const [program, setProgram] = useState('')
  const [sessions, setSessions] = useState<LectureSessionRow[]>([])
  const [trainees, setTrainees] = useState<EnrollmentRow[]>([])
  const [assessments, setAssessments] = useState<AssessmentRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [topic, setTopic] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [duration, setDuration] = useState('60')

  const [assessStaff, setAssessStaff] = useState('')
  const [assessType, setAssessType] = useState('after_lectures')
  const [score, setScore] = useState('')
  const [maxScore, setMaxScore] = useState('100')
  const [note, setNote] = useState('')

  const load = useCallback(async () => {
    const p = await supabase.from('training_programs').select('id, name, total_weeks').eq('facility_id', facilityId)
    setPrograms((p.data ?? []) as TrainingProgramRow[])
    const pid = program || p.data?.[0]?.id || ''
    if (!program && pid) setProgram(pid)
    if (!pid) return

    const s = await supabase.from('lecture_sessions').select('id, program_id, topic, scheduled_at, duration_minutes').eq('program_id', pid).order('scheduled_at', { ascending: false }).limit(10)
    setSessions((s.data ?? []) as LectureSessionRow[])

    const e = await supabase.from('enrollments').select('id, staff_id, program_id, start_date, staff:staff_id(id,full_name,app_role,profession,active)').eq('program_id', pid)
    setTrainees((e.data ?? []) as unknown as EnrollmentRow[])

    const a = await supabase.from('assessments').select('*').eq('program_id', pid).order('scheduled_at', { ascending: false }).limit(20)
    if (a.error) setError(errMsg(a.error))
    else setAssessments((a.data ?? []) as AssessmentRow[])
  }, [facilityId, program])

  useEffect(() => { load() }, [load])

  async function schedule() {
    if (!program || !date || !time || topic.trim().length < 2) return
    setBusy(true)
    setError(null)
    const { error } = await supabase.rpc('schedule_lecture', {
      p_program_id: program, p_topic: topic.trim(), p_scheduled_at: new Date(`${date}T${time}`).toISOString(), p_duration_minutes: Number(duration),
    })
    setBusy(false)
    if (error) return setError(errMsg(error))
    setTopic(''); setDate(''); setTime('')
    load()
  }

  async function saveAssessment() {
    if (!assessStaff || score.trim() === '') return
    setBusy(true)
    setError(null)
    const { error } = await supabase.rpc('record_assessment', {
      p_program_id: program, p_staff_id: assessStaff, p_assessment_type: assessType,
      p_score: Number(score), p_max_score: Number(maxScore), p_note: note.trim() || null,
    })
    setBusy(false)
    if (error) return setError(errMsg(error))
    setScore(''); setNote('')
    load()
  }

  return (
    <div className="space-y-3">
      <BackBar title="Trainer" onBack={() => go({ name: 'home' })} />
      <ErrorBox message={error} />

      <select value={program} onChange={(e) => setProgram(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-3 text-base bg-white">
        {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>

      <Card className="space-y-3">
        <h2 className="font-semibold">Schedule a lecture</h2>
        <TextArea label="Topic" value={topic} onChange={setTopic} rows={2} required />
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="text-slate-600">Date</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-base" />
          </label>
          <label className="block text-sm">
            <span className="text-slate-600">Time</span>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-base" />
          </label>
        </div>
        <NumField label="Duration" unit="minutes" value={duration} onChange={setDuration} min={15} max={480} />
        <button onClick={schedule} disabled={busy || topic.trim().length < 2 || !date || !time} className="w-full rounded-xl bg-teal-700 text-white font-semibold py-3 disabled:opacity-50">
          Schedule
        </button>
      </Card>

      <Card className="space-y-2">
        <h2 className="font-semibold">Upcoming / recent lectures</h2>
        {sessions.length === 0 && <p className="text-sm text-slate-500">None yet.</p>}
        {sessions.map((s) => (
          <button key={s.id} onClick={() => go({ name: 'lecture_detail', sessionId: s.id })} className="w-full text-left border-t border-slate-100 pt-2 first:border-0 first:pt-0 text-sm">
            <p className="font-medium">{s.topic}</p>
            <p className="text-xs text-slate-500">{dt(s.scheduled_at)} · {s.duration_minutes} min · tap to mark attendance</p>
          </button>
        ))}
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold">Record an assessment</h2>
        <select value={assessStaff} onChange={(e) => setAssessStaff(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-3 text-base bg-white">
          <option value="">Select trainee…</option>
          {trainees.map((t) => <option key={t.staff_id} value={t.staff_id}>{t.staff?.full_name}</option>)}
        </select>
        <Choice value={assessType} onChange={setAssessType} options={Object.entries(ASSESSMENT_LABELS).map(([value, label]) => ({ value, label }))} />
        <div className="grid grid-cols-2 gap-3">
          <NumField label="Score" value={score} onChange={setScore} min={0} />
          <NumField label="Out of" value={maxScore} onChange={setMaxScore} min={1} />
        </div>
        <TextArea label="Note (optional)" value={note} onChange={setNote} rows={2} />
        <button onClick={saveAssessment} disabled={busy || !assessStaff || score.trim() === ''} className="w-full rounded-xl bg-teal-700 text-white font-semibold py-3 disabled:opacity-50">
          Save assessment
        </button>
      </Card>

      <Card className="space-y-1">
        <h2 className="font-semibold mb-1">Recent assessments</h2>
        {assessments.length === 0 && <p className="text-sm text-slate-500">None recorded yet.</p>}
        {assessments.map((a) => {
          const name = trainees.find((t) => t.staff_id === a.staff_id)?.staff?.full_name ?? '-'
          return (
            <div key={a.id} className="flex justify-between text-sm border-t border-slate-100 py-1 first:border-0">
              <span>{name} · {ASSESSMENT_LABELS[a.assessment_type]}</span>
              <span className={a.passed ? 'text-emerald-700 font-semibold' : 'text-red-700 font-semibold'}>{a.score}/{a.max_score}</span>
            </div>
          )
        })}
      </Card>
    </div>
  )
}
