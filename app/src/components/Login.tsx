import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) setError(error.message)
    setBusy(false)
  }

  return (
    <div className="pt-10">
      <h1 className="text-2xl font-bold text-teal-800">Hospital Care</h1>
      <p className="text-sm text-slate-500 mb-6">Demo system. Fake data only.</p>
      <form onSubmit={onSubmit} className="bg-white rounded-2xl shadow p-5 space-y-4">
        <label className="block text-sm font-medium">
          Email
          <input
            type="email"
            required
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-base"
          />
        </label>
        <label className="block text-sm font-medium">
          Password
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-base"
          />
        </label>
        {error && <p className="text-sm text-red-700 bg-red-50 rounded-lg p-3">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-xl bg-teal-700 text-white font-semibold py-3 text-base disabled:opacity-60"
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
