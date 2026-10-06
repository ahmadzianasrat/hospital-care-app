import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { errMsg } from '../lib/format'
import { startVisit } from '../lib/visits'
import { useOffline } from '../lib/offline/context'
import type { PatientRow, View } from '../types'
import { BackBar, Card, ErrorBox, PatientHeader, PriorityBadge } from './ui'

type Visit = { id: string; status: string; arrived_at: string; triage_priority: string | null }
type ExtId = { id: string; system: string; value: string }

const STATUS_LABEL: Record<string, string> = {
  waiting_triage: 'Waiting for triage',
  waiting_opd: 'Waiting for OPD',
  in_opd: 'With doctor',
  admitted: 'Admitted',
  referred_out: 'Referred out',
  discharged: 'Discharged',
  closed: 'Closed',
}
const OPEN = ['waiting_triage', 'waiting_opd', 'in_opd', 'admitted']

export default function PatientView({
  id, go, notify, canStartVisit, staffId,
}: { id: string; go: (v: View) => void; notify: (m: string) => void; canStartVisit: boolean; staffId: string }) {
  const { engine } = useOffline()
  const [patient, setPatient] = useState<PatientRow | null>(null)
  const [visits, setVisits] = useState<Visit[]>([])
  const [ext, setExt] = useState<ExtId[]>([])
  const [xray, setXray] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const p = await supabase.from('patients').select('*').eq('id', id).maybeSingle()
    if (p.error) return setError(errMsg(p.error))
    setPatient(p.data as PatientRow | null)
    const v = await supabase
      .from('encounters')
      .select('id, status, arrived_at, triage_priority')
      .eq('patient_id', id)
      .order('arrived_at', { ascending: false })
      .limit(10)
    setVisits((v.data ?? []) as Visit[])
    const x = await supabase.from('external_identifiers').select('id, system, value').eq('patient_id', id)
    setExt((x.data ?? []) as ExtId[])
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  async function addXray() {
    if (!patient) return
    setError(null)
    const { error } = await supabase
      .from('external_identifiers')
      .insert({ patient_id: patient.id, facility_id: patient.facility_id, system: 'radiology', value: xray.trim() })
    if (error) {
      setError(error.message.includes('duplicate') ? 'This x-ray number is already used.' : errMsg(error))
    } else {
      setXray('')
      load()
    }
  }

  async function newVisit() {
    if (!patient) return
    setBusy(true)
    try {
      const v = await startVisit(engine, staffId, patient.id, { id: patient.id, display_id: patient.display_id })
      if (v.queued) notify(`${patient.display_id} saved for triage. Will sync once online.`)
      else notify(v.alreadyOpen ? 'This patient already has an open visit.' : `${patient.display_id} sent to triage.`)
      go({ name: 'triage' })
    } catch (e) {
      setError(errMsg(e))
      setBusy(false)
    }
  }

  if (!patient) {
    return (
      <div className="space-y-3">
        <BackBar title="Patient" onBack={() => go({ name: 'patients' })} />
        <ErrorBox message={error} />
        <p className="text-slate-500">Loading…</p>
      </div>
    )
  }

  const hasOpen = visits.some((v) => OPEN.includes(v.status))

  return (
    <div className="space-y-3">
      <BackBar title="Patient" onBack={() => go({ name: 'patients' })} />
      <PatientHeader patient={patient} />
      <ErrorBox message={error} />

      <button onClick={() => go({ name: 'wristband', patientId: patient.id })} className="w-full rounded-xl bg-white border border-slate-300 py-3 font-medium">
        Print wristband / QR label
      </button>

      {canStartVisit && (
        <button
          onClick={newVisit}
          disabled={busy || hasOpen}
          className="w-full rounded-xl bg-teal-700 text-white font-semibold py-3 disabled:opacity-50"
        >
          {hasOpen ? 'Visit already open' : 'Start new visit (send to triage)'}
        </button>
      )}

      <Card>
        <h2 className="font-semibold mb-2">Other numbers</h2>
        {ext.length === 0 && <p className="text-sm text-slate-500">No x-ray or lab numbers yet.</p>}
        <ul className="text-sm space-y-1">
          {ext.map((e) => (
            <li key={e.id} className="flex justify-between">
              <span className="capitalize">{e.system}</span>
              <span className="font-mono">{e.value}</span>
            </li>
          ))}
        </ul>
        {canStartVisit && (
          <div className="mt-3 flex gap-2">
            <input
              value={xray}
              onChange={(e) => setXray(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              placeholder="6-digit x-ray number"
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2"
            />
            <button
              onClick={addXray}
              disabled={xray.length !== 6}
              className="rounded-lg bg-slate-800 text-white px-4 disabled:opacity-40"
            >
              Add
            </button>
          </div>
        )}
      </Card>

      <Card>
        <h2 className="font-semibold mb-2">Visits</h2>
        {visits.length === 0 && <p className="text-sm text-slate-500">No visits yet.</p>}
        <ul className="divide-y">
          {visits.map((v) => (
            <li key={v.id} className="py-2 space-y-1 text-sm">
              <div className="flex items-center justify-between">
                <span>{new Date(v.arrived_at).toLocaleString('en-GB', { timeZone: 'Asia/Kabul', dateStyle: 'medium', timeStyle: 'short' })}</span>
                <span className="flex items-center gap-2">
                  <PriorityBadge priority={v.triage_priority} />
                  <span className="text-slate-600">{STATUS_LABEL[v.status] ?? v.status}</span>
                </span>
              </div>
              <button onClick={() => go({ name: 'print_chart', encounterId: v.id })} className="text-xs text-teal-700 underline">
                Print paper copy
              </button>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
