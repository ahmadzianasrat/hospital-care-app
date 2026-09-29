import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { uuid } from '../lib/uuid'
import { errMsg } from '../lib/format'
import type { EncounterRow, PatientRow, TriageData, View } from '../types'
import { BackBar, Card, Choice, ErrorBox, PatientHeader, TextArea } from './ui'
import TriageSummary from './TriageSummary'
import QuickTreatments from './QuickTreatments'

type Outcome = 'discharge' | 'admit' | 'refer'

export default function OpdVisit({
  encounterId, staffId, go, notify,
}: { encounterId: string; staffId: string; go: (v: View) => void; notify: (m: string) => void }) {
  const [enc, setEnc] = useState<EncounterRow | null>(null)
  const [triage, setTriage] = useState<TriageData | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const docId = useRef(uuid())

  const [history, setHistory] = useState('')
  const [findings, setFindings] = useState('')
  const [diagnosis, setDiagnosis] = useState('')
  const [plan, setPlan] = useState('')
  const [outcome, setOutcome] = useState<Outcome | ''>('')

  useEffect(() => {
    ;(async () => {
      const e = await supabase
        .from('encounters')
        .select('id, patient_id, facility_id, status, arrived_at, triage_priority, triage_decision, opd_doctor_id, patients(*)')
        .eq('id', encounterId)
        .maybeSingle()
      if (e.error) return setLoadError(errMsg(e.error))
      if (!e.data) return setLoadError('Visit not found.')
      setEnc(e.data as unknown as EncounterRow)
      const d = await supabase
        .from('documents')
        .select('data')
        .eq('encounter_id', encounterId)
        .eq('doc_type', 'first_assessment')
        .limit(1)
        .maybeSingle()
      setTriage((d.data?.data as TriageData) ?? null)
    })()
  }, [encounterId])

  async function finish() {
    if (!enc || !outcome) return
    setBusy(true)
    setError(null)
    const { error } = await supabase.rpc('complete_opd', {
      p_encounter_id: enc.id,
      p_outcome: outcome,
      p_data: { history: history.trim(), findings: findings.trim(), diagnosis: diagnosis.trim(), plan: plan.trim() },
      p_doc_id: docId.current,
    })
    setBusy(false)
    if (error) return setError(errMsg(error))
    if (outcome === 'refer') {
      notify(`Visit saved. Now fill in the referral for ${enc.patients?.display_id}.`)
      go({ name: 'referral_form', encounterId: enc.id })
      return
    }
    notify(`${enc.patients?.display_id} ${outcome === 'discharge' ? 'discharged' : 'admitted'}.`)
    go({ name: 'opd' })
  }

  async function putBack() {
    if (!enc) return
    setBusy(true)
    const { error } = await supabase.rpc('release_opd', { p_encounter_id: enc.id })
    setBusy(false)
    if (error) return setError(errMsg(error))
    notify('Patient put back in the queue.')
    go({ name: 'opd' })
  }

  if (loadError) {
    return (
      <div className="space-y-3">
        <BackBar title="OPD" onBack={() => go({ name: 'opd' })} />
        <ErrorBox message={loadError} />
      </div>
    )
  }
  if (!enc) return <p className="text-slate-500">Loading…</p>

  const editable = enc.status === 'in_opd' && enc.opd_doctor_id === staffId
  const valid = diagnosis.trim().length > 1 && outcome !== ''

  return (
    <div className="space-y-3">
      <BackBar title="OPD visit" onBack={() => go({ name: 'opd' })} />
      <PatientHeader patient={enc.patients as PatientRow} />
      <TriageSummary data={triage} priority={enc.triage_priority} />

      {!editable ? (
        <ErrorBox message="This visit is not open for you to edit." />
      ) : (
        <>
          <Card className="space-y-3">
            <TextArea label="History" value={history} onChange={setHistory} />
            <TextArea label="Examination findings" value={findings} onChange={setFindings} />
            <TextArea label="Diagnosis" value={diagnosis} onChange={setDiagnosis} rows={2} required />
            <TextArea label="Plan / advice" value={plan} onChange={setPlan} />
          </Card>

          <QuickTreatments encounterId={enc.id} patient={enc.patients as PatientRow} canAdd />

          <Card className="space-y-2">
            <h2 className="font-semibold">Outcome *</h2>
            <Choice
              value={outcome}
              onChange={setOutcome}
              options={[
                { value: 'discharge', label: 'Discharge' },
                { value: 'admit', label: 'Admit' },
                { value: 'refer', label: 'Refer out' },
              ]}
            />
            {outcome === 'refer' && (
              <p className="text-xs text-slate-500">After you finish, the referral form opens.</p>
            )}
          </Card>

          <ErrorBox message={error} />
          <button
            onClick={finish}
            disabled={!valid || busy}
            className="w-full rounded-xl bg-teal-700 text-white font-semibold py-4 disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Finish visit'}
          </button>
          <button onClick={putBack} disabled={busy} className="w-full rounded-xl bg-white border border-slate-300 py-3">
            Put back in the queue
          </button>
        </>
      )}
    </div>
  )
}
