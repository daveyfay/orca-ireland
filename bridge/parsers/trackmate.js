// ORCA Ireland — Trackmate parser. DRAFT — untested without hardware.
//
// Trackmate decoders generally emit simple ASCII over serial:
//   "$T,<transponder>,<time_ms>,<hits>\r\n"
// Some firmware uses a leading "$" and CSV fields. Adjust on bench.

class TrackmateParser {
  constructor(onCrossing, log = console.log) {
    this.onCrossing = onCrossing;
    this.log = log;
    this.buf = '';
  }

  feed(chunk) {
    this.buf += chunk.toString('ascii');
    let idx;
    while ((idx = this.buf.indexOf('\n')) >= 0) {
      const line = this.buf.slice(0, idx).trim();
      this.buf = this.buf.slice(idx + 1);
      if (line) this._parseLine(line);
    }
  }

  _parseLine(line) {
    const clean = line.replace(/^\$T,?/i, '').replace(/^\$/, '');
    const parts = clean.split(',').map(s => s.trim()).filter(Boolean);
    if (parts.length < 2) return;
    const transponder = parts[0];
    const rtcMs = Number(parts[1]);
    const hits = parts[2] ? Number(parts[2]) : null;
    if (!/^\d+$/.test(transponder)) return;
    this.onCrossing({
      transponder, timestamp: Date.now(),
      decoderRtcMs: isFinite(rtcMs) ? rtcMs : null,
      hits, source: 'trackmate',
    });
  }
}

module.exports = { TrackmateParser };
