import { appConfig } from '../config/appConfig'
import type { KnownPersonProfile } from './faceRecognition'

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

function createId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`
}

function todayAt(hoursAgo: number) {
  return new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString()
}

function seedState(people: KnownPersonProfile[]): DashboardState {
  const [first, second] = people

  return {
    dailyLog: [
      {
        id: createId('log'),
        type: 'encounter',
        title: first?.name ?? 'Morning visitor',
        personId: first?.id,
        relationship: first?.relation ?? 'Family',
        occurredAt: todayAt(2),
        durationMinutes: 18,
        sentiment: 'Positive',
        summary:
          first?.lastConversationSummary ??
          'Reviewed lunch plans and confirmed the evening medication reminder.',
        transcript:
          first?.lastTranscript ??
          'We talked about lunch, your medication after dinner, and Sarah visiting tomorrow.',
        location: 'Living room',
      },
      {
        id: createId('log'),
        type: 'reminder',
        title: 'Medication reminder',
        occurredAt: todayAt(4),
        summary: 'Blood pressure reminder delivered and acknowledged after 3 minutes.',
        status: 'Acknowledged',
      },
      {
        id: createId('log'),
        type: 'note',
        title: 'Caretaker note',
        occurredAt: todayAt(6),
        summary: 'Patient seemed calmer after the morning walk and followed directions well.',
      },
    ],
    unknownQueue: [
      {
        id: createId('unknown'),
        flaggedAt: todayAt(3),
        heardName: 'Maybe Alex',
        snippet: 'They mentioned the pharmacy delivery and a package at the door.',
        emotionalState: 'Curious',
        status: 'pending',
      },
      {
        id: createId('unknown'),
        flaggedAt: todayAt(28),
        heardName: 'No clear name',
        snippet: 'Short conversation about a maintenance check in the hallway.',
        emotionalState: 'Neutral',
        status: 'follow-up',
      },
    ],
    visitorSchedule: [
      {
        id: createId('visit'),
        personId: first?.id ?? second?.id ?? 'unassigned',
        visitDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        status: 'Scheduled',
        context: 'Bring the updated family photo and ask about the weekend call.',
      },
      {
        id: createId('visit'),
        personId: second?.id ?? first?.id ?? 'unassigned',
        visitDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'Scheduled',
        context: 'Review refill schedule and hydration reminder.',
      },
    ],
    reminders: [
      {
        id: createId('reminder'),
        title: 'Blood pressure tablet',
        category: 'Medication',
        scheduleLabel: 'Daily, 8:00 PM',
        message: 'Time for your blood pressure tablet. It is in the kitchen cabinet.',
        priority: 'High',
        status: 'On time',
      },
      {
        id: createId('reminder'),
        title: 'Water break',
        category: 'Hydration',
        scheduleLabel: 'Daily, 2:00 PM',
        message: 'Please drink a glass of water before resting.',
        priority: 'Medium',
        status: 'Delayed',
      },
    ],
    cognitiveObservations: [
      {
        id: createId('obs'),
        date: new Date().toISOString(),
        title: 'Mild repetition in afternoon conversation',
        source: 'AI',
        severity: 'Medium',
        actionTaken: 'Track over the next week and compare with visitor notes.',
      },
      {
        id: createId('obs'),
        date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
        title: 'Strong recall during family visit',
        source: 'Caretaker',
        severity: 'Low',
        actionTaken: 'Keep family-photo cue card routine.',
      },
    ],
    safeZone: {
      radiusMeters: 450,
      trustedLocations: ['Neighborhood park', 'Main Street pharmacy'],
      exitHistory: [
        {
          id: createId('exit'),
          time: todayAt(52),
          location: 'Main Street pharmacy',
          durationMinutes: 22,
        },
      ],
    },
    sosAlerts: [
      {
        id: createId('sos'),
        time: todayAt(40),
        trigger: 'Button pressed',
        location: 'Front porch',
        transcript: 'I need help. I am outside and not sure which way to go back in.',
        status: 'Resolved',
        note: 'Neighbor escorted patient inside and caregiver called immediately after.',
      },
    ],
  }
}

export function loadDashboardState(people: KnownPersonProfile[]) {
  const stored = localStorage.getItem(appConfig.recognition.dashboardStorageKey)

  if (stored) {
    return JSON.parse(stored) as DashboardState
  }

  const seeded = seedState(people)
  saveDashboardState(seeded)
  return seeded
}

export function saveDashboardState(state: DashboardState) {
  localStorage.setItem(
    appConfig.recognition.dashboardStorageKey,
    JSON.stringify(state),
  )
}

