# DementAI

Minimal React prototype for an AR-style assistive camera interface. The current build includes:

- A full-screen camera experience framed with a fixed 20px inset.
- Translucent saved-person identity cards for recognized faces.
- Live closed captions through `react-speech-recognition`.
- Right-side SOS, flag person, and home controls.
- A translucent OpenStreetMap home overlay that can later be replaced with native Capacitor maps.
- Local `@vladmandic/human` model files under `public/human-models` for in-browser face recognition and identification.

## Face Data Shape

Enrolled people are stored in browser `localStorage` after the caretaker adds face samples. The fallback seed data is read from `public/data/knownFaces.json`. Each person uses this shape:

```json
{
  "id": "person-unique-id",
  "name": "Person Name",
  "relation": "Son",
  "lastConversationSummary": "Short summary of the most recent conversation.",
  "descriptors": [[0.1, -0.2, 0.03]]
}
```

Each descriptor is produced by `@vladmandic/human`. Multiple descriptors per person are better because they capture different lighting, angles, and expressions.

## Face Recognition Notes

This prototype uses `@vladmandic/human` directly in the browser. The caretaker flow creates local face embeddings from uploaded or captured images, and the patient camera compares live embeddings against those saved profiles without calling a backend.

For smoother camera FPS, face position tracking is throttled separately from identity checks, so the video stays fluid while recognition runs in the background.
