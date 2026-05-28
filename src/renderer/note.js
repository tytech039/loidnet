class Note {
  static nextId = 1;

  constructor(tick, pitch, duration, lyric = '') {
    this.id = Note.nextId++;
    this.tick = tick;
    this.pitch = pitch;
    this.duration = duration;
    this.lyric = lyric;
    this.phonemes = '';
    this.selected = false;
  }

  get endTick() {
    return this.tick + this.duration;
  }

  containsPoint(tick, pitch, noteHeight) {
    return (
      tick >= this.tick &&
      tick <= this.endTick &&
      pitch === this.pitch
    );
  }

  isOnLeftEdge(tick, threshold) {
    return Math.abs(tick - this.tick) < threshold;
  }

  isOnRightEdge(tick, threshold) {
    return Math.abs(tick - this.endTick) < threshold;
  }

  toJSON() {
    return {
      tick: this.tick,
      pitch: this.pitch,
      duration: this.duration,
      lyric: this.lyric,
      phonemes: this.phonemes,
    };
  }

  static fromJSON(data) {
    const note = new Note(data.tick, data.pitch, data.duration, data.lyric);
    note.phonemes = data.phonemes || '';
    return note;
  }
}
