import { PRIORITY_STYLE, gcsTotal, shockIndex, type Priority } from '../lib/format'
import type { TriageData } from '../types'

const flag = (b?: boolean) => (b ? 'Yes' : 'No')

export default function TriageSummary({ data, priority }: { data: TriageData | null; priority: string | null }) {
  if (!data) return <p className="text-sm text-slate-500">No triage record found.</p>
  const v = data.vitals ?? {}
  const a = data.arrival ?? {}
  const p = data.primary_survey ?? {}
  const gcs = gcsTotal(v.gcs_e, v.gcs_v, v.gcs_m)
  const si = shockIndex(v.hr, v.bp_sys)
  const style = priority && priority in PRIORITY_STYLE ? PRIORITY_STYLE[priority as Priority] : null

  return (
    <div className={`rounded-xl border-l-4 p-3 space-y-2 text-sm ${style ? style.soft : 'bg-slate-50 border-slate-300'}`}>
      {style && <p className="font-semibold">Triage: {style.label}</p>}
      <p>
        <span className="text-slate-500">Arrival:</span> {[a.mode, a.from, a.incident, a.trauma_type].filter(Boolean).join(' · ') || 'n/a'}
        {a.hours_since_injury != null ? ` · ${a.hours_since_injury} h since injury` : ''}
      </p>
      <p className="font-medium">{data.injury_description}</p>
      <div className="grid grid-cols-3 gap-2 text-center">
        <Cell label="BP" value={v.bp_sys && v.bp_dia ? `${v.bp_sys}/${v.bp_dia}` : '-'} />
        <Cell label="HR" value={v.hr ?? '-'} />
        <Cell label="RR" value={v.rr ?? '-'} />
        <Cell label="SpO₂" value={v.spo2 != null ? `${v.spo2}%` : '-'} />
        <Cell label="Temp" value={v.temp_c != null ? `${v.temp_c}°` : '-'} />
        <Cell label="GCS" value={gcs ? `${gcs} (E${v.gcs_e} V${v.gcs_v} M${v.gcs_m})` : '-'} />
      </div>
      <p className="text-xs text-slate-600">
        Shock index {si ?? '-'} · Pupils L {v.pupil_left || '-'} / R {v.pupil_right || '-'}
      </p>
      <p className="text-xs text-slate-600">
        Massive bleeding: {flag(p.massive_haemorrhage)} · Airway compromised: {flag(p.airway_compromised)} · Breathing distress:{' '}
        {flag(p.breathing_distress)} · C-spine collar: {flag(p.c_spine_collar)}
      </p>
      {data.notes && <p className="text-xs">Notes: {data.notes}</p>}
    </div>
  )
}

function Cell({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white/70 rounded-lg py-1 px-1">
      <p className="text-[10px] uppercase text-slate-500">{label}</p>
      <p className="font-semibold text-xs">{value}</p>
    </div>
  )
}
