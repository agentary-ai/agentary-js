# Using Transformers.js in HTML Demos

Since `@huggingface/transformers` is now an optional peer dependency, HTML demos need to explicitly provide it. Here are the available options:

## Option 1: Import Maps (Recommended) ✅

Import maps are a web standard that tells the browser where to find bare module specifiers.

### Usage

Add this to your HTML `<head>`:

```html
<script type="importmap">
  {
    "imports": {
      "@huggingface/transformers": "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.1/dist/transformers.min.js"
    }
  }
</script>
```

### Pros
- ✅ Clean, standards-based approach
- ✅ Works with ES modules natively
- ✅ No build step required
- ✅ Good browser support (Chrome 89+, Firefox 108+, Safari 16.4+)

### Cons
- ❌ Requires modern browser
- ❌ Network dependency (CDN must be available)

### CDN Options

**jsDelivr (Recommended):**
```html
"@huggingface/transformers": "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.1/dist/transformers.min.js"
```

**esm.sh:**
```html
"@huggingface/transformers": "https://esm.sh/@huggingface/transformers@3.0.1"
```

**UNPKG:**
```html
"@huggingface/transformers": "https://unpkg.com/@huggingface/transformers@3.0.1/dist/transformers.min.js"
```

---

## Option 2: Local Development Server

Use a dev server that can resolve node_modules imports.

### Using Vite (Recommended)

1. **Install Vite:**
   ```bash
   npm install -D vite
   ```

2. **Add script to package.json:**
   ```json
   {
     "scripts": {
       "serve:examples": "vite examples --port 3000"
     }
   }
   ```

3. **Run server:**
   ```bash
   npm run serve:examples
   ```

4. **Access demos:**
   Open `http://localhost:3000/chatbot-streaming-demo.html`

### Pros
- ✅ Works with local `node_modules`
- ✅ Fast hot reload during development
- ✅ No external network dependency
- ✅ Works with any npm package

### Cons
- ❌ Requires running a server
- ❌ Not suitable for static hosting without build step

---

## Option 3: Bundle Transformers.js

Pre-bundle transformers.js into your examples directory.

### Using a Script

Create `scripts/bundle-transformers.js`:

```javascript
import { build } from 'esbuild';

await build({
  entryPoints: ['node_modules/@huggingface/transformers/dist/transformers.min.js'],
  bundle: true,
  format: 'esm',
  outfile: 'examples/vendor/transformers.js',
  external: []
});

console.log('✅ Transformers.js bundled to examples/vendor/');
```

Then update your import map:

```html
<script type="importmap">
  {
    "imports": {
      "@huggingface/transformers": "./vendor/transformers.js"
    }
  }
</script>
```

### Pros
- ✅ No external dependencies at runtime
- ✅ Works offline
- ✅ Faster load times (local file)

### Cons
- ❌ Requires build step
- ❌ Need to rebuild when updating transformers.js
- ❌ Larger repository size

---

## Option 4: Direct Script Tag

Load transformers.js as a global before your module code.

```html
<script src="https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.1/dist/transformers.min.js"></script>
<script type="module">
  // transformers is now available globally
  import { createAgentSession } from '../dist/index.js';
  // ...
</script>
```

### Pros
- ✅ Simple approach
- ✅ Works in older browsers

### Cons
- ❌ Pollutes global namespace
- ❌ May not work with ES module imports in worker
- ❌ Not recommended for modern development

---

## Recommended Setup by Use Case

### Static HTML Demos (Current)
**Use Import Maps with CDN**
- No build tools needed
- Works with file:// protocol
- Easy for users to understand

### Development Environment
**Use Vite Dev Server**
- Better DX with hot reload
- Resolves node_modules automatically
- Fast and modern

### Production Deployment
**Bundle with Build Tool**
- Self-contained examples
- No external CDN dependency
- Better performance

---

## Checking Availability

The demos now include runtime detection:

```javascript
async function checkDeviceSupport() {
  try {
    const testSession = await createAgentSession({
      models: [{ 
        runtime: "transformers-js", 
        model: "onnx-community/Qwen3-0.6B-ONNX", 
        quantization: "q4f16" 
      }]
    });
    await testSession.dispose();
    console.log('✅ Transformers.js available');
    return true;
  } catch (error) {
    console.log('ℹ️ Transformers.js not available');
    return false;
  }
}
```

This allows demos to gracefully degrade to cloud-only mode if transformers.js is not available.

---

## Troubleshooting

### Import fails with "Bare specifier"
**Solution:** Add import map or use a dev server

### "Module not found" in worker
**Solution:** Ensure import map is defined before any script that might create workers

### CORS errors from CDN
**Solution:** Use a different CDN or bundle locally

### Version mismatch
**Solution:** Check that CDN version matches your peer dependency version in package.json

---

## Browser Compatibility

Import maps are supported in:
- Chrome/Edge 89+
- Firefox 108+
- Safari 16.4+

For older browsers, use Option 2 (dev server) or Option 3 (bundling).
