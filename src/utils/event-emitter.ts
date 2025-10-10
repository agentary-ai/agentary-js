import { SessionEvent, EventHandler, UnsubscribeFn } from '../types/events';

/**
 * Simple event emitter for session lifecycle events
 */
export class EventEmitter {
  private handlers: Map<string, Set<EventHandler>> = new Map();
  private wildcardHandlers: Set<EventHandler> = new Set();

  /**
   * Subscribe to specific event types or all events (*)
   * @param eventType - Event type to listen for, or '*' for all events
   * @param handler - Event handler function
   * @returns Unsubscribe function
   */
  on(eventType: string | '*', handler: EventHandler): UnsubscribeFn {
    if (eventType === '*') {
      this.wildcardHandlers.add(handler);
      return () => this.wildcardHandlers.delete(handler);
    }

    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
    }
    this.handlers.get(eventType)!.add(handler);

    return () => {
      const handlers = this.handlers.get(eventType);
      if (handlers) {
        handlers.delete(handler);
        if (handlers.size === 0) {
          this.handlers.delete(eventType);
        }
      }
    };
  }

  /**
   * Unsubscribe from events
   * @param eventType - Event type to unsubscribe from
   * @param handler - Event handler to remove
   */
  off(eventType: string | '*', handler: EventHandler): void {
    if (eventType === '*') {
      this.wildcardHandlers.delete(handler);
      return;
    }

    const handlers = this.handlers.get(eventType);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.handlers.delete(eventType);
      }
    }
  }

  /**
   * Emit an event to all subscribed handlers
   * @param event - Event to emit
   */
  emit(event: SessionEvent): void {
    // Emit to wildcard handlers
    this.wildcardHandlers.forEach(handler => {
      try {
        handler(event);
      } catch (error) {
        console.error('Error in event handler:', error);
      }
    });

    // Emit to specific handlers
    const handlers = this.handlers.get(event.type);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(event);
        } catch (error) {
          console.error(`Error in ${event.type} handler:`, error);
        }
      });
    }
  }

  /**
   * Remove all event handlers
   */
  removeAllListeners(): void {
    this.handlers.clear();
    this.wildcardHandlers.clear();
  }

  /**
   * Get count of handlers for a specific event type
   * @param eventType - Event type to check
   * @returns Number of handlers
   */
  listenerCount(eventType: string | '*'): number {
    if (eventType === '*') {
      return this.wildcardHandlers.size;
    }
    return this.handlers.get(eventType)?.size || 0;
  }

  /**
   * Check if there are any listeners for a specific event type
   * @param eventType - Event type to check
   * @returns True if there are listeners
   */
  hasListeners(eventType?: string): boolean {
    if (this.wildcardHandlers.size > 0) {
      return true;
    }
    if (eventType) {
      return this.handlers.has(eventType) && this.handlers.get(eventType)!.size > 0;
    }
    return this.handlers.size > 0;
  }
}
