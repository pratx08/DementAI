type SummaryResult = {
  summary_text?: string
  generated_text?: string
}

const STOP_WORDS = new Set([
  'i', 'the', 'a', 'an', 'and', 'or', 'but', 'is', 'was', 'are', 'were',
  'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
  'could', 'should', 'may', 'might', 'can', 'to', 'of', 'in', 'for', 'on',
  'with', 'at', 'by', 'from', 'this', 'that', 'it', 'its', 'we', 'you',
  'he', 'she', 'they', 'me', 'him', 'her', 'us', 'them', 'my', 'your',
  'his', 'our', 'their', 'not', 'no', 'so', 'if', 'as', 'up', 'out',
  'about', 'what', 'which', 'who', 'when', 'where', 'how', 'all', 'any',
  'just', 'more', 'also', 'then', 'than', 'into', 'over', 'after',
])

// Pure social/greeting words — carry no card-worthy information
const SOCIAL_WORDS = new Set([
  'hello', 'hi', 'hey', 'bye', 'goodbye', 'goodnight', 'goodmorning',
  'nice', 'great', 'good', 'fine', 'okay', 'ok', 'thanks', 'thank', 'please',
  'sorry', 'welcome', 'sure', 'yeah', 'yes', 'nope', 'wow', 'oh', 'ah',
  'well', 'right', 'really', 'very', 'much', 'lot', 'bit', 'thing',
])

// Patterns that signal genuinely important information worth keeping on the card
const HIGH_VALUE_PATTERNS: RegExp[] = [
  /\b(tomorrow|today|tonight|yesterday|next week|this week|last week)\b/i,
  /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
  /\b(january|february|march|april|june|july|august|september|october|november|december)\b/i,
  /\b\d{1,2}(:\d{2})?\s*(am|pm)\b/i,
  /\b(appointment|meeting|doctor|hospital|clinic|pharmacy|medicine|medication|pill|tablet|dose)\b/i,
  /\b(call|visit|come|bring|pick|drop|remind|remember)\b/i,
  /\b\d{1,2}\/\d{1,2}\b/,
]

export function hasHighValueContent(text: string): boolean {
  return HIGH_VALUE_PATTERNS.some((p) => p.test(text))
}

export function importanceScore(text: string): number {
  if (!text.trim()) return 0

  const lower = text.toLowerCase()

  // Each high-value pattern match is a strong signal
  const patternBonus = HIGH_VALUE_PATTERNS.filter((p) => p.test(lower)).length * 6

  // Count meaningful non-social, non-stop unique words
  const words = lower
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w) && !SOCIAL_WORDS.has(w))
  const uniqueWords = new Set(words).size

  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0).length

  return uniqueWords * 3 + sentences * 2 + patternBonus
}

let summarizerPromise: Promise<
  ((input: string, options?: Record<string, unknown>) => Promise<SummaryResult[]>) | null
> | null = null

function normalizeSummary(text: string) {
  const cleaned = text.replace(/\s+/g, ' ').trim()

  if (!cleaned) {
    return 'Conversation summary will appear here after the next visit.'
  }

  return cleaned.endsWith('.') ? cleaned : `${cleaned}.`
}

function fallbackSummary(transcript: string) {
  const sentences = transcript
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)

  if (sentences.length === 0) {
    return normalizeSummary(transcript.slice(0, 140))
  }

  if (sentences.length === 1) {
    return normalizeSummary(sentences[0])
  }

  return normalizeSummary(`${sentences[0]} ${sentences[Math.min(1, sentences.length - 1)]}`)
}

async function getSummarizer() {
  summarizerPromise ??= (async () => {
    try {
      const transformers = await import('@xenova/transformers')
      const summarizer = await transformers.pipeline(
        'summarization',
        'Xenova/distilbart-cnn-6-6',
      )

      return summarizer as (
        input: string,
        options?: Record<string, unknown>,
      ) => Promise<SummaryResult[]>
    } catch {
      return null
    }
  })()

  return summarizerPromise
}

export async function summarizeConversation(transcript: string) {
  const cleanTranscript = transcript.replace(/\s+/g, ' ').trim()

  if (!cleanTranscript) {
    return 'Conversation summary will appear here after the next visit.'
  }

  if (cleanTranscript.length < 90) {
    return fallbackSummary(cleanTranscript)
  }

  const summarizer = await getSummarizer()

  if (!summarizer) {
    return fallbackSummary(cleanTranscript)
  }

  try {
    const result = await summarizer(cleanTranscript, {
      max_length: 50,
      min_length: 16,
      do_sample: false,
    })
    const text = result[0]?.summary_text || result[0]?.generated_text || ''

    return normalizeSummary(text)
  } catch {
    return fallbackSummary(cleanTranscript)
  }
}

