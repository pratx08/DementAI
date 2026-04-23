import { appConfig } from '../config/appConfig'
import type { KnownPersonProfile } from './faceRecognition'
import { apiGet, apiPut } from './apiClient'

export type LogEntryType = 'encounter' | 'sos' | 'reminder' | 'note'

export type DailyLogEntry = {
  id: string
  type: LogEntryType
  title: string
  personId?: string
  relationship?: string
  occurredAt: string
  durationMinutes?: number
  sentiment?: 'Positive' | 'Neutral' | 'Confused'
  summary: string
  transcript?: string
  location?: string
  status?: string
}

export type UnknownQueueItem = {
  id: string
  flaggedAt: string
  heardName: string
  snippet: string
  emotionalState: string
  status: 'pending' | 'follow-up' | 'dismissed'
}

export type VisitorScheduleItem = {
  id: string
  personId: string
  visitDate: string
  status: 'Scheduled' | 'Visited' | 'Missed'
  context: string
}

export type ReminderItem = {
  id: string
  title: string
  category: 'Medication' | 'Hydration' | 'Exercise' | 'Call' | 'Other'
  message: string
  priority: 'Low' | 'Medium' | 'High'
  /** ISO string for the first (or next) occurrence */
  datetime: string
  recurring: 'none' | 'daily' | 'weekdays' | 'weekly'
  /** Day-of-week indices (0=Sun … 6=Sat) used when recurring === 'weekly' */
  recurringDays?: number[]
  status: 'Active' | 'Acknowledged' | 'Missed'
  lastFiredAt?: string
  // legacy display label kept for compatibility
  scheduleLabel: string
}

export type CognitiveObservation = {
  id: string
  date: string
  title: string
  source: 'AI' | 'Caretaker'
  severity: 'Low' | 'Medium' | 'High'
  actionTaken: string
}

export type SafeZoneSettings = {
  homeAddress: string
  radiusMeters: number
  trustedLocations: string[]
  exitHistory: {
    id: string
    time: string
    location: string
    durationMinutes: number
  }[]
}

export type SosAlert = {
  id: string
  time: string
  trigger: 'Button pressed' | 'Auto-detected distress'
  location: string
  latitude?: number
  longitude?: number
  transcript: string
  status: 'Open' | 'Resolved'
  note: string
}

export type DashboardState = {
  dailyLog: DailyLogEntry[]
  unknownQueue: UnknownQueueItem[]
  visitorSchedule: VisitorScheduleItem[]
  reminders: ReminderItem[]
  cognitiveObservations: CognitiveObservation[]
  safeZone: SafeZoneSettings
  sosAlerts: SosAlert[]
}

function daysAgo(n: number) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString()
}

function createEmptyState(): DashboardState {
  return {
    dailyLog: [],
    unknownQueue: [
      {
        id: 'uq-seed-1',
        flaggedAt: daysAgo(2),
        heardName: 'Man in blue jacket',
        snippet: 'Patient said: "I\'ve seen him before but I can\'t remember his name. He keeps coming to the door."',
        emotionalState: 'Confused',
        status: 'pending',
      },
      {
        id: 'uq-seed-2',
        flaggedAt: daysAgo(0),
        heardName: 'Older woman at door',
        snippet: 'Patient said: "She keeps asking for someone called Robert. I don\'t know who she is."',
        emotionalState: 'Anxious',
        status: 'follow-up',
      },
    ],
    visitorSchedule: [],
    reminders: [],
    cognitiveObservations: [
      {
        id: 'obs-seed-1',
        date: daysAgo(1),
        title: 'Word-finding difficulty during afternoon conversation',
        source: 'AI',
        severity: 'Medium',
        actionTaken: 'Redirected conversation; patient remained calm after a brief pause.',
      },
      {
        id: 'obs-seed-2',
        date: daysAgo(2),
        title: 'Repeated the same question three times in under five minutes',
        source: 'AI',
        severity: 'High',
        actionTaken: 'Logged for physician review at next appointment. Caretaker notified.',
      },
      {
        id: 'obs-seed-3',
        date: daysAgo(3),
        title: 'Successfully identified daughter from recent photographs',
        source: 'Caretaker',
        severity: 'Low',
        actionTaken: 'No action needed. Positive engagement noted for report.',
      },
      {
        id: 'obs-seed-4',
        date: daysAgo(4),
        title: 'Mild disorientation upon waking from afternoon nap',
        source: 'Caretaker',
        severity: 'Medium',
        actionTaken: 'Oriented patient with familiar objects and calm reassurance. Resolved in ~8 minutes.',
      },
      {
        id: 'obs-seed-5',
        date: daysAgo(6),
        title: 'Unable to recall breakfast menu despite prompting',
        source: 'AI',
        severity: 'Medium',
        actionTaken: 'Noted as part of short-term memory tracking. Pattern consistent with prior week.',
      },
    ],
    safeZone: {
      homeAddress: '',
      radiusMeters: 450,
      trustedLocations: [],
      exitHistory: [],
    },
    sosAlerts: [
      {
        id: 'sos-seed-1',
        time: daysAgo(3),
        trigger: 'Button pressed',
        location: 'Living Room — Clark House',
        latitude: 42.2511,
        longitude: -71.8235,
        transcript: '"I don\'t recognise anyone here. Please help me."',
        status: 'Resolved',
        note: 'Caretaker arrived within 10 minutes. Patient calmed after recognising familiar caretaker voice.',
      },
      {
        id: 'sos-seed-2',
        time: daysAgo(7),
        trigger: 'Auto-detected distress',
        location: 'Front Garden — Clark House',
        latitude: 42.2514,
        longitude: -71.8238,
        transcript: '"Where am I? I want to go home. This doesn\'t look right."',
        status: 'Open',
        note: '',
      },
    ],
  }
}

const SEED_IDS = {
  cognitiveObservations: ['obs-seed-1', 'obs-seed-2', 'obs-seed-3', 'obs-seed-4', 'obs-seed-5'],
  sosAlerts: ['sos-seed-1', 'sos-seed-2'],
  unknownQueue: ['uq-seed-1', 'uq-seed-2'],
}

/**
 * Merges seed demo items into any dashboard state (local or from API)
 * so demo data always appears regardless of which source wins.
 */
function applySeeds(state: DashboardState): DashboardState {
  const seed = createEmptyState()

  // Back-fill homeAddress for states that pre-date the field
  if (!('homeAddress' in state.safeZone)) {
    (state.safeZone as SafeZoneSettings).homeAddress = ''
  }

  const hasSeedObs = state.cognitiveObservations.some((o) =>
    SEED_IDS.cognitiveObservations.includes(o.id),
  )
  if (!hasSeedObs) {
    state.cognitiveObservations = [
      ...seed.cognitiveObservations,
      ...state.cognitiveObservations,
    ]
  }

  const hasSeedSos = state.sosAlerts.some((a) => SEED_IDS.sosAlerts.includes(a.id))
  if (!hasSeedSos) {
    state.sosAlerts = [...seed.sosAlerts, ...state.sosAlerts]
  }

  const hasSeedQueue = state.unknownQueue.some((q) =>
    SEED_IDS.unknownQueue.includes(q.id),
  )
  if (!hasSeedQueue) {
    state.unknownQueue = [...seed.unknownQueue, ...state.unknownQueue]
  }

  return state
}

function getStoredDashboardStateSync() {
  const stored = localStorage.getItem(appConfig.recognition.dashboardStorageKey)

  if (stored) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parsed: any = JSON.parse(stored)
    const state = applySeeds(parsed as DashboardState)
    localStorage.setItem(appConfig.recognition.dashboardStorageKey, JSON.stringify(state))
    return state
  }

  const fresh = createEmptyState()
  localStorage.setItem(appConfig.recognition.dashboardStorageKey, JSON.stringify(fresh))
  return fresh
}

/** Synchronous read from localStorage — safe to call as a useState lazy initializer. */
export function getLocalDashboardState(): DashboardState {
  return getStoredDashboardStateSync()
}

export async function loadDashboardState(_people: KnownPersonProfile[]) {
  try {
    const data = await apiGet<{ dashboard: DashboardState | null }>('/dashboard')

    if (data.dashboard) {
      // Always apply seeds to the API response — otherwise old backend data
      // overwrites the seed items that were already merged into localStorage.
      const merged = applySeeds(data.dashboard)
      localStorage.setItem(
        appConfig.recognition.dashboardStorageKey,
        JSON.stringify(merged),
      )
      // Push the merged (seeded) version back to the API so it stays in sync
      apiPut('/dashboard', { dashboard: merged }).catch(() => undefined)
      return merged
    }
  } catch {
    // Fall back to local storage below.
  }

  return getStoredDashboardStateSync()
}

export function saveDashboardState(state: DashboardState) {
  localStorage.setItem(
    appConfig.recognition.dashboardStorageKey,
    JSON.stringify(state),
  )

  apiPut('/dashboard', { dashboard: state }).catch(() => undefined)
}

export function updateStoredDashboardState(
  updater: (current: DashboardState) => DashboardState,
) {
  const current = getStoredDashboardStateSync()
  const next = updater(current)
  saveDashboardState(next)
  return next
}
