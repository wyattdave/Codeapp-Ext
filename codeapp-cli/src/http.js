import { randomUUID } from 'node:crypto';

const MS_CLIENT_REQUESTID = 'x-ms-client-request-id';

// Implements the IHttpClient contract @microsoft/power-apps-actions expects:
//   get/post/patch/put(url, { authResource?, body?, headers?, responseType? })
//   -> { data, status, headers }
export class CodeAppHttpClient {
  _auth;

  constructor(authProvider) {
    this._auth = authProvider;
  }

  get(url, config) {
    return this._send(url, 'GET', config);
  }
  post(url, config) {
    return this._send(url, 'POST', config);
  }
  patch(url, config) {
    return this._send(url, 'PATCH', config);
  }
  put(url, config) {
    return this._send(url, 'PUT', config);
  }
  delete(url, config) {
    return this._send(url, 'DELETE', config);
  }

  async _send(url, method, config) {
    const headers = { ...(config?.headers || {}) };
    if (config?.authResource) {
      const token = await this._auth.getAccessTokenForResource(config.authResource);
      headers.Authorization = `Bearer ${token}`;
    }
    if (!headers['Content-Type'] && config?.body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    headers[MS_CLIENT_REQUESTID] = randomUUID();

    let body;
    if (config?.body !== undefined) {
      const isJson = (headers['Content-Type'] || '').includes('application/json');
      body = typeof config.body === 'string' && !isJson ? config.body : JSON.stringify(config.body);
    }

    const res = await fetch(url, { method, headers, body });
    if (!res.ok) {
      const text = await safeReadText(res);
      throw new Error(`HTTP ${res.status} ${method} ${url}${text ? `: ${text}` : ''}`);
    }

    let data;
    if (config?.responseType === 'text') {
      data = await res.text();
    } else {
      const text = await safeReadText(res);
      const ct = res.headers.get('content-type') || '';
      if (!text || !text.trim()) {
        data = null;
      } else if (ct.includes('application/json')) {
        try {
          data = JSON.parse(text);
        } catch (e) {
          throw new Error(`Failed to parse JSON response from ${url}: ${e.message}`);
        }
      } else {
        data = text;
      }
    }

    const outHeaders = {};
    res.headers.forEach((v, k) => {
      outHeaders[k] = v;
    });
    return { data, status: res.status, headers: outHeaders };
  }
}

async function safeReadText(res) {
  try {
    return await res.text();
  } catch {
    return '';
  }
}
