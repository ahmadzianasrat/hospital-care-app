import { useState } from 'react'
import { supabase } from '../lib/supabase'

// Proves the database rules work: shows how many patients THIS login is allowed to see.
export default function DataCheck() {
  const [result, setResult] = useState<string>('')

  async function run() {
    const { data, error } = await supabase.from('patients').select('display_id, full_name').order('display_id')
    if (error) setResult(`Error: ${error.message}`)
    else setResult(`${data.length} patient(s) visible: ${data.map((p) => p.display_id).join(', ') || 'none'}`)
  }

  return (
    <section className="bg-white rounded-2xl shadow p-4 space-y-2">
      <h2 className="font-semibold">Data access check</h2>
      <p className="text-sm text-slate-500">Counts the patients your login is allowed to see (fake data).</p>
      <button onClick={run} className="rounded-lg bg-slate-800 text-white text-sm px-4 py-2">
        Check now
      </button>
      {result && <p className="text-sm font-mono break-words">{result}</p>}
    </section>
  )
}
