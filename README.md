# AI Render Service

AI-powered service that converts architectural sketches into clean axonometric drawings using OpenAI's image generation models. This service replaces the renderer-core for M1 projects, providing AI-driven rendering capabilities.

## What This Service Does

The AI Render Service takes architectural sketch images as input and generates professional axonometric (2.5D) architectural drawings. The service:

- Accepts sketch images via HTTP POST
- Preprocesses images (grayscale, contrast enhancement, resizing)
- Uses OpenAI's DALL-E 3 model to generate axonometric drawings
- Applies Neave Brown-inspired styling with consistent line weights
- Returns base64-encoded PNG images

**Note:** This service replaces renderer-core for M1 projects, offering AI-powered rendering as an alternative to the previous vectorization-based approach.

## Requirements

- Node.js 18.0.0 or higher
- OpenAI API key

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file (copy from `.env.example`):
```bash
OPENAI_API_KEY=your_openai_api_key_here
PORT=3001
```

## Running Locally

### Development Mode

```bash
npm run dev
```

This starts the server with hot-reloading using `tsx`.

### Production Mode

```bash
# Build TypeScript
npm run build

# Start server
npm start
```

The server will start on the port specified in your `.env` file (default: 3001).

### Type Checking

```bash
npm run type-check
```

## Expected Inputs/Outputs

### Input

- **Format:** Image file (PNG, JPEG, etc.)
- **Method:** HTTP POST with `multipart/form-data`
- **Field name:** `image`
- **Max size:** 10MB
- **Content:** Architectural sketch or drawing

The service will automatically:
- Convert to grayscale
- Enhance contrast
- Resize to 1024x1024 pixels

### Output

**Response format:** JSON

```json
{
  "imageBase64": "iVBORw0KGgoAAAANSUhEUgAA...",
  "model": "dall-e-3",
  "promptVersion": "axon_v1"
}
```

- **imageBase64:** Base64-encoded PNG image (1024x1024)
- **model:** AI model used for generation (`dall-e-3`)
- **promptVersion:** Prompt version identifier (`axon_v1`)

The generated image will be:
- Axonometric projection (not perspective)
- Black ink on white background
- Neave Brown-inspired style
- Thin, consistent line weights
- Minimal shading
- Single building mass only
- No people, trees, text, or labels

## API Usage

### POST /render

Upload an image to generate an axonometric concept rendering.

**Example Request:**
```bash
curl -X POST http://localhost:3001/render \
  -F "image=@path/to/your/sketch.png"
```

**Example Response:**
```json
{
  "imageBase64": "iVBORw0KGgoAAAANSUhEUgAA...",
  "model": "dall-e-3",
  "promptVersion": "axon_v1"
}
```

To save the response image:
```bash
curl -X POST http://localhost:3001/render \
  -F "image=@sketch.png" \
  | jq -r '.imageBase64' \
  | base64 -d > output.png
```

### Health Check

```bash
curl http://localhost:3001/health
```

Returns: `{"status":"ok"}`
