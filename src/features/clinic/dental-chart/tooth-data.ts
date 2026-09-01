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
      "M 402.5 2 C 397 2 394 10 390 23 C 387 32 385 41 385 50.5 C 385 51.5 385.5 51.8 387 51.8 C 396 52.2 409 52.2 418 51.8 C 419.5 51.8 420 51.2 420 50 C 420 41 418 32 415 23 C 411 10 408 2 402.5 2 Z",
    shadowPath:
      "M 402.5 4 C 398 4 395 11 392 23 C 395 24.5 410 24.5 413 23 C 410 11 407 4 402.5 4 Z",
    lineHighlightPath: [
      "M 390 50.5 C 398 51.2 407 51.2 415 50.5",
      "M 396 28 L 396 46",
      "M 409 28 L 409 46",
    ],
  },
  2: {
    toothNumber: 2,
    type: "Lateral Incisor",
    outlinePath:
      "M 347.1 2 C 342 2 339 10 336 23 C 333 32 332 41 332 50 C 332 51.2 333 51.5 334.5 51.5 C 342 51.8 352 51.5 360 49.5 C 361.5 49 362 48 362 46.5 C 361 38 360 30 358 23 C 355 10 352 2 347.1 2 Z",
    shadowPath:
      "M 347.1 4 C 343 4 340 11 338 23 C 341 24.2 353 24.2 356 23 C 354 11 351 4 347.1 4 Z",
    lineHighlightPath: [
      "M 336 50 C 344 50.8 352 50.2 358 48.5",
      "M 344 28 L 344 45",
    ],
  },
  3: {
    toothNumber: 3,
    type: "Canine",
    outlinePath:
      "M 294 2.5 C 298 2.5 301 5 303 12 C 305 16 306 20 306 23 C 307 29 310 35 310 41 C 310 44 305 48.5 298 51.5 C 296 52.3 294 52.5 294 52.5 C 294 52.5 292 52.3 290 51.5 C 283 48.5 278 44 278 41 C 278 35 281 29 282 23 C 282 20 283 16 285 12 C 287 5 290 2.5 294 2.5 Z",
    shadowPath:
      "M 294 4 C 297 4 299 7 301 13 C 303 18 304 22 304 23 C 300 24.5 288 24.5 284 23 C 284 22 285 18 287 13 C 289 7 291 4 294 4 Z",
    lineHighlightPath: [
      "M 294 25 L 294 50",
      "M 283 41.5 C 288 45.5 292 48.5 294 50 C 296 48.5 300 45.5 305 41.5",
    ],
  },
  4: {
    toothNumber: 4,
    type: "First Premolar",
    outlinePath:
      "M 243 8 C 241 4 239 2.5 237 2.5 C 233 2.5 230 11 228 23 C 226 31 225 39 226 45 C 227 49 231 52.5 235.5 52.5 C 239 52.5 241.5 50 243 48.5 C 244.5 50 247 51.8 250.5 51.8 C 255 51.8 259 48.5 260 44 C 261 38 260 30 258 23 C 256 11 253 2.5 249 2.5 C 247 2.5 245 4 243 8 Z",
    shadowPath:
      "M 243 9 C 240 5 238 4 236 4 C 233 4 231 11 230 23 C 233 24.5 253 24.5 256 23 C 255 11 253 4 250 4 C 248 4 246 5 243 9 Z",
    lineHighlightPath: [
      "M 233 44 C 238 46 248 46 253 43.5",
      "M 243 27 L 243 47",
      "M 235.5 50 C 239 49 247 48 250.5 49",
    ],
  },
  5: {
    toothNumber: 5,
    type: "Second Premolar",
    outlinePath:
      "M 197.6 2 C 192 2 188 10 185 23 C 183 31 182 39 183 44.5 C 184 48.5 187.5 52 191 52 C 194.5 52 196.5 50 197.6 49 C 198.7 50 200.7 51.8 204 51.8 C 208 51.8 211.5 48.5 212.5 44 C 213.5 38 212.5 30 210 23 C 207 10 203 2 197.6 2 Z",
    shadowPath:
      "M 197.6 4 C 193 4 190 11 187 23 C 190 24.5 205 24.5 208 23 C 205 11 202 4 197.6 4 Z",
    lineHighlightPath: [
      "M 188 44 C 193 46.5 202 46.5 207 43.5",
      "M 197.6 26 L 197.6 47.5",
    ],
  },
  6: {
    toothNumber: 6,
    type: "First Molar",
    outlinePath:
      "M 146.7 13 C 144 7 141 2 137 2 C 131 2 127 10 125 22 C 123 31 123 41 125 46 C 126.5 50 130 52.8 134.5 52.8 C 139 52.8 143.5 50.5 146.7 49 C 149.9 50.5 154.4 52.5 159 52.5 C 163.5 52.5 167 49.5 168 45.5 C 169.5 39 169 30 167 22 C 165 10 162 2 156 2 C 152 2 149 7 146.7 13 Z",
    shadowPath:
      "M 146.7 14 C 144 8 142 3.5 138 3.5 C 133 3.5 129 11 127 22 C 131 23.8 161 23.8 165 22 C 163 11 160 3.5 155 3.5 C 151 3.5 149 8 146.7 14 Z",
    lineHighlightPath: [
      "M 130 38 C 138 41 155 41 163 37.5",
      "M 146.7 24 L 146.7 47",
      "M 134 49 C 140 46 153 46 159 48.5",
    ],
  },
  7: {
    toothNumber: 7,
    type: "Second Molar",
    outlinePath:
      "M 83 12 C 81 7 78.5 2.5 75 2.5 C 70 2.5 66 10 64 22 C 62 31 62 40 64 45.5 C 65.5 49.5 68.5 52.2 72.5 52.2 C 76.5 52.2 80.5 50.2 83 49 C 85.5 50.2 89.5 52 93.5 52 C 97.5 52 101 49 102 45 C 103.5 38 103 29 101 22 C 99 10 96 2.5 91 2.5 C 87.5 2.5 85 7 83 12 Z",
    shadowPath:
      "M 83 13 C 81 8 79 4 76 4 C 72 4 68 11 66 22 C 70 23.8 96 23.8 99 22 C 97 11 94 4 90 4 C 87 4 85 8 83 13 Z",
    lineHighlightPath: [
      "M 68 37 C 76 40 90 40 98 36.5",
      "M 83 24 L 83 47",
      "M 72 49 C 77 46.5 89 46.5 94 48",
    ],
  },
  8: {
    toothNumber: 8,
    type: "Third Molar",
    outlinePath:
      "M 23.7 3 C 19 3 15 10 12 22 C 10 30 9 39 11 44.5 C 12.5 48.5 15.5 51.5 19 51.5 C 21.5 51.5 22.8 50 23.7 48.8 C 24.6 50 25.9 51.2 28.5 51.2 C 32 51.2 35.5 48.5 36.5 44 C 37.5 37 37 29 35 22 C 32 10 28.5 3 23.7 3 Z",
    shadowPath:
      "M 23.7 4.5 C 20 4.5 16 11 13.5 22 C 17 23.5 31 23.5 33.5 22 C 31 11 27.5 4.5 23.7 4.5 Z",
    lineHighlightPath: [
      "M 15 36 C 21 38.5 27 38.5 33 35.5",
      "M 23.7 24 L 23.7 46.5",
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
