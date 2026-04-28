import { useCallback, useEffect, useState } from 'react'
import { appConfig } from '../config/appConfig'

export type CameraFacingMode = 'environment' | 'user'

export function useCamera(initialFacingMode: CameraFacingMode = 'user') {
  const [facingMode, setFacingMode] =
    useState<CameraFacingMode>(initialFacingMode)
  const [cameraStatus, setCameraStatus] = useState('Starting camera...')
  const [isCameraLive, setIsCameraLive] = useState(false)
  // A callback ref exposes the actual DOM element as React state so the
  // camera effect re-runs whenever the element mounts or unmounts — this
  // fixes the case where <video> is inside a conditional (e.g. a tab panel)
  // and gets removed and reinserted when the user switches tabs.
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null)

  const videoRef = useCallback((el: HTMLVideoElement | null) => {
    setVideoEl(el)
  }, [])

  useEffect(() => {
    if (!videoEl) return

    // Capture in a non-nullable local so TypeScript can track it through
    // the async startCamera function without repeated null checks.
    const video = videoEl
    let isMounted = true
    let stream: MediaStream | null = null

    async function startCamera() {
      try {
        setCameraStatus('Starting camera...')
        setIsCameraLive(false)

        if (!navigator.mediaDevices?.getUserMedia) {
          setCameraStatus('Camera is not available in this browser')
          return
        }

        try {
          video.muted = true
          video.autoplay = true
          video.playsInline = true

          const videoConstraints: MediaTrackConstraints & {
            resizeMode?: string
          } = {
            facingMode: { ideal: facingMode },
            width: { ideal: appConfig.camera.width },
            height: { ideal: appConfig.camera.height },
            frameRate: {
              min: 30,
              ideal: appConfig.camera.frameRate,
              max: appConfig.camera.frameRate,
            },
            resizeMode: 'crop-and-scale',
          }

          stream = await navigator.mediaDevices.getUserMedia({
            video: videoConstraints,
            audio: false,
          })
        } catch {
          // Fall back to a minimal constraint set if the ideal spec is rejected.
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

        if (!isMounted) {
          stream?.getTracks().forEach((t) => t.stop())
          return
        }

        video.srcObject = stream

        try {
          await video.play()
        } catch {
          await new Promise<void>((resolve) => {
            video.onloadedmetadata = () => resolve()
          })
          await video.play().catch(() => undefined)
        }

        if (isMounted) {
          setCameraStatus('Camera live')
          setIsCameraLive(true)
        }
      } catch (error) {
        if (isMounted) {
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
    }

    startCamera()

    return () => {
      isMounted = false
      stream?.getTracks().forEach((track) => track.stop())
      setIsCameraLive(false)
    }
  }, [videoEl, facingMode])

  function flipCamera() {
    setFacingMode((current) =>
      current === 'user' ? 'environment' : 'user',
    )
  }

  return {
    videoRef,
    videoEl,
    cameraStatus,
    isCameraLive,
    facingMode,
    flipCamera,
    isMirrored: facingMode === 'user',
  }
}
