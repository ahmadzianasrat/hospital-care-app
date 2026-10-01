import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { uuid } from '../lib/uuid'
import { errMsg } from '../lib/format'
import { ANAESTHESIA_TYPES, ASA_CLASSES, type PatientRow, type TheatreRow, type View } from '../types'
import { BackBar, Card, Choice, ErrorBox, NumField, PatientHeader, TextArea } from './ui'

type Surgeon = { id: string; full_name: string }

export default function BookSurgery({
  encounterId, facilityId, go, notify,
}: { encounterId: string; facilityId: string; go: (v: View) => void; notify: (m: string) => void }) {
  const [patient, setPatient] = useState<PatientRow | null>(null)
  const [theatres, setTheatres] = useState<TheatreRow[]>([])
  const [surgeons, setSurgeons] = useState<Surgeon[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const id = useState(() => uuid())[0]

  const [theatre, setTheatre] = useState('')
  const [urgency, setUrgency] = useState<'emergency' | 'elective' | ''>('')
  const [diagnosis, setDiagnosis] = useState('')
  const [procedure, setProcedure] = useState('')
  const [anaesthesia, setAnaesthesia] = useState('')
  const [asa, setAsa] = useState('')
  const [surgeon, setSurgeon] = useState('')
  const [date, setDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [duration, setDuration] = useState('60')

  useEffect(() => {
    ;(async () => {
      const enc = await supabase.from('encounters').select('patients(*)').eq('id', encounterId).maybeSingle()
      if (enc.error) return setLoadError(errMsg(enc.error))
      setPatient((enc.data?.patients as unknown as PatientRow) ?? null)
      const t = await supabase.from('theatres').select('*').eq('facility_id', facilityId).eq('active', true).order('code')
      setTheatres((t.data ?? []) as TheatreRow[])
      const s = await supabase.from('staff').select('id, full_name').eq('facility_id', facilityId).in('app_role', ['doctor', 'chief_surgeon']).eq('active', true)
      setSurgeons((s.data ?? []) as Surgeon[])
    })()
  }, [encounterId, facilityId])

  const valid = theatre && urgency && diagnosis.trim().length > 1 && procedure.trim().length > 1 &&
    anaesthesia && asa && surgeon && date && startTime && Number(duration) > 0

  async function submit() {
    if (!valid) return
    setBusy(true)
    setError(null)
    const start = new Date(`${date}T${startTime}`)
    const end = new Date(start.getTime() + Number(duration) * 60000)
    const { error } = await supabase.rpc('book_surgery', {
      p_encounter_id: encounterId, p_theatre_id: theatre, p_urgency: urgency, p_diagnosis: diagnosis.trim(),
      p_planned_procedure: procedure.trim(), p_anaesthesia_type: anaesthesia, p_asa_class: asa,
      p_scheduled_start: start.toISOString(), p_scheduled_end: end.toISOString(), p_surgeon_id: surgeon,
      p_id: id,
    })
    setBusy(false)
    if (error) return setError(errMsg(error))
    notify(`${patient?.display_id} booked for surgery.`)
    go({ name: 'ot' })
  }

  if (loadError) {
    return (
      <div className="space-y-3">
        <BackBar title="Book surgery" onBack={() => go({ name: 'ot' })} />
        <ErrorBox message={loadError} />
      </div>
    )
  }
  if (!patient) return <p className="text-slate-500">Loading…</p>

  return (
    <div className="space-y-3">
      <BackBar title="Book surgery" onBack={() => go({ name: 'ot' })} />
      <PatientHeader patient={patient} />

      <Card className="space-y-3">
        <h2 className="font-semibold">Theatre</h2>
        <Choice value={theatre} onChange={setTheatre} options={theatres.map((t) => ({ value: t.id, label: t.name }))} />
        <h2 className="font-semibold pt-1">Urgency</h2>
        <Choice value={urgency} onChange={setUrgency} options={[{ value: 'emergency', label: 'Emergency' }, { value: 'elective', label: 'Elective' }]} />
        <TextArea label="Diagnosis" value={diagnosis} onChange={setDiagnosis} rows={2} required />
        <TextArea label="Planned procedure" value={procedure} onChange={setProcedure} rows={2} required />
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold">Anaesthesia</h2>
        <Choice value={anaesthesia} onChange={setAnaesthesia} options={ANAESTHESIA_TYPES.map((a) => ({ value: a, label: a }))} />
        <h2 className="font-semibold pt-1">ASA class</h2>
        <Choice value={asa} onChange={setAsa} options={ASA_CLASSES.map((a) => ({ value: a, label: a }))} />
        <h2 className="font-semibold pt-1">Surgeon</h2>
        <Choice value={surgeon} onChange={setSurgeon} options={surgeons.map((s) => ({ value: s.id, label: s.full_name }))} />
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold">When</h2>
        <label className="block text-sm">
          <span className="text-slate-600">Date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-base" />
        </label>
        <label className="block text-sm">
          <span className="text-slate-600">Start time</span>
          <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-base" />
        </label>
        <NumField label="Expected duration" unit="minutes" value={duration} onChange={setDuration} min={5} max={600} />
      </Card>

      <ErrorBox message={error} />
      <button onClick={submit} disabled={!valid || busy} className="w-full rounded-xl bg-teal-700 text-white font-semibold py-4 disabled:opacity-50">
        {busy ? 'Booking…' : 'Book case'}
      </button>
    </div>
  )
}
