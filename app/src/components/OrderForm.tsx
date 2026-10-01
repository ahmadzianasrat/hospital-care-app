import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { uuid } from '../lib/uuid'
import { errMsg } from '../lib/format'
import { ORDER_TYPE_LABELS, FREQUENCY_LABELS, type View } from '../types'
import { BackBar, Card, Choice, ErrorBox, NumField, TextArea } from './ui'

const TYPES = Object.keys(ORDER_TYPE_LABELS)
const FREQS = ['stat', 'once', 'od', 'bid', 'tid', 'qid', 'continuous']

export default function OrderForm({
  encounterId, go, notify,
}: { encounterId: string; go: (v: View) => void; notify: (m: string) => void }) {
  const [type, setType] = useState('medication')
  const [instruction, setInstruction] = useState('')
  const [dose, setDose] = useState('')
  const [route, setRoute] = useState('')
  const [frequency, setFrequency] = useState('od')
  const [days, setDays] = useState('1')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const orderId = useState(() => uuid())[0]

  const valid = instruction.trim().length > 1 && Number(days) >= 1 && Number(days) <= 30

  async function submit() {
    setBusy(true)
    setError(null)
    const { error } = await supabase.rpc('create_order', {
      p_encounter_id: encounterId,
      p_order_type: type,
      p_details: { instruction: instruction.trim(), dose: dose.trim(), route: route.trim() },
      p_frequency: frequency,
      p_duration_days: Number(days),
      p_id: orderId,
    })
    setBusy(false)
    if (error) return setError(errMsg(error))
    notify('Order saved.')
    go({ name: 'ward_patient', encounterId })
  }

  return (
    <div className="space-y-3">
      <BackBar title="New order" onBack={() => go({ name: 'ward_patient', encounterId })} />

      <Card className="space-y-3">
        <h2 className="font-semibold">Type</h2>
        <Choice value={type} onChange={setType} options={TYPES.map((t) => ({ value: t, label: ORDER_TYPE_LABELS[t] }))} />
        <TextArea label="Instruction" value={instruction} onChange={setInstruction} rows={2} required />
        {type === 'medication' && (
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="text-slate-600">Dose</span>
              <input value={dose} onChange={(e) => setDose(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-base" />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">Route</span>
              <input value={route} onChange={(e) => setRoute(e.target.value)} placeholder="PO / IM / IV" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-base" />
            </label>
          </div>
        )}
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold">Frequency</h2>
        <Choice value={frequency} onChange={setFrequency} options={FREQS.map((f) => ({ value: f, label: FREQUENCY_LABELS[f] }))} />
        {frequency !== 'stat' && frequency !== 'once' && frequency !== 'continuous' && (
          <NumField label="For how many days" value={days} onChange={setDays} min={1} max={30} />
        )}
        {frequency === 'continuous' && (
          <p className="text-xs text-slate-500">No timed reminders are created; nursing checks this during routine rounds.</p>
        )}
      </Card>

      <ErrorBox message={error} />
      <button
        onClick={submit} disabled={!valid || busy}
        className="w-full rounded-xl bg-teal-700 text-white font-semibold py-4 disabled:opacity-50"
      >
        {busy ? 'Saving…' : 'Save order'}
      </button>
    </div>
  )
}
