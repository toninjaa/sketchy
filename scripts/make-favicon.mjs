import { writeFileSync } from "node:fs";

const size = 32;
const pixels = Buffer.alloc(size * size * 4);

function setPixel(x, y, r, g, b, a = 255) {
  if (x < 0 || x >= size || y < 0 || y >= size) return;
  const offset = (y * size + x) * 4;
  pixels[offset] = b;
  pixels[offset + 1] = g;
  pixels[offset + 2] = r;
  pixels[offset + 3] = a;
}

function fillRect(x, y, width, height, color) {
  for (let row = y; row < y + height; row += 1) {
    for (let col = x; col < x + width; col += 1) {
      setPixel(col, row, ...color);
    }
  }
}

function fillCircle(cx, cy, radius, color) {
  for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y += 1) {
    for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x += 1) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2) setPixel(x, y, ...color);
    }
  }
}

function line(x1, y1, x2, y2, color, thickness = 1) {
  const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
  for (let i = 0; i <= steps; i += 1) {
    const x = Math.round(x1 + ((x2 - x1) * i) / steps);
    const y = Math.round(y1 + ((y2 - y1) * i) / steps);
    fillCircle(x, y, thickness / 2, color);
  }
}

function polygon(points, color) {
  const minY = Math.min(...points.map((point) => point[1]));
  const maxY = Math.max(...points.map((point) => point[1]));
  for (let y = minY; y <= maxY; y += 1) {
    const intersections = [];
    for (let i = 0; i < points.length; i += 1) {
      const [x1, y1] = points[i];
      const [x2, y2] = points[(i + 1) % points.length];
      if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) {
        intersections.push(x1 + ((y - y1) * (x2 - x1)) / (y2 - y1));
      }
    }
    intersections.sort((a, b) => a - b);
    for (let i = 0; i < intersections.length; i += 2) {
      for (let x = Math.ceil(intersections[i]); x <= Math.floor(intersections[i + 1]); x += 1) {
        setPixel(x, y, ...color);
      }
    }
  }
}

fillRect(0, 0, size, size, [118, 215, 207]);
fillCircle(6, 6, 2, [255, 249, 241]);
fillCircle(25, 8, 1.5, [255, 249, 241]);
fillCircle(9, 25, 1.5, [255, 249, 241]);

polygon(
  [
    [10, 4],
    [23, 6],
    [27, 12],
    [24, 28],
    [7, 25],
  ],
  [37, 29, 43],
);
polygon(
  [
    [8, 3],
    [21, 5],
    [26, 11],
    [23, 27],
    [6, 24],
  ],
  [255, 249, 241],
);
line(8, 3, 21, 5, [37, 29, 43], 2);
line(21, 5, 26, 11, [37, 29, 43], 2);
line(26, 11, 23, 27, [37, 29, 43], 2);
line(23, 27, 6, 24, [37, 29, 43], 2);
line(6, 24, 8, 3, [37, 29, 43], 2);
polygon(
  [
    [21, 5],
    [26, 11],
    [20, 10],
  ],
  [255, 122, 170],
);
line(11, 14, 21, 16, [37, 29, 43], 2);
line(10, 18, 19, 20, [37, 29, 43], 2);
line(9, 22, 20, 24, [37, 29, 43], 2);
polygon(
  [
    [3, 21],
    [7, 19],
    [10, 23],
    [5, 26],
  ],
  [248, 223, 98],
);
line(3, 21, 7, 19, [37, 29, 43], 1.5);
line(7, 19, 10, 23, [37, 29, 43], 1.5);
line(10, 23, 5, 26, [37, 29, 43], 1.5);
line(5, 26, 3, 21, [37, 29, 43], 1.5);

const bitmapInfoHeaderSize = 40;
const xorSize = size * size * 4;
const andMaskStride = Math.ceil(size / 32) * 4;
const andMaskSize = andMaskStride * size;
const imageSize = bitmapInfoHeaderSize + xorSize + andMaskSize;
const icoSize = 6 + 16 + imageSize;
const buffer = Buffer.alloc(icoSize);

let offset = 0;
buffer.writeUInt16LE(0, offset);
offset += 2;
buffer.writeUInt16LE(1, offset);
offset += 2;
buffer.writeUInt16LE(1, offset);
offset += 2;
buffer.writeUInt8(size, offset);
offset += 1;
buffer.writeUInt8(size, offset);
offset += 1;
buffer.writeUInt8(0, offset);
offset += 1;
buffer.writeUInt8(0, offset);
offset += 1;
buffer.writeUInt16LE(1, offset);
offset += 2;
buffer.writeUInt16LE(32, offset);
offset += 2;
buffer.writeUInt32LE(imageSize, offset);
offset += 4;
buffer.writeUInt32LE(22, offset);
offset += 4;

buffer.writeUInt32LE(bitmapInfoHeaderSize, offset);
offset += 4;
buffer.writeInt32LE(size, offset);
offset += 4;
buffer.writeInt32LE(size * 2, offset);
offset += 4;
buffer.writeUInt16LE(1, offset);
offset += 2;
buffer.writeUInt16LE(32, offset);
offset += 2;
buffer.writeUInt32LE(0, offset);
offset += 4;
buffer.writeUInt32LE(xorSize, offset);
offset += 4;
buffer.writeInt32LE(0, offset);
offset += 4;
buffer.writeInt32LE(0, offset);
offset += 4;
buffer.writeUInt32LE(0, offset);
offset += 4;
buffer.writeUInt32LE(0, offset);
offset += 4;

for (let y = size - 1; y >= 0; y -= 1) {
  for (let x = 0; x < size; x += 1) {
    const source = (y * size + x) * 4;
    pixels.copy(buffer, offset, source, source + 4);
    offset += 4;
  }
}

writeFileSync("public/favicon.ico", buffer);
