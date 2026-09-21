/** 同页全屏覆盖层打开 /onlyoffice.html（不依赖弹窗） */

const CELL = new Set(['xls', 'xlsx', 'xlsm', 'ods', 'csv'])
const SLIDE = new Set(['ppt', 'pptx', 'odp', 'pps', 'ppsx'])
const PDF = new Set(['pdf', 'oxps', 'xps', 'djvu'])

function documentTypeOf(fileType: string): string {
  const ext = String(fileType || '').toLowerCase()
  if (CELL.has(ext)) return 'cell'
  if (SLIDE.has(ext)) return 'slide'
  if (PDF.has(ext)) return 'pdf'
  return 'word'
}

export interface OpenOverlayOptions {
  title: string
  fileType: string
  buffer?: ArrayBuffer | null
  mount: HTMLElement
  onReady?: () => void
  onSaved?: (buffer: ArrayBuffer, meta: { fileName: string; fileType: string }) => void | Promise<void>
  onStateChange?: (modified: boolean) => void
  onRequestClose?: () => void
  onError?: (message: string) => void
}

export interface EditorOverlaySession {
  title: string
  fileType: string
  frame: HTMLIFrameElement
  requestSave: (format?: string) => Promise<ArrayBuffer>
  destroy: () => void
}

let saveSeq = 0

export function openEditorOverlay(options: OpenOverlayOptions): EditorOverlaySession {
  const mount = options.mount
  mount.innerHTML = ''

  const frame = document.createElement('iframe')
  frame.src = '/onlyoffice.html'
  frame.title = options.title
  frame.setAttribute('allow', 'clipboard-read; clipboard-write; fullscreen')
  mount.appendChild(frame)

  let blobUrl = ''
  let disposed = false
  const pending = new Map<
    string,
    { resolve: (buf: ArrayBuffer) => void; reject: (err: Error) => void; timer: number }
  >()

  const empty = !options.buffer || options.buffer.byteLength === 0
  if (!empty && options.buffer) {
    blobUrl = URL.createObjectURL(
      new Blob([options.buffer], { type: 'application/octet-stream' })
    )
  }

  const fileType = String(options.fileType || 'docx').toLowerCase()
  const documentType = documentTypeOf(fileType)
  const docConfig: Record<string, unknown> = {
    documentType,
    document: {
      url: blobUrl || undefined,
      title: options.title,
      fileType,
      key: `demo-${Date.now()}`,
      permissions: { edit: true, download: true, print: true },
      ...(documentType === 'pdf' ? { isForm: false } : {})
    },
    editorConfig: {
      mode: 'edit',
      lang: 'zh-CN',
      user: { id: 'local-user', name: '本地用户' }
    },
    height: '100%',
    width: '100%',
    streamFallback: 'autosave'
  }

  function pushConfig() {
    if (!frame.contentWindow) return
    try {
      frame.contentWindow.postMessage({ type: 'onlyoffice-config', docConfig }, '*')
    } catch (e) {
      options.onError?.(String((e as Error)?.message || e))
    }
  }

  function onMessage(event: MessageEvent) {
    if (disposed || event.source !== frame.contentWindow) return
    const d = event.data
    if (!d || typeof d !== 'object') return

    switch (d.type) {
      case 'onlyoffice-ready':
        pushConfig()
        options.onReady?.()
        break
      case 'onlyoffice-open-error':
        options.onError?.(String(d.error || '打开失败'))
        break
      case 'onlyoffice-document-ready':
        options.onReady?.()
        break
      case 'onlyoffice-state-change':
        options.onStateChange?.(!!d.modified)
        break
      case 'onlyoffice-request-close':
        options.onRequestClose?.()
        break
      case 'onlyoffice-saved': {
        const req = d.requestId && pending.get(d.requestId)
        if (req) {
          pending.delete(d.requestId)
          window.clearTimeout(req.timer)
          if (d.ok && d.buffer) req.resolve(d.buffer as ArrayBuffer)
          else req.reject(new Error(String(d.error || '保存失败')))
        } else if (d.ok && d.buffer) {
          void Promise.resolve(
            options.onSaved?.(d.buffer as ArrayBuffer, {
              fileName: String(d.fileName || options.title),
              fileType: String(d.fileType || fileType)
            })
          ).catch((e) => options.onError?.(String((e as Error)?.message || e)))
        }
        break
      }
      case 'onlyoffice-saveas':
        if (d.ok && d.buffer) {
          void Promise.resolve(
            options.onSaved?.(d.buffer as ArrayBuffer, {
              fileName: String(d.fileName || options.title),
              fileType: String(d.fileType || fileType)
            })
          )
        }
        break
      default:
        break
    }
  }

  window.addEventListener('message', onMessage)

  function destroy() {
    if (disposed) return
    disposed = true
    window.removeEventListener('message', onMessage)
    for (const [, p] of pending) {
      window.clearTimeout(p.timer)
      p.reject(new Error('编辑器已关闭'))
    }
    pending.clear()
    if (blobUrl) {
      try {
        URL.revokeObjectURL(blobUrl)
      } catch {
        /* ignore */
      }
      blobUrl = ''
    }
    mount.innerHTML = ''
  }

  return {
    title: options.title,
    fileType,
    frame,
    requestSave(format?: string) {
      const requestId = `save-${++saveSeq}`
      return new Promise((resolve, reject) => {
        if (!frame.contentWindow) {
          reject(new Error('编辑器未就绪'))
          return
        }
        const timer = window.setTimeout(() => {
          pending.delete(requestId)
          reject(new Error('保存超时'))
        }, 60000)
        pending.set(requestId, { resolve, reject, timer })
        try {
          frame.contentWindow.postMessage(
            { type: 'onlyoffice-save', requestId, format: format || fileType },
            '*'
          )
        } catch (e) {
          pending.delete(requestId)
          window.clearTimeout(timer)
          reject(e instanceof Error ? e : new Error(String(e)))
        }
      })
    },
    destroy
  }
}
