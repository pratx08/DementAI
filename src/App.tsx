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
  Home,
  Mic,
  MicOff,
  MapPin,
  Upload,
} from 'lucide-react'
import { appConfig } from './config/appConfig'
import { DirectionsMap } from './components/DirectionsMap'
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
  loadDashboardState,
  saveDashboardState,
  updateStoredDashboardState,
  type CognitiveObservation,
  type DashboardState,
  type DailyLogEntry,
  type ReminderItem,
  type SosAlert,
  type UnknownQueueItem,
} from './services/dashboardData'
import { hasHighValueContent, importanceScore, summarizeConversation } from './services/summary'
import { fetchStoredSummary, persistSummary } from './services/mongoService'
import type { CSSProperties, FormEvent } from 'react'
import type { FaceBox } from './services/mediaPipeFaceDetection'

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
  | 'contacts'
  | 'daily-log'
  | 'unknown-queue'
  | 'visitor-schedule'
  | 'reminders'
  | 'cognitive-report'
  | 'safe-zone'
  | 'sos-alerts'

const groupOptions = ['Family', 'Friends', 'Caregiver', 'Medical', 'Other']
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
  const boxHeight = box.height * scale
  const displayedLeft = isMirrored ? frameWidth - boxLeft - boxWidth : boxLeft
  const cardWidth = Math.min(280, Math.max(210, frameWidth * 0.3))
  const rightRailSpace = frameWidth <= 720 ? 86 : 18
  const leftOfHead = displayedLeft - cardWidth - 16
  const left = Math.min(
    Math.max(leftOfHead, 14),
    frameWidth - cardWidth - rightRailSpace,
  )

  return {
    left,
    top: Math.min(Math.max(boxTop + boxHeight * 0.16, 14), frameHeight - 120),
  }
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

function getRelativeTime(value?: string) {
  if (!value) {
    return 'No recent visits'
  }

  const diff = Date.now() - new Date(value).getTime()
  const days = Math.max(0, Math.floor(diff / (24 * 60 * 60 * 1000)))

  if (days === 0) {
    return 'Today'
  }

  if (days === 1) {
    return '1 day ago'
  }

  return `${days} days ago`
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
  const [role, setRole] = useState<UserRole | null>(null)

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
    cameraStatus,
    isCameraLive,
    isMirrored,
  } = useCamera()
  const [recognized, setRecognized] = useState<KnownPersonProfile | null>(null)
  const [knownPeople, setKnownPeople] = useState<KnownPersonProfile[]>([])
  const [faceAnchor, setFaceAnchor] = useState<FaceAnchor | null>(null)
  const [showMap, setShowMap] = useState(false)
  const [currentLocation, setCurrentLocation] =
    useState<GeolocationCoordinates | null>(null)
  const [locationStatus, setLocationStatus] = useState('Waiting for location')
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
  const recognizedRef = useRef<KnownPersonProfile | null>(null)
  const speechTranscriptRef = useRef('')
  const lastNativePartialRef = useRef('')
  const silenceTimerRef = useRef<number | null>(null)
  const isSummarizingFaceRef = useRef(false)
  // Tracks the most recently persisted summary per personId so the
  // comparison is never stale even before React state propagates.
  const computedSummariesRef = useRef<Map<string, string>>(new Map())
  const [captionText, setCaptionText] = useState('')
  const [micEnabled, setMicEnabled] = useState(false)
  const [micStatus, setMicStatus] = useState('')
  const [liveFaceSummary, setLiveFaceSummary] = useState<string | null>(null)
  const destination = useMemo(
    () => ({
      label: appConfig.map.destinationLabel,
      address: appConfig.map.destinationAddress,
      latitude: appConfig.map.latitude,
      longitude: appConfig.map.longitude,
    }),
    [],
  )
  const isNativeApp = Capacitor.isNativePlatform()
  const webSpeech = useSpeechRecognition()
  const webCaption = getLiveCaption(
    webSpeech.interimTranscript,
    webSpeech.finalTranscript || webSpeech.transcript,
  )
  const resetWebTranscript = webSpeech.resetTranscript

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

    // Person changed — reset all speech state
    speechTranscriptRef.current = ''
    lastNativePartialRef.current = ''
    setLiveFaceSummary(null)
    if (silenceTimerRef.current) {
      window.clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = null
    }

    if (!recognized) return

    // Pull the persisted summary from MongoDB and show it right away.
    // Falls back silently to whatever is already in localStorage.
    const personId = recognized.id
    fetchStoredSummary(personId).then((stored) => {
      if (!stored) return
      // Only apply if this person is still on screen
      if (recognizedRef.current?.id !== personId) return
      computedSummariesRef.current.set(personId, stored)
      setLiveFaceSummary(stored)
      setRecognized((current) =>
        current?.id === personId ? { ...current, lastConversationSummary: stored } : current,
      )
    })
  }, [recognized])

  useEffect(() => {
    if (!showMap) {
      return
    }

    if (!navigator.geolocation) {
      setLocationStatus('Location is not available')
      return
    }

    setLocationStatus('Getting current location')
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCurrentLocation(position.coords)
        setLocationStatus('Route starts from your current location')
      },
      () => {
        setLocationStatus('Allow location for live directions')
      },
      {
        enableHighAccuracy: true,
        maximumAge: 15000,
        timeout: 10000,
      },
    )
  }, [showMap])

  useEffect(() => {
    if (!webCaption || isNativeApp) {
      return
    }

    setCaptionText(webCaption)
  }, [isNativeApp, webCaption])

  useEffect(() => {
    if (!captionText) {
      return
    }

    if (captionTimerRef.current) {
      window.clearTimeout(captionTimerRef.current)
    }

    captionTimerRef.current = window.setTimeout(() => {
      setCaptionText('')
      resetWebTranscript()
    }, 5000)

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
      WebSpeechRecognition.stopListening()
      NativeSpeechRecognition.stop().catch(() => undefined)
      NativeSpeechRecognition.removeAllListeners().catch(() => undefined)
    },
    [],
  )

  const handleFaceSpeechStopped = useCallback(async () => {
    if (isSummarizingFaceRef.current) return
    const person = recognizedRef.current
    const transcript = speechTranscriptRef.current.trim()
    if (!person || transcript.length < 15) return

    // Clear accumulator before the async work so new speech starts fresh
    speechTranscriptRef.current = ''
    isSummarizingFaceRef.current = true

    try {
      const newSummary = await summarizeConversation(transcript)

      // Use computedSummariesRef as the source of truth — it's always current
      // even when React state hasn't propagated yet between renders.
      const personId = person.id
      const existing =
        computedSummariesRef.current.get(personId) ??
        recognizedRef.current?.lastConversationSummary ??
        ''
      const isBlank =
        !existing || existing === 'Conversation summary will appear here after the next visit.'

      let finalSummary: string

      if (isBlank) {
        // First time seeing this person — accept anything
        finalSummary = newSummary
      } else {
        const newScore = importanceScore(newSummary)
        const oldScore = importanceScore(existing)

        // Replace only when the new summary carries genuinely higher-value
        // content (dates, appointments, medicine …) AND outscores the existing one.
        // A casual greeting ("hello how are you") can never displace an
        // appointment detail even if it's long.
        if (hasHighValueContent(newSummary) && newScore > oldScore) {
          finalSummary = newSummary
        } else {
          finalSummary = existing
        }
      }

      // Immediately record the decision so the next run sees the right value
      computedSummariesRef.current.set(personId, finalSummary)

      setLiveFaceSummary(finalSummary)
      setRecognized((current) =>
        current?.id === personId
          ? { ...current, lastConversationSummary: finalSummary }
          : current,
      )
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
    if (silenceTimerRef.current) {
      window.clearTimeout(silenceTimerRef.current)
    }
    silenceTimerRef.current = window.setTimeout(() => {
      silenceTimerRef.current = null
      handleFaceSpeechStopped()
    }, 3500)
  }, [handleFaceSpeechStopped])

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
          setCaptionText(text)
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
    const BrowserSpeechRecognition = getBrowserSpeechRecognition()

    if (!BrowserSpeechRecognition && !webSpeech.browserSupportsSpeechRecognition) {
      setMicEnabled(false)
      setMicStatus('CC unavailable in this browser')
      return false
    }

    await requestMicPermission()

    if (BrowserSpeechRecognition) {
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
          setCaptionText(text)
          resetSilenceTimer()
        }

        if (finalTranscript.trim()) {
          speechTranscriptRef.current = speechTranscriptRef.current
            ? `${speechTranscriptRef.current} ${finalTranscript.trim()}`
            : finalTranscript.trim()
        }
      }
      recognition.onerror = () => {
        setMicEnabled(false)
        setMicStatus('Tap mic to restart CC')
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

    await WebSpeechRecognition.startListening({
      continuous: false,
      language: 'en-US',
    })

    return true
  }

  async function startCaptions() {
    try {
      captionEnabledRef.current = true
      setCaptionText('')

      const didStart = isNativeApp
        ? await startNativeCaptions()
        : await startWebCaptions()

      if (!didStart) {
        captionEnabledRef.current = false
        return
      }

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

    if (isNativeApp) {
      await NativeSpeechRecognition.stop().catch(() => undefined)
      await NativeSpeechRecognition.removeAllListeners().catch(() => undefined)
      nativePartialResultsRef.current = null
      nativeListeningStateRef.current = null
      return
    }

    browserRecognitionRef.current?.stop()
    browserRecognitionRef.current = null
    if (browserRestartTimerRef.current) {
      window.clearTimeout(browserRestartTimerRef.current)
      browserRestartTimerRef.current = null
    }
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
      const video = videoRef.current
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
  }, [isMirrored, videoRef])

  useEffect(() => {
    let isCancelled = false

    async function scan() {
      const video = videoRef.current

      if (video && video.readyState >= 2 && faceAnchorRef.current) {
        try {
          const result = await identifyFace(video, knownPeople)

          if (!isCancelled) {
            setRecognized(result?.profile ?? null)
          }
        } catch {
          if (!isCancelled) {
            setRecognized(null)
          }
        }
      } else {
        if (!isCancelled) {
          setRecognized(null)
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
  }, [knownPeople, videoRef])

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
    const location = showMap
      ? `${appConfig.map.destinationLabel}`
      : 'Patient camera view'

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
          Login
        </button>

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
            <p>
              {micEnabled && captionText
                ? captionText
                : (liveFaceSummary ?? recognized.lastConversationSummary)}
            </p>
          </aside>
        )}

        {showMap && (
          <section className="map-layer" aria-label="Home navigation">
            <DirectionsMap
              origin={currentLocation}
              destination={destination}
              onStatusChange={setLocationStatus}
            />
            <div className="route-card">
              <MapPin size={18} />
              <div>
                <strong>{appConfig.map.destinationLabel}</strong>
                <span>{locationStatus}</span>
              </div>
            </div>
          </section>
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
          <button
            type="button"
            aria-label="Show route home"
            aria-pressed={showMap}
            onClick={() => setShowMap((current) => !current)}
          >
            <Home size={22} />
            <span>Home</span>
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
  const { videoRef: captureVideoRef, cameraStatus, isCameraLive, isMirrored } =
    useCamera('user')
  const [people, setPeople] = useState<KnownPersonProfile[]>([])
  const [dashboard, setDashboard] = useState<DashboardState | null>(null)
  const [status, setStatus] = useState('Ready.')
  const [activeTab, setActiveTab] = useState<CaretakerTab>('contacts')
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
  const [reminderSchedule, setReminderSchedule] = useState('')
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

  useEffect(() => {
    async function loadPeopleAndDashboard() {
      try {
        await loadFaceModels()
        const loadedPeople = await loadKnownPeople()
        setPeople(loadedPeople)
        setDashboard(await loadDashboardState(loadedPeople))
        setSelectedContactId(loadedPeople[0]?.id ?? '')
        setVisitorPersonId(loadedPeople[0]?.id ?? '')
        didLoadRef.current = true
      } catch {
        setStatus('Local face recognition models could not be loaded.')
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
    if (!didLoadRef.current || !dashboard) {
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
    if (!dashboard) {
      return []
    }

    if (logFilter === 'all') {
      return dashboard.dailyLog
    }

    return dashboard.dailyLog.filter((entry) => entry.type === logFilter)
  }, [dashboard, logFilter])

  function updateDashboard(updater: (current: DashboardState) => DashboardState) {
    setDashboard((current) => (current ? updater(current) : current))
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
    const video = captureVideoRef.current

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
    setStatus('Reading face samples in this browser...')

    try {
      const faceDetection = await import('./services/mediaPipeFaceDetection')
      await faceDetection.loadMediaPipeImageFaceDetector()

      for (const file of imageFiles) {
        const mediaPipeFace = await faceDetection.detectFaceInImage(file)

        if (!mediaPipeFace) {
          throw new Error('MediaPipe could not find a clear face in one sample.')
        }
      }

      setStatus('Creating local face descriptors...')
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

    if (!reminderTitle.trim() || !reminderMessage.trim() || !reminderSchedule.trim()) {
      setStatus('Fill in the reminder title, schedule, and message first.')
      return
    }

    updateDashboard((current) => ({
      ...current,
      reminders: [
        {
          id: createLocalId('reminder'),
          title: reminderTitle.trim(),
          category: selectedReminderCategory,
          scheduleLabel: reminderSchedule.trim(),
          message: reminderMessage.trim(),
          priority: reminderPriority,
          status: 'On time',
        },
        ...current.reminders,
      ],
    }))
    setReminderTitle('')
    setReminderMessage('')
    setReminderSchedule('')
    setReminderPriority('Medium')
    setStatus('Reminder saved for the patient overlay schedule.')
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

  if (!dashboard) {
    return (
      <main className="caretaker-shell">
        <section className="loading-panel">
          <strong>Loading...</strong>
        </section>
      </main>
    )
  }

  const tabs: { id: CaretakerTab; label: string }[] = [
    { id: 'contacts', label: 'Contacts' },
    { id: 'daily-log', label: 'Daily Log' },
    { id: 'unknown-queue', label: 'Unknown Queue' },
    { id: 'visitor-schedule', label: 'Visitor Schedule' },
    { id: 'reminders', label: 'Reminders' },
    { id: 'cognitive-report', label: 'Cognitive Report' },
    { id: 'safe-zone', label: 'Safe Zone' },
    { id: 'sos-alerts', label: 'SOS Alerts' },
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

                <article className="panel-card">
                  <div className="panel-head">
                    <h2>Contacts</h2>
                    <p>{people.length} people in the recognition database</p>
                  </div>
                  <div className="toolbar-row">
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
                      Clear added faces
                    </button>
                  </div>

                  <div className="contact-list">
                    {visiblePeople.map((person) => (
                      <button
                        key={person.id}
                        className={`person-row ${selectedContactId === person.id ? 'is-selected' : ''}`}
                        type="button"
                        onClick={() => setSelectedContactId(person.id)}
                      >
                        {person.imageDataUrl ? (
                          <img src={person.imageDataUrl} alt="" />
                        ) : (
                          <div className="person-initial">{person.name.charAt(0)}</div>
                        )}
                        <div>
                          <strong>{person.name}</strong>
                          <span>
                            {person.relation} · {person.group}
                          </span>
                          <p>{person.lastConversationSummary}</p>
                        </div>
                      </button>
                    ))}
                    {visiblePeople.length === 0 && (
                      <p className="empty-people">No people in this group yet.</p>
                    )}
                  </div>

                  {selectedContact && (
                    <div className="detail-card">
                      <div className="panel-head">
                        <h2>{selectedContact.name}</h2>
                        <p>
                          Last visit {getRelativeTime(selectedContact.lastVisitAt)} ·{' '}
                          {selectedContact.visitsThisMonth ?? 0} visits this month
                        </p>
                      </div>
                      <div className="summary-workflow">
                        <label>
                          Visit transcript
                          <textarea
                            value={transcriptDraft}
                            onChange={(event) => {
                              setTranscriptDraft(event.target.value)
                              transcriptDraftRef.current = event.target.value
                            }}
                            placeholder="Use the note mic and speak naturally."
                          />
                        </label>
                        <div className="inline-actions">
                          <button
                            type="button"
                            onClick={
                              noteListening
                                ? handleStopContactTranscript
                                : handleStartContactTranscript
                            }
                          >
                            {noteListening ? 'Stop and save' : 'Start note mic'}
                          </button>
                          <button
                            type="button"
                            onClick={handleGenerateSummary}
                            disabled={isSummarizing}
                          >
                            {isSummarizing ? 'Summarizing...' : 'Generate summary'}
                          </button>
                        </div>
                        <label>
                          Memory card summary
                          <textarea
                            value={summaryDraft}
                            onChange={(event) => setSummaryDraft(event.target.value)}
                            placeholder="The latest summary shown on the patient card."
                          />
                        </label>
                      </div>
                    </div>
                  )}
                </article>
              </section>
            </div>
          )}

          {activeTab === 'daily-log' && (
            <div className="dashboard-grid">
              <article className="panel-card">
                <div className="panel-head">
                  <h2>Daily timeline</h2>
                  <p>Filter and review the patient's day in chronological order.</p>
                </div>
                <div className="filter-row">
                  {(['all', 'encounter', 'reminder', 'sos', 'note'] as const).map((option) => (
                    <button
                      key={option}
                      type="button"
                      aria-pressed={logFilter === option}
                      onClick={() => setLogFilter(option)}
                    >
                      {option}
                    </button>
                  ))}
                </div>
                <div className="timeline-list">
                  {filteredDailyLog.length === 0 ? (
                    <p className="empty-people">No log items yet.</p>
                  ) : (
                    filteredDailyLog.map((entry) => (
                      <div className="timeline-item" key={entry.id}>
                        <strong>{entry.title}</strong>
                        <span>{formatDateTime(entry.occurredAt)}</span>
                        <p>{entry.summary}</p>
                        {entry.sentiment && <small>Sentiment: {entry.sentiment}</small>}
                      </div>
                    ))
                  )}
                </div>
              </article>

              <form className="panel-card form-card" onSubmit={handleAddManualLog}>
                <div className="panel-head">
                  <h2>Add caretaker note</h2>
                  <p>Capture manual observations alongside the AI timeline.</p>
                </div>
                <label>
                  Title
                  <input
                    value={manualLogTitle}
                    onChange={(event) => setManualLogTitle(event.target.value)}
                    placeholder="Evening routine check"
                  />
                </label>
                <label>
                  Note
                  <textarea
                    value={manualLogSummary}
                    onChange={(event) => setManualLogSummary(event.target.value)}
                    placeholder="Patient ate dinner well and responded calmly to the medication reminder."
                  />
                </label>
                <button type="submit">Save daily note</button>
              </form>
            </div>
          )}

          {activeTab === 'unknown-queue' && (
            <article className="panel-card">
              <div className="panel-head">
                <h2>Unknown queue</h2>
                <p>Review flagged visitors and decide how to handle them.</p>
              </div>
              <div className="stack-list">
                {dashboard.unknownQueue.length === 0 ? (
                  <p className="empty-people">No flagged visitors yet.</p>
                ) : (
                  dashboard.unknownQueue.map((item) => (
                    <div className="list-card" key={item.id}>
                      <strong>{item.heardName}</strong>
                      <span>
                        {formatDateTime(item.flaggedAt)} · Emotion: {item.emotionalState}
                      </span>
                      <p>{item.snippet}</p>
                      <div className="inline-actions">
                        <button type="button" onClick={() => handleQueueToContact(item)}>
                          Move to contact form
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            updateDashboard((current) => ({
                              ...current,
                              unknownQueue: current.unknownQueue.map((entry) =>
                                entry.id === item.id ? { ...entry, status: 'follow-up' } : entry,
                              ),
                            }))
                          }
                        >
                          Flag for follow-up
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            updateDashboard((current) => ({
                              ...current,
                              unknownQueue: current.unknownQueue.map((entry) =>
                                entry.id === item.id ? { ...entry, status: 'dismissed' } : entry,
                              ),
                            }))
                          }
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </article>
          )}

          {activeTab === 'visitor-schedule' && (
            <div className="dashboard-grid">
              <form className="panel-card form-card" onSubmit={handleScheduleVisitor}>
                <div className="panel-head">
                  <h2>Schedule a visitor briefing</h2>
                  <p>Prepare the patient with context before a visit begins.</p>
                </div>
                <label>
                  Visitor
                  <select
                    value={visitorPersonId}
                    onChange={(event) => setVisitorPersonId(event.target.value)}
                  >
                    {people.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Visit date and time
                  <input
                    type="datetime-local"
                    value={visitorDate}
                    onChange={(event) => setVisitorDate(event.target.value)}
                  />
                </label>
                <label>
                  Briefing context
                  <textarea
                    value={visitorContext}
                    onChange={(event) => setVisitorContext(event.target.value)}
                    placeholder="Sarah is visiting today. She has news about the Boston move and will bring photos."
                  />
                </label>
                <button type="submit">Schedule visit</button>
              </form>

              <article className="panel-card">
                <div className="panel-head">
                  <h2>Upcoming visits</h2>
                  <p>Weekly visitor schedule with briefing history.</p>
                </div>
                <div className="stack-list">
                  {dashboard.visitorSchedule.length === 0 ? (
                    <p className="empty-people">No scheduled visits yet.</p>
                  ) : (
                    dashboard.visitorSchedule.map((visit) => {
                      const person = people.find((item) => item.id === visit.personId)
                      return (
                        <div className="list-card" key={visit.id}>
                          <strong>{person?.name ?? 'Unknown visitor'}</strong>
                          <span>
                            {formatDateTime(visit.visitDate)} · {visit.status}
                          </span>
                          <p>{visit.context}</p>
                        </div>
                      )
                    })
                  )}
                </div>
              </article>
            </div>
          )}

          {activeTab === 'reminders' && (
            <div className="dashboard-grid">
              <form className="panel-card form-card" onSubmit={handleAddReminder}>
                <div className="panel-head">
                  <h2>Create reminder</h2>
                  <p>Push a calm overlay directly into the patient view.</p>
                </div>
                <label>
                  Title
                  <input
                    value={reminderTitle}
                    onChange={(event) => setReminderTitle(event.target.value)}
                    placeholder="Blood pressure tablet"
                  />
                </label>
                <div className="form-grid">
                  <label>
                    Category
                    <select
                      value={selectedReminderCategory}
                      onChange={(event) =>
                        setSelectedReminderCategory(
                          event.target.value as ReminderItem['category'],
                        )
                      }
                    >
                      {['Medication', 'Hydration', 'Exercise', 'Call', 'Other'].map((option) => (
                        <option key={option}>{option}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Priority
                    <select
                      value={reminderPriority}
                      onChange={(event) =>
                        setReminderPriority(event.target.value as ReminderItem['priority'])
                      }
                    >
                      {['Low', 'Medium', 'High'].map((option) => (
                        <option key={option}>{option}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <label>
                  Schedule
                  <input
                    value={reminderSchedule}
                    onChange={(event) => setReminderSchedule(event.target.value)}
                    placeholder="Daily, 8:00 PM"
                  />
                </label>
                <label>
                  Overlay message
                  <textarea
                    value={reminderMessage}
                    onChange={(event) => setReminderMessage(event.target.value)}
                    placeholder="Time for your tablet. It is in the kitchen cabinet, top shelf."
                  />
                </label>
                <button type="submit">Save reminder</button>
              </form>

              <article className="panel-card">
                <div className="panel-head">
                  <h2>Reminder queue</h2>
                  <p>Track what was acknowledged, delayed, or missed.</p>
                </div>
                <div className="stack-list">
                  {dashboard.reminders.length === 0 ? (
                    <p className="empty-people">No reminders yet.</p>
                  ) : (
                    dashboard.reminders.map((reminder) => (
                      <div className="list-card" key={reminder.id}>
                        <strong>{reminder.title}</strong>
                        <span>
                          {reminder.category} · {reminder.scheduleLabel} · {reminder.status}
                        </span>
                        <p>{reminder.message}</p>
                      </div>
                    ))
                  )}
                </div>
              </article>
            </div>
          )}

          {activeTab === 'cognitive-report' && (
            <article className="panel-card">
              <div className="stack-list">
                {dashboard.cognitiveObservations.length === 0 ? (
                  <p className="empty-people">No cognitive items yet.</p>
                ) : (
                  dashboard.cognitiveObservations.map(
                    (observation: CognitiveObservation) => (
                      <div className="list-card" key={observation.id}>
                        <strong>{observation.title}</strong>
                        <span>
                          {formatShortDate(observation.date)} · {observation.source} ·{' '}
                          {observation.severity}
                        </span>
                        <p>{observation.actionTaken}</p>
                      </div>
                    ),
                  )
                )}
              </div>
            </article>
          )}

          {activeTab === 'safe-zone' && (
            <div className="dashboard-grid">
              <article className="panel-card form-card">
                <div className="panel-head">
                  <h2>Safe zone</h2>
                  <p>Set the default geofence and trusted destinations.</p>
                </div>
                <label>
                  Radius: {dashboard.safeZone.radiusMeters} meters
                  <input
                    type="range"
                    min="100"
                    max="2000"
                    step="50"
                    value={dashboard.safeZone.radiusMeters}
                    onChange={(event) =>
                      updateDashboard((current) => ({
                        ...current,
                        safeZone: {
                          ...current.safeZone,
                          radiusMeters: Number(event.target.value),
                        },
                      }))
                    }
                  />
                </label>
                <label>
                  Trusted location
                  <input
                    value={trustedLocationDraft}
                    onChange={(event) => setTrustedLocationDraft(event.target.value)}
                    placeholder="Neighborhood park"
                  />
                </label>
                <div className="inline-actions">
                  <button type="button" onClick={handleAddTrustedLocation}>
                    Add trusted location
                  </button>
                </div>
              </article>

              <article className="panel-card">
                <div className="panel-head">
                  <h2>Geofence history</h2>
                  <p>Trusted places and recent exit events.</p>
                </div>
                <div className="detail-card">
                  <label>Trusted locations</label>
                  <div className="pill-row">
                    {dashboard.safeZone.trustedLocations.map((location) => (
                      <span className="pill" key={location}>
                        {location}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="stack-list">
                  {dashboard.safeZone.exitHistory.length === 0 ? (
                    <p className="empty-people">No exit history yet.</p>
                  ) : (
                    dashboard.safeZone.exitHistory.map((event) => (
                      <div className="list-card" key={event.id}>
                        <strong>{event.location}</strong>
                        <span>
                          {formatDateTime(event.time)} · {event.durationMinutes} minutes
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </article>
            </div>
          )}

          {activeTab === 'sos-alerts' && (
            <div className="dashboard-grid">
              <article className="panel-card">
                <div className="panel-head">
                  <h2>SOS alerts</h2>
                  <p>Review distress events and document resolution steps.</p>
                </div>
                <div className="stack-list">
                  {dashboard.sosAlerts.length === 0 ? (
                    <p className="empty-people">No SOS alerts yet.</p>
                  ) : (
                    dashboard.sosAlerts.map((alert: SosAlert) => (
                      <div className="list-card" key={alert.id}>
                        <strong>{alert.id}</strong>
                        <span>
                          {formatDateTime(alert.time)} · {alert.trigger} · {alert.status}
                        </span>
                        <p>{alert.transcript}</p>
                        <small>{alert.location}</small>
                      </div>
                    ))
                  )}
                </div>
              </article>

              <article className="panel-card form-card">
                <div className="panel-head">
                  <h2>Resolve latest alert</h2>
                  <p>Add a note and mark the most recent alert as handled.</p>
                </div>
                <label>
                  Resolution note
                  <textarea
                    value={sosNoteDraft}
                    onChange={(event) => setSosNoteDraft(event.target.value)}
                    placeholder="Caretaker contacted the patient and confirmed they were back inside."
                  />
                </label>
                <button
                  type="button"
                  onClick={() =>
                    dashboard.sosAlerts[0] && handleResolveAlert(dashboard.sosAlerts[0].id)
                  }
                >
                  Mark latest alert resolved
                </button>
              </article>
            </div>
          )}
        </section>
      </section>

      <p className="form-status caretaker-status">{status}</p>
    </main>
  )
}

export default App
