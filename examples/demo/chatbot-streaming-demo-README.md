# Streaming Chatbot Demo

A simple, interactive chatbot that demonstrates real-time streaming responses using Agentary JS.

## Features

- 💬 **Real-time Streaming**: Watch AI responses appear token-by-token as they're generated
- 🔄 **Multi-turn Conversations**: Full conversation history maintained across messages
- 🎨 **Clean UI**: Modern, responsive chat interface with message bubbles
- 🚀 **Dual Model Support**: Switch between cloud (GPT-5 Nano) and device (Qwen3) models
- ⚡ **Performance Metrics**: Shows tokens per second and Time to First Byte (TTFB)
- 📝 **Example Prompts**: Quick-start buttons with common queries

## Quick Start (TL;DR)

```bash
# From project root
npm install
npm install @huggingface/transformers
npm run build

# From examples directory
cd examples
npm install -D vite
npx vite

# Open browser to http://localhost:5173/chatbot-streaming-demo.html
```

## Prerequisites

1. **Install Dependencies**: Run from the project root:
   ```bash
   npm install
   ```

   **Important**: For device-based inference, Transformers.js is required as a peer dependency:
   ```bash
   npm install @huggingface/transformers
   ```

2. **Build Agentary Library**: Run from the project root:
   ```bash
   npm run build
   ```

3. **Cloud Proxy Server** (optional, for cloud models): Start the OpenAI proxy:
   ```bash
   cd examples/cloud-proxy
   npm install
   node openai-proxy.js
   ```
   
   Make sure you have an OpenAI API key set in `examples/cloud-proxy/.env`:
   ```
   OPENAI_API_KEY=your-api-key-here
   ```

## Usage

### Option 1: Direct Browser Open

Simply open `chatbot-streaming-demo.html` in a modern browser that supports:
- ES Modules
- WebGPU (for device models)
- File system access to load `../dist/index.js`

**Note**: Some browsers require a local server for ES module imports to work properly.

### Option 2: Local Web Server with Bundler (Recommended)

**Important**: This example uses ES modules with bare import specifiers (like `@huggingface/transformers`), which require a bundler to resolve properly in Web Workers.

**Recommended: Use Vite for development:**

```bash
# From the examples directory
cd examples

# Install Vite locally (or globally with -g)
npm install -D vite

# Run Vite dev server
npx vite
```

Then navigate to: `http://localhost:5173/chatbot-streaming-demo.html`

A `vite.config.js` file is already configured in the examples directory to handle:
- ES module resolution for workers
- Transformers.js dependency bundling
- WebGPU headers (Cross-Origin isolation)

**Alternative: Python/Node HTTP Server (Cloud Models Only)**

If you want to test without a bundler, use only cloud models (GPT-5 Nano). Device models require a bundler to resolve module imports in workers.

```bash
# From the project root
python3 -m http.server 8000
```

Then navigate to: `http://localhost:8000/examples/chatbot-streaming-demo.html`

**Note**: You'll need to comment out or avoid selecting the device model option.

### Option 3: VS Code Live Server

1. Install the "Live Server" extension in VS Code
2. Right-click on `chatbot-streaming-demo.html`
3. Select "Open with Live Server"

## How to Use

1. **Start Chatting**: Type your message in the input box at the bottom
2. **Send Messages**: Press Enter or click the Send button
3. **Watch Streaming**: See the AI's response appear in real-time
4. **Switch Models**: Use the dropdown in the header to change between cloud and device models
5. **Try Examples**: Click on the example prompt buttons for quick queries
6. **Clear History**: Click the 🗑️ Clear button to start a fresh conversation

## Model Options

### GPT-5 Nano (Cloud)
- **Pros**: Fast, high-quality responses
- **Cons**: Requires proxy server and API key
- **Use Case**: Best for production and general conversation

### Qwen3 0.6B (Device)
- **Pros**: Runs entirely in browser, no API costs
- **Cons**: Requires WebGPU support, slower on first load
- **Use Case**: Privacy-focused or offline usage

## Technical Details

### Streaming Implementation

The demo uses Agentary's streaming API:

```javascript
const response = await session.createResponse({
  model: selectedModel,
  messages: conversationHistory,
  temperature: 0.7,
  max_tokens: 500
});

if (response.type === 'streaming') {
  for await (const chunk of response.stream) {
    fullResponse += chunk.token;
    updateUI(fullResponse);
  }
}
```

### Conversation History

Each message is stored in the conversation history to enable multi-turn conversations:

```javascript
conversationHistory = [
  { role: 'user', content: 'Hello!' },
  { role: 'assistant', content: 'Hi there! How can I help?' },
  { role: 'user', content: 'Tell me a joke' },
  // ...
];
```

### Performance Monitoring

The demo tracks:
- **TTFB (Time to First Byte)**: Time until first token appears
- **Tokens per Second**: Real-time generation speed
- **Total Messages**: Conversation length counter

## Troubleshooting

### "Failed to initialize AI session"
- Make sure the library is built: `npm run build` from project root
- For device models, ensure `@huggingface/transformers` is installed: `npm install @huggingface/transformers`
- Check browser console for detailed error messages

### Cloud model not working
- Verify the proxy server is running on `http://localhost:3002`
- Check that your API key is set in the proxy's `.env` file
- Look at proxy server logs for errors

### Device model not loading
- Ensure `@huggingface/transformers` is installed (peer dependency required)
- Verify your browser supports WebGPU (Chrome 113+, Edge 113+)
- Check browser console for WebGPU-related errors
- Make sure your bundler is configured correctly (see Vite configuration guide in docs)
- Try switching to cloud model as fallback

### "Failed to resolve module specifier '@huggingface/transformers'" in worker
This error occurs when running the example with a simple HTTP server (Python, http-server, etc.) because Web Workers cannot resolve bare module specifiers without a bundler.

**Solution:**
1. Use Vite dev server instead (recommended - see setup above)
2. OR only use cloud models (avoid device models when using simple HTTP server)

### Streaming appears slow
- Device models require initial download and compilation (~1-2 min first time)
- Models are cached after first load for faster subsequent usage
- Cloud models typically respond faster once proxy is running

## Browser Compatibility

- **Chrome/Edge 113+**: Full support (WebGPU + streaming)
- **Firefox**: Limited (no WebGPU support yet)
- **Safari**: Limited (no WebGPU support yet)

For browsers without WebGPU, use the cloud model option.

## Code Structure

```
chatbot-streaming-demo.html
├── Styles: Modern chat UI with message bubbles
├── HTML: Chat container with header, messages, and input
└── JavaScript:
    ├── Session initialization
    ├── Message management
    ├── Streaming handler
    ├── UI updates
    └── Event listeners
```

## Next Steps

Want to customize this demo? Try:

1. **Add System Prompts**: Customize the AI's personality
2. **Implement RAG**: Add document context to messages
3. **Add Voice Input**: Integrate Web Speech API
4. **Save Conversations**: Store chat history in localStorage
5. **Add More Models**: Register additional models for different use cases

## Related Examples

- `weather-planner-demo.html`: Complex multi-step agentic workflow
- `cloud-proxy/client-example.js`: Node.js streaming examples

## License

MIT - See project root LICENSE file
