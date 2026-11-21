import { PGlite } from '@electric-sql/pglite'
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const school = '00000000-0000-0000-0000-000000000001'
const teacher = '00000000-0000-0000-0000-000000000002'
const student = '00000000-0000-0000-0000-000000000003'
const enrol = '00000000-0000-0000-0000-000000000004'
const klass = '00000000-0000-0000-0000-000000000005'
const legacyId = '00000000-0000-0000-0000-000000000006'
const secondStudent = '00000000-0000-0000-0000-000000000007'
const secondEnrol = '00000000-0000-0000-0000-000000000008'
const db = new PGlite()
const migration = readFileSync(resolve(process.cwd(), '../supabase/migrations/20261121000100_pajsk_entry_guideline.sql'), 'utf8')
const activity = (overrides = {}) => ({ activity_name: 'Karnival sekolah', activity_date: '2026-01-01', academic_year: 2026, category: 'KOKURIKULUM', component: 'KELAB_PERSATUAN', level: 'SEKOLAH', activity_kind: 'UTAMA', evidence_note: 'Sijil sekolah', ...overrides })
const person = (overrides = {}) => ({ student_profile_id: student, student_enrollment_id: enrol, participation_type: 'PENGLIBATAN_I', achievement_result: 'TIADA', contribution_type: 'ATLET_PESERTA', ...overrides })
const save = (a: object, p: object[]) => db.query<{ id: string }>('select public.pajsk_save_activity($1::uuid, $2::uuid, $3::jsonb, $4::jsonb) as id', [school, teacher, JSON.stringify(a), JSON.stringify(p)])

describe('PAJSK migration and RPC in PostgreSQL', () => {
  beforeAll(async () => {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create table public.pajsk_teacher_access (id uuid primary key, school_id uuid, role text, display_name text, is_active boolean, expires_at timestamptz);
      create table public.pajsk_classification_options (id uuid primary key default gen_random_uuid(), school_id uuid, option_type text, value text, label text, description text, sort_order integer, score numeric, is_active boolean default true);
      create unique index options_unique on public.pajsk_classification_options (coalesce(school_id, '00000000-0000-0000-0000-000000000000'::uuid), option_type, value);
      create table public.pajsk_activities (id uuid primary key default gen_random_uuid(), school_id uuid, academic_year integer, activity_name text, activity_date date, organiser text, competition_category text, category text, component text, level text, teacher_in_charge text, evidence_url text, remarks text, status text default 'submitted', created_by_access_id uuid, updated_by_access_id uuid);
      create table public.pajsk_activity_participants (id uuid primary key default gen_random_uuid(), activity_id uuid, school_id uuid, student_profile_id uuid, student_enrollment_id uuid, student_name_snapshot text, form_snapshot text, class_name_snapshot text, art_field_snapshot text, participation_type text, participation_score numeric, contribution_type text, achievement_result text, achievement_score numeric, remarks text, is_active boolean default true, created_by_access_id uuid, updated_by_access_id uuid, unique(activity_id, student_profile_id));
      create table public.pajsk_audit_logs (school_id uuid, actor_access_id uuid, action text, entity_type text, entity_id text, before_data jsonb, after_data jsonb);
      create table public.student_profiles (id uuid primary key, school_id uuid, full_name text, art_field text);
      create table public.classes (id uuid primary key, school_id uuid, academic_year integer, tingkatan text, class_name text, is_active boolean);
      create table public.student_enrollments (id uuid primary key, school_id uuid, student_profile_id uuid, academic_year integer, class_id uuid, is_active boolean);
      insert into public.pajsk_teacher_access values ('${teacher}', '${school}', 'teacher', 'Guru', true, null);
      insert into public.student_profiles values ('${student}', '${school}', 'Murid A', null), ('${secondStudent}', '${school}', 'Murid B', null);
      insert into public.classes values ('${klass}', '${school}', 2026, '1', 'A', true);
      insert into public.student_enrollments values ('${enrol}', '${school}', '${student}', 2026, '${klass}', true), ('${secondEnrol}', '${school}', '${secondStudent}', 2026, '${klass}', true);
      insert into public.pajsk_classification_options (option_type, value, label) values
        ('activity_category','KOKURIKULUM','Kokurikulum'), ('component','KELAB_PERSATUAN','Kelab'),
        ('level','SEKOLAH','Sekolah'), ('level','NEGERI','Negeri'), ('level','DAERAH_ZON','Daerah'), ('level','KEBANGSAAN','Kebangsaan'), ('level','ANTARABANGSA','Antarabangsa'),
        ('participation_type','PENGLIBATAN_I','I'), ('participation_type','PENGLIBATAN_II','II'), ('participation_type','PENGLIBATAN_III','III'),
        ('achievement_result','TIADA','Tiada'), ('achievement_result','JOHAN','Johan'),
        ('contribution_type','ATLET_PESERTA','Atlet'), ('contribution_type','KEMAHIRAN_KHUSUS','Kemahiran'), ('contribution_type','SOKONGAN','Sokongan'), ('contribution_type','PERSEMBAHAN','Persembahan');
      insert into public.pajsk_activities (id, school_id, academic_year, activity_name, activity_date, category, component, level, teacher_in_charge) values ('${legacyId}', '${school}', 2026, 'Rekod lama', '2026-02-02', 'KOKURIKULUM', 'KELAB_PERSATUAN', 'SEKOLAH', 'Guru');
      insert into public.pajsk_activity_participants (activity_id, school_id, student_profile_id, student_enrollment_id, student_name_snapshot, participation_type, participation_score, contribution_type, achievement_result, achievement_score, is_active) values ('${legacyId}', '${school}', '${student}', '${enrol}', 'Murid A', 'PENGLIBATAN_II', 0, 'PERSEMBAHAN', 'TIADA', 0, true);
    `)
    await db.exec(migration)
    await db.exec(`create view public.pajsk_student_activity_history as
      select a.school_id, a.academic_year, a.id as activity_id, a.activity_date, a.category, a.component, a.level,
      p.student_profile_id, p.student_name_snapshot, p.form_snapshot, p.class_name_snapshot, p.art_field_snapshot,
      p.participation_type, p.participation_score, p.contribution_type, p.achievement_result, p.achievement_score
      from public.pajsk_activities a join public.pajsk_activity_participants p on p.activity_id = a.id and p.school_id = a.school_id
      where a.status = 'submitted' and p.is_active;`)
    await db.exec(readFileSync(resolve(process.cwd(), '../supabase/migrations/20261121000200_pajsk_analysis_bahagian.sql'), 'utf8'))
  }, 30000)
  afterAll(async () => db.close())

  it('does not rewrite existing records when migration runs', async () => {
    const r = await db.query<{ contribution_type: string; contribution_score: number | null; activity_kind: string | null }>(`select p.contribution_type, p.contribution_score, a.activity_kind from pajsk_activity_participants p join pajsk_activities a on p.activity_id=a.id where a.id='${legacyId}'`)
    expect(r.rows[0]).toEqual({ contribution_type: 'PERSEMBAHAN', contribution_score: null, activity_kind: null })
  })
  it('preserves an unchanged historical value when editing', async () => {
    await save(activity({ id: legacyId, activity_name: 'Rekod lama', activity_date: '2026-02-02', activity_kind: '', evidence_note: '' }), [person({ participation_type: 'PENGLIBATAN_II', contribution_type: 'PERSEMBAHAN', achievement_result: 'JOHAN' })])
    const r = await db.query<{ contribution_type: string; contribution_score: number | null; achievement_score: string }>(`select contribution_type, contribution_score, achievement_score from pajsk_activity_participants where activity_id='${legacyId}'`)
    expect(r.rows[0].contribution_type).toBe('PERSEMBAHAN')
    expect(r.rows[0].contribution_score).toBeNull()
    expect(Number(r.rows[0].achievement_score)).toBe(8)
  })
  it('saves two pupils and independently calculates the chosen contribution', async () => {
    const created = await save(activity(), [person(), person({ student_profile_id: secondStudent, student_enrollment_id: secondEnrol, participation_type: 'PENGLIBATAN_III', contribution_type: 'JAWATANKUASA', achievement_result: 'JOHAN' })])
    const r = await db.query<{ contribution_type: string; contribution_score: string; participation_type: string; achievement_score: string }>('select contribution_type, contribution_score, participation_type, achievement_score from pajsk_activity_participants where activity_id=$1 order by student_profile_id', [created.rows[0].id])
    expect(r.rows.map(row => Number(row.contribution_score))).toEqual([10, 8])
    expect(r.rows[1].participation_type).toBe('PENGLIBATAN_III')
    expect(Number(r.rows[1].achievement_score)).toBe(8)
  })
  it('saves all four official contribution scores', async () => {
    const roles = [['ATLET_PESERTA', 10], ['KEMAHIRAN_KHUSUS', 10], ['JAWATANKUASA', 8], ['SOKONGAN', 5]] as const
    for (const [role, expected] of roles) {
      const created = await save(activity({ activity_name: `Role ${role}` }), [person({ contribution_type: role })])
      const result = await db.query<{ contribution_score: string }>('select contribution_score from pajsk_activity_participants where activity_id = $1', [created.rows[0].id])
      expect(Number(result.rows[0].contribution_score)).toBe(expected)
    }
  })
  it('edits participation without altering achievement', async () => {
    const info = activity({ activity_name: 'Edit independence', level: 'NEGERI' })
    const first = person({ contribution_type: null, participation_type: 'PENGLIBATAN_I', achievement_result: 'JOHAN' })
    const created = await save(info, [first])
    await save({ ...info, id: created.rows[0].id }, [{ ...first, participation_type: 'PENGLIBATAN_III' }])
    const result = await db.query<{ participation_score: string; achievement_score: string; achievement_result: string }>('select participation_score, achievement_score, achievement_result from pajsk_activity_participants where activity_id = $1', [created.rows[0].id])
    expect(Number(result.rows[0].participation_score)).toBe(6)
    expect(Number(result.rows[0].achievement_score)).toBe(14)
    expect(result.rows[0].achievement_result).toBe('JOHAN')
  })
  it('rejects ineligible or unsupported contributions without saving activity', async () => {
    for (const [index, change] of [{ level: 'NEGERI' }, { activity_kind: 'TAMBAHAN' }, { evidence_note: '' }].entries()) {
      await expect(save(activity({ activity_name: `invalid ${index}`, ...change }), [person()])).rejects.toThrow()
    }
    await expect(save(activity({ activity_name: 'invalid legacy option' }), [person({ contribution_type: 'PERSEMBAHAN' })])).rejects.toThrow()
    const r = await db.query<{ count: number }>("select count(*)::int as count from pajsk_activities where activity_name like 'invalid%'")
    expect(r.rows[0].count).toBe(0)
  })
  it('pages student search without dropping or repeating pupils', async () => {
    const first = await db.query<{ student_profile_id: string }>('select * from public.pajsk_search_students_paged($1, 2026, null, null, null, null, 1, 0)', [school])
    const second = await db.query<{ student_profile_id: string }>('select * from public.pajsk_search_students_paged($1, 2026, null, null, null, null, 1, 1)', [school])
    expect(first.rows[0].student_profile_id).toBe(student)
    expect(second.rows[0].student_profile_id).toBe(secondStudent)
  })

  it('exposes newly saved Bahagian activity to the EduTrack analysis RPC', async () => {
    const created = await save(activity({ activity_name: 'Bahagian analysis', level: 'BAHAGIAN' }), [person({ contribution_type: null, participation_type: 'PENGLIBATAN_II', achievement_result: 'JOHAN' })])
    const history = await db.query<{ participation_score: string; achievement_score: string }>('select participation_score, achievement_score from public.pajsk_student_activity_history where activity_id=$1', [created.rows[0].id])
    expect(Number(history.rows[0].participation_score)).toBe(9)
    expect(Number(history.rows[0].achievement_score)).toBe(14)
    const summary = await db.query<{ state_or_higher_count: number }>('select state_or_higher_count from public.pajsk_analysis_student_rows($1, $2, null, null, null, null, $3)', [school, 2026, 'BAHAGIAN'])
    expect(Number(summary.rows[0].state_or_higher_count)).toBe(1)
  })

  it('calculates all five achievement places at every level', async () => {
    const levels = ['ANTARABANGSA', 'KEBANGSAAN', 'NEGERI', 'BAHAGIAN', 'DAERAH_ZON', 'SEKOLAH']
    const places = ['JOHAN', 'NAIB_JOHAN', 'KETIGA', 'KEEMPAT', 'KELIMA']
    const scores = [[20,19,18,17,16],[17,16,15,14,13],[14,13,12,11,10],[14,13,12,11,10],[11,10,9,8,7],[8,7,6,5,4]]
    for (const [i, level] of levels.entries()) for (const [j, place] of places.entries()) {
      const result = await db.query<{ score: string }>('select public.pajsk_achievement_score($1, $2) as score', [level, place])
      expect(Number(result.rows[0].score)).toBe(scores[i][j])
    }
    const medal = await db.query<{ score: number | null }>("select public.pajsk_achievement_score('NEGERI', 'EMAS') as score")
    expect(medal.rows[0].score).toBeNull()
  })

  it('matches every frontend participation mark including Bahagian', async () => {
    const levels = ['ANTARABANGSA','KEBANGSAAN','NEGERI','BAHAGIAN','DAERAH_ZON']
    const kinds = ['PENGLIBATAN_I','PENGLIBATAN_II','PENGLIBATAN_III']
    const expected = [[20,15,10],[17,12,8],[14,10,6],[12,9,5],[11,8,4]]
    for (const [i, level] of levels.entries()) for (const [j, type] of kinds.entries()) {
      const r = await db.query<{ score: string }>('select public.pajsk_participation_score($1, $2) as score', [level, type])
      expect(Number(r.rows[0].score)).toBe(expected[i][j])
    }
  })
})
