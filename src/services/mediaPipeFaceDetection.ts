import {
  FaceDetector,
  FilesetResolver,
  type Detection,
} from '@mediapipe/tasks-vision'
import { appConfig } from '../config/appConfig'

export type FaceBox = {
  x: number
  y: number
  width: number
  height: number
}

let detectorPromise: Promise<FaceDetector> | null = null
let imageDetectorPromise: Promise<FaceDetector> | null = null

export async function loadMediaPipeFaceDetector() {
  detectorPromise ??= FilesetResolver.forVisionTasks(
    appConfig.mediaPipe.wasmPath,
  ).then((vision) =>
    FaceDetector.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: appConfig.mediaPipe.faceDetectorModelPath,
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      minDetectionConfidence: 0.55,
    }),
  )

  return detectorPromise
}

export async function loadMediaPipeImageFaceDetector() {
  imageDetectorPromise ??= FilesetResolver.forVisionTasks(
    appConfig.mediaPipe.wasmPath,
  ).then((vision) =>
    FaceDetector.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: appConfig.mediaPipe.faceDetectorModelPath,
        delegate: 'GPU',
      },
      runningMode: 'IMAGE',
      minDetectionConfidence: 0.55,
    }),
  )

  return imageDetectorPromise
}

function getScore(detection: Detection) {
  return detection.categories[0]?.score ?? 0
}

export async function detectPrimaryFace(video: HTMLVideoElement) {
  const detector = await loadMediaPipeFaceDetector()
  const result = detector.detectForVideo(video, performance.now())
  const detection = [...result.detections]
    .filter((item) => item.boundingBox)
    .sort((left, right) => getScore(right) - getScore(left))[0]
  const box = detection?.boundingBox

  if (!box) {
    return null
  }

  return {
    x: box.originX,
    y: box.originY,
    width: box.width,
    height: box.height,
  }
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    const objectUrl = URL.createObjectURL(file)

    image.onload = () => {
      URL.revokeObjectURL(objectUrl)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('Image could not be read.'))
    }
    image.src = objectUrl
  })
}

export async function detectFaceInImage(file: File) {
  const detector = await loadMediaPipeImageFaceDetector()
  const image = await loadImage(file)
  const result = detector.detect(image)
  const detection = [...result.detections]
    .filter((item) => item.boundingBox)
    .sort((left, right) => getScore(right) - getScore(left))[0]

  return detection?.boundingBox ?? null
}
