import { BackBar, Card } from './ui'
import type { View } from '../types'

export default function WardCharts({ encounterId, go }: { encounterId: string; go: (v: View) => void }) {
  const items: { label: string; sub: string; target: View }[] = [
    { label: 'Medication list', sub: 'Every medication order and its dosing schedule, with who gave each dose', target: { name: 'ward_medications', encounterId } },
    { label: 'Vitals & GCS', sub: 'Blood pressure, pulse, breathing, oxygen, temperature, Glasgow Coma Scale, pupils', target: { name: 'chart_vitals', encounterId } },
    { label: 'Circulation', sub: 'Limb movement, sensation, capillary refill, bleeding', target: { name: 'chart_circulation', encounterId } },
    { label: 'Fluid balance', sub: 'IV fluids, oral intake, urine, stool, drains, running balance', target: { name: 'chart_fluids', encounterId } },
    { label: 'Barthel index', sub: 'Physiotherapy independence score', target: { name: 'chart_barthel', encounterId } },
    { label: 'Nursing & physio notes', sub: 'End-of-shift and treatment notes', target: { name: 'chart_notes', encounterId } },
  ]
  return (
    <div className="space-y-3">
      <BackBar title="Charts" onBack={() => go({ name: 'ward_patient', encounterId })} />
      {items.map((it) => (
        <button key={it.label} onClick={() => go(it.target)} className="w-full text-left bg-white rounded-xl shadow p-4">
          <p className="font-semibold">{it.label}</p>
          <p className="text-xs text-slate-500">{it.sub}</p>
        </button>
      ))}
      <Card><p className="text-xs text-slate-500">Every entry is timestamped and kept forever; nothing here can be edited or deleted, only added to.</p></Card>
    </div>
  )
}
