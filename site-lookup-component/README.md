# @constructaos/site-lookup

React component for address/site lookup with footprint confirmation. Calls the ai-render-service `/api/site-lookup` API and lets users confirm or select the building footprint.

## Installation

### From GitHub (recommended)

```bash
npm install "github:leightongrantham/constructaos-m1#main:site-lookup-component"
```

For a specific branch:

```bash
npm install "github:leightongrantham/constructaos-m1#your-branch:site-lookup-component"
```

### From local path

```bash
npm install ../site-lookup-component
```

## Usage

```tsx
import { SiteLookup } from '@constructaos/site-lookup';

function MyApp() {
  const handleLookupComplete = (result) => {
    console.log('Site selected:', result);
    // result: { lat, lng, displayName, primary, selectedBuildingId, neighbourPolygons, disclaimer }
    // Use for cost estimation, renderer, etc.
  };

  return (
    <SiteLookup
      apiBaseUrl="https://ai-render-service-weld.vercel.app"
      onLookupComplete={handleLookupComplete}
    />
  );
}
```

## Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `apiBaseUrl` | `string` | Yes | Base URL of the ai-render-service (e.g. `https://ai-render-service-weld.vercel.app`) |
| `onLookupComplete` | `(result: SiteLookupResult) => void` | Yes | Called when user confirms the footprint with the final result |
| `placeholder` | `string` | No | Placeholder for address input (default: "Enter address or postcode") |
| `lookupButtonLabel` | `string` | No | Label for the lookup button (default: "Lookup") |
| `className` | `string` | No | Optional CSS class for the root container |

## SiteLookupResult

```ts
interface SiteLookupResult {
  lat: number;
  lng: number;
  displayName: string;
  primary: ExistingBaseline;
  selectedBuildingId: number | null;  // null = primary selected
  neighbourPolygons: Array<{ id: number; polygon: Array<[number, number]> }>;
  disclaimer: string;
}
```

## Requirements

- The ai-render-service must be deployed and reachable at `apiBaseUrl`
- CORS must allow your app's origin (e.g. Lovable domains)
- React 18+

## Lovable Integration

1. Add the package (Git URL or local path):

   ```json
   "dependencies": {
     "@constructaos/site-lookup": "github:leightongrantham/constructaos-m1#main:site-lookup-component"
   }
   ```

2. Add the component to your page:

   ```tsx
   import { SiteLookup } from '@constructaos/site-lookup';

   <SiteLookup
     apiBaseUrl={import.meta.env.VITE_AI_RENDER_URL || 'https://ai-render-service-weld.vercel.app'}
     onLookupComplete={(result) => {
       setSiteData(result);
       // Pass result to cost estimator / renderer
     }}
   />
   ```

3. Ensure `VITE_AI_RENDER_URL` is set in Lovable env vars if using a custom URL.
