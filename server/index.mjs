import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import { MongoClient } from 'mongodb'
import path from 'path'
import { fileURLToPath } from 'url'

const app = express()
const port = Number(process.env.PORT || 4000)
const mongoUri = process.env.MONGODB_URI
const dbName = process.env.MONGODB_DB_NAME || 'dementai'
const geminiApiKey =
  process.env.GEMINI_API_KEY ||
  process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
  process.env.GOOGLE_API_KEY
const geminiModel = process.env.GEMINI_MODEL || 'gemini-3-flash-preview'
const geminiSummaryModel = process.env.GEMINI_SUMMARY_MODEL || geminiModel
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const distPath = path.resolve(__dirname, '..', 'dist')

let clientPromise = null

function isMongoConfigured() {
  return Boolean(mongoUri)
}

function getMongoClient() {
  if (!mongoUri) {
    throw new Error('MONGODB_URI is not configured.')
  }

  clientPromise ??= MongoClient.connect(mongoUri)
  return clientPromise
}

async function getDb() {
  const client = await getMongoClient()
  return client.db(dbName)
}

app.use(cors())
app.use(express.json({ limit: '20mb' }))

function extractGeminiText(data) {
  return data?.candidates?.[0]?.content?.parts
    ?.map((part) => part?.text ?? '')
    ?.join(' ')
    ?.replace(/\s+/g, ' ')
    ?.trim() ?? ''
}

async function generateGeminiContent(model, parts, generationConfig) {
  if (!geminiApiKey) {
    const error = new Error('Gemini is not configured.')
    error.status = 503
    throw error
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts,
          },
        ],
        generationConfig,
      }),
    },
  )

  if (!response.ok) {
    const errorText = await response.text()
    const error = new Error(errorText.slice(0, 300) || 'Gemini request failed.')
    error.status = 502
    throw error
  }

  return response.json()
}

app.get('/api/health', async (_req, res) => {
  if (!isMongoConfigured()) {
    res.status(200).json({
      ok: false,
      mongoConfigured: false,
      message: 'MongoDB is not configured yet.',
    })
    return
  }

  try {
    const db = await getDb()
    await db.command({ ping: 1 })
    res.json({ ok: true, mongoConfigured: true, database: dbName })
  } catch (error) {
    res.status(500).json({
      ok: false,
      mongoConfigured: true,
      error: error instanceof Error ? error.message : 'Unknown MongoDB error',
    })
  }
})

app.get('/api/people', async (_req, res) => {
  try {
    const db = await getDb()
    const document = await db.collection('app_state').findOne({ key: 'people' })
    res.json({ people: Array.isArray(document?.value) ? document.value : [] })
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Could not load people.',
    })
  }
})

app.put('/api/people', async (req, res) => {
  try {
    const db = await getDb()
    const people = Array.isArray(req.body?.people) ? req.body.people : []

    await db.collection('app_state').updateOne(
      { key: 'people' },
      {
        $set: {
          key: 'people',
          value: people,
          updatedAt: new Date().toISOString(),
        },
      },
      { upsert: true },
    )

    res.json({ ok: true })
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Could not save people.',
    })
  }
})

app.delete('/api/people', async (_req, res) => {
  try {
    const db = await getDb()
    await db.collection('app_state').deleteOne({ key: 'people' })
    await db.collection('summaries').deleteMany({})
    res.json({ ok: true })
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Could not clear people.',
    })
  }
})

app.get('/api/dashboard', async (_req, res) => {
  try {
    const db = await getDb()
    const document = await db.collection('app_state').findOne({ key: 'dashboard' })
    res.json({ dashboard: document?.value ?? null })
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Could not load dashboard.',
    })
  }
})

app.put('/api/dashboard', async (req, res) => {
  try {
    const db = await getDb()
    const dashboard = req.body?.dashboard ?? null

    await db.collection('app_state').updateOne(
      { key: 'dashboard' },
      {
        $set: {
          key: 'dashboard',
          value: dashboard,
          updatedAt: new Date().toISOString(),
        },
      },
      { upsert: true },
    )

    res.json({ ok: true })
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Could not save dashboard.',
    })
  }
})

app.get('/api/summaries/:personId', async (req, res) => {
  try {
    const db = await getDb()
    const document = await db.collection('summaries').findOne({
      personId: req.params.personId,
    })

    res.json({ summary: document?.summary ?? null })
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Could not load summary.',
    })
  }
})

app.put('/api/summaries/:personId', async (req, res) => {
  try {
    const db = await getDb()
    const personId = req.params.personId
    const name = typeof req.body?.name === 'string' ? req.body.name : ''
    const summary = typeof req.body?.summary === 'string' ? req.body.summary : ''

    await db.collection('summaries').updateOne(
      { personId },
      {
        $set: {
          personId,
          name,
          summary,
          updatedAt: new Date().toISOString(),
        },
      },
      { upsert: true },
    )

    res.json({ ok: true })
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Could not save summary.',
    })
  }
})

app.post('/api/summarize', async (req, res) => {
  const transcript = typeof req.body?.transcript === 'string'
    ? req.body.transcript.trim()
    : ''

  if (!transcript) {
    res.status(400).json({ error: 'Transcript is required.' })
    return
  }

  const prompt = [
    'Summarize this dementia-care conversation for a face-recognition memory card.',
    'Do not copy the transcript verbatim, but preserve the concrete details.',
    'Include useful care context: who spoke if clear, relationship context, medication, visit plans, appointments, emotional state, reassurance given, and objects left nearby.',
    'Write 2 complete, natural sentences, not a fragment or title.',
    'Each sentence should be useful to the patient and caregiver.',
    'Aim for 35 to 70 words total.',
    'Return plain text only.',
    '',
    `Conversation: ${transcript}`,
  ].join('\n')

  try {
    const data = await generateGeminiContent(
      geminiSummaryModel,
      [{ text: prompt }],
      {
        temperature: 0.2,
        maxOutputTokens: 180,
      },
    )
    const summary = extractGeminiText(data)

    if (!summary) {
      res.status(502).json({ error: 'Gemini returned an empty summary.' })
      return
    }

    res.json({ summary })
  } catch (error) {
    res.status(error.status ?? 500).json({
      error:
        error.status === 502
          ? 'Gemini summarization failed.'
          : error instanceof Error ? error.message : 'Could not summarize conversation.',
      detail: error.status === 502 && error instanceof Error ? error.message : undefined,
    })
  }
})

app.use(express.static(distPath))

app.get('/{*path}', (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'))
})

app.listen(port, () => {
  console.log(`DementAI API listening on http://localhost:${port}`)
})
