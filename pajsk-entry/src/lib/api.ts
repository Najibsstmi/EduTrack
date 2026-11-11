import { getSessionToken } from './session'
import { supabaseAnonKey, supabaseUrl } from './supabase'

export class ApiError extends Error {
  status: number
  details: Record<string, unknown>

  constructor(message: string, status: number, details: Record<string, unknown> = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.details = details
  }
}

interface RequestOptions {
  sessionToken?: string
  authToken?: string
}

export async function apiRequest<T>(
  action: string,
  payload: Record<string, unknown> = {},
  options: RequestOptions = {}
): Promise<T> {
  const sessionToken = options.sessionToken ?? getSessionToken()
  const response = await fetch(`${supabaseUrl}/functions/v1/pajsk-api`, {
    method: 'POST',
    headers: {
      apikey: supabaseAnonKey,
      'Content-Type': 'application/json',
      ...(sessionToken ? { 'x-pajsk-session': sessionToken } : {}),
      ...(options.authToken ? { Authorization: `Bearer ${options.authToken}` } : {})
    },
    body: JSON.stringify({ action, ...payload })
  })

  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>
  if (!response.ok) {
    throw new ApiError(
      String(body.error || 'Permintaan tidak dapat diproses.'),
      response.status,
      body
    )
  }

  return body as T
}
