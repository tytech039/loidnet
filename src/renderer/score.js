const ScoreSerializer = (() => {
  function midiToHz(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  function ticksToSeconds(ticks, tempo, ticksPerBeat) {
    return (ticks / ticksPerBeat) * (60 / tempo);
  }

  function serialize(pianoRoll, paramEditor) {
    const notes = [...pianoRoll.notes].sort((a, b) => a.tick - b.tick);
    const tempo = pianoRoll.tempo;
    const tpb = pianoRoll.ticksPerBeat;

    if (notes.length === 0) return null;

    const items = [];
    let prevEnd = 0;

    for (const note of notes) {
      if (note.tick > prevEnd) {
        items.push({
          phoneme: 'SP',
          pitch: 60,
          duration: ticksToSeconds(note.tick - prevEnd, tempo, tpb),
          isRest: true,
        });
      }

      const phonemes = note.phonemes || Phonemizer.romajiToPhonemes(note.lyric) || 'a';
      const parts = phonemes.split(' ').filter(Boolean);
      const noteDur = ticksToSeconds(note.duration, tempo, tpb);

      // The final phoneme is the sustained vowel; any leading phonemes are
      // consonants that should be short. Splitting the note evenly stretches
      // consonants into a warble, so give each consonant a fixed ~60ms (capped
      // so they never exceed half the note) and let the vowel take the rest.
      const CONSONANT_SEC = 0.06;
      const nCons = parts.length - 1;
      const perCons = nCons > 0 ? Math.min(CONSONANT_SEC, (noteDur * 0.5) / nCons) : 0;
      const vowelDur = noteDur - perCons * nCons;

      parts.forEach((ph, idx) => {
        items.push({
          phoneme: ph,
          pitch: note.pitch,
          duration: idx === parts.length - 1 ? vowelDur : perCons,
          isRest: false,
        });
      });

      prevEnd = note.endTick;
    }

    const params = paramEditor.getParamsData();
    const paramCurves = {};
    for (const [key, points] of Object.entries(params)) {
      if (points.length > 0) {
        paramCurves[key] = points.map((p) => ({
          time: ticksToSeconds(p.tick, tempo, tpb),
          value: p.value,
        }));
      }
    }

    return {
      phonemes: items.map((i) => i.phoneme),
      pitches: items.map((i) => midiToHz(i.pitch)),
      midi_pitches: items.map((i) => i.pitch),
      durations: items.map((i) => i.duration),
      is_rest: items.map((i) => i.isRest),
      tempo,
      params: paramCurves,
    };
  }

  return { serialize };
})();
