export type CatalogFood = {
  id: number
  name: string
  restaurant: string
  cuisine: string
  category: string
  price: number
  rating: number
  time: number
  healthy: boolean
  veg: boolean
  vegan: boolean
  spice: string
  meal: string | null
  ingredients: string[]
  image: string
  available: boolean
}

export type CatalogRestaurant = {
  id: number
  name: string
  cuisine: string
  rating: number
  delivery: number
  fee: number
  distance: string
  image: string
  description: string
  location: string
  price_range: string
  available: boolean
  menu_count: number
}

const apiUrl = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:8000' : '')

async function request<T>(path: string): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`)
  if (!response.ok) throw new Error(`Catalog request failed (${response.status})`)
  return response.json() as Promise<T>
}

export async function loadCatalogFoods(): Promise<CatalogFood[]> {
  const pageSize = 500
  const foods: CatalogFood[] = []
  for (let offset = 0; ; offset += pageSize) {
    const page = await request<CatalogFood[]>(`/api/catalog/foods?limit=${pageSize}&offset=${offset}`)
    foods.push(...page)
    if (page.length < pageSize) return foods
  }
}

export function loadCatalogRestaurants() {
  return request<CatalogRestaurant[]>('/api/catalog/restaurants')
}

export type CatalogCategory = { name: string; item_count: number }

export function loadCatalogCategories() {
  return request<CatalogCategory[]>('/api/catalog/categories')
}