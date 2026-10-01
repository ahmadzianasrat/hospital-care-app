import { useCallback, useEffect, useState } from 'react'
import { supabase, FACILITY_TZ } from '../lib/supabase'
import { errMsg, gcsTotal } from '../lib/format'
import type {
  BarthelRow, CirculationRow, FluidBalance, ObservationRow, PatientRow, RoundStop, View, WardRow,
} from '../types'
import { BackBar, Card, ErrorBox, PatientHeader, TextArea } from './ui'

const time = (iso: string) => new Date(iso).toLocaleString('en-GB', { timeZone: FACILITY_TZ, dateStyle: 'short', timeStyle: 'short' })

type Details = {
  obs: ObservationRow | null
  circ: CirculationRow | null
  balance: FluidBalance | null
  barthel: BarthelRow | null
  pendingTasks: number
  overdueTasks: number
}

export default function RoundMode({
  wardId, go, notify, canWrite,
}: { wardId: string; go: (v: View) => void; notify: (m: string) => void; canWrite: boolean }) {
  const [ward, setWard] = useState<WardRow | null>(null)
  const [stops, setStops] = useState<RoundStop[] | null>(null)
  const [index, setIndex] = useState(0)
  const [details, setDetails] = useState<Details | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    ;(async () => {
      const w = await supabase.from('wards').select('id, code, name').eq('id', wardId).maybeSingle()
      if (w.error) return setError(errMsg(w.error))
      setWard(w.data as WardRow)

      const beds = await supabase.from('beds').select('id, code').eq('ward_id', wardId).eq('active', true).order('code')
      const bedIds = (beds.data ?? []).map((b) => b.id)
      if (bedIds.length === 0) return setStops([])

      const stays = await supabase.from('bed_stays').select('bed_id, encounter_id').in('bed_id', bedIds).is('to_at', null)
      const encIds = (stays.data ?? []).map((s) => s.encounter_id)
      if (encIds.length === 0) return setStops([])

      const encs = await supabase.from('encounters').select('id, patients(*)').in('id', encIds).eq('status', 'admitted')
      const patientByEnc = new Map((encs.data ?? []).map((e) => [e.id, e.patients as unknown as PatientRow]))

      const rows: RoundStop[] = (stays.data ?? [])
        .filter((s) => patientByEnc.has(s.encounter_id))
        .map((s) => ({
          encounterId: s.encounter_id,
          bedCode: beds.data!.find((b) => b.id === s.bed_id)!.code,
          patient: patientByEnc.get(s.encounter_id)!,
        }))
        .sort((a, b) => a.bedCode.localeCompare(b.bedCode, undefined, { numeric: true }))
      setStops(rows)
    })()
  }, [wardId])

  const loadDetails = useCallback(async (encounterId: string) => {
    setDetails(null)
    const [obs, circ, balance, barthel, tasks] = await Promise.all([
      supabase.from('observations').select('*').eq('encounter_id', encounterId).order('recorded_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('circulation_checks').select('*').eq('encounter_id', encounterId).order('recorded_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.rpc('fluid_balance', { p_encounter_id: encounterId }),
      supabase.from('barthel_assessments').select('*').eq('encounter_id', encounterId).order('recorded_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('tasks').select('due_at').eq('encounter_id', encounterId).eq('status', 'pending'),
    ])
    const now = Date.now()
    setDetails({
      obs: (obs.data as ObservationRow) ?? null,
      circ: (circ.data as CirculationRow) ?? null,
      balance: (balance.data as FluidBalance[] | null)?.[0] ?? null,
      barthel: (barthel.data as BarthelRow) ?? null,
      pendingTasks: tasks.data?.length ?? 0,
      overdueTasks: tasks.data?.filter((t) => new Date(t.due_at).getTime() < now).length ?? 0,
    })
  }, [])

  useEffect(() => {
    if (stops && stops.length > 0 && stops[index]) loadDetails(stops[index].encounterId)
  }, [stops, index, loadDetails])

  async function saveAndNext() {
    const stop = stops?.[index]
    if (!stop) return
    setBusy(true)
    setError(null)
    if (note.trim().length >= 2) {
      const { error } = await supabase.rpc('add_round_note', { p_encounter_id: stop.encounterId, p_text: note.trim() })
      if (error) {
        setBusy(false)
        return setError(errMsg(error))
      }
    }
    setBusy(false)
    setNote('')
    if (index + 1 < (stops?.length ?? 0)) setIndex(index + 1)
    else {
      notify('Round complete.')
      go({ name: 'wards' })
    }
  }

  if (error) {
    return (
      <div className="space-y-3">
        <BackBar title="Round" onBack={() => go({ name: 'ward', wardId })} />
        <ErrorBox message={error} />
      </div>
    )
  }
  if (!ward || stops === null) return <p className="text-slate-500">Loading…</p>
  if (stops.length === 0) {
    return (
      <div className="space-y-3">
        <BackBar title={`Round: ${ward.name}`} onBack={() => go({ name: 'ward', wardId })} />
        <Card><p className="text-sm text-slate-600">No admitted, bedded patients in this ward.</p></Card>
      </div>
    )
  }

  const stop = stops[index]
  const gcs = details?.obs ? gcsTotal(details.obs.gcs_e, details.obs.gcs_v, details.obs.gcs_m) : null

  return (
    <div className="space-y-3">
      <BackBar title={`Round: ${ward.name} (${index + 1}/${stops.length})`} onBack={() => go({ name: 'ward', wardId })} />
      <PatientHeader patient={stop.patient} />
      <p className="text-sm text-slate-500 -mt-2">Bed {stop.bedCode}</p>

      {details === null ? (
        <p className="text-slate-500 text-sm">Loading patient details…</p>
      ) : (
        <>
          <Card className="space-y-1">
            <h2 className="font-semibold text-sm">Nursing</h2>
            {details.obs ? (
              <p className="text-sm">
                {details.obs.bp_sys && details.obs.bp_dia ? `BP ${details.obs.bp_sys}/${details.obs.bp_dia} · ` : ''}
                {details.obs.hr ? `HR ${details.obs.hr} · ` : ''}
                {details.obs.spo2 ? `SpO₂ ${details.obs.spo2}% · ` : ''}
                {gcs ? `GCS ${gcs}` : ''}
                <span className="text-xs text-slate-400"> ({time(details.obs.recorded_at)})</span>
              </p>
            ) : <p className="text-sm text-slate-500">No vitals recorded yet.</p>}
            <p className={`text-sm ${details.overdueTasks > 0 ? 'text-red-700 font-semibold' : ''}`}>
              {details.pendingTasks} task(s) due{details.overdueTasks > 0 ? `, ${details.overdueTasks} overdue` : ''}
            </p>
            {details.circ && (
              <p className={`text-sm ${details.circ.bleeding ? 'text-red-700 font-semibold' : ''}`}>
                Circulation ({details.circ.limb}): {details.circ.movement}, {details.circ.sensation}
                {details.circ.bleeding ? ', bleeding' : ''}
              </p>
            )}
          </Card>

          {details.balance && (
            <Card className="space-y-1">
              <h2 className="font-semibold text-sm">Fluid balance (24h)</h2>
              <p className="text-sm">In {details.balance.last24_in_ml} ml · Out {details.balance.last24_out_ml} ml · Balance {details.balance.last24_balance_ml} ml</p>
            </Card>
          )}

          <Card className="space-y-1">
            <h2 className="font-semibold text-sm">Physio</h2>
            {details.barthel
              ? <p className="text-sm">Barthel {details.barthel.total_score}/100 <span className="text-xs text-slate-400">({time(details.barthel.recorded_at)})</span></p>
              : <p className="text-sm text-slate-500">No Barthel score yet.</p>}
          </Card>

          <button onClick={() => go({ name: 'ward_patient', encounterId: stop.encounterId })} className="w-full text-sm text-teal-800 underline text-center">
            Open full chart for this patient
          </button>

          {canWrite && (
            <Card className="space-y-3">
              <TextArea label="Round note (optional)" value={note} onChange={setNote} rows={3} />
              <ErrorBox message={error} />
              <button onClick={saveAndNext} disabled={busy} className="w-full rounded-xl bg-teal-700 text-white font-semibold py-3 disabled:opacity-50">
                {busy ? 'Saving…' : index + 1 < stops.length ? 'Save & next patient' : 'Save & finish round'}
              </button>
            </Card>
          )}
          {!canWrite && (
            <div className="flex gap-2">
              <button onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={index === 0} className="flex-1 rounded-xl bg-white border border-slate-300 py-3 disabled:opacity-40">Previous</button>
              <button onClick={() => (index + 1 < stops.length ? setIndex(index + 1) : go({ name: 'wards' }))} className="flex-1 rounded-xl bg-teal-700 text-white font-semibold py-3">
                {index + 1 < stops.length ? 'Next patient' : 'Finish'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
