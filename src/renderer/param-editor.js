class ParamEditor {
  constructor(canvas, pianoRoll) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.pianoRoll = pianoRoll;

    this.activeParam = 'pitch';
    this.params = {
      pitch: [],
      breathiness: [],
      tension: [],
      voicing: [],
      energy: [],
    };

    this.drawing = false;

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(canvas.parentElement);
    this.handleResize();

    this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
    this.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
    this.canvas.addEventListener('mouseup', () => this.onMouseUp());
    this.canvas.addEventListener('mouseleave', () => this.onMouseUp());

    this.render();
  }

  handleResize() {
    const parent = this.canvas.parentElement;
    this.canvas.width = parent.clientWidth;
    this.canvas.height = parent.clientHeight;
    this.render();
  }

  tickToX(tick) {
    return tick * this.pianoRoll.pixelsPerTick - this.pianoRoll.scrollX + this.pianoRoll.keysWidth;
  }

  xToTick(x) {
    return Math.round((x - this.pianoRoll.keysWidth + this.pianoRoll.scrollX) / this.pianoRoll.pixelsPerTick);
  }

  valueToY(value) {
    return this.canvas.height * (1 - value);
  }

  yToValue(y) {
    return Math.max(0, Math.min(1, 1 - y / this.canvas.height));
  }

  setActiveParam(param) {
    this.activeParam = param;
    this.render();
  }

  onMouseDown(e) {
    this.drawing = true;
    this.addPoint(e);
  }

  onMouseMove(e) {
    if (!this.drawing) return;
    this.addPoint(e);
  }

  onMouseUp() {
    this.drawing = false;
  }

  addPoint(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const tick = this.xToTick(x);
    const value = this.yToValue(y);

    const points = this.params[this.activeParam];
    const existing = points.findIndex((p) => Math.abs(p.tick - tick) < this.pianoRoll.snapTicks / 2);
    if (existing >= 0) {
      points[existing].value = value;
    } else {
      points.push({ tick, value });
      points.sort((a, b) => a.tick - b.tick);
    }
    this.render();
  }

  render() {
    const { ctx, canvas } = this;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    ctx.fillStyle = '#141428';
    ctx.fillRect(0, 0, w, h);

    const ticksPerMeasure = this.pianoRoll.ticksPerBeat * this.pianoRoll.beatsPerMeasure;
    const startTick = Math.max(0, this.xToTick(0));
    const endTick = this.xToTick(w);

    for (let t = this.pianoRoll.snapToGrid(startTick); t <= endTick; t += this.pianoRoll.ticksPerBeat) {
      const x = this.tickToX(t);
      const isMeasure = t % ticksPerMeasure === 0;
      ctx.strokeStyle = isMeasure ? '#303055' : '#202040';
      ctx.lineWidth = isMeasure ? 1 : 0.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }

    ctx.strokeStyle = '#303050';
    ctx.lineWidth = 0.5;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();
    ctx.setLineDash([]);

    const points = this.params[this.activeParam];
    if (points.length > 0) {
      const colors = {
        pitch: '#e94560',
        breathiness: '#45e9a0',
        tension: '#e9a045',
        voicing: '#4590e9',
        energy: '#a045e9',
      };
      ctx.strokeStyle = colors[this.activeParam] || '#e94560';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < points.length; i++) {
        const px = this.tickToX(points[i].tick);
        const py = this.valueToY(points[i].value);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();

      ctx.fillStyle = colors[this.activeParam] || '#e94560';
      for (const p of points) {
        const px = this.tickToX(p.tick);
        const py = this.valueToY(p.value);
        ctx.beginPath();
        ctx.arc(px, py, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (this.pianoRoll.playbackTick >= 0) {
      const px = this.tickToX(this.pianoRoll.playbackTick);
      ctx.strokeStyle = '#e94560';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, h);
      ctx.stroke();
    }
  }

  getParamsData() {
    return JSON.parse(JSON.stringify(this.params));
  }

  loadParamsData(data) {
    const defaults = { pitch: [], breathiness: [], tension: [], voicing: [], energy: [] };
    this.params = Object.assign(defaults, data);
    this.render();
  }
}
