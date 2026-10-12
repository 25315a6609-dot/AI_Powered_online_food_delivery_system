export type CustomerPreferences = {
  diet: "Vegetarian" | "Everything" | "Vegan";
  cuisines: string[];
  categories: string[];
  minBudget: number;
  maxBudget: number;
  spice: "Mild" | "Medium" | "Spicy";
  meal: "Breakfast" | "Lunch" | "Dinner" | "Snacks";
  health: "Healthy" | "Regular" | "Both";
  avoid: string;
};

export type CustomerOrder = {
  id: string;
  items: Array<{ id: number; name?: string; price?: number; restaurant?: string; quantity: number }>;
  total: number;
  address: string;
  location: string;
  payment_method: string;
  payment_status: string;
  status: string;
  created_at: string;
};

export type FavoriteRecord = { item_type: "food" | "restaurant"; item_id: number };
export type CustomerCartLine = { id: number; quantity: number };

const apiUrl = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? "http://localhost:8000" : "");

async function request<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...init.headers,
    },
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => null) as { detail?: string } | null;
    throw new Error(detail?.detail || `Customer API request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export async function loadPreferences(token: string): Promise<CustomerPreferences> {
  const stored = await request<Omit<CustomerPreferences, "minBudget" | "maxBudget"> & { min_budget: number; max_budget: number }>(token, "/api/preferences");
  return { ...stored, categories: stored.categories || [], minBudget: stored.min_budget, maxBudget: stored.max_budget };
}

export async function savePreferences(token: string, preferences: CustomerPreferences): Promise<CustomerPreferences> {
  const saved = await request<Omit<CustomerPreferences, "minBudget" | "maxBudget"> & { min_budget: number; max_budget: number }>(token, "/api/preferences", {
    method: "PUT",
    body: JSON.stringify({ ...preferences, min_budget: preferences.minBudget, max_budget: preferences.maxBudget, minBudget: undefined, maxBudget: undefined }),
  });
  return { ...saved, minBudget: saved.min_budget, maxBudget: saved.max_budget };
}

export function loadFavorites(token: string) {
  return request<FavoriteRecord[]>(token, "/api/favorites");
}

export function addFavorite(token: string, itemType: FavoriteRecord["item_type"], itemId: number) {
  return request<{ saved: boolean }>(token, "/api/favorites", {
    method: "PUT",
    body: JSON.stringify({ item_type: itemType, item_id: itemId }),
  });
}

export function removeFavorite(token: string, itemType: FavoriteRecord["item_type"], itemId: number) {
  return request<{ saved: boolean }>(token, `/api/favorites/${itemType}/${itemId}`, { method: "DELETE" });
}

export function recordBehavior(
  token: string,
  eventType: "search" | "view" | "recommendation_click" | "save" | "unsave" | "add_to_cart" | "order" | "review",
  itemId?: number,
  payload: Record<string, unknown> = {},
) {
  return request<{ recorded: boolean }>(token, "/api/events", {
    method: "POST",
    body: JSON.stringify({ event_type: eventType, item_id: itemId, payload }),
  });
}

export function loadOrders(token: string) {
  return request<CustomerOrder[]>(token, "/api/orders");
}

export function loadReviews(token: string) {
  return request<Array<{ order_id: string; item_id: number; rating: number; comment: string }>>(token, "/api/reviews");
}

export function createOrder(
  token: string,
  payload: {
    items: Array<{ id: number; quantity: number }>;
    address: string;
    location: string;
    payment_method: string;
  },
) {
  return request<CustomerOrder>(token, "/api/orders", { method: "POST", body: JSON.stringify(payload) });
}

export function updateOrderStage(token: string, orderId: string, stage: number) {
  return request<CustomerOrder>(token, `/api/orders/${orderId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ stage }),
  });
}

export function createReview(
  token: string,
  review: { order_id: string; item_id: number; rating: number; comment: string },
) {
  return request<{ id: number }>(token, "/api/reviews", { method: "POST", body: JSON.stringify(review) });
}

export function loadCart(token: string) {
  return request<CustomerCartLine[]>(token, "/api/cart");
}

export function saveCart(token: string, items: CustomerCartLine[]) {
  return request<CustomerCartLine[]>(token, "/api/cart", {
    method: "PUT",
    body: JSON.stringify({ items }),
  });
}