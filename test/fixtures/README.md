# Test Fixtures

## Usage

The test harness supports two ways to specify test files:

### 1. Command-line argument (recommended)

Upload any image or PDF file directly:

```bash
# Test with a PDF file
npm run test:local ./path/to/your/sketch.pdf

# Test with an image file
npm run test:local ./path/to/your/sketch.png

# Specify render type (optional, defaults to axonometric)
npm run test:local ./sketch.pdf floor_plan
npm run test:local ./sketch.png section
```

### 2. Default fixtures directory

Place a test sketch file in this directory to use as default:

- **`sketch.pdf`** - PDF file (preferred, will be used if present)
- **`sketch.png`** - PNG image file (fallback if PDF not found)

If no command-line argument is provided, the test harness will automatically:
1. Look for `sketch.pdf` first
2. Fall back to `sketch.png` if PDF is not found
3. Fail with an error if neither file exists

## Supported File Types

- **PDF files** (`.pdf`) - First page will be converted to image automatically
- **Image files** (`.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`)

## Supported Render Types

- `axonometric` (default)
- `floor_plan`
- `section`

## Examples

```bash
# Use default fixtures
npm run test:local

# Test a specific PDF
npm run test:local ./my-architecture.pdf

# Test with floor plan render type
npm run test:local ./sketch.pdf floor_plan

# Test an image with section render type
npm run test:local ./drawing.png section
```

