// ORCA Ireland — I-Lap parser. DRAFT — untested without hardware.
//
// I-Lap typically emits short ASCII packets over serial, something like:
//   "<STX>T<transponder>,<time_ms><ETX>"
// or comma-separated lines. We handle both defensively.

class ILapParser {
  constructor(onCrossing, log = console.log) {
    this.onCrossing = onCrossing;
    this.log = log;
    this.buf = '';
  }

  feed(chunk) {
    this.buf += chunk.toString('ascii').replace(/[\x02\x03]/g, '\n');
    let idx;
    while ((idx = this.buf.indexOf('\n')) >= 0) {
      const line = this.buf.slice(0, idx).trim();
      this.buf = this.buf.slice(idx + 1);
      if (line) this._parseLine(line);
    }
  }

  _parseLine(line) {
    const clean = line.replace(/^T/i, '');
    const parts = clean.split(/[,;\s]+/).filter(Boolean);
    if (parts.length < 2) return;
    const transponder = parts[0];
    const rtcMs = Number(parts[1]);
    if (!/^\d+$/.test(transponder)) return;
    this.onCrossing({
      transponder, timestamp: Date.now(),
      decoderRtcMs: isFinite(rtcMs) ? rtcMs : null,
      source: 'ilap',
    });
  }
}

module.exports = { ILapParser };
