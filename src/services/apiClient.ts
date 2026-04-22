const configuredBase = import.meta.env.VITE_API_BASE_URL as string | undefined

function normalizeBaseUrl(baseUrl?: string) {
  if (!baseUrl) {
    return '/api'
  }

  return `${baseUrl.replace(/\/$/, '')}/api`
}

const API_BASE_URL = normalizeBaseUrl(configuredBase)

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(`API request failed with status ${response.status}`)
  }

  return response.json() as Promise<T>
}

export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`)
  return parseResponse<T>(response)
}

export async function apiPut<T>(path: string, body: object): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  return parseResponse<T>(response)
}

export async function apiDelete<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'DELETE',
  })

  return parseResponse<T>(response)
}
