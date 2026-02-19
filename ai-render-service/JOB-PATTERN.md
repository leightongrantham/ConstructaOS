# Job Pattern for Free Tier Compatibility

This service implements an async job/queue pattern to work around Vercel's free tier 10-second timeout limit.

## How It Works

### Traditional Approach (Requires Pro)
```
Client → POST /api/render → [AI Generation 30-60s] → Response
         ↓ (timeout after 10s on free tier)
         ❌ 504 Gateway Timeout
```

### Job Pattern (Free Tier Compatible)
```
Client → POST /api/jobs/render → Job Created → Response (jobId)
         ↓ (returns in <1s)
         ✅ Success

Client → POST /api/jobs/:jobId/process → [AI Generation] → Updates job status
         ↓ (may timeout, but job continues)
         
Client → GET /api/jobs/:jobId → Job Status → Poll until complete
         ↓ (fast, <1s per poll)
         ✅ Success
```

## API Endpoints

### 1. Create Job (Fast: <1s)
```bash
POST /api/jobs/render
Content-Type: application/json

{
  "projectId": "test-123",
  "renderType": "axonometric",
  "conceptInputs": { ... }
}

Response:
{
  "jobId": "abc-123",
  "conceptId": "def-456",
  "status": "pending",
  "pollUrl": "/api/jobs/abc-123",
  "processUrl": "/api/jobs/abc-123/process"
}
```

### 2. Check Job Status (Fast: <1s)
```bash
GET /api/jobs/abc-123?projectId=test-123

Response:
{
  "job": {
    "jobId": "abc-123",
    "status": "processing",
    "progress": 50,
    "imageUrl": null,
    "error": null
  }
}
```

### 3. Process Job (Slow: 30-60s)
```bash
POST /api/jobs/abc-123/process
Content-Type: application/json

{
  "projectId": "test-123",
  "conceptInputs": { ... }
}
```

## Client Implementation

### JavaScript Example
```javascript
async function renderWithJobs(projectId, conceptBrief) {
  // 1. Create job
  const createRes = await fetch('/api/jobs/render', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectId,
      renderType: 'axonometric',
      conceptInputs: conceptBrief,
    }),
  });
  
  const { jobId } = await createRes.json();
  
  // 2. Trigger processing (fire-and-forget)
  fetch(`/api/jobs/${jobId}/process`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, conceptInputs: conceptBrief }),
  }).catch(() => {
    // Expected to timeout on free tier, but job continues
  });
  
  // 3. Poll for completion
  while (true) {
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s
    
    const statusRes = await fetch(`/api/jobs/${jobId}?projectId=${projectId}`);
    const { job } = await statusRes.json();
    
    if (job.status === 'completed') {
      console.log('Done!', job.imageUrl);
      return job;
    }
    
    if (job.status === 'failed') {
      throw new Error(job.error);
    }
    
    console.log(`Progress: ${job.progress}%`);
  }
}
```

## Limitations

### Free Tier
- ⚠️ The `/process` endpoint will still timeout after 10s
- ⚠️ Job processing stops when function times out
- ⚠️ Client must stay on page to poll
- ⚠️ No background processing

### What This Pattern Enables
- ✅ Create jobs without timing out (fast operation)
- ✅ Poll job status without timing out (fast operation)
- ✅ Clear progress feedback to user
- ✅ Graceful handling of timeout errors

### What This Pattern Doesn't Solve
- ❌ Actual AI generation still takes 30-60s
- ❌ Still requires Pro tier for the `/process` endpoint
- ❌ Or requires external worker (AWS Lambda, Railway, etc.)

## Production Solutions

### Option 1: Vercel Pro
- Increase timeout to 60s
- Simplest solution
- Cost: ~$20/month

### Option 2: External Worker
- Deploy `/process` endpoint separately
- Railway (500s timeout, free tier)
- AWS Lambda (900s max)
- Render (600s timeout)

### Option 3: Hybrid Architecture
```
Vercel (free) → Create/poll jobs (fast endpoints)
Railway (free) → Process jobs (slow AI generation)
```

## Storage Requirements

Jobs are stored using the same backend as concept seeds:
- **Local development**: `.jobs/` directory
- **Production**: Supabase Storage or similar

Job storage structure:
```
.jobs/
  └── jobs/
      └── {projectId}/
          └── {jobId}.json
```

## Monitoring

Track job statuses in your storage backend:
```bash
# List all jobs for a project
ls .jobs/jobs/test-project-123/

# Check job status
cat .jobs/jobs/test-project-123/abc-123.json
```

## Best Practices

1. **Always use job pattern on free tier**
2. **Add timeout handling in UI** - show clear messages
3. **Poll at reasonable intervals** - 1-2 seconds
4. **Set max poll attempts** - prevent infinite loops
5. **Handle partial failures** - job may fail mid-process
6. **Show progress updates** - keep user informed

## Migration Path

To migrate from direct rendering to job pattern:

1. ✅ Enable job pattern checkbox in UI
2. ✅ Test with simple renders
3. ✅ Monitor job completion rates
4. ✅ Upgrade to Pro or external worker when ready
5. ✅ Remove checkbox, make job pattern default
