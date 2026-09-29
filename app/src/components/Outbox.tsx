import { FACILITY_TZ } from '../lib/supabase'
import { useOffline } from '../lib/offline/context'
import { errMsg } from '../lib/format'
import { BackBar, Card, ErrorBox } from './ui'
import type { View } from '../types'

const LABEL: Record<string, string> = { pending: 'Waiting to send', blocked: 'Off duty', failed: 'Rejected' }

export default function Outbox({ userId, go }: { userId: string; go: (v: View) => void }) {
  const { engine, online } = useOffline()
  const items = engine.itemsFor(userId)

  return (
    <div className="space-y-3">
      <BackBar title="Saved on this phone" onBack={() => go({ name: 'home' })} />
      {!online && <ErrorBox message="You are offline. Items will send automatically once the connection is back." />}
      {items.length === 0 && <Card><p className="text-sm text-slate-600">Nothing saved. Everything has been sent.</p></Card>}
      {items.map((it) => (
        <Card key={it.id} className="space-y-1">
          <div className="flex justify-between items-center">
            <p className="font-medium">{it.label}</p>
            <span className={`text-xs font-semibold rounded-full px-2 py-1 ${it.status === 'failed' ? 'bg-red-100 text-red-800' : it.status === 'blocked' ? 'bg-amber-100 text-amber-800' : 'bg-sky-100 text-sky-800'}`}>
              {LABEL[it.status]}
            </span>
          </div>
          <p className="text-xs text-slate-500">
            {new Date(it.createdAt).toLocaleString('en-GB', { timeZone: FACILITY_TZ, dateStyle: 'medium', timeStyle: 'short' })}
          </p>
          {it.error && <p className="text-xs text-red-700">{errMsg({ message: it.error })}</p>}
          {it.status === 'failed' && (
            <div className="flex gap-2 pt-1">
              <button onClick={() => engine.retry(it.id)} className="flex-1 rounded-lg bg-teal-700 text-white text-sm py-2">Try again</button>
              <button onClick={() => engine.discard(it.id)} className="flex-1 rounded-lg bg-white border border-slate-300 text-sm py-2">Discard</button>
            </div>
          )}
        </Card>
      ))}
    </div>
  )
}
