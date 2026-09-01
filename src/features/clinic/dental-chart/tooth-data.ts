/**
 * Tooth SVG Path Data & Linear Anatomical Definitions
 *
 * Sourced from react-odontogram (https://github.com/biomathcode/react-odontogram)
 *
 * MIT License
 * Copyright (c) 2025-2026 Pratik Sharma (biomathcode)
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

export interface ToothShape {
  toothNumber: number; // 1 to 8 (1 = Central Incisor, 8 = Third Molar)
  type: string;
  outlinePath: string;
  shadowPath: string;
  lineHighlightPath: string | string[];
}

export const TOOTH_SHAPES: Record<number, ToothShape> = {
  1: {
    toothNumber: 1,
    type: "Central Incisor",
    outlinePath:
      "M 402.5 3 C 399 3 397 8 396 18 C 395 28 394 36 392 42 C 389 48 386 58 386 70.5 C 386 72 387 72.5 389 72.5 C 397 73 408 73 416 72.5 C 418 72.5 419 72 419 70.5 C 419 58 416 48 413 42 C 411 36 410 28 409 18 C 408 8 406 3 402.5 3 Z",
    shadowPath:
      "M 402.5 5 C 399 5 397 10 396 20 C 395 30 394 37 392 42 C 396 44 409 44 413 42 C 411 37 410 30 409 20 C 408 10 406 5 402.5 5 Z",
    lineHighlightPath: [
      "M 392 42.5 C 397 45 408 45 413 42.5",
      "M 395 50 L 395 68",
      "M 410 50 L 410 68",
    ],
  },
  2: {
    toothNumber: 2,
    type: "Lateral Incisor",
    outlinePath:
      "M 347.1 3 C 344 3 342 8 341 18 C 340 28 340 36 339 42 C 336 48 334 58 334 69.5 C 334 71.5 335.5 72 337 72 C 344 72.3 353 71.8 359 69.5 C 360.5 68.8 361 67.5 361 65.5 C 359 56 358 48 355 42 C 354 36 353 28 353 18 C 352 8 350 3 347.1 3 Z",
    shadowPath:
      "M 347.1 5 C 344 5 342 10 341 20 C 340 30 340 37 339 42 C 343 43.8 351 43.8 355 42 C 354 37 353 30 353 20 C 352 10 350 5 347.1 5 Z",
    lineHighlightPath: [
      "M 339 42.5 C 343 44.5 351 44.5 355 42.5",
      "M 346 50 L 346 67",
    ],
  },
  3: {
    toothNumber: 3,
    type: "Canine",
    outlinePath:
      "M 294 2 C 298 2 300 6 301 16 C 303 26 304 35 305 41 C 307 48 310 54 310 59 C 310 63 305 68.5 298 72.5 C 296 73.3 294 73.5 294 73.5 C 294 73.5 292 73.3 290 72.5 C 283 68.5 278 63 278 59 C 278 54 281 48 283 41 C 284 35 285 26 287 16 C 288 6 290 2 294 2 Z",
    shadowPath:
      "M 294 4 C 297 4 299 8 300 18 C 302 28 303 36 304 41 C 299 43.5 289 43.5 284 41 C 285 36 286 28 288 18 C 289 8 291 4 294 4 Z",
    lineHighlightPath: [
      "M 283 41.5 C 288 43.8 300 43.8 305 41.5",
      "M 294 43 L 294 70",
      "M 284 59 C 289 64 292 68 294 70 C 296 68 299 64 304 59",
    ],
  },
  4: {
    toothNumber: 4,
    type: "First Premolar",
    outlinePath:
      "M 243 12 C 241 6 239 2.5 236 2.5 C 232 2.5 230 12 229 24 C 228 32 228 38 227 42 C 225 48 224 56 226 62 C 227 67.5 231 73 235.5 73 C 239 73 241.5 69.5 243 68 C 244.5 69.5 247 72 250.5 72 C 255 72 259 67.5 260 62 C 261 56 260 48 258 42 C 257 38 257 32 256 24 C 255 12 253 2.5 249 2.5 C 246 2.5 244 6 243 12 Z",
    shadowPath:
      "M 243 14 C 240 8 238 5 235 5 C 232 5 230 13 229 24 C 228 33 228 38 227 42 C 232 44.5 253 44.5 258 42 C 257 38 257 33 256 24 C 255 13 253 5 250 5 C 247 5 245 8 243 14 Z",
    lineHighlightPath: [
      "M 227 42.5 C 233 44.8 252 44.8 258 42.5",
      "M 243 44 L 243 67",
      "M 235.5 69 C 239 67.5 247 66.5 250.5 68",
    ],
  },
  5: {
    toothNumber: 5,
    type: "Second Premolar",
    outlinePath:
      "M 197.6 2.5 C 193 2.5 190 8 188 18 C 187 28 186 36 185 42 C 183 48 182 56 183 62 C 184 68 187.5 72.5 191 72.5 C 194.5 72.5 196.5 69.5 197.6 68 C 198.7 69.5 200.7 72.5 204 72.5 C 208 72.5 211.5 68 212.5 62 C 213.5 56 212 48 210 42 C 209 36 208 28 207 18 C 205 8 202 2.5 197.6 2.5 Z",
    shadowPath:
      "M 197.6 4.5 C 193 4.5 191 9 189 19 C 188 29 187 36 186 42 C 190 44.5 205 44.5 209 42 C 208 36 207 29 206 19 C 204 9 202 4.5 197.6 4.5 Z",
    lineHighlightPath: [
      "M 185 42.5 C 190 44.8 205 44.8 210 42.5",
      "M 197.6 44 L 197.6 67",
    ],
  },
  6: {
    toothNumber: 6,
    type: "First Molar",
    outlinePath:
      "M 146.7 24 C 144 14 139 3 133 3 C 127 3 125 14 124 28 C 123 36 123 42 122 46 C 120 53 121 61 124 67 C 126.5 71.5 130 73.5 134.5 73.5 C 139 73.5 143.5 70.5 146.7 68.5 C 149.9 70.5 154.4 73.5 159 73.5 C 163.5 73.5 167 71 169 66.5 C 171.5 60 171 52 169 46 C 168 42 168 36 167 28 C 166 14 164 3 158 3 C 153 3 149 14 146.7 24 Z",
    shadowPath:
      "M 146.7 25 C 144 16 140 5 134 5 C 128 5 126 15 125 28 C 124 36 124 41 123 46 C 128 47.8 163 47.8 168 46 C 167 41 167 36 166 28 C 165 15 163 5 157 5 C 152 5 149 16 146.7 25 Z",
    lineHighlightPath: [
      "M 123 46.5 C 128 48.8 163 48.8 168 46.5",
      "M 146.7 47 L 146.7 67",
      "M 134 68.5 C 140 65 153 65 159 68",
    ],
  },
  7: {
    toothNumber: 7,
    type: "Second Molar",
    outlinePath:
      "M 83 22 C 81 13 77.5 3 72 3 C 67 3 65 14 64 28 C 63 36 63 42 62 46 C 60.5 53 61 61 63.5 67 C 65.5 71 68.5 73 72.5 73 C 76.5 73 80.5 70.5 83 68.5 C 85.5 70.5 89.5 73 93.5 73 C 97.5 73 101 70.5 102.5 66.5 C 104.5 60 104 52 102 46 C 101 42 101 36 100 28 C 99 14 97 3 92 3 C 87.5 3 85 13 83 22 Z",
    shadowPath:
      "M 83 23 C 81 15 78 5 73 5 C 68 5 66 15 65 28 C 64 36 64 41 63 46 C 68 47.8 97 47.8 101 46 C 100 41 100 36 99 28 C 98 15 96 5 91 5 C 87 5 85 15 83 23 Z",
    lineHighlightPath: [
      "M 63 46.5 C 68 48.8 97 48.8 101 46.5",
      "M 83 47 L 83 67",
      "M 72 68 C 77 65.5 89 65.5 94 67.5",
    ],
  },
  8: {
    toothNumber: 8,
    type: "Third Molar",
    outlinePath:
      "M 23.7 4 C 18 4 14 14 12 28 C 11 36 11 41 10 45 C 9 52 10 60 12 66 C 13.5 70.5 16.5 72.5 19.5 72.5 C 22 72.5 23.2 70 23.7 68.8 C 24.2 70 25.4 72 27.9 72 C 31 72 34 69.5 35.5 65 C 37 59 36.5 51 34.5 45 C 33.5 41 33.5 36 32.5 28 C 31 14 28.5 4 23.7 4 Z",
    shadowPath:
      "M 23.7 6 C 19 6 15 15 13 28 C 12 36 12 41 11 45 C 16 46.8 30 46.8 33.5 45 C 32.5 41 32.5 36 31.5 28 C 30 15 27.5 6 23.7 6 Z",
    lineHighlightPath: [
      "M 11 45.5 C 16 47.8 30 47.8 33.5 45.5",
      "M 23.7 46 L 23.7 67",
    ],
  },
};

/** FDI Quadrants Definition (Dentist Perspective, Facing Patient) */
export const QUADRANT_TEETH = {
  // Q1 Upper Right (Screen Left): 18 -> 11
  Q1: [18, 17, 16, 15, 14, 13, 12, 11],
  // Q2 Upper Left (Screen Right): 21 -> 28
  Q2: [21, 22, 23, 24, 25, 26, 27, 28],
  // Q4 Lower Right (Screen Left): 48 -> 41
  Q4: [48, 47, 46, 45, 44, 43, 42, 41],
  // Q3 Lower Left (Screen Right): 31 -> 38
  Q3: [31, 32, 33, 34, 35, 36, 37, 38],
} as const;

/** X center position for each tooth column in the 900-wide SVG */
export const TOOTH_X_POSITIONS: Record<number, number> = {
  // Q1 (Upper Right) & Q4 (Lower Right)
  18: 23.7,
  48: 23.7,
  17: 83.0,
  47: 83.0,
  16: 146.7,
  46: 146.7,
  15: 197.6,
  45: 197.6,
  14: 243.0,
  44: 243.0,
  13: 294.0,
  43: 294.0,
  12: 347.1,
  42: 347.1,
  11: 402.5,
  41: 402.5,

  // Q2 (Upper Left) & Q3 (Lower Left)
  21: 492.5,
  31: 492.5,
  22: 547.9,
  32: 547.9,
  23: 601.0,
  33: 601.0,
  24: 652.0,
  34: 652.0,
  25: 697.4,
  35: 697.4,
  26: 748.3,
  36: 748.3,
  27: 812.0,
  37: 812.0,
  28: 871.3,
  38: 871.3,
};
