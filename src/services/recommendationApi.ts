export type ApiRecommendationPreferences = {
  cuisine: string[]
  diet: 'Vegetarian' | 'Everything' | 'Vegan'
  max_budget: number
  spice: 'Mild' | 'Medium' | 'Spicy'
  health: 'Healthy' | 'Regular' | 'Both'
}

export type ApiRecommendation = {
  id: number
  name: string
  cuisine: string
  price: number
  match: number
  reasons: string[]
}

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export async function getRecommendations(preferences: ApiRecommendationPreferences): Promise<ApiRecommendation[]> {
  const response = await fetch(`${apiUrl}/api/recommendations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(preferences),
  })
  if (!response.ok) throw new Error('Recommendation API unavailable')
  return response.json() as Promise<ApiRecommendation[]>
}
