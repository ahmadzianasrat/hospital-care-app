import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { supabase } from '../lib/supabase'
import { errMsg, ageSex } from '../lib/format'
import type { PatientRow, View } from '../types'
import { ErrorBox } from './ui'

export default function Wristband({ patientId, go }: { patientId: string; go: (v: View) => void }) {
  const [patient, setPatient] = useState<PatientRow | null>(null)
  const [qr, setQr] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      const { data, error } = await supabase.from('patients').select('*').eq('id', patientId).maybeSingle()
      if (error) return setError(errMsg(error))
      if (!data) return setError('Patient not found.')
      setPatient(data as PatientRow)
      // The QR code carries only the patient ID string (e.g. "31397HL") - nothing else is encoded,
      // so a lost or photographed wristband reveals no information beyond what's already printed on it.
      const url = await QRCode.toDataURL((data as PatientRow).display_id, { margin: 1, width: 240 })
      setQr(url)
    })()
  }, [patientId])

  if (error) {
    return (
      <div className="space-y-3">
        <button onClick={() => go({ name: 'patients' })} className="no-print text-sm text-teal-700 underline">← Back</button>
        <ErrorBox message={error} />
      </div>
    )
  }
  if (!patient || !qr) return <p className="text-slate-500">Loading…</p>

  return (
    <div className="bg-white -mx-4 px-4">
      <style>{`@media print { .no-print { display: none !important; } body { background: white !important; } }`}</style>
      <div className="no-print flex gap-2 py-3">
        <button onClick={() => go({ name: 'patients' })} className="flex-1 rounded-xl bg-white border border-slate-300 py-3">← Back</button>
        <button onClick={() => window.print()} className="flex-1 rounded-xl bg-teal-700 text-white font-semibold py-3">Print</button>
      </div>

      <div className="border-2 border-dashed border-slate-400 rounded-lg p-4 flex items-center gap-4 max-w-sm mx-auto">
        <img src={qr} alt="QR code" className="w-24 h-24" />
        <div>
          <p className="font-mono font-bold text-xl">{patient.display_id}</p>
          <p className="font-semibold">{patient.full_name}</p>
          <p className="text-sm text-slate-600">{ageSex(patient.age_years, patient.sex)}</p>
          <p className="text-sm font-semibold">{patient.blood_group}</p>
          {patient.allergy_status === 'known' && <p className="text-xs font-bold text-red-700">Allergy: {patient.allergy_details}</p>}
        </div>
      </div>
      <p className="no-print text-xs text-slate-500 text-center mt-2">
        Cut along the dashed line and attach to a wristband. The QR code only contains the patient ID above.
      </p>
    </div>
  )
}
