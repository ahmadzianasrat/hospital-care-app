import { useCallback, useEffect, useState } from 'react'
import { supabase, FACILITY_TZ } from '../lib/supabase'
import { errMsg, gcsTotal, shockIndex } from '../lib/format'
import type { ObservationRow, PatientRow, View } from '../types'
import { BackBar, Card, Choice, ErrorBox, NumField } from './ui'

const time = (iso: string) => new Date(iso).toLocaleString('en-GB', { timeZone: FACILITY_TZ, dateStyle: 'short', timeStyle: 'short' })
const PUPIL = [{ value: 'reactive', label: 'Reactive' }, { value: 'sluggish', label: 'Sluggish' }, { value: 'fixed', label: 'Fixed' }]

export default function VitalsChart({ encounterId, go }: { encounterId: string; go: (v: View) => void }) {
  const [patient, setPatient] = useState<PatientRow | null>(null)
  const [rows, setRows] = useState<ObservationRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [bpSys, setBpSys] = useState(''); const [bpDia, setBpDia] = useState('')
  const [hr, setHr] = useState(''); const [rr, setRr] = useState('')
  const [spo2, setSpo2] = useState(''); const [temp, setTemp] = useState('')
  const [gE, setGE] = useState(''); const [gV, setGV] = useState(''); const [gM, setGM] = useState('')
  const [pupL, setPupL] = useState(''); const [pupR, setPupR] = useState('')

  const load = useCallback(async () => {
    const p = await supabase.from('encounters').select('patients(*)').eq('id', encounterId).maybeSingle()
    setPatient((p.data?.patients as unknown as PatientRow) ?? null)
    const o = await supabase.from('observations').select('*').eq('encounter_id', encounterId).order('recorded_at', { ascending: false }).limit(30)
    if (o.error) return setError(errMsg(o.error))
    setRows((o.data ?? []) as ObservationRow[])
  }, [encounterId])

  useEffect(() => { load() }, [load])

  const pediatric = (patient?.age_years ?? 99) < 2
  const gcs = gcsTotal(Number(gE) || null, Number(gV) || null, Number(gM) || null)
  const si = shockIndex(Number(hr) || null, Number(bpSys) || null)
  const range = (n: number) => Array.from({ length: n }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))

  async function save() {
    setBusy(true)
    setError(null)
    const { error } = await supabase.rpc('record_observation', {
      p_encounter_id: encounterId,
      p_bp_sys: bpSys ? Number(bpSys) : null, p_bp_dia: bpDia ? Number(bpDia) : null,
      p_hr: hr ? Number(hr) : null, p_rr: rr ? Number(rr) : null, p_spo2: spo2 ? Number(spo2) : null,
      p_temp_c: temp ? Number(temp) : null,
      p_gcs_e: gE ? Number(gE) : null, p_gcs_v: gV ? Number(gV) : null, p_gcs_m: gM ? Number(gM) : null,
      p_pupil_left: pupL || null, p_pupil_right: pupR || null, p_note: null,
    })
    setBusy(false)
    if (error) return setError(errMsg(error))
    setBpSys(''); setBpDia(''); setHr(''); setRr(''); setSpo2(''); setTemp(''); setGE(''); setGV(''); setGM(''); setPupL(''); setPupR('')
    load()
  }

  return (
    <div className="space-y-3">
      <BackBar title="Vitals & GCS" onBack={() => go({ name: 'ward_charts', encounterId })} />
      {pediatric && <p className="text-xs rounded-lg bg-sky-50 border border-sky-300 p-2">Pediatric patient (under 2). Score the Glasgow Coma Scale using the pediatric verbal/eye response guide your facility uses; the 1-5/1-4/1-6 numbers are the same scale, applied to age-appropriate responses.</p>}

      <Card className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <NumField label="BP systolic" unit="mmHg" value={bpSys} onChange={setBpSys} />
          <NumField label="BP diastolic" unit="mmHg" value={bpDia} onChange={setBpDia} />
          <NumField label="Heart rate" unit="bpm" value={hr} onChange={setHr} />
          <NumField label="Resp. rate" unit="/min" value={rr} onChange={setRr} />
          <NumField label="SpO₂" unit="%" value={spo2} onChange={setSpo2} min={0} max={100} />
          <NumField label="Temperature" unit="°C" value={temp} onChange={setTemp} />
        </div>
        {si != null && <p className="text-xs text-slate-500">Shock index: {si}</p>}
        <div>
          <p className="text-sm text-slate-600 mb-1">Eyes (E)</p><Choice value={gE} onChange={setGE} options={range(4)} />
          <p className="text-sm text-slate-600 mt-2 mb-1">Verbal (V)</p><Choice value={gV} onChange={setGV} options={range(5)} />
          <p className="text-sm text-slate-600 mt-2 mb-1">Motor (M)</p><Choice value={gM} onChange={setGM} options={range(6)} />
          {gcs != null && <p className="mt-2 font-semibold">GCS total: {gcs}</p>}
        </div>
        <div>
          <p className="text-sm text-slate-600 mb-1">Left pupil</p><Choice value={pupL} onChange={setPupL} options={PUPIL} />
          <p className="text-sm text-slate-600 mt-2 mb-1">Right pupil</p><Choice value={pupR} onChange={setPupR} options={PUPIL} />
        </div>
        <ErrorBox message={error} />
        <button onClick={save} disabled={busy} className="w-full rounded-xl bg-teal-700 text-white font-semibold py-3 disabled:opacity-50">
          {busy ? 'Saving…' : 'Add entry'}
        </button>
      </Card>

      <Card className="space-y-1">
        <h2 className="font-semibold mb-1">Last {rows.length} entries</h2>
        {rows.length === 0 && <p className="text-sm text-slate-500">Nothing recorded yet.</p>}
        <div className="overflow-x-auto -mx-2 px-2">
          <table className="text-xs w-full">
            <thead><tr className="text-left text-slate-500"><th className="pr-2">Time</th><th>BP</th><th>HR</th><th>RR</th><th>SpO₂</th><th>Temp</th><th>GCS</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="pr-2 py-1 whitespace-nowrap">{time(r.recorded_at)}</td>
                  <td>{r.bp_sys && r.bp_dia ? `${r.bp_sys}/${r.bp_dia}` : '-'}</td>
                  <td>{r.hr ?? '-'}</td><td>{r.rr ?? '-'}</td><td>{r.spo2 ?? '-'}</td><td>{r.temp_c ?? '-'}</td>
                  <td>{gcsTotal(r.gcs_e, r.gcs_v, r.gcs_m) ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
