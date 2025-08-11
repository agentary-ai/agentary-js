// src/worker/inferenceWorker.ts
var ready = false;
var ttfbStart = 0;
self.onmessage = async (ev) => {
  try {
    const msg = ev.data;
    switch (msg.type) {
      case "init": {
        ready = true;
        self.postMessage({ type: "ready" });
        break;
      }
      case "generate": {
        if (!ready) throw new Error("Worker not initialized");
        ttfbStart = performance.now();
        const ids = msg.payload.inputIds;
        for (let i = 0; i < ids.length; i++) {
          if (i === 0) {
            self.postMessage({ type: "token", tokenId: ids[i], ttfbMs: performance.now() - ttfbStart });
          } else {
            self.postMessage({ type: "token", tokenId: ids[i] });
          }
          await new Promise((r) => setTimeout(r, 10));
        }
        self.postMessage({ type: "done" });
        break;
      }
      case "dispose": {
        close();
        break;
      }
    }
  } catch (e) {
    self.postMessage({ type: "error", message: e?.message ?? String(e) });
  }
};
//# sourceMappingURL=inferenceWorker.js.map
//# sourceMappingURL=inferenceWorker.js.map