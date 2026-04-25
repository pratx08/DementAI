export const DEFAULT_SUMMARY =
  'Conversation summary will appear here after the next visit.'

const IMPORTANT_PATTERNS = [
  /\b(today|tomorrow|tonight|yesterday|morning|afternoon|evening|friday|monday|tuesday|wednesday|thursday|saturday|sunday)\b/i,
  /\b\d{1,2}(:\d{2})?\s*(am|pm)\b/i,
  /\b(medicine|medication|tablet|pill|doctor|clinic|checkup|appointment|walk|visit|call|water|photo|album|lunch|dinner|breakfast)\b/i,
  /\b(changed|planned|remember|brought|left|take|come|came|meet|met|feeling|better)\b/i,
]

const FILLER_PATTERNS = [
  /\b(hi|hello|hey|good morning|good afternoon|good evening|okay|ok|yeah|yes|well|so|actually|basically|please)\b/gi,
  /\b(you know|like|i mean|this is|that is|it is)\b/gi,
]

export function isPlaceholderSummary(text: string): boolean {
  const normalized = text.replace(/\s+/g, ' ').trim().toLowerCase()

  return (
    !normalized ||
    normalized === DEFAULT_SUMMARY.toLowerCase() ||
    normalized === 'no conversation summary yet. add one after the next visit.' ||
    normalized.startsWith('no conversation summary yet')
  )
}

function normalizeSummary(text: string) {
  const cleaned = text
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.!?])/g, '$1')
    .trim()

  if (!cleaned) {
    return DEFAULT_SUMMARY
  }

  return cleaned.endsWith('.') ? cleaned : `${cleaned}.`
}

function sentenceCase(text: string) {
  const trimmed = text.trim()

  if (!trimmed) {
    return ''
  }

  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1)
}

function cleanTranscript(text: string) {
  let cleaned = text.replace(/\s+/g, ' ').trim()

  for (const pattern of FILLER_PATTERNS) {
    cleaned = cleaned.replace(pattern, ' ')
  }

  return cleaned
    .replace(/\s+/g, ' ')
    .replace(/^[,.\s]+|[,.\s]+$/g, '')
    .trim()
}

function extractSpeaker(text: string) {
  const match = text.match(/\b(?:it's|it is|this is)\s+me,?\s+([a-z][a-z'-]+)/i)
  return match?.[1]
}

function splitConversation(text: string) {
  return text
    .split(/(?<=[.!?])\s+|\s+(?:and then|also|but|so)\s+/i)
    .map((part) => part.replace(/\s+/g, ' ').trim())
    .filter((part) => part.length > 6)
}

function scoreClause(text: string) {
  return IMPORTANT_PATTERNS.reduce(
    (score, pattern) => score + (pattern.test(text) ? 1 : 0),
    0,
  )
}

function rewritePerspective(text: string, speaker?: string) {
  let rewritten = text
    .replace(/\bit'?s me,?\s+[a-z][a-z'-]+\.?/i, '')
    .replace(/\byour\s+(son|daughter|friend|caregiver|doctor|nurse|wife|husband)\b/gi, 'the $1')
    .replace(/\byou told me\b/gi, 'the patient said')
    .replace(/\byou were\b/gi, 'the patient was')
    .replace(/\byou are\b/gi, 'the patient is')
    .replace(/\byou need to\b/gi, 'the patient should')
    .replace(/\byour\b/gi, 'the patient\'s')
    .replace(/\byou\b/gi, 'the patient')
    .replace(/\bwe\b/gi, 'they')
    .replace(/\s+/g, ' ')
    .trim()

  if (speaker) {
    const name = sentenceCase(speaker)
    rewritten = rewritten
      .replace(/\bi came\b/i, `${name} came`)
      .replace(/\bi brought\b/i, `${name} brought`)
      .replace(/\bi left\b/i, `${name} left`)
      .replace(/\bi'?ll come\b/i, `${name} will come`)
      .replace(/\bi will come\b/i, `${name} will come`)
      .replace(/\bi'?ll call\b/i, `${name} will call`)
      .replace(/\bi will call\b/i, `${name} will call`)
      .replace(/\bi am taking\b/i, `${name} is taking`)
      .replace(/\bi'm taking\b/i, `${name} is taking`)
  }

  return sentenceCase(rewritten)
}

function compressClause(text: string) {
  return text
    .replace(/\bafter work today\b/i, 'after work')
    .replace(/\baround\s+(\d{1,2})\b/i, 'around $1')
    .replace(/\bshort\s+walk\s+in\s+the\s+garden\b/i, 'short garden walk')
    .replace(/\s+/g, ' ')
    .trim()
}

function lightweightSummary(transcript: string) {
  const speaker = extractSpeaker(transcript)
  const cleaned = cleanTranscript(transcript)
  const clauses = splitConversation(cleaned)
  const ranked = clauses
    .map((clause, index) => ({
      clause,
      index,
      score: scoreClause(clause),
    }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, 3)
    .sort((left, right) => left.index - right.index)
    .map((item) => compressClause(rewritePerspective(item.clause, speaker)))
    .filter(Boolean)

  const unique = ranked.filter(
    (item, index, list) =>
      list.findIndex((other) => other.toLowerCase() === item.toLowerCase()) === index,
  )

  if (unique.length > 0) {
    return normalizeSummary(unique.join(' '))
  }

  const fallback = rewritePerspective(clauses[0] ?? cleaned.slice(0, 120), speaker)
  return normalizeSummary(fallback)
}

export function warmConversationSummarizer() {
  // Local heuristic summarizer has no model to load.
}

export async function summarizeConversation(transcript: string) {
  return lightweightSummary(transcript)
}
