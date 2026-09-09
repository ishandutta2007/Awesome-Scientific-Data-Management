const fs = require('fs');
const path = require('path');

// Simple minimal GIF89a encoder for node without external dependencies
function createBannerGif(outputPath) {
  const width = 640;
  const height = 320;
  const numFrames = 18;
  const delay = 8; // 80ms per frame = ~12.5 fps

  // Palette: 64 colors
  // 0: background #0b1120
  // 1-15: blues / cyans (#0284c7 to #38bdf8)
  // 16-30: greens / emerald (#059669 to #34d399)
  // 31-45: purples / indigo (#6366f1 to #a855f7)
  // 46-55: grays / slates
  // 56-63: whites / bright highlights
  const palette = [];
  function addColor(r, g, b) { palette.push(r, g, b); }

  addColor(11, 17, 32); // 0: Dark Navy BG (#0b1120)
  addColor(15, 23, 42); // 1: Slate 900
  addColor(30, 41, 59); // 2: Slate 800
  addColor(51, 65, 85); // 3: Slate 700
  addColor(71, 85, 105); // 4: Slate 600
  addColor(148, 163, 184); // 5: Slate 400
  addColor(203, 213, 225); // 6: Slate 300
  addColor(241, 245, 249); // 7: Slate 100
  addColor(255, 255, 255); // 8: Pure White

  // Blues / Cyans (9 to 20)
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    addColor(Math.round(2 + t * 54), Math.round(132 + t * 57), Math.round(199 + t * 49)); // #0284c7 -> #38bdf8
  }
  // Greens / Emerald (21 to 32)
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    addColor(Math.round(5 + t * 47), Math.round(150 + t * 61), Math.round(105 + t * 48)); // #059669 -> #34d399
  }
  // Violets / Indigo (33 to 44)
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    addColor(Math.round(99 + t * 69), Math.round(102 + t * -17), Math.round(241 + t * 6)); // #6366f1 -> #a855f7
  }
  // Fill rest up to 64 colors (2^6 = 64 color table)
  while (palette.length < 64 * 3) {
    palette.push(20, 30, 50);
  }

  // Helper to encode GIF
  const buffer = [];
  function writeByte(b) { buffer.push(b & 0xFF); }
  function writeShort(s) { buffer.push(s & 0xFF, (s >> 8) & 0xFF); }
  function writeString(str) { for (let i = 0; i < str.length; i++) writeByte(str.charCodeAt(i)); }

  // GIF Header
  writeString('GIF89a');
  writeShort(width);
  writeShort(height);
  // GCT Flag = 1, Color Res = 5 (6 bits), Sort = 0, GCT Size = 5 (2^(5+1) = 64 colors) -> 0b11010101 = 0xD5
  writeByte(0xD5);
  writeByte(0); // BG Color index = 0
  writeByte(0); // Pixel aspect ratio

  // Global Color Table (64 * 3 bytes)
  for (let i = 0; i < palette.length; i++) writeByte(palette[i]);

  // Netscape Application Block for Looping
  writeByte(0x21); writeByte(0xFF); writeByte(0x0B);
  writeString('NETSCAPE2.0');
  writeByte(0x03); writeByte(0x01); writeShort(0); writeByte(0x00);

  // Render Frames
  // Note requirement: "50px padding on both top and bottom each to prevent being cropped"
  // Drawing area: y between 50 and 270.
  for (let f = 0; f < numFrames; f++) {
    // Graphic Control Extension
    writeByte(0x21); writeByte(0xF9); writeByte(0x04);
    writeByte(0x00); // No transparency
    writeShort(delay);
    writeByte(0); writeByte(0);

    // Image Descriptor
    writeByte(0x2C);
    writeShort(0); writeShort(0);
    writeShort(width); writeShort(height);
    writeByte(0x00); // No Local Color Table

    // Render frame pixel array (width x height)
    const frame = new Uint8Array(width * height);
    frame.fill(0); // Background color #0b1120

    // Draw background subtle grid lines
    for (let y = 50; y < 270; y += 30) {
      for (let x = 30; x < width - 30; x++) {
        frame[y * width + x] = 1; // subtle slate line
      }
    }
    for (let x = 30; x < width - 30; x += 30) {
      for (let y = 50; y < 270; y++) {
        frame[y * width + x] = 1;
      }
    }

    // Draw Content Boundaries & Decorative Card (within 50px - 270px)
    // Pill tag at y = 62..82, x = 40..250
    for (let py = 64; py <= 84; py++) {
      for (let px = 40; px <= 260; px++) {
        frame[py * width + px] = 2; // slate pill box
      }
    }

    // DNA Wave animation on the right side (x: 420 to 600, y: 70 to 250)
    const phase = (f / numFrames) * Math.PI * 2;
    for (let i = 0; i < 9; i++) {
      const ny = 80 + i * 20; // 80 to 240 (safely inside padding!)
      const nodePhase = phase + i * 0.7;
      const xOffset = Math.sin(nodePhase) * 60;
      const cx1 = Math.round(510 + xOffset);
      const cx2 = Math.round(510 - xOffset);

      // Connecting rung
      const minX = Math.min(cx1, cx2);
      const maxX = Math.max(cx1, cx2);
      for (let rx = minX; rx <= maxX; rx++) {
        if (rx >= 0 && rx < width) frame[ny * width + rx] = 3;
      }

      // Strand 1 node (Cyan/Blue: 9..19)
      const c1 = 9 + Math.floor(((Math.sin(nodePhase) + 1) / 2) * 10);
      drawCircle(frame, width, cx1, ny, 5, c1);

      // Strand 2 node (Green/Emerald: 21..31)
      const c2 = 21 + Math.floor(((Math.cos(nodePhase) + 1) / 2) * 10);
      drawCircle(frame, width, cx2, ny, 5, c2);
    }

    // Dynamic wave at bottom inside safe zone (y: 245 to 260)
    for (let x = 40; x < 400; x++) {
      const wy = Math.round(250 + Math.sin(x * 0.03 + phase) * 6);
      if (wy >= 50 && wy < 270) frame[wy * width + x] = 14;
    }

    // Draw Title Letter Shapes / Blocks for crisp aesthetics
    // Line 1: "AWESOME SCIENTIFIC" (y: 100 to 135)
    drawBlockText(frame, width, 40, 102, "AWESOME SCIENTIFIC", 15);
    // Line 2: "DATA MANAGEMENT" (y: 142 to 177)
    drawBlockText(frame, width, 40, 142, "DATA MANAGEMENT", 26);
    // Line 3: "ELN • LIMS • SDMS • FAIR DATA" (y: 188 to 202)
    drawMiniText(frame, width, 40, 192, "ELN  LIMS  SDMS  FAIR DATA", 5);
    // Line 4: Badges (y: 216 to 238)
    drawPill(frame, width, 40, 216, 95, 20, 2, "SAAS", 8);
    drawPill(frame, width, 145, 216, 120, 20, 2, "OPEN-SOURCE", 8);
    drawPill(frame, width, 275, 216, 105, 20, 21, "PRICING", 8);

    // Encode uncompressed LZW for this frame
    encodeFrameLZW(buffer, frame, 6);
  }

  writeByte(0x3B); // GIF Trailer

  const outBuf = Buffer.from(buffer);
  fs.writeFileSync(outputPath, outBuf);
  console.log(`Saved ${outputPath}, size: ${outBuf.length} bytes`);
}

function drawCircle(frame, width, cx, cy, r, color) {
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy <= r * r) {
        const px = cx + dx;
        const py = cy + dy;
        if (px >= 0 && px < width && py >= 0 && py < 320) {
          frame[py * width + px] = color;
        }
      }
    }
  }
}

function drawPill(frame, width, x, y, w, h, bg, text, fg) {
  for (let py = y; py < y + h; py++) {
    for (let px = x; px < x + w; px++) {
      frame[py * width + px] = bg;
    }
  }
  drawMiniText(frame, width, x + 10, y + 5, text, fg);
}

// 5x7 bitmap font for block titles
const FONT = {
  'A': [0x7C,0x12,0x11,0x12,0x7C], 'B': [0x7F,0x49,0x49,0x49,0x36], 'C': [0x3E,0x41,0x41,0x41,0x22],
  'D': [0x7F,0x41,0x41,0x22,0x1C], 'E': [0x7F,0x49,0x49,0x49,0x41], 'F': [0x7F,0x09,0x09,0x09,0x01],
  'G': [0x3E,0x41,0x49,0x49,0x7A], 'H': [0x7F,0x08,0x08,0x08,0x7F], 'I': [0x00,0x41,0x7F,0x41,0x00],
  'J': [0x20,0x40,0x41,0x3F,0x01], 'K': [0x7F,0x08,0x14,0x22,0x41], 'L': [0x7F,0x40,0x40,0x40,0x40],
  'M': [0x7F,0x02,0x0C,0x02,0x7F], 'N': [0x7F,0x04,0x08,0x10,0x7F], 'O': [0x3E,0x41,0x41,0x41,0x3E],
  'P': [0x7F,0x09,0x09,0x09,0x06], 'Q': [0x3E,0x41,0x51,0x21,0x5E], 'R': [0x7F,0x09,0x19,0x29,0x46],
  'S': [0x46,0x49,0x49,0x49,0x31], 'T': [0x01,0x01,0x7F,0x01,0x01], 'U': [0x3F,0x40,0x40,0x40,0x3F],
  'V': [0x1F,0x20,0x40,0x20,0x1F], 'W': [0x7F,0x20,0x18,0x20,0x7F], 'X': [0x63,0x14,0x08,0x14,0x63],
  'Y': [0x07,0x08,0x70,0x08,0x07], 'Z': [0x61,0x51,0x49,0x45,0x43], ' ': [0,0,0,0,0], '-': [8,8,8,8,8]
};

function drawBlockText(frame, width, startX, startY, text, color) {
  let cx = startX;
  const scale = 3;
  for (let ch of text) {
    const glyph = FONT[ch] || FONT[' '];
    for (let col = 0; col < 5; col++) {
      const colBits = glyph[col];
      for (let row = 0; row < 7; row++) {
        if (colBits & (1 << row)) {
          for (let sy = 0; sy < scale; sy++) {
            for (let sx = 0; sx < scale; sx++) {
              const px = cx + col * scale + sx;
              const py = startY + row * scale + sy;
              if (px < width && py < 320) frame[py * width + px] = color;
            }
          }
        }
      }
    }
    cx += (5 + 1) * scale + 2;
  }
}

function drawMiniText(frame, width, startX, startY, text, color) {
  let cx = startX;
  const scale = 1;
  for (let ch of text) {
    const glyph = FONT[ch] || FONT[' '];
    for (let col = 0; col < 5; col++) {
      const colBits = glyph[col];
      for (let row = 0; row < 7; row++) {
        if (colBits & (1 << row)) {
          const px = cx + col;
          const py = startY + row;
          if (px < width && py < 320) frame[py * width + px] = color;
        }
      }
    }
    cx += 6;
  }
}

// LZW Encoder for standard GIF
function encodeFrameLZW(buffer, pixels, minCodeSize) {
  buffer.push(minCodeSize);

  const clearCode = 1 << minCodeSize;
  const eoiCode = clearCode + 1;
  let codeSize = minCodeSize + 1;
  let maxCode = 1 << codeSize;

  let dict = new Map();
  function resetDict() {
    dict.clear();
    for (let i = 0; i < clearCode; i++) dict.set(String.fromCharCode(i), i);
    codeSize = minCodeSize + 1;
    maxCode = 1 << codeSize;
  }
  resetDict();

  let curBits = 0;
  let curVal = 0;
  const packet = [];

  function emitCode(code) {
    curVal |= (code << curBits);
    curBits += codeSize;
    while (curBits >= 8) {
      packet.push(curVal & 0xFF);
      curVal >>= 8;
      curBits -= 8;
      if (packet.length === 254) {
        buffer.push(packet.length);
        for (let b of packet) buffer.push(b);
        packet.length = 0;
      }
    }
  }

  emitCode(clearCode);

  let currentPrefix = '';
  for (let i = 0; i < pixels.length; i++) {
    const c = String.fromCharCode(pixels[i]);
    const next = currentPrefix + c;
    if (dict.has(next)) {
      currentPrefix = next;
    } else {
      emitCode(dict.get(currentPrefix));
      if (dict.size < 4096) {
        dict.set(next, dict.size);
        if (dict.size >= maxCode && codeSize < 12) {
          codeSize++;
          maxCode = 1 << codeSize;
        }
      } else {
        emitCode(clearCode);
        resetDict();
      }
      currentPrefix = c;
    }
  }
  if (currentPrefix.length > 0) {
    emitCode(dict.get(currentPrefix));
  }
  emitCode(eoiCode);

  if (curBits > 0) {
    packet.push(curVal & 0xFF);
  }
  if (packet.length > 0) {
    buffer.push(packet.length);
    for (let b of packet) buffer.push(b);
  }
  buffer.push(0); // Block terminator
}

createBannerGif(path.join(__dirname, 'assets', 'banner.gif'));
