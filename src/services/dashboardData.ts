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
  scheduleLabel: string
  message: string
  priority: 'Low' | 'Medium' | 'High'
  status: 'On time' | 'Delayed' | 'Missed'
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

function createEmptyState(): DashboardState {
  return {
    dailyLog: [],
    unknownQueue: [],
    visitorSchedule: [],
    reminders: [],
    cognitiveObservations: [],
    safeZone: {
      radiusMeters: 450,
      trustedLocations: [],
      exitHistory: [],
    },
    sosAlerts: [],
  }
}

function getStoredDashboardStateSync() {
  const stored = localStorage.getItem(appConfig.recognition.dashboardStorageKey)

  if (stored) {
    return JSON.parse(stored) as DashboardState
  }

  const empty = createEmptyState()
  localStorage.setItem(
    appConfig.recognition.dashboardStorageKey,
    JSON.stringify(empty),
  )
  return empty
}

export async function loadDashboardState(_people: KnownPersonProfile[]) {
  try {
    const data = await apiGet<{ dashboard: DashboardState | null }>('/dashboard')

    if (data.dashboard) {
      localStorage.setItem(
        appConfig.recognition.dashboardStorageKey,
        JSON.stringify(data.dashboard),
      )
      return data.dashboard
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
