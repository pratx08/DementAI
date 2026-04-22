import Human from '@vladmandic/human'
import type { Config, Input } from '@vladmandic/human'
import { appConfig } from '../config/appConfig'

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

type DescriptorMatch = {
  person: KnownPersonProfile
  descriptor: number[]
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
      minConfidence: 0.45,
      minSize: 80,
      skipFrames: 0,
      skipTime: 0,
    },
    mesh: {
      enabled: true,
    },
    iris: {
      enabled: false,
    },
    emotion: {
      enabled: false,
    },
    description: {
      enabled: true,
      minConfidence: 0.35,
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
  const storedPeople = localStorage.getItem(appConfig.recognition.peopleStorageKey)

  if (storedPeople) {
    return JSON.parse(storedPeople)
  }

  return []
}

export function saveKnownPeople(people: KnownPersonProfile[]) {
  localStorage.setItem(
    appConfig.recognition.peopleStorageKey,
    JSON.stringify(people),
  )

  window.dispatchEvent(new CustomEvent(knownPeopleUpdatedEvent))
}

export function clearKnownPeople() {
  saveKnownPeople([])
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

function flattenDescriptors(people: KnownPersonProfile[]) {
  return people.flatMap((person) =>
    person.descriptors.map((descriptor) => ({
      person,
      descriptor,
    })),
  )
}

export async function identifyFace(
  video: HTMLVideoElement,
  people: KnownPersonProfile[],
): Promise<RecognitionResult | null> {
  const knownDescriptors = flattenDescriptors(people)

  if (knownDescriptors.length === 0) {
    return null
  }

  const descriptor = await createDescriptorFromInput(video)

  if (!descriptor) {
    return null
  }

  const human = await getHuman()
  const matches = knownDescriptors.map((item) => item.descriptor)
  const bestMatch = human.match.find(descriptor, matches)

  if (
    bestMatch.index < 0 ||
    bestMatch.similarity < appConfig.recognition.matchSimilarityThreshold
  ) {
    return null
  }

  const match = knownDescriptors[bestMatch.index] as DescriptorMatch

  return {
    profile: match.person,
    distance: bestMatch.distance,
    similarity: bestMatch.similarity,
  }
}
