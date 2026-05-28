import argparse
import os
import sys
from pathlib import Path

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel

from diffsinger import DiffSingerEngine

app = FastAPI(title="loidnet-backend")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

VOICEBANK_DIR = Path(__file__).parent.parent / "voicebanks"
engine = DiffSingerEngine()


class RenderRequest(BaseModel):
    phonemes: list[str]
    pitches: list[float]
    midi_pitches: list[int]
    durations: list[float]
    is_rest: list[bool]
    tempo: float = 120.0
    voicebank: str = ""
    params: dict = {}


@app.get("/voicebanks")
def list_voicebanks():
    voicebanks = []
    if VOICEBANK_DIR.exists():
        for entry in sorted(VOICEBANK_DIR.iterdir()):
            if entry.is_dir():
                config = entry / "dsconfig.yaml"
                if not config.exists():
                    config = entry / "dsconfig.json"
                if config.exists():
                    voicebanks.append({
                        "name": entry.name,
                        "path": str(entry),
                    })
    return {"voicebanks": voicebanks}


@app.post("/render")
def render(req: RenderRequest):
    if not req.voicebank:
        raise HTTPException(400, "No voicebank specified")

    vb_path = Path(req.voicebank)
    if not vb_path.exists():
        raise HTTPException(400, f"Voicebank not found: {req.voicebank}")

    try:
        wav_bytes = engine.render(
            voicebank_path=vb_path,
            phonemes=req.phonemes,
            pitches=req.pitches,
            midi_pitches=req.midi_pitches,
            durations=req.durations,
            is_rest=req.is_rest,
            tempo=req.tempo,
            params=req.params,
        )
        return Response(content=wav_bytes, media_type="audio/wav")
    except Exception as e:
        raise HTTPException(500, str(e))


@app.get("/health")
def health():
    return {"status": "ok"}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8976)
    args = parser.parse_args()

    print(f"loidnet backend starting on port {args.port}", flush=True)
    uvicorn.run(app, host="127.0.0.1", port=args.port, log_level="info")
