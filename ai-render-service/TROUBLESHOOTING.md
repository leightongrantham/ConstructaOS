# Troubleshooting Guide

## 404 Error on `/api/jobs/render`

### Symptom
```
Failed to load resource: the server responded with a status of 404 ()
Error: SyntaxError: Unexpected token 'T', "The page c"... is not valid JSON
```

### Cause
The new job endpoints weren't included in the initial deployment.

### Solution

**1. Verify Rewrites in vercel.json**
```json
{
  "rewrites": [
    {
      "source": "/api/jobs/render",
      "destination": "/api/api/jobs/render"
    },
    {
      "source": "/api/jobs/:jobId",
      "destination": "/api/api/jobs/:jobId"
    },
    {
      "source": "/api/jobs/:jobId/process",
      "destination": "/api/api/jobs/:jobId/process"
    }
  ]
}
```

**2. Redeploy to Vercel**
```bash
# Build locally first
npm run build

# Deploy
vercel --prod
```

**3. Test Locally**
```bash
# Start local dev server
npm run dev

# In another terminal, test endpoints
curl http://localhost:3001/health
curl -X POST http://localhost:3001/api/jobs/render \
  -H "Content-Type: application/json" \
  -d '{"projectId":"test","renderType":"axonometric","conceptInputs":{}}'
```

## OpenAI Connection Error

### Symptom
```
Failed to connect to OpenAI API: Connection error
```

### Test endpoints

**1. Health check**
```bash
curl https://YOUR-PROJECT.vercel.app/health
```

**2. OpenAI connectivity test**

```bash
curl https://YOUR-PROJECT.vercel.app/api/test/openai
```

Returns `{"ok": true, "gateway": true/false, "results": {...}}` if chat works. If `chat.ok` is false, `results.chat.error` shows the failure.

**3. Local test**
```bash
npm run dev
curl http://localhost:3001/api/test/openai
```

### Fix

1. Add `AI_GATEWAY_API_KEY` (Vercel AI Gateway → Create key → add to env)
2. Configure BYOK in Vercel → AI Gateway → Bring Your Own Key (add your OpenAI key)
3. Redeploy: `vercel --prod`

If the test endpoint passes but full renders still fail, the issue is likely in image generation (`gpt-image-1`), which uses direct OpenAI. Consider deploying to Railway or Render instead.

---

## Common Issues

### Issue: Routes return 404 on Vercel
**Cause**: Rewrites not configured or deployment needed  
**Fix**: Add rewrites to `vercel.json` and redeploy

### Issue: "Unexpected token" JSON parse error
**Cause**: Server returning HTML error page instead of JSON  
**Fix**: 
1. Check server logs in Vercel dashboard
2. Verify environment variables are set
3. Check function logs for actual error

### Issue: Functions timeout (504)
**Cause**: Vercel free tier has 10-second limit  
**Fix**: 
1. Use job pattern (checkbox in UI)
2. Or upgrade to Vercel Pro
3. Or deploy to Railway/Render

### Issue: Job status always shows "pending"
**Cause**: Process endpoint timing out  
**Fix**: 
- On free tier: Expected behavior (needs external worker)
- On Pro tier: Check function logs for errors

## Debugging Steps

### 1. Check Vercel Deployment Logs
```bash
vercel logs [deployment-url]
```

### 2. Check Function Invocations
- Go to Vercel Dashboard
- Select your project
- Click "Functions" tab
- Filter by function name
- Check execution logs

### 3. Test Endpoint Locally
```bash
# Start server
npm run dev

# Test in browser
open http://localhost:3001/health

# Test with curl
curl -v http://localhost:3001/api/jobs/render
```

### 4. Verify Environment Variables
```bash
# Check if OPENAI_API_KEY is set
vercel env ls

# Add if missing
vercel env add OPENAI_API_KEY
```

## Local Development

### Start Server
```bash
npm run dev
```
Server runs on `http://localhost:3001`

### Test Endpoints
```bash
# Health check
curl http://localhost:3001/health

# Create job
curl -X POST http://localhost:3001/api/jobs/render \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "test-123",
    "renderType": "axonometric",
    "conceptInputs": {
      "proposedDesign": {
        "projectType": "new_build",
        "buildingForm": "detached",
        "storeys": "two",
        "numberOfPlots": "one",
        "totalFloorAreaRange": "100_150",
        "bedrooms": "three",
        "bathrooms": "two",
        "kitchenType": "open_plan",
        "livingSpaces": "single_main_space",
        "roofType": "pitched",
        "massingPreference": "simple_compact",
        "outputType": "concept_axonometric"
      }
    }
  }'

# Check job status (replace JOB_ID)
curl "http://localhost:3001/api/jobs/JOB_ID?projectId=test-123"
```

## Production Checklist

Before deploying to production:

- [ ] `npm run build` succeeds
- [ ] All routes work locally
- [ ] Environment variables set in Vercel
- [ ] Rewrites configured in vercel.json
- [ ] Storage backend configured (Supabase or local)
- [ ] OpenAI API key is valid
- [ ] Timeout limits understood (10s free, 60s Pro)

## Getting Help

1. Check logs: `vercel logs`
2. Check function executions in Vercel dashboard
3. Test locally: `npm run dev`
4. Review DEPLOYMENT.md for timeout issues
5. Review JOB-PATTERN.md for async rendering
