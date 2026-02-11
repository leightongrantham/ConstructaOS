# ⚠️ IMPORTANT: You Must Use a Web Server

**DO NOT** open `index.html` directly in your browser (double-clicking it).

ES modules require a web server due to browser security (CORS) restrictions.

## ✅ Correct Way to Test

### Option 1: Use Vite Dev Server (Recommended)

```bash
cd constructaos-m1/839318/renderer-core
npm install    # First time only
npm run dev
```

This will:
- Start server at http://localhost:3000
- Open browser automatically
- Enable hot reload

### Option 2: Use Simple HTTP Server

```bash
cd constructaos-m1/839318/renderer-core

# Python 3
python3 -m http.server 8000

# Then open: http://localhost:8000/index.html
```

### Option 3: Use the Start Script

```bash
cd constructaos-m1/839318/renderer-core
./start.sh
```

## ❌ What NOT to Do

- ❌ Double-click `index.html` in Finder
- ❌ Open `file:///path/to/index.html` in browser
- ❌ Drag and drop HTML file into browser

These will cause CORS errors like:
```
Cross-Origin Request Blocked
Module source URI is not allowed
```

## Quick Test

1. Run `npm run dev`
2. Browser opens automatically
3. Click "Use Default Mock Data" button
4. You should see 3 rendered views!

## Troubleshooting

**"vite: command not found"**
- Run `npm install` first

**Port 3000 already in use**
- Change port in `vite.config.js` or kill the process using port 3000

**Button doesn't work**
- Check browser console (F12) for errors
- Make sure Paper.js loaded (check Network tab)
