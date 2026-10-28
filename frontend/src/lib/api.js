const BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')
const V1 = `${BASE}/api/v1`
const TIMEOUT_MS = 8000

export class ApiError extends Error {
  constructor(message, { status = 0, detail = null, network = false } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
    /** true = we never got an HTTP answer (offline, DNS, timeout, server down) */
    this.isNetwork = network
  }
}

/** FastAPI errors arrive as {detail: string | {message, products} | [validation errors]} */
function describe(detail, fallback) {
  if (!detail) return fallback
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) return detail.map((d) => d.msg).join('; ')
  if (detail.message) {
    const lines = (detail.products ?? [])
      .map((p) =>
        typeof p === 'object'
          ? `${p.name} (wanted ${p.requested}, only ${p.available} in stock)`
          : String(p),
      )
      .join(', ')
    return lines ? `${detail.message}: ${lines}` : detail.message
  }
  return fallback
}

async function request(path, { method = 'GET', body, timeout = TIMEOUT_MS } = {}) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeout)
  let res
  try {
    res = await fetch(`${V1}${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    })
  } catch (err) {
    // fetch only rejects when no HTTP response arrived at all.
    throw new ApiError(err.name === 'AbortError' ? 'Request timed out' : 'Network unreachable', {
      network: true,
    })
  } finally {
    clearTimeout(timer)
  }

  if (res.status === 204) return null
  let data = null
  try {
    data = await res.json()
  } catch {
    /* non-JSON body */
  }

  // A gateway/proxy error while the backend is down looks like a 502-504:
  // treat as "can't reach server" so sales are queued rather than lost.
  if ([502, 503, 504].includes(res.status)) {
    throw new ApiError('Server unavailable', { status: res.status, network: true })
  }
  if (!res.ok) {
    throw new ApiError(describe(data?.detail, `Request failed (${res.status})`), {
      status: res.status,
      detail: data?.detail,
    })
  }
  return data
}

export const api = {
  listProducts: () => request('/products?limit=20000'),
  getProductByBarcode: (code) =>
    request(`/products/by-barcode/${encodeURIComponent(code)}`, { timeout: 3000 }),
  checkout: (payload) => request('/checkout', { method: 'POST', body: payload }),
  dashboard: (params = {}) => {
    const qs = new URLSearchParams(params).toString()
    return request(`/reports/dashboard${qs ? `?${qs}` : ''}`)
  },
}
