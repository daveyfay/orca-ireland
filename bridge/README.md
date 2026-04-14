# ORCA Ireland — Decoder Bridge

A tiny always-on service that sits between an RC transponder decoder and the
race-control website. Reads the decoder's stream (Ethernet TCP or USB-serial),
parses it, and emits normalized lap crossings over WebSocket so any laptop or
phone on the club WiFi can run race control in a browser.

**Designed to run on a Raspberry Pi** kept in a box at the track. No timing
laptop required — as long as the Pi and the decoder are on the same network,
race control just works.

## Supported decoders

| Decoder              | Status            | Connection          |
|----------------------|-------------------|---------------------|
| MyLaps/AMB RC3 & RC4 | primary target    | Ethernet TCP :5403  |
| MyLaps P3 / TranX    | draft, unverified | serial or TCP       |
| I-Lap                | draft, unverified | serial              |
| Trackmate            | draft, unverified | serial              |
| Simulator            | works             | none — fake data    |

Drafts will be verified and fixed the first time we get hands on the hardware.

## One-time Pi setup

1. Flash Raspberry Pi OS Lite (Bookworm or newer) to an SD card.
2. Put the Pi on the club network (Ethernet preferred for stability).
3. SSH into it and run:

   ```bash
   git clone https://github.com/daveyfay/orca-ireland.git
   cd orca-ireland/bridge
   sudo bash install.sh
   ```

4. Edit `/opt/orca-bridge/config.json` to point at the decoder:

   ```json
   {
     "decoder": "amb",
     "connection": "tcp",
     "host": "192.168.1.50",
     "port": 5403,
     "wsPort": 2346
   }
   ```

5. Restart the service:

   ```bash
   sudo systemctl restart orca-bridge
   journalctl -u orca-bridge -f
   ```

6. Note the Pi's IP (`hostname -I`). Race control in the browser will
   connect to `ws://<pi-ip>:2346`.

## Config reference

| Key          | Meaning                                                          |
|--------------|------------------------------------------------------------------|
| `decoder`    | `amb` / `p3` / `ilap` / `trackmate` — which parser to use        |
| `connection` | `tcp` or `serial` (inferred if omitted)                          |
| `host`       | Decoder IP (TCP mode)                                            |
| `port`       | Decoder TCP port — AMB uses 5403                                 |
| `serialPort` | e.g. `/dev/ttyUSB0` (serial mode)                                |
| `serialBaud` | Baud rate — AMB serial 19200, P3 115200                          |
| `wsPort`     | WebSocket server port the browser connects to (default 2346)     |
| `simulate`   | `true` to emit fake crossings for UI testing                     |

## Testing without a decoder

```bash
cd /opt/orca-bridge
npm run simulate
```

Or set `"simulate": true` in `config.json` and restart the service. The bridge
emits random fake crossings on the four test transponders.

## Wire format

WebSocket messages are JSON. Two kinds:

```jsonc
// Sent when a transponder crosses the loop.
{ "type": "crossing",
  "transponder": "12345",
  "timestamp": 1713100000000,
  "source": "amb",
  "strength": 180,
  "hits": 5,
  "decoderRtcMs": 987654321 }

// Sent on connect and whenever the decoder link goes up/down.
{ "type": "status",
  "decoderConnected": true,
  "decoder": "amb",
  "detail": "192.168.1.50:5403" }
```

## Ops cheatsheet

```bash
# Watch live logs
journalctl -u orca-bridge -f

# Health check
curl http://localhost:2346/status

# Restart after a config edit
sudo systemctl restart orca-bridge

# Disable autostart (rare)
sudo systemctl disable orca-bridge
```

## Limitations / known gaps

- The AMB RC3/RC4 parser is written from the published frame spec but has not
  been tested against a live decoder. The framing is defensive (resyncs on
  bad EOR) so misinterpreting a field yields nothing, not garbage — but lap
  data could still be wrong until we verify on the bench.
- P3, I-Lap, and Trackmate parsers are stubs. They'll almost certainly need
  edits the first time we see their actual byte stream.
- The bridge does not currently expose a web UI for editing config — SSH in
  and edit `/opt/orca-bridge/config.json`.
