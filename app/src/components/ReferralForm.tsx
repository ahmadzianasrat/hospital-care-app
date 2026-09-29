import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { uuid } from '../lib/uuid'
import { errMsg } from '../lib/format'
import { useOffline } from '../lib/offline/context'
import { useEncounterView } from '../lib/offline/useEncounterView'
import type { PatientRow, View } from '../types'
import { BackBar, Card, Choice, ErrorBox, PatientHeader, TextArea } from './ui'

type Fac = { id: string; code: string; name: string }

const REASONS = [
  'Needs surgery', 'Needs ICU / higher care', 'Needs a specialist', 'Beyond our capacity',
  'No bed available', 'Patient request', 'Other',
]
const ETAS = [
  { value: '30', label: '30 min' }, { value: '60', label: '1 hour' }, { value: '120', label: '2 hours' },
  { value: '240', label: '4 hours' }, { value: '', label: 'Unknown' },
]

export default function ReferralForm({
  encounterId, facilityId, staffId, go, notify,
}: { encounterId: string; facilityId: string; staffId: string; go: (v: View) => void; notify: (m: string) => void }) {
  const { engine } = useOffline()
  const { enc, error: loadError } = useEncounterView(encounterId, staffId)
  const [facs, setFacs] = useState<Fac[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const refId = useRef(uuid()) // same id on retry = never sent twice

  const [dest, setDest] = useState('') // facility id, or 'external'
  const [external, setExternal] = useState('')
  const [reason, setReason] = useState('')
  const [reasonText, setReasonText] = useState('')
  const [transport, setTransport] = useState('')
  const [eta, setEta] = useState<string | null>(null)
  const [given, setGiven] = useState('')

  useEffect(() => {
    // The facility list is small and rarely changes; try the server, fall back to a cached copy.
    supabase
      .from('facilities')
      .select('id, code, name')
      .neq('id', facilityId)
      .order('code')
      .then(async ({ data, error }) => {
        if (data) {
          setFacs(data as Fac[])
          engine.cacheSet('facilities', data)
        } else if (!navigator.onLine) {
          setFacs(((await engine.cacheGet<Fac[]>('facilities')) ?? []))
        } else if (error) {
          setError(errMsg(error))
        }
      })
  }, [facilityId, engine])

  const valid =
    (dest !== '' && (dest !== 'external' || external.trim().length > 1)) && reason !== ''

  async function submit() {
    if (!enc) return
    setBusy(true)
    setError(null)
    const full = [reason, reasonText.trim()].filter(Boolean).join(': ')
    const result = await engine.perform({
      userId: staffId,
      type: 'create_referral',
      params: {
        p_encounter_id: enc.id,
        p_to_facility_id: dest === 'external' ? null : dest,
        p_to_external: dest === 'external' ? external.trim() : null,
        p_reason: full,
        p_eta: eta ? new Date(Date.now() + Number(eta) * 60000).toISOString() : null,
        p_treatment_given: given.trim(),
        p_transport: transport || null,
        p_id: refId.current,
      },
      entityIds: [refId.current],
      dependsOn: [enc.id],
      label: `Referral: ${enc.patients?.display_id ?? 'patient'}`,
      enc: { id: enc.id, patient_id: enc.patient_id, facility_id: enc.facility_id, arrived_at: enc.arrived_at, patients: enc.patients },
    })
    setBusy(false)
    if (!result.ok) return setError(result.error)
    notify(
      result.queued
        ? `Referral saved on this phone for ${enc.patients?.display_id}. Will send once online.`
        : `Referral sent for ${enc.patients?.display_id}.`,
    )
    go({ name: 'referrals' })
  }

  if (enc === undefined) return <p className="text-slate-500">Loading…</p>
  if (loadError || !enc) {
    return (
      <div className="space-y-3">
        <BackBar title="Referral" onBack={() => go({ name: 'referrals' })} />
        <ErrorBox message={loadError ?? 'Visit not found.'} />
      </div>
    )
  }
  if (enc.status !== 'referred_out') {
    return (
      <div className="space-y-3">
        <BackBar title="Referral" onBack={() => go({ name: 'referrals' })} />
        <ErrorBox message="This visit is not marked for referral." />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <BackBar title="Referral" onBack={() => go({ name: 'referrals' })} />
      <PatientHeader patient={enc.patients as PatientRow} />

      <Card className="space-y-3">
        <h2 className="font-semibold">Where is the patient going? *</h2>
        <div className="flex flex-wrap gap-2">
          {facs.map((f) => (
            <button
              type="button" key={f.id} onClick={() => setDest(f.id)}
              className={`rounded-xl px-4 py-3 text-sm font-medium border text-left ${dest === f.id ? 'bg-teal-700 text-white border-teal-700' : 'bg-white border-slate-300'}`}
            >
              <span className="font-mono font-bold">{f.code}</span> · {f.name}
            </button>
          ))}
          <button
            type="button" onClick={() => setDest('external')}
            className={`rounded-xl px-4 py-3 text-sm font-medium border ${dest === 'external' ? 'bg-teal-700 text-white border-teal-700' : 'bg-white border-slate-300'}`}
          >
            Other facility (not in this system)
          </button>
        </div>
        {dest === 'external' && (
          <input
            value={external} onChange={(e) => setExternal(e.target.value)} placeholder="Name of the facility"
            className="w-full rounded-lg border border-slate-300 px-3 py-3 text-base"
          />
        )}
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold">Reason *</h2>
        <Choice value={reason} onChange={setReason} options={REASONS.map((r) => ({ value: r, label: r }))} />
        <TextArea label="Details (optional)" value={reasonText} onChange={setReasonText} rows={2} />
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold">Transport</h2>
        <Choice
          value={transport} onChange={setTransport}
          options={[{ value: 'ambulance', label: 'Ambulance' }, { value: 'own', label: 'Own transport' }]}
        />
        <h2 className="font-semibold pt-1">Expected arrival in</h2>
        <Choice value={eta ?? ''} onChange={setEta} options={ETAS} />
        <TextArea label="Treatment given so far" value={given} onChange={setGiven} rows={3} />
      </Card>

      <p className="text-xs text-slate-500">
        The receiving facility automatically gets: name, age, blood group, allergies, triage vitals, injury, diagnosis and
        any quick treatments you recorded.
      </p>

      <ErrorBox message={error} />
      <button
        onClick={submit} disabled={!valid || busy}
        className="w-full rounded-xl bg-teal-700 text-white font-semibold py-4 disabled:opacity-50"
      >
        {busy ? 'Sending…' : 'Send referral'}
      </button>
    </div>
  )
}
