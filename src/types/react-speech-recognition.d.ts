declare module 'react-speech-recognition' {
  export type SpeechRecognitionOptions = {
    continuous?: boolean
    language?: string
  }

  export type SpeechRecognitionState = {
    transcript: string
    interimTranscript: string
    finalTranscript: string
    listening: boolean
    browserSupportsSpeechRecognition: boolean
    resetTranscript: () => void
  }

  const SpeechRecognition: {
    startListening: (options?: SpeechRecognitionOptions) => Promise<void>
    stopListening: () => Promise<void>
  }

  export function useSpeechRecognition(): SpeechRecognitionState

  export default SpeechRecognition
}
