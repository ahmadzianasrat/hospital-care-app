import { useCallback, useEffect, useState } from 'react'
import { supabase, FACILITY_TZ } from '../lib/supabase'
import { errMsg } from '../lib/format'
import { FLUID_LABELS, FLUID_DIRECTION, type FluidBalance as Balance, type FluidEventRow, type View } from '../types'
import { BackBar, Card, Choice, ErrorBox, NumField, TextArea } from './ui'

const time = (iso: string) => new Date(iso).toLocaleString('en-GB', { timeZone: FACILITY_TZ, dateStyle: 'short', timeStyle: 'short' })
const IN_CATS = ['iv_fluid', 'blood_product', 'oral_intake']
const OUT_CATS = ['urine', 'stool', 'vomitus', 'drain', 'insensible_loss', 'other_output']

export default function FluidBalanceScreen({ encounterId, go }: { encounterId: string; go: (v: View) => void }) {
  const [rows, setRows] = useState<FluidEventRow[]>([])
  const [balance, setBalance] = useState<Balance | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [category, setCategory] = useState('iv_fluid')
  const [volume, setVolume] = useState('')
  const [note, setNote] = useState('')

  const load = useCallback(async () => {
    const r = await supabase.from('fluid_events').select('*').eq('encounter_id', encounterId).order('recorded_at', { ascending: false }).limit(40)
    if (r.error) return setError(errMsg(r.error))
    setRows((r.data ?? []) as FluidEventRow[])
    const b = await supabase.rpc('fluid_balance', { p_encounter_id: encounterId })
    setBalance((b.data as Balance[] | null)?.[0] ?? null)
  }, [encounterId])
  useEffect(() => { load() }, [load])

  async function save() {
    setBusy(true)
    setError(null)
    const { error } = await supabase.rpc('record_fluid_event', {
      p_encounter_id: encounterId, p_category: category, p_volume_ml: Number(volume), p_note: note.trim() || null,
    })
    setBusy(false)
    if (error) return setError(errMsg(error))
    setVolume(''); setNote('')
    load()
  }

  const valid = volume.trim() !== '' && Number(volume) >= 0

  return (
    <div className="space-y-3">
      <BackBar title="Fluid balance" onBack={() => go({ name: 'ward_charts', encounterId })} />

      {balance && (
        <Card>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div><p className="text-xs text-slate-500">In (24h)</p><p className="font-semibold">{balance.last24_in_ml} ml</p></div>
            <div><p className="text-xs text-slate-500">Out (24h)</p><p className="font-semibold">{balance.last24_out_ml} ml</p></div>
            <div>
              <p className="text-xs text-slate-500">Balance (24h)</p>
              <p className={`font-semibold ${balance.last24_balance_ml < 0 ? 'text-red-700' : 'text-emerald-700'}`}>{balance.last24_balance_ml} ml</p>
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-2 text-center">Since admission: {balance.total_in_ml} in, {balance.total_out_ml} out, balance {balance.balance_ml} ml</p>
        </Card>
      )}

      <Card className="space-y-3">
        <h2 className="font-semibold">In</h2>
        <Choice value={category} onChange={setCategory} options={IN_CATS.map((c) => ({ value: c, label: FLUID_LABELS[c] }))} />
        <h2 className="font-semibold pt-1">Out</h2>
        <Choice value={category} onChange={setCategory} options={OUT_CATS.map((c) => ({ value: c, label: FLUID_LABELS[c] }))} />
        <NumField label="Volume" unit="ml" value={volume} onChange={setVolume} min={0} />
        <TextArea label="Note (optional)" value={note} onChange={setNote} rows={2} />
        <ErrorBox message={error} />
        <button onClick={save} disabled={!valid || busy} className="w-full rounded-xl bg-teal-700 text-white font-semibold py-3 disabled:opacity-50">
          {busy ? 'Saving…' : `Add as ${FLUID_DIRECTION[category] === 'in' ? 'intake' : 'output'}`}
        </button>
      </Card>

      <Card className="space-y-1">
        <h2 className="font-semibold mb-1">Last {rows.length} entries</h2>
        {rows.length === 0 && <p className="text-sm text-slate-500">Nothing recorded yet.</p>}
        {rows.map((r) => (
          <div key={r.id} className="flex justify-between text-sm border-t border-slate-100 py-1 first:border-0">
            <span>{FLUID_LABELS[r.category]}{r.note ? ` · ${r.note}` : ''}</span>
            <span className={r.direction === 'in' ? 'text-emerald-700' : 'text-amber-700'}>
              {r.direction === 'in' ? '+' : '-'}{r.volume_ml} ml <span className="text-slate-400">{time(r.recorded_at)}</span>
            </span>
          </div>
        ))}
      </Card>
    </div>
  )
}
