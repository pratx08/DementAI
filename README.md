# DementAI

Minimal React prototype for an AR-style assistive camera interface. The current build includes:

- A full-screen camera experience framed with a fixed 20px inset.
- Translucent saved-person identity cards for recognized faces.
- Live closed captions through `react-speech-recognition`.
- Native iPhone/Android closed captions through Capacitor and `@capgo/capacitor-speech-recognition`.
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

## iPhone App Setup

The iPhone build is a Capacitor app. It does not need GPT keys or any paid transcription API. Captions use the phone's native speech recognition permission, with on-device recognition enabled when the iPhone supports it.

You need a Mac with Xcode installed to run the app on an iPhone.

```bash
git clone https://github.com/pratx08/DementAI.git
cd DementAI
npm install
npm run cap:sync
npm run cap:open:ios
```

In Xcode:

1. Select the `App` project and the `App` target.
2. Open `Signing & Capabilities`.
3. Choose your Apple ID team.
4. Connect your iPhone with a cable or wireless debugging.
5. Pick your iPhone in the device list.
6. Press Run.

On the first launch, allow Camera, Microphone, and Speech Recognition. The app opens in landscape, uses the front camera by default, and the mic icon above SOS starts captions.

A free Apple ID can run the app on your own iPhone for testing. A paid Apple Developer account is only needed for TestFlight or App Store distribution.

## Native Commands

```bash
npm run cap:sync
npm run cap:open:ios
npm run cap:open:android
```
