#!/usr/bin/env python3
"""Build the ORCA Ireland timing bridge setup guide PDF.

Output: public/orca-timing-bridge-setup.pdf

Run from the repo root:
    python3 bridge/make-setup-pdf.py
"""

import os
from pathlib import Path
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor, black, white
from reportlab.lib.enums import TA_LEFT, TA_CENTER
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, PageBreak,
    Table, TableStyle, KeepTogether,
)

OUT = Path(__file__).resolve().parent.parent / "public" / "orca-timing-bridge-setup.pdf"
ORANGE = HexColor("#ff6b00")
DARK   = HexColor("#111111")
GREY   = HexColor("#666666")
LIGHT  = HexColor("#f4f4f4")

styles = getSampleStyleSheet()
body = ParagraphStyle(
    "body", parent=styles["Normal"],
    fontName="Helvetica", fontSize=10.5, leading=15,
    textColor=black, spaceAfter=6,
)
h1 = ParagraphStyle(
    "h1", parent=styles["Heading1"],
    fontName="Helvetica-Bold", fontSize=18, leading=22,
    textColor=DARK, spaceBefore=14, spaceAfter=8,
    borderPadding=0,
)
h2 = ParagraphStyle(
    "h2", parent=styles["Heading2"],
    fontName="Helvetica-Bold", fontSize=13, leading=18,
    textColor=ORANGE, spaceBefore=14, spaceAfter=4,
)
callout = ParagraphStyle(
    "callout", parent=body,
    fontName="Helvetica", fontSize=10, leading=14,
    textColor=DARK, backColor=LIGHT,
    borderPadding=(8, 10, 8, 10),
    spaceBefore=6, spaceAfter=10,
)
code = ParagraphStyle(
    "code", parent=body,
    fontName="Courier", fontSize=9.5, leading=13,
    textColor=black, backColor=HexColor("#f0f0f0"),
    borderPadding=(6, 8, 6, 8),
    spaceBefore=4, spaceAfter=8,
)
cover_sub = ParagraphStyle(
    "cover_sub", parent=body,
    fontName="Helvetica", fontSize=12, leading=18,
    textColor=GREY, alignment=TA_CENTER,
)
cover_title = ParagraphStyle(
    "cover_title", parent=styles["Title"],
    fontName="Helvetica-Bold", fontSize=30, leading=36,
    textColor=DARK, alignment=TA_CENTER, spaceAfter=4,
)
cover_brand = ParagraphStyle(
    "cover_brand", parent=styles["Title"],
    fontName="Helvetica-Bold", fontSize=18, leading=22,
    textColor=ORANGE, alignment=TA_CENTER, spaceAfter=20,
)

# ── Page template ────────────────────────────────────────────────────────────

def on_page(canvas, doc):
    canvas.saveState()
    # Footer strip
    canvas.setStrokeColor(ORANGE)
    canvas.setLineWidth(1.5)
    canvas.line(15*mm, 15*mm, A4[0] - 15*mm, 15*mm)
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(GREY)
    canvas.drawString(15*mm, 9*mm, "ORCA Ireland — Timing Bridge Setup")
    canvas.drawRightString(A4[0] - 15*mm, 9*mm, f"Page {doc.page}")
    canvas.restoreState()


def code_block(text):
    """A paragraph with <br/> line breaks rendered as a code block."""
    escaped = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    escaped = escaped.replace("\n", "<br/>")
    return Paragraph(escaped, code)


def callout_block(text):
    return Paragraph(text, callout)

# ── Content ──────────────────────────────────────────────────────────────────

story = []

# --- Cover ---
story.append(Spacer(1, 60*mm))
story.append(Paragraph("ORCA <font color='#ff6b00'>IRELAND</font>", cover_brand))
story.append(Paragraph("Timing Bridge", cover_title))
story.append(Paragraph("Setup Guide", cover_title))
story.append(Spacer(1, 12*mm))
story.append(Paragraph(
    "How to install and run the transponder decoder bridge that feeds "
    "laps into race control. Suitable for a Raspberry Pi, a Windows "
    "laptop, or a Mac.", cover_sub,
))
story.append(Spacer(1, 40*mm))
story.append(Paragraph("Version 1.0 · April 2026", cover_sub))
story.append(PageBreak())

# --- Intro ---
story.append(Paragraph("1. What this is", h1))
story.append(Paragraph(
    "The <b>timing bridge</b> is a small background app that reads laps "
    "from the transponder decoder and feeds them to the race control "
    "website. It replaces the old setup where one specific laptop had "
    "to be on the decoder — any device on the club network can now run "
    "it, including a Raspberry Pi kept permanently at the track.",
    body,
))
story.append(Paragraph(
    "You only need <b>one</b> bridge running at a time. Everyone else — "
    "race control, spectators — just points their browser at the site.",
    body,
))

story.append(Paragraph("2. Before you start", h1))
story.append(Paragraph("You will need:", body))
bullets = [
    ("A machine to run the bridge on.",
     "A Raspberry Pi is ideal because it stays plugged in permanently. "
     "Any Mac or Windows laptop also works for testing or as a fallback."),
    ("Node.js installed on that machine.",
     "Free download from <b>nodejs.org</b> — always pick the <b>LTS</b> "
     "installer and accept all the defaults. Takes one minute."),
    ("A network connection between the bridge machine and the decoder.",
     "Usually plugging both into the same router or switch. The decoder "
     "needs an IP address the bridge can reach."),
    ("Access to the ORCA admin panel.",
     "To download the installer file that matches your operating system."),
]
for title, desc in bullets:
    story.append(Paragraph(
        f"<b>•&nbsp; {title}</b> &nbsp; {desc}", body,
    ))
story.append(Spacer(1, 6))

story.append(callout_block(
    "<b>Tip:</b> You can do the whole setup today without a real decoder. "
    "The bridge has a <b>simulator mode</b> that invents fake transponder "
    "crossings every few seconds, letting you verify that race control is "
    "seeing laps end-to-end before any hardware shows up."
))

story.append(PageBreak())

# --- Option A: Laptop ---
story.append(Paragraph("3. Install on a laptop (Windows or Mac)", h1))
story.append(Paragraph(
    "Use this option for testing, one-off events, or as a backup if the "
    "Pi is unavailable. The club laptop works just as well as a Pi.",
    body,
))

story.append(Paragraph("Step 1 · Install Node.js", h2))
story.append(Paragraph(
    "Go to <b>https://nodejs.org</b>, click the green LTS download button, "
    "run the installer, and click Next through every screen. Nothing "
    "needs to be configured. Close the installer when it finishes.",
    body,
))

story.append(Paragraph("Step 2 · Download the bridge installer", h2))
story.append(Paragraph(
    "Sign in to the ORCA Ireland website as an admin. Open the "
    "<b>Admin</b> tab and find the <b>Timing Decoder Bridge</b> panel. "
    "Click the button that matches your computer:",
    body,
))
story.append(Paragraph("&nbsp;&nbsp;• <b>Windows</b> → downloads <i>orca-bridge-windows.zip</i>", body))
story.append(Paragraph("&nbsp;&nbsp;• <b>Mac</b> → downloads <i>orca-bridge-mac.zip</i>", body))

story.append(Paragraph("Step 3 · Run the installer", h2))
story.append(Paragraph(
    "Open the zip file (double-click it). Inside you will find one file — "
    "<i>install-windows.bat</i> on Windows or <i>install-mac.command</i> on Mac. "
    "Double-click it.",
    body,
))
story.append(callout_block(
    "<b>First-run warning on Mac or Windows:</b> because the file came from "
    "the internet, your computer may block it the first time. "
    "<br/><br/>"
    "<b>On Mac:</b> Open <b>System Settings → Privacy &amp; Security</b>. "
    "Scroll down; there will be a line saying the installer was blocked, "
    "with an <b>Open Anyway</b> button. Click it, then try again."
    "<br/><br/>"
    "<b>On Windows:</b> A blue SmartScreen box appears. Click <b>More info</b>, "
    "then <b>Run anyway</b>."
))
story.append(Paragraph(
    "A terminal window opens and the installer runs. It will install "
    "some dependencies (takes about a minute), then print "
    "&quot;Installation complete&quot;. Close the window.",
    body,
))

story.append(Paragraph("Step 4 · Start the bridge", h2))
story.append(Paragraph(
    "The installer drops a shortcut called <b>run-orca-bridge</b> on your "
    "Desktop. Double-click it any time you want to run the bridge. A "
    "terminal window opens and shows log lines. <b>Leave that window open</b> "
    "while you want the bridge to run; closing it stops the bridge.",
    body,
))

story.append(Paragraph("Step 5 · Verify with race control", h2))
story.append(Paragraph(
    "Open the ORCA Ireland site in your browser, go to race control, and "
    "sign in. On the setup screen you will see a <b>Decoder Bridge</b> card "
    "with two status lines: <b>Bridge</b> and <b>Decoder</b>. Within a second "
    "or two they should both go green:",
    body,
))
story.append(code_block(
    "Bridge:    Connected · localhost:2346\n"
    "Decoder:   AMB online · simulator"
))
story.append(Paragraph(
    "If you start a race day now, simulated transponders (10001, 10002, "
    "10003, 10004) will cross the loop every 8 to 14 seconds. You can "
    "assign these to drivers in setup to see laps flow through the "
    "whole system without any hardware.",
    body,
))

story.append(PageBreak())

# --- Option B: Pi ---
story.append(Paragraph("4. Install on a Raspberry Pi (permanent setup)", h1))
story.append(Paragraph(
    "This is the recommended long-term configuration. Once set up, the "
    "Pi lives in a box at the track, starts the bridge automatically at "
    "power-on, and needs no attention.",
    body,
))

story.append(Paragraph("What you need", h2))
story.append(Paragraph(
    "Any Raspberry Pi from a Pi 3 onwards (a Pi Zero 2 W also works), "
    "an SD card of 8 GB or more, a power supply, and a way to connect "
    "the Pi to the club network — Ethernet cable is easiest and most "
    "reliable.",
    body,
))

story.append(Paragraph("Step 1 · Flash Raspberry Pi OS", h2))
story.append(Paragraph(
    "Download the <b>Raspberry Pi Imager</b> from raspberrypi.com. Insert "
    "the SD card into your computer, run the imager, choose <b>Raspberry Pi "
    "OS Lite (64-bit)</b>, and select your SD card. Before writing, open "
    "the gear icon (advanced options) and:",
    body,
))
story.append(Paragraph("&nbsp;&nbsp;• Enable SSH with a password you will remember", body))
story.append(Paragraph("&nbsp;&nbsp;• Set the user to <b>pi</b>", body))
story.append(Paragraph("&nbsp;&nbsp;• Set the hostname to something memorable like <b>orca-bridge</b>", body))
story.append(Paragraph("&nbsp;&nbsp;• Fill in Wi-Fi details if you are not using Ethernet", body))
story.append(Paragraph(
    "Click Write. Once it finishes, slot the SD card into the Pi and "
    "power it on. Give it a minute to boot.",
    body,
))

story.append(Paragraph("Step 2 · SSH into the Pi", h2))
story.append(Paragraph(
    "From any computer on the same network, open a terminal and run:",
    body,
))
story.append(code_block("ssh pi@orca-bridge.local"))
story.append(Paragraph(
    "Enter the password you set in the imager. You should see a command "
    "prompt.",
    body,
))

story.append(Paragraph("Step 3 · Install the bridge", h2))
story.append(Paragraph("Paste these two commands:", body))
story.append(code_block(
    "git clone https://github.com/daveyfay/orca-ireland.git\n"
    "cd orca-ireland/bridge && sudo bash install.sh"
))
story.append(Paragraph(
    "The script installs Node.js, copies the bridge into "
    "<i>/opt/orca-bridge</i>, sets up a background service that starts "
    "at boot, and creates a default config file in simulator mode.",
    body,
))

story.append(Paragraph("Step 4 · Point the bridge at your decoder", h2))
story.append(Paragraph(
    "Edit the config file:",
    body,
))
story.append(code_block("sudo nano /opt/orca-bridge/config.json"))
story.append(Paragraph(
    "Replace the contents with your decoder details. For an AMB decoder "
    "on the network, that looks like:",
    body,
))
story.append(code_block(
    '{\n'
    '  "decoder": "amb",\n'
    '  "connection": "tcp",\n'
    '  "host": "192.168.1.50",\n'
    '  "port": 5403,\n'
    '  "wsPort": 2346\n'
    '}'
))
story.append(Paragraph(
    "Change <b>host</b> to whatever IP address your decoder has on the "
    "network. Save with <b>Ctrl+O</b> then <b>Enter</b>, exit with <b>Ctrl+X</b>. "
    "Restart the bridge:",
    body,
))
story.append(code_block("sudo systemctl restart orca-bridge"))

story.append(Paragraph("Step 5 · Verify", h2))
story.append(Paragraph(
    "Watch the live log to confirm the bridge is reading crossings:",
    body,
))
story.append(code_block("journalctl -u orca-bridge -f"))
story.append(Paragraph(
    "When a car with a transponder crosses the loop, a line like "
    "<i>[bridge] crossing t=12345</i> will appear. Press <b>Ctrl+C</b> to "
    "stop watching (the bridge keeps running).",
    body,
))
story.append(Paragraph(
    "In race control, the <b>Bridge</b> URL becomes "
    "<b>ws://orca-bridge.local:2346</b> (replace with the Pi's IP if "
    "<i>.local</i> doesn't resolve on your network).",
    body,
))

story.append(PageBreak())

# --- Config reference ---
story.append(Paragraph("5. Config reference", h1))
story.append(Paragraph(
    "All settings live in <b>config.json</b> in the install folder "
    "(<i>/opt/orca-bridge</i> on the Pi, <i>orca-bridge</i> in your home "
    "folder on Mac or Windows).",
    body,
))

cfg_rows = [
    ["Key", "What it means"],
    ["decoder", "amb, p3, ilap, or trackmate — which parser to use."],
    ["connection", "tcp (Ethernet decoder) or serial (USB cable). Inferred if omitted."],
    ["host", "Decoder IP on the network (TCP mode)."],
    ["port", "Decoder TCP port. AMB uses 5403."],
    ["serialPort", "Serial port path — e.g. /dev/ttyUSB0 (Pi) or COM3 (Windows)."],
    ["serialBaud", "Baud rate. AMB serial 19200, P3 115200."],
    ["wsPort", "Port the bridge listens on for browsers. Default 2346 — leave as-is."],
    ["simulate", "true to emit fake crossings with no hardware. Great for testing."],
]
tbl = Table(cfg_rows, colWidths=[35*mm, 130*mm])
tbl.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), DARK),
    ("TEXTCOLOR", (0, 0), (-1, 0), white),
    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
    ("FONTSIZE", (0, 0), (-1, -1), 9.5),
    ("FONTNAME", (0, 1), (0, -1), "Courier-Bold"),
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("TOPPADDING", (0, 0), (-1, -1), 6),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ("LEFTPADDING", (0, 0), (-1, -1), 8),
    ("RIGHTPADDING", (0, 0), (-1, -1), 8),
    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [white, LIGHT]),
    ("LINEBELOW", (0, 0), (-1, -1), 0.25, GREY),
]))
story.append(tbl)
story.append(Spacer(1, 10))
story.append(callout_block(
    "<b>Rule of thumb:</b> if you are on Ethernet, you only need "
    "<b>decoder</b>, <b>host</b>, <b>port</b>, and <b>wsPort</b>. Remove or "
    "ignore anything else."
))

story.append(PageBreak())

# --- Troubleshooting ---
story.append(Paragraph("6. Troubleshooting", h1))

trouble = [
    ("Race control says <b>Bridge: Connection error</b>.",
     "The bridge isn't running on the machine race control is pointing at, "
     "or the URL is wrong. Check the terminal window or (on Pi) "
     "<i>journalctl -u orca-bridge</i> for errors. Confirm the URL matches "
     "the machine running the bridge."),

    ("Race control says <b>Bridge: Connected</b> but <b>Decoder: ... offline</b>.",
     "The bridge is up but can't talk to the decoder. Check the decoder is "
     "powered on and on the same network. On the Pi, run "
     "<i>ping 192.168.1.50</i> (replace with your decoder IP) to confirm "
     "network reachability. Double-check <b>host</b> and <b>port</b> in "
     "config.json."),

    ("Simulator mode works but the real decoder shows nothing.",
     "The AMB parser was written from the protocol spec and may need tweaks "
     "for your specific firmware. Capture a few seconds of the raw stream "
     "with <i>journalctl -u orca-bridge -f</i> and send to the site admin — "
     "usually fixable in minutes."),

    ("The terminal window keeps closing on my laptop.",
     "Double-click the Desktop shortcut again. If it closes immediately, "
     "Node.js isn't installed — go back to Step 1 of the laptop guide."),

    ("I can reach the Pi from my phone but not from my laptop.",
     "Usually a firewall on the laptop. Check that port 2346 isn't blocked, "
     "or use the Pi's IP address directly instead of its <i>.local</i> name."),

    ("How do I check the bridge is still running?",
     "<b>On a laptop:</b> look for the terminal window. <b>On the Pi:</b> "
     "run <i>systemctl status orca-bridge</i> — active (running) means it's up."),
]
for q, a in trouble:
    story.append(Paragraph(f"<b>Q. {q}</b>", body))
    story.append(Paragraph(a, body))
    story.append(Spacer(1, 6))

story.append(PageBreak())

# --- Appendix ---
story.append(Paragraph("7. Reference — supported decoders", h1))

dec_rows = [
    ["Decoder", "Status", "Connection"],
    ["MyLaps / AMB RC3 & RC4", "Primary target", "Ethernet TCP port 5403"],
    ["MyLaps P3 / TranX",      "Draft, unverified", "Serial or TCP"],
    ["I-Lap",                  "Draft, unverified", "Serial"],
    ["Trackmate",              "Draft, unverified", "Serial"],
    ["Simulator",              "Works",             "None — generates fake data"],
]
dt = Table(dec_rows, colWidths=[60*mm, 40*mm, 65*mm])
dt.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), DARK),
    ("TEXTCOLOR", (0, 0), (-1, 0), white),
    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
    ("FONTSIZE", (0, 0), (-1, -1), 9.5),
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("TOPPADDING", (0, 0), (-1, -1), 6),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ("LEFTPADDING", (0, 0), (-1, -1), 8),
    ("RIGHTPADDING", (0, 0), (-1, -1), 8),
    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [white, LIGHT]),
    ("LINEBELOW", (0, 0), (-1, -1), 0.25, GREY),
]))
story.append(dt)
story.append(Spacer(1, 10))
story.append(Paragraph(
    "Drafts will be verified and adjusted the first time we have hands on "
    "the hardware. If the club ever acquires one of the non-AMB decoders, "
    "a short capture of its data stream is usually enough to correct the "
    "parser.",
    body,
))

story.append(Paragraph("Useful commands — Raspberry Pi", h2))
story.append(code_block(
    "sudo systemctl restart orca-bridge    # apply config changes\n"
    "sudo systemctl status orca-bridge     # is it running?\n"
    "sudo systemctl stop orca-bridge       # stop temporarily\n"
    "sudo systemctl disable orca-bridge    # stop auto-start at boot\n"
    "journalctl -u orca-bridge -f          # watch live logs\n"
    "curl http://localhost:2346/status     # health check"
))

story.append(Paragraph("Getting help", h2))
story.append(Paragraph(
    "Contact the ORCA Ireland site admin with the event name, approximate "
    "time, and if possible a copy of the journalctl output covering the "
    "problem window. Most issues are fixed within the same evening.",
    body,
))

# ── Build ────────────────────────────────────────────────────────────────────

def build():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(
        str(OUT), pagesize=A4,
        leftMargin=18*mm, rightMargin=18*mm,
        topMargin=18*mm, bottomMargin=22*mm,
        title="ORCA Ireland — Timing Bridge Setup Guide",
        author="ORCA Ireland",
    )
    doc.build(story, onFirstPage=on_page, onLaterPages=on_page)
    size = OUT.stat().st_size
    print(f"Wrote {OUT} ({size:,} bytes)")


if __name__ == "__main__":
    build()
