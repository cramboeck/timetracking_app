import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMediaQuery, useIsDesktop, breakpoints } from './useMediaQuery';

describe('useMediaQuery', () => {
  let matchMediaMock: ReturnType<typeof vi.fn>;
  let addEventListenerMock: ReturnType<typeof vi.fn>;
  let removeEventListenerMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    addEventListenerMock = vi.fn();
    removeEventListenerMock = vi.fn();
    matchMediaMock = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('768') ? true : false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: addEventListenerMock,
      removeEventListener: removeEventListenerMock,
      dispatchEvent: vi.fn(),
    }));
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: matchMediaMock,
    });
  });

  it('returns initial match state', () => {
    const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'));
    expect(result.current).toBe(true);
  });

  it('returns false for non-matching query', () => {
    const { result } = renderHook(() => useMediaQuery('(min-width: 1024px)'));
    expect(result.current).toBe(false);
  });

  it('adds event listener on mount', () => {
    renderHook(() => useMediaQuery('(min-width: 768px)'));
    expect(addEventListenerMock).toHaveBeenCalledWith('change', expect.any(Function));
  });

  it('removes event listener on unmount', () => {
    const { unmount } = renderHook(() => useMediaQuery('(min-width: 768px)'));
    unmount();
    expect(removeEventListenerMock).toHaveBeenCalledWith('change', expect.any(Function));
  });

  it('updates when media query changes', () => {
    let changeHandler: ((e: { matches: boolean }) => void) | undefined;
    addEventListenerMock.mockImplementation((event: string, handler: (e: { matches: boolean }) => void) => {
      if (event === 'change') changeHandler = handler;
    });

    const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'));
    expect(result.current).toBe(true);

    act(() => {
      changeHandler?.({ matches: false });
    });
    expect(result.current).toBe(false);
  });
});

describe('useIsDesktop', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query === breakpoints.md,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
  });

  it('uses md breakpoint', () => {
    const { result } = renderHook(() => useIsDesktop());
    expect(result.current).toBe(true);
  });
});

describe('breakpoints', () => {
  it('exports correct breakpoint values', () => {
    expect(breakpoints.sm).toBe('(min-width: 640px)');
    expect(breakpoints.md).toBe('(min-width: 768px)');
    expect(breakpoints.lg).toBe('(min-width: 1024px)');
    expect(breakpoints.xl).toBe('(min-width: 1280px)');
    expect(breakpoints['2xl']).toBe('(min-width: 1536px)');
  });
});
