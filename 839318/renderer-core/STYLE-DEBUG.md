# Neave Brown Style Debugging

## Expected Neave Brown Characteristics

### Colors
- Primary stroke: `#1a1a1a` (dark charcoal)
- Fill: `#f5f5f5` (very light gray)
- Background: `#ffffff` (white)
- Side faces: Slightly darker fills for depth (`#e8e8e8`, `#e0e0e0`)

### Stroke Properties
- Primary stroke width: `2.5px`
- Secondary stroke width: `1.5px`
- Line join: `miter` (sharp, precise)
- Line cap: `square` (clean ends)
- Miter limit: `4.0`

### Rough.js Options (Neave Brown)
- Roughness: `0` (no roughness, perfectly smooth)
- Bowing: `0` (no bowing, straight lines)
- Randomize: `false` (deterministic)

## Current Issues to Check

1. **Background Color**: Should be white (#ffffff)
2. **Fill Colors**: Top should be #f5f5f5, sides should be #e8e8e8 and #e0e0e0
3. **Stroke Colors**: Should be #1a1a1a (dark charcoal)
4. **Stroke Widths**: Should be 2.5px for top, 1.5px for sides
5. **Line Joins**: Should be `miter` not `round`
6. **Line Caps**: Should be `square` not `round`
7. **Rough.js**: Should NOT be used for Neave Brown (roughness = 0)

## Debugging Steps

1. Check console logs for style application
2. Verify style.name is 'neaveBrown'
3. Check if effectiveFillColor/effectiveStrokeColor are overriding style colors
4. Verify fill colors match style definition
5. Check if Rough.js is being used (should be skipped for Neave Brown)

