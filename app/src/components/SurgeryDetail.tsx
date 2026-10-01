import { useCallback, useEffect, useState } from 'react'
import { supabase, FACILITY_TZ } from '../lib/supabase'
import { uuid } from '../lib/uuid'
import { errMsg } from '../lib/format'
import type { PatientRow, SurgeryRow, SurgeryTeamMember, View } from '../types'
import { BackBar, Card, Choice, ErrorBox, PatientHeader, TextArea } from './ui'

const dt = (iso: string) => new Date(iso).toLocaleString('en-GB', { timeZone: FACILITY_TZ, dateStyle: 'medium', timeStyle: 'short' })

const STATUS_LABEL: Record<string, string> = {
  scheduled: 'Scheduled', in_progress: 'In progress', completed: 'Completed', cancelled: 'Cancelled',
}

export default function SurgeryDetail({
  surgeryId, go, notify, canManage, canOperate,
}: { surgeryId: string; go: (v: View) => void; notify: (m: string) => void; canManage: boolean; canOperate: boolean }) {
  const [surgery, setSurgery] = useState<SurgeryRow | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [showCancel, setShowCancel] = useState(false)
  const [cancelReason, setCancelReason] = useState('')

  const [findings, setFindings] = useState('')
  const [proceduresDone, setProceduresDone] = useState('')
  const [outcome, setOutcome] = useState<'alive' | 'deceased' | ''>('')
  const [teamRole, setTeamRole] = useState('')
  const [teamName, setTeamName] = useState('')
  const [team, setTeam] = useState<SurgeryTeamMember[]>([])
  const docId = useState(() => uuid())[0]

  const load = useCallback(async () => {
    const s = await supabase
      .from('surgeries')
      .select('*, theatres(*), surgeon:staff!surgeon_id(full_name), encounters(patients(*))')
      .eq('id', surgeryId)
      .maybeSingle()
    if (s.error) return setError(errMsg(s.error))
    if (!s.data) return setError('Case not found.')
    setSurgery(s.data as unknown as SurgeryRow)
    setTeam(((s.data as unknown as SurgeryRow).team) ?? [])
  }, [surgeryId])

  useEffect(() => { load() }, [load])

  async function start() {
    setBusy(true)
    const { error } = await supabase.rpc('start_surgery', { p_id: surgeryId })
    setBusy(false)
    if (error) setError(errMsg(error))
    else load()
  }

  async function doCancel() {
    if (cancelReason.trim().length < 3) return
    setBusy(true)
    const { error } = await supabase.rpc('cancel_surgery', { p_id: surgeryId, p_reason: cancelReason.trim() })
    setBusy(false)
    if (error) return setError(errMsg(error))
    notify('Case cancelled.')
    go({ name: 'ot' })
  }

  function addTeamMember() {
    if (teamRole.trim() && teamName.trim()) {
      setTeam((t) => [...t, { role: teamRole.trim(), name: teamName.trim() }])
      setTeamRole('')
      setTeamName('')
    }
  }

  async function complete() {
    setBusy(true)
    setError(null)
    const { error } = await supabase.rpc('complete_surgery', {
      p_id: surgeryId, p_findings: findings.trim(), p_procedures_done: proceduresDone.trim(),
      p_outcome: outcome, p_team: team, p_doc_id: docId,
    })
    setBusy(false)
    if (error) return setError(errMsg(error))
    notify('Surgery completed.')
    go({ name: 'ot' })
  }

  if (error && !surgery) {
    return (
      <div className="space-y-3">
        <BackBar title="Surgery" onBack={() => go({ name: 'ot' })} />
        <ErrorBox message={error} />
      </div>
    )
  }
  if (!surgery) return <p className="text-slate-500">Loading…</p>

  const patient = surgery.encounters?.patients as PatientRow

  return (
    <div className="space-y-3">
      <BackBar title="Surgery" onBack={() => go({ name: 'ot' })} />
      {patient && <PatientHeader patient={patient} />}
      <ErrorBox message={error} />

      <Card className="space-y-1">
        <div className="flex justify-between items-center">
          <span className={`text-xs font-semibold rounded-full px-2 py-0.5 ${surgery.urgency === 'emergency' ? 'bg-red-100 text-red-800' : 'bg-slate-100 text-slate-700'}`}>{surgery.urgency}</span>
          <span className="text-sm font-semibold">{STATUS_LABEL[surgery.status]}</span>
        </div>
        <p className="text-sm"><span className="text-slate-500">Diagnosis:</span> {surgery.diagnosis}</p>
        <p className="text-sm"><span className="text-slate-500">Procedure:</span> {surgery.planned_procedure}</p>
        <p className="text-sm">{surgery.theatres?.name} · Dr {surgery.surgeon?.full_name}</p>
        <p className="text-sm">Anaesthesia: {surgery.anaesthesia_type} · ASA {surgery.asa_class}</p>
        <p className="text-xs text-slate-500">
          {surgery.status === 'scheduled' && `Scheduled: ${dt(surgery.scheduled_start)} - ${dt(surgery.scheduled_end)}`}
          {surgery.status === 'in_progress' && surgery.actual_start && `Started: ${dt(surgery.actual_start)}`}
          {surgery.status === 'completed' && surgery.actual_start && surgery.actual_end && `${dt(surgery.actual_start)} - ${dt(surgery.actual_end)}`}
          {surgery.status === 'cancelled' && `Cancelled: ${surgery.cancel_reason}`}
        </p>
      </Card>

      {surgery.status === 'completed' && (
        <Card className="space-y-1">
          <h2 className="font-semibold">Operative note</h2>
          <p className="text-sm"><span className="text-slate-500">Findings:</span> {surgery.findings}</p>
          <p className="text-sm"><span className="text-slate-500">Done:</span> {surgery.procedures_done}</p>
          <p className="text-sm font-semibold">Outcome: {surgery.outcome}</p>
          {surgery.team.length > 0 && (
            <p className="text-xs text-slate-500">Team: {surgery.team.map((t) => `${t.name} (${t.role})`).join(', ')}</p>
          )}
        </Card>
      )}

      {surgery.status === 'scheduled' && canOperate && (
        <button onClick={start} disabled={busy} className="w-full rounded-xl bg-teal-700 text-white font-semibold py-3 disabled:opacity-50">
          {busy ? 'Starting…' : 'Start surgery'}
        </button>
      )}

      {surgery.status === 'scheduled' && canManage && !showCancel && (
        <button onClick={() => setShowCancel(true)} className="w-full rounded-xl bg-white border border-red-500 text-red-700 py-3">Cancel case</button>
      )}
      {showCancel && (
        <Card className="space-y-3">
          <TextArea label="Reason for cancelling" value={cancelReason} onChange={setCancelReason} rows={2} required />
          <div className="flex gap-2">
            <button onClick={doCancel} disabled={cancelReason.trim().length < 3 || busy} className="flex-1 rounded-xl bg-red-700 text-white font-semibold py-3 disabled:opacity-50">Confirm cancel</button>
            <button onClick={() => setShowCancel(false)} className="flex-1 rounded-xl bg-white border border-slate-300 py-3">Back</button>
          </div>
        </Card>
      )}

      {surgery.status === 'in_progress' && canOperate && (
        <Card className="space-y-3">
          <h2 className="font-semibold">Complete surgery</h2>
          <TextArea label="Findings" value={findings} onChange={setFindings} rows={3} required />
          <TextArea label="Procedure(s) done" value={proceduresDone} onChange={setProceduresDone} rows={3} required />
          <div>
            <p className="text-sm text-slate-600 mb-1">Outcome</p>
            <Choice value={outcome} onChange={setOutcome} options={[{ value: 'alive', label: 'Alive' }, { value: 'deceased', label: 'Deceased' }]} />
          </div>
          <div>
            <p className="text-sm text-slate-600 mb-1">Surgical team (optional)</p>
            {team.map((m, i) => <p key={i} className="text-sm">{m.name} - {m.role}</p>)}
            <div className="flex gap-2 mt-1">
              <input value={teamRole} onChange={(e) => setTeamRole(e.target.value)} placeholder="Role" className="flex-1 rounded-lg border border-slate-300 px-2 py-2 text-sm" />
              <input value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="Name" className="flex-1 rounded-lg border border-slate-300 px-2 py-2 text-sm" />
              <button onClick={addTeamMember} className="rounded-lg bg-slate-800 text-white px-3 text-sm">Add</button>
            </div>
          </div>
          <button
            onClick={complete}
            disabled={findings.trim().length < 2 || proceduresDone.trim().length < 2 || !outcome || busy}
            className="w-full rounded-xl bg-teal-700 text-white font-semibold py-3 disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Complete surgery'}
          </button>
        </Card>
      )}
    </div>
  )
}
