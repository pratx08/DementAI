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

    async function startCamera() {
      try {
        setCameraStatus('Starting camera...')
        setIsCameraLive(false)

        if (!navigator.mediaDevices?.getUserMedia) {
          setCameraStatus('Camera is not available in this browser')
          return
        }

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

        if (!isMounted || !videoRef.current) {
          return
        }

        videoRef.current.srcObject = stream
        await videoRef.current.play()
        setCameraStatus('Camera live')
        setIsCameraLive(true)
      } catch {
        setIsCameraLive(false)
        setCameraStatus('Camera permission is needed')
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
