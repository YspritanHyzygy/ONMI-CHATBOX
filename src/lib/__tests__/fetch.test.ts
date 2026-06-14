import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function createLocalStorageMock() {
  const store = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      store.delete(key);
    }),
    clear: vi.fn(() => {
      store.clear();
    }),
  };
}

describe('fetchWithAuth', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('localStorage', createLocalStorageMock());
    vi.stubGlobal('window', {
      dispatchEvent: vi.fn(),
    });
    vi.stubGlobal('CustomEvent', class {
      type: string;

      constructor(type: string) {
        this.type = type;
      }
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('logs out globally when an authenticated request returns 401', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify({ success: false }), { status: 401 })
    );
    vi.stubGlobal('fetch', fetchMock);

    const { fetchWithAuth } = await import('../fetch');
    const { default: useAuthStore } = await import('../../store/authStore');

    useAuthStore.setState({
      user: {
        id: 'user-1',
        username: 'demo',
        created_at: '2026-06-11T00:00:00.000Z',
        updated_at: '2026-06-11T00:00:00.000Z',
      },
      token: 'stale-token',
      isAuthenticated: true,
      isLoading: false,
    });

    const response = await fetchWithAuth('/api/protected');

    expect(response.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledWith('/api/protected', expect.objectContaining({
      headers: expect.any(Headers),
    }));
    const fetchCall = fetchMock.mock.calls[0] as [RequestInfo | URL, RequestInit];
    const headers = fetchCall[1].headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer stale-token');
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().token).toBeNull();
    expect(window.dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'auth:unauthorized' }));
    expect(localStorage.removeItem).toHaveBeenCalledWith('conversations');
  });
});
