/**
 * Límite por IP en memoria. Es "best effort": en serverless cada instancia tiene su
 * propio contador. Basta para que un bucle accidental no se coma el crédito del Gateway;
 * para producción de verdad habría que usar Vercel WAF / Upstash Ratelimit.
 */
const hits = new Map<string, number[]>()

export function rateLimit(key: string, max = 90, windowMs = 60_000): boolean {
  const now = Date.now()
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs)
  if (recent.length >= max) {
    hits.set(key, recent)
    return false
  }
  recent.push(now)
  hits.set(key, recent)
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (v.every((t) => now - t >= windowMs)) hits.delete(k)
  }
  return true
}

export function clientIp(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local'
}
