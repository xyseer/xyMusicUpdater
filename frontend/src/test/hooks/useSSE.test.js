import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSSE } from '../../hooks/useSSE.js'

class MockEventSource {
  constructor(url) {
    this.url = url
    this.onopen = null
    this.onmessage = null
    this.onerror = null
    this.listeners = {}
    this.closed = false
    MockEventSource.instances.push(this)
  }
  addEventListener(event, handler) {
    this.listeners[event] = handler
  }
  close() {
    this.closed = true
  }
}
MockEventSource.instances = []

describe('useSSE hook', () => {
  beforeEach(() => {
    MockEventSource.instances = []
    global.EventSource = MockEventSource
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('does not open EventSource when user is null', () => {
    renderHook(() => useSSE(null, () => {}))
    expect(MockEventSource.instances.length).toBe(0)
  })

  it('opens EventSource when user is provided', () => {
    renderHook(() => useSSE('admin', () => {}))
    expect(MockEventSource.instances.length).toBe(1)
    expect(MockEventSource.instances[0].url).toBe('/api/events/')
  })

  it('sets isLive true on open event', () => {
    const { result } = renderHook(() => useSSE('admin', () => {}))
    act(() => {
      MockEventSource.instances[0].onopen?.()
    })
    expect(result.current.isLive).toBe(true)
  })

  it('adds entry on message with message field', () => {
    const { result } = renderHook(() => useSSE('admin', () => {}))
    act(() => {
      MockEventSource.instances[0].onmessage?.({
        data: JSON.stringify({ message: 'Downloaded: Song.mp3', type: 'log', level: 'info' })
      })
    })
    expect(result.current.entries.length).toBe(1)
    expect(result.current.entries[0].message).toBe('Downloaded: Song.mp3')
  })

  it('ignores messages without a message field', () => {
    const { result } = renderHook(() => useSSE('admin', () => {}))
    act(() => {
      MockEventSource.instances[0].onmessage?.({
        data: JSON.stringify({ type: 'ping' })
      })
    })
    expect(result.current.entries.length).toBe(0)
  })

  it('caps entries at 100', () => {
    const { result } = renderHook(() => useSSE('admin', () => {}))
    act(() => {
      for (let i = 0; i < 110; i++) {
        MockEventSource.instances[0].onmessage?.({
          data: JSON.stringify({ message: `msg${i}`, type: 'log' })
        })
      }
    })
    expect(result.current.entries.length).toBe(100)
  })

  it('sets isLive false on error', () => {
    const { result } = renderHook(() => useSSE('admin', () => {}))
    act(() => {
      MockEventSource.instances[0].onopen?.()
    })
    expect(result.current.isLive).toBe(true)
    act(() => {
      MockEventSource.instances[0].onerror?.()
    })
    expect(result.current.isLive).toBe(false)
  })

  it('retries after error once delay elapses', () => {
    renderHook(() => useSSE('admin', () => {}))
    expect(MockEventSource.instances.length).toBe(1)
    act(() => {
      MockEventSource.instances[0].onerror?.()
      vi.advanceTimersByTime(16000) // first retry delay is ≤15 000 ms
    })
    expect(MockEventSource.instances.length).toBe(2)
  })

  it('calls onPermanentFailure after MAX_RETRIES (8) retries', () => {
    const onFail = vi.fn()
    renderHook(() => useSSE('admin', onFail))
    act(() => {
      // 8 errors → 8 retries; 9th error → permanent failure
      for (let i = 0; i < 9; i++) {
        const last = MockEventSource.instances[MockEventSource.instances.length - 1]
        last.onerror?.()
        vi.advanceTimersByTime(16000) // advance past the longest possible retry delay
      }
    })
    expect(onFail).toHaveBeenCalledTimes(1)
  })

  it('closes EventSource on unmount', () => {
    const { unmount } = renderHook(() => useSSE('admin', () => {}))
    const es = MockEventSource.instances[0]
    unmount()
    expect(es.closed).toBe(true)
  })

  it('resets and reconnects when user changes from null to value', () => {
    const { rerender } = renderHook(({ user }) => useSSE(user, () => {}), {
      initialProps: { user: null }
    })
    expect(MockEventSource.instances.length).toBe(0)
    rerender({ user: 'admin' })
    expect(MockEventSource.instances.length).toBe(1)
  })

  it('ping listener resets isLive and retry count', () => {
    const { result } = renderHook(() => useSSE('admin', () => {}))
    const es = MockEventSource.instances[0]
    act(() => {
      es.listeners['ping']?.()
    })
    expect(result.current.isLive).toBe(true)
  })
})
