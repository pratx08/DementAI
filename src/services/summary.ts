type SummaryResult = {
  summary_text?: string
  generated_text?: string
}

export const DEFAULT_SUMMARY =
  'Conversation summary will appear here after the next visit.'

export function isPlaceholderSummary(text: string): boolean {
  const normalized = text.replace(/\s+/g, ' ').trim().toLowerCase()

  return (
    !normalized ||
    normalized === DEFAULT_SUMMARY.toLowerCase() ||
    normalized === 'no conversation summary yet. add one after the next visit.' ||
    normalized.startsWith('no conversation summary yet')
  )
}

let summarizerPromise: Promise<
  ((input: string, options?: Record<string, unknown>) => Promise<SummaryResult[]>) | null
> | null = null

function normalizeSummary(text: string) {
  const cleaned = text.replace(/\s+/g, ' ').trim()

  if (!cleaned) {
    return DEFAULT_SUMMARY
  }

  return cleaned.endsWith('.') ? cleaned : `${cleaned}.`
}

function toSentenceCase(text: string) {
  const trimmed = text.trim()

  if (!trimmed) {
    return ''
  }

  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1)
}

function fallbackSummary(transcript: string) {
  const cleanTranscript = transcript.replace(/\s+/g, ' ').trim()

  if (!cleanTranscript) {
    return DEFAULT_SUMMARY
  }

  const sentences = cleanTranscript
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)

  if (sentences.length === 0) {
    return normalizeSummary(toSentenceCase(cleanTranscript.slice(0, 180)))
  }

  const meaningful = sentences.slice(0, 2).join(' ')
  return normalizeSummary(toSentenceCase(meaningful))
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

export function warmConversationSummarizer() {
  void getSummarizer()
}

export async function summarizeConversation(transcript: string) {
  const cleanTranscript = transcript.replace(/\s+/g, ' ').trim()

  if (!cleanTranscript) {
    return DEFAULT_SUMMARY
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
      max_length: 60,
      min_length: 18,
      do_sample: false,
    })
    const text = result[0]?.summary_text || result[0]?.generated_text || ''

    return normalizeSummary(text)
  } catch {
    return fallbackSummary(cleanTranscript)
  }
}
