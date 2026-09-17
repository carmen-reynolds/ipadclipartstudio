/**
 * Pure JavaScript Connected Component Labeling & Contour Detection
 * Runs directly on HTML5 Canvas in the browser (iPad Safari compatible)
 * Replaces python/detect_elements.py with zero server latency (~10-25ms execution).
 */

// 8 directions clockwise starting from North
const DIRS = [
  { dx: 0, dy: -1 },  // 0: N
  { dx: 1, dy: -1 },  // 1: NE
  { dx: 1, dy: 0 },   // 2: E
  { dx: 1, dy: 1 },   // 3: SE
  { dx: 0, dy: 1 },   // 4: S
  { dx: -1, dy: 1 },  // 5: SW
  { dx: -1, dy: 0 },  // 6: W
  { dx: -1, dy: -1 }  // 7: NW
];

/**
 * Douglas-Peucker / Distance decimation polygon simplifier
 */
export function simplifyPolygon(points, minDistance = 4.5) {
  if (!points || points.length < 3) return points || [];
  const simplified = [points[0]];
  let last = points[0];

  for (let i = 1; i < points.length; i++) {
    const pt = points[i];
    const dist = Math.hypot(pt.x - last.x, pt.y - last.y);
    if (dist >= minDistance) {
      simplified.push(pt);
      last = pt;
    }
  }

  // Ensure closed loop if original was closed
  if (simplified.length > 2) {
    const first = simplified[0];
    const finalPt = simplified[simplified.length - 1];
    if (Math.hypot(first.x - finalPt.x, first.y - finalPt.y) > minDistance) {
      simplified.push({ x: first.x, y: first.y });
    }
  }
  return simplified;
}

/**
 * Trace the outer perimeter contour of a component using Moore-Neighbor algorithm
 */
function traceContour(grid, width, height, startX, startY, targetLabel) {
  const contour = [];
  let currX = startX;
  let currY = startY;
  let bDir = 6; // Entered from West

  const maxSteps = Math.min(10000, width * height);
  let steps = 0;

  while (steps++ < maxSteps) {
    contour.push({ x: currX, y: currY });
    let foundNext = false;

    for (let i = 0; i < 8; i++) {
      const dirIdx = (bDir + i) % 8;
      const nx = currX + DIRS[dirIdx].dx;
      const ny = currY + DIRS[dirIdx].dy;

      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        if (grid[ny * width + nx] === targetLabel) {
          currX = nx;
          currY = ny;
          bDir = (dirIdx + 5) % 8;
          foundNext = true;
          break;
        }
      }
    }

    if (!foundNext) break;

    // Check if returned to start
    if (currX === startX && currY === startY) {
      break;
    }
  }

  return contour;
}

/**
 * Detect isolated illustrations / clipart elements on a canvas
 * @param {HTMLCanvasElement} canvas
 * @param {Object} options
 * @returns {Array<{ id: string, bbox: [x, y, w, h], polygon: Array<{x: number, y: number}>, area: number }>}
 */
export function detectElementsFromCanvas(canvas, options = {}) {
  if (!canvas || canvas.width === 0 || canvas.height === 0) return [];

  const originalWidth = canvas.width;
  const originalHeight = canvas.height;

  // Downsample to max 1200px for instant ~15ms processing if needed
  const maxDim = Math.max(originalWidth, originalHeight);
  let scale = 1.0;
  let procWidth = originalWidth;
  let procHeight = originalHeight;

  let procCanvas = canvas;
  if (maxDim > 1200) {
    scale = 1200 / maxDim;
    procWidth = Math.round(originalWidth * scale);
    procHeight = Math.round(originalHeight * scale);
    procCanvas = document.createElement('canvas');
    procCanvas.width = procWidth;
    procCanvas.height = procHeight;
    const pCtx = procCanvas.getContext('2d');
    pCtx.drawImage(canvas, 0, 0, procWidth, procHeight);
  }

  const ctx = procCanvas.getContext('2d');
  const imgData = ctx.getImageData(0, 0, procWidth, procHeight);
  const data = imgData.data;
  const totalPixels = procWidth * procHeight;

  // Step 1: Check if image has transparency
  let transparentCount = 0;
  // Sample up to 1000 points
  const step = Math.max(1, Math.floor(totalPixels / 1000));
  for (let i = 3; i < data.length; i += step * 4) {
    if (data[i] < 240) transparentCount++;
  }
  const isTransparent = transparentCount > 20;

  // Step 2: Build binary foreground mask
  // 1 = foreground, 0 = background
  const mask = new Uint8Array(totalPixels);
  for (let i = 0; i < totalPixels; i++) {
    const p = i * 4;
    const r = data[p];
    const g = data[p + 1];
    const b = data[p + 2];
    const a = data[p + 3];

    if (isTransparent) {
      mask[i] = a > 15 ? 1 : 0;
    } else {
      // White/near-white background detection
      const gray = r * 0.299 + g * 0.587 + b * 0.114;
      mask[i] = (gray < 242 || (Math.max(r, g, b) - Math.min(r, g, b) > 15)) ? 1 : 0;
    }
  }

  // Step 3: Connected Component Labeling via fast BFS
  const labels = new Int32Array(totalPixels);
  let currentLabel = 1;
  const components = [];

  // Queue buffer for BFS
  const queue = new Int32Array(totalPixels);

  for (let y = 0; y < procHeight; y++) {
    for (let x = 0; x < procWidth; x++) {
      const idx = y * procWidth + x;
      if (mask[idx] === 1 && labels[idx] === 0) {
        // Start a new connected component
        let qHead = 0;
        let qTail = 0;
        queue[qTail++] = idx;
        labels[idx] = currentLabel;

        let minX = x, maxX = x, minY = y, maxY = y;
        let area = 0;
        const startX = x;
        const startY = y;

        while (qHead < qTail) {
          const currIdx = queue[qHead++];
          area++;

          const cx = currIdx % procWidth;
          const cy = Math.floor(currIdx / procWidth);

          if (cx < minX) minX = cx;
          if (cx > maxX) maxX = cx;
          if (cy < minY) minY = cy;
          if (cy > maxY) maxY = cy;

          // Check 4-connected neighbors
          const neighbors = [
            cy > 0 ? currIdx - procWidth : -1,
            cy < procHeight - 1 ? currIdx + procWidth : -1,
            cx > 0 ? currIdx - 1 : -1,
            cx < procWidth - 1 ? currIdx + 1 : -1
          ];

          for (let k = 0; k < 4; k++) {
            const nIdx = neighbors[k];
            if (nIdx !== -1 && mask[nIdx] === 1 && labels[nIdx] === 0) {
              labels[nIdx] = currentLabel;
              queue[qTail++] = nIdx;
            }
          }
        }

        // Filter out tiny dust / single speckles (< 80px area in scaled coords)
        const minAreaThreshold = Math.max(80, Math.round(100 * scale * scale));
        const w = maxX - minX + 1;
        const h = maxY - minY + 1;

        if (area >= minAreaThreshold && w >= 15 && h >= 15) {
          // Trace outer boundary contour
          const rawContour = traceContour(labels, procWidth, procHeight, startX, startY, currentLabel);
          
          components.push({
            id: (currentLabel - 1).toString(),
            minX, maxX, minY, maxY,
            width: w,
            height: h,
            area,
            rawContour: rawContour.length > 2 ? rawContour : [
              { x: minX, y: minY },
              { x: maxX, y: minY },
              { x: maxX, y: maxY },
              { x: minX, y: maxY }
            ]
          });
        }

        currentLabel++;
      }
    }
  }

  // Step 4: Scale results back to original canvas dimensions
  const invScale = 1.0 / scale;
  return components.map((comp) => {
    const scaledBbox = [
      Math.round(comp.minX * invScale),
      Math.round(comp.minY * invScale),
      Math.round(comp.width * invScale),
      Math.round(comp.height * invScale)
    ];

    const scaledPoints = comp.rawContour.map((pt) => ({
      x: Math.round(pt.x * invScale),
      y: Math.round(pt.y * invScale)
    }));

    const simplified = simplifyPolygon(scaledPoints, 5.0);

    return {
      id: comp.id,
      bbox: scaledBbox,
      polygon: simplified,
      area: Math.round(comp.area * invScale * invScale)
    };
  });
}
