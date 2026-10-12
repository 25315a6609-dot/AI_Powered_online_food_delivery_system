export type SessionUser = { id: number; name: string; email: string }
export type AuthResponse = { access_token: string; token_type: string; user: SessionUser }

const apiUrl = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:8000' : '')
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function validateCredentials(name: string, email: string, password: string) {
  const normalizedEmail = email.trim().toLowerCase()
  if (!emailPattern.test(normalizedEmail)) throw new Error('Enter a valid email address.')
  if (password.length < 8) throw new Error('Password must be at least 8 characters.')
  if (password.length > 128) throw new Error('Password must be 128 characters or fewer.')
  if (name.trim().length < 2) throw new Error('Enter your name to create an account.')
  return normalizedEmail
}

async function request<T>(path: string, body: Record<string, string>): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${apiUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    throw new Error('Authentication service is unavailable. Please try again later.')
  }

  let payload: { detail?: string } | T | null = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    const detail = payload && typeof payload === 'object' && 'detail' in payload
      ? payload.detail
      : undefined
    throw new Error(typeof detail === 'string' ? detail : 'Authentication failed')
  }

  return payload as T
}

export function signup(name: string, email: string, password: string) {
  const normalizedEmail = validateCredentials(name, email, password)
  return request<AuthResponse>('/api/auth/signup', {
    name: name.trim(),
    email: normalizedEmail,
    password,
  })
}

export function login(email: string, password: string) {
  const normalizedEmail = validateCredentials('FoodFusion friend', email, password)
  return request<AuthResponse>('/api/auth/login', {
    name: 'FoodFusion friend',
    email: normalizedEmail,
    password,
  })
}

export function getSession(token: string) {
  return fetch(`${apiUrl}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  })
}