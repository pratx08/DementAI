export const appConfig = {
  camera: {
    width: 960,
    height: 540,
    frameRate: 60,
  },
  recognition: {
    humanModelPath: '/human-models',
    knownFacesPath: '/data/knownFaces.json',
    peopleStorageKey: 'dementai-known-people',
    minRecognitionIntervalMs: 2200,
    minTrackingIntervalMs: 120,
    matchSimilarityThreshold: 0.5,
  },
  mediaPipe: {
    wasmPath: '/mediapipe/wasm',
    faceDetectorModelPath:
      '/mediapipe/models/blaze_face_short_range.tflite',
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
