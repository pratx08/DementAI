import { useEffect, useRef, useState } from 'react'
import { appConfig } from '../config/appConfig'

export type CameraFacingMode = 'environment' | 'user'

export function useCamera(initialFacingMode: CameraFacingMode = 'user') {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [facingMode, setFacingMode] =
    useState<CameraFacingMode>(initialFacingMode)
  const [cameraStatus, setCameraStatus] = useState('Starting camera...')
  const [isCameraLive, setIsCameraLive] = useState(false)

  useEffect(() => {
    let stream: MediaStream | null = null
    let isMounted = true

    async function attachStream(nextStream: MediaStream) {
      const video = videoRef.current

      if (!video || !isMounted) {
        return false
      }

      video.srcObject = nextStream

      try {
        await video.play()
      } catch {
        await new Promise<void>((resolve) => {
          video.onloadedmetadata = () => resolve()
        })
        await video.play().catch(() => undefined)
      }

      return true
    }

    async function startCamera() {
      try {
        setCameraStatus('Starting camera...')
        setIsCameraLive(false)

        if (!navigator.mediaDevices?.getUserMedia) {
          setCameraStatus('Camera is not available in this browser')
          return
        }

        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: facingMode },
              width: { ideal: appConfig.camera.width },
              height: { ideal: appConfig.camera.height },
              frameRate: {
                ideal: appConfig.camera.frameRate,
                max: appConfig.camera.frameRate,
              },
            },
            audio: false,
          })
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode:
                facingMode === 'user'
                  ? 'user'
                  : { ideal: 'environment' },
            },
            audio: false,
          })
        }

        const didAttach = await attachStream(stream)

        if (!didAttach) {
          return
        }

        setCameraStatus('Camera live')
        setIsCameraLive(true)
      } catch (error) {
        setIsCameraLive(false)
        const message =
          error instanceof DOMException
            ? error.name === 'NotAllowedError'
              ? 'Allow camera access to continue'
              : error.name === 'NotFoundError'
                ? 'No camera was found on this device'
                : error.name === 'NotReadableError'
                  ? 'Camera is busy in another app or tab'
                  : 'Camera could not start'
            : 'Camera could not start'
        setCameraStatus(message)
      }
    }

    startCamera()

    return () => {
      isMounted = false
      stream?.getTracks().forEach((track) => track.stop())
    }
  }, [facingMode])

  function flipCamera() {
    setFacingMode((current) =>
      current === 'user' ? 'environment' : 'user',
    )
  }

  return {
    videoRef,
    cameraStatus,
    isCameraLive,
    facingMode,
    flipCamera,
    isMirrored: facingMode === 'user',
  }
}
