import { useEffect, useState } from 'react'
import { useOffline } from '../lib/offline/context'
import { Card, ErrorBox } from './ui'

// Lets a facility "top up" its block of patient numbers while it has signal, so registration
// still works with no internet. Numbers are never reused: the server hands out the next free block.
export default function OfflineReady({ facilityId }: { facilityId: string }) {
  const { engine, online, version } = useOffline()
  const [left, setLeft] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    engine.numbersLeft(facilityId).then(setLeft)
  }, [engine, facilityId, version])

  async function topUp() {
    setBusy(true)
    setMsg(null)
    const r = await engine.topUp(facilityId, 30, 0) // 0 = top up even if some remain, since the button was pressed on purpose
    setBusy(false)
    if (r === 'ok') {
      setMsg('Reserved 30 more patient numbers for offline use.')
      engine.numbersLeft(facilityId).then(setLeft)
    } else if (r === 'offline') setMsg('No connection right now. Try again when you have signal.')
    else setMsg('Could not reserve numbers. Try again later.')
  }

  return (
    <Card className="space-y-2">
      <h2 className="font-semibold">Offline readiness</h2>
      <p className="text-sm text-slate-600">
        {left === null ? 'Checking…' : `${left} patient number${left === 1 ? '' : 's'} reserved for use without internet.`}
      </p>
      {left !== null && left < 10 && <ErrorBox message="Running low. Reserve more while you have signal." />}
      <button
        onClick={topUp}
        disabled={busy || !online}
        className="w-full rounded-xl bg-white border border-teal-700 text-teal-800 font-semibold py-3 disabled:opacity-50"
      >
        {busy ? 'Reserving…' : online ? 'Reserve 30 more numbers' : 'Connect to the internet to reserve numbers'}
      </button>
      {msg && <p className="text-sm text-emerald-800">{msg}</p>}
    </Card>
  )
}
