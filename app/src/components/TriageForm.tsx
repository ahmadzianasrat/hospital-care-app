import { useRef, useState } from 'react'
import { uuid } from '../lib/uuid'
import { PRIORITIES, PRIORITY_STYLE, gcsTotal, shockIndex, type Priority } from '../lib/format'
import { useOffline } from '../lib/offline/context'
import { useEncounterView } from '../lib/offline/useEncounterView'
import type { PatientRow, TriageData, View } from '../types'
import { BackBar, Card, Choice, ErrorBox, NumField, PatientHeader, TextArea, YesNo, numOrNull } from './ui'

const PUPIL = [
  { value: 'reactive', label: 'Reactive' },
  { value: 'sluggish', label: 'Sluggish' },
  { value: 'fixed', label: 'Fixed' },
]
const range = (n: number) => Array.from({ length: n }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))

export default function TriageForm({
  encounterId, go, notify, hasOpd, staffId,
}: { encounterId: string; go: (v: View) => void; notify: (m: string) => void; hasOpd: boolean; staffId: string }) {
  const { engine } = useOffline()
  const { enc, error: loadError } = useEncounterView(encounterId, staffId)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const docId = useRef(uuid()) // same id on retry = never saved twice

  // arrival
  const [mode, setMode] = useState('')
  const [from, setFrom] = useState('')
  const [incident, setIncident] = useState('')
  const [trauma, setTrauma] = useState('')
  const [hours, setHours] = useState('')
  // vitals
  const [bpSys, setBpSys] = useState('')
  const [bpDia, setBpDia] = useState('')
  const [hr, setHr] = useState('')
  const [rr, setRr] = useState('')
  const [spo2, setSpo2] = useState('')
  const [temp, setTemp] = useState('')
  const [gE, setGE] = useState('')
  const [gV, setGV] = useState('')
  const [gM, setGM] = useState('')
  const [pupL, setPupL] = useState('')
  const [pupR, setPupR] = useState('')
  // primary survey
  const [bleed, setBleed] = useState(false)
  const [airway, setAirway] = useState(false)
  const [breathing, setBreathing] = useState(false)
  const [collar, setCollar] = useState(false)
  // rest
  const [injury, setInjury] = useState('')
  const [notes, setNotes] = useState('')
  const [priority, setPriority] = useState<Priority | ''>('')
  const [decision, setDecision] = useState<'opd' | 'refer' | ''>(hasOpd ? '' : 'refer')

  const gcs = gcsTotal(numOrNull(gE), numOrNull(gV), numOrNull(gM))
  const si = shockIndex(numOrNull(hr), numOrNull(bpSys))

  // A gentle hint, never a block: the nurse decides.
  const spo2n = numOrNull(spo2), sysn = numOrNull(bpSys), hrn = numOrNull(hr), rrn = numOrNull(rr)
  let suggested: Priority | null = null
  if ((gcs && gcs <= 8) || (spo2n != null && spo2n < 90) || (sysn != null && sysn < 90) || bleed || airway) suggested = 'red'
  else if ((gcs && gcs <= 13) || (si != null && si >= 1) || (hrn != null && hrn > 120) || (rrn != null && rrn > 29)) suggested = 'orange'
  const rank = (p: string | null) => (p ? PRIORITIES.indexOf(p as Priority) : 99)
  const underTriaged = suggested && priority && rank(priority) > rank(suggested)

  const valid = injury.trim().length > 1 && priority !== '' && decision !== ''

  async function submit() {
    if (!enc || !priority || !decision) return
    setBusy(true)
    setError(null)
    const data: TriageData = {
      arrival: { mode, from: from.trim(), incident, trauma_type: trauma, hours_since_injury: numOrNull(hours) },
      vitals: {
        bp_sys: numOrNull(bpSys), bp_dia: numOrNull(bpDia), hr: numOrNull(hr), rr: numOrNull(rr),
        spo2: numOrNull(spo2), temp_c: numOrNull(temp),
        gcs_e: numOrNull(gE), gcs_v: numOrNull(gV), gcs_m: numOrNull(gM),
        pupil_left: pupL, pupil_right: pupR,
      },
      primary_survey: {
        massive_haemorrhage: bleed, airway_compromised: airway, breathing_distress: breathing, c_spine_collar: collar,
      },
      injury_description: injury.trim(),
      notes: notes.trim(),
    }
    const result = await engine.perform({
      userId: staffId,
      type: 'complete_triage',
      params: { p_encounter_id: enc.id, p_priority: priority, p_decision: decision, p_data: data, p_doc_id: docId.current },
      entityIds: [docId.current, enc.id],
      dependsOn: [enc.patient_id, enc.id],
      label: `Triage: ${enc.patients?.display_id ?? 'patient'}`,
      enc: { id: enc.id, patient_id: enc.patient_id, facility_id: enc.facility_id, arrived_at: enc.arrived_at, patients: enc.patients },
    })
    setBusy(false)
    if (!result.ok) return setError(result.error)

    if (result.queued) {
      notify(`Triage saved on this phone for ${enc.patients?.display_id}. Will sync once online.`)
      go(decision === 'opd' ? { name: 'triage' } : { name: 'referrals' })
      return
    }
    if (decision === 'opd') {
      notify(`${enc.patients?.display_id} sent to OPD.`)
      go({ name: 'triage' })
    } else {
      notify(`Triage saved. Now fill in the referral for ${enc.patients?.display_id}.`)
      go({ name: 'referral_form', encounterId: enc.id })
    }
  }

  if (enc === undefined) return <p className="text-slate-500">Loading…</p>
  if (loadError || !enc) {
    return (
      <div className="space-y-3">
        <BackBar title="Triage" onBack={() => go({ name: 'triage' })} />
        <ErrorBox message={loadError ?? 'Visit not found.'} />
      </div>
    )
  }
  if (enc.status !== 'waiting_triage') {
    return (
      <div className="space-y-3">
        <BackBar title="Triage" onBack={() => go({ name: 'triage' })} />
        <ErrorBox message="This visit was already triaged." />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <BackBar title="Triage" onBack={() => go({ name: 'triage' })} />
      <PatientHeader patient={enc.patients as PatientRow} />

      <Card className="space-y-3">
        <h2 className="font-semibold">Arrival</h2>
        <Choice
          value={mode} onChange={setMode}
          options={[{ value: 'self', label: 'Came by self' }, { value: 'ambulance', label: 'Ambulance' }, { value: 'referred', label: 'Referred' }]}
        />
        <label className="block text-sm">
          <span className="text-slate-600">Coming from</span>
          <input value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-base" />
        </label>
        <label className="block text-sm">
          <span className="text-slate-600">What happened</span>
          <select value={incident} onChange={(e) => setIncident(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-base bg-white">
            <option value="">Select…</option>
            {['Road traffic accident', 'Fall', 'Blast / explosion', 'Gunshot', 'Burn', 'Assault', 'Medical', 'Other'].map((o) => <option key={o}>{o}</option>)}
          </select>
        </label>
        <Choice
          value={trauma} onChange={setTrauma}
          options={[{ value: 'blunt', label: 'Blunt' }, { value: 'penetrating', label: 'Penetrating' }, { value: 'burn', label: 'Burn' }, { value: 'none', label: 'Non-trauma' }]}
        />
        <NumField label="Time since injury" unit="hours" value={hours} onChange={setHours} min={0} />
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold">Vital signs</h2>
        <div className="grid grid-cols-2 gap-3">
          <NumField label="BP systolic" unit="mmHg" value={bpSys} onChange={setBpSys} />
          <NumField label="BP diastolic" unit="mmHg" value={bpDia} onChange={setBpDia} />
          <NumField label="Heart rate" unit="bpm" value={hr} onChange={setHr} />
          <NumField label="Resp. rate" unit="/min" value={rr} onChange={setRr} />
          <NumField label="SpO₂" unit="%" value={spo2} onChange={setSpo2} min={0} max={100} />
          <NumField label="Temperature" unit="°C" value={temp} onChange={setTemp} />
        </div>
        <p className="text-xs text-slate-500">Shock index (HR/BP): {si ?? '-'}</p>

        <div>
          <p className="text-sm text-slate-600 mb-1">Eyes (E)</p>
          <Choice value={gE} onChange={setGE} options={range(4)} />
          <p className="text-sm text-slate-600 mt-2 mb-1">Verbal (V)</p>
          <Choice value={gV} onChange={setGV} options={range(5)} />
          <p className="text-sm text-slate-600 mt-2 mb-1">Motor (M)</p>
          <Choice value={gM} onChange={setGM} options={range(6)} />
          <p className="mt-2 font-semibold">Glasgow Coma Scale: {gcs ?? '-'}</p>
        </div>

        <div>
          <p className="text-sm text-slate-600 mb-1">Left pupil</p>
          <Choice value={pupL} onChange={setPupL} options={PUPIL} />
          <p className="text-sm text-slate-600 mt-2 mb-1">Right pupil</p>
          <Choice value={pupR} onChange={setPupR} options={PUPIL} />
        </div>
      </Card>

      <Card>
        <h2 className="font-semibold mb-1">Primary survey</h2>
        <YesNo label="Massive bleeding" value={bleed} onChange={setBleed} />
        <YesNo label="Airway compromised" value={airway} onChange={setAirway} />
        <YesNo label="Breathing distress" value={breathing} onChange={setBreathing} />
        <YesNo label="C-spine collar applied" value={collar} onChange={setCollar} />
      </Card>

      <Card className="space-y-3">
        <TextArea label="Injury / complaint description" value={injury} onChange={setInjury} required />
        <TextArea label="Notes (optional)" value={notes} onChange={setNotes} rows={2} />
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold">Priority *</h2>
        {suggested && (
          <p className="text-xs text-slate-600">
            Suggestion from the vitals: <b>{PRIORITY_STYLE[suggested].label}</b>. You decide.
          </p>
        )}
        <div className="grid grid-cols-2 gap-2">
          {PRIORITIES.map((p) => (
            <button
              type="button" key={p} onClick={() => setPriority(p)}
              className={`rounded-xl py-4 font-semibold ${PRIORITY_STYLE[p].solid} ${priority === p ? 'ring-4 ring-slate-800' : 'opacity-70'}`}
            >
              {PRIORITY_STYLE[p].label}
            </button>
          ))}
        </div>
        {underTriaged && (
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-300 rounded-lg p-2">
            The vitals look worse than this priority. Please double-check.
          </p>
        )}

        <h2 className="font-semibold pt-2">Decision *</h2>
        <Choice
          value={decision} onChange={setDecision}
          options={
            hasOpd
              ? [{ value: 'opd', label: 'Send to OPD (doctor)' }, { value: 'refer', label: 'Refer out' }]
              : [{ value: 'refer', label: 'Refer out' }]
          }
        />
      </Card>

      <ErrorBox message={error} />
      <button
        onClick={submit} disabled={!valid || busy}
        className="w-full rounded-xl bg-teal-700 text-white font-semibold py-4 disabled:opacity-50"
      >
        {busy ? 'Saving…' : 'Save triage'}
      </button>
    </div>
  )
}
