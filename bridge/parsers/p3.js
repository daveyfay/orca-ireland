// ORCA Ireland — MyLaps P3/TranX parser. DRAFT — untested without hardware.
//
// P3 typically emits ASCII lines over serial or TCP, terminated by \r\n:
//   "@T <transponder>,<rtc_ms>,<strength>,<hits>\r\n"
// Exact prefix and separators vary by firmware. Adjust when hardware is on the bench.

class P3Parser {
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
    // Tolerate either "@T id,rtc,str,hits" or "id,rtc,str,hits".
    const clean = line.replace(/^@T\s*/i, '');
    const parts = clean.split(',').map(s => s.trim());
    if (parts.length < 2) return;
    const transponder = parts[0];
    const rtcMs = Number(parts[1]);
    const strength = parts[2] ? Number(parts[2]) : null;
    const hits = parts[3] ? Number(parts[3]) : null;
    if (!transponder || !/^\d+$/.test(transponder)) return;
    this.onCrossing({
      transponder, timestamp: Date.now(),
      decoderRtcMs: isFinite(rtcMs) ? rtcMs : null,
      strength, hits, source: 'p3',
    });
  }
}

module.exports = { P3Parser };
