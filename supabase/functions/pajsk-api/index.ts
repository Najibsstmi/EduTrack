import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.100.1'

type JsonRecord = Record<string, unknown>

const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || ''
// Supabase injects the service-role key into every deployed Edge Function.
// A dedicated pepper can still override it, while this derived fallback keeps
// access-code hashes secret without requiring another dashboard secret.
const codePepper =
  Deno.env.get('PAJSK_CODE_PEPPER') || `pajsk-entry-access-code:${serviceRoleKey}`
const encoder = new TextEncoder()

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const allowedOrigins = new Set(
  (Deno.env.get('PAJSK_ALLOWED_ORIGINS') ||
    'https://pajsk.cikgustem.com,https://pajsk-entry.vercel.app,http://localhost:5173,http://localhost:5174')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
)

class HttpError extends Error {
  status: number
  details: JsonRecord

  constructor(status: number, message: string, details: JsonRecord = {}) {
    super(message)
    this.status = status
    this.details = details
  }
}

const corsHeaders = (origin: string) => ({
  'Access-Control-Allow-Origin': allowedOrigins.has(origin) ? origin : 'https://pajsk.cikgustem.com',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-pajsk-session',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
  Vary: 'Origin',
})

const jsonResponse = (origin: string, body: JsonRecord, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  })

const cleanText = (value: unknown, maxLength = 500) =>
  String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maxLength)

const bytesToHex = (bytes: ArrayBuffer | Uint8Array) =>
  [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('')

const hexToBytes = (hex: string) => {
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2 !== 0) {
    throw new Error('Nilai hash tidak sah.')
  }
  return new Uint8Array(hex.match(/.{2}/g)!.map((pair) => Number.parseInt(pair, 16)))
}

const sha256 = async (value: string) =>
  bytesToHex(await crypto.subtle.digest('SHA-256', encoder.encode(value)))

const hmac = async (value: string) => {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(codePepper),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  return bytesToHex(await crypto.subtle.sign('HMAC', key, encoder.encode(value)))
}

const deriveCodeHash = async (normalizedCode: string, saltHex: string) => {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(`${normalizedCode}:${codePepper}`),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  return bytesToHex(
    await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        hash: 'SHA-256',
        salt: hexToBytes(saltHex),
        iterations: 210_000,
      },
      key,
      256,
    ),
  )
}

const safeEqual = (left: string, right: string) => {
  if (left.length !== right.length) return false
  let difference = 0
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index)
  }
  return difference === 0
}

const randomHex = (length: number) => {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return bytesToHex(bytes)
}

const randomToken = () => {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '')
}

const generateAccessCode = () => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = new Uint8Array(10)
  crypto.getRandomValues(bytes)
  const value = [...bytes].map((byte) => alphabet[byte % alphabet.length]).join('')
  return `PJK-${value.slice(0, 5)}-${value.slice(5)}`
}

const normalizeCode = (value: unknown) => cleanText(value, 80).toUpperCase().replace(/[^A-Z0-9]/g, '')

const getClientIp = (request: Request) =>
  cleanText(
    request.headers.get('cf-connecting-ip') ||
      request.headers.get('x-forwarded-for')?.split(',')[0] ||
      'unknown',
    120,
  )

const ensureConfiguration = () => {
  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    throw new HttpError(500, 'Konfigurasi Supabase untuk PAJSK Entry belum lengkap.')
  }
  if (codePepper.length < 32) {
    throw new HttpError(500, 'PAJSK_CODE_PEPPER belum ditetapkan dengan selamat.')
  }
}

const audit = async ({
  schoolId,
  actorAccessId,
  action,
  entityType,
  entityId,
  beforeData,
  afterData,
  ipHash,
  userAgent,
}: {
  schoolId?: string | null
  actorAccessId?: string | null
  action: string
  entityType: string
  entityId?: string | null
  beforeData?: unknown
  afterData?: unknown
  ipHash?: string | null
  userAgent?: string | null
}) => {
  const { error } = await admin.from('pajsk_audit_logs').insert({
    school_id: schoolId || null,
    actor_access_id: actorAccessId || null,
    action,
    entity_type: entityType,
    entity_id: entityId || null,
    before_data: beforeData ?? null,
    after_data: afterData ?? null,
    ip_hash: ipHash || null,
    user_agent: cleanText(userAgent, 300) || null,
  })
  if (error) console.error('PAJSK audit insert failed', error)
}

const createAccess = async ({
  schoolId,
  displayName,
  role,
  expiresAt,
  createdByProfileId,
  createdByAccessId,
}: {
  schoolId: string
  displayName: string
  role: 'admin' | 'teacher' | 'viewer'
  expiresAt?: string | null
  createdByProfileId?: string | null
  createdByAccessId?: string | null
}) => {
  const accessCode = generateAccessCode()
  const normalizedCode = normalizeCode(accessCode)
  const salt = randomHex(16)
  const [codeLookup, codeHash] = await Promise.all([
    hmac(`lookup:${normalizedCode}`),
    deriveCodeHash(normalizedCode, salt),
  ])

  const { data, error } = await admin
    .from('pajsk_teacher_access')
    .insert({
      school_id: schoolId,
      display_name: displayName,
      role,
      code_lookup: codeLookup,
      code_hash: codeHash,
      code_salt: salt,
      expires_at: expiresAt || null,
      created_by_profile_id: createdByProfileId || null,
      created_by_access_id: createdByAccessId || null,
    })
    .select('id, display_name, role, expires_at, created_at')
    .single()

  if (error) throw new HttpError(500, 'Kod akses tidak dapat dijana.')
  return { accessCode, access: data }
}

interface ValidSession {
  sessionId: string
  accessId: string
  schoolId: string
  displayName: string
  role: 'admin' | 'teacher' | 'viewer'
  expiresAt: string
}

const requireSession = async (request: Request): Promise<ValidSession> => {
  const token = cleanText(request.headers.get('x-pajsk-session'), 200)
  if (!token) throw new HttpError(401, 'Sesi diperlukan.')

  const tokenHash = await sha256(token)
  const { data: session, error: sessionError } = await admin
    .from('pajsk_teacher_sessions')
    .select('id, access_id, school_id, expires_at, revoked_at, last_seen_at')
    .eq('token_hash', tokenHash)
    .maybeSingle()

  if (
    sessionError ||
    !session ||
    session.revoked_at ||
    new Date(session.expires_at).getTime() <= Date.now()
  ) {
    throw new HttpError(401, 'Sesi telah tamat atau tidak sah.')
  }

  const { data: access, error: accessError } = await admin
    .from('pajsk_teacher_access')
    .select('id, display_name, role, school_id, is_active, expires_at')
    .eq('id', session.access_id)
    .maybeSingle()

  if (
    accessError ||
    !access ||
    !access.is_active ||
    access.school_id !== session.school_id ||
    (access.expires_at && new Date(access.expires_at).getTime() <= Date.now())
  ) {
    throw new HttpError(401, 'Kod akses telah tamat atau dibatalkan.')
  }

  if (Date.now() - new Date(session.last_seen_at).getTime() > 5 * 60 * 1000) {
    await admin
      .from('pajsk_teacher_sessions')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('id', session.id)
  }

  return {
    sessionId: session.id,
    accessId: access.id,
    schoolId: access.school_id,
    displayName: access.display_name,
    role: access.role,
    expiresAt: session.expires_at,
  }
}

const requireRole = (session: ValidSession, roles: ValidSession['role'][]) => {
  if (!roles.includes(session.role)) {
    throw new HttpError(403, 'Peranan anda tidak dibenarkan untuk tindakan ini.')
  }
}

const recordLoginAttempt = async ({
  schoolId,
  accessId,
  ipHash,
  codeFingerprint,
  wasSuccessful,
}: {
  schoolId?: string | null
  accessId?: string | null
  ipHash: string
  codeFingerprint: string
  wasSuccessful: boolean
}) => {
  await admin.from('pajsk_login_attempts').insert({
    school_id: schoolId || null,
    access_id: accessId || null,
    ip_hash: ipHash,
    code_fingerprint: codeFingerprint,
    was_successful: wasSuccessful,
  })
}

const loginWithCode = async (request: Request, body: JsonRecord) => {
  const normalizedCode = normalizeCode(body.code)
  if (normalizedCode.length < 8) throw new HttpError(400, 'Masukkan kod akses yang sah.')

  const ipAddress = getClientIp(request)
  const [ipHash, codeLookup, codeFingerprint] = await Promise.all([
    hmac(`ip:${ipAddress}`),
    hmac(`lookup:${normalizedCode}`),
    hmac(`attempt:${normalizedCode}`),
  ])
  const windowStart = new Date(Date.now() - 15 * 60 * 1000).toISOString()

  const [{ count: ipAttempts }, { count: codeAttempts }] = await Promise.all([
    admin
      .from('pajsk_login_attempts')
      .select('*', { count: 'exact', head: true })
      .eq('ip_hash', ipHash)
      .eq('was_successful', false)
      .gte('attempted_at', windowStart),
    admin
      .from('pajsk_login_attempts')
      .select('*', { count: 'exact', head: true })
      .eq('code_fingerprint', codeFingerprint)
      .eq('was_successful', false)
      .gte('attempted_at', windowStart),
  ])

  if ((ipAttempts || 0) >= 10 || (codeAttempts || 0) >= 5) {
    throw new HttpError(429, 'Terlalu banyak cubaan. Cuba semula selepas 15 minit.')
  }

  const { data: access } = await admin
    .from('pajsk_teacher_access')
    .select(
      'id, school_id, display_name, role, code_hash, code_salt, is_active, failed_attempts, locked_until, expires_at',
    )
    .eq('code_lookup', codeLookup)
    .maybeSingle()

  const genericFailure = async () => {
    await recordLoginAttempt({
      schoolId: access?.school_id,
      accessId: access?.id,
      ipHash,
      codeFingerprint,
      wasSuccessful: false,
    })
    throw new HttpError(401, 'Kod akses tidak sah atau telah tamat.')
  }

  if (
    !access ||
    !access.is_active ||
    (access.expires_at && new Date(access.expires_at).getTime() <= Date.now())
  ) {
    return genericFailure()
  }

  if (access.locked_until && new Date(access.locked_until).getTime() > Date.now()) {
    await recordLoginAttempt({
      schoolId: access.school_id,
      accessId: access.id,
      ipHash,
      codeFingerprint,
      wasSuccessful: false,
    })
    throw new HttpError(429, 'Kod ini dikunci sementara. Cuba semula kemudian.')
  }

  const candidateHash = await deriveCodeHash(normalizedCode, access.code_salt)
  if (!safeEqual(candidateHash, access.code_hash)) {
    const failedAttempts = Number(access.failed_attempts || 0) + 1
    await admin
      .from('pajsk_teacher_access')
      .update({
        failed_attempts: failedAttempts,
        locked_until:
          failedAttempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null,
      })
      .eq('id', access.id)
    return genericFailure()
  }

  const token = randomToken()
  const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString()
  const { error: sessionError } = await admin.from('pajsk_teacher_sessions').insert({
    access_id: access.id,
    school_id: access.school_id,
    token_hash: await sha256(token),
    expires_at: expiresAt,
  })
  if (sessionError) throw new HttpError(500, 'Sesi tidak dapat diwujudkan.')

  await Promise.all([
    admin
      .from('pajsk_teacher_access')
      .update({ failed_attempts: 0, locked_until: null, last_used_at: new Date().toISOString() })
      .eq('id', access.id),
    recordLoginAttempt({
      schoolId: access.school_id,
      accessId: access.id,
      ipHash,
      codeFingerprint,
      wasSuccessful: true,
    }),
    audit({
      schoolId: access.school_id,
      actorAccessId: access.id,
      action: 'login',
      entityType: 'teacher_session',
      ipHash,
      userAgent: request.headers.get('user-agent'),
    }),
  ])

  return {
    token,
    expires_at: expiresAt,
    access: { display_name: access.display_name, role: access.role },
  }
}

const bootstrapAdmin = async (request: Request, body: JsonRecord) => {
  const authHeader = request.headers.get('authorization') || ''
  const authToken = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : ''
  if (!authToken) throw new HttpError(401, 'Log masuk EduTrack diperlukan.')

  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: userData, error: userError } = await authClient.auth.getUser(authToken)
  if (userError || !userData.user) throw new HttpError(401, 'Sesi EduTrack tidak sah.')

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id, school_id, full_name, role, is_school_admin, is_active, approval_status')
    .eq('id', userData.user.id)
    .maybeSingle()

  const normalizedRole = String(profile?.role || '').toLowerCase()
  if (
    profileError ||
    !profile ||
    !profile.school_id ||
    profile.is_active !== true ||
    profile.approval_status !== 'approved' ||
    !(profile.is_school_admin === true || ['admin', 'school_admin'].includes(normalizedRole))
  ) {
    throw new HttpError(403, 'Hanya admin sekolah EduTrack yang aktif boleh membuat kod admin.')
  }

  const { data: school, error: schoolError } = await admin
    .from('schools')
    .select('id, school_name, school_code')
    .eq('id', profile.school_id)
    .maybeSingle()
  if (schoolError || !school || school.school_code !== 'JEA1091') {
    throw new HttpError(403, 'PAJSK Entry kini terhad kepada Sekolah Seni Malaysia Johor.')
  }

  const displayName = cleanText(body.display_name, 160) || profile.full_name || 'Admin PAJSK'
  const created = await createAccess({
    schoolId: school.id,
    displayName,
    role: 'admin',
    createdByProfileId: profile.id,
  })
  const ipHash = await hmac(`ip:${getClientIp(request)}`)
  await audit({
    schoolId: school.id,
    action: 'bootstrap_admin',
    entityType: 'teacher_access',
    entityId: created.access.id,
    afterData: { display_name: displayName, role: 'admin' },
    ipHash,
    userAgent: request.headers.get('user-agent'),
  })
  return { ...created, school_name: school.school_name }
}

const bootstrap = async (session: ValidSession) => {
  const [schoolResult, setupResult, classResult, optionResult] = await Promise.all([
    admin
      .from('schools')
      .select('id, school_name, school_code')
      .eq('id', session.schoolId)
      .single(),
    admin
      .from('school_setup_configs')
      .select('current_academic_year')
      .eq('school_id', session.schoolId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from('classes')
      .select('id, academic_year, tingkatan, class_name, is_active')
      .eq('school_id', session.schoolId)
      .eq('is_active', true)
      .order('academic_year', { ascending: false })
      .order('tingkatan')
      .order('class_name'),
    admin
      .from('pajsk_classification_options')
      .select('option_type, value, label, description, sort_order')
      .eq('is_active', true)
      .or(`school_id.is.null,school_id.eq.${session.schoolId}`)
      .order('option_type')
      .order('sort_order'),
  ])

  if (schoolResult.error || !schoolResult.data) throw new HttpError(404, 'Sekolah tidak ditemui.')
  if (classResult.error) throw new HttpError(500, 'Senarai kelas tidak dapat dimuatkan.')
  if (optionResult.error) throw new HttpError(500, 'Klasifikasi PAJSK tidak dapat dimuatkan.')

  const currentYear =
    Number(setupResult.data?.current_academic_year) || new Date().getFullYear()
  const classes = (classResult.data || []).map((row) => ({
    id: row.id,
    academic_year: Number(row.academic_year),
    form: row.tingkatan,
    class_name: row.class_name,
  }))
  const academicYears = [...new Set(classes.map((row) => row.academic_year))].sort(
    (a, b) => b - a,
  )
  if (!academicYears.includes(currentYear)) academicYears.unshift(currentYear)

  return {
    access: {
      id: session.accessId,
      display_name: session.displayName,
      role: session.role,
      school_id: session.schoolId,
      school_name: schoolResult.data.school_name,
      school_code: schoolResult.data.school_code,
      expires_at: session.expiresAt,
    },
    current_academic_year: currentYear,
    academic_years: academicYears,
    classes,
    classifications: optionResult.data || [],
  }
}

const listHistory = async (session: ValidSession, body: JsonRecord) => {
  let query = admin
    .from('pajsk_activities')
    .select(
      'id, activity_name, activity_date, academic_year, organiser, competition_category, category, component, level, teacher_in_charge, status, created_at, updated_at, pajsk_activity_participants(count)',
    )
    .eq('school_id', session.schoolId)
    .eq('status', 'submitted')
    .eq('pajsk_activity_participants.is_active', true)
    .order('activity_date', { ascending: false })
    .limit(100)

  const year = Number(body.academic_year)
  if (Number.isInteger(year) && year > 2000) query = query.eq('academic_year', year)

  const { data, error } = await query
  if (error) throw new HttpError(500, 'Sejarah aktiviti tidak dapat dimuatkan.')
  return (data || []).map((row) => ({
    ...row,
    participant_count: Array.isArray(row.pajsk_activity_participants)
      ? Number(row.pajsk_activity_participants[0]?.count || 0)
      : 0,
    pajsk_activity_participants: undefined,
  }))
}

const activityDetail = async (session: ValidSession, body: JsonRecord) => {
  const activityId = cleanText(body.activity_id, 80)
  if (!activityId) throw new HttpError(400, 'ID aktiviti diperlukan.')

  const [activityResult, participantResult] = await Promise.all([
    admin
      .from('pajsk_activities')
      .select('*')
      .eq('id', activityId)
      .eq('school_id', session.schoolId)
      .eq('status', 'submitted')
      .maybeSingle(),
    admin
      .from('pajsk_activity_participants')
      .select(
        'student_profile_id, student_enrollment_id, student_name_snapshot, form_snapshot, class_name_snapshot, art_field_snapshot, participation_type, participation_score, contribution_type, achievement_result, achievement_score, remarks',
      )
      .eq('activity_id', activityId)
      .eq('school_id', session.schoolId)
      .eq('is_active', true)
      .order('student_name_snapshot'),
  ])

  if (activityResult.error || !activityResult.data) {
    throw new HttpError(404, 'Aktiviti tidak ditemui.')
  }
  if (participantResult.error) throw new HttpError(500, 'Senarai peserta tidak dapat dimuatkan.')

  return { activity: activityResult.data, participants: participantResult.data || [] }
}

const listAccess = async (session: ValidSession) => {
  requireRole(session, ['admin'])
  const { data, error } = await admin
    .from('pajsk_teacher_access')
    .select('id, display_name, role, is_active, expires_at, last_used_at, created_at')
    .eq('school_id', session.schoolId)
    .order('is_active', { ascending: false })
    .order('display_name')
  if (error) throw new HttpError(500, 'Senarai kod guru tidak dapat dimuatkan.')
  return data || []
}

Deno.serve(async (request) => {
  const origin = request.headers.get('origin') || ''

  if (origin && !allowedOrigins.has(origin)) {
    return jsonResponse(origin, { error: 'Origin tidak dibenarkan.' }, 403)
  }
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) })
  if (request.method !== 'POST') return jsonResponse(origin, { error: 'Kaedah tidak disokong.' }, 405)

  try {
    ensureConfiguration()
    const body = (await request.json().catch(() => ({}))) as JsonRecord
    const action = cleanText(body.action, 80)

    if (action === 'login') {
      return jsonResponse(origin, await loginWithCode(request, body))
    }
    if (action === 'bootstrap_admin') {
      return jsonResponse(origin, await bootstrapAdmin(request, body))
    }

    const session = await requireSession(request)

    if (action === 'logout') {
      await admin
        .from('pajsk_teacher_sessions')
        .update({ revoked_at: new Date().toISOString() })
        .eq('id', session.sessionId)
      return jsonResponse(origin, { ok: true })
    }

    if (action === 'bootstrap') {
      return jsonResponse(origin, await bootstrap(session))
    }

    if (action === 'search_students') {
      const academicYear = Number(body.academic_year)
      if (!Number.isInteger(academicYear)) throw new HttpError(400, 'Tahun akademik tidak sah.')
      const { data, error } = await admin.rpc('pajsk_search_students', {
        p_school_id: session.schoolId,
        p_academic_year: academicYear,
        p_query: cleanText(body.query, 120) || null,
        p_form: cleanText(body.form, 80) || null,
        p_class_id: cleanText(body.class_id, 80) || null,
        p_art_field: cleanText(body.art_field, 80) || null,
        p_limit: 100,
      })
      if (error) throw new HttpError(500, 'Carian murid tidak dapat dijalankan.')
      return jsonResponse(origin, { students: data || [] })
    }

    if (action === 'save_activity') {
      requireRole(session, ['admin', 'teacher'])
      const activity = body.activity && typeof body.activity === 'object' ? body.activity : {}
      const participants = Array.isArray(body.participants) ? body.participants : []
      const { data, error } = await admin.rpc('pajsk_save_activity', {
        p_school_id: session.schoolId,
        p_access_id: session.accessId,
        p_activity: activity,
        p_participants: participants,
      })
      if (error) {
        if (error.code === '23505') {
          throw new HttpError(409, 'Aktiviti yang sama telah direkodkan.', {
            duplicate_activity_id: error.details || null,
          })
        }
        if (error.code === '42501') throw new HttpError(403, error.message)
        throw new HttpError(400, error.message || 'Aktiviti tidak dapat disimpan.')
      }
      return jsonResponse(origin, { activity_id: data })
    }

    if (action === 'activity_history') {
      return jsonResponse(origin, { activities: await listHistory(session, body) })
    }

    if (action === 'activity_detail') {
      return jsonResponse(origin, await activityDetail(session, body))
    }

    if (action === 'cancel_activity') {
      requireRole(session, ['admin'])
      const activityId = cleanText(body.activity_id, 80)
      const { error } = await admin.rpc('pajsk_cancel_activity', {
        p_school_id: session.schoolId,
        p_access_id: session.accessId,
        p_activity_id: activityId,
      })
      if (error) throw new HttpError(400, error.message || 'Aktiviti tidak dapat dibatalkan.')
      return jsonResponse(origin, { ok: true })
    }

    if (action === 'list_access') {
      return jsonResponse(origin, { access_rows: await listAccess(session) })
    }

    if (action === 'import_art_fields') {
      requireRole(session, ['admin'])
      const academicYear = Number(body.academic_year)
      const rows = Array.isArray(body.rows) ? body.rows : []
      const applyChanges = body.apply === true
      if (!Number.isInteger(academicYear) || academicYear < 2000 || academicYear > 2200) {
        throw new HttpError(400, 'Tahun akademik tidak sah.')
      }
      if (rows.length < 1 || rows.length > 1000) {
        throw new HttpError(400, 'Fail import mesti mengandungi antara 1 hingga 1000 murid.')
      }
      const sanitizedRows = rows.map((row) => {
        const value = row && typeof row === 'object' ? row as JsonRecord : {}
        return {
          document_row: Number(value.document_row) || null,
          student_name: cleanText(value.student_name, 300),
          normalized_ic: cleanText(value.normalized_ic, 30).replace(/\D/g, ''),
          document_class: cleanText(value.document_class, 100),
          art_field: cleanText(value.art_field, 40),
        }
      })
      const { data, error } = await admin.rpc('pajsk_import_art_fields', {
        p_school_id: session.schoolId,
        p_access_id: session.accessId,
        p_academic_year: academicYear,
        p_rows: sanitizedRows,
        p_apply: applyChanges,
      })
      if (error) {
        if (error.code === '42501') throw new HttpError(403, error.message)
        throw new HttpError(400, error.message || 'Bidang seni tidak dapat diproses.')
      }
      return jsonResponse(origin, data as JsonRecord)
    }

    if (action === 'create_access') {
      requireRole(session, ['admin'])
      const displayName = cleanText(body.display_name, 160)
      const role = cleanText(body.role, 30) as 'admin' | 'teacher' | 'viewer'
      if (!displayName || !['admin', 'teacher', 'viewer'].includes(role)) {
        throw new HttpError(400, 'Nama dan peranan yang sah diperlukan.')
      }
      const expiresAt = cleanText(body.expires_at, 40) || null
      const created = await createAccess({
        schoolId: session.schoolId,
        displayName,
        role,
        expiresAt,
        createdByAccessId: session.accessId,
      })
      await audit({
        schoolId: session.schoolId,
        actorAccessId: session.accessId,
        action: 'create_access',
        entityType: 'teacher_access',
        entityId: created.access.id,
        afterData: { display_name: displayName, role, expires_at: expiresAt },
        ipHash: await hmac(`ip:${getClientIp(request)}`),
        userAgent: request.headers.get('user-agent'),
      })
      return jsonResponse(origin, created)
    }

    if (action === 'reset_access') {
      requireRole(session, ['admin'])
      const accessId = cleanText(body.access_id, 80)
      const { data: target, error: targetError } = await admin
        .from('pajsk_teacher_access')
        .select('id, display_name, role, is_active')
        .eq('id', accessId)
        .eq('school_id', session.schoolId)
        .maybeSingle()
      if (targetError || !target) throw new HttpError(404, 'Rekod guru tidak ditemui.')

      const accessCode = generateAccessCode()
      const normalizedCode = normalizeCode(accessCode)
      const salt = randomHex(16)
      const [codeLookup, codeHash] = await Promise.all([
        hmac(`lookup:${normalizedCode}`),
        deriveCodeHash(normalizedCode, salt),
      ])
      const { error } = await admin
        .from('pajsk_teacher_access')
        .update({
          code_lookup: codeLookup,
          code_hash: codeHash,
          code_salt: salt,
          failed_attempts: 0,
          locked_until: null,
          is_active: true,
        })
        .eq('id', accessId)
        .eq('school_id', session.schoolId)
      if (error) throw new HttpError(500, 'Kod akses tidak dapat ditetapkan semula.')
      await admin
        .from('pajsk_teacher_sessions')
        .update({ revoked_at: new Date().toISOString() })
        .eq('access_id', accessId)
        .is('revoked_at', null)
      await audit({
        schoolId: session.schoolId,
        actorAccessId: session.accessId,
        action: 'reset_access',
        entityType: 'teacher_access',
        entityId: accessId,
        beforeData: { display_name: target.display_name, role: target.role },
        ipHash: await hmac(`ip:${getClientIp(request)}`),
        userAgent: request.headers.get('user-agent'),
      })
      return jsonResponse(origin, { access_code: accessCode })
    }

    if (action === 'revoke_access') {
      requireRole(session, ['admin'])
      const accessId = cleanText(body.access_id, 80)
      if (accessId === session.accessId) {
        throw new HttpError(400, 'Kod yang sedang digunakan tidak boleh dibatalkan sendiri.')
      }
      const { error } = await admin
        .from('pajsk_teacher_access')
        .update({ is_active: false })
        .eq('id', accessId)
        .eq('school_id', session.schoolId)
      if (error) throw new HttpError(500, 'Kod akses tidak dapat dibatalkan.')
      await admin
        .from('pajsk_teacher_sessions')
        .update({ revoked_at: new Date().toISOString() })
        .eq('access_id', accessId)
        .is('revoked_at', null)
      await audit({
        schoolId: session.schoolId,
        actorAccessId: session.accessId,
        action: 'revoke_access',
        entityType: 'teacher_access',
        entityId: accessId,
        ipHash: await hmac(`ip:${getClientIp(request)}`),
        userAgent: request.headers.get('user-agent'),
      })
      return jsonResponse(origin, { ok: true })
    }

    throw new HttpError(404, 'Tindakan tidak ditemui.')
  } catch (error) {
    console.error(error)
    if (error instanceof HttpError) {
      return jsonResponse(origin, { error: error.message, ...error.details }, error.status)
    }
    return jsonResponse(origin, { error: 'Ralat pelayan yang tidak dijangka.' }, 500)
  }
})
