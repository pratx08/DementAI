import { useEffect, useRef, useState } from 'react'
import { appConfig } from '../config/appConfig'

export function useCamera(facingMode: 'environment' | 'user' = 'environment') {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [cameraStatus, setCameraStatus] = useState('Starting camera...')
  const [isCameraLive, setIsCameraLive] = useState(false)

  useEffect(() => {
    let stream: MediaStream | null = null
    let isMounted = true

    async function startCamera() {
      try {
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

  return { videoRef, cameraStatus, isCameraLive }
}
