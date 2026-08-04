const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const INTERVENTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'details', 'duration', 'status', 'start_date', 'end_date'],
  properties: {
    title: { type: 'string' },
    details: { type: 'string' },
    duration: { type: 'string' },
    status: { type: 'string', enum: ['Dirancang', 'Dalam Pelaksanaan', 'Selesai', 'Ditangguh'] },
    start_date: { type: 'string' },
    end_date: { type: 'string' },
  },
}

const RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'issue_statement',
    'problem_causes',
    'student_interventions',
    'teacher_interventions',
  ],
  properties: {
    issue_statement: { type: 'string' },
    problem_causes: {
      type: 'object',
      additionalProperties: false,
      required: ['teacher', 'student'],
      properties: {
        teacher: {
          type: 'array',
          items: { type: 'string' },
        },
        student: {
          type: 'array',
          items: { type: 'string' },
        },
      },
    },
    student_interventions: {
      type: 'object',
      additionalProperties: false,
      required: ['green', 'yellow', 'red'],
      properties: {
        green: {
          type: 'array',
          items: INTERVENTION_SCHEMA,
        },
        yellow: {
          type: 'array',
          items: INTERVENTION_SCHEMA,
        },
        red: {
          type: 'array',
          items: INTERVENTION_SCHEMA,
        },
      },
    },
    teacher_interventions: {
      type: 'array',
      items: INTERVENTION_SCHEMA,
    },
  },
}

const AREAS = new Set(['issue', 'causes', 'student_interventions', 'teacher_interventions'])

const SYSTEM_PROMPT = `
Anda pembantu AI untuk modul Dialog Prestasi Panitia sekolah Malaysia.
Tulis dalam Bahasa Melayu yang profesional, padat, dan sesuai dimasukkan terus ke laporan DPP.
Gunakan konteks analisis sahaja. Jangan cipta nama murid, nama guru, atau fakta khusus yang tiada dalam konteks.

Jika area ialah "issue":
- Isi issue_statement sahaja.
- Kosongkan punca dan intervensi.

Jika area ialah "causes":
- Cadangkan punca guru dan punca murid sahaja.
- Setiap punca satu ayat ringkas.

Jika area ialah "student_interventions":
- Cadangkan intervensi murid mengikut traffic light.
- Hijau: pengayaan dan kekalkan prestasi.
- Kuning: pemulihan ringan, latih tubi berfokus, dan pemantauan.
- Merah: intervensi asas, bimbingan intensif, dan susulan ibu bapa jika sesuai.

Jika area ialah "teacher_interventions":
- Cadangkan intervensi guru yang fokus kepada PdPc, analisis item, pentaksiran formatif, bahan sokongan, dan pemantauan.

Untuk intervensi:
- title maksimum 8 patah perkataan.
- details satu ayat tindakan yang jelas.
- duration ringkas seperti "2 minggu" atau "4 minggu".
- status biasanya "Dirancang".
- start_date dan end_date hanya diisi jika konteks menyediakan tarikh; jika tidak, pulangkan string kosong.

Pulangkan JSON sahaja mengikut skema.
`.trim()

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  })

const cleanString = (value: unknown, maxLength = 600) =>
  String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)

const cleanArray = (value: unknown, maxItems = 5) =>
  Array.isArray(value)
    ? value.map((item) => cleanString(item, 280)).filter(Boolean).slice(0, maxItems)
    : []

const cleanDate = (value: unknown) => {
  const text = cleanString(value, 20)
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : ''
}

const cleanInterventions = (value: unknown, maxItems = 3) => {
  if (!Array.isArray(value)) return []

  return value
    .map((item) => {
      const row = item && typeof item === 'object' ? item as Record<string, unknown> : {}
      const status = cleanString(row.status, 40)

      return {
        title: cleanString(row.title, 100),
        details: cleanString(row.details, 500),
        duration: cleanString(row.duration, 80),
        status: ['Dirancang', 'Dalam Pelaksanaan', 'Selesai', 'Ditangguh'].includes(status)
          ? status
          : 'Dirancang',
        start_date: cleanDate(row.start_date),
        end_date: cleanDate(row.end_date),
      }
    })
    .filter((item) => item.title || item.details)
    .slice(0, maxItems)
}

const normalizeSuggestions = (value: unknown) => {
  const root = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const problemCauses =
    root.problem_causes && typeof root.problem_causes === 'object'
      ? root.problem_causes as Record<string, unknown>
      : {}
  const studentInterventions =
    root.student_interventions && typeof root.student_interventions === 'object'
      ? root.student_interventions as Record<string, unknown>
      : {}

  return {
    issue_statement: cleanString(root.issue_statement, 500),
    problem_causes: {
      teacher: cleanArray(problemCauses.teacher),
      student: cleanArray(problemCauses.student),
    },
    student_interventions: {
      green: cleanInterventions(studentInterventions.green),
      yellow: cleanInterventions(studentInterventions.yellow),
      red: cleanInterventions(studentInterventions.red),
    },
    teacher_interventions: cleanInterventions(root.teacher_interventions, 4),
  }
}

const stripJsonFence = (text: string) =>
  text
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim()

const extractOutputText = (payload: unknown) => {
  const root = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {}
  if (typeof root.output_text === 'string') return root.output_text

  const chunks: string[] = []
  const output = Array.isArray(root.output) ? root.output : []

  for (const item of output) {
    if (!item || typeof item !== 'object') continue
    const content = Array.isArray((item as Record<string, unknown>).content)
      ? (item as Record<string, unknown>).content as unknown[]
      : []

    for (const part of content) {
      if (!part || typeof part !== 'object') continue
      const partRecord = part as Record<string, unknown>
      if (typeof partRecord.text === 'string') chunks.push(partRecord.text)
      if (typeof partRecord.output_text === 'string') chunks.push(partRecord.output_text)
    }
  }

  return chunks.join('')
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Kaedah request tidak disokong.' }, 405)
  }

  const apiKey = Deno.env.get('OPENAI_API_KEY')
  if (!apiKey) {
    return jsonResponse({ error: 'OPENAI_API_KEY belum ditetapkan untuk Edge Function.' }, 500)
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return jsonResponse({ error: 'Body request tidak sah.' }, 400)
  }

  const area = cleanString(body.area, 80)
  if (!AREAS.has(area)) {
    return jsonResponse({ error: 'Jenis cadangan AI tidak sah.' }, 400)
  }

  const context = body.context && typeof body.context === 'object' ? body.context : {}
  const model = Deno.env.get('OPENAI_MODEL') || 'gpt-5.6-luna'

  const openAiResponse = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      store: false,
      reasoning: { effort: 'low' },
      max_output_tokens: 1800,
      text: {
        verbosity: 'low',
        format: {
          type: 'json_schema',
          name: 'performance_dialog_suggestions',
          strict: true,
          schema: RESPONSE_SCHEMA,
        },
      },
      input: [
        {
          role: 'system',
          content: [{ type: 'input_text', text: SYSTEM_PROMPT }],
        },
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: JSON.stringify({ area, context }, null, 2),
            },
          ],
        },
      ],
    }),
  })

  const rawResult = await openAiResponse.text()

  if (!openAiResponse.ok) {
    let message = 'OpenAI gagal menjana cadangan.'
    try {
      const parsed = JSON.parse(rawResult)
      message = parsed?.error?.message || message
    } catch {
      // Keep a generic message if OpenAI returns a non-JSON error.
    }
    return jsonResponse({ error: message }, openAiResponse.status)
  }

  try {
    const parsedResult = JSON.parse(rawResult)
    const outputText = stripJsonFence(extractOutputText(parsedResult))
    const suggestions = normalizeSuggestions(JSON.parse(outputText))

    return jsonResponse({ suggestions })
  } catch (error) {
    console.error(error)
    return jsonResponse({ error: 'Format cadangan AI tidak dapat dibaca.' }, 502)
  }
})
