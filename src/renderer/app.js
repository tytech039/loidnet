const pianoRollCanvas = document.getElementById('piano-roll');
const pianoKeysCanvas = document.getElementById('piano-keys');
const paramEditorCanvas = document.getElementById('param-editor');

const pianoRoll = new PianoRoll(pianoRollCanvas, pianoKeysCanvas);
const paramEditor = new ParamEditor(paramEditorCanvas, pianoRoll);

let backendPort = 0;
let audioCtx = null;
let currentSource = null;
let playbackInterval = null;
let playbackStartTime = 0;
let playbackStartTick = 0;

function getAudioContext() {
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}

function setStatus(text) {
  document.getElementById('status-text').textContent = text;
}

async function init() {
  backendPort = await window.loidnet.getBackendPort();
  if (backendPort) {
    setStatus(`Backend on port ${backendPort}`);
    loadVoicebanks();
    // Re-scan when the user opens the picker, so newly-added banks appear
    // without restarting the app.
    document.getElementById('select-voicebank')
      .addEventListener('mousedown', () => loadVoicebanks(0));
  } else {
    setStatus('No backend — render unavailable');
  }
}

async function loadVoicebanks(retries = 10) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(`http://localhost:${backendPort}/voicebanks`);
      const data = await res.json();
      const select = document.getElementById('select-voicebank');
      const prev = select.value;
      select.innerHTML = '<option value="">No voicebank</option>';
      for (const vb of data.voicebanks || []) {
        const opt = document.createElement('option');
        opt.value = vb.path;
        opt.textContent = vb.name;
        select.appendChild(opt);
      }
      // Preserve the prior selection across a refresh if it still exists.
      if (prev) select.value = prev;
      return;
    } catch {
      // Backend may still be booting on startup — back off and retry.
      if (attempt < retries) await new Promise((r) => setTimeout(r, 500));
    }
  }
  console.warn('Could not load voicebanks');
}

async function renderScore() {
  const score = ScoreSerializer.serialize(pianoRoll, paramEditor);
  if (!score) {
    setStatus('No notes to render');
    return null;
  }

  const voicebank = document.getElementById('select-voicebank').value;
  if (!voicebank) {
    setStatus('No voicebank selected');
    return null;
  }

  setStatus('Rendering...');
  try {
    const res = await fetch(`http://localhost:${backendPort}/render`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...score, voicebank }),
    });

    if (!res.ok) {
      const err = await res.json();
      setStatus(`Render error: ${err.detail || 'unknown'}`);
      return null;
    }

    const arrayBuf = await res.arrayBuffer();
    setStatus('Render complete');
    return arrayBuf;
  } catch (e) {
    setStatus(`Render failed: ${e.message}`);
    return null;
  }
}

function stopPlayback() {
  if (currentSource) {
    currentSource.stop();
    currentSource = null;
  }
  if (playbackInterval) {
    clearInterval(playbackInterval);
    playbackInterval = null;
  }
  pianoRoll.playbackTick = -1;
  pianoRoll.render();
  paramEditor.render();
}

async function playAudio(arrayBuffer) {
  stopPlayback();
  const ctx = getAudioContext();
  const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
  currentSource = ctx.createBufferSource();
  currentSource.buffer = audioBuffer;
  currentSource.connect(ctx.destination);
  currentSource.start();

  playbackStartTime = ctx.currentTime;
  playbackStartTick = 0;

  const ticksPerSecond = pianoRoll.ticksPerBeat * (pianoRoll.tempo / 60);

  playbackInterval = setInterval(() => {
    const elapsed = ctx.currentTime - playbackStartTime;
    pianoRoll.playbackTick = Math.floor(elapsed * ticksPerSecond);
    pianoRoll.render();
    paramEditor.render();
  }, 1000 / 30);

  currentSource.onended = () => {
    stopPlayback();
    setStatus('Playback done');
  };
}

document.getElementById('select-tool').addEventListener('change', (e) => {
  pianoRoll.tool = e.target.value;
});

document.getElementById('tempo').addEventListener('change', (e) => {
  pianoRoll.tempo = parseInt(e.target.value, 10) || 120;
});

document.querySelectorAll('.param-tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.param-tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    paramEditor.setActiveParam(tab.dataset.param);
  });
});

document.getElementById('btn-play').addEventListener('click', async () => {
  setStatus('Rendering for playback...');
  const buf = await renderScore();
  if (buf) await playAudio(buf);
});

document.getElementById('btn-stop').addEventListener('click', () => {
  stopPlayback();
  setStatus('Stopped');
});

document.getElementById('btn-render').addEventListener('click', async () => {
  await renderScore();
});

document.getElementById('btn-export').addEventListener('click', async () => {
  const buf = await renderScore();
  if (buf) {
    const path = await window.loidnet.exportWav(Array.from(new Uint8Array(buf)));
    if (path) setStatus(`Exported to ${path}`);
  }
});

document.getElementById('btn-new').addEventListener('click', () => {
  pianoRoll.notes = [];
  pianoRoll.selectedNotes = [];
  paramEditor.params = {
    pitch: [], breathiness: [], tension: [], voicing: [], energy: [],
  };
  pianoRoll.render();
  paramEditor.render();
  setStatus('New project');
});

document.getElementById('btn-save').addEventListener('click', async () => {
  const data = {
    version: 1,
    ...pianoRoll.getProjectData(),
    params: paramEditor.getParamsData(),
    voicebank: document.getElementById('select-voicebank').value,
  };
  const path = await window.loidnet.saveProject(data);
  if (path) setStatus(`Saved to ${path}`);
});

document.getElementById('btn-open').addEventListener('click', async () => {
  const data = await window.loidnet.openProject();
  if (data) {
    pianoRoll.loadProjectData(data);
    paramEditor.loadParamsData(data.params);
    document.getElementById('tempo').value = pianoRoll.tempo;
    if (data.voicebank) {
      document.getElementById('select-voicebank').value = data.voicebank;
    }
    setStatus('Project loaded');
  }
});

pianoRoll.onNotesChanged = () => {
  paramEditor.render();
};

init();
