# AI Render Service

AI-powered service that converts architectural sketches into clean axonometric drawings using OpenAI's image generation models. This service replaces the renderer-core for M1 projects, providing AI-driven rendering capabilities.

## ⚠️ Important: Production Deployment

**This service requires Vercel Pro for production use.** 

AI rendering takes 20-60 seconds, but Vercel Free tier has a 10-second timeout limit, causing 504 errors.

- ✅ **Free tier**: Good for testing UI, geocoding, and non-AI features
- ❌ **Free tier**: Will timeout on AI rendering operations  
- ✅ **Pro tier** ($20/mo): Full functionality with 60s timeout
- ✅ **Local development**: No timeout limits

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed deployment options.

## What This Service Does

The AI Render Service takes architectural sketch images as input and generates professional axonometric (2.5D) architectural drawings. The service:

- Accepts sketch images via HTTP POST
- Preprocesses images (grayscale, contrast enhancement, resizing)
- Uses OpenAI's gpt-image-1 model to generate axonometric drawings
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

- **Format:** Image file (PNG, JPEG, GIF, WebP) or PDF
- **Method:** HTTP POST with `multipart/form-data`
- **Field name:** `image`
- **Max size:** 10MB
- **Content:** Architectural sketch or drawing

The service will automatically:
- If PDF: Convert first page to image
- Convert to grayscale
- Enhance contrast
- Resize to 1024x1024 pixels

### Output

**Response format:** JSON

```json
{
  "imageBase64": "iVBORw0KGgoAAAANSUhEUgAA...",
  "model": "gpt-image-1",
  "promptVersion": "axon_v1"
}
```

- **imageBase64:** Base64-encoded PNG image (1024x1024)
- **model:** AI model used for generation (`gpt-image-1`)
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

**Example Request (Image):**
```bash
curl -X POST http://localhost:3001/render \
  -F "image=@path/to/your/sketch.png" \
  -F "projectId=my-project" \
  -F "renderType=axonometric"
```

**Example Request (PDF):**
```bash
curl -X POST http://localhost:3001/render \
  -F "image=@path/to/your/sketch.pdf" \
  -F "projectId=my-project" \
  -F "renderType=axonometric"
```

**Example Response:**
```json
{
  "imageBase64": "iVBORw0KGgoAAAANSUhEUgAA...",
  "model": "gpt-image-1",
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

## Deployment to Vercel

This service is configured for deployment to Vercel as a serverless function.

### Prerequisites

- Vercel account (sign up at [vercel.com](https://vercel.com))
- Vercel CLI (optional): `npm i -g vercel`
- OpenAI API key

### Environment Variables

Set the following environment variables in your Vercel project:

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | Yes | Your OpenAI API key for image generation |
| `AI_GATEWAY_API_KEY` | Recommended | Vercel AI Gateway key – routes chat completions through gateway to avoid connection errors |
| `NODE_ENV` | No | Set to `production` for production deployments |

**Connection errors on Vercel?** If you see "Failed to connect to OpenAI API: Connection error", add `AI_GATEWAY_API_KEY`:

1. Go to [Vercel AI Gateway](https://vercel.com/ai-gateway) → Create API key
2. Add it as `AI_GATEWAY_API_KEY` in Vercel env vars
3. In AI Gateway settings, add your OpenAI key under **Bring Your Own Key (BYOK)** so the gateway uses your OpenAI account for chat

### Deployment Steps

1. **Install Vercel CLI** (optional, can also deploy via GitHub):
   ```bash
   npm i -g vercel
   ```

2. **Login to Vercel**:
   ```bash
   vercel login
   ```

3. **Deploy to Vercel**:
   ```bash
   # From the project root
   vercel
   ```
   
   Or deploy via GitHub:
   - Push your code to GitHub
   - Import the repository in Vercel dashboard
   - Vercel will automatically detect the configuration

4. **Set Environment Variables**:
   ```bash
   # Via CLI
   vercel env add OPENAI_API_KEY
   # Enter your API key when prompted
   
   # Or via Vercel Dashboard:
   # Project Settings > Environment Variables > Add
   ```

5. **Deploy to Production**:
   ```bash
   vercel --prod
   ```

### Configuration

The service uses `vercel.json` for configuration:
- **API Directory Pattern**: Uses modern `api/[...].ts` catch-all route
- **Runtime**: `@vercel/node` for Express app compatibility
- **Function Timeout**: 60 seconds (can be extended with Vercel Pro)
- **Routes**: All routes (`/health`, `/api/*`, `/render`) are handled by the Express app via the catch-all route

### API Endpoints on Vercel

After deployment, your endpoints will be available at:
- `https://your-project.vercel.app/health`
- `https://your-project.vercel.app/api/geocode`
- `https://your-project.vercel.app/api/infer-existing-context`
- `https://your-project.vercel.app/api/build-site-context`
- `https://your-project.vercel.app/render`

### Notes

- **Timeout Limits**: Vercel Free tier has a 10-second timeout for serverless functions. Vercel Pro allows up to 60 seconds (configured in `vercel.json`).
- **Cold Starts**: Serverless functions may have cold start delays on first request.
- **Environment Variables**: Make sure to set `OPENAI_API_KEY` in your Vercel project settings for all environments (development, preview, production).
