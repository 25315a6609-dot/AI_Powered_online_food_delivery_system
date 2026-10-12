export type ApiRecommendationPreferences = {
  cuisine: string[]
  categories?: string[]
  meal: 'Breakfast' | 'Lunch' | 'Dinner' | 'Snacks'
  avoid: string
  diet: 'Vegetarian' | 'Everything' | 'Vegan'
  min_budget?: number
  max_budget: number
  spice: 'Mild' | 'Medium' | 'Spicy'
  health: 'Healthy' | 'Regular' | 'Both'
  query?: string
}

export type ApiRecommendation = {
  id: number
  name: string
  cuisine: string
  restaurant: string
  price: number
  rating: number
  time: number
  match: number
  reasons: string[]
}

const apiUrl = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:8000' : '')

export async function getRecommendations(preferences: ApiRecommendationPreferences, token?: string): Promise<ApiRecommendation[]> {
  const response = await fetch(`${apiUrl}/api/recommendations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(preferences),
  })
  if (!response.ok) throw new Error('Recommendation API unavailable')
  return response.json() as Promise<ApiRecommendation[]>
}
