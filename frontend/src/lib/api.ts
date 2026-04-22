const API_BASE = process.env.NEXT_PUBLIC_API_URL || "/api/v1";

interface ApiError {
  code: number;
  message: string;
  data?: unknown;
}

class ApiClient {
  private baseUrl: string;
  private token: string | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
    if (typeof window !== "undefined") {
      this.token = localStorage.getItem("mnemo_token");
    }
  }

  setToken(token: string | null) {
    this.token = token;
    if (typeof window !== "undefined") {
      if (token) {
        localStorage.setItem("mnemo_token", token);
      } else {
        localStorage.removeItem("mnemo_token");
      }
    }
  }

  getToken() {
    return this.token;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    retryCount = 0
  ): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...((options.headers as Record<string, string>) || {}),
    };

    if (this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({
          code: response.status,
          message: "请求失败",
        }));

        // Token expired - redirect to login
        if (response.status === 401) {
          this.setToken(null);
          if (typeof window !== "undefined") {
            window.location.href = "/login";
          }
          throw new ApiErrorClass(errorBody.code || 401, errorBody.message || "认证已过期");
        }

        // Server error - retry once
        if (response.status >= 500 && retryCount < 1) {
          await new Promise((r) => setTimeout(r, 1000));
          return this.request<T>(endpoint, options, retryCount + 1);
        }

        throw new ApiErrorClass(
          errorBody.code || response.status,
          errorBody.message || `HTTP ${response.status}`
        );
      }

      const data = await response.json();

      // Handle unified response format: { code, message, data }
      if (data && typeof data === "object" && "code" in data) {
        if (data.code !== 0) {
          throw new ApiErrorClass(data.code, data.message);
        }
        return data.data as T;
      }

      return data as T;
    } catch (error) {
      clearTimeout(timeout);

      if (error instanceof ApiErrorClass) {
        throw error;
      }

      if (error instanceof DOMException && error.name === "AbortError") {
        throw new ApiErrorClass(0, "请求超时，请检查网络连接");
      }

      if (error instanceof TypeError && error.message.includes("fetch")) {
        throw new ApiErrorClass(0, "网络连接失败，请检查网络");
      }

      throw new ApiErrorClass(0, "未知错误");
    }
  }

  async get<T>(endpoint: string) {
    return this.request<T>(endpoint);
  }

  async post<T>(endpoint: string, data?: unknown) {
    return this.request<T>(endpoint, {
      method: "POST",
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async postForm<T>(endpoint: string, formData: FormData) {
    const headers: Record<string, string> = {};
    if (this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);
    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method: "POST",
        headers,
        body: formData,
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({ code: response.status, message: "请求失败" }));
        if (response.status === 401) {
          this.setToken(null);
          if (typeof window !== "undefined") window.location.href = "/login";
          throw new ApiErrorClass(401, "认证已过期");
        }
        throw new ApiErrorClass(errorBody.code || response.status, errorBody.message || "请求失败");
      }
      const result = await response.json();
      return (result.data ?? result) as T;
    } catch (error) {
      clearTimeout(timeout);
      if (error instanceof ApiErrorClass) throw error;
      throw new ApiErrorClass(0, "网络错误");
    }
  }

  async put<T>(endpoint: string, data?: unknown) {
    return this.request<T>(endpoint, {
      method: "PUT",
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async delete<T>(endpoint: string) {
    return this.request<T>(endpoint, { method: "DELETE" });
  }
}

class ApiErrorClass extends Error {
  code: number;
  constructor(code: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.code = code;
  }
}

export type { ApiError };
export { ApiErrorClass };
export const api = new ApiClient(API_BASE);
export default api;
