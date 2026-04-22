const APP_ID = import.meta.env.VITE_ATLAS_APP_ID as string | undefined
const API_KEY = import.meta.env.VITE_ATLAS_API_KEY as string | undefined

const BASE = APP_ID
  ? `https://data.mongodb-api.com/app/${APP_ID}/endpoint/data/v1/action`
  : null

async function atlasRequest(action: string, body: object) {
  if (!BASE || !API_KEY) return null

  const res = await fetch(`${BASE}/${action}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': API_KEY,
    },
    body: JSON.stringify({
      dataSource: 'Cluster0',
      database: 'dementai',
      collection: 'summaries',
      ...body,
    }),
  })

  if (!res.ok) throw new Error(`Atlas ${action} failed: ${res.status}`)
  return res.json()
}

export async function fetchStoredSummary(personId: string): Promise<string | null> {
  try {
    const data = await atlasRequest('findOne', { filter: { personId } })
    return (data?.document?.summary as string) ?? null
  } catch {
    return null
  }
}

export async function persistSummary(personId: string, name: string, summary: string): Promise<void> {
  try {
    await atlasRequest('updateOne', {
      filter: { personId },
      update: {
        $set: { personId, name, summary, updatedAt: new Date().toISOString() },
      },
      upsert: true,
    })
  } catch {
    // MongoDB unavailable — localStorage remains the fallback
  }
}
