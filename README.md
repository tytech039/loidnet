# loidnet

A singing voice synthesizer with a piano roll editor. Uses [DiffSinger](https://github.com/openvpi/DiffSinger) ONNX models to render vocals from note input.

![Electron](https://img.shields.io/badge/electron-33-blue) ![Python](https://img.shields.io/badge/python-3.11+-green) ![License](https://img.shields.io/badge/license-MIT-lightgrey)

## Features

- Canvas-based piano roll with pencil, pointer, and eraser tools
- Parameter curve editor (pitch, breathiness, tension, voicing, energy)
- Japanese phonemizer supporting romaji, hiragana, and katakana input
- Real-time playback with Web Audio API
- WAV export
- Project save/load (`.loid` format)

## Setup

```bash
npm install
pip install -r backend/requirements.txt
```

## Usage

```bash
npm start        # production
npm run dev      # dev mode (opens DevTools)
```

Place DiffSinger ONNX voicebanks in the `voicebanks/` directory. Each voicebank needs a `dsconfig.yaml` or `dsconfig.json`.

## Architecture

- **Electron** main process spawns a **Python FastAPI** backend on a random port
- Backend runs DiffSinger acoustic + vocoder ONNX inference
- Frontend is plain JS with canvas rendering (no framework, no bundler)

## License

MIT
