import { useEffect, useState } from 'react'
import { supabase, FACILITY_TZ } from '../lib/supabase'
import { errMsg, gcsTotal } from '../lib/format'
import type {
  BedStayRow, CareNote, CirculationRow, ObservationRow, OrderRow, PatientRow, TriageData, View,
} from '../types'
import { ORDER_TYPE_LABELS, FREQUENCY_LABELS } from '../types'
import { ErrorBox } from './ui'

const dt = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('en-GB', { timeZone: FACILITY_TZ, dateStyle: 'medium', timeStyle: 'short' }) : '-'

type Data = {
  patient: PatientRow
  status: string
  arrivedAt: string
  triage: TriageData | null
  triagePriority: string | null
  opdDiagnosis: string | null
  stay: BedStayRow | null
  orders: OrderRow[]
  observations: ObservationRow[]
  circulation: CirculationRow[]
  notes: CareNote[]
}

export default function PrintChart({ encounterId, go }: { encounterId: string; go: (v: View) => void }) {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      const enc = await supabase.from('encounters').select('status, arrived_at, triage_priority, patients(*)').eq('id', encounterId).maybeSingle()
      if (enc.error) return setError(errMsg(enc.error))
      if (!enc.data) return setError('Visit not found.')

      const [triageDoc, opdDoc, stay, orders, obs, circ, notes] = await Promise.all([
        supabase.from('documents').select('data').eq('encounter_id', encounterId).eq('doc_type', 'first_assessment').order('created_at').limit(1).maybeSingle(),
        supabase.from('documents').select('data').eq('encounter_id', encounterId).eq('doc_type', 'opd_note').order('created_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('bed_stays').select('id, encounter_id, bed_id, from_at, to_at, beds(id, ward_id, code, active)').eq('encounter_id', encounterId).is('to_at', null).maybeSingle(),
        supabase.from('orders').select('*').eq('encounter_id', encounterId).eq('status', 'active'),
        supabase.from('observations').select('*').eq('encounter_id', encounterId).order('recorded_at', { ascending: false }).limit(12),
        supabase.from('circulation_checks').select('*').eq('encounter_id', encounterId).order('recorded_at', { ascending: false }).limit(6),
        supabase.from('documents').select('id, created_at, doc_type, data, staff:author_id(full_name)').eq('encounter_id', encounterId).in('doc_type', ['nursing_note', 'physio_note']).order('created_at', { ascending: false }).limit(8),
      ])

      setData({
        patient: enc.data.patients as unknown as PatientRow,
        status: enc.data.status,
        arrivedAt: enc.data.arrived_at,
        triagePriority: enc.data.triage_priority,
        triage: (triageDoc.data?.data as TriageData) ?? null,
        opdDiagnosis: (opdDoc.data?.data as { diagnosis?: string } | undefined)?.diagnosis ?? null,
        stay: (stay.data as unknown as BedStayRow) ?? null,
        orders: (orders.data ?? []) as OrderRow[],
        observations: (obs.data ?? []) as ObservationRow[],
        circulation: (circ.data ?? []) as CirculationRow[],
        notes: (notes.data ?? []) as unknown as CareNote[],
      })
    })()
  }, [encounterId])

  if (error) {
    return (
      <div className="space-y-3">
        <button onClick={() => go({ name: 'home' })} className="no-print text-sm text-teal-700 underline">← Back</button>
        <ErrorBox message={error} />
      </div>
    )
  }
  if (!data) return <p className="text-slate-500">Loading…</p>

  const { patient } = data

  return (
    <div className="bg-white text-slate-900 -mx-4 px-4">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
        }
      `}</style>

      <div className="no-print flex gap-2 py-3">
        <button onClick={() => go({ name: 'home' })} className="flex-1 rounded-xl bg-white border border-slate-300 py-3">← Back</button>
        <button onClick={() => window.print()} className="flex-1 rounded-xl bg-teal-700 text-white font-semibold py-3">Print</button>
      </div>

      <div className="border-2 border-slate-800 rounded-lg p-4 space-y-4 text-sm">
        <div className="flex justify-between items-start border-b border-slate-300 pb-2">
          <div>
            <p className="font-bold text-lg">Patient Chart - Paper Copy</p>
            <p className="text-xs text-slate-500">Printed {dt(new Date().toISOString())}</p>
          </div>
          <p className="text-xs text-slate-500">{patient.facility_id ? '' : ''}</p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <p className="font-mono text-2xl font-bold">{patient.display_id}</p>
            <p className="font-semibold">{patient.full_name}</p>
            <p>{patient.father_name ? `S/o ${patient.father_name}` : ''}</p>
            <p>{patient.sex === 'male' ? 'Male' : 'Female'}, {patient.age_years ?? '?'} years</p>
          </div>
          <div className="text-right">
            <p>Blood group: <b>{patient.blood_group}</b></p>
            <p className={patient.allergy_status === 'known' ? 'font-bold' : ''}>
              Allergies: {patient.allergy_status === 'known' ? patient.allergy_details : patient.allergy_status === 'none' ? 'None known' : 'Unknown'}
            </p>
            <p>Arrived: {dt(data.arrivedAt)}</p>
            <p>Status: {data.status}{data.stay ? ` - Bed ${data.stay.beds?.code}` : ''}</p>
          </div>
        </div>

        {data.triage && (
          <section className="border-t border-slate-300 pt-2">
            <p className="font-bold uppercase text-xs text-slate-500 mb-1">First assessment / triage ({data.triagePriority ?? 'not set'})</p>
            <p>{data.triage.injury_description}</p>
            {data.triage.vitals && (
              <p className="text-xs">
                BP {data.triage.vitals.bp_sys}/{data.triage.vitals.bp_dia} · HR {data.triage.vitals.hr} · RR {data.triage.vitals.rr} ·
                SpO₂ {data.triage.vitals.spo2}% · GCS {gcsTotal(data.triage.vitals.gcs_e, data.triage.vitals.gcs_v, data.triage.vitals.gcs_m) ?? '-'}
              </p>
            )}
          </section>
        )}

        {data.opdDiagnosis && (
          <section className="border-t border-slate-300 pt-2">
            <p className="font-bold uppercase text-xs text-slate-500 mb-1">Diagnosis</p>
            <p>{data.opdDiagnosis}</p>
          </section>
        )}

        {data.orders.length > 0 && (
          <section className="border-t border-slate-300 pt-2">
            <p className="font-bold uppercase text-xs text-slate-500 mb-1">Active orders</p>
            <ul className="space-y-0.5">
              {data.orders.map((o) => (
                <li key={o.id}>- {ORDER_TYPE_LABELS[o.order_type]}: {o.details.instruction} ({FREQUENCY_LABELS[o.frequency]})</li>
              ))}
            </ul>
          </section>
        )}

        {data.observations.length > 0 && (
          <section className="border-t border-slate-300 pt-2">
            <p className="font-bold uppercase text-xs text-slate-500 mb-1">Recent vitals</p>
            <table className="w-full text-xs">
              <thead><tr className="text-left border-b border-slate-300"><th>Time</th><th>BP</th><th>HR</th><th>RR</th><th>SpO₂</th><th>Temp</th><th>GCS</th></tr></thead>
              <tbody>
                {data.observations.map((o) => (
                  <tr key={o.id} className="border-b border-slate-100">
                    <td>{dt(o.recorded_at)}</td>
                    <td>{o.bp_sys && o.bp_dia ? `${o.bp_sys}/${o.bp_dia}` : '-'}</td>
                    <td>{o.hr ?? '-'}</td><td>{o.rr ?? '-'}</td><td>{o.spo2 ?? '-'}</td><td>{o.temp_c ?? '-'}</td>
                    <td>{gcsTotal(o.gcs_e, o.gcs_v, o.gcs_m) ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {data.circulation.length > 0 && (
          <section className="border-t border-slate-300 pt-2">
            <p className="font-bold uppercase text-xs text-slate-500 mb-1">Recent circulation checks</p>
            {data.circulation.map((c) => (
              <p key={c.id} className="text-xs">{dt(c.recorded_at)} - {c.limb}: {c.movement}, {c.sensation}{c.bleeding ? ', BLEEDING' : ''}</p>
            ))}
          </section>
        )}

        {data.notes.length > 0 && (
          <section className="border-t border-slate-300 pt-2">
            <p className="font-bold uppercase text-xs text-slate-500 mb-1">Recent notes</p>
            {data.notes.map((n) => (
              <p key={n.id} className="text-xs mb-1"><b>{dt(n.created_at)} ({n.doc_type === 'nursing_note' ? 'Nursing' : 'Physio'}, {n.staff?.full_name}):</b> {n.data.text}</p>
            ))}
          </section>
        )}

        <p className="text-xs text-slate-400 border-t border-slate-300 pt-2">
          This is a snapshot from the app at the time of printing. It is not updated automatically once printed.
        </p>
      </div>
    </div>
  )
}
