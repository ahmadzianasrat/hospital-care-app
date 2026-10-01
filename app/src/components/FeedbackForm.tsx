import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { errMsg } from '../lib/format'
import { BackBar, Card, ErrorBox, TextArea } from './ui'

export default function FeedbackForm({ onBack }: { onBack: () => void }) {
  const [message, setMessage] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit() {
    setBusy(true)
    setError(null)
    const { error } = await supabase.rpc('submit_feedback', { p_message: message.trim(), p_screen: null })
    setBusy(false)
    if (error) return setError(errMsg(error))
    setSent(true)
  }

  if (sent) {
    return (
      <div className="space-y-3">
        <BackBar title="Feedback" onBack={onBack} />
        <Card><p className="text-sm text-emerald-800">Thank you. Your admin and head nurse can see this.</p></Card>
        <button onClick={onBack} className="w-full rounded-xl bg-white border border-slate-300 py-3">Back</button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <BackBar title="Report a problem" onBack={onBack} />
      <Card className="space-y-3">
        <p className="text-sm text-slate-600">
          Found something confusing, slow, or broken? Say what happened and which screen. This works even if
          you're off duty.
        </p>
        <TextArea label="What happened" value={message} onChange={setMessage} rows={5} required />
        <ErrorBox message={error} />
        <button onClick={submit} disabled={message.trim().length < 3 || busy} className="w-full rounded-xl bg-teal-700 text-white font-semibold py-3 disabled:opacity-50">
          {busy ? 'Sending…' : 'Send'}
        </button>
      </Card>
    </div>
  )
}
