export type AccessRole = 'admin' | 'teacher' | 'viewer'

export interface AccessProfile {
  id: string
  display_name: string
  role: AccessRole
  school_id: string
  school_name: string
  school_code: string
  expires_at: string
}

export interface SchoolClass {
  id: string
  academic_year: number
  form: string
  class_name: string
}

export interface ClassificationOption {
  option_type: string
  value: string
  label: string
  description?: string | null
  sort_order: number
}

export interface BootstrapData {
  access: AccessProfile
  current_academic_year: number
  academic_years: number[]
  classes: SchoolClass[]
  classifications: ClassificationOption[]
}

export interface StudentOption {
  student_profile_id: string
  student_enrollment_id: string
  full_name: string
  academic_year: number
  class_id: string
  form: string
  class_name: string
  art_field: string | null
}

export interface ParticipantDraft extends StudentOption {
  participation_type: string
  contribution_type: string
  achievement_result: string
  achievement_note: string
  remarks: string
}

export interface ActivityDraft {
  id?: string
  activity_name: string
  activity_date: string
  academic_year: number
  organiser: string
  category: string
  component: string
  level: string
  teacher_in_charge: string
  evidence_url: string
  remarks: string
}

export interface ActivitySummary {
  id: string
  activity_name: string
  activity_date: string
  academic_year: number
  organiser: string | null
  category: string
  component: string
  level: string
  teacher_in_charge: string
  status: 'submitted' | 'cancelled'
  participant_count: number
  created_at: string
  updated_at: string
}

export interface TeacherAccessRow {
  id: string
  display_name: string
  role: AccessRole
  is_active: boolean
  expires_at: string | null
  last_used_at: string | null
  created_at: string
}

export interface ArtFieldImportRow {
  document_class: string
  document_row: number
  student_name: string
  normalized_ic: string
  art_field: string
}

export interface ArtFieldImportResultRow {
  document_row: string | null
  student_name: string
  document_class: string
  art_field: string
  current_art_field: string | null
  edutrack_name: string | null
  edutrack_class: string | null
  status: string
}

export interface ArtFieldImportResult {
  applied: boolean
  source_count: number
  matched_count: number
  updated_count: number
  exception_count: number
  rows: ArtFieldImportResultRow[]
}
