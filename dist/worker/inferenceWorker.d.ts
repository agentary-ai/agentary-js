type WorkerInit = {
    modelBuffers: ArrayBuffer[];
    tokenizerBytes?: ArrayBuffer;
    plan: {
        engine: 'wasm' | 'webgpu' | 'webnn';
        quant: string;
        ctx: number;
    };
};
type WorkerCommands = {
    type: 'init';
    payload: WorkerInit;
} | {
    type: 'generate';
    payload: {
        inputIds: number[];
        opts: any;
    };
} | {
    type: 'dispose';
};
type WorkerEvents = {
    type: 'ready';
} | {
    type: 'token';
    tokenId: number;
    ttfbMs?: number;
} | {
    type: 'done';
} | {
    type: 'error';
    message: string;
};

export type { WorkerCommands, WorkerEvents, WorkerInit };
