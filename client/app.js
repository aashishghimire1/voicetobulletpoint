const API_BASE = 'http://localhost:3001';

let mediaRecorder = null;
let audioChunks = [];
let recordingStartTime = null;
let timerInterval = null;

const statusEl = document.getElementById('status');
const recordBtn = document.getElementById('recordBtn');
const timerEl = document.getElementById('timer');
const playbackEl = document.getElementById('playback');
const transcriptSection = document.getElementById('transcriptSection');
const transcriptEl = document.getElementById('transcript');
const flashcardBtn = document.getElementById('flashcardBtn');
const flashcardSection = document.getElementById('flashcardSection');
const flashcardsEl = document.getElementById('flashcards');
const audioUpload = document.getElementById('audioUpload');
const uploadFileName = document.getElementById('uploadFileName');

async function checkServer() {
  try {
    const res = await fetch(`${API_BASE}/api/health`);
    const data = await res.json();

    if (data.ready) {
      statusEl.innerHTML = '<i class="fas fa-check-circle"></i> Models loaded — ready to record or upload';
      statusEl.className = 'status ready';
      recordBtn.disabled = false;
      if (audioUpload) audioUpload.disabled = false;
    } else {
      statusEl.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> Loading models... (may take 30–60s)';
      statusEl.className = 'status loading';
      setTimeout(checkServer, 3000);
    }
  } catch (err) {
    statusEl.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Server not running. Start the server first.';
    statusEl.className = 'status error';
    setTimeout(checkServer, 5000);
  }
}

async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];

    if (uploadFileName) uploadFileName.textContent = '';

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) audioChunks.push(event.data);
    };

    mediaRecorder.onstop = async () => {
      const webmBlob = new Blob(audioChunks, { type: 'audio/webm' });

      const audioUrl = URL.createObjectURL(webmBlob);
      playbackEl.src = audioUrl;
      playbackEl.classList.remove('hidden');

      statusEl.innerHTML = '<i class="fas fa-cog fa-spin"></i> Converting audio...';
      statusEl.className = 'status loading';

      let wavBlob;
      try {
        wavBlob = await convertBlobToWav(webmBlob);
        console.log('WAV size:', wavBlob.size, 'bytes');
      } catch (err) {
        console.error('WAV conversion failed:', err);
        statusEl.innerHTML = '<i class="fas fa-times-circle"></i> Audio conversion failed';
        statusEl.className = 'status error';
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      await transcribeAudio(wavBlob);
      stream.getTracks().forEach((track) => track.stop());
      audioChunks = [];
    };

    mediaRecorder.start();

    recordBtn.innerHTML = '<i class="fas fa-stop-circle"></i> Stop Recording';
    recordBtn.classList.add('recording');
    recordingStartTime = Date.now();

    timerInterval = setInterval(() => {
      const elapsed = Date.now() - recordingStartTime;
      const seconds = Math.floor(elapsed / 1000);
      const mins = String(Math.floor(seconds / 60)).padStart(2, '0');
      const secs = String(seconds % 60).padStart(2, '0');
      timerEl.textContent = `${mins}:${secs}`;
    }, 1000);
  } catch (err) {
    alert('Microphone access denied. Please allow microphone access.');
    console.error(err);
  }
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
  clearInterval(timerInterval);
  recordBtn.innerHTML = '<i class="fas fa-microphone"></i> Start Recording';
  recordBtn.classList.remove('recording');
}

async function transcribeAudio(audioBlob) {
  statusEl.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> Transcribing locally...';
  statusEl.className = 'status loading';

  const formData = new FormData();
  formData.append('audio', audioBlob, 'recording.wav');

  try {
    const res = await fetch(`${API_BASE}/api/transcribe`, {
      method: 'POST',
      body: formData
    });

    const data = await res.json();
    if (data.error) throw new Error(data.error);

    transcriptEl.textContent = data.transcript;
    transcriptSection.classList.remove('hidden');

    statusEl.innerHTML = '<i class="fas fa-check-circle"></i> Transcription complete';
    statusEl.className = 'status ready';
  } catch (err) {
    statusEl.innerHTML = `<i class="fas fa-times-circle"></i> Transcription failed: ${err.message}`;
    statusEl.className = 'status error';
  }
}

async function generateFlashcards() {
  const transcript = transcriptEl.textContent;

  if (!transcript || transcript.length < 10) {
    alert('Transcript too short. Record or upload a longer note.');
    return;
  }

  statusEl.innerHTML = '<i class="fas fa-brain"></i> Generating flashcards locally...';
  statusEl.className = 'status loading';
  flashcardBtn.disabled = true;

  try {
    const res = await fetch(`${API_BASE}/api/flashcards`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript })
    });

    const data = await res.json();
    if (data.error) throw new Error(data.error);

    renderFlashcards(data.flashcards);
    flashcardSection.classList.remove('hidden');

    statusEl.innerHTML = '<i class="fas fa-check-circle"></i> Flashcards ready';
    statusEl.className = 'status ready';
  } catch (err) {
    statusEl.innerHTML = `<i class="fas fa-times-circle"></i> Failed: ${err.message}`;
    statusEl.className = 'status error';
  } finally {
    flashcardBtn.disabled = false;
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderFlashcards(text) {
  flashcardsEl.innerHTML = '';

  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const cards = [];
  let current = {};

  for (const line of lines) {
    const qMatch = line.match(/^(?:\*{0,2})?(?:Q|Question)\s*\d*\s*[:.)\-]\s*(.+?)(?:\*{0,2})?$/i);
    const aMatch = line.match(/^(?:\*{0,2})?(?:A|Answer)\s*\d*\s*[:.)\-]\s*(.+?)(?:\*{0,2})?$/i);

    if (qMatch) {
      if (current.question && current.answer) cards.push(current);
      current = { question: qMatch[1].trim() };
    } else if (aMatch) {
      if (current.question) {
        current.answer = aMatch[1].trim();
        cards.push(current);
        current = {};
      }
    }
  }
  if (current.question && current.answer) cards.push(current);

  if (cards.length === 0) {
    flashcardsEl.innerHTML = `<div class="flashcard"><pre style="white-space:pre-wrap;font-family:inherit;">${escapeHtml(text)}</pre></div>`;
    return;
  }

  cards.forEach((card, i) => {
    const div = document.createElement('div');
    div.className = 'flashcard';
    div.innerHTML = `
      <div class="question"><i class="fas fa-question-circle"></i> Q${i + 1}: ${escapeHtml(card.question)}</div>
      <div class="answer hidden">${escapeHtml(card.answer)}</div>
      <div class="hint"><i class="fas fa-hand-pointer"></i> Click to reveal answer</div>
    `;

    div.addEventListener('click', () => {
      const answer = div.querySelector('.answer');
      const hint = div.querySelector('.hint');
      answer.classList.toggle('hidden');
      hint.innerHTML = answer.classList.contains('hidden')
        ? '<i class="fas fa-hand-pointer"></i> Click to reveal answer'
        : '<i class="fas fa-eye-slash"></i> Click to hide answer';
    });

    flashcardsEl.appendChild(div);
  });
}

// ---- Convert any audio blob to 16kHz mono WAV ----
async function convertBlobToWav(blob) {
  const arrayBuffer = await blob.arrayBuffer();

  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const decoded = await audioCtx.decodeAudioData(arrayBuffer);
  await audioCtx.close();

  const targetSampleRate = 16000;
  const numberOfChannels = 1;

  const offline = new OfflineAudioContext(
    numberOfChannels,
    Math.ceil(decoded.duration * targetSampleRate),
    targetSampleRate
  );

  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start(0);

  const resampled = await offline.startRendering();
  return encodeWav(resampled);
}

// ---- Encode AudioBuffer as 16-bit PCM WAV ----
function encodeWav(audioBuffer) {
  const numChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const samples = audioBuffer.getChannelData(0);

  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * 2, true);
  view.setUint16(32, numChannels * 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  return new Blob([view], { type: 'audio/wav' });
}

function writeString(view, offset, string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

// ---- Event listeners ----
recordBtn.addEventListener('click', () => {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    stopRecording();
  } else {
    startRecording();
  }
});

flashcardBtn.addEventListener('click', generateFlashcards);

// ---- File upload handler ----
if (audioUpload) {
  audioUpload.addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    if (mediaRecorder && mediaRecorder.state === 'recording') {
      alert('Stop recording before uploading a file.');
      audioUpload.value = '';
      return;
    }

    uploadFileName.textContent = file.name;
    console.log('Uploaded file:', file.name, 'size:', file.size, 'bytes');

    if (file.size > 20 * 1024 * 1024) {
      statusEl.innerHTML = '<i class="fas fa-times-circle"></i> File too large (max 20 MB)';
      statusEl.className = 'status error';
      audioUpload.value = '';
      return;
    }

    const audioUrl = URL.createObjectURL(file);
    playbackEl.src = audioUrl;
    playbackEl.classList.remove('hidden');

    statusEl.innerHTML = '<i class="fas fa-cog fa-spin"></i> Converting audio...';
    statusEl.className = 'status loading';

    let wavBlob;
    try {
      wavBlob = await convertBlobToWav(file);
      console.log('WAV size:', wavBlob.size, 'bytes');
    } catch (err) {
      console.error('WAV conversion failed:', err);
      statusEl.innerHTML = '<i class="fas fa-times-circle"></i> Could not decode this audio file. Try WAV, MP3, M4A, or OGG.';
      statusEl.className = 'status error';
      audioUpload.value = '';
      return;
    }

    await transcribeAudio(wavBlob);

    audioUpload.value = '';
  });
}

// ---- Init ----
checkServer();