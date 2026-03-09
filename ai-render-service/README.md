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

## Image storage (Supabase is primary)

**Use Supabase as the primary way to store rendered images**, especially for production and cross-origin clients (e.g. Lovable).

- **With Supabase** (env: `SUPABASE_URL`, `SUPABASE_ANON_KEY`; or client sends `supabase: { url, anonKey, bucket }`): images are stored in Supabase Storage and the API returns a **public URL**. The client sets `img.src = response.imageUrl` and the image loads from Supabase — no large JSON payload and no cross-origin issues. This fixes the “image not showing” issue on Lovable.
- **Without Supabase**: images are written to local disk and the API returns the image inline (`data:image/png;base64,...`). That works but can hit response size limits or CSP; use Supabase for reliable display from another origin.

Configure Supabase in Vercel (env vars) and/or have the client send Supabase credentials in the request body so storage is always used.

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
PORT=3000
```

### Environment variables and multiple .env files

- **When running from repo root** (`npm run dev` in project root): the root app loads root `.env` / `.env.local` first. When you hit the jobs API, it also loads `ai-render-service/.env` and `ai-render-service/.env.local` so keys there (e.g. `OPENAI_API_KEY`) are applied. So you can keep keys in **either** root or `ai-render-service`; for jobs/rendering, `ai-render-service/.env` is loaded when delegating.
- **When running from ai-render-service** (`cd ai-render-service && npm run dev`): only `ai-render-service/.env` (and `.env.local`) are loaded by that process.
- **Avoid conflicts**: Prefer one place for local keys—e.g. put `OPENAI_API_KEY` only in `ai-render-service/.env` if you use the root dev server and jobs API. Dotenv does not override existing vars, so the first file loaded wins for a given variable name.
- **Do not put `VERCEL_OIDC_TOKEN` in any local .env.** That token is for Vercel deployments only, expires every 12 hours, and will cause **401 OIDC token has expired** if the app uses it locally. For local dev use `OPENAI_API_KEY` (direct OpenAI) or `AI_GATEWAY_API_KEY` (gateway with key).

## Running Locally

### Development Mode

```bash
npm run dev
```

This starts the server with hot-reloading using `tsx`.

### Vercel dev (recommended for local)

```bash
vercel dev
```

Runs the app locally the same way it runs on Vercel: one server (default port 3000) serves the UI and API routes. The frontend uses **same-origin** requests (`/api/jobs/render`, etc.), so no separate API URL is needed. Ensure `OPENAI_API_KEY` (or `AI_GATEWAY_API_KEY`) is in `.env` or `.env.local` in this directory or the project root.

### Production Mode

```bash
# Build TypeScript
npm run build

# Start server
npm start
```

The server will start on the port specified in your `.env` file (default: 3000).

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

### Sync render (POST /api/render) – e.g. Lovable

**Response** always includes a displayable image. **With Supabase configured**, `imageUrl` is an absolute Supabase Storage URL — use that as primary for reliable display on Lovable.

| Field | Use |
|-------|-----|
| `imageUrl` | **Use as `<img src={imageUrl} />`.** With Supabase: absolute storage URL (recommended). Without: `data:image/png;base64,...`. |
| `imageDataUrl` | Same as `imageUrl` when inline; set for compatibility. |
| `imageBase64` | Only when image is inline. If CSP blocks `data:`, build a blob URL from this. |

The client must use `response.imageUrl` directly as the image source when present.

**Concept seed (Lovable):** The response includes **`conceptSeed`** so the client can cache it. On the next request (e.g. plan or section, or another view with the same concept), send **`conceptSeed`** in the request body. The API will use it instead of loading from storage, so the seed is consistent even without Supabase or across serverless instances. If you omit `conceptSeed`, the API loads from storage (Supabase) or generates a new one.

**Isometric (floor plan / section) – can be generated without axon:** You can request `renderType: 'floor_plan'` or `'section'` **without** generating an axonometric view first. Omit `conceptId` (or send a new one); the API will create a new concept and generate a seed from `conceptInputs`, then produce the isometric cutaway. No prior axon is required.

**Optional axon reference (for consistency with an existing axon):** If you already have an axon and want the plan/section to match it, the API will use the stored axon when it’s in the same storage (e.g. same `projectId`/`conceptId` and Supabase). Otherwise send **`referenceAxonUrl`** or **`referenceAxonBase64`** in the body so the cutaway matches that axon.

**Lovable vs renderer UI:** Renders from Lovable (jobs API) can look different if the process request omits site/context the renderer sends. To match the renderer, send the same optional body when calling **POST /api/jobs/:jobId/process**: `address`, `lat`, `lng`, `existingBuilding`, `baselineOverrides`, `referenceAxonUrl` or `referenceAxonBase64`, and `includePeopleInPlan` / `includePeopleInSection` as needed. See DEPLOYMENT.md for the full table.

### POST /render

Upload an image to generate an axonometric concept rendering.

**Example Request (Image):**
```bash
curl -X POST http://localhost:3000/render \
  -F "image=@path/to/your/sketch.png" \
  -F "projectId=my-project" \
  -F "renderType=axonometric"
```

**Example Request (PDF):**
```bash
curl -X POST http://localhost:3000/render \
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
curl -X POST http://localhost:3000/render \
  -F "image=@sketch.png" \
  | jq -r '.imageBase64' \
  | base64 -d > output.png
```

### Health Check

```bash
curl http://localhost:3000/health
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

**Connection errors on Vercel?** If you see "Failed to connect to OpenAI API: Connection error", add `AI_GATEWAY_API_KEY` so both chat and image generation use the gateway:

1. Go to [Vercel AI Gateway](https://vercel.com/ai-gateway) → Create API key
2. Add it as `AI_GATEWAY_API_KEY` in Vercel env vars
3. In AI Gateway → **Bring Your Own Key (BYOK)**, add your OpenAI API key so the gateway can call OpenAI for chat and image generation

**401 "Error verifying OIDC token"?** The AI Gateway can require OIDC when running on Vercel. You can either:

- **Enable OIDC** (recommended): Vercel → Project → Settings → General → enable **OIDC**. The token is then auto-injected as `VERCEL_OIDC_TOKEN` and the gateway accepts it.
- **Use direct OpenAI**: Set `OPENAI_API_KEY` in Vercel env vars. When OIDC is not available, the service uses direct OpenAI for chat and images instead of the gateway, so generation still works (you may see connection issues on some runtimes; if so, enable OIDC).

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
