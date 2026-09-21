import { loadApi, normalizeBaseUrl } from './loadApi'
import { buildDocsConfig } from './normalize'
import { beginFileStreamCapture, prepareSaveStream, waitForFileStream } from './saveStream'
import type { CreateEditorOptions, OfficeEditor, SaveResult } from './types'

let editorSeq = 0

function resolveContainer(container: HTMLElement | string): HTMLElement {
  if (typeof container === 'string') {
    const el = document.getElementById(container)
    if (!el) throw new Error(`找不到容器 #${container}`)
    return el
  }
  return container
}

/**
 * 在任意 DOM 容器内直挂 DocsAPI（仅 api.js 内部编辑器 iframe，无 onlyoffice.html 外壳）。
 */
export async function createEditor(options: CreateEditorOptions): Promise<OfficeEditor> {
  const baseUrl = normalizeBaseUrl(options.baseUrl)
  await loadApi(baseUrl)

  if (!window.DocsAPI) {
    throw new Error('DocsAPI 不可用')
  }

  const host = resolveContainer(options.container)
  host.innerHTML = ''
  host.style.position = host.style.position || 'relative'

  const mountId = `oo-editor-${++editorSeq}`
  const mount = document.createElement('div')
  mount.id = mountId
  mount.style.width = '100%'
  mount.style.height = '100%'
  host.appendChild(mount)

  let docEditor: InstanceType<NonNullable<Window['DocsAPI']>['DocEditor']> | null = null
  let stopPrepare: (() => void) | null = null
  let saveChain: Promise<unknown> = Promise.resolve()
  const ownedBlobUrls: string[] = []

  const config = buildDocsConfig({
    document: options.document,
    lang: options.lang,
    mode: options.mode,
    user: options.user,
    width: options.width,
    height: options.height,
    events: {
      onAppReady: () => {
        options.onReady?.()
      },
      onDocumentReady: () => {
        stopPrepare = prepareSaveStream(host)
        options.onDocumentReady?.()
      },
      onError: (event: { data?: unknown }) => {
        options.onError?.(new Error(`编辑器错误: ${JSON.stringify(event && event.data)}`))
      },
      onDocumentStateChange: (event: { data?: boolean }) => {
        options.onStateChange?.(!!(event && event.data))
      },
      onRequestClose: () => {
        options.onRequestClose?.()
      },
      onMetaChange: (event: { data?: { title?: string } }) => {
        const title = event && event.data && event.data.title
        if (title) options.onMetaChange?.(title)
      },
      onDownloadAs: () => {
        /* 离线保存走 file-stream hook，忽略默认 URL 回调 */
      }
    }
  })

  docEditor = new window.DocsAPI.DocEditor(mountId, config as unknown as Record<string, unknown>)

  const editor: OfficeEditor = {
    getDocEditor() {
      return docEditor
    },
    async save(format?: string): Promise<SaveResult> {
      if (!docEditor) throw new Error('编辑器未就绪')
      const run = async (): Promise<SaveResult> => {
        const endCapture = beginFileStreamCapture(host)
        const pending = waitForFileStream(`save-${Date.now()}`)
        try {
          if (format) docEditor!.downloadAs(format)
          else docEditor!.downloadAs()
          return await pending
        } catch (err) {
          throw err instanceof Error ? err : new Error(String(err))
        } finally {
          endCapture()
        }
      }
      const result = saveChain.then(run, run)
      saveChain = result.then(
        () => undefined,
        () => undefined
      )
      return result
    },
    destroy() {
      stopPrepare?.()
      stopPrepare = null
      try {
        docEditor?.destroyEditor()
      } catch {
        /* ignore */
      }
      docEditor = null
      for (const url of ownedBlobUrls) {
        try {
          URL.revokeObjectURL(url)
        } catch {
          /* ignore */
        }
      }
      ownedBlobUrls.length = 0
      host.innerHTML = ''
    }
  }

  return editor
}

export type { CreateEditorOptions, OfficeEditor, SaveResult }
