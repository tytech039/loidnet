import io
import json
import struct
import wave
from pathlib import Path

import numpy as np

try:
    import onnxruntime as ort
    HAS_ORT = True
except ImportError:
    HAS_ORT = False

try:
    import yaml
    HAS_YAML = True
except ImportError:
    HAS_YAML = False


class DiffSingerEngine:
    def __init__(self):
        self._loaded_vb = None
        self._acoustic_session = None
        self._vocoder_session = None
        self._config = None
        self._ph_to_id = {}

    def _load_phoneme_map(self, vb_path: Path, phonemes) -> dict:
        # Inline dict {name: id}.
        if isinstance(phonemes, dict):
            return {str(k): int(v) for k, v in phonemes.items()}
        # Inline list -> index is the id.
        if isinstance(phonemes, list):
            return {ph: i for i, ph in enumerate(phonemes)}
        # String -> a JSON file in the bank holding a dict or list.
        if isinstance(phonemes, str):
            ph_path = vb_path / phonemes
            if ph_path.exists():
                with open(ph_path) as f:
                    data = json.load(f)
                return self._load_phoneme_map(vb_path, data)
        return {}

    def _load_voicebank(self, vb_path: Path):
        vb_str = str(vb_path)
        if self._loaded_vb == vb_str:
            return

        config_path = vb_path / "dsconfig.yaml"
        if not config_path.exists():
            config_path = vb_path / "dsconfig.json"

        if not config_path.exists():
            raise RuntimeError(f"No dsconfig found in {vb_path}")

        if config_path.suffix == ".yaml":
            if not HAS_YAML:
                raise RuntimeError("PyYAML required for .yaml configs: pip install pyyaml")
            with open(config_path) as f:
                self._config = yaml.safe_load(f)
        else:
            with open(config_path) as f:
                self._config = json.load(f)

        # Resolve the phoneme -> id mapping. `phonemes` may be an inline list,
        # an inline dict, or (commonly) the name of a JSON file in the bank.
        self._ph_to_id = self._load_phoneme_map(vb_path, self._config.get("phonemes"))

        if not HAS_ORT:
            raise RuntimeError("onnxruntime not installed: pip install onnxruntime")

        acoustic_path = vb_path / "acoustic.onnx"
        if not acoustic_path.exists():
            for p in vb_path.glob("*.onnx"):
                if "acoustic" in p.name.lower():
                    acoustic_path = p
                    break

        if acoustic_path.exists():
            self._acoustic_session = ort.InferenceSession(
                str(acoustic_path),
                providers=["CPUExecutionProvider"],
            )
        else:
            self._acoustic_session = None

        vocoder_path = vb_path / "vocoder.onnx"
        if not vocoder_path.exists():
            for p in vb_path.glob("*.onnx"):
                if "vocoder" in p.name.lower() or "nsf_hifigan" in p.name.lower():
                    vocoder_path = p
                    break

        if vocoder_path.exists():
            self._vocoder_session = ort.InferenceSession(
                str(vocoder_path),
                providers=["CPUExecutionProvider"],
            )
        else:
            self._vocoder_session = None

        self._loaded_vb = vb_str

    def render(
        self,
        voicebank_path: Path,
        phonemes: list[str],
        pitches: list[float],
        midi_pitches: list[int],
        durations: list[float],
        is_rest: list[bool],
        tempo: float = 120.0,
        params: dict = None,
    ) -> bytes:
        self._load_voicebank(voicebank_path)

        if self._acoustic_session and self._vocoder_session:
            return self._render_with_models(
                phonemes, pitches, midi_pitches, durations, is_rest, tempo, params or {}
            )

        return self._render_sine_fallback(midi_pitches, durations, is_rest)

    def _smooth_f0(self, f0, voiced, sample_rate, hop_size, params):
        """Turn the per-note f0 staircase into a singable contour.

        1. Interpolate across unvoiced/rest frames so the harmonic source has
           no 0 Hz jumps (clicks). 2. One-pole low-pass for a short portamento
           glide between notes. 3. Gentle vibrato that ramps in on sustains.
        """
        f0 = f0[0].astype(np.float64)
        n = len(f0)
        if not voiced.any():
            return f0[np.newaxis, :].astype(np.float32)

        fps = sample_rate / hop_size
        idx = np.arange(n)

        # 1) Bridge unvoiced gaps (and clamp the leading/trailing edges).
        f0[~voiced] = np.interp(idx[~voiced], idx[voiced], f0[voiced])

        # 2) Portamento glide via a causal one-pole filter (~glide_ms).
        glide_ms = float(params.get("glide_ms", 35.0))
        if glide_ms > 0:
            alpha = 1.0 - np.exp(-1.0 / max(1e-6, (glide_ms / 1000.0) * fps))
            for i in range(1, n):
                f0[i] = f0[i - 1] + alpha * (f0[i] - f0[i - 1])

        # 3) Vibrato on sustained notes, ramped in after a short delay so
        #    short/staccato notes stay flat.
        depth = float(params.get("vibrato_semitones", 0.3))
        rate = float(params.get("vibrato_hz", 5.5))
        delay = float(params.get("vibrato_delay", 0.25))
        if depth > 0:
            held = np.zeros(n)
            run = 0.0
            for i in range(n):
                run = run + 1.0 / fps if voiced[i] else 0.0
                held[i] = run
            env = np.clip((held - delay) / 0.2, 0.0, 1.0)
            mod = np.sin(2 * np.pi * rate * (idx / fps)) * (depth / 12.0)
            f0 = f0 * (2.0 ** (mod * env))

        return f0[np.newaxis, :].astype(np.float32)

    def _render_with_models(
        self,
        phonemes, pitches, midi_pitches, durations, is_rest, tempo, params
    ) -> bytes:
        config = self._config or {}
        hop_size = config.get("hop_size", 512)
        sample_rate = config.get("sample_rate", 44100)
        ph_to_id = self._ph_to_id

        ph_ids = []
        for ph in phonemes:
            ph_ids.append(ph_to_id.get(ph, 0))

        total_frames = 0
        frame_counts = []
        for dur in durations:
            frames = max(1, int(dur * sample_rate / hop_size))
            frame_counts.append(frames)
            total_frames += frames

        ph_dur = np.array([frame_counts], dtype=np.int64)
        ph_ids_arr = np.array([ph_ids], dtype=np.int64)

        f0 = np.zeros((1, total_frames), dtype=np.float32)
        voiced = np.zeros(total_frames, dtype=bool)
        idx = 0
        for i, fc in enumerate(frame_counts):
            if not is_rest[i]:
                f0[0, idx:idx + fc] = pitches[i]
                voiced[idx:idx + fc] = True
            idx += fc

        # Soften the raw per-note pitch staircase: bridge rests, glide between
        # notes, and add a touch of vibrato. The mel still silences rests, so
        # bridging f0 there only removes clicks, it doesn't voice the silence.
        f0 = self._smooth_f0(f0, voiced, sample_rate, hop_size, params)

        # Per-frame control curves the acoustic model may declare. Neutral
        # defaults give an unmodified voice; param curves override where given.
        frame_defaults = {
            "gender": 0.0,
            "velocity": 1.0,
            "breathiness": 0.0,
            "tension": 0.0,
            "voicing": 1.0,
            "energy": 0.0,
        }
        # Scalar sampler/control inputs (rank-1, length 1).
        # Shallow-diffusion models train up to `max_depth`; starting deeper than
        # that feeds the sampler noise it never saw. Clamp to the trained range.
        max_depth = float(config.get("max_depth", 1.0))
        depth = min(float(config.get("depth", max_depth)), max_depth)
        scalar_defaults = {
            "depth": depth,
            "steps": int(config.get("diffusion_steps", config.get("steps", 20))),
            "speed": 1.0,
            "speedup": int(config.get("speedup", 1)),
        }

        def frame_curve(default):
            return np.full((1, total_frames), default, dtype=np.float32)

        inputs = {}
        for inp in self._acoustic_session.get_inputs():
            name = inp.name
            is_int = "int" in (inp.type or "")
            if name == "tokens":
                inputs[name] = ph_ids_arr
            elif name in ("durations", "ph_dur"):
                inputs[name] = ph_dur
            elif name in ("f0", "f0_seq"):
                inputs[name] = f0
            elif name in frame_defaults:
                # Use a supplied param curve if it matches the frame count.
                curve = params.get(name)
                if isinstance(curve, list) and len(curve) == total_frames:
                    inputs[name] = np.array([curve], dtype=np.float32)
                else:
                    inputs[name] = frame_curve(frame_defaults[name])
            elif name in scalar_defaults:
                val = scalar_defaults[name]
                dtype = np.int64 if is_int else np.float32
                # Respect the declared rank: shape [] is a true scalar, while a
                # shape like [1] wants a length-1 vector.
                inputs[name] = (
                    np.array(val, dtype=dtype)
                    if len(inp.shape) == 0
                    else np.array([val], dtype=dtype)
                )
            else:
                # Unknown input: best-effort neutral scalar so inference can run.
                dtype = np.int64 if is_int else np.float32
                inputs[name] = (
                    np.array(0, dtype=dtype)
                    if len(inp.shape) == 0
                    else np.array([0], dtype=dtype)
                )

        try:
            acoustic_out = self._acoustic_session.run(None, inputs)
            mel = acoustic_out[0]
        except Exception as e:
            print(f"Acoustic model error: {e}, falling back to sine")
            return self._render_sine_fallback(midi_pitches, durations, is_rest)

        vocoder_inputs = {}
        voc_input_names = [inp.name for inp in self._vocoder_session.get_inputs()]

        if len(voc_input_names) >= 1:
            vocoder_inputs[voc_input_names[0]] = mel.astype(np.float32)
        if len(voc_input_names) >= 2 and "f0" in voc_input_names[1]:
            vocoder_inputs[voc_input_names[1]] = f0[:, :mel.shape[1]].astype(np.float32)

        try:
            vocoder_out = self._vocoder_session.run(None, vocoder_inputs)
            audio = vocoder_out[0].flatten()
        except Exception as e:
            print(f"Vocoder error: {e}, falling back to sine")
            return self._render_sine_fallback(midi_pitches, durations, is_rest)

        audio = audio / (np.max(np.abs(audio)) + 1e-7) * 0.9
        return self._to_wav(audio, sample_rate)

    def _render_sine_fallback(self, midi_pitches, durations, is_rest) -> bytes:
        sample_rate = 44100
        audio_parts = []
        for i, dur in enumerate(durations):
            n_samples = int(dur * sample_rate)
            if is_rest[i] or n_samples == 0:
                audio_parts.append(np.zeros(n_samples, dtype=np.float32))
            else:
                freq = 440 * (2 ** ((midi_pitches[i] - 69) / 12))
                t = np.arange(n_samples, dtype=np.float32) / sample_rate
                envelope = np.ones_like(t)
                attack = min(int(0.01 * sample_rate), n_samples)
                release = min(int(0.01 * sample_rate), n_samples)
                if attack > 0:
                    envelope[:attack] = np.linspace(0, 1, attack)
                if release > 0:
                    envelope[-release:] = np.linspace(1, 0, release)
                wave = 0.4 * np.sin(2 * np.pi * freq * t) * envelope
                audio_parts.append(wave)

        if not audio_parts:
            audio = np.zeros(sample_rate, dtype=np.float32)
        else:
            audio = np.concatenate(audio_parts)

        return self._to_wav(audio, sample_rate)

    def _to_wav(self, audio: np.ndarray, sample_rate: int) -> bytes:
        buf = io.BytesIO()
        pcm = (audio * 32767).astype(np.int16)
        with wave.open(buf, "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(sample_rate)
            wf.writeframes(pcm.tobytes())
        return buf.getvalue()
