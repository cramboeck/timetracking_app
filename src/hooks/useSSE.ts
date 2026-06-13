/**
 * Server-Sent Events Hook
 *
 * Connects to the SSE endpoint and provides real-time updates.
 * Integrates with TanStack Query to invalidate queries on events.
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { getAuthToken } from '../services/api/base';

export type SSEEventType =
  | 'ninja_alert'
  | 'ticket_update'
  | 'ticket_created'
  | 'email_received'
  | 'contract_warning'
  | 'heartbeat'
  | 'connected';

export interface SSEEventData {
  timestamp: string;
  [key: string]: unknown;
}

interface UseSSEOptions {
  enabled?: boolean;
  onEvent?: (type: SSEEventType, data: SSEEventData) => void;
}

interface SSEState {
  isConnected: boolean;
  lastEventAt: Date | null;
  reconnectAttempts: number;
}

const API_BASE = import.meta.env.VITE_API_URL || '';
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY_BASE = 2000; // 2 seconds, exponential backoff

export function useSSE(options: UseSSEOptions = {}) {
  const { enabled = true, onEvent } = options;
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [state, setState] = useState<SSEState>({
    isConnected: false,
    lastEventAt: null,
    reconnectAttempts: 0,
  });

  const cleanup = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setState(prev => ({ ...prev, isConnected: false }));
  }, []);

  const handleEvent = useCallback(
    (type: SSEEventType, data: SSEEventData) => {
      setState(prev => ({ ...prev, lastEventAt: new Date() }));

      // Invalidate relevant queries based on event type
      switch (type) {
        case 'ninja_alert':
          queryClient.invalidateQueries({ queryKey: ['ninja', 'alerts'] });
          break;
        case 'ticket_update':
        case 'ticket_created':
          queryClient.invalidateQueries({ queryKey: ['tickets'] });
          if (data.ticketId) {
            queryClient.invalidateQueries({ queryKey: ['ticket', data.ticketId] });
          }
          break;
        case 'email_received':
          queryClient.invalidateQueries({ queryKey: ['tickets'] });
          break;
        case 'contract_warning':
          queryClient.invalidateQueries({ queryKey: ['contracts'] });
          break;
        case 'connected':
          setState(prev => ({ ...prev, isConnected: true, reconnectAttempts: 0 }));
          break;
        case 'heartbeat':
          // Just update lastEventAt, already done above
          break;
      }

      // Call custom handler if provided
      onEvent?.(type, data);
    },
    [queryClient, onEvent]
  );

  const connect = useCallback(() => {
    const token = getAuthToken();
    if (!token || !enabled || !isAuthenticated) {
      return;
    }

    cleanup();

    const url = `${API_BASE}/api/sse/events?token=${encodeURIComponent(token)}`;

    try {
      const eventSource = new EventSource(url);
      eventSourceRef.current = eventSource;

      // Handle specific event types
      const eventTypes: SSEEventType[] = [
        'ninja_alert',
        'ticket_update',
        'ticket_created',
        'email_received',
        'contract_warning',
        'heartbeat',
        'connected',
      ];

      eventTypes.forEach(type => {
        eventSource.addEventListener(type, (event: MessageEvent) => {
          try {
            const data = JSON.parse(event.data) as SSEEventData;
            handleEvent(type, data);
          } catch (err) {
            console.error(`[SSE] Failed to parse ${type} event:`, err);
          }
        });
      });

      eventSource.onerror = () => {
        console.warn('[SSE] Connection error, will reconnect...');
        cleanup();

        // Attempt reconnect with exponential backoff
        setState(prev => {
          const attempts = prev.reconnectAttempts + 1;
          if (attempts <= MAX_RECONNECT_ATTEMPTS) {
            const delay = RECONNECT_DELAY_BASE * Math.pow(2, attempts - 1);
            reconnectTimeoutRef.current = setTimeout(connect, delay);
            console.log(`[SSE] Reconnecting in ${delay}ms (attempt ${attempts}/${MAX_RECONNECT_ATTEMPTS})`);
          } else {
            console.error('[SSE] Max reconnect attempts reached, giving up');
          }
          return { ...prev, isConnected: false, reconnectAttempts: attempts };
        });
      };
    } catch (err) {
      console.error('[SSE] Failed to create EventSource:', err);
    }
  }, [enabled, isAuthenticated, cleanup, handleEvent]);

  // Connect when enabled and authenticated
  useEffect(() => {
    if (enabled && isAuthenticated) {
      connect();
    }

    return cleanup;
  }, [enabled, isAuthenticated, connect, cleanup]);

  // Manual reconnect function
  const reconnect = useCallback(() => {
    setState(prev => ({ ...prev, reconnectAttempts: 0 }));
    connect();
  }, [connect]);

  return {
    isConnected: state.isConnected,
    lastEventAt: state.lastEventAt,
    reconnectAttempts: state.reconnectAttempts,
    reconnect,
  };
}
