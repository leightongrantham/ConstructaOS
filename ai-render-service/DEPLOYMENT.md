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

# Access at http://localhost:3001
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

1. **Add Vercel AI Gateway** (routes chat through Vercel's infrastructure):
   - Go to [Vercel AI Gateway](https://vercel.com/ai-gateway) → Create API key
   - Add `AI_GATEWAY_API_KEY` to your Vercel project env vars
   - In AI Gateway → Bring Your Own Key, add your `OPENAI_API_KEY`

2. **Image generation** (`gpt-image-1`) still uses direct OpenAI. If connection errors persist for image generation, consider deploying to Railway or Render instead.

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
