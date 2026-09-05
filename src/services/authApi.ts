export type SessionUser = { id: number; name: string; email: string }
export type AuthResponse = { access_token: string; token_type: string; user: SessionUser }

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000'

async function request(path: string, body: Record<string, string>): Promise<AuthResponse> {
  const response = await fetch(`${apiUrl}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!response.ok) throw new Error((await response.json()).detail || 'Authentication failed')
  return response.json() as Promise<AuthResponse>
}

export function signup(name: string, email: string, password: string) { return request('/api/auth/signup', { name, email, password }) }
export function login(email: string, password: string) { return request('/api/auth/login', { name: 'FoodFusion friend', email, password }) }
export function getSession(token: string) { return fetch(`${apiUrl}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } }) }
