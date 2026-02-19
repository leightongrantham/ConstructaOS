/**
 * Deterministic renderer for existing building massing from footprint polygon
 * Creates a simple isometric view of the building as an extruded block
 */

import { createCanvas } from 'canvas';
import { writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Local storage directory (same as conceptStorage)
const LOCAL_STORAGE_DIR = join(__dirname, '../../.concepts');

// ConstructaOS ink-on-paper style constants
const STYLE = {
  backgroundColor: '#faf9f6', // Off-white background
  strokeColor: '#1a1a1a', // Black ink outline
  fillColor: '#e8e6e1', // Subtle grey fill
  shadowColor: '#d4d2cd', // Subtle shadow
  strokeWidth: 2,
  shadowOffset: 3,
};

// Standard storey height in meters
const STOREY_HEIGHT_M = 3.0;

/**
 * Converts lat/lng coordinates to local XY coordinates (meters)
 * Uses a simple equirectangular projection for small areas
 * @param polygon - Array of [lat, lng] coordinates
 * @returns Array of [x, y] coordinates in meters, centered at origin
 */
function convertLatLngToLocalXY(polygon: Array<[number, number]>): Array<[number, number]> {
  if (polygon.length === 0) {
    return [];
  }

  // Find centroid to use as reference point
  let sumLat = 0;
  let sumLng = 0;
  for (const [lat, lng] of polygon) {
    sumLat += lat;
    sumLng += lng;
  }
  const centerLat = sumLat / polygon.length;
  const centerLng = sumLng / polygon.length;

  // Convert to meters using approximate conversion
  // For small areas, we can use: 1 degree lat ≈ 111,000m, 1 degree lng ≈ 111,000m * cos(lat)
  const EARTH_RADIUS_M = 6371000;
  const metersPerDegreeLat = (Math.PI / 180) * EARTH_RADIUS_M;
  const metersPerDegreeLng = (Math.PI / 180) * EARTH_RADIUS_M * Math.cos((centerLat * Math.PI) / 180);

  // Convert to local XY coordinates (centered at origin)
  const localXY: Array<[number, number]> = [];
  for (const [lat, lng] of polygon) {
    const x = (lng - centerLng) * metersPerDegreeLng;
    const y = (lat - centerLat) * metersPerDegreeLat;
    localXY.push([x, y]);
  }

  return localXY;
}

/**
 * Projects a 3D point to 2D screen coordinates using isometric projection
 * Standard isometric: 30° rotation on X and Y axes
 * @param x - X coordinate in meters
 * @param y - Y coordinate in meters
 * @param z - Z coordinate (height) in meters
 * @param scale - Scale factor (pixels per meter)
 * @returns [screenX, screenY] in pixels
 */
function projectIsometric(
  x: number,
  y: number,
  z: number,
  scale: number
): [number, number] {
  // Standard isometric projection angles (30 degrees)
  const angle = Math.PI / 6; // 30 degrees in radians
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  // Isometric projection matrix
  // Rotate around X axis by 30°, then around Y axis by 30°
  const screenX = (x * cos - y * cos) * scale;
  const screenY = (x * sin + y * sin - z) * scale;

  return [screenX, screenY];
}

/**
 * Calculates bounding box of projected points
 */
function getProjectedBounds(
  points: Array<[number, number]>,
  height: number,
  scale: number
): { minX: number; maxX: number; minY: number; maxY: number; width: number; height: number } {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  // Project all footprint points (ground level)
  for (const [x, y] of points) {
    const [px, py] = projectIsometric(x, y, 0, scale);
    minX = Math.min(minX, px);
    maxX = Math.max(maxX, px);
    minY = Math.min(minY, py);
    maxY = Math.max(maxY, py);
  }

  // Project top corners (roof level)
  for (const [x, y] of points) {
    const [px, py] = projectIsometric(x, y, height, scale);
    minX = Math.min(minX, px);
    maxX = Math.max(maxX, px);
    minY = Math.min(minY, py);
    maxY = Math.max(maxY, py);
  }

  const width = maxX - minX;
  const height_bbox = maxY - minY;

  return { minX, maxX, minY, maxY, width, height: height_bbox };
}

/**
 * Renders an isometric view of a building from its footprint polygon
 * @param footprintPolygon - Array of [lat, lng] coordinates
 * @param storeys - Number of storeys ('1', '2', '3+', or 'Unknown')
 * @param projectId - Project ID for storage path
 * @param conceptId - Concept ID for storage path
 * @returns Promise that resolves when image is saved
 */
export async function renderExistingIsometric(
  footprintPolygon: Array<[number, number]>,
  storeys: '1' | '2' | '3+' | 'Unknown',
  projectId: string,
  conceptId: string
): Promise<void> {
  if (footprintPolygon.length < 3) {
    throw new Error('Footprint polygon must have at least 3 points');
  }

  // Convert lat/lng to local XY coordinates
  const localXY = convertLatLngToLocalXY(footprintPolygon);

  // Determine building height
  let buildingHeightM: number;
  let isAssumption = false;
  if (storeys === '1') {
    buildingHeightM = STOREY_HEIGHT_M;
  } else if (storeys === '2') {
    buildingHeightM = STOREY_HEIGHT_M * 2;
  } else if (storeys === '3+') {
    buildingHeightM = STOREY_HEIGHT_M * 3; // Use 3 as default for 3+
  } else {
    // Unknown: default to 2 storeys but mark as assumption
    buildingHeightM = STOREY_HEIGHT_M * 2;
    isAssumption = true;
  }

  // Scale factor: pixels per meter
  // Adjust based on building size to fit nicely in canvas
  const allDimensions: number[] = [];
  for (const [x, y] of localXY) {
    allDimensions.push(Math.abs(x), Math.abs(y));
  }
  const maxDimension = Math.max(...allDimensions);
  const targetCanvasSize = 2000; // Target canvas size in pixels
  const scale = (targetCanvasSize * 0.6) / maxDimension; // Use 60% of canvas for building

  // Calculate projected bounds
  const bounds = getProjectedBounds(localXY, buildingHeightM, scale);

  // Add padding
  const padding = 100;
  const canvasWidth = Math.ceil(bounds.width + padding * 2);
  const canvasHeight = Math.ceil(bounds.height + padding * 2);

  // Create canvas
  const canvas = createCanvas(canvasWidth, canvasHeight);
  const ctx = canvas.getContext('2d');

  // Fill background
  ctx.fillStyle = STYLE.backgroundColor;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // Calculate offset to center the building
  const offsetX = -bounds.minX + padding;
  const offsetY = -bounds.minY + padding;

  // Project footprint points
  const projectedFootprint = localXY.map(([x, y]) => {
    const [px, py] = projectIsometric(x, y, 0, scale);
    return [px + offsetX, py + offsetY] as [number, number];
  });

  // Project roof points
  const projectedRoof = localXY.map(([x, y]) => {
    const [px, py] = projectIsometric(x, y, buildingHeightM, scale);
    return [px + offsetX, py + offsetY] as [number, number];
  });

  // Draw shadow (slightly offset)
  ctx.fillStyle = STYLE.shadowColor;
  ctx.beginPath();
  for (let i = 0; i < projectedFootprint.length; i++) {
    const point = projectedFootprint[i]!; // Safe because we're iterating within bounds
    const [x, y] = point;
    if (i === 0) {
      ctx.moveTo(x + STYLE.shadowOffset, y + STYLE.shadowOffset);
    } else {
      ctx.lineTo(x + STYLE.shadowOffset, y + STYLE.shadowOffset);
    }
  }
  ctx.closePath();
  ctx.fill();

  // Draw side faces (walls)
  ctx.strokeStyle = STYLE.strokeColor;
  ctx.fillStyle = STYLE.fillColor;
  ctx.lineWidth = STYLE.strokeWidth;

  for (let i = 0; i < projectedFootprint.length; i++) {
    const nextI = (i + 1) % projectedFootprint.length;
    const [x1, y1] = projectedFootprint[i]!; // Safe because we're iterating within bounds
    const [x2, y2] = projectedFootprint[nextI]!;
    const [rx1, ry1] = projectedRoof[i]!;
    const [rx2, ry2] = projectedRoof[nextI]!;

    // Draw wall face
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineTo(rx2, ry2);
    ctx.lineTo(rx1, ry1);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // Draw roof (top face)
  ctx.beginPath();
  for (let i = 0; i < projectedRoof.length; i++) {
    const point = projectedRoof[i]!; // Safe because we're iterating within bounds
    const [x, y] = point;
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Draw footprint outline (ground level)
  ctx.beginPath();
  for (let i = 0; i < projectedFootprint.length; i++) {
    const point = projectedFootprint[i]!; // Safe because we're iterating within bounds
    const [x, y] = point;
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.closePath();
  ctx.stroke();

  // If height was assumed, add a subtle note (optional - can be removed if not needed)
  if (isAssumption) {
    ctx.fillStyle = STYLE.strokeColor;
    ctx.font = '12px sans-serif';
    ctx.globalAlpha = 0.5;
    ctx.fillText('Height assumed (2 storeys)', 20, canvasHeight - 20);
    ctx.globalAlpha = 1.0;
  }

  // Convert canvas to PNG buffer
  const imageBuffer = canvas.toBuffer('image/png');

  // Save to storage
  const storagePath = `projects/${projectId}/concepts/${conceptId}/existing.png`;
  const localFilePath = join(LOCAL_STORAGE_DIR, storagePath);
  const localDir = dirname(localFilePath);

  // Ensure directory exists
  await mkdir(localDir, { recursive: true });

  // Write to file
  await writeFile(localFilePath, imageBuffer);

  console.log(`Existing building isometric rendered and saved: ${localFilePath}`);
}
