import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { FacilityRow } from '../types'

// Lets a cross-facility role (head nurse, chief surgeon, coordinator) look at another facility's
// wards/OT/mass-casualty board for situational awareness. It only changes what they can SEE here -
// writing to another facility's records is still correctly blocked by the database either way, since
// every write there checks the signed-in staff member's own facility, not whichever one is on screen.
export default function FacilitySwitcher({
  homeFacilityId, value, onChange,
}: { homeFacilityId: string; value: string; onChange: (facilityId: string) => void }) {
  const [facilities, setFacilities] = useState<FacilityRow[]>([])

  useEffect(() => {
    supabase.from('facilities').select('id, code, name, type').order('code')
      .then(({ data }) => setFacilities((data ?? []) as FacilityRow[]))
  }, [])

  if (facilities.length <= 1) return null

  return (
    <div className="space-y-1">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white font-medium"
      >
        {facilities.map((f) => (
          <option key={f.id} value={f.id}>
            {f.code} - {f.name}{f.id === homeFacilityId ? ' (your facility)' : ''}
          </option>
        ))}
      </select>
      {value !== homeFacilityId && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-300 rounded-lg px-2 py-1">
          Viewing another facility: overview only. Open a patient or make changes from your own facility.
        </p>
      )}
    </div>
  )
}
