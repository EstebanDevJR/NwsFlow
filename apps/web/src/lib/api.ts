const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: any;
  headers?: Record<string, string>;
}

class ApiClient {
  private token: string | null = null;

  setToken(token: string | null) {
    this.token = token;
    if (token) {
      sessionStorage.setItem('accessToken', token);
    } else {
      sessionStorage.removeItem('accessToken');
    }
  }

  getToken(): string | null {
    if (!this.token) {
      this.token = sessionStorage.getItem('accessToken');
    }
    return this.token;
  }

  clearToken() {
    this.token = null;
    sessionStorage.removeItem('accessToken');
  }

  async request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    const { method = 'GET', body, headers = {} } = options;

    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    if (body && !(body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }

    const config: RequestInit = {
      method,
      credentials: 'include',
      headers: {
        ...headers,
      },
    };

    if (body) {
      if (body instanceof FormData) {
        config.body = body;
      } else {
        config.body = JSON.stringify(body);
      }
    }

    const response = await fetch(`${API_URL}${endpoint}`, config);

    /** Login/register 401 must show the server message, not refresh+redirect (would reload and hide errors). */
    const isPublicAuthFailure =
      response.status === 401 &&
      (endpoint === '/auth/login' || endpoint === '/auth/register');

    if (response.status === 401 && !isPublicAuthFailure) {
      const refreshed = await this.refreshToken();
      if (refreshed) {
        return this.request<T>(endpoint, options);
      }
      this.clearToken();
      window.location.href = '/login';
      throw new Error('Unauthorized');
    }

    if (!response.ok) {
      const error = (await response.json().catch(() => ({ error: 'Request failed' }))) as {
        error?: string;
        message?: string;
        details?: Array<{ path?: string; message?: string }>;
      };
      if (
        response.status === 400 &&
        Array.isArray(error.details) &&
        error.details.length > 0
      ) {
        const detailMsg = error.details
          .map((d) => {
            const p = d.path?.length ? `${d.path}: ` : '';
            return `${p}${d.message ?? ''}`;
          })
          .filter(Boolean)
          .join(' · ');
        throw new Error(detailMsg || error.error || 'Validation failed');
      }
      const msg =
        typeof error.error === 'string'
          ? error.error
          : typeof error.message === 'string'
            ? error.message
            : 'Request failed';
      throw new Error(msg);
    }

    if (response.headers.get('Content-Type')?.includes('application/json')) {
      return response.json();
    }

    return response as T;
  }

  async refreshToken(): Promise<boolean> {
    try {
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!res.ok) return false;

      const data = await res.json();
      this.setToken(data.accessToken);
      return true;
    } catch {
      return false;
    }
  }

  get<T>(endpoint: string) {
    return this.request<T>(endpoint);
  }

  post<T>(endpoint: string, body?: any, headers?: Record<string, string>) {
    return this.request<T>(endpoint, { method: 'POST', body, headers });
  }

  put<T>(endpoint: string, body?: any, headers?: Record<string, string>) {
    return this.request<T>(endpoint, { method: 'PUT', body, headers });
  }

  patch<T>(endpoint: string, body?: any, headers?: Record<string, string>) {
    return this.request<T>(endpoint, { method: 'PATCH', body, headers });
  }

  delete<T>(endpoint: string) {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }

  /** Descarga binaria (p. ej. PDF) con auth; usa `Content-Disposition` si viene en la respuesta. */
  async downloadBlob(endpoint: string, fallbackFilename: string) {
    const token = this.getToken();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const response = await fetch(`${API_URL}${endpoint}`, {
      method: 'GET',
      credentials: 'include',
      headers,
    });

    if (response.status === 401) {
      const refreshed = await this.refreshToken();
      if (refreshed) return this.downloadBlob(endpoint, fallbackFilename);
      this.clearToken();
      window.location.href = '/login';
      throw new Error('Unauthorized');
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(error.error || 'Request failed');
    }

    const blob = await response.blob();
    const cd = response.headers.get('Content-Disposition');
    let filename = fallbackFilename;
    const m =
      cd?.match(/filename\*=UTF-8''([^;\n]+)/i) ||
      cd?.match(/filename="([^"]+)"/i) ||
      cd?.match(/filename=([^;\n]+)/i);
    if (m) {
      try {
        filename = decodeURIComponent(m[1].trim().replace(/^["']|["']$/g, ''));
      } catch {
        filename = m[1].trim();
      }
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }
}

export const api = new ApiClient();
