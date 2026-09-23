# 🎙️ Voice 2 Bullet Point

**Turn voice memos into study flashcards — 100% local, no cloud.**

Built with [QVAC](https://qvac.tether.io) — Tether's open-source on-device AI SDK.

---

## What It Does

1. **Record** a voice note in your browser, or **upload** an audio file (WAV, MP3, M4A, OGG).
2. **Whisper** (running locally via QVAC) transcribes it on your machine.
3. **Llama 3.2 1B** (running locally via QVAC) generates 3–5 Q&A flashcards.
4. **Click** any card to reveal the answer.

**No API keys. No cloud calls. No data leaves your device.**

---

## Why I Built It

I wanted to prove that a full AI study workflow — transcription **and** generation — can run entirely on-device with zero cloud dependency. It's designed for offline classrooms, air-gapped environments, and privacy-sensitive study sessions. The entire pipeline is two local models chained together, orchestrated by QVAC.

---

## QVAC Functions Used

| Function | Purpose |
|----------|---------|
| `loadModel` | Loads Whisper (`./ggml-base.bin`) and Llama 3.2 1B (`LLAMA_3_2_1B_INST_Q4_0`) |
| `transcribe` | On-device speech-to-text with Whisper |
| `completion` | On-device flashcard generation with Llama 3.2 1B |

**QVAC SDK version:** `@qvac/sdk@0.19.1`

---

## Architecture

```
[Browser mic or file upload]
        ↓
   WebM / MP3 / WAV / M4A
        ↓  (Web Audio API: convert to 16kHz mono WAV)
        ↓  HTTP POST /api/transcribe
[Node.js server — port 3001]
        ↓
   QVAC: transcribe(audioChunk)   ← Whisper, local
        ↓
   transcript returned to browser
        ↓
   HTTP POST /api/flashcards
        ↓
   QVAC: completion(history)      ← Llama 3.2 1B, local
        ↓
   3–5 flashcards returned
        ↓
[Browser renders clickable cards]
```

**Key design points:**

- **Two QVAC models chained** in one pipeline
- **In-browser audio conversion** — WebM (from MediaRecorder) is converted to 16kHz mono WAV using the Web Audio API so Whisper can decode it reliably
- **Transcript chunking** — long recordings are split into 2400-char chunks to fit the 1B model's 1024-token context window
- **Two input paths** — live recording and file upload

---

## Install

**Prerequisites:**
- Node.js ≥ 22.17 (QVAC SDK requirement)
- ~1.2 GB free disk space for models
- Chrome or Edge (for Web Audio API + MediaRecorder)

### 1. Clone the repo

```bash
git clone https://github.com/aashishghimire1/voice2bulletpoint.git
cd voicenote-flashcard
```

### 2. Install server dependencies

```bash
cd server
npm install
```

### 3. Download the Whisper model

```bash
curl -L -o ggml-base.bin https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin
```

(Or download manually and place at `server/ggml-base.bin`.)

The Llama 3.2 1B model (~773 MB) downloads automatically on first run.

### 4. Install the client server (optional)

The client is static HTML/CSS/JS. You can serve it with any static server. We recommend `serve`:

```bash
cd ../client
npx serve . -p 3000
```

---

## Run

You need **two terminals** running simultaneously.

### Terminal 1 — QVAC server (port 3001)

```bash
cd server
node index.js
```

Wait for:

```
Loading Whisper model...
Loading LLM model...
Models ready. Server is live.
Server running at http://localhost:3001
```

### Terminal 2 — Client server (port 3000)

```bash
cd client
npx serve . -p 3000
```

Wait for:

```
Serving!
Local: http://localhost:3000
```

### Browser

Open **http://localhost:3000**.

You should see: **✅ Models loaded — ready to record or upload**.

---

## Usage

### Option A — Live Recording

1. Click **Start Recording**
2. Allow microphone access
3. Speak for 15–30 seconds
4. Click **Stop Recording**
5. Wait for the transcript (~10–30 seconds)
6. Click **Generate Flashcards →**
7. Wait 30–120 seconds
8. Click any card to reveal the answer

### Option B — Upload an Audio File

1. Click **📁 Upload Audio File**
2. Choose a WAV, MP3, M4A, OGG, FLAC, or WebM file
3. Wait for transcription
4. Click **Generate Flashcards →**

---

## Offline Verification

To prove the app is fully local:

1. Start both servers (they need localhost — no external network needed after models are downloaded)
2. **Turn off WiFi**
3. Record or upload a note
4. Generate flashcards

Everything still works. This is the demo I recommend for the bounty submission video.

---

## Supported Audio Formats

| Format | Browser Support |
|--------|-----------------|
| WAV | ✅ All modern browsers |
| MP3 | ✅ All modern browsers |
| M4A / AAC | ✅ Chrome, Edge (Firefox may fail) |
| OGG / Opus | ✅ All modern browsers |
| FLAC | ✅ Chrome, Edge, Firefox |
| WebM | ✅ All modern browsers |

All formats are converted client-side to 16kHz mono WAV before being sent to QVAC.

---

## Project Structure

```
voicenote-flashcard/
├── LICENSE
├── README.md
├── .gitignore
├── client/
│   ├── index.html
│   ├── style.css
│   └── app.js
└── server/
    ├── index.js
    ├── package.json
    ├── qvac.config.json
    └── ggml-base.bin      (not committed — download per step 3)
```

---

## Tech Stack

- **[QVAC SDK](https://www.npmjs.com/package/@qvac/sdk)** `0.19.1` — local AI runtime
- **Node.js + Express** — server (port 3001)
- **Vanilla HTML / CSS / JavaScript** — client (port 3000)
- **Web Audio API** — for WebM → WAV conversion
- **multer** — file upload handling

---

## Limitations & Known Issues

- **1B model output is imperfect.** It sometimes produces irrelevant cards on very short transcripts. Longer, clearer input gives better results.
- **CPU inference is slow.** On a laptop CPU, generating 3–5 flashcards takes 30–120 seconds. GPU acceleration depends on your QVAC backend.
- **No speaker diarization.** All audio is transcribed as a single speaker.

---

## License

MIT — see [LICENSE](LICENSE).

---

## Acknowledgments

Built for the [QVAC bounty](https://qvac.tether.io). Powered by [@qvac](https://x.com/qvac) — local AI on every device.

Follow me on X: **[@Aashish Ghimire](https://x.com/ashishghimxtff)**
