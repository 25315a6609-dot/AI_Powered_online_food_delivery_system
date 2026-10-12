const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export async function createPaymentIntent(token: string, amountInRupees: number) {
  const response = await fetch(`${apiUrl}/api/payments/create-intent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ amount: Math.round(amountInRupees * 100), currency: 'inr' }),
  })
  if (!response.ok) throw new Error((await response.json()).detail || 'Payment service unavailable')
  return response.json() as Promise<{ client_secret: string; payment_intent_id: string }>
}
