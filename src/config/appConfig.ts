const assetPath = (path: string) =>
  `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`

export const appConfig = {
  camera: {
    width: 960,
    height: 540,
    frameRate: 60,
  },
  recognition: {
    humanModelPath: assetPath('human-models'),
    knownFacesPath: assetPath('data/knownFaces.json'),
    peopleStorageKey: 'dementai-known-people',
    dashboardStorageKey: 'dementai-dashboard-state',
    minRecognitionIntervalMs: 850,
    minTrackingIntervalMs: 90,
    speechPauseMs: 5000,
    captionHoldMs: 1000,
    // Minimum cosine similarity to consider ANY match (Human.js range 0–1).
    // 0.50 was too lenient and caused cross-person false positives.
    matchSimilarityThreshold: 0.74,
    // Best-person score must beat second-best by at least this margin.
    // Prevents ambiguous matches from being accepted.
    matchGapThreshold: 0.10,
    // Same person must win this many consecutive scans before the card appears.
    // Eliminates single-frame false positives.
    temporalConsistencyFrames: 2,
  },
  mediaPipe: {
    wasmPath: assetPath('mediapipe/wasm'),
    faceDetectorModelPath: assetPath(
      'mediapipe/models/blaze_face_short_range.tflite',
    ),
  },
  map: {
    destinationLabel: 'Clark University',
    destinationQuery: 'Clark University Worcester MA',
    destinationAddress: '950 Main St, Worcester, MA',
    latitude: 42.2511,
    longitude: -71.8235,
    zoom: 15,
  },
}
