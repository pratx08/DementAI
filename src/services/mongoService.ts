import { apiGet, apiPut } from './apiClient'

export async function fetchStoredSummary(personId: string): Promise<string | null> {
  try {
    const data = await apiGet<{ summary: string | null }>(`/summaries/${personId}`)
    return data.summary ?? null
  } catch {
    return null
  }
}

export async function persistSummary(
  personId: string,
  name: string,
  summary: string,
): Promise<void> {
  try {
    await apiPut(`/summaries/${personId}`, { name, summary })
  } catch {
    // Backend unavailable — local storage remains the fallback.
  }
}
