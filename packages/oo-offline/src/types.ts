export type DocumentType = 'word' | 'cell' | 'slide' | 'pdf'

export interface OfficeDocumentInput {
  /** blob: / http(s): / data:；省略则 Offline.js 内联空白文档（勿传纯文件名占位） */
  url?: string
  fileType: string
  title?: string
  key?: string
  /** PDF：离线必须显式 false，否则 api.js 会走 common 加载器 */
  isForm?: boolean
}

export interface CreateEditorOptions {
  /** 挂载点：DOM 节点或已有元素 id */
  container: HTMLElement | string
  /** 静态产物根，如 `/`（含 vendor/） */
  baseUrl: string
  document: OfficeDocumentInput
  lang?: string
  mode?: 'edit' | 'view'
  user?: { id?: string; name?: string }
  width?: string
  height?: string
  onReady?: () => void
  onDocumentReady?: () => void
  onError?: (error: Error) => void
  onStateChange?: (modified: boolean) => void
  onRequestClose?: () => void
  onMetaChange?: (title: string) => void
}

export interface SaveResult {
  buffer: ArrayBuffer
  fileName: string
  fileType: string
}

export interface OfficeEditor {
  save(format?: string): Promise<SaveResult>
  destroy(): void
  getDocEditor(): unknown
}

declare global {
  interface Window {
    DocsAPI?: {
      DocEditor: new (id: string, config: Record<string, unknown>) => {
        destroyEditor: () => void
        downloadAs: (format?: string) => void
        setMetaData?: (meta: { title: string }) => void
      }
    }
    OO_FILE_STREAM_ONLY?: boolean
  }
}
