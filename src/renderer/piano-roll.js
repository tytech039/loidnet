class PianoRoll {
  constructor(canvas, keysCanvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.keysCanvas = keysCanvas;
    this.keysCtx = keysCanvas.getContext('2d');

    this.notes = [];
    this.selectedNotes = [];

    this.scrollX = 0;
    this.scrollY = 60 * this.noteHeight;
    this.zoom = 1;

    this.ticksPerBeat = 480;
    this.beatsPerMeasure = 4;
    this.tempo = 120;

    this.totalPitches = 128;
    this.minPitch = 0;
    this.maxPitch = 127;

    this.tool = 'pencil';
    this.dragging = false;
    this.dragType = null;
    this.dragStartX = 0;
    this.dragStartY = 0;
    this.dragNote = null;
    this.dragOrigTick = 0;
    this.dragOrigPitch = 0;
    this.dragOrigDuration = 0;
    this.ghostNote = null;

    this.playbackTick = -1;
    this.onNotesChanged = null;
    this.onViewChanged = null;

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(canvas.parentElement);
    this.handleResize();

    this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
    this.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
    this.canvas.addEventListener('mouseup', (e) => this.onMouseUp(e));
    this.canvas.addEventListener('dblclick', (e) => this.onDoubleClick(e));
    this.canvas.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    document.addEventListener('keydown', (e) => this.onKeyDown(e));

    this.render();
  }

  get noteHeight() {
    return 14;
  }

  get pixelsPerTick() {
    return 0.15 * this.zoom;
  }

  get snapTicks() {
    return this.ticksPerBeat / 4;
  }

  get keysWidth() {
    return 60;
  }

  handleResize() {
    const parent = this.canvas.parentElement;
    this.canvas.width = parent.clientWidth - this.keysWidth;
    this.canvas.height = parent.clientHeight;
    this.keysCanvas.width = this.keysWidth;
    this.keysCanvas.height = parent.clientHeight;
    this.render();
  }

  screenToTick(x) {
    return Math.round((x + this.scrollX) / this.pixelsPerTick);
  }

  screenToPitch(y) {
    return this.maxPitch - Math.floor((y + this.scrollY) / this.noteHeight);
  }

  tickToScreen(tick) {
    return tick * this.pixelsPerTick - this.scrollX;
  }

  pitchToScreen(pitch) {
    return (this.maxPitch - pitch) * this.noteHeight - this.scrollY;
  }

  snapToGrid(tick) {
    return Math.round(tick / this.snapTicks) * this.snapTicks;
  }

  noteAt(tick, pitch) {
    for (let i = this.notes.length - 1; i >= 0; i--) {
      const n = this.notes[i];
      if (pitch === n.pitch && tick >= n.tick && tick <= n.endTick) {
        return n;
      }
    }
    return null;
  }

  edgeAt(screenX, note) {
    const leftX = this.tickToScreen(note.tick);
    const rightX = this.tickToScreen(note.endTick);
    if (Math.abs(screenX - leftX) < 6) return 'left';
    if (Math.abs(screenX - rightX) < 6) return 'right';
    return null;
  }

  selectNote(note, additive = false) {
    if (!additive) {
      this.notes.forEach((n) => (n.selected = false));
      this.selectedNotes = [];
    }
    note.selected = true;
    if (!this.selectedNotes.includes(note)) {
      this.selectedNotes.push(note);
    }
  }

  clearSelection() {
    this.notes.forEach((n) => (n.selected = false));
    this.selectedNotes = [];
  }

  deleteSelected() {
    this.notes = this.notes.filter((n) => !n.selected);
    this.selectedNotes = [];
    this.notifyChanged();
    this.render();
  }

  notifyChanged() {
    if (this.onNotesChanged) this.onNotesChanged();
  }

  onMouseDown(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const tick = this.screenToTick(x);
    const pitch = this.screenToPitch(y);

    this.dragging = true;
    this.dragStartX = x;
    this.dragStartY = y;

    if (this.tool === 'eraser') {
      const note = this.noteAt(tick, pitch);
      if (note) {
        this.notes = this.notes.filter((n) => n !== note);
        this.selectedNotes = this.selectedNotes.filter((n) => n !== note);
        this.notifyChanged();
        this.render();
      }
      return;
    }

    const existingNote = this.noteAt(tick, pitch);

    if (this.tool === 'pointer' || (this.tool === 'pencil' && existingNote)) {
      if (existingNote) {
        const edge = this.edgeAt(x, existingNote);
        if (edge === 'right') {
          this.dragType = 'resize-right';
          this.dragNote = existingNote;
          this.dragOrigDuration = existingNote.duration;
          this.dragOrigTick = tick;
        } else if (edge === 'left') {
          this.dragType = 'resize-left';
          this.dragNote = existingNote;
          this.dragOrigTick = existingNote.tick;
          this.dragOrigDuration = existingNote.duration;
        } else {
          this.dragType = 'move';
          this.dragNote = existingNote;
          this.dragOrigTick = existingNote.tick;
          this.dragOrigPitch = existingNote.pitch;
        }
        this.selectNote(existingNote, e.shiftKey);
      } else {
        this.clearSelection();
        this.dragType = null;
      }
      this.render();
      return;
    }

    if (this.tool === 'pencil' && !existingNote) {
      const snappedTick = this.snapToGrid(tick);
      const newNote = new Note(snappedTick, pitch, this.snapTicks * 4);
      this.notes.push(newNote);
      this.selectNote(newNote);
      this.dragType = 'create';
      this.dragNote = newNote;
      this.dragOrigTick = snappedTick;
      this.notifyChanged();
      this.render();
    }
  }

  onMouseMove(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const tick = this.screenToTick(x);
    const pitch = this.screenToPitch(y);

    if (!this.dragging) {
      const hoverNote = this.noteAt(tick, pitch);
      if (hoverNote && this.tool !== 'eraser') {
        const edge = this.edgeAt(x, hoverNote);
        this.canvas.style.cursor = edge ? 'ew-resize' : (this.tool === 'pointer' ? 'grab' : 'crosshair');
      } else {
        this.canvas.style.cursor = this.tool === 'eraser' ? 'not-allowed' : 'crosshair';
      }
      return;
    }

    if (this.tool === 'eraser') {
      const note = this.noteAt(tick, pitch);
      if (note) {
        this.notes = this.notes.filter((n) => n !== note);
        this.selectedNotes = this.selectedNotes.filter((n) => n !== note);
        this.notifyChanged();
        this.render();
      }
      return;
    }

    if (!this.dragNote) return;

    const snappedTick = this.snapToGrid(tick);

    if (this.dragType === 'create' || this.dragType === 'resize-right') {
      const newEnd = Math.max(snappedTick, this.dragNote.tick + this.snapTicks);
      this.dragNote.duration = newEnd - this.dragNote.tick;
    } else if (this.dragType === 'resize-left') {
      const newStart = Math.min(snappedTick, this.dragNote.tick + this.dragNote.duration - this.snapTicks);
      const oldEnd = this.dragNote.tick + this.dragNote.duration;
      this.dragNote.tick = Math.max(0, newStart);
      this.dragNote.duration = oldEnd - this.dragNote.tick;
    } else if (this.dragType === 'move') {
      const deltaTick = this.snapToGrid(tick - this.dragOrigTick);
      const deltaPitch = pitch - this.dragOrigPitch;
      for (const n of this.selectedNotes) {
        if (n === this.dragNote) {
          n.tick = Math.max(0, this.dragOrigTick + deltaTick);
          n.pitch = Math.max(0, Math.min(127, this.dragOrigPitch + deltaPitch));
        }
      }
    }

    this.render();
  }

  onMouseUp(e) {
    if (this.dragging && this.dragNote) {
      this.notifyChanged();
    }
    this.dragging = false;
    this.dragType = null;
    this.dragNote = null;
  }

  onDoubleClick(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const tick = this.screenToTick(x);
    const pitch = this.screenToPitch(y);
    const note = this.noteAt(tick, pitch);
    if (note) {
      this.showLyricInput(note, x, y);
    }
  }

  showLyricInput(note, x, y) {
    const input = document.getElementById('lyric-input');
    const wrapperRect = this.canvas.parentElement.getBoundingClientRect();
    const canvasRect = this.canvas.getBoundingClientRect();

    input.style.display = 'block';
    input.style.left = (canvasRect.left - wrapperRect.left + this.tickToScreen(note.tick) + this.keysWidth) + 'px';
    input.style.top = (canvasRect.top - wrapperRect.top + this.pitchToScreen(note.pitch)) + 'px';
    input.style.width = Math.max(60, note.duration * this.pixelsPerTick) + 'px';
    input.value = note.lyric;
    input.focus();
    input.select();

    const commit = () => {
      note.lyric = input.value;
      note.phonemes = Phonemizer.romajiToPhonemes(note.lyric);
      input.style.display = 'none';
      input.removeEventListener('blur', commit);
      input.removeEventListener('keydown', onKey);
      this.notifyChanged();
      this.render();
    };

    const onKey = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commit();
      } else if (e.key === 'Escape') {
        input.style.display = 'none';
        input.removeEventListener('blur', commit);
        input.removeEventListener('keydown', onKey);
      }
    };

    input.addEventListener('blur', commit);
    input.addEventListener('keydown', onKey);
  }

  onWheel(e) {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      const oldZoom = this.zoom;
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      this.zoom = Math.max(0.2, Math.min(5, this.zoom * factor));
      const rect = this.canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      this.scrollX = (this.scrollX + mouseX) * (this.zoom / oldZoom) - mouseX;
    } else if (e.shiftKey) {
      this.scrollX += e.deltaY;
    } else {
      this.scrollX += e.deltaX;
      this.scrollY += e.deltaY;
    }
    this.scrollX = Math.max(0, this.scrollX);
    this.scrollY = Math.max(0, Math.min(this.totalPitches * this.noteHeight - this.canvas.height, this.scrollY));
    this.render();
    if (this.onViewChanged) this.onViewChanged();
  }

  onKeyDown(e) {
    if (document.getElementById('lyric-input').style.display !== 'none') return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      this.deleteSelected();
    }
  }

  isBlackKey(pitch) {
    const n = pitch % 12;
    return [1, 3, 6, 8, 10].includes(n);
  }

  pitchName(pitch) {
    const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const octave = Math.floor(pitch / 12) - 1;
    return names[pitch % 12] + octave;
  }

  render() {
    this.renderGrid();
    this.renderKeys();
  }

  renderGrid() {
    const { ctx, canvas } = this;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const startPitch = this.screenToPitch(0);
    const endPitch = this.screenToPitch(h);
    for (let p = endPitch; p <= startPitch + 1; p++) {
      const y = this.pitchToScreen(p);
      const isBlack = this.isBlackKey(p);
      ctx.fillStyle = isBlack ? '#161628' : '#1a1a2e';
      ctx.fillRect(0, y, w, this.noteHeight);
      ctx.strokeStyle = '#252545';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y + this.noteHeight);
      ctx.lineTo(w, y + this.noteHeight);
      ctx.stroke();
      if (p % 12 === 0) {
        ctx.strokeStyle = '#353565';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, y + this.noteHeight);
        ctx.lineTo(w, y + this.noteHeight);
        ctx.stroke();
      }
    }

    const ticksPerMeasure = this.ticksPerBeat * this.beatsPerMeasure;
    const startTick = Math.max(0, this.screenToTick(0));
    const endTick = this.screenToTick(w);

    for (let t = this.snapToGrid(startTick); t <= endTick; t += this.snapTicks) {
      const x = this.tickToScreen(t);
      const isMeasure = t % ticksPerMeasure === 0;
      const isBeat = t % this.ticksPerBeat === 0;
      if (isMeasure) {
        ctx.strokeStyle = '#404070';
        ctx.lineWidth = 1.5;
      } else if (isBeat) {
        ctx.strokeStyle = '#303055';
        ctx.lineWidth = 1;
      } else {
        ctx.strokeStyle = '#252540';
        ctx.lineWidth = 0.5;
      }
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();

      if (isMeasure) {
        const measureNum = t / ticksPerMeasure + 1;
        ctx.fillStyle = '#606090';
        ctx.font = '10px sans-serif';
        ctx.fillText(String(measureNum), x + 3, 12);
      }
    }

    for (const note of this.notes) {
      this.renderNote(note);
    }

    if (this.playbackTick >= 0) {
      const px = this.tickToScreen(this.playbackTick);
      ctx.strokeStyle = '#e94560';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, h);
      ctx.stroke();
    }
  }

  renderNote(note) {
    const { ctx } = this;
    const x = this.tickToScreen(note.tick);
    const y = this.pitchToScreen(note.pitch);
    const w = note.duration * this.pixelsPerTick;
    const h = this.noteHeight;

    ctx.fillStyle = note.selected ? '#e94560' : '#533483';
    ctx.fillRect(x, y, w, h - 1);

    ctx.strokeStyle = note.selected ? '#ff6b81' : '#7c5cbf';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h - 1);

    const label = note.lyric || note.phonemes || '';
    if (label && w > 15) {
      ctx.fillStyle = '#ffffff';
      ctx.font = '10px sans-serif';
      ctx.save();
      ctx.beginPath();
      ctx.rect(x + 2, y, w - 4, h);
      ctx.clip();
      ctx.fillText(label, x + 3, y + h - 3);
      ctx.restore();
    }
  }

  renderKeys() {
    const { keysCtx: ctx, keysCanvas: canvas } = this;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const startPitch = this.screenToPitch(0);
    const endPitch = this.screenToPitch(h);

    for (let p = endPitch; p <= startPitch + 1; p++) {
      if (p < 0 || p > 127) continue;
      const y = this.pitchToScreen(p);
      const isBlack = this.isBlackKey(p);

      ctx.fillStyle = isBlack ? '#0a0a1a' : '#16213e';
      ctx.fillRect(0, y, w, this.noteHeight);
      ctx.strokeStyle = '#252545';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y + this.noteHeight);
      ctx.lineTo(w, y + this.noteHeight);
      ctx.stroke();

      // Label every key, not just C, so the full pitch range is legible.
      // C notes are brighter to keep octaves easy to find.
      const isC = p % 12 === 0;
      ctx.fillStyle = isC ? '#d0d0f0' : '#7070a0';
      ctx.font = (isC ? 'bold ' : '') + '9px sans-serif';
      ctx.fillText(this.pitchName(p), 4, y + this.noteHeight - 3);
    }
  }

  getProjectData() {
    return {
      notes: this.notes.map((n) => n.toJSON()),
      scrollX: this.scrollX,
      scrollY: this.scrollY,
      zoom: this.zoom,
      tempo: this.tempo,
    };
  }

  loadProjectData(data) {
    this.notes = (data.notes || []).map((n) => Note.fromJSON(n));
    this.scrollX = data.scrollX || 0;
    this.scrollY = data.scrollY || this.scrollY;
    this.zoom = data.zoom || 1;
    this.tempo = data.tempo || 120;
    this.selectedNotes = [];
    this.render();
  }
}
