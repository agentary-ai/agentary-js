import { describe, it, expect, vi, beforeEach } from 'vitest'
import { WorkerManager } from '../../src/workers/manager'
import type { TaskType, CreateSessionArgs } from '../../src/types/api'

describe('WorkerManager Business Logic', () => {
  let workerManager: WorkerManager;
  
  beforeEach(() => {
    workerManager = new WorkerManager({
      models: {
        chat: { name: 'test-model', quantization: 'q4' }
      }
    });
  });

  describe('Task Type Determination', () => {
    it('should choose function_calling for requests with tools', () => {
      const taskType = workerManager['determineTaskType']({
        prompt: 'test',
        tools: [{ type: 'function', function: { name: 'test' } }]
      });
      expect(taskType).toBe('function_calling');
    });

    it('should choose chat for basic requests', () => {
      const taskType = workerManager['determineTaskType']({
        prompt: 'test'
      });
      expect(taskType).toBe('chat');
    });
  });

  describe('Model Selection', () => {
    it('should return correct model for task type', () => {
      const model = workerManager['getModelForTaskType']('chat');
      expect(model).toEqual({ name: 'test-model', quantization: 'q4' });
    });

    it('should fallback to default for missing models', () => {
      const model = workerManager['getModelForTaskType']('function_calling');
      expect(model.name).toContain('Qwen'); // Default model
    });
  });
});
