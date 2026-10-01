import { useCallback, useEffect, useState } from 'react'
import { supabase, FACILITY_TZ } from '../lib/supabase'
import { errMsg } from '../lib/format'
import type { CirculationRow, View } from '../types'
import { BackBar, Card, Choice, ErrorBox, NumField, YesNo } from './ui'

const time = (iso: string) => new Date(iso).toLocaleString('en-GB', { timeZone: FACILITY_TZ, dateStyle: 'short', timeStyle: 'short' })
const LIMBS = ['Left leg', 'Right leg', 'Left arm', 'Right arm']

export default function CirculationChart({ encounterId, go }: { encounterId: string; go: (v: View) => void }) {
  const [rows, setRows] = useState<CirculationRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [limb, setLimb] = useState('')
  const [movement, setMovement] = useState('normal')
  const [sensation, setSensation] = useState('normal')
  const [cap, setCap] = useState('')
  const [temperature, setTemperature] = useState('warm')
  const [color, setColor] = useState('normal')
  const [bleeding, setBleeding] = useState(false)
  const [oozing, setOozing] = useState(false)

  const load = useCallback(async () => {
    const r = await supabase.from('circulation_checks').select('*').eq('encounter_id', encounterId).order('recorded_at', { ascending: false }).limit(30)
    if (r.error) return setError(errMsg(r.error))
    setRows((r.data ?? []) as CirculationRow[])
  }, [encounterId])
  useEffect(() => { load() }, [load])

  async function save() {
    setBusy(true)
    setError(null)
    const { error } = await supabase.rpc('record_circulation_check', {
      p_encounter_id: encounterId, p_limb: limb, p_movement: movement, p_sensation: sensation,
      p_capillary_refill_sec: cap ? Number(cap) : null, p_temperature: temperature, p_color: color,
      p_bleeding: bleeding, p_oozing: oozing, p_note: null,
    })
    setBusy(false)
    if (error) return setError(errMsg(error))
    setCap(''); setBleeding(false); setOozing(false)
    load()
  }

  return (
    <div className="space-y-3">
      <BackBar title="Circulation" onBack={() => go({ name: 'ward_charts', encounterId })} />
      <Card className="space-y-3">
        <h2 className="font-semibold">Limb</h2>
        <Choice value={limb} onChange={setLimb} options={LIMBS.map((l) => ({ value: l, label: l }))} />
        <h2 className="font-semibold pt-1">Movement</h2>
        <Choice value={movement} onChange={setMovement} options={['normal', 'reduced', 'absent'].map((v) => ({ value: v, label: v }))} />
        <h2 className="font-semibold pt-1">Sensation</h2>
        <Choice value={sensation} onChange={setSensation} options={['normal', 'reduced', 'absent'].map((v) => ({ value: v, label: v }))} />
        <NumField label="Capillary refill" unit="seconds" value={cap} onChange={setCap} />
        <h2 className="font-semibold pt-1">Temperature</h2>
        <Choice value={temperature} onChange={setTemperature} options={['warm', 'cool', 'cold'].map((v) => ({ value: v, label: v }))} />
        <h2 className="font-semibold pt-1">Colour</h2>
        <Choice value={color} onChange={setColor} options={['normal', 'pale', 'cyanotic', 'dusky'].map((v) => ({ value: v, label: v }))} />
        <YesNo label="Bleeding" value={bleeding} onChange={setBleeding} />
        <YesNo label="Oozing" value={oozing} onChange={setOozing} />
        <ErrorBox message={error} />
        <button onClick={save} disabled={busy || limb === ''} className="w-full rounded-xl bg-teal-700 text-white font-semibold py-3 disabled:opacity-50">
          {busy ? 'Saving…' : 'Add entry'}
        </button>
      </Card>

      <Card className="space-y-2">
        <h2 className="font-semibold">Last {rows.length} checks</h2>
        {rows.length === 0 && <p className="text-sm text-slate-500">Nothing recorded yet.</p>}
        {rows.map((r) => (
          <div key={r.id} className={`text-sm rounded-lg border p-2 ${r.bleeding ? 'border-red-400 bg-red-50' : 'border-slate-200'}`}>
            <div className="flex justify-between"><span className="font-medium">{r.limb}</span><span className="text-slate-500 text-xs">{time(r.recorded_at)}</span></div>
            <p className="text-xs text-slate-600">
              Movement {r.movement} · Sensation {r.sensation} · CRT {r.capillary_refill_sec ?? '-'}s · {r.temperature ?? '-'} · {r.color ?? '-'}
              {r.bleeding && <span className="text-red-700 font-semibold"> · Bleeding</span>}
              {r.oozing && <span className="text-amber-700 font-semibold"> · Oozing</span>}
            </p>
          </div>
        ))}
      </Card>
    </div>
  )
}
