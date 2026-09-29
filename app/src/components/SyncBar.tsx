import { useEffect, useRef, useState } from 'react'
import { useOffline } from '../lib/offline/context'
import { errMsg } from '../lib/format'

// Shows connection state and pushes the queue whenever we are online. Sits at the top of every screen.
export default function SyncBar({ userId }: { userId: string }) {
  const { engine, online } = useOffline()
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const running = useRef(false)

  const pending = engine.itemsFor(userId)
  const waiting = pending.filter((i) => i.status === 'pending').length
  const blocked = pending.filter((i) => i.status === 'blocked').length
  const failed = pending.filter((i) => i.status === 'failed').length

  useEffect(() => {
    if (!online || running.current || waiting === 0) return
    running.current = true
    setBusy(true)
    engine
      .sync(userId)
      .then((r) => {
        if (r.sent > 0) {
          setNote(`Sent ${r.sent} saved item${r.sent > 1 ? 's' : ''}.`)
          setTimeout(() => setNote(null), 4000)
        }
      })
      .catch((e) => setNote(errMsg(e)))
      .finally(() => {
        setBusy(false)
        running.current = false
      })
  }, [online, waiting, engine, userId])

  if (online && waiting === 0 && blocked === 0 && failed === 0 && !note) return null

  return (
    <div
      className={`rounded-xl border p-3 text-sm flex items-center justify-between gap-2 ${
        !online ? 'bg-slate-800 text-white border-slate-800' : blocked || failed ? 'bg-amber-50 border-amber-400' : 'bg-sky-50 border-sky-300'
      }`}
    >
      <span>
        {!online && `Offline. ${pending.length} item${pending.length === 1 ? '' : 's'} saved on this phone.`}
        {online && busy && 'Sending saved work…'}
        {online && !busy && note}
        {online && !busy && !note && blocked > 0 && `${blocked} item(s) waiting: you are off duty.`}
        {online && !busy && !note && failed > 0 && !blocked && `${failed} item(s) need attention.`}
        {online && !busy && !note && !blocked && !failed && waiting > 0 && 'Back online. Sending…'}
      </span>
      {(blocked > 0 || failed > 0) && <OutboxLink />}
    </div>
  )
}

function OutboxLink() {
  return (
    <a href="#outbox" className="underline font-medium whitespace-nowrap">
      View
    </a>
  )
}
