# Deployment Guide

## ⚠️ Important: Vercel Free Tier Limitation

**This service requires Vercel Pro for production use.**

### Why Pro is Required

AI image generation typically takes 20-60 seconds per render:
- **Vercel Free tier**: 10-second function timeout
- **Vercel Pro tier**: 60-second function timeout (configurable up to 300s)

The free tier will result in **504 Gateway Timeout errors** for most AI rendering operations.

### Deployment Options

#### Option 1: Vercel Pro (Recommended for Production)
```bash
# Deploy to Vercel Pro account
vercel --prod

# Verify timeout is set to 60s in vercel.json
# (currently set to 10s for free tier)
```

Update `vercel.json`:
```json
{
  "functions": {
    "api/[...].ts": {
      "maxDuration": 60
    }
  }
}
```

Cost: ~$20/month

#### Option 2: Local Development
```bash
# Run locally (no timeout limits)
npm run dev

# Access at http://localhost:3000
```

#### Option 3: Alternative Platforms

Deploy to platforms with longer timeouts:
- **Railway**: 500s timeout
- **Render**: 600s timeout  
- **AWS Lambda**: 900s max timeout
- **Google Cloud Run**: Configurable timeout

### Current Configuration

The service is currently configured for **Vercel Free tier** (`maxDuration: 10`).

This means:
- ✅ Health checks work
- ✅ Geocoding works
- ❌ AI rendering will timeout (504 errors)

### Testing on Free Tier

To test other features without upgrading:
1. Comment out the AI generation call in `/api/render`
2. Return mock responses
3. Test UI, geocoding, and other non-AI features

### Fixing "Connection error" on Vercel

If you see `Failed to connect to OpenAI API: Connection error` after deploying:

1. **Add Vercel AI Gateway** (routes chat and image generation through Vercel's infrastructure):
   - Go to [Vercel AI Gateway](https://vercel.com/ai-gateway) → Create API key
   - Add `AI_GATEWAY_API_KEY` to your Vercel project env vars
   - In AI Gateway → **Bring Your Own Key (BYOK)**, add your OpenAI API key so the gateway can call OpenAI for both chat and image generation

2. With `AI_GATEWAY_API_KEY` set, image generation uses the gateway (model `openai/gpt-image-1`) and avoids direct connection errors from serverless to api.openai.com. If you still see connection errors, ensure BYOK is configured with a valid OpenAI key.

3. **Env var scope**: In Vercel → Project → Settings → Environment Variables, ensure `OPENAI_API_KEY` and/or `AI_GATEWAY_API_KEY` apply to **Production** (and Preview if you test there). Do not restrict them to specific paths/functions, or the sync endpoint (`/api/render`) may not see them while the jobs endpoint (`/api/jobs/.../process`) does.

### Why async (jobs) can work when sync (POST /api/render) fails

- **Sync**: The client calls `POST /api/render` and waits. That request is handled by one serverless function (`api/render.ts`). The same request does the OpenAI call, so any connection failure is returned directly to the client.
- **Async**: The client calls `POST /api/jobs/render` (create job), then `POST /api/jobs/:id/process` (fire-and-forget), then polls `GET /api/jobs/:id`. The OpenAI call runs in a **different** serverless function (`api/jobs/[jobId]/process.ts`). That invocation can have different cold-start or env (e.g. if env vars were scoped to certain routes), so it may succeed when the sync path fails.

**Recommendation**: If keys are present (check `/health`) but sync still returns "Connection error", use the **jobs API** from your client (e.g. Lovable): create job → POST to `processUrl` → poll until `completed` or `failed`. That uses the same backend but the invocation that calls OpenAI is the process handler, which may be more reliable on Vercel.

### Testing the deployed API

**Use the jobs pattern for Lovable** — it avoids holding a long connection and often works when sync fails on Vercel.

**1. Check if keys are set (no validation):**
```bash
curl -s https://ai-render-service-weld.vercel.app/health | jq
# Expect: { "status": "ok", "keys": { "openai", "gateway", "imageReady" } }
```

**2. Check if keys are correct (validates with a minimal API call):**
```bash
curl -s "https://ai-render-service-weld.vercel.app/api/health/keys?validate=1" | jq
# Expect: keys.set for each, and validated: true, valid: true if the key works; valid: false and error if not.
```

**3. Sync (POST /api/render)** — one request, wait for image (can hit connection error or timeout):
```bash
curl -s -X POST https://ai-render-service-weld.vercel.app/api/render \
  -H "Content-Type: application/json" \
  -d '{"projectId":"test","renderType":"axonometric","conceptInputs":{"projectType":"new_build","floorAreaRange":"100_150","bedrooms":"two","bathrooms":"one","kitchenType":"open_plan","livingSpaces":"single_main_space","roofType":"flat","massingPreference":"simple_compact","outputType":"concept_axonometric"}}'
```
- Success: JSON with `imageUrl` or `imageDataUrl`.
- Connection issue: 503 with `"error": "OPENAI_CONNECTION_FAILED"` and `hint`.

**4. Jobs pattern (recommended for Lovable)** — create job, trigger process, poll:
```bash
BASE="https://ai-render-service-weld.vercel.app"
BRIEF='{"projectType":"new_build","floorAreaRange":"100_150","bedrooms":"two","bathrooms":"one","kitchenType":"open_plan","livingSpaces":"single_main_space","roofType":"flat","massingPreference":"simple_compact","outputType":"concept_axonometric"}'

# Step 1: Create job
JOB_RESP=$(curl -s -X POST "$BASE/api/jobs/render" -H "Content-Type: application/json" \
  -d "{\"projectId\":\"test\",\"renderType\":\"axonometric\",\"conceptInputs\":$BRIEF}")
echo "$JOB_RESP" | jq
JOB_ID=$(echo "$JOB_RESP" | jq -r '.jobId')

# Step 2: Trigger process (runs in a separate invocation)
curl -s -X POST "$BASE/api/jobs/${JOB_ID}/process" -H "Content-Type: application/json" \
  -d "{\"projectId\":\"test\",\"conceptInputs\":$BRIEF}" &

# Step 3: Poll until completed or failed
while true; do
  R=$(curl -s "$BASE/api/jobs/${JOB_ID}?projectId=test")
  STATUS=$(echo "$R" | jq -r '.job.status')
  echo "Status: $STATUS"
  [ "$STATUS" = "completed" ] && echo "$R" | jq '.job.imageUrl' && break
  [ "$STATUS" = "failed" ] && echo "$R" | jq '.job.error' && break
  sleep 3
done
```

For Lovable: use the **jobs** flow — create job, POST to `processUrl` with `projectId` + `conceptInputs`, then poll `GET /api/jobs/:jobId?projectId=...` until `status` is `completed` or `failed`.

### Why Lovable renders can look different from the renderer UI

The **renderer** (this service’s own UI) sends extra context to **POST /api/render** that affects the prompt and style:

- **Site context** – `address`, `lat`, `lng` (and optionally `selectedBuildingId`, `existingBuilding`, `baselineOverrides`) so the AI gets real existing-building data (storeys, form, footprint).
- **Reference axon** – for floor plan/section, the UI uses the stored axonometric image or sends `referenceAxonUrl` / `referenceAxonBase64` so the cutaway matches the axon.
- **Options** – `includePeopleInPlan`, `includePeopleInSection`, footprint scale overrides.

If Lovable only sends `projectId` and `conceptInputs` to **POST /api/jobs/:jobId/process**, the job runs **without** that context, so outputs can differ (e.g. no site-specific baseline, no reference image, different style).

**To align Lovable with the renderer**, send the same optional fields in the **process** request body when calling `POST /api/jobs/:jobId/process`:

| Field | Effect |
|-------|--------|
| `address`, `lat`, `lng` | Resolves existing building from site lookup; seed and prompt use real storeys/form. |
| `existingBuilding` | `{ classification, footprintArea, adjacencyCount }` when user picked a footprint (same as renderer). |
| `baselineOverrides` or `site.baselineOverride` | Override storeys, building form, roof, footprint scale. |
| `referenceAxonUrl` or `referenceAxonBase64` | For floor_plan/section, use this axon so the cutaway matches. |
| `includePeopleInPlan`, `includePeopleInSection` | Include people in plan/section view. |

Same shapes as **POST /api/render**; the process handler now uses them so jobs produce the same style and context as the sync renderer.

### CORS and site-lookup from Lovable

`/api/site-lookup` allows requests from Lovable origins (e.g. `*.lovable.app`, `id-preview--*.lovable.app`). If you see a CORS error such as *"No 'Access-Control-Allow-Origin' header is present"* when calling from a Lovable app:

1. **Redeploy** so the latest CORS allowlist is live (Lovable preview URLs are explicitly allowed).
2. **Vercel Deployment Protection**: If the project uses Password Protection or Vercel Authentication, the **OPTIONS** preflight request can be blocked before it reaches the function, so the response has no CORS headers. Fix: Vercel → Project → Settings → Deployment Protection → **OPTIONS Allowlist** and ensure `/api/site-lookup` (or `/api/*`) is allowed for unauthenticated OPTIONS. Then preflight will reach the function and return the correct headers.

### Production Checklist

Before deploying to production:

- [ ] Upgrade to Vercel Pro or alternative platform
- [ ] Update `maxDuration` to 60+ seconds
- [ ] Set environment variable `OPENAI_API_KEY`
- [ ] Set `AI_GATEWAY_API_KEY` and configure BYOK (recommended for Vercel)
- [ ] Test end-to-end rendering workflow
- [ ] Monitor function execution times
- [ ] Set up error alerting

### Monitoring

Monitor function execution times in Vercel dashboard:
- Functions > Logs > Filter by `/api/render`
- Check "Duration" column
- Typical renders: 20-60s
- Timeouts appear as 504 errors

### Support

If you encounter 504 errors:
1. Check Vercel plan (Free vs Pro)
2. Verify `maxDuration` in vercel.json
3. Check function logs for execution time
4. Consider running locally for development
