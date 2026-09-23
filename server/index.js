import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import {
  loadModel,
  completion,
  transcribe,
  LLAMA_3_2_1B_INST_Q4_0
} from '@qvac/sdk';

const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(cors());
app.use(express.json());

let whisperModelId = null;
let llmModelId = null;

// ---------- Initialize QVAC models ----------
async function initModels() {
  console.log('Loading Whisper model...');
  whisperModelId = await loadModel({
    modelSrc: './ggml-base.bin',
    modelType: 'whisper',
    onProgress: (p) => console.log('Whisper:', p)
  });

  console.log('Loading LLM model...');
  llmModelId = await loadModel({
    modelSrc: LLAMA_3_2_1B_INST_Q4_0,
    onProgress: (p) => console.log('LLM:', p)
  });

  console.log('Models ready. Server is live.');
}

// ---------- Transcribe endpoint ----------
app.post('/api/transcribe', upload.single('audio'), async (req, res) => {
  try {
    if (!whisperModelId) {
      return res.status(503).json({ error: 'Model not loaded yet' });
    }

    console.log('Received audio:', req.file.path, 'size:', req.file.size, 'bytes');

    const result = await transcribe({
      modelId: whisperModelId,
      audioChunk: req.file.path
    });

    const text =
      typeof result === 'string'
        ? result
        : result?.text ?? result?.transcript ?? result?.result?.text ?? '';

    fs.unlinkSync(req.file.path);
    res.json({ transcript: text });
  } catch (error) {
    console.error('Transcription failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// ---------- Helper: split transcript into context-safe chunks ----------
function splitIntoChunks(transcript, maxCharsPerChunk = 2400) {
  const words = transcript.split(/\s+/);
  const chunks = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? current + ' ' + word : word;
    if (candidate.length > maxCharsPerChunk && current.length > 0) {
      chunks.push(current.trim());
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

// ---------- Generate flashcards for one chunk ----------
async function generateForChunk(chunk) {
  const history = [
    {
      role: 'system',
      content:
        'You are a study assistant. Generate 3-5 Q&A flashcards from the transcript. Output ONLY the flashcards in this format, one per line:\nQ1: question\nA1: answer\nQ2: question\nA2: answer'
    },
    { role: 'user', content: `Transcript:\n${chunk}` }
  ];

  const result = completion({
    modelId: llmModelId,
    history,
    generationParams: { temp: 0.1, predict: 512 }
  });

  let text = '';
  for await (const ev of result.events) {
    if (ev.type === 'contentDelta' && typeof ev.text === 'string') {
      text += ev.text;
    } else if (ev.type === 'completionDone' && ev.raw?.fullText && !text) {
      text = ev.raw.fullText;
    }
  }
  return text;
}

// ---------- Flashcards endpoint (with chunking) ----------
app.post('/api/flashcards', async (req, res) => {
  try {
    const { transcript } = req.body;
    if (!transcript || transcript.trim().length < 10) {
      return res.status(400).json({ error: 'Transcript too short' });
    }

    // Split long transcripts into chunks that fit the model's context window
    const chunks = splitIntoChunks(transcript, 2400);
    console.log(`Transcript split into ${chunks.length} chunk(s)`);

    const allFlashcards = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      console.log(`Processing chunk ${i + 1}/${chunks.length} (${chunk.length} chars)`);

      try {
        const chunkText = await generateForChunk(chunk);
        console.log(`Chunk ${i + 1} output (first 200):`, JSON.stringify(chunkText).slice(0, 200));
        allFlashcards.push(chunkText);
      } catch (err) {
        console.error(`Chunk ${i + 1} failed:`, err.message);
        allFlashcards.push(`[Chunk ${i + 1} failed to generate]`);
      }
    }

    // Combine and cap the total
    const combined = allFlashcards.filter(Boolean).join('\n\n');
    const MAX_TOTAL_CHARS = 6000;
    const finalText =
      combined.length > MAX_TOTAL_CHARS
        ? combined.slice(0, MAX_TOTAL_CHARS) + '\n\n...'
        : combined;

    console.log('Generated flashcards raw (first 400):', JSON.stringify(finalText).slice(0, 400));
    res.json({ flashcards: finalText });
  } catch (error) {
    console.error('Flashcard generation failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// ---------- Health check ----------
app.get('/api/health', (req, res) => {
  res.json({ ready: whisperModelId !== null && llmModelId !== null });
});

// ---------- Start server ----------
const PORT = 3001;

initModels()
  .then(() =>
    app.listen(PORT, () =>
      console.log(`Server running at http://localhost:${PORT}`)
    )
  )
  .catch((err) => {
    console.error('Initialization failed:', err);
    process.exit(1);
  });