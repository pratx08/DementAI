import { apiPost } from './apiClient'

export const DEFAULT_SUMMARY =
  'Conversation summary will appear here after the next visit.'

const MAX_SUMMARY_CHARS = 680
const MIN_USEFUL_SUMMARY_WORDS = 18
const TRIVIAL_WORDS = new Set([
  'no',
  'yes',
  'yeah',
  'ok',
  'okay',
  'hi',
  'hello',
  'hey',
  'um',
  'uh',
])

export function isPlaceholderSummary(text: string): boolean {
  const normalized = text.replace(/\s+/g, ' ').trim().toLowerCase()

  return (
    !normalized ||
    normalized === DEFAULT_SUMMARY.toLowerCase() ||
    normalized === 'no conversation summary yet. add one after the next visit.' ||
    normalized.startsWith('no conversation summary yet')
  )
}

function normalizeText(text: string) {
  return text
    .replace(/\b(hi|hello|hey|good morning|good afternoon|good evening|okay|ok|yeah|yes|well|please)\b/gi, ' ')
    .replace(/\b(you know|i mean|like|basically|actually)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.!?])/g, '$1')
    .replace(/^[,.\s]+|[,.\s]+$/g, '')
    .trim()
}

export function hasSummarizableContent(text: string) {
  const words = normalizeText(text)
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .filter((word) => !TRIVIAL_WORDS.has(word))

  return words.length >= 5
}

function sentenceCase(text: string) {
  const trimmed = text.trim()
  return trimmed ? trimmed.charAt(0).toUpperCase() + trimmed.slice(1) : ''
}

function finishSentence(text: string) {
  const cleaned = text.replace(/\s+/g, ' ').trim()

  if (!cleaned) {
    return DEFAULT_SUMMARY
  }

  return cleaned.endsWith('.') ? cleaned : `${cleaned}.`
}

function wordCount(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length
}

function firstMeaningfulSentence(text: string) {
  const cleaned = normalizeText(text)

  return cleaned
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .find((sentence) => wordCount(sentence) >= 5) ?? cleaned
}

function extractSpeaker(text: string) {
  const match = text.match(/\b(?:it'?s|it is|this is)\s+me,?\s+([a-z][a-z'-]+)/i)
  return match ? sentenceCase(match[1]) : ''
}

function getTime(text: string) {
  return text.match(/\b\d{1,2}(:\d{2})?\s*(am|pm)\b/i)?.[0]?.toUpperCase()
}

function getDay(text: string) {
  return text.match(
    /\b(today|tomorrow|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
  )?.[0]?.toLowerCase()
}

function getMedicineNote(text: string) {
  if (!/\b(medicine|medication|tablet|pill|dose)\b/i.test(text)) {
    return ''
  }

  const time = getTime(text)
  const color = text.match(/\b(blue|red|white|yellow|green|pink)\s+(tablet|pill)\b/i)?.[0]
  const medicine = color ?? text.match(/\b(evening|morning|night)\s+(medicine|medication|tablet|pill)\b/i)?.[0]

  if (time && medicine) {
    return `Medication was discussed, including taking the ${medicine.toLowerCase()} at ${time}`
  }

  if (time) {
    return `Medication was discussed, with the next dose due at ${time}`
  }

  return 'Medication or care instructions were discussed during the conversation'
}

function getVisitNote(text: string, speaker: string) {
  const day = getDay(text)
  const time = getTime(text)
  const actor = speaker || 'Visitor'

  if (/\b(walk|garden)\b/i.test(text)) {
    const when = [day, time].filter(Boolean).join(' at ')
    return when
      ? `${actor} said they will come ${when} for a short walk`
      : `${actor} discussed taking the patient for a short walk`
  }

  if (/\b(clinic|doctor|checkup|appointment|hospital)\b/i.test(text)) {
    const when = [day, time].filter(Boolean).join(' at ')
    return when
      ? `${actor} said they will take the patient to the appointment ${when}`
      : `${actor} discussed an upcoming medical appointment with the patient`
  }

  if (/\b(visit|come|meet|call)\b/i.test(text)) {
    const when = [day, time].filter(Boolean).join(' at ')
    return when
      ? `${actor} said they plan to visit ${when}`
      : `${actor} discussed a follow-up visit with the patient`
  }

  return ''
}

function getWellbeingNote(text: string) {
  if (/\b(beautiful|nice|lovely|fresh air|trees?|flowers?|outside|park)\b/i.test(text)) {
    return 'The conversation included a positive outdoor memory, with details about trees, flowers, and fresh air'
  }

  if (/\b(feeling|felt)\s+better\b/i.test(text)) {
    return 'The patient seemed to be feeling better during the conversation'
  }

  if (/\b(water|bottle)\b/i.test(text)) {
    return 'A water bottle or drink was left nearby for the patient'
  }

  if (/\b(photo|album|family photos)\b/i.test(text)) {
    return 'They looked at family photos together, which may help reassure the patient'
  }

  return ''
}

function getQuestionNote(text: string) {
  if (/\b(weather|temperature|rain|sunny|forecast)\b/i.test(text)) {
    const day = getDay(text)
    const time = getTime(text)
    const when = [day, time].filter(Boolean).join(' at ')

    return when
      ? `They discussed the weather ${when}`
      : 'They discussed the weather forecast'
  }

  if (/\b(where|what|when|who|why|how)\b/i.test(text)) {
    return `They asked about ${text.replace(/[?]+$/g, '').trim()}`
  }

  return ''
}

function dedupe(notes: string[]) {
  const seen = new Set<string>()
  return notes.filter((note) => {
    const key = note.toLowerCase()

    if (!note || seen.has(key)) {
      return false
    }

    seen.add(key)
    return true
  })
}

function trimSummary(text: string) {
  if (text.length <= MAX_SUMMARY_CHARS) {
    return text
  }

  const clipped = text.slice(0, MAX_SUMMARY_CHARS)
  const lastBreak = Math.max(clipped.lastIndexOf('.'), clipped.lastIndexOf(';'))

  return lastBreak > 80 ? clipped.slice(0, lastBreak + 1) : `${clipped.trim()}...`
}

function lightweightSummary(transcript: string) {
  const cleaned = normalizeText(transcript)

  if (!cleaned) {
    return DEFAULT_SUMMARY
  }

  const speaker = extractSpeaker(cleaned)
  const meaningfulSentence = firstMeaningfulSentence(cleaned)
  const notes = dedupe([
    getMedicineNote(cleaned),
    getVisitNote(cleaned, speaker),
    getWellbeingNote(cleaned),
    getQuestionNote(cleaned),
  ]).slice(0, 3)

  if (notes.length > 0) {
    const detailSentence = finishSentence(notes.join('; '))
    const transcriptDetail = sentenceCase(meaningfulSentence.replace(/[?]+$/g, '').trim())
    const hasQuestionSummary = Boolean(getQuestionNote(cleaned))

    return finishSentence(trimSummary(
      transcriptDetail && !hasQuestionSummary && transcriptDetail.toLowerCase() !== detailSentence.toLowerCase()
        ? `${detailSentence} ${transcriptDetail}.`
        : detailSentence,
    ))
  }

  const compact = sentenceCase(meaningfulSentence
    .replace(/\b(?:it'?s|it is|this is)\s+me,?\s+[a-z][a-z'-]+\.?/i, '')
    .replace(/\byou\b/gi, 'the patient')
    .slice(0, 360))

  return finishSentence(trimSummary(compact))
}

export function warmConversationSummarizer() {
  // Local heuristic summarizer has no model to load.
}

export async function summarizeConversation(transcript: string) {
  if (!hasSummarizableContent(transcript)) {
    return ''
  }

  try {
    const response = await apiPost<{ summary: string }>('/summarize', {
      transcript,
    })
    const summary = response.summary?.trim()

    if (summary && wordCount(summary) >= MIN_USEFUL_SUMMARY_WORDS) {
      return finishSentence(trimSummary(summary))
    }
  } catch {
    // Fall back to the local summarizer when the backend or Gemini is unavailable.
  }

  return lightweightSummary(transcript)
}
