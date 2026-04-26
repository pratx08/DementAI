import { apiPost } from './apiClient'

function blobToBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = String(reader.result)
      resolve(dataUrl.split(',')[1] ?? '')
    }
    reader.onerror = () => reject(new Error('Audio could not be read.'))
    reader.readAsDataURL(blob)
  })
}

export async function transcribeAudio(blob: Blob) {
  const audioBase64 = await blobToBase64(blob)

  if (!audioBase64) {
    return ''
  }

  const response = await apiPost<{ transcript: string }>('/transcribe', {
    audioBase64,
    mimeType: blob.type || 'audio/webm',
  })

  return response.transcript?.trim() ?? ''
}
