import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Capacitor, type PluginListenerHandle } from '@capacitor/core'
import { SpeechRecognition as NativeSpeechRecognition } from '@capgo/capacitor-speech-recognition'
import WebSpeechRecognition, {
  useSpeechRecognition,
} from 'react-speech-recognition'
import {
  AlertTriangle,
  ArrowLeft,
  Flag,
  Mic,
  MicOff,
  Upload,
} from 'lucide-react'
import { appConfig } from './config/appConfig'
import { LandingPage } from './components/LandingPage'
import { OnboardingCards } from './components/OnboardingCards'
import { useCamera } from './hooks/useCamera'
import {
  clearKnownPeople,
  createDescriptorFromImage,
  identifyFace,
  knownPeopleUpdatedEvent,
  loadFaceModels,
  loadKnownPeople,
  saveKnownPeople,
  type KnownPersonProfile,
} from './services/faceRecognition'
import {
  getLocalDashboardState,
  loadDashboardState,
  saveDashboardState,
  updateStoredDashboardState,
  type DashboardState,
  type DailyLogEntry,
  type ReminderItem,
  type UnknownQueueItem,
} from './services/dashboardData'
import {
  DEFAULT_SUMMARY,
  hasSummarizableContent,
  isPlaceholderSummary,
  summarizeConversation,
  warmConversationSummarizer,
} from './services/summary'
import { transcribeAudio } from './services/transcription'
import { fetchStoredSummary, persistSummary } from './services/mongoService'
import type { CSSProperties, FormEvent } from 'react'
import type { FaceBox } from './services/mediaPipeFaceDetection'

type AppStage = 'landing' | 'onboarding' | 'app'
type UserRole = 'patient' | 'caretaker'
type FaceDetectionApi = typeof import('./services/mediaPipeFaceDetection')
type BrowserSpeechRecognitionResult = {
  transcript: string
}
type BrowserSpeechRecognitionEvent = {
  resultIndex: number
  results: ArrayLike<{
    isFinal: boolean
    [index: number]: BrowserSpeechRecognitionResult
  }>
}
type BrowserSpeechRecognition = {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
  start: () => void
  stop: () => void
}
type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition

declare global {
  interface Window {
    SpeechRecognition?: BrowserSpeechRecognitionConstructor
    webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor
  }
}

type FaceAnchor = {
  left: number
  top: number
}

type CaretakerTab =
  | 'daily-log'
  | 'unknown-queue'
  | 'visitor-schedule'
  | 'reminders'
  | 'safe-zone'
  | 'sos-alerts'
  | 'contacts'
  | 'cognitive-report'

const groupOptions = ['Family', 'Friends', 'Caregiver', 'Medical', 'Other']
const GEMINI_SPEECH_LEVEL_THRESHOLD = 0.018
const GEMINI_SPEECH_CHECK_MS = 150

function getPreferredAudioMimeType() {
  if (!('MediaRecorder' in window)) {
    return ''
  }

  return [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
  ].find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) ?? ''
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Image preview could not be read.'))
    reader.readAsDataURL(file)
  })
}

function getLiveCaption(interimTranscript: string, finalTranscript: string) {
  const liveSpeech = interimTranscript || finalTranscript
  const words = liveSpeech.trim().split(/\s+/).filter(Boolean)

  return words.slice(-10).join(' ')
}

function getBrowserSpeechRecognition() {
  return window.SpeechRecognition || window.webkitSpeechRecognition
}

async function requestMicPermission() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  stream.getTracks().forEach((track) => track.stop())
}

async function captureVideoFile(video: HTMLVideoElement, prefix: string) {
  if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
    throw new Error('Camera is not ready yet.')
  }

  const canvas = document.createElement('canvas')
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height)

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', 0.9),
  )

  if (!blob) {
    throw new Error('Could not capture the camera image.')
  }

  return new File([blob], `${prefix}-${Date.now()}.jpg`, {
    type: 'image/jpeg',
  })
}

function mapFaceBoxToFrame(
  box: FaceBox,
  video: HTMLVideoElement,
  frame: HTMLElement,
  isMirrored: boolean,
): FaceAnchor | null {
  const videoWidth = video.videoWidth
  const videoHeight = video.videoHeight

  if (!videoWidth || !videoHeight) {
    return null
  }

  const frameWidth = frame.clientWidth
  const frameHeight = frame.clientHeight
  const scale = Math.max(frameWidth / videoWidth, frameHeight / videoHeight)
  const renderedWidth = videoWidth * scale
  const renderedHeight = videoHeight * scale
  const offsetX = (frameWidth - renderedWidth) / 2
  const offsetY = (frameHeight - renderedHeight) / 2
  const boxLeft = offsetX + box.x * scale
  const boxTop = offsetY + box.y * scale
  const boxWidth = box.width * scale
  const displayedLeft = isMirrored ? frameWidth - boxLeft - boxWidth : boxLeft
  const cardWidth = Math.min(280, Math.max(210, frameWidth * 0.3))
  const rightRailSpace = frameWidth <= 720 ? 86 : 18
  const leftOfHead = displayedLeft - cardWidth - 16
  const left = Math.min(
    Math.max(leftOfHead, 14),
    frameWidth - cardWidth - rightRailSpace,
  )

  // Position the card so its bottom sits just above the top of the head box.
  // 72 is a comfortable estimated card header height in pixels.
  const estimatedCardHeight = 72
  const top = Math.min(
    Math.max(boxTop - estimatedCardHeight - 6, 10),
    frameHeight - estimatedCardHeight - 10,
  )

  return { left, top }
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(new Date(value))
}


function createLocalId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

function inferHeardName(transcript: string) {
  const match = transcript.match(/\b([A-Z][a-z]{2,})\b/)
  return match?.[1] ?? 'No clear name'
}

function inferSentiment(transcript: string): DailyLogEntry['sentiment'] {
  const normalized = transcript.toLowerCase()

  if (
    normalized.includes('forgot') ||
    normalized.includes('confused') ||
    normalized.includes('not sure')
  ) {
    return 'Confused'
  }

  if (
    normalized.includes('great') ||
    normalized.includes('happy') ||
    normalized.includes('good')
  ) {
    return 'Positive'
  }

  return 'Neutral'
}

function App() {
  const [stage, setStage] = useState<AppStage>('landing')
  const [role, setRole] = useState<UserRole | null>(null)

  if (stage === 'landing') {
    return <LandingPage onStart={() => setStage('onboarding')} />
  }

  if (stage === 'onboarding') {
    return <OnboardingCards onDone={() => setStage('app')} />
  }

  if (!role) {
    return <LoginScreen onSelectRole={setRole} />
  }

  if (role === 'caretaker') {
    return <CaretakerDashboard onLogout={() => setRole(null)} />
  }

  return <PatientExperience onLogout={() => setRole(null)} />
}

function LoginScreen({
  onSelectRole,
}: {
  onSelectRole: (role: UserRole) => void
}) {
  return (
    <main className="login-shell">
      <section className="login-panel" aria-label="Choose login role">
        <p>DementAI</p>
        <h1>Continue as</h1>
        <div className="role-grid">
          <button type="button" onClick={() => onSelectRole('patient')}>
            <strong>Patient</strong>
            <span>Open the live camera assistant.</span>
          </button>
          <button type="button" onClick={() => onSelectRole('caretaker')}>
            <strong>Caretaker</strong>
            <span>Add faces and manage recognition cards.</span>
          </button>
        </div>
      </section>
    </main>
  )
}

function PatientExperience({ onLogout }: { onLogout: () => void }) {
  const {
    videoRef,
    videoEl,
    cameraStatus,
    isCameraLive,
    isMirrored,
  } = useCamera()
  const [recognized, setRecognized] = useState<KnownPersonProfile | null>(null)
  const [knownPeople, setKnownPeople] = useState<KnownPersonProfile[]>([])
  const [faceAnchor, setFaceAnchor] = useState<FaceAnchor | null>(null)
  const faceDetectionApiRef = useRef<FaceDetectionApi | null>(null)
  const frameRef = useRef<HTMLElement | null>(null)
  const faceAnchorRef = useRef<FaceAnchor | null>(null)
  const recognitionTimerRef = useRef<number | null>(null)
  const trackingTimerRef = useRef<number | null>(null)
  const captionTimerRef = useRef<number | null>(null)
  const captionEnabledRef = useRef(false)
  const nativePartialResultsRef = useRef<PluginListenerHandle | null>(null)
  const nativeListeningStateRef = useRef<PluginListenerHandle | null>(null)
  const browserRecognitionRef = useRef<BrowserSpeechRecognition | null>(null)
  const browserRestartTimerRef = useRef<number | null>(null)
  const browserPartialTranscriptRef = useRef('')
  const geminiAudioStreamRef = useRef<MediaStream | null>(null)
  const geminiMediaRecorderRef = useRef<MediaRecorder | null>(null)
  const geminiAudioChunksRef = useRef<Blob[]>([])
  const geminiAudioContextRef = useRef<AudioContext | null>(null)
  const geminiAnalyserRef = useRef<AnalyserNode | null>(null)
  const geminiSilenceMonitorRef = useRef<number | null>(null)
  const geminiHeardSpeechRef = useRef(false)
  const geminiShouldProcessAudioRef = useRef(false)
  const geminiLastSpeechAtRef = useRef(0)
  const recognizedRef = useRef<KnownPersonProfile | null>(null)
  const lastRecognizedPersonRef = useRef<{
    person: KnownPersonProfile
    recognizedAt: number
  } | null>(null)
  const conversationPersonRef = useRef<{
    person: KnownPersonProfile
    lockedAt: number
  } | null>(null)
  const speechTranscriptRef = useRef('')
  const lastNativePartialRef = useRef('')
  const lastDismissedCaptionRef = useRef<{ text: string; time: number } | null>(null)
  const silenceTimerRef = useRef<number | null>(null)
  const isSummarizingFaceRef = useRef(false)
  // Tracks the most recently persisted summary per personId so the
  // comparison is never stale even before React state propagates.
  const computedSummariesRef = useRef<Map<string, string>>(new Map())
  // Temporal consistency: same person must win N consecutive scans before
  // the card is accepted, eliminating single-frame false positives.
  const consecutiveMatchRef = useRef<{ id: string; count: number } | null>(null)
  const recognitionMissCountRef = useRef(0)
  const [captionText, setCaptionText] = useState('')
  const [micEnabled, setMicEnabled] = useState(false)
  const [micStatus, setMicStatus] = useState('')
  const [liveFaceSummary, setLiveFaceSummary] = useState<string | null>(null)
  const [activeReminderOverlay, setActiveReminderOverlay] = useState<ReminderItem | null>(null)
  const isNativeApp = Capacitor.isNativePlatform()
  const webSpeech = useSpeechRecognition()
  const webCaption = getLiveCaption(
    webSpeech.interimTranscript,
    webSpeech.finalTranscript || webSpeech.transcript,
  )
  const resetWebTranscript = webSpeech.resetTranscript

  const lockConversationPerson = useCallback(() => {
    if (conversationPersonRef.current) {
      return conversationPersonRef.current.person
    }

    const currentPerson = recognizedRef.current
    const recentPerson = lastRecognizedPersonRef.current
    const fallbackPerson =
      recentPerson && Date.now() - recentPerson.recognizedAt < 20000
        ? recentPerson.person
        : null
    const target = currentPerson ?? fallbackPerson

    if (target) {
      conversationPersonRef.current = {
        person: target,
        lockedAt: Date.now(),
      }
    }

    return target
  }, [])

  const applyCaptionText = useCallback((text: string) => {
    const trimmed = text.trim()

    if (!trimmed) {
      return
    }

    const lastDismissed = lastDismissedCaptionRef.current
    const isImmediateReplay =
      lastDismissed &&
      lastDismissed.text === trimmed &&
      Date.now() - lastDismissed.time < 2200

    if (isImmediateReplay) {
      return
    }

    lastDismissedCaptionRef.current = null
    setCaptionText(trimmed)
  }, [])

  useEffect(() => {
    const orientation = screen.orientation as ScreenOrientation & {
      lock?: (orientation: OrientationLockType) => Promise<void>
      unlock?: () => void
    }

    orientation.lock?.('landscape').catch(() => undefined)

    return () => {
      orientation.unlock?.()
    }
  }, [])

  useEffect(() => {
    faceAnchorRef.current = faceAnchor
  }, [faceAnchor])

  useEffect(() => {
    const prev = recognizedRef.current
    recognizedRef.current = recognized

    if (prev?.id === recognized?.id) return

    if (!recognized) {
      return
    }

    lastRecognizedPersonRef.current = {
      person: recognized,
      recognizedAt: Date.now(),
    }

    if (!speechTranscriptRef.current.trim()) {
      conversationPersonRef.current = null
      lastNativePartialRef.current = ''
      setLiveFaceSummary(DEFAULT_SUMMARY)
      if (silenceTimerRef.current) {
        window.clearTimeout(silenceTimerRef.current)
        silenceTimerRef.current = null
      }
    } else if (!conversationPersonRef.current) {
      conversationPersonRef.current = {
        person: recognized,
        lockedAt: Date.now(),
      }
    }

    // Pull the persisted summary from MongoDB and show it right away.
    // Falls back silently to whatever is already in localStorage.
    const personId = recognized.id
    fetchStoredSummary(personId).then((stored) => {
      // Only apply if this person is still on screen
      if (recognizedRef.current?.id !== personId) return
      const resolvedSummary = stored?.trim() || DEFAULT_SUMMARY

      if (isPlaceholderSummary(resolvedSummary)) {
        computedSummariesRef.current.delete(personId)
      } else {
        computedSummariesRef.current.set(personId, resolvedSummary)
      }

      setLiveFaceSummary(resolvedSummary)
    })
  }, [recognized])

  useEffect(() => {
    if (!captionText) {
      return
    }

    if (captionTimerRef.current) {
      window.clearTimeout(captionTimerRef.current)
    }

    captionTimerRef.current = window.setTimeout(() => {
      lastDismissedCaptionRef.current = captionText
        ? { text: captionText, time: Date.now() }
        : null
      setCaptionText('')
      resetWebTranscript()
    }, appConfig.recognition.captionHoldMs)

    return () => {
      if (captionTimerRef.current) {
        window.clearTimeout(captionTimerRef.current)
      }
    }
  }, [captionText, resetWebTranscript])

  useEffect(() => {
    let isMounted = true

    async function prepareTracking() {
      try {
        const faceDetection = await import('./services/mediaPipeFaceDetection')
        faceDetectionApiRef.current = faceDetection

        await faceDetection.loadMediaPipeFaceDetector()

        if (!isMounted) {
          return
        }
      } catch {
        faceDetectionApiRef.current = null
      }
    }

    prepareTracking()

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    let isMounted = true

    async function prepareRecognition() {
      try {
        const [people] = await Promise.all([loadKnownPeople(), loadFaceModels()])

        if (isMounted) {
          setKnownPeople(people)
        }
      } catch {
        if (isMounted) {
          setKnownPeople([])
        }
      }
    }

    prepareRecognition()

    async function refreshKnownPeople() {
      try {
        const people = await loadKnownPeople()

        if (!isMounted) {
          return
        }

        setKnownPeople(people)
      } catch {
        if (isMounted) {
          setKnownPeople([])
        }
      }
    }

    function handleWindowFocus() {
      refreshKnownPeople()
    }

    window.addEventListener('focus', handleWindowFocus)
    window.addEventListener('storage', handleWindowFocus)
    window.addEventListener(knownPeopleUpdatedEvent, handleWindowFocus)

    return () => {
      isMounted = false
      window.removeEventListener('focus', handleWindowFocus)
      window.removeEventListener('storage', handleWindowFocus)
      window.removeEventListener(knownPeopleUpdatedEvent, handleWindowFocus)
    }
  }, [])

  useEffect(
    () => () => {
      captionEnabledRef.current = false
      browserRecognitionRef.current?.stop()
      if (browserRestartTimerRef.current) {
        window.clearTimeout(browserRestartTimerRef.current)
      }
      stopGeminiAudioCapture(false)
      WebSpeechRecognition.stopListening()
      NativeSpeechRecognition.stop().catch(() => undefined)
      NativeSpeechRecognition.removeAllListeners().catch(() => undefined)
    },
    [],
  )

  const handleFaceSpeechStopped = useCallback(async () => {
    if (isSummarizingFaceRef.current) return
    const browserPartial = browserPartialTranscriptRef.current.trim()

    if (hasSummarizableContent(browserPartial)) {
      speechTranscriptRef.current = speechTranscriptRef.current
        ? `${speechTranscriptRef.current} ${browserPartial}`
        : browserPartial
    }

    browserPartialTranscriptRef.current = ''

    const recentPerson = lastRecognizedPersonRef.current
    const person =
      conversationPersonRef.current?.person ??
      recognizedRef.current ??
      (recentPerson && Date.now() - recentPerson.recognizedAt < 20000
        ? recentPerson.person
        : null)
    const transcript = speechTranscriptRef.current.trim()
    if (!person || !hasSummarizableContent(transcript)) {
      speechTranscriptRef.current = ''
      conversationPersonRef.current = null
      return
    }

    // Clear accumulator before the async work so new speech starts fresh
    speechTranscriptRef.current = ''
    conversationPersonRef.current = null
    isSummarizingFaceRef.current = true

    try {
      const finalSummary = await summarizeConversation(transcript)
      if (!finalSummary.trim()) {
        return
      }
      const personId = person.id
      computedSummariesRef.current.set(personId, finalSummary)

      if (recognizedRef.current?.id === personId || !recognizedRef.current) {
        setLiveFaceSummary(finalSummary)
      }
      setKnownPeople((current) => {
        const nextPeople = current.map((p) =>
          p.id === personId
            ? { ...p, lastConversationSummary: finalSummary, lastVisitAt: new Date().toISOString() }
            : p,
        )
        saveKnownPeople(nextPeople)
        return nextPeople
      })

      // Persist to MongoDB in the background — non-blocking
      persistSummary(personId, person.name, finalSummary)
    } finally {
      isSummarizingFaceRef.current = false
    }
  }, [])

  const resetSilenceTimer = useCallback(() => {
    lockConversationPerson()

    if (silenceTimerRef.current) {
      window.clearTimeout(silenceTimerRef.current)
    }
    silenceTimerRef.current = window.setTimeout(() => {
      silenceTimerRef.current = null
      handleFaceSpeechStopped()
    }, appConfig.recognition.speechPauseMs)
  }, [handleFaceSpeechStopped, lockConversationPerson])

  const resetBrowserRecognition = useCallback((disableCaptions = true) => {
    if (disableCaptions) {
      captionEnabledRef.current = false
    }

    if (browserRestartTimerRef.current) {
      window.clearTimeout(browserRestartTimerRef.current)
      browserRestartTimerRef.current = null
    }

    browserRecognitionRef.current?.stop()
    browserRecognitionRef.current = null
  }, [])

  useEffect(() => {
    if (!webCaption || isNativeApp) {
      return
    }

    setCaptionText(webCaption)
    resetSilenceTimer()
  }, [isNativeApp, resetSilenceTimer, webCaption])

  function cleanupGeminiAudio() {
    if (geminiSilenceMonitorRef.current) {
      window.clearInterval(geminiSilenceMonitorRef.current)
      geminiSilenceMonitorRef.current = null
    }

    geminiAudioContextRef.current?.close().catch(() => undefined)
    geminiAudioContextRef.current = null
    geminiAnalyserRef.current = null
    geminiAudioStreamRef.current?.getTracks().forEach((track) => track.stop())
    geminiAudioStreamRef.current = null
  }

  function stopGeminiAudioCapture(processAudio: boolean) {
    geminiShouldProcessAudioRef.current =
      processAudio && geminiHeardSpeechRef.current

    if (geminiSilenceMonitorRef.current) {
      window.clearInterval(geminiSilenceMonitorRef.current)
      geminiSilenceMonitorRef.current = null
    }

    const recorder = geminiMediaRecorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop()
      return
    }

    cleanupGeminiAudio()
  }

  function startBrowserLiveCaptions(captureTranscript: boolean) {
    const BrowserSpeechRecognition = getBrowserSpeechRecognition()

    if (!BrowserSpeechRecognition) {
      return false
    }

    browserRecognitionRef.current?.stop()

    const recognition = new BrowserSpeechRecognition()
    recognition.continuous = false
    recognition.interimResults = true
    recognition.lang = 'en-US'
    recognition.onresult = (event) => {
      let interimTranscript = ''
      let finalTranscript = ''

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index]
        const transcript = result[0]?.transcript ?? ''

        if (result.isFinal) {
          finalTranscript += transcript
        } else {
          interimTranscript += transcript
        }
      }

      const text = getLiveCaption(interimTranscript, finalTranscript)

      if (text) {
        applyCaptionText(text)
        lockConversationPerson()
        if (captureTranscript) {
          resetSilenceTimer()
        }
      }

      if (!captureTranscript) {
        return
      }

      if (interimTranscript.trim()) {
        browserPartialTranscriptRef.current = interimTranscript.trim()
      }

      if (finalTranscript.trim()) {
        speechTranscriptRef.current = speechTranscriptRef.current
          ? `${speechTranscriptRef.current} ${finalTranscript.trim()}`
          : finalTranscript.trim()
        browserPartialTranscriptRef.current = ''
      }
    }
    recognition.onerror = () => {
      resetBrowserRecognition(captureTranscript)
      if (captureTranscript) {
        setMicEnabled(false)
        setMicStatus('Tap mic to restart CC')
      }
    }
    recognition.onend = () => {
      if (!captionEnabledRef.current || document.visibilityState !== 'visible') {
        return
      }

      browserRestartTimerRef.current = window.setTimeout(() => {
        recognition.start()
      }, 350)
    }
    browserRecognitionRef.current = recognition
    recognition.start()

    return true
  }

  async function beginGeminiAudioCapture() {
    const mimeType = getPreferredAudioMimeType()

    if (!mimeType) {
      return false
    }

    cleanupGeminiAudio()
    geminiAudioChunksRef.current = []
    geminiHeardSpeechRef.current = false
    geminiShouldProcessAudioRef.current = false
    geminiLastSpeechAtRef.current = 0

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const audioContext = new AudioContext()
    const analyser = audioContext.createAnalyser()
    const source = audioContext.createMediaStreamSource(stream)
    const recorder = new MediaRecorder(stream, { mimeType })
    const sampleBuffer = new Uint8Array(analyser.fftSize)

    analyser.fftSize = 2048
    source.connect(analyser)

    geminiAudioStreamRef.current = stream
    geminiAudioContextRef.current = audioContext
    geminiAnalyserRef.current = analyser
    geminiMediaRecorderRef.current = recorder

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        geminiAudioChunksRef.current.push(event.data)
      }
    }

    recorder.onstop = () => {
      const shouldProcess = geminiShouldProcessAudioRef.current
      const chunks = geminiAudioChunksRef.current

      geminiAudioChunksRef.current = []
      geminiMediaRecorderRef.current = null
      cleanupGeminiAudio()

      if (!shouldProcess || chunks.length === 0) {
        if (captionEnabledRef.current) {
          void beginGeminiAudioCapture()
        }
        return
      }

      void (async () => {
        try {
          const blob = new Blob(chunks, { type: mimeType })
          const transcript = await transcribeAudio(blob)

          if (transcript) {
            speechTranscriptRef.current = transcript
            applyCaptionText(transcript)
            await handleFaceSpeechStopped()
          }
        } catch {
          setMicStatus('Gemini transcription failed. Check the Render Gemini key.')
        } finally {
          if (captionEnabledRef.current) {
            setMicStatus('')
            void beginGeminiAudioCapture()
          }
        }
      })()
    }

    geminiSilenceMonitorRef.current = window.setInterval(() => {
      analyser.getByteTimeDomainData(sampleBuffer)
      let sum = 0

      for (const value of sampleBuffer) {
        const normalized = (value - 128) / 128
        sum += normalized * normalized
      }

      const level = Math.sqrt(sum / sampleBuffer.length)

      if (level > GEMINI_SPEECH_LEVEL_THRESHOLD) {
        geminiHeardSpeechRef.current = true
        geminiLastSpeechAtRef.current = Date.now()
        lockConversationPerson()
        setMicStatus('')
        return
      }

      if (
        geminiHeardSpeechRef.current &&
        Date.now() - geminiLastSpeechAtRef.current >=
          appConfig.recognition.speechPauseMs
      ) {
        stopGeminiAudioCapture(true)
      }
    }, GEMINI_SPEECH_CHECK_MS)

    recorder.start(500)
    setMicStatus('')
    return true
  }

  async function startNativeCaptions() {
    const availability = await NativeSpeechRecognition.available()

    if (!availability.available) {
      setMicEnabled(false)
      setMicStatus('CC unavailable on this phone')
      return false
    }

    const permissions = await NativeSpeechRecognition.requestPermissions()

    if (permissions.speechRecognition !== 'granted') {
      setMicEnabled(false)
      setMicStatus('Allow mic and speech access for CC')
      return false
    }

    const onDeviceRecognition = await NativeSpeechRecognition.isOnDeviceRecognitionAvailable({
      language: 'en-US',
    }).catch(() => ({ available: false }))
    const nativeCaptionOptions = {
      language: 'en-US',
      maxResults: 3,
      partialResults: true,
      popup: false,
      addPunctuation: true,
      useOnDeviceRecognition: onDeviceRecognition.available,
    }

    await NativeSpeechRecognition.removeAllListeners()

    nativePartialResultsRef.current = await NativeSpeechRecognition.addListener(
      'partialResults',
      (data) => {
        const text = data.matches?.[0]?.trim()

        if (text) {
          applyCaptionText(text)
          lastNativePartialRef.current = text
          resetSilenceTimer()
        }
      },
    )

    nativeListeningStateRef.current = await NativeSpeechRecognition.addListener(
      'listeningState',
      (data) => {
        const stopped = data.status === 'stopped' || data.state === 'stopped'

        if (!stopped || !captionEnabledRef.current) {
          return
        }

        // Commit the last partial result as a completed utterance
        const utterance = lastNativePartialRef.current.trim()
        if (utterance) {
          speechTranscriptRef.current = speechTranscriptRef.current
            ? `${speechTranscriptRef.current} ${utterance}`
            : utterance
          lastNativePartialRef.current = ''
        }

        window.setTimeout(() => {
          if (!captionEnabledRef.current) {
            return
          }

          NativeSpeechRecognition.start(nativeCaptionOptions).catch(() => {
            setMicEnabled(false)
            setMicStatus('Tap mic to restart CC')
          })
        }, 350)
      },
    )

    await NativeSpeechRecognition.start(nativeCaptionOptions)

    return true
  }

  async function startWebCaptions() {
    if ('MediaRecorder' in window && window.AudioContext) {
      const didStartGeminiCapture = await beginGeminiAudioCapture()
      if (didStartGeminiCapture) {
        startBrowserLiveCaptions(false)
      }
      return didStartGeminiCapture
    }

    const BrowserSpeechRecognition = getBrowserSpeechRecognition()

    if (!BrowserSpeechRecognition && !webSpeech.browserSupportsSpeechRecognition) {
      setMicEnabled(false)
      setMicStatus('CC unavailable in this browser')
      return false
    }

    await requestMicPermission()

    if (BrowserSpeechRecognition) {
      return startBrowserLiveCaptions(true)
    }

    await WebSpeechRecognition.startListening({
      continuous: false,
      language: 'en-US',
    })

    return true
  }

  async function startCaptions() {
    try {
      captionEnabledRef.current = true
      lastDismissedCaptionRef.current = null
      setCaptionText('')

      const didStart = isNativeApp
        ? await startNativeCaptions()
        : await startWebCaptions()

      if (!didStart) {
        captionEnabledRef.current = false
        return
      }

      warmConversationSummarizer()
      setMicEnabled(true)
      setMicStatus('')
    } catch {
      captionEnabledRef.current = false
      setMicEnabled(false)
      setMicStatus('Allow mic access for CC')
    }
  }

  async function stopCaptions() {
    captionEnabledRef.current = false
    setMicEnabled(false)
    setMicStatus('')

    if (silenceTimerRef.current) {
      window.clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = null
    }

    const isGeminiRecording = Boolean(geminiMediaRecorderRef.current)

    if (isGeminiRecording) {
      stopGeminiAudioCapture(true)
    } else {
      await handleFaceSpeechStopped()
    }

    if (isNativeApp) {
      await NativeSpeechRecognition.stop().catch(() => undefined)
      await NativeSpeechRecognition.removeAllListeners().catch(() => undefined)
      nativePartialResultsRef.current = null
      nativeListeningStateRef.current = null
      return
    }

    resetBrowserRecognition()
    WebSpeechRecognition.stopListening()
  }

  async function handleMicrophoneToggle() {
    if (micEnabled) {
      await stopCaptions()
      return
    }

    await startCaptions()
  }

  useEffect(() => {
    if (
      isNativeApp ||
      browserRecognitionRef.current ||
      geminiMediaRecorderRef.current ||
      !micEnabled ||
      webSpeech.listening ||
      !webSpeech.browserSupportsSpeechRecognition
    ) {
      return
    }

    const restartTimer = window.setTimeout(() => {
      if (document.visibilityState !== 'visible') {
        return
      }

      WebSpeechRecognition.startListening({
        continuous: false,
        language: 'en-US',
      }).catch(() => {
        setMicEnabled(false)
        setMicStatus('Tap mic to restart CC')
      })
    }, 350)

    return () => window.clearTimeout(restartTimer)
  }, [
    isNativeApp,
    micEnabled,
    webSpeech.browserSupportsSpeechRecognition,
    webSpeech.listening,
  ])

  useEffect(() => {
    let isCancelled = false

    async function trackFace() {
      const faceDetection = faceDetectionApiRef.current
      const video = videoEl
      const frame = frameRef.current

      if (faceDetection && video && frame && video.readyState >= 2) {
        const box = await faceDetection.detectPrimaryFace(video)

        if (!isCancelled) {
          setFaceAnchor(
            box ? mapFaceBoxToFrame(box, video, frame, isMirrored) : null,
          )
        }
      }

      if (!isCancelled) {
        trackingTimerRef.current = window.setTimeout(
          trackFace,
          appConfig.recognition.minTrackingIntervalMs,
        )
      }
    }

    trackFace()

    return () => {
      isCancelled = true
      if (trackingTimerRef.current) {
        window.clearTimeout(trackingTimerRef.current)
      }
    }
  }, [isMirrored, videoEl])

  useEffect(() => {
    let isCancelled = false

    async function scan() {
      const video = videoEl

      if (video && video.readyState >= 2 && faceAnchorRef.current) {
        try {
          const result = await identifyFace(video, knownPeople)

          if (!isCancelled) {
            if (result) {
              recognitionMissCountRef.current = 0
              const prev = consecutiveMatchRef.current
              if (prev && prev.id === result.profile.id) {
                consecutiveMatchRef.current = { id: prev.id, count: prev.count + 1 }
              } else {
                consecutiveMatchRef.current = { id: result.profile.id, count: 1 }
              }

              if (
                consecutiveMatchRef.current.count >=
                appConfig.recognition.temporalConsistencyFrames
              ) {
                setRecognized(result.profile)
              }
            } else {
              consecutiveMatchRef.current = null
              recognitionMissCountRef.current += 1
              if (recognitionMissCountRef.current >= 3) {
                setRecognized(null)
              }
            }
          }
        } catch {
          if (!isCancelled) {
            consecutiveMatchRef.current = null
            recognitionMissCountRef.current += 1
            if (recognitionMissCountRef.current >= 3) {
              setRecognized(null)
            }
          }
        }
      } else {
        if (!isCancelled) {
          recognitionMissCountRef.current += 1
          if (recognitionMissCountRef.current >= 3) {
            setRecognized(null)
          }
        }
      }

      if (!isCancelled) {
        recognitionTimerRef.current = window.setTimeout(
          scan,
          appConfig.recognition.minRecognitionIntervalMs,
        )
      }
    }

    scan()

    return () => {
      isCancelled = true
      if (recognitionTimerRef.current) {
        window.clearTimeout(recognitionTimerRef.current)
      }
    }
  }, [knownPeople, videoEl])

  function handlePatientFlag() {
    const transcript = captionText.trim()
    const heardName = inferHeardName(transcript)

    updateStoredDashboardState((current) => ({
      ...current,
      unknownQueue: [
        {
          id: createLocalId('unknown'),
          flaggedAt: new Date().toISOString(),
          heardName,
          snippet: transcript || 'Flagged from the patient view without spoken context yet.',
          emotionalState: recognized ? 'Neutral' : 'Uncertain',
          status: 'pending',
        },
        ...current.unknownQueue,
      ],
    }))

    setMicStatus('Flag sent to caretaker.')
  }

  function handlePatientSos() {
    const transcript = captionText.trim()
    const location = 'Patient camera view'

    updateStoredDashboardState((current) => ({
      ...current,
      sosAlerts: [
        {
          id: createLocalId('sos'),
          time: new Date().toISOString(),
          trigger: 'Button pressed',
          location,
          transcript: transcript || 'SOS triggered from patient view.',
          status: 'Open',
          note: '',
        },
        ...current.sosAlerts,
      ],
      dailyLog: [
        {
          id: createLocalId('log'),
          type: 'sos',
          title: 'SOS triggered',
          occurredAt: new Date().toISOString(),
          summary: transcript || 'SOS triggered from patient view.',
          location,
          status: 'Open',
        },
        ...current.dailyLog,
      ],
    }))

    setMicStatus('SOS sent to caretaker.')
  }

  // Check for due reminders every 30 seconds and pop an overlay.
  useEffect(() => {
    function checkReminders() {
      const stored = localStorage.getItem(appConfig.recognition.dashboardStorageKey)
      if (!stored) return
      const state = JSON.parse(stored) as { reminders?: ReminderItem[] }
      const reminders = state.reminders ?? []
      const now = Date.now()
      const due = reminders.find((r) => {
        if (r.status !== 'Active') return false
        const fireAt = new Date(r.datetime).getTime()
        return Math.abs(now - fireAt) < 30_000
      })
      if (due) setActiveReminderOverlay(due)
    }

    const interval = window.setInterval(checkReminders, 30_000)
    return () => window.clearInterval(interval)
  }, [])

  return (
    <main className="app-shell">
      <section
        ref={frameRef}
        className="camera-frame"
        aria-label="DementAI camera interface"
      >
        <video
          ref={videoRef}
          className={`camera-feed ${isMirrored ? 'mirrored-feed' : ''}`}
          autoPlay
          muted
          playsInline
        />

        <div className="camera-vignette" />
        <div className="corner-guide top-left" />
        <div className="corner-guide top-right" />
        <div className="corner-guide bottom-left" />
        <div className="corner-guide bottom-right" />

        {!isCameraLive && (
          <div className="camera-start-card" role="status">
            <strong>{cameraStatus}</strong>
            <span>Allow camera access, then refresh if the browser has already blocked it.</span>
          </div>
        )}

        <button className="mode-back" type="button" onClick={onLogout}>
          <ArrowLeft size={17} />
          Back
        </button>

        {activeReminderOverlay && (
          <div className="reminder-overlay" role="alert" aria-live="assertive">
            <h3>{activeReminderOverlay.category} reminder</h3>
            <p>{activeReminderOverlay.message}</p>
            <button
              type="button"
              onClick={() => setActiveReminderOverlay(null)}
            >
              Got it
            </button>
          </div>
        )}

        {recognized && faceAnchor && (
          <aside
            className="identity-card tracked-identity-card"
            style={
              {
                '--face-card-left': `${faceAnchor.left}px`,
                '--face-card-top': `${faceAnchor.top}px`,
              } as CSSProperties
            }
            aria-live="polite"
          >
            <header>
              <p>{recognized.relation}</p>
              <h1>{recognized.name}</h1>
            </header>
            <p>{liveFaceSummary ?? DEFAULT_SUMMARY}</p>
          </aside>
        )}

        <nav className="action-rail" aria-label="Primary actions">
          <button
            className={`microphone-toggle ${micEnabled ? 'is-listening' : ''}`}
            type="button"
            onClick={handleMicrophoneToggle}
            aria-pressed={micEnabled}
            aria-label={micEnabled ? 'Pause microphone' : 'Start microphone'}
          >
            {micEnabled ? <Mic size={22} /> : <MicOff size={22} />}
          </button>
          <button
            className="danger-action"
            type="button"
            aria-label="SOS"
            onClick={handlePatientSos}
          >
            <AlertTriangle size={23} />
            <span>SOS</span>
          </button>
          <button type="button" aria-label="Flag person" onClick={handlePatientFlag}>
            <Flag size={22} />
            <span>Flag</span>
          </button>
        </nav>

        {captionText && (
          <section className="captions" aria-live="polite">
            <p>{captionText}</p>
          </section>
        )}

        {!captionText && micStatus && (
          <section className="microphone-status" aria-live="polite">
            <p>{micStatus}</p>
          </section>
        )}
      </section>
    </main>
  )
}

function CaretakerDashboard({ onLogout }: { onLogout: () => void }) {
  const { videoRef: captureVideoRef, videoEl: captureVideoEl, cameraStatus, isCameraLive, isMirrored } =
    useCamera('user')
  const [people, setPeople] = useState<KnownPersonProfile[]>([])
  // Initialize synchronously from localStorage so there is never a blank
  // loading screen — the API sync happens in the background.
  const [dashboard, setDashboard] = useState<DashboardState>(getLocalDashboardState)
  const [status, setStatus] = useState('')
  const [activeTab, setActiveTab] = useState<CaretakerTab>('daily-log')
  const [filter, setFilter] = useState('All')
  const [imageFiles, setImageFiles] = useState<File[]>([])
  const [imagePreviews, setImagePreviews] = useState<string[]>([])
  const [name, setName] = useState('')
  const [relation, setRelation] = useState('')
  const [group, setGroup] = useState(groupOptions[0])
  const [summary, setSummary] = useState('')
  const [selectedContactId, setSelectedContactId] = useState('')
  const [transcriptDraft, setTranscriptDraft] = useState('')
  const [summaryDraft, setSummaryDraft] = useState('')
  const [isSummarizing, setIsSummarizing] = useState(false)
  const [logFilter, setLogFilter] = useState<'all' | DailyLogEntry['type']>('all')
  const [manualLogTitle, setManualLogTitle] = useState('')
  const [manualLogSummary, setManualLogSummary] = useState('')
  const [selectedReminderCategory, setSelectedReminderCategory] =
    useState<ReminderItem['category']>('Medication')
  const [reminderTitle, setReminderTitle] = useState('')
  const [reminderMessage, setReminderMessage] = useState('')
  const [reminderPriority, setReminderPriority] =
    useState<ReminderItem['priority']>('Medium')
  const [visitorPersonId, setVisitorPersonId] = useState('')
  const [visitorDate, setVisitorDate] = useState('')
  const [visitorContext, setVisitorContext] = useState('')
  const [trustedLocationDraft, setTrustedLocationDraft] = useState('')
  const [sosNoteDraft, setSosNoteDraft] = useState('')
  const [noteListening, setNoteListening] = useState(false)
  const noteRecognitionRef = useRef<BrowserSpeechRecognition | null>(null)
  const transcriptDraftRef = useRef('')
  const autoSummarizeOnStopRef = useRef(false)
  const didLoadRef = useRef(false)
  const [isSaving, setIsSaving] = useState(false)
  const [extraImageFiles, setExtraImageFiles] = useState<File[]>([])
  const [extraImagePreviews, setExtraImagePreviews] = useState<string[]>([])
  const [isSavingPhotos, setIsSavingPhotos] = useState(false)
  // Contacts modal
  const [modalPersonId, setModalPersonId] = useState<string | null>(null)
  // Reminder form
  const [reminderDatetime, setReminderDatetime] = useState('')
  const [reminderRecurring, setReminderRecurring] =
    useState<ReminderItem['recurring']>('none')
  const [reminderDays, setReminderDays] = useState<number[]>([])
  // SOS expand
  const [expandedSosId, setExpandedSosId] = useState<string | null>(null)
  // Safe zone
  const [homeAddressDraft, setHomeAddressDraft] = useState('')

  useEffect(() => {
    async function loadPeopleAndDashboard() {
      try {
        // Load face models in the background — don't block the dashboard.
        loadFaceModels().catch(() => undefined)
        const loadedPeople = await loadKnownPeople()
        setPeople(loadedPeople)
        setDashboard(await loadDashboardState(loadedPeople))
        setSelectedContactId(loadedPeople[0]?.id ?? '')
        setVisitorPersonId(loadedPeople[0]?.id ?? '')
        didLoadRef.current = true
      } catch {
        // People/dashboard already initialized from localStorage — just flag sync failure.
        setStatus('Could not sync with server. Showing locally saved data.')
        didLoadRef.current = true
      }
    }

    loadPeopleAndDashboard()
  }, [])

  useEffect(() => {
    if (!didLoadRef.current) {
      return
    }

    saveKnownPeople(people)
  }, [people])

  useEffect(() => {
    if (!didLoadRef.current) {
      return
    }

    saveDashboardState(dashboard)
  }, [dashboard])

  useEffect(
    () => () => {
      noteRecognitionRef.current?.stop()
    },
    [],
  )

  useEffect(() => {
    if (!selectedContactId && people.length > 0) {
      setSelectedContactId(people[0].id)
      setVisitorPersonId((current) => current || people[0].id)
    }
  }, [people, selectedContactId])

  const visiblePeople = useMemo(() => {
    if (filter === 'All') {
      return people
    }

    return people.filter((person) => person.group === filter)
  }, [filter, people])

  const activeGroups = useMemo(
    () => ['All', ...Array.from(new Set(people.map((person) => person.group)))],
    [people],
  )

  const selectedContact = useMemo(
    () => people.find((person) => person.id === selectedContactId) ?? null,
    [people, selectedContactId],
  )

  useEffect(() => {
    if (!selectedContact) {
      setTranscriptDraft('')
      transcriptDraftRef.current = ''
      setSummaryDraft('')
      return
    }

    setTranscriptDraft(selectedContact.lastTranscript ?? '')
    transcriptDraftRef.current = selectedContact.lastTranscript ?? ''
    setSummaryDraft(selectedContact.lastConversationSummary)
  }, [selectedContact])

  const filteredDailyLog = useMemo(() => {
    if (logFilter === 'all') {
      return dashboard.dailyLog
    }

    return dashboard.dailyLog.filter((entry) => entry.type === logFilter)
  }, [dashboard, logFilter])

  function updateDashboard(updater: (current: DashboardState) => DashboardState) {
    setDashboard((current) => updater(current))
  }

  function updatePerson(
    personId: string,
    updater: (person: KnownPersonProfile) => KnownPersonProfile,
  ) {
    setPeople((current) => {
      const nextPeople = current.map((person) =>
        person.id === personId ? updater(person) : person,
      )
      saveKnownPeople(nextPeople)
      return nextPeople
    })
  }

  function resetContactForm() {
    setImageFiles([])
    setImagePreviews([])
    setName('')
    setRelation('')
    setGroup(groupOptions[0])
    setSummary('')
  }

  async function generateSummaryFromTranscript(transcript: string) {
    if (!selectedContact || !transcript.trim()) {
      setStatus('Start the note mic and speak before saving the card summary.')
      return
    }

    setIsSummarizing(true)
    setStatus('Turning speech into a card summary...')

    try {
      const cleanTranscript = transcript.trim()
      const nextSummary = await summarizeConversation(cleanTranscript)
      const sentiment = inferSentiment(cleanTranscript)
      const summaryText = nextSummary.trim()

      setTranscriptDraft(cleanTranscript)
      transcriptDraftRef.current = cleanTranscript
      setSummaryDraft(summaryText)
      setSummary(summaryText)
      updatePerson(selectedContact.id, (person) => ({
        ...person,
        lastConversationSummary: summaryText,
        lastTranscript: cleanTranscript,
        lastVisitAt: new Date().toISOString(),
        visitsThisMonth: (person.visitsThisMonth ?? 0) + 1,
      }))
      updateDashboard((current) => ({
        ...current,
        dailyLog: [
          {
            id: createLocalId('log'),
            type: 'encounter',
            title: selectedContact.name,
            personId: selectedContact.id,
            relationship: selectedContact.relation,
            occurredAt: new Date().toISOString(),
            durationMinutes: Math.max(5, Math.round(cleanTranscript.split(/\s+/).length / 18)),
            sentiment,
            summary: summaryText,
            transcript: cleanTranscript,
            location: 'Patient home',
          },
          ...current.dailyLog,
        ],
        cognitiveObservations:
          sentiment === 'Confused'
            ? [
                {
                  id: createLocalId('obs'),
                  date: new Date().toISOString(),
                  title: `Confusion cue during conversation with ${selectedContact.name}`,
                  source: 'AI',
                  severity: 'Medium',
                  actionTaken: 'Review transcript and compare with next visit.',
                },
                ...current.cognitiveObservations,
              ]
            : current.cognitiveObservations,
      }))
      setStatus(`Saved a new card summary for ${selectedContact.name}.`)
    } finally {
      setIsSummarizing(false)
    }
  }

  async function handleImageChange(file: File | null) {
    if (!file) {
      return
    }

    setImageFiles((current) => [...current, file])
    const preview = await fileToDataUrl(file)
    setImagePreviews((current) => [...current, preview])
  }

  async function handleCapturePhoto() {
    const video = captureVideoEl

    try {
      if (!video) {
        throw new Error('Camera is not ready yet.')
      }

      const file = await captureVideoFile(video, 'captured-face')
      await handleImageChange(file)
      setStatus('Photo captured. Add front, slight left, and slight right samples.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not capture photo.')
    }
  }

  function handleRemoveSample(index: number) {
    setImageFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))
    setImagePreviews((current) =>
      current.filter((_, itemIndex) => itemIndex !== index),
    )
  }

  async function handleExtraImageChange(file: File | null) {
    if (!file) return
    const preview = await fileToDataUrl(file)
    setExtraImageFiles((current) => [...current, file])
    setExtraImagePreviews((current) => [...current, preview])
  }

  async function handleExtraCapturePhoto() {
    const video = captureVideoEl
    try {
      if (!video) throw new Error('Camera is not ready yet.')
      const file = await captureVideoFile(video, 'extra-face')
      await handleExtraImageChange(file)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not capture photo.')
    }
  }

  function handleRemoveExtraSample(index: number) {
    setExtraImageFiles((current) => current.filter((_, i) => i !== index))
    setExtraImagePreviews((current) => current.filter((_, i) => i !== index))
  }

  async function handleSaveExtraPhotos() {
    if (!selectedContact || extraImageFiles.length === 0) {
      setStatus('Select a contact and add at least one photo first.')
      return
    }

    setIsSavingPhotos(true)
    setStatus('Creating face descriptors...')

    try {
      await loadFaceModels()
      const newDescriptors = await Promise.all(
        extraImageFiles.map((file) => createDescriptorFromImage(file)),
      )

      updatePerson(selectedContact.id, (person) => ({
        ...person,
        descriptors: [...person.descriptors, ...newDescriptors],
      }))
      setExtraImageFiles([])
      setExtraImagePreviews([])
      setStatus(`Added ${newDescriptors.length} photo${newDescriptors.length > 1 ? 's' : ''} to ${selectedContact.name}'s recognition profile.`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not process these photos.')
    } finally {
      setIsSavingPhotos(false)
    }
  }

  async function handleClearPeople() {
    try {
      clearKnownPeople()
      setPeople([])
      setFilter('All')
      setSelectedContactId('')
      setStatus('All previously added faces were cleared.')
    } catch {
      setStatus('Could not clear stored faces.')
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (imageFiles.length === 0 || !name.trim() || !relation.trim()) {
      setStatus('Add at least one face image, name, and relation first.')
      return
    }

    setIsSaving(true)
    setStatus('Creating recognition profile...')

    try {
      await loadFaceModels()
      const descriptors = await Promise.all(
        imageFiles.map((file) => createDescriptorFromImage(file)),
      )
      const profile: KnownPersonProfile = {
        id: `${name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`,
        name: name.trim(),
        relation: relation.trim(),
        group,
        lastConversationSummary:
          summary.trim() ||
          'No conversation summary yet. Add one after the next visit.',
        imageDataUrl: imagePreviews[0],
        lastVisitAt: new Date().toISOString(),
        visitsThisMonth: 0,
        descriptors,
      }
      const nextPeople = [profile, ...people.filter((person) => person.id !== profile.id)]

      setPeople(nextPeople)
      setSelectedContactId(profile.id)
      setVisitorPersonId(profile.id)
      updateDashboard((current) => ({
        ...current,
        dailyLog: [
          {
            id: createLocalId('log'),
            type: 'note',
            title: `Contact added: ${profile.name}`,
            occurredAt: new Date().toISOString(),
            summary: `Added ${profile.name} to the recognition database as ${profile.relation}.`,
          },
          ...current.dailyLog,
        ],
      }))
      resetContactForm()
      setStatus(`${profile.name} is ready for patient camera recognition.`)
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : 'Could not add this person. Try another clear, front-facing photo.',
      )
    } finally {
      setIsSaving(false)
    }
  }

  async function handleStartContactTranscript() {
    if (!selectedContact) {
      setStatus('Select a contact before recording visit notes.')
      return
    }

    const BrowserSpeechRecognition = getBrowserSpeechRecognition()

    if (!BrowserSpeechRecognition) {
      setStatus('Speech-to-text is unavailable in this browser.')
      return
    }

    try {
      await requestMicPermission()
      noteRecognitionRef.current?.stop()
      const recognition = new BrowserSpeechRecognition()
      recognition.continuous = false
      recognition.interimResults = true
      recognition.lang = 'en-US'
      recognition.onresult = (event) => {
        let nextTranscript = ''

        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          nextTranscript += `${event.results[index][0]?.transcript ?? ''} `
        }

        setTranscriptDraft((current) => {
          const combined = `${current} ${nextTranscript}`.trim()
          transcriptDraftRef.current = combined
          return combined
        })
      }
      recognition.onerror = () => {
        setNoteListening(false)
        autoSummarizeOnStopRef.current = false
        setStatus('Microphone transcription stopped. Tap the button to try again.')
      }
      recognition.onend = () => {
        setNoteListening(false)
        const shouldSummarize = autoSummarizeOnStopRef.current
        autoSummarizeOnStopRef.current = false

        if (shouldSummarize && transcriptDraftRef.current.trim()) {
          void generateSummaryFromTranscript(transcriptDraftRef.current)
        }
      }
      noteRecognitionRef.current = recognition
      recognition.start()
      setNoteListening(true)
      setStatus(`Listening for ${selectedContact.name}'s visit notes...`)
    } catch {
      setStatus('Allow microphone access to capture visit notes.')
    }
  }

  function handleStopContactTranscript() {
    autoSummarizeOnStopRef.current = true
    noteRecognitionRef.current?.stop()
    setNoteListening(false)
  }

  async function handleGenerateSummary() {
    await generateSummaryFromTranscript(transcriptDraftRef.current || transcriptDraft)
  }

  function handleAddManualLog(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!manualLogTitle.trim() || !manualLogSummary.trim()) {
      setStatus('Add both a title and note to save the daily log entry.')
      return
    }

    updateDashboard((current) => ({
      ...current,
      dailyLog: [
        {
          id: createLocalId('log'),
          type: 'note',
          title: manualLogTitle.trim(),
          occurredAt: new Date().toISOString(),
          summary: manualLogSummary.trim(),
        },
        ...current.dailyLog,
      ],
    }))
    setManualLogTitle('')
    setManualLogSummary('')
    setStatus('Daily note saved.')
  }

  function handleQueueToContact(item: UnknownQueueItem) {
    setName(item.heardName === 'No clear name' ? '' : item.heardName)
    setRelation('Visitor')
    setSummary(item.snippet)
    setActiveTab('contacts')
    setStatus('Unknown visitor details moved into the contact form for review.')
  }

  function handleScheduleVisitor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!visitorPersonId || !visitorDate || !visitorContext.trim()) {
      setStatus('Choose a contact, date, and briefing context for the visit.')
      return
    }

    updateDashboard((current) => ({
      ...current,
      visitorSchedule: [
        {
          id: createLocalId('visit'),
          personId: visitorPersonId,
          visitDate: new Date(visitorDate).toISOString(),
          status: 'Scheduled',
          context: visitorContext.trim(),
        },
        ...current.visitorSchedule,
      ],
      dailyLog: [
        {
          id: createLocalId('log'),
          type: 'note',
          title: 'Briefing scheduled',
          occurredAt: new Date().toISOString(),
          summary: visitorContext.trim(),
        },
        ...current.dailyLog,
      ],
    }))
    setVisitorDate('')
    setVisitorContext('')
    setStatus('Visitor briefing scheduled.')
  }

  function handleAddReminder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!reminderTitle.trim() || !reminderMessage.trim() || !reminderDatetime) {
      setStatus('Fill in the title, date/time, and message first.')
      return
    }

    const dt = new Date(reminderDatetime)
    let label = dt.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    if (reminderRecurring === 'daily') label += ' · Daily'
    else if (reminderRecurring === 'weekdays') label += ' · Weekdays'
    else if (reminderRecurring === 'weekly') {
      const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
      label += ` · Weekly (${reminderDays.map((d) => dayNames[d]).join(', ')})`
    }

    updateDashboard((current) => ({
      ...current,
      reminders: [
        {
          id: createLocalId('reminder'),
          title: reminderTitle.trim(),
          category: selectedReminderCategory,
          scheduleLabel: label,
          message: reminderMessage.trim(),
          priority: reminderPriority,
          datetime: dt.toISOString(),
          recurring: reminderRecurring,
          recurringDays: reminderRecurring === 'weekly' ? reminderDays : undefined,
          status: 'Active',
        },
        ...current.reminders,
      ],
    }))
    setReminderTitle('')
    setReminderMessage('')
    setReminderDatetime('')
    setReminderRecurring('none')
    setReminderDays([])
    setReminderPriority('Medium')
    setStatus('Reminder saved.')
  }

  function handleDeleteReminder(id: string) {
    updateDashboard((current) => ({
      ...current,
      reminders: current.reminders.filter((r) => r.id !== id),
    }))
    setStatus('Reminder deleted.')
  }

  function handleSetHomeAddress() {
    if (!homeAddressDraft.trim()) return
    updateDashboard((current) => ({
      ...current,
      safeZone: { ...current.safeZone, homeAddress: homeAddressDraft.trim() },
    }))
    setHomeAddressDraft('')
    setStatus('Home address saved.')
  }

  function handleRemoveTrustedLocation(location: string) {
    updateDashboard((current) => ({
      ...current,
      safeZone: {
        ...current.safeZone,
        trustedLocations: current.safeZone.trustedLocations.filter((l) => l !== location),
      },
    }))
  }

  function handleDeletePerson(personId: string) {
    const next = people.filter((p) => p.id !== personId)
    setPeople(next)
    saveKnownPeople(next)
    setModalPersonId(null)
    setStatus('Contact removed.')
  }

  function handleAddTrustedLocation() {
    if (!trustedLocationDraft.trim()) {
      return
    }

    updateDashboard((current) => ({
      ...current,
      safeZone: {
        ...current.safeZone,
        trustedLocations: [trustedLocationDraft.trim(), ...current.safeZone.trustedLocations],
      },
    }))
    setTrustedLocationDraft('')
    setStatus('Trusted location added to the safe zone.')
  }

  function handleResolveAlert(alertId: string) {
    updateDashboard((current) => ({
      ...current,
      sosAlerts: current.sosAlerts.map((alert) =>
        alert.id === alertId
          ? { ...alert, status: 'Resolved', note: sosNoteDraft || alert.note }
          : alert,
      ),
    }))
    setSosNoteDraft('')
    setStatus('SOS alert marked as resolved.')
  }


  const tabs: { id: CaretakerTab; label: string }[] = [
    { id: 'daily-log', label: 'Daily Log' },
    { id: 'unknown-queue', label: 'Unknown Queue' },
    { id: 'visitor-schedule', label: 'Visitor Schedule' },
    { id: 'reminders', label: 'Reminders' },
    { id: 'safe-zone', label: 'Safe Zone' },
    { id: 'sos-alerts', label: 'SOS' },
    { id: 'contacts', label: 'Contacts' },
    { id: 'cognitive-report', label: 'Cognitive' },
  ]

  return (
    <main className="caretaker-shell">
      <nav className="caretaker-header" aria-label="Caretaker navigation">
        <div className="header-actions">
          <button type="button" onClick={onLogout}>
            <ArrowLeft size={17} />
            Back
          </button>
        </div>
      </nav>

      <section className="caretaker-workspace">
        <aside className="tab-sidebar">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`tab-button ${activeTab === tab.id ? 'is-active' : ''}`}
              type="button"
              onClick={() => setActiveTab(tab.id)}
            >
              <span>{tab.label}</span>
            </button>
          ))}
        </aside>

        <section className="tab-panel">

          {/* ── Contacts ── */}
          {activeTab === 'contacts' && (
            <div className="dashboard-stack">
              <section className="dashboard-grid contacts-grid">
                <form className="panel-card form-card" onSubmit={handleSubmit}>
                  <div className="panel-head">
                    <h2>Add contact</h2>
                    <p>Build the recognition database for the patient.</p>
                  </div>
                  <section className="capture-panel" aria-label="Capture face photo">
                    <video
                      ref={captureVideoRef}
                      className={`capture-feed ${isMirrored ? 'mirrored-feed' : ''}`}
                      autoPlay
                      muted
                      playsInline
                    />
                    {!isCameraLive && <p>{cameraStatus}</p>}
                    <button type="button" onClick={handleCapturePhoto}>
                      Click picture
                    </button>
                  </section>

                  <label className="image-drop">
                    {imagePreviews.length > 0 ? (
                      <img src={imagePreviews[imagePreviews.length - 1]} alt="" />
                    ) : (
                      <span>
                        <Upload size={24} />
                        Upload or capture face samples
                      </span>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(event) => handleImageChange(event.target.files?.[0] ?? null)}
                    />
                  </label>

                  {imagePreviews.length > 0 && (
                    <div className="sample-strip" aria-label="Captured face samples">
                      {imagePreviews.map((preview, index) => (
                        <button
                          key={`${preview}-${index}`}
                          type="button"
                          onClick={() => handleRemoveSample(index)}
                          aria-label={`Remove sample ${index + 1}`}
                        >
                          <img src={preview} alt="" />
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="form-grid">
                    <label>
                      Name
                      <input
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        placeholder="Sarah Smith"
                      />
                    </label>
                    <label>
                      Relation
                      <input
                        value={relation}
                        onChange={(event) => setRelation(event.target.value)}
                        placeholder="Daughter"
                      />
                    </label>
                    <label>
                      Group
                      <select value={group} onChange={(event) => setGroup(event.target.value)}>
                        {groupOptions.map((option) => (
                          <option key={option}>{option}</option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <label>
                    Card conversation summary
                    <textarea
                      value={summary}
                      onChange={(event) => setSummary(event.target.value)}
                      placeholder="Last discussed dinner plans, family updates, and tomorrow's doctor visit."
                    />
                  </label>

                  <button className="save-person" type="submit" disabled={isSaving}>
                    {isSaving ? 'Adding contact...' : 'Add for recognition'}
                  </button>
                </form>

                {/* ── Contacts photo grid ── */}
                <article className="panel-card">
                  <div className="toolbar-row" style={{ marginBottom: 12 }}>
                    <div className="filter-row" aria-label="Filter people">
                      {activeGroups.map((option) => (
                        <button
                          key={option}
                          type="button"
                          aria-pressed={filter === option}
                          onClick={() => setFilter(option)}
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                    <button className="clear-faces" type="button" onClick={handleClearPeople}>
                      Clear all
                    </button>
                  </div>

                  {visiblePeople.length === 0 ? (
                    <p className="empty-people">No contacts in this group yet.</p>
                  ) : (
                    <div className="contact-grid">
                      {visiblePeople.map((person) => (
                        <button
                          key={person.id}
                          className="contact-grid-card"
                          type="button"
                          onClick={() => {
                            setModalPersonId(person.id)
                            setSelectedContactId(person.id)
                            setExtraImageFiles([])
                            setExtraImagePreviews([])
                          }}
                        >
                          {person.imageDataUrl ? (
                            <img className="contact-grid-img" src={person.imageDataUrl} alt="" />
                          ) : (
                            <div className="contact-grid-initial">{person.name.charAt(0)}</div>
                          )}
                          <span className="contact-grid-name">{person.name}</span>
                          <span className="contact-grid-relation">{person.relation}</span>
                          <span className="contact-grid-count">{person.descriptors.length} sample{person.descriptors.length !== 1 ? 's' : ''}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </article>
              </section>
            </div>
          )}

          {/* ── Contact profile modal ── */}
          {modalPersonId && (() => {
            const mp = people.find((p) => p.id === modalPersonId)
            if (!mp) return null
            return (
              <div className="modal-backdrop" onClick={() => setModalPersonId(null)}>
                <div className="modal-box" onClick={(e) => e.stopPropagation()}>
                  <div className="modal-header">
                    <div className="modal-avatar-row">
                      {mp.imageDataUrl ? (
                        <img className="modal-avatar" src={mp.imageDataUrl} alt="" />
                      ) : (
                        <div className="modal-avatar-initial">{mp.name.charAt(0)}</div>
                      )}
                      <div className="modal-avatar-meta">
                        <strong>{mp.name}</strong>
                        <span>{mp.relation} · {mp.group}</span>
                        <span>{mp.descriptors.length} recognition sample{mp.descriptors.length !== 1 ? 's' : ''}</span>
                      </div>
                    </div>
                    <button className="modal-close" type="button" onClick={() => setModalPersonId(null)} aria-label="Close">✕</button>
                  </div>

                  <div className="modal-body">
                    <p className="modal-section-title">Conversation summary</p>
                    <div className="summary-workflow">
                      <label>
                        Visit transcript
                        <textarea
                          value={transcriptDraft}
                          onChange={(event) => {
                            setTranscriptDraft(event.target.value)
                            transcriptDraftRef.current = event.target.value
                          }}
                          placeholder="Speak or type notes from the latest visit."
                        />
                      </label>
                      <div className="inline-actions">
                        <button type="button" onClick={noteListening ? handleStopContactTranscript : handleStartContactTranscript}>
                          {noteListening ? 'Stop and save' : 'Start note mic'}
                        </button>
                        <button type="button" onClick={handleGenerateSummary} disabled={isSummarizing}>
                          {isSummarizing ? 'Summarizing…' : 'Generate summary'}
                        </button>
                      </div>
                      <label>
                        Memory card summary
                        <textarea
                          value={summaryDraft}
                          onChange={(event) => setSummaryDraft(event.target.value)}
                          placeholder="Shown on the patient face card."
                        />
                      </label>
                    </div>

                    <p className="modal-section-title">Add recognition photos</p>
                    <p style={{ margin: 0, fontSize: '0.84rem', color: '#5d7b92' }}>
                      Capture front-facing shots in different lighting to improve accuracy.
                    </p>
                    <div className="extra-photos-capture-row">
                      <button type="button" onClick={handleExtraCapturePhoto}>Capture photo</button>
                      <label className="extra-upload-label">
                        Upload photo
                        <input type="file" accept="image/*" onChange={(event) => handleExtraImageChange(event.target.files?.[0] ?? null)} />
                      </label>
                    </div>
                    {extraImagePreviews.length > 0 && (
                      <div className="sample-strip">
                        {extraImagePreviews.map((preview, index) => (
                          <button key={`${preview}-${index}`} type="button" onClick={() => handleRemoveExtraSample(index)} aria-label={`Remove sample ${index + 1}`}>
                            <img src={preview} alt="" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="modal-actions">
                    {extraImagePreviews.length > 0 && (
                      <button type="button" onClick={handleSaveExtraPhotos} disabled={isSavingPhotos}>
                        {isSavingPhotos ? 'Processing…' : `Save ${extraImagePreviews.length} photo${extraImagePreviews.length > 1 ? 's' : ''}`}
                      </button>
                    )}
                    <button type="button" className="modal-delete" onClick={() => handleDeletePerson(mp.id)}>
                      Remove contact
                    </button>
                  </div>
                </div>
              </div>
            )
          })()}

          {/* ── Daily Log ── */}
          {activeTab === 'daily-log' && (
            <div className="dashboard-grid">
              <article className="panel-card">
                <div className="panel-head">
                  <h2>Activity feed</h2>
                  <p>Auto-logged face encounters, SOS events, reminders, and caretaker notes.</p>
                </div>
                <div className="filter-row" style={{ marginBottom: 8 }}>
                  {(['all', 'encounter', 'reminder', 'sos', 'note'] as const).map((option) => (
                    <button key={option} type="button" aria-pressed={logFilter === option} onClick={() => setLogFilter(option)}>
                      {option}
                    </button>
                  ))}
                </div>
                <div className="timeline-list">
                  {filteredDailyLog.length === 0 ? (
                    <p className="empty-people">No activity logged yet. Face encounters and SOS events will appear here automatically.</p>
                  ) : (
                    filteredDailyLog.map((entry) => (
                      <div className="timeline-item" key={entry.id}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                          <strong>{entry.title}</strong>
                          <span className={`badge badge--${entry.type === 'sos' ? 'high' : entry.type === 'encounter' ? 'low' : 'pending'}`}>{entry.type}</span>
                        </div>
                        <span style={{ fontSize: '0.8rem', color: '#5d7b92' }}>{formatDateTime(entry.occurredAt)}</span>
                        <p>{entry.summary}</p>
                        {entry.sentiment && <span className={`badge badge--${entry.sentiment === 'Positive' ? 'low' : entry.sentiment === 'Confused' ? 'medium' : 'pending'}`}>{entry.sentiment}</span>}
                      </div>
                    ))
                  )}
                </div>
              </article>

              <form className="panel-card form-card" onSubmit={handleAddManualLog}>
                <div className="panel-head">
                  <h2>Add caretaker note</h2>
                  <p>Record manual observations alongside the auto feed.</p>
                </div>
                <label>Title<input value={manualLogTitle} onChange={(e) => setManualLogTitle(e.target.value)} placeholder="Evening routine check" /></label>
                <label>Note<textarea value={manualLogSummary} onChange={(e) => setManualLogSummary(e.target.value)} placeholder="Patient ate dinner well…" /></label>
                <button type="submit">Save note</button>
              </form>
            </div>
          )}

          {/* ── Unknown Queue ── */}
          {activeTab === 'unknown-queue' && (
            <article className="panel-card">
              <div className="panel-head">
                <h2>Unknown visitors</h2>
                <p>Faces the patient flagged but couldn't identify. Review and take action.</p>
              </div>
              <div className="stack-list">
                {dashboard.unknownQueue.length === 0 ? (
                  <p className="empty-people">No flagged visitors yet.</p>
                ) : (
                  dashboard.unknownQueue.map((item) => (
                    <div className="list-card" key={item.id}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                        <strong>{item.heardName}</strong>
                        <span className={`badge badge--${item.status}`}>{item.status}</span>
                      </div>
                      <span style={{ fontSize: '0.8rem', color: '#5d7b92' }}>{formatDateTime(item.flaggedAt)} · Emotional state: {item.emotionalState}</span>
                      <p>{item.snippet}</p>
                      <div className="inline-actions">
                        <button type="button" onClick={() => handleQueueToContact(item)}>Add as contact</button>
                        <button type="button" onClick={() => updateDashboard((cur) => ({ ...cur, unknownQueue: cur.unknownQueue.map((e) => e.id === item.id ? { ...e, status: 'follow-up' } : e) }))}>
                          Follow-up
                        </button>
                        <button type="button" onClick={() => updateDashboard((cur) => ({ ...cur, unknownQueue: cur.unknownQueue.map((e) => e.id === item.id ? { ...e, status: 'dismissed' } : e) }))}>
                          Dismiss
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </article>
          )}

          {/* ── Visitor Schedule ── */}
          {activeTab === 'visitor-schedule' && (
            <div className="dashboard-grid">
              <form className="panel-card form-card" onSubmit={handleScheduleVisitor}>
                <div className="panel-head">
                  <h2>Schedule a visit</h2>
                  <p>Prepare the patient with context before a visitor arrives.</p>
                </div>
                <label>
                  Visitor
                  <select value={visitorPersonId} onChange={(e) => setVisitorPersonId(e.target.value)}>
                    {people.length === 0 && <option value="">— Add contacts first —</option>}
                    {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </label>
                <label>Date &amp; time<input type="datetime-local" value={visitorDate} onChange={(e) => setVisitorDate(e.target.value)} /></label>
                <label>
                  Briefing context
                  <textarea value={visitorContext} onChange={(e) => setVisitorContext(e.target.value)} placeholder="Sarah is bringing photos from last summer. She has news about the move." />
                </label>
                <button type="submit">Schedule visit</button>
              </form>

              <article className="panel-card">
                <div className="panel-head">
                  <h2>Upcoming visits</h2>
                  <p>{dashboard.visitorSchedule.length} visit{dashboard.visitorSchedule.length !== 1 ? 's' : ''} scheduled</p>
                </div>
                <div className="stack-list">
                  {dashboard.visitorSchedule.length === 0 ? (
                    <p className="empty-people">No visits scheduled yet.</p>
                  ) : (
                    dashboard.visitorSchedule.map((visit) => {
                      const person = people.find((p) => p.id === visit.personId)
                      return (
                        <div className="list-card" key={visit.id}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                            <strong>{person?.name ?? 'Unknown visitor'}</strong>
                            <span className={`badge badge--${visit.status === 'Scheduled' ? 'pending' : visit.status === 'Visited' ? 'low' : 'high'}`}>{visit.status}</span>
                          </div>
                          <span style={{ fontSize: '0.8rem', color: '#5d7b92' }}>{formatDateTime(visit.visitDate)}</span>
                          <p>{visit.context}</p>
                        </div>
                      )
                    })
                  )}
                </div>
              </article>
            </div>
          )}

          {/* ── Reminders ── */}
          {activeTab === 'reminders' && (
            <div className="dashboard-grid">
              <form className="panel-card form-card" onSubmit={handleAddReminder}>
                <div className="panel-head">
                  <h2>Create reminder</h2>
                  <p>Fires an overlay on the patient's camera screen at the set time.</p>
                </div>
                <label>Title<input value={reminderTitle} onChange={(e) => setReminderTitle(e.target.value)} placeholder="Blood pressure tablet" /></label>
                <div className="form-grid">
                  <label>
                    Category
                    <select value={selectedReminderCategory} onChange={(e) => setSelectedReminderCategory(e.target.value as ReminderItem['category'])}>
                      {['Medication', 'Hydration', 'Exercise', 'Call', 'Other'].map((o) => <option key={o}>{o}</option>)}
                    </select>
                  </label>
                  <label>
                    Priority
                    <select value={reminderPriority} onChange={(e) => setReminderPriority(e.target.value as ReminderItem['priority'])}>
                      {['Low', 'Medium', 'High'].map((o) => <option key={o}>{o}</option>)}
                    </select>
                  </label>
                </div>
                <label>Date &amp; time<input type="datetime-local" value={reminderDatetime} onChange={(e) => setReminderDatetime(e.target.value)} /></label>
                <label>
                  Recurring
                  <select value={reminderRecurring} onChange={(e) => setReminderRecurring(e.target.value as ReminderItem['recurring'])}>
                    <option value="none">One-time</option>
                    <option value="daily">Daily</option>
                    <option value="weekdays">Weekdays (Mon–Fri)</option>
                    <option value="weekly">Weekly — pick days</option>
                  </select>
                </label>
                {reminderRecurring === 'weekly' && (
                  <div className="dow-picker">
                    {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((day, i) => (
                      <button
                        key={day}
                        type="button"
                        className={`dow-btn ${reminderDays.includes(i) ? 'is-on' : ''}`}
                        onClick={() => setReminderDays((prev) => prev.includes(i) ? prev.filter((d) => d !== i) : [...prev, i])}
                      >
                        {day}
                      </button>
                    ))}
                  </div>
                )}
                <label>
                  Message shown to patient
                  <textarea value={reminderMessage} onChange={(e) => setReminderMessage(e.target.value)} placeholder="Time for your blood pressure tablet. It's in the kitchen cabinet, top shelf." />
                </label>
                <button type="submit">Save reminder</button>
              </form>

              <article className="panel-card">
                <div className="panel-head">
                  <h2>Saved reminders</h2>
                  <p>{dashboard.reminders.length} reminder{dashboard.reminders.length !== 1 ? 's' : ''} scheduled</p>
                </div>
                <div className="stack-list">
                  {dashboard.reminders.length === 0 ? (
                    <p className="empty-people">No reminders yet.</p>
                  ) : (
                    dashboard.reminders.map((r) => (
                      <div className="reminder-card" key={r.id}>
                        <div className="reminder-card-header">
                          <strong>{r.title}</strong>
                          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                            <span className={`badge badge--${r.priority === 'High' ? 'high' : r.priority === 'Medium' ? 'medium' : 'low'}`}>{r.priority}</span>
                            <span className={`badge badge--${r.status === 'Active' ? 'active' : r.status === 'Missed' ? 'missed' : 'acknowledged'}`}>{r.status}</span>
                          </div>
                        </div>
                        <span className="reminder-card-meta">{r.category} · {r.scheduleLabel}</span>
                        <p className="reminder-card-msg">{r.message}</p>
                        <button type="button" style={{ marginTop: 4, alignSelf: 'start', color: '#8b1a1a', background: '#fde8e8', borderColor: '#f5c6c6', fontSize: '0.8rem', padding: '5px 10px', minHeight: 'unset' }} onClick={() => handleDeleteReminder(r.id)}>
                          Delete
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </article>
            </div>
          )}

          {/* ── Cognitive Report ── */}
          {activeTab === 'cognitive-report' && (
            <article className="panel-card">
              <div className="panel-head">
                <h2>Cognitive observations</h2>
                <p>AI-detected and caretaker-recorded cognitive events. Share with the medical team at next review.</p>
              </div>
              <div className="stack-list">
                {dashboard.cognitiveObservations.length === 0 ? (
                  <p className="empty-people">No cognitive observations recorded yet.</p>
                ) : (
                  dashboard.cognitiveObservations.map((obs) => (
                    <div className={`obs-card obs-card--${obs.severity.toLowerCase()}`} key={obs.id}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                        <strong>{obs.title}</strong>
                        <span className={`badge badge--${obs.severity === 'High' ? 'high' : obs.severity === 'Medium' ? 'medium' : 'low'}`}>{obs.severity}</span>
                      </div>
                      <div className="obs-card-meta">
                        <span>{formatShortDate(obs.date)}</span>
                        <span>Source: {obs.source}</span>
                      </div>
                      <p>{obs.actionTaken}</p>
                    </div>
                  ))
                )}
              </div>
            </article>
          )}

          {/* ── Safe Zone ── */}
          {activeTab === 'safe-zone' && (
            <div className="dashboard-grid">
              <article className="panel-card form-card">
                <div className="panel-head">
                  <h2>Safe zone settings</h2>
                  <p>Define where the patient is allowed to be and add trusted destinations.</p>
                </div>

                <label>
                  Home address
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      value={dashboard.safeZone.homeAddress || homeAddressDraft}
                      readOnly={!!dashboard.safeZone.homeAddress}
                      onChange={(e) => setHomeAddressDraft(e.target.value)}
                      placeholder="950 Main St, Worcester, MA"
                      style={{ flex: 1 }}
                    />
                    {!dashboard.safeZone.homeAddress && (
                      <button type="button" onClick={handleSetHomeAddress} style={{ flexShrink: 0 }}>Set</button>
                    )}
                    {dashboard.safeZone.homeAddress && (
                      <button type="button" style={{ flexShrink: 0 }} onClick={() => updateDashboard((c) => ({ ...c, safeZone: { ...c.safeZone, homeAddress: '' } }))}>Edit</button>
                    )}
                  </div>
                </label>

                <label>
                  Safe radius
                  <div className="radius-display">
                    <span>Allowed area around home</span>
                    <strong>{dashboard.safeZone.radiusMeters} m</strong>
                  </div>
                  <input
                    type="range" min="100" max="2000" step="50"
                    value={dashboard.safeZone.radiusMeters}
                    onChange={(e) => updateDashboard((c) => ({ ...c, safeZone: { ...c.safeZone, radiusMeters: Number(e.target.value) } }))}
                  />
                  <span style={{ fontSize: '0.78rem', color: '#5d7b92' }}>100 m — 2 km</span>
                </label>

                <label>
                  Add trusted location
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input value={trustedLocationDraft} onChange={(e) => setTrustedLocationDraft(e.target.value)} placeholder="Neighborhood park" style={{ flex: 1 }} />
                    <button type="button" onClick={handleAddTrustedLocation} style={{ flexShrink: 0 }}>Add</button>
                  </div>
                </label>
              </article>

              <article className="panel-card">
                <div className="panel-head">
                  <h2>Trusted locations</h2>
                  <p>Places the patient is expected to visit independently.</p>
                </div>
                {dashboard.safeZone.trustedLocations.length === 0 ? (
                  <p className="empty-people">No trusted locations added yet.</p>
                ) : (
                  <div className="pill-row">
                    {dashboard.safeZone.trustedLocations.map((loc) => (
                      <span className="trusted-pill" key={loc}>
                        {loc}
                        <button type="button" onClick={() => handleRemoveTrustedLocation(loc)} aria-label={`Remove ${loc}`}>✕</button>
                      </span>
                    ))}
                  </div>
                )}

                <div className="panel-head" style={{ marginTop: 18 }}>
                  <h2>Exit history</h2>
                  <p>Recent times the patient left the safe zone.</p>
                </div>
                <div className="stack-list">
                  {dashboard.safeZone.exitHistory.length === 0 ? (
                    <p className="empty-people">No exit events recorded yet.</p>
                  ) : (
                    dashboard.safeZone.exitHistory.map((ev) => (
                      <div className="list-card" key={ev.id}>
                        <strong>{ev.location}</strong>
                        <span style={{ fontSize: '0.8rem', color: '#5d7b92' }}>{formatDateTime(ev.time)} · {ev.durationMinutes} min outside</span>
                      </div>
                    ))
                  )}
                </div>
              </article>
            </div>
          )}

          {/* ── SOS Alerts ── */}
          {activeTab === 'sos-alerts' && (
            <article className="panel-card">
              <div className="panel-head">
                <h2>SOS alerts</h2>
                <p>Click an alert to view details and resolve it.</p>
              </div>
              <div className="stack-list">
                {dashboard.sosAlerts.length === 0 ? (
                  <p className="empty-people">No SOS alerts yet.</p>
                ) : (
                  dashboard.sosAlerts.map((alert) => (
                    <div
                      className="sos-card"
                      key={alert.id}
                      onClick={() => setExpandedSosId(expandedSosId === alert.id ? null : alert.id)}
                    >
                      <div className="sos-card-header">
                        <div>
                          <strong style={{ display: 'block', marginBottom: 2 }}>{alert.trigger}</strong>
                          <span style={{ fontSize: '0.8rem', color: '#5d7b92' }}>{formatDateTime(alert.time)}</span>
                        </div>
                        <span className={`badge badge--${alert.status === 'Open' ? 'open' : 'resolved'}`}>{alert.status}</span>
                      </div>

                      {expandedSosId === alert.id && (
                        <div className="sos-card-body">
                          <div className="sos-card-meta">
                            <span>📍 {alert.location}</span>
                            {alert.latitude && <span>Lat {alert.latitude.toFixed(4)}, Lng {alert.longitude?.toFixed(4)}</span>}
                          </div>
                          <p>"{alert.transcript}"</p>
                          {alert.note && <p style={{ fontStyle: 'italic' }}>Note: {alert.note}</p>}
                          {alert.status === 'Open' && (
                            <div className="sos-resolve-row">
                              <textarea
                                value={sosNoteDraft}
                                onChange={(e) => setSosNoteDraft(e.target.value)}
                                placeholder="Describe how this was resolved…"
                                onClick={(e) => e.stopPropagation()}
                              />
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleResolveAlert(alert.id)
                                  setExpandedSosId(null)
                                }}
                              >
                                Mark resolved
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </article>
          )}

        </section>
      </section>

      {status && <p className="form-status caretaker-status">{status}</p>}
    </main>
  )
}

export default App
