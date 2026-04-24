import Human from '@vladmandic/human'
import type { Config, Input } from '@vladmandic/human'
import { appConfig } from '../config/appConfig'
import { apiDelete, apiGet, apiPut } from './apiClient'

export const knownPeopleUpdatedEvent = 'dementai-known-people-updated'

export type KnownPersonProfile = {
  id: string
  name: string
  relation: string
  group: string
  lastConversationSummary: string
  imageDataUrl?: string
  phone?: string
  notes?: string
  expectedVisitDays?: string[]
  lastVisitAt?: string
  visitsThisMonth?: number
  lastTranscript?: string
  descriptors: number[][]
}

export type RecognitionResult = {
  profile: KnownPersonProfile
  distance: number
  similarity: number
}


const humanConfig: Partial<Config> = {
  backend: 'webgl',
  async: true,
  warmup: 'none',
  modelBasePath: appConfig.recognition.humanModelPath,
  cacheSensitivity: 0,
  filter: {
    enabled: true,
    equalization: true,
  },
  face: {
    enabled: true,
    detector: {
      rotation: true,
      maxDetected: 1,
      // Raised from 0.45 — only process clearly detected faces.
      minConfidence: 0.62,
      minSize: 80,
      skipFrames: 0,
      skipTime: 0,
    },
    mesh: {
      enabled: false,
    },
    iris: {
      enabled: false,
    },
    emotion: {
      enabled: false,
    },
    description: {
      enabled: true,
      // Raised from 0.35 — only generate embeddings for high-quality faces.
      minConfidence: 0.50,
      skipFrames: 0,
      skipTime: 0,
    },
  },
  body: {
    enabled: false,
  },
  hand: {
    enabled: false,
  },
  object: {
    enabled: false,
  },
  gesture: {
    enabled: false,
  },
  segmentation: {
    enabled: false,
  },
}

let humanPromise: Promise<Human> | null = null

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    const objectUrl = URL.createObjectURL(file)

    image.onload = () => {
      URL.revokeObjectURL(objectUrl)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('Image could not be read.'))
    }
    image.src = objectUrl
  })
}

async function getHuman() {
  humanPromise ??= (async () => {
    const human = new Human(humanConfig)
    await human.load()
    return human
  })()

  return humanPromise
}

export async function loadFaceModels() {
  await getHuman()
}

export async function loadKnownPeople(): Promise<KnownPersonProfile[]> {
  try {
    const data = await apiGet<{ people: KnownPersonProfile[] }>('/people')
    const people = Array.isArray(data.people) ? data.people : []
    localStorage.setItem(
      appConfig.recognition.peopleStorageKey,
      JSON.stringify(people),
    )
    return people
  } catch {
    const storedPeople = localStorage.getItem(appConfig.recognition.peopleStorageKey)

    if (storedPeople) {
      return JSON.parse(storedPeople)
    }
  }

  return []
}

export function saveKnownPeople(people: KnownPersonProfile[]) {
  localStorage.setItem(
    appConfig.recognition.peopleStorageKey,
    JSON.stringify(people),
  )

  apiPut('/people', { people }).catch(() => undefined)
  window.dispatchEvent(new CustomEvent(knownPeopleUpdatedEvent))
}

export function clearKnownPeople() {
  localStorage.removeItem(appConfig.recognition.peopleStorageKey)
  apiDelete('/people').catch(() => undefined)
  window.dispatchEvent(new CustomEvent(knownPeopleUpdatedEvent))
}

async function createDescriptorFromInput(input: Input) {
  const human = await getHuman()
  const result = await human.detect(input)
  const face = [...result.face]
    .filter((item) => item.embedding && item.embedding.length > 0)
    .sort((left, right) => right.score - left.score)[0]

  if (!face?.embedding) {
    return null
  }

  return face.embedding
}

export async function createDescriptorFromImage(file: File) {
  const image = await loadImage(file)
  const descriptor = await createDescriptorFromInput(image)

  if (!descriptor) {
    throw new Error('No clear face was found in the selected image.')
  }

  return descriptor
}


export async function identifyFace(
  video: HTMLVideoElement,
  people: KnownPersonProfile[],
): Promise<RecognitionResult | null> {
  if (people.every((p) => p.descriptors.length === 0)) {
    return null
  }

  const descriptor = await createDescriptorFromInput(video)

  if (!descriptor) {
    return null
  }

  const human = await getHuman()

  // Score each person by their best-matching descriptor separately.
  // A flat global match lets one person's outlier descriptor "steal" a win
  // from another person — per-person scoring prevents cross-person bleed.
  const personScores = people.map((person) => {
    if (person.descriptors.length === 0) return { person, similarity: 0, distance: 1 }
    const match = human.match.find(descriptor, person.descriptors)
    return { person, similarity: match.similarity, distance: match.distance }
  })

  personScores.sort((a, b) => b.similarity - a.similarity)

  const best = personScores[0]
  if (!best || best.similarity < appConfig.recognition.matchSimilarityThreshold) {
    return null
  }

  // Require the winner to beat the runner-up by a meaningful margin.
  // Without this, ambiguous faces that score 0.76 vs 0.74 get accepted.
  const second = personScores[1]
  if (
    second &&
    (best.similarity - second.similarity) < appConfig.recognition.matchGapThreshold
  ) {
    return null
  }

  return {
    profile: best.person,
    distance: best.distance,
    similarity: best.similarity,
  }
}
