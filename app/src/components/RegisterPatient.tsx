import { useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useOffline } from '../lib/offline/context'
import { uuid } from '../lib/uuid'
import { errMsg } from '../lib/format'
import { startVisit } from '../lib/visits'
import type { PatientPrefill, PatientRow, View } from '../types'
import { BackBar, Card, Choice, ErrorBox, NumField } from './ui'
import { PatientList, usePatientSearch } from './Patients'

const BLOOD = ['Unknown', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']

export default function RegisterPatient({
  go, notify, prefill, referralId, staffId, facilityId, facilityCode,
}: {
  go: (v: View) => void; notify: (m: string) => void; prefill?: PatientPrefill; referralId?: string
  staffId: string; facilityId: string; facilityCode: string
}) {
  const { engine, online } = useOffline()
  const [offlineNote, setOfflineNote] = useState<string | null>(null)
  const [name, setName] = useState(prefill?.full_name ?? '')
  const [father, setFather] = useState(prefill?.father_name ?? '')
  const [sex, setSex] = useState<'male' | 'female' | ''>(prefill?.sex === 'male' || prefill?.sex === 'female' ? prefill.sex : '')
  const [age, setAge] = useState(prefill?.age_years != null ? String(prefill.age_years) : '')
  const [phone, setPhone] = useState(prefill?.phone ?? '')
  const [district, setDistrict] = useState(prefill?.district ?? '')
  const [blood, setBlood] = useState(BLOOD.includes(prefill?.blood_group ?? '') ? (prefill!.blood_group as string) : 'Unknown')
  const [allergy, setAllergy] = useState<'unknown' | 'none' | 'known' | ''>(
    prefill?.allergy_status === 'unknown' || prefill?.allergy_status === 'none' || prefill?.allergy_status === 'known' ? prefill.allergy_status : '',
  )
  const [allergyText, setAllergyText] = useState(prefill?.allergy_details ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<PatientRow | null>(null)
  const [linkNote, setLinkNote] = useState<string | null>(null)
  const requestId = useRef(uuid()) // same id on retry = never a double registration

  const dupes = usePatientSearch(name.trim().length >= 3 ? name : '')

  const ageNum = age.trim() === '' ? NaN : Number(age)
  const valid =
    name.trim().length >= 2 && sex !== '' && !isNaN(ageNum) && ageNum >= 0 && ageNum <= 120 &&
    allergy !== '' && (allergy !== 'known' || allergyText.trim().length > 1)

  async function submit() {
    setBusy(true)
    setError(null)
    const baseParams = {
      p_full_name: name.trim(),
      p_sex: sex,
      p_father_name: father.trim() || null,
      p_age_years: ageNum,
      p_phone: phone.trim() || null,
      p_district: district.trim() || null,
      p_blood_group: blood,
      p_allergy_status: allergy,
      p_allergy_details: allergy === 'known' ? allergyText.trim() : null,
      p_id: requestId.current,
    }

    const result = await engine.perform({
      userId: staffId,
      type: 'register_patient',
      params: baseParams,
      entityIds: [requestId.current],
      label: `Register ${name.trim()}`,
      // Only called if we must queue: takes one number from the reserved offline block.
      forQueue: async () => {
        const seq = await engine.takeNumber(facilityId)
        if (seq === null) {
          return { error: 'No offline patient numbers reserved. Connect to the internet once (with signal) so the app can reserve a block, then try again.' }
        }
        const displayId = `${seq}${facilityCode}`
        const patient: Partial<PatientRow> & Record<string, unknown> = {
          id: baseParams.p_id, facility_id: facilityId, facility_code: facilityCode, seq, display_id: displayId,
          full_name: baseParams.p_full_name, father_name: baseParams.p_father_name, sex: baseParams.p_sex as 'male' | 'female',
          age_years: baseParams.p_age_years, phone: baseParams.p_phone, district: baseParams.p_district,
          blood_group: baseParams.p_blood_group, allergy_status: baseParams.p_allergy_status as PatientRow['allergy_status'],
          allergy_details: baseParams.p_allergy_details, created_at: new Date().toISOString(),
        }
        return { params: { ...baseParams, p_seq: seq }, patient }
      },
    })

    setBusy(false)
    if (!result.ok) return setError(result.error)

    if (result.queued) {
      const local = engine.pendingPatients(staffId).find((p) => p.id === requestId.current) as PatientRow | undefined
      setOfflineNote('Saved on this phone. It will be sent to the server automatically once you are back online.')
      setCreated(local ?? null)
      return
    }

    const patient = result.data as PatientRow
    if (referralId) {
      const link = await supabase.rpc('link_referral_arrival', { p_referral_id: referralId, p_patient_id: patient.id })
      setLinkNote(link.error ? `Patient saved, but the referral could not be linked: ${errMsg(link.error)}` : 'Linked to the referral. Marked as arrived.')
    }
    setCreated(patient)
  }

  async function toTriage() {
    if (!created) return
    if (offlineNote) {
      notify('Registered offline. Open the patient to start the visit once triage is available offline too, or wait to sync.')
      go({ name: 'patients' })
      return
    }
    setBusy(true)
    try {
      const v = await startVisit(engine, staffId, created.id, { id: created.id, display_id: created.display_id })
      if (v.queued) notify(`${created.display_id} saved for triage. Will sync once online.`)
      else notify(v.alreadyOpen ? 'This patient already has an open visit.' : `${created.display_id} sent to triage.`)
      go({ name: 'triage' })
    } catch (e) {
      setError(errMsg(e))
      setBusy(false)
    }
  }

  if (created) {
    return (
      <div className="space-y-3">
        <Card className="text-center">
          <p className="text-sm text-slate-500">Patient registered</p>
          <p className="font-mono text-4xl font-bold text-teal-800 my-2">{created.display_id}</p>
          <p className="font-semibold">{created.full_name}</p>
          <p className="text-xs text-slate-500 mt-2">Write this number on the patient's paper file and wristband.</p>
          {linkNote && <p className="text-sm font-medium text-emerald-800 mt-2">{linkNote}</p>}
          {offlineNote && <p className="text-sm font-medium text-amber-800 mt-2">{offlineNote}</p>}
        </Card>
        <ErrorBox message={error} />
        <button
          onClick={toTriage}
          disabled={busy}
          className="w-full rounded-xl bg-teal-700 text-white font-semibold py-3 disabled:opacity-60"
        >
          Send to triage now
        </button>
        {!offlineNote && (
          <button
            onClick={() => go({ name: 'patient', id: created.id })}
            className="w-full rounded-xl bg-white border border-slate-300 py-3"
          >
            Open patient record
          </button>
        )}
        {offlineNote && (
          <button onClick={() => go({ name: 'patients' })} className="w-full rounded-xl bg-white border border-slate-300 py-3">
            Back to patients
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <BackBar title="Register patient" onBack={() => go(referralId ? { name: 'referrals' } : { name: 'patients' })} />
      {referralId && (
        <p className="text-sm rounded-lg bg-sky-50 border border-sky-300 p-3">
          Details are filled in from the referral. Check them and register the patient at this facility.
        </p>
      )}

      <Card className="space-y-3">
        <label className="block text-sm">
          <span className="text-slate-600">Full name *</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-base"
          />
          <span className="text-xs text-slate-500">Unknown patient? Type "Unknown male" and update later.</span>
        </label>

        {dupes.rows.length > 0 && (
          <div className="rounded-lg border border-amber-400 bg-amber-50 p-2 space-y-2">
            <p className="text-sm font-semibold text-amber-800">
              Already registered? Returning patients keep their number.
            </p>
            <PatientList rows={dupes.rows.slice(0, 4)} onOpen={(id) => go({ name: 'patient', id })} />
          </div>
        )}

        <label className="block text-sm">
          <span className="text-slate-600">Father's name</span>
          <input
            value={father}
            onChange={(e) => setFather(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-base"
          />
        </label>

        <div>
          <p className="text-sm text-slate-600 mb-1">Sex *</p>
          <Choice
            value={sex}
            onChange={setSex}
            options={[{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }]}
          />
        </div>

        <NumField label="Age, estimate is fine *" unit="years" value={age} onChange={setAge} min={0} max={120} />

        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="text-slate-600">Phone</span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-base"
            />
          </label>
          <label className="block text-sm">
            <span className="text-slate-600">District</span>
            <input
              value={district}
              onChange={(e) => setDistrict(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-base"
            />
          </label>
        </div>

        <label className="block text-sm">
          <span className="text-slate-600">Blood group</span>
          <select
            value={blood}
            onChange={(e) => setBlood(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-base bg-white"
          >
            {BLOOD.map((b) => (
              <option key={b}>{b}</option>
            ))}
          </select>
        </label>

        <div>
          <p className="text-sm text-slate-600 mb-1">Allergies * (choose one; "Unknown" is allowed)</p>
          <Choice
            value={allergy}
            onChange={setAllergy}
            options={[
              { value: 'unknown', label: 'Unknown' },
              { value: 'none', label: 'None' },
              { value: 'known', label: 'Known' },
            ]}
          />
          {allergy === 'known' && (
            <input
              value={allergyText}
              onChange={(e) => setAllergyText(e.target.value)}
              placeholder="Which allergies?"
              className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-3 text-base"
            />
          )}
        </div>
      </Card>

      <ErrorBox message={error} />
      <button
        onClick={submit}
        disabled={!valid || busy}
        className="w-full rounded-xl bg-teal-700 text-white font-semibold py-3 disabled:opacity-50"
      >
        {busy ? 'Saving…' : 'Register patient'}
      </button>
    </div>
  )
}
