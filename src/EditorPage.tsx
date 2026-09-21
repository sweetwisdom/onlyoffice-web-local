import { useEffect, useRef, useState } from 'react'
import {
  bufferToBlobUrl,
  createEditor,
  type OfficeEditor
} from 'oo-offline'
import { clearPendingDoc, getPendingDoc, type PendingDoc } from './pendingDoc'
import { writeFileBuffer } from './fs/workspace'
import { parseEditorQuery } from './route'

const BASE_URL = new URL('../', import.meta.url).href

function docFromPath(path: string): PendingDoc | null {
  const q = parseEditorQuery(path.includes('?') ? path.slice(path.indexOf('?')) : '')
  if (!q) return null
  return {
    title: q.isNew ? `新建文档.${q.fileType}` : `文档.${q.fileType}`,
    fileType: q.fileType,
    buffer: null,
    ephemeral: true
  }
}

/**
 * 同页 DocsAPI 直挂（对齐 onlyoffice-web-local DocumentHandler）：
 * new DocsAPI.DocEditor(divId, config)，不用 onlyoffice.html 外壳。
 */
export function EditorPage(props: { path: string; navigate: (to: string) => void }) {
  const { path, navigate } = props
  const mountRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<OfficeEditor | null>(null)
  const launchRef = useRef<PendingDoc | null>(null)
  const blobUrlRef = useRef<string | null>(null)

  const [doc, setDoc] = useState<PendingDoc | null>(null)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('正在加载编辑器…')
  const [modified, setModified] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!launchRef.current) {
      launchRef.current = getPendingDoc() || docFromPath(path)
    }
    const launch = launchRef.current
    if (!launch) {
      setError('没有待打开的文档，请从首页新建或打开文件')
      return
    }
    setDoc(launch)

    const mount = mountRef.current
    if (!mount) return

    let cancelled = false

    ;(async () => {
      try {
        let url: string | undefined
        if (launch.buffer && launch.buffer.byteLength > 0) {
          url = bufferToBlobUrl(launch.buffer, launch.fileType)
          blobUrlRef.current = url
        }

        const editor = await createEditor({
          container: mount,
          baseUrl: BASE_URL,
          document: {
            url,
            fileType: launch.fileType,
            title: launch.title,
            key: `demo-${Date.now()}`,
            isForm: launch.fileType === 'pdf' ? false : undefined
          },
          lang: 'zh-CN',
          onReady: () => {
            clearPendingDoc()
            setStatus('编辑器就绪')
          },
          onDocumentReady: () => setStatus('文档已打开'),
          onStateChange: setModified,
          onError: (err) => setError(err.message),
          onRequestClose: () => navigate('/')
        })

        if (cancelled) {
          editor.destroy()
          return
        }
        editorRef.current = editor
      } catch (e) {
        if (!cancelled) setError(String((e as Error)?.message || e))
      }
    })()

    return () => {
      cancelled = true
      editorRef.current?.destroy()
      editorRef.current = null
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current)
        blobUrlRef.current = null
      }
    }
  }, [path, navigate])

  async function onSave() {
    const editor = editorRef.current
    const active = doc
    if (!editor || !active) return
    setSaving(true)
    setError('')
    try {
      const result = await editor.save(active.fileType)
      if (active.handle) {
        await writeFileBuffer(active.handle, result.buffer)
        setStatus(`已写回本机：${active.title}`)
      } else {
        const a = document.createElement('a')
        a.href = URL.createObjectURL(new Blob([result.buffer]))
        a.download = active.title
        a.click()
        URL.revokeObjectURL(a.href)
        setStatus(`已下载 ${active.title}`)
      }
      setModified(false)
    } catch (e) {
      setError(`保存失败：${(e as Error)?.message || e}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="editor-page">
      <div className="editor-bar">
        <button type="button" className="btn ghost" onClick={() => navigate('/')}>
          ← 首页
        </button>
        <span className={`dot${modified ? ' on' : ''}`} />
        <span className="title">{doc?.title || '编辑器'}</span>
        <span className="bar-status">{status}</span>
        <button type="button" className="btn primary" disabled={saving || !doc} onClick={() => void onSave()}>
          {saving ? '保存中…' : '保存'}
        </button>
      </div>
      {error && <div className="banner warn editor-err">{error}</div>}
      <div className="editor-mount" ref={mountRef} />
    </div>
  )
}
