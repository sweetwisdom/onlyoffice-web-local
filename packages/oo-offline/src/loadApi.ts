const loadedByBase = new Map<string, Promise<void>>()

function normalizeBaseUrl(baseUrl: string): string {
  if (!baseUrl) return '/'
  return baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
}

function apiScriptUrl(baseUrl: string): string {
  return `${normalizeBaseUrl(baseUrl)}vendor/web-apps/apps/api/documents/api.js`
}

/** 按 baseUrl 幂等注入 DocsAPI（api.js） */
export function loadApi(baseUrl: string): Promise<void> {
  const base = normalizeBaseUrl(baseUrl)
  if (typeof window !== 'undefined' && window.DocsAPI) {
    return Promise.resolve()
  }
  const existing = loadedByBase.get(base)
  if (existing) return existing

  const promise = new Promise<void>((resolve, reject) => {
    const src = apiScriptUrl(base)
    const found = document.querySelector<HTMLScriptElement>(`script[data-oo-api="${src}"]`)
    if (found && window.DocsAPI) {
      resolve()
      return
    }
    const script = found || document.createElement('script')
    script.src = src
    script.async = true
    script.dataset.ooApi = src
    script.onload = () => {
      if (!window.DocsAPI) {
        reject(new Error('DocsAPI 未挂载，请检查 baseUrl 与产物路径'))
        return
      }
      resolve()
    }
    script.onerror = () => reject(new Error(`加载 api.js 失败: ${src}`))
    if (!found) document.head.appendChild(script)
  })

  loadedByBase.set(base, promise)
  return promise
}

export { normalizeBaseUrl, apiScriptUrl }
