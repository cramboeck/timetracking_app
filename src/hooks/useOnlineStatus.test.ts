import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useOnlineStatus } from './useOnlineStatus';

describe('useOnlineStatus', () => {
  const originalNavigator = window.navigator;
  let onlineListeners: ((e: Event) => void)[] = [];
  let offlineListeners: ((e: Event) => void)[] = [];

  beforeEach(() => {
    onlineListeners = [];
    offlineListeners = [];

    vi.spyOn(window, 'addEventListener').mockImplementation((event, handler) => {
      if (event === 'online') onlineListeners.push(handler as (e: Event) => void);
      if (event === 'offline') offlineListeners.push(handler as (e: Event) => void);
    });

    vi.spyOn(window, 'removeEventListener').mockImplementation((event, handler) => {
      if (event === 'online') {
        onlineListeners = onlineListeners.filter(h => h !== handler);
      }
      if (event === 'offline') {
        offlineListeners = offlineListeners.filter(h => h !== handler);
      }
    });

    Object.defineProperty(navigator, 'onLine', {
      writable: true,
      value: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(window, 'navigator', {
      writable: true,
      value: originalNavigator,
    });
  });

  it('returns initial online state', () => {
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current.isOnline).toBe(true);
    expect(result.current.wasOffline).toBe(false);
  });

  it('updates when going offline', () => {
    const { result } = renderHook(() => useOnlineStatus());

    act(() => {
      offlineListeners.forEach(handler => handler(new Event('offline')));
    });

    expect(result.current.isOnline).toBe(false);
  });

  it('updates when coming back online', () => {
    Object.defineProperty(navigator, 'onLine', { value: false });
    const { result } = renderHook(() => useOnlineStatus());

    act(() => {
      Object.defineProperty(navigator, 'onLine', { value: true });
      onlineListeners.forEach(handler => handler(new Event('online')));
    });

    expect(result.current.isOnline).toBe(true);
    expect(result.current.wasOffline).toBe(true);
  });

  it('cleans up event listeners on unmount', () => {
    const { unmount } = renderHook(() => useOnlineStatus());
    expect(onlineListeners.length).toBe(1);
    expect(offlineListeners.length).toBe(1);

    unmount();

    expect(onlineListeners.length).toBe(0);
    expect(offlineListeners.length).toBe(0);
  });
});
