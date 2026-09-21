import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type CSSProperties
} from 'react'
import { createEditor } from '../createEditor'
import { bufferToBlobUrl, normalizeExtension } from '../normalize'
import type { OfficeDocumentInput, OfficeEditor, SaveResult } from '../types'

export interface OnlyOfficeEditorProps {
  baseUrl: string
  document: OfficeDocumentInput & {
    /** 若提供 buffer，SDK 会转成 blob URL 并在卸载时 revoke */
    buffer?: ArrayBuffer | Blob | File
  }
  lang?: string
  mode?: 'edit' | 'view'
  style?: CSSProperties
  className?: string
  onReady?: () => void
  onDocumentReady?: () => void
  onError?: (error: Error) => void
  onStateChange?: (modified: boolean) => void
  onRequestClose?: () => void
  onMetaChange?: (title: string) => void
}

export interface OnlyOfficeEditorHandle {
  save(format?: string): Promise<SaveResult>
  destroy(): void
  getEditor(): OfficeEditor | null
}

export const OnlyOfficeEditor = forwardRef<OnlyOfficeEditorHandle, OnlyOfficeEditorProps>(
  function OnlyOfficeEditor(props, ref) {
    const hostRef = useRef<HTMLDivElement>(null)
    const editorRef = useRef<OfficeEditor | null>(null)
    const blobUrlRef = useRef<string | null>(null)

    useImperativeHandle(ref, () => ({
      async save(format?: string) {
        if (!editorRef.current) throw new Error('编辑器未就绪')
        return editorRef.current.save(format)
      },
      destroy() {
        editorRef.current?.destroy()
        editorRef.current = null
      },
      getEditor() {
        return editorRef.current
      }
    }))

    useEffect(() => {
      const host = hostRef.current
      if (!host) return
      let cancelled = false

      async function mount() {
        if (blobUrlRef.current) {
          URL.revokeObjectURL(blobUrlRef.current)
          blobUrlRef.current = null
        }

        let url = props.document.url
        if (props.document.buffer) {
          url = bufferToBlobUrl(
            props.document.buffer,
            normalizeExtension(props.document.fileType)
          )
          blobUrlRef.current = url
        }

        try {
          const editor = await createEditor({
            container: host!,
            baseUrl: props.baseUrl,
            document: {
              url,
              fileType: props.document.fileType,
              title: props.document.title,
              key: props.document.key,
              isForm: props.document.isForm
            },
            lang: props.lang,
            mode: props.mode,
            onReady: props.onReady,
            onDocumentReady: props.onDocumentReady,
            onError: props.onError,
            onStateChange: props.onStateChange,
            onRequestClose: props.onRequestClose,
            onMetaChange: props.onMetaChange
          })
          if (cancelled) {
            editor.destroy()
            return
          }
          editorRef.current = editor
        } catch (err) {
          if (!cancelled) {
            props.onError?.(err instanceof Error ? err : new Error(String(err)))
          }
        }
      }

      void mount()

      return () => {
        cancelled = true
        editorRef.current?.destroy()
        editorRef.current = null
        if (blobUrlRef.current) {
          URL.revokeObjectURL(blobUrlRef.current)
          blobUrlRef.current = null
        }
      }
      // 文档身份变化时重建；回调用最新闭包即可
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
      props.baseUrl,
      props.document.url,
      props.document.fileType,
      props.document.title,
      props.document.key,
      props.document.buffer,
      props.lang,
      props.mode
    ])

    return (
      <div
        ref={hostRef}
        className={props.className}
        style={{ width: '100%', height: '100%', minHeight: 320, ...props.style }}
      />
    )
  }
)

export default OnlyOfficeEditor
