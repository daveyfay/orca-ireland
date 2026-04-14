// ORCA Ireland — AMB/MyLaps RC3 & RC4 decoder parser.
//
// BEST-EFFORT, UNTESTED WITHOUT HARDWARE.
// RC3/RC4 use a proprietary binary framing over TCP port 5403.
//
// Frame shape (commonly documented):
//   0x8E ............... SOR (start of record)
//   VER  (1 byte)       protocol version
//   LEN  (2 bytes, LE)  length of payload
//   TYPE (1 byte)       record type (passing = 0x01)
//   PAYLOAD (LEN-?)     TLV-ish fields, each:
//       TAG  (1 byte)
//       TLEN (1 byte)
//       TVAL (TLEN bytes)
//   CRC  (2 bytes, LE)  CRC16
//   0x8F ............... EOR
//
// Tag values we care about (passing record):
//   0x01  transponder id       (4 bytes LE uint32)
//   0x02  rtc time (ms)        (8 bytes LE uint64) — decoder-local monotonic
//   0x03  strength             (1 byte)
//   0x04  hits                 (1 byte)
//
// NOTE: The exact byte layout varies slightly between RC3 and RC4 firmware.
// This parser handles framing defensively and logs unknown tags so we can
// verify when real hardware is available.

const SOR = 0x8E;
const EOR = 0x8F;

class AmbParser {
  constructor(onCrossing, log = console.log) {
    this.onCrossing = onCrossing;
    this.log = log;
    this.buf = Buffer.alloc(0);
  }

  // Feed raw bytes from the TCP socket / serial port.
  feed(chunk) {
    this.buf = Buffer.concat([this.buf, chunk]);
    this._drain();
  }

  _drain() {
    // Find frames: SOR ... EOR
    while (true) {
      const sor = this.buf.indexOf(SOR);
      if (sor < 0) { this.buf = Buffer.alloc(0); return; }
      if (sor > 0) this.buf = this.buf.subarray(sor);
      if (this.buf.length < 6) return; // need at least header

      // VER=1, LEN=2 LE, TYPE=1, then payload + CRC(2) + EOR(1)
      const len = this.buf.readUInt16LE(2);
      const frameEnd = 4 + 1 /*type*/ + len + 2 /*crc*/ + 1 /*eor*/;
      if (this.buf.length < frameEnd) return; // wait for more

      const frame = this.buf.subarray(0, frameEnd);
      this.buf = this.buf.subarray(frameEnd);

      if (frame[frame.length - 1] !== EOR) {
        this.log('[amb] bad EOR, resyncing');
        continue;
      }
      this._parseFrame(frame);
    }
  }

  _parseFrame(frame) {
    const type = frame[4];
    const payload = frame.subarray(5, frame.length - 3);
    if (type !== 0x01) {
      // Not a passing record — status, heartbeat, etc. Ignore silently.
      return;
    }
    let transponder = null;
    let rtcMs = null;
    let strength = null;
    let hits = null;

    let i = 0;
    while (i < payload.length) {
      const tag = payload[i++];
      const tlen = payload[i++];
      const tval = payload.subarray(i, i + tlen);
      i += tlen;
      switch (tag) {
        case 0x01: if (tlen >= 4) transponder = tval.readUInt32LE(0); break;
        case 0x02:
          // 8-byte LE ms since decoder boot. Use low 32 bits for safety.
          if (tlen >= 8) rtcMs = Number(tval.readBigUInt64LE(0));
          else if (tlen >= 4) rtcMs = tval.readUInt32LE(0);
          break;
        case 0x03: if (tlen >= 1) strength = tval[0]; break;
        case 0x04: if (tlen >= 1) hits = tval[0]; break;
        default:
          // Unknown tag — fine, just skip.
          break;
      }
    }

    if (transponder == null) return;
    // We prefer the wall-clock time of receipt. The decoder RTC is useful for
    // de-duplication but our browser only needs a timestamp it can compare.
    this.onCrossing({
      transponder: String(transponder),
      timestamp: Date.now(),
      decoderRtcMs: rtcMs,
      strength,
      hits,
      source: 'amb',
    });
  }
}

module.exports = { AmbParser };
