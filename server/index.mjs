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
app.use(express.json({ limit: '5mb' }))

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

app.use(express.static(distPath))

app.get('/{*path}', (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'))
})

app.listen(port, () => {
  console.log(`DementAI API listening on http://localhost:${port}`)
})
