import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase, FACILITY_TZ } from '../lib/supabase'
import { uuid } from '../lib/uuid'
import { errMsg } from '../lib/format'
import type { PatientRow, Treatment } from '../types'
import { Card, ErrorBox } from './ui'

const PROCEDURES = [
  'Wound dressing', 'Wound cleaning', 'Suturing', 'Splint / cast', 'Injection',
  'IV cannulation', 'Tetanus vaccine', 'Other',
]
const ROUTES = ['', 'PO', 'IM', 'IV', 'SC', 'Topical']

// True if the drug name looks like something the patient is allergic to.
function allergyMatch(patient: PatientRow, drug: string): boolean {
  if (patient.allergy_status !== 'known' || !patient.allergy_details) return false
  const d = drug.toLowerCase().trim()
  if (d.length < 3) return false
  const words = patient.allergy_details.toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 3)
  return words.some((w) => d.includes(w) || (d.length >= 4 && w.includes(d)))
}

export default function QuickTreatments({
  encounterId, patient, canAdd,
}: { encounterId: string; patient: PatientRow; canAdd: boolean }) {
  const [list, setList] = useState<Treatment[]>([])
  const [open, setOpen] = useState(false)
  const [procedure, setProcedure] = useState('')
  const [drug, setDrug] = useState('')
  const [dose, setDose] = useState('')
  const [route, setRoute] = useState('')
  const [note, setNote] = useState('')
  const [confirmAllergy, setConfirmAllergy] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const docId = useRef(uuid()) // same id on retry = never recorded twice

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('documents')
      .select('data')
      .eq('encounter_id', encounterId)
      .eq('doc_type', 'quick_treatment')
      .order('created_at')
    setList((data ?? []).map((d) => d.data as Treatment))
  }, [encounterId])

  useEffect(() => {
    load()
  }, [load])

  const allergic = allergyMatch(patient, drug)
  const valid = (procedure.trim() + drug.trim()).length >= 2 && (!allergic || confirmAllergy)

  async function save() {
    setBusy(true)
    setError(null)
    const { error } = await supabase.rpc('add_quick_treatment', {
      p_encounter_id: encounterId,
      p_data: {
        procedure, drug: drug.trim(), dose: dose.trim(), route, note: note.trim(),
        allergy_warning_acknowledged: allergic,
      },
      p_doc_id: docId.current,
    })
    setBusy(false)
    if (error) return setError(errMsg(error))
    setProcedure(''); setDrug(''); setDose(''); setRoute(''); setNote(''); setConfirmAllergy(false)
    docId.current = uuid()
    setOpen(false)
    load()
  }

  return (
    <Card className="space-y-2">
      <h2 className="font-semibold">Quick treatment</h2>
      {list.length === 0 && <p className="text-sm text-slate-500">Nothing recorded yet.</p>}
      <ul className="divide-y">
        {list.map((t, i) => (
          <li key={i} className="py-2 text-sm">
            <p className="font-medium">
              {[t.procedure, [t.drug, t.dose, t.route].filter(Boolean).join(' ')].filter(Boolean).join(' · ')}
            </p>
            <p className="text-xs text-slate-500">
              {t.given_at ? new Date(t.given_at).toLocaleTimeString('en-GB', { timeZone: FACILITY_TZ, hour: '2-digit', minute: '2-digit' }) : ''}
              {t.given_by ? ` · ${t.given_by}` : ''}
              {t.note ? ` · ${t.note}` : ''}
            </p>
          </li>
        ))}
      </ul>

      {canAdd && !open && (
        <button onClick={() => setOpen(true)} className="w-full rounded-xl border border-teal-700 text-teal-800 font-semibold py-3">
          + Add treatment
        </button>
      )}

      {canAdd && open && (
        <div className="space-y-3 border-t pt-3">
          <label className="block text-sm">
            <span className="text-slate-600">Procedure</span>
            <select value={procedure} onChange={(e) => setProcedure(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-base bg-white">
              <option value="">None / select…</option>
              {PROCEDURES.map((p) => <option key={p}>{p}</option>)}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-slate-600">Drug (if any)</span>
            <input value={drug} onChange={(e) => { setDrug(e.target.value); setConfirmAllergy(false) }} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-base" />
          </label>
          {allergic && (
            <div className="rounded-lg border-2 border-red-600 bg-red-50 p-3 text-sm space-y-2">
              <p className="font-semibold text-red-800">Possible allergy: {patient.allergy_details}</p>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={confirmAllergy} onChange={(e) => setConfirmAllergy(e.target.checked)} className="h-5 w-5" />
                <span>I checked. It is safe to give.</span>
              </label>
            </div>
          )}
          {!allergic && drug.trim() && patient.allergy_status === 'unknown' && (
            <p className="text-xs text-amber-700">Allergies are unknown for this patient. Ask if possible.</p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="text-slate-600">Dose</span>
              <input value={dose} onChange={(e) => setDose(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-base" />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">Route</span>
              <select value={route} onChange={(e) => setRoute(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-base bg-white">
                {ROUTES.map((r) => <option key={r} value={r}>{r || '-'}</option>)}
              </select>
            </label>
          </div>
          <label className="block text-sm">
            <span className="text-slate-600">Note</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-base" />
          </label>
          <ErrorBox message={error} />
          <div className="flex gap-2">
            <button onClick={save} disabled={!valid || busy} className="flex-1 rounded-xl bg-teal-700 text-white font-semibold py-3 disabled:opacity-50">
              {busy ? 'Saving…' : 'Record as done'}
            </button>
            <button onClick={() => setOpen(false)} className="flex-1 rounded-xl bg-white border border-slate-300 py-3">Cancel</button>
          </div>
        </div>
      )}
    </Card>
  )
}
