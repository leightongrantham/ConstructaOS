/**
 * Rendering styles and themes
 * Defines visual styling for different rendering outputs
 * All styles are deterministic - no randomness
 */

/**
 * Shared axonometric rendering configuration constants
 * Used by both mock and real topology renderers to ensure visual parity
 * 
 * These values match the mock renderer parameters exactly:
 * - Mock uses: topStrokeWidth: 1.0, sideStrokeWidth: 2.0
 * - Mock uses: angle: 30 degrees, wallHeight: 2700
 * - Mock uses: strokeColor: '#1a1a1a', backgroundColor: '#ffffff'
 */
export const AXON_CONFIG = {
  // Stroke widths for different face types
  topStrokeWidth: 1.0,      // Top face stroke width (thinner)
  sideStrokeWidth: 2.0,     // Side face stroke width (thicker)
  
  // Colors
  strokeColor: '#1a1a1a',   // Dark charcoal stroke color
  backgroundColor: '#ffffff', // White background
  
  // Geometry parameters
  angle: 30,                 // Axonometric angle in degrees (isometric)
  wallHeight: 2700,          // Default wall height (2.7m in mm)
  defaultWallThickness: 300, // Default wall thickness (300mm)
  
  // Height scale for projection (Y-axis scale in axonometric matrix)
  scaleY: 0.5,              // Typical isometric Y scale
  skewY: -30                // Typical isometric Y skew (degrees)
};

/**
 * Neave Brown style preset
 * Inspired by Neave Brown's architectural drawings: clean, geometric, precise
 * Characterized by fixed stroke weights, minimal color palette, consistent line quality
 */
export const neaveBrownStyle = {
  name: 'neaveBrown',
  
  // Color palette - minimal, precise
  colors: {
    primary: '#1a1a1a',        // Dark charcoal for primary walls
    secondary: '#4a4a4a',      // Medium gray for secondary elements
    tertiary: '#8a8a8a',       // Light gray for tertiary elements
    fill: '#f5f5f5',           // Very light gray for fills
    background: '#ffffff',     // White background
    accent: '#2c3e50'          // Dark blue-gray accent (rarely used)
  },
  
  // Fixed stroke weights - consistent line hierarchy
  stroke: {
    primary: 2.5,              // Primary wall outlines
    secondary: 1.5,            // Secondary walls/divisions
    tertiary: 1.0,             // Tertiary elements
    detail: 0.75,              // Fine details
    fill: 0.5                  // Fill outlines (subtle)
  },
  
  // Line properties - deterministic, no randomness
  line: {
    join: 'miter',             // Sharp, precise joins
    cap: 'square',             // Square caps for clean ends
    miterLimit: 4.0            // Miter limit for sharp corners
  },
  
  // Rough.js options - completely deterministic (no randomness)
  roughOptions: {
    roughness: 0,              // No roughness (perfectly smooth lines)
    bowing: 0,                 // No bowing (straight lines)
    strokeWidth: 2.5,          // Fixed stroke width
    curveStepCount: 4,         // Fixed curve steps
    curveFitting: 0.95,        // High curve fitting (smooth)
    simplifyThreshold: 0,      // No simplification
    fillStyle: 'solid',        // Solid fills
    fillWeight: 0,             // No fill roughness
    hachureAngle: 0,           // Not used for solid fills
    hachureGap: 0,             // Not used for solid fills
    randomize: false           // Explicitly disable randomization
  },
  
  // Wall-specific settings
  wall: {
    primaryThickness: 12,      // Primary wall thickness in pixels
    secondaryThickness: 8,     // Secondary wall thickness
    fillOpacity: 0.85,         // Fill opacity
    strokeOpacity: 1.0         // Stroke opacity
  },
  
  // Axonometric view specific
  axon: {
    fillColor: '#f5f5f5',      // Fill color (very light gray for top faces)
    strokeColor: '#1a1a1a',    // Stroke color (dark charcoal, matches colors.primary)
    background: '#ffffff',     // Background color (pure white)
    shadow: false,             // No shadows (clean, flat)
    gradient: false            // No gradients (flat colors)
  },
  
  // Side face colors for depth (lighter variation of fill)
  sideFaces: {
    left: '#e8e8e8',           // Left side face (slightly darker than top)
    right: '#e0e0e0'           // Right side face (slightly darker than left)
  },
  
  // Plan view specific
  plan: {
    wallColor: '#1a1a1a',
    wallWidth: 2.5,
    doorColor: '#4a4a4a',
    windowColor: '#8a8a8a'
  },
  
  // Section view specific
  section: {
    cutColor: '#1a1a1a',
    fillColor: '#e8e8e8',
    cutWidth: 3.0
  }
};

/**
 * Default style preset (original renderer style)
 */
export const defaultStyle = {
  name: 'default',
  
  colors: {
    primary: '#2c3e50',
    secondary: '#34495e',
    fill: '#ecf0f1',
    background: '#ffffff'
  },
  
  stroke: {
    primary: 2.5,
    secondary: 1.5,
    tertiary: 1.0
  },
  
  line: {
    join: 'round',
    cap: 'round',
    miterLimit: 10.0
  },
  
  roughOptions: {
    roughness: 0.8,
    bowing: 1,
    strokeWidth: 2.5,
    curveStepCount: 9,
    curveFitting: 0.95,
    simplifyThreshold: 0.0001,
    fillStyle: 'solid',
    fillWeight: 0.5,
    randomize: true
  },
  
  wall: {
    primaryThickness: 12,
    secondaryThickness: 8,
    fillOpacity: 0.85,
    strokeOpacity: 1.0
  },
  
  axon: {
    fillColor: '#ecf0f1',
    strokeColor: '#2c3e50',
    background: '#ffffff',
    shadow: false,
    gradient: false
  },
  
  plan: {
    wallColor: '#000000',
    wallWidth: 2,
    doorColor: '#0066cc',
    windowColor: '#00ccff'
  },
  
  section: {
    cutColor: '#ff0000',
    fillColor: '#cccccc',
    cutWidth: 2.0
  }
};

/**
 * Get style preset by name
 * @param {string} name - Style name ('neaveBrown' or 'default')
 * @returns {Object} Style preset object
 */
export function getStylePreset(name = 'default') {
  const presets = {
    neaveBrown: neaveBrownStyle,
    default: defaultStyle
  };
  
  return presets[name] || presets.default;
}

/**
 * Get Rough.js options for a style preset
 * Ensures complete determinism for Neave Brown style
 * @param {Object} style - Style preset object
 * @param {Object} overrides - Optional overrides for specific properties
 * @returns {Object} Rough.js options object
 */
export function getRoughOptions(style, overrides = {}) {
  const baseOptions = {
    ...style.roughOptions,
    ...overrides
  };
  
  // Ensure determinism for Neave Brown style
  if (style.name === 'neaveBrown') {
    baseOptions.roughness = 0;
    baseOptions.bowing = 0;
    baseOptions.randomize = false;
    baseOptions.seed = 0; // Fixed seed if randomness is somehow enabled
  }
  
  return baseOptions;
}

/**
 * Get Paper.js style properties from preset
 * @param {Object} style - Style preset object
 * @param {string} elementType - Element type: 'wall', 'wallSecondary', 'fill', etc.
 * @returns {Object} Paper.js style properties
 */
export function getPaperStyle(style, elementType = 'wall') {
  const isNeaveBrown = style.name === 'neaveBrown';
  
  // Map element types to style properties
  const styleMap = {
    wall: {
      strokeColor: style.colors.primary,
      strokeWidth: style.stroke.primary,
      fillColor: style.axon.fillColor,
      strokeJoin: style.line.join,
      strokeCap: style.line.cap,
      miterLimit: style.line.miterLimit,
      opacity: style.wall.strokeOpacity
    },
    wallSecondary: {
      strokeColor: style.colors.secondary,
      strokeWidth: style.stroke.secondary,
      fillColor: style.axon.fillColor,
      strokeJoin: style.line.join,
      strokeCap: style.line.cap,
      miterLimit: style.line.miterLimit,
      opacity: style.wall.strokeOpacity * 0.9
    },
    fill: {
      fillColor: style.axon.fillColor,
      strokeColor: style.colors.secondary,
      strokeWidth: style.stroke.fill,
      opacity: style.wall.fillOpacity
    },
    background: {
      fillColor: style.axon.background
    }
  };
  
  return styleMap[elementType] || styleMap.wall;
}

// Legacy exports for backward compatibility
export const defaultStyles = {
  plan: defaultStyle.plan,
  section: defaultStyle.section,
  axon: defaultStyle.axon
};

export function applyStyle(geometry, style = defaultStyles.plan) {
  // TODO: Implement style application
  return geometry;
}

export function getTheme(name = 'default') {
  return getStylePreset(name);
}

