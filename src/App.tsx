import { useEffect, useMemo, useRef, useState } from 'react'
import SpeechRecognition, {
  useSpeechRecognition,
} from 'react-speech-recognition'
import { AlertTriangle, ArrowLeft, Flag, Home, MapPin, Upload } from 'lucide-react'
import { appConfig } from './config/appConfig'
import { DirectionsMap } from './components/DirectionsMap'
import { useCamera } from './hooks/useCamera'
import {
  clearKnownPeople,
  createDescriptorFromImage,
  identifyFace,
  loadFaceModels,
  loadKnownPeople,
  saveKnownPeople,
  type KnownPersonProfile,
} from './services/faceRecognition'
import type { CSSProperties, FormEvent } from 'react'
import type { FaceBox } from './services/mediaPipeFaceDetection'

type UserRole = 'patient' | 'caretaker'
type FaceDetectionApi = typeof import('./services/mediaPipeFaceDetection')

type FaceAnchor = {
  left: number
  top: number
}

const groupOptions = ['Family', 'Friends', 'Caregiver', 'Medical', 'Other']

function getLiveCaption(interimTranscript: string, finalTranscript: string) {
  const liveSpeech = interimTranscript || finalTranscript
  const words = liveSpeech.trim().split(/\s+/).filter(Boolean)

  return words.slice(-10).join(' ')
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Image preview could not be read.'))
    reader.readAsDataURL(file)
  })
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
  const mirroredLeft = frameWidth - boxLeft - boxWidth
  const cardWidth = Math.min(280, Math.max(210, frameWidth * 0.3))
  const leftOfHead = mirroredLeft - cardWidth - 14
  const fallbackRight = mirroredLeft + boxWidth + 14
  const left =
    leftOfHead >= 14
      ? leftOfHead
      : Math.min(Math.max(fallbackRight, 14), frameWidth - cardWidth - 14)

  return {
    left,
    top: Math.min(Math.max(boxTop, 14), frameHeight - 90),
  }
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
  const { videoRef, cameraStatus, isCameraLive } = useCamera()
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
  const destination = useMemo(
    () => ({
      label: appConfig.map.destinationLabel,
      address: appConfig.map.destinationAddress,
      latitude: appConfig.map.latitude,
      longitude: appConfig.map.longitude,
    }),
    [],
  )

  const {
    interimTranscript,
    finalTranscript,
    browserSupportsSpeechRecognition,
    resetTranscript,
  } = useSpeechRecognition()
  const latestCaption = getLiveCaption(interimTranscript, finalTranscript)

  useEffect(() => {
    faceAnchorRef.current = faceAnchor
  }, [faceAnchor])

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
    if (!latestCaption) {
      return
    }

    if (captionTimerRef.current) {
      window.clearTimeout(captionTimerRef.current)
    }

    captionTimerRef.current = window.setTimeout(() => {
      resetTranscript()
    }, 2000)

    return () => {
      if (captionTimerRef.current) {
        window.clearTimeout(captionTimerRef.current)
      }
    }
  }, [latestCaption, resetTranscript])

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

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    if (!browserSupportsSpeechRecognition) {
      return
    }

    SpeechRecognition.startListening({
      continuous: true,
      language: 'en-US',
    })

    return () => {
      SpeechRecognition.stopListening()
    }
  }, [browserSupportsSpeechRecognition])

  useEffect(() => {
    let isCancelled = false

    async function trackFace() {
      const faceDetection = faceDetectionApiRef.current
      const video = videoRef.current
      const frame = frameRef.current

      if (faceDetection && video && frame && video.readyState >= 2) {
        const box = await faceDetection.detectPrimaryFace(video)

        if (!isCancelled) {
          setFaceAnchor(box ? mapFaceBoxToFrame(box, video, frame) : null)
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
  }, [videoRef])

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

  return (
    <main className="app-shell">
      <section
        ref={frameRef}
        className="camera-frame"
        aria-label="DementAI camera interface"
      >
        <video
          ref={videoRef}
          className="camera-feed"
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
            <p>{recognized.lastConversationSummary}</p>
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
          <button className="danger-action" type="button" aria-label="SOS">
            <AlertTriangle size={23} />
            <span>SOS</span>
          </button>
          <button type="button" aria-label="Flag person">
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

        {browserSupportsSpeechRecognition && latestCaption && (
          <section className="captions" aria-live="polite">
            <p>{latestCaption}</p>
          </section>
        )}
      </section>
    </main>
  )
}

function CaretakerDashboard({ onLogout }: { onLogout: () => void }) {
  const {
    videoRef: captureVideoRef,
    cameraStatus,
    isCameraLive,
  } = useCamera('user')
  const [people, setPeople] = useState<KnownPersonProfile[]>([])
  const [filter, setFilter] = useState('All')
  const [status, setStatus] = useState('Ready to add a person.')
  const [imageFiles, setImageFiles] = useState<File[]>([])
  const [imagePreviews, setImagePreviews] = useState<string[]>([])
  const [name, setName] = useState('')
  const [relation, setRelation] = useState('')
  const [group, setGroup] = useState(groupOptions[0])
  const [summary, setSummary] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    async function loadPeople() {
      try {
        await loadFaceModels()
        setPeople(await loadKnownPeople())
      } catch {
        setStatus('Local face recognition models could not be loaded.')
      }
    }

    loadPeople()
  }, [])

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
        descriptors,
      }
      const nextPeople = [profile, ...people.filter((person) => person.id !== profile.id)]

      saveKnownPeople(nextPeople)
      setPeople(nextPeople)
      setImageFiles([])
      setImagePreviews([])
      setName('')
      setRelation('')
      setGroup(groupOptions[0])
      setSummary('')
      setStatus(`${profile.name} is ready for patient camera recognition.`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not add this person.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <main className="caretaker-shell">
      <header className="caretaker-header">
        <div>
          <p>Caretaker</p>
          <h1>Recognition People</h1>
        </div>
        <button type="button" onClick={onLogout}>
          <ArrowLeft size={17} />
          Login
        </button>
      </header>

      <section className="caretaker-layout">
        <form className="enroll-panel" onSubmit={handleSubmit}>
          <h2>Add Person</h2>
          <section className="capture-panel" aria-label="Capture face photo">
            <video
              ref={captureVideoRef}
              className="capture-feed"
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
              onChange={(event) =>
                handleImageChange(event.target.files?.[0] ?? null)
              }
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
                placeholder="Jane Smith"
              />
            </label>
            <label>
              Relation to patient
              <input
                value={relation}
                onChange={(event) => setRelation(event.target.value)}
                placeholder="Daughter"
              />
            </label>
            <label>
              Group
              <select
                value={group}
                onChange={(event) => setGroup(event.target.value)}
              >
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
              placeholder="Recently talked about dinner plans, medication reminders, or family updates."
            />
          </label>

          <button className="save-person" type="submit" disabled={isSaving}>
            {isSaving ? 'Adding face...' : 'Add for recognition'}
          </button>
          <p className="form-status">{status}</p>
        </form>

        <section className="people-panel">
          <div className="people-panel-head">
            <div>
              <h2>Added People</h2>
              <p>{people.filter((person) => person.descriptors.length > 0).length} enrolled</p>
            </div>
            <div className="people-actions">
              <button
                className="clear-faces"
                type="button"
                onClick={handleClearPeople}
              >
                Clear added faces
              </button>
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
            </div>
          </div>

          <div className="people-list">
            {visiblePeople
              .filter((person) => person.descriptors.length > 0)
              .map((person) => (
                <article className="person-row" key={person.id}>
                  {person.imageDataUrl ? (
                    <img src={person.imageDataUrl} alt="" />
                  ) : (
                    <div className="person-initial">{person.name.charAt(0)}</div>
                  )}
                  <div>
                    <strong>{person.name}</strong>
                    <span>
                      {person.relation} - {person.group}
                    </span>
                    <p>{person.lastConversationSummary}</p>
                  </div>
                </article>
              ))}

            {visiblePeople.filter((person) => person.descriptors.length > 0)
              .length === 0 && (
              <p className="empty-people">No people in this group yet.</p>
            )}
          </div>
        </section>
      </section>
    </main>
  )
}

export default App
