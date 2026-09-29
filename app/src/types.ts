export type AccessStatus = {
  staff_id: string
  full_name: string
  app_role: string
  facility_id: string
  facility_code: string
  on_duty: boolean
  break_glass_until: string | null
}

export type RosterRow = {
  id: string
  work_date: string
  shift_types: { name: string; start_time: string | null; end_time: string | null } | null
  wards: { name: string } | null
}

export const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  chief_surgeon: 'Chief surgeon',
  head_nurse: 'Head nurse',
  team_leader: 'Team leader',
  doctor: 'Doctor',
  nurse: 'Nurse',
  physio: 'Physiotherapist',
  midwife: 'Midwife',
  lab: 'Laboratory',
  radiology: 'Radiology',
  trainer: 'Trainer',
  trainee: 'Trainee nurse',
  cleaner: 'Cleaning team',
  coordinator: 'Coordinator',
}

// Who can do what (the database enforces this too; this only decides which buttons to show).
export const TRIAGE_ROLES = ['nurse', 'team_leader', 'head_nurse', 'doctor', 'chief_surgeon']
export const OPD_ROLES = ['doctor', 'chief_surgeon']
export const PATIENT_VIEW_ROLES = [
  'chief_surgeon', 'head_nurse', 'doctor', 'nurse', 'team_leader', 'physio', 'midwife',
  'lab', 'radiology', 'coordinator', 'trainee',
]

export type PatientRow = {
  id: string
  display_id: string
  full_name: string
  father_name: string | null
  sex: 'male' | 'female'
  age_years: number | null
  phone: string | null
  district: string | null
  blood_group: string
  allergy_status: 'unknown' | 'none' | 'known'
  allergy_details: string | null
  facility_id: string
  created_at: string
}

export type EncounterRow = {
  id: string
  patient_id: string
  facility_id: string
  status: string
  arrived_at: string
  triage_priority: string | null
  triage_decision: string | null
  opd_doctor_id: string | null
  patients: PatientRow | null
  doctor: { full_name: string } | null
}

export type TriageData = {
  arrival?: {
    mode?: string
    from?: string
    incident?: string
    trauma_type?: string
    hours_since_injury?: number | null
  }
  vitals?: {
    bp_sys?: number | null
    bp_dia?: number | null
    hr?: number | null
    rr?: number | null
    spo2?: number | null
    temp_c?: number | null
    gcs_e?: number | null
    gcs_v?: number | null
    gcs_m?: number | null
    pupil_left?: string
    pupil_right?: string
  }
  primary_survey?: {
    massive_haemorrhage?: boolean
    airway_compromised?: boolean
    breathing_distress?: boolean
    c_spine_collar?: boolean
  }
  injury_description?: string
  notes?: string
}

export type PatientPrefill = {
  full_name?: string
  father_name?: string | null
  sex?: string
  age_years?: number | null
  phone?: string | null
  district?: string | null
  blood_group?: string
  allergy_status?: string
  allergy_details?: string | null
}

export type ReferralPayload = {
  patient?: PatientPrefill & { display_id?: string }
  triage?: { priority?: string | null; data?: TriageData | null }
  opd?: { diagnosis?: string; findings?: string; history?: string; plan?: string } | null
  treatments?: Treatment[]
  treatment_given?: string | null
  transport?: string | null
  from?: { facility_code?: string; facility_name?: string; sender?: string }
}

export type Treatment = {
  procedure?: string
  drug?: string
  dose?: string
  route?: string
  note?: string
  given_at?: string
  given_by?: string
}

export type ReferralRow = {
  id: string
  encounter_id: string
  from_facility_id: string
  to_facility_id: string | null
  to_external: string | null
  reason: string
  eta: string | null
  status: 'sent' | 'received' | 'arrived' | 'cancelled'
  payload: ReferralPayload
  created_at: string
  arrived_patient_id: string | null
  from: { code: string; name: string } | null
  to: { code: string; name: string } | null
  arrived: { display_id: string } | null
}

export type View =
  | { name: 'home' }
  | { name: 'patients' }
  | { name: 'register'; prefill?: PatientPrefill; referralId?: string }
  | { name: 'referrals' }
  | { name: 'referral_form'; encounterId: string }
  | { name: 'outbox' }
  | { name: 'patient'; id: string }
  | { name: 'triage' }
  | { name: 'triage_form'; encounterId: string }
  | { name: 'opd' }
  | { name: 'opd_visit'; encounterId: string }
