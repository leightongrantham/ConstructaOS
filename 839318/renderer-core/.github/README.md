# GitHub Actions CI/CD

This directory contains GitHub Actions workflows for continuous integration and deployment.

## CI Workflow

The CI workflow (`.github/workflows/ci.yml`) runs on every push and pull request to main branches.

### Standard Tests (Always Run)

The `test` job runs on every push and includes:

1. **Dependency Installation**
   - Installs dependencies for both `renderer-core` and `server-ai` projects
   - Uses npm cache for faster builds

2. **Unit Tests**
   - Runs all server-ai unit tests (schema, LLM mocks, validator, telemetry, rate limiter)
   - Runs renderer-core unit tests (geometry, threshold, opencv, potrace, simplify-paths, ai-clean client)

3. **E2E Tests**
   - Runs end-to-end tests with **mock LLM** (no API calls)
   - Tests the complete pipeline from polylines to topology extraction
   - Validates structural invariants and saves golden files

4. **Linting**
   - Runs linting for both projects (non-blocking)

### AI Integration Tests (Optional)

The `ai-integration-test` job is **optional** and only runs if the `OPENAI_API_KEY` secret is configured.

This job:
- Starts the server-ai server with LLM enabled
- Makes a **single small request** to verify LLM connectivity
- Uses minimal polylines to keep token usage low (~50-100 tokens)
- Validates the response structure

**Note:** This test uses real OpenAI API calls and will consume a small amount of tokens (~$0.001-0.01 per run).

## Setting Up OPENAI_API_KEY Secret

To enable AI integration tests, you need to add the `OPENAI_API_KEY` as a repository secret:

### Steps:

1. Go to your GitHub repository
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Name: `OPENAI_API_KEY`
5. Value: Your OpenAI API key (starts with `sk-...`)
6. Click **Add secret**

### Security Notes:

- Secrets are encrypted and only available to GitHub Actions workflows
- Secrets are never exposed in logs (they are automatically masked)
- The integration test uses a minimal request to keep costs low
- You can revoke or rotate the API key at any time in OpenAI's dashboard

### Cost Estimate:

The integration test makes one small request per CI run:
- **Input tokens:** ~50-100 tokens
- **Output tokens:** ~200-400 tokens
- **Total cost:** ~$0.001-0.01 per test run
- **Monthly estimate:** ~$0.10-1.00 (assuming 10-100 CI runs per month)

## Workflow Status

You can view workflow runs and their status at:
`https://github.com/YOUR_USERNAME/YOUR_REPO/actions`

## Troubleshooting

### Integration test fails to start

- Check that `OPENAI_API_KEY` secret is set correctly
- Verify the API key is valid and has credits
- Check server logs in the workflow output

### Tests fail locally but pass in CI

- Ensure you're using the same Node.js version (20)
- Run `npm ci` instead of `npm install` to match CI environment
- Check that all dependencies are committed (package-lock.json)

### Integration test skipped

- This is expected if `OPENAI_API_KEY` is not set
- The test job will show as "skipped" in the workflow run
- This is normal and does not indicate an error
