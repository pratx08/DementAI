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
    minRecognitionIntervalMs: 2200,
    minTrackingIntervalMs: 120,
    matchSimilarityThreshold: 0.5,
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
