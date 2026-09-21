import type { SaveResult } from './types'

const STREAM_TYPE = 'onlyoffice-file-stream'
const SAVE_TIMEOUT_MS = 60000

type DownloadFn = (data: ArrayBuffer | Uint8Array, fileName: string, mime?: string) => void

function findEditorIframe(container: HTMLElement): HTMLIFrameElement | null {
  return container.querySelector('iframe')
}

function setStreamFlagOnFrame(frame: HTMLIFrameElement | null, value: boolean): void {
  if (value) window.OO_FILE_STREAM_ONLY = true
  else delete window.OO_FILE_STREAM_ONLY
  if (!frame || !frame.contentWindow) return
  try {
    if (value) frame.contentWindow.OO_FILE_STREAM_ONLY = true
    else delete frame.contentWindow.OO_FILE_STREAM_ONLY
  } catch {
    /* ignore cross-origin */
  }
}

/**
 * 离线产物里 _downloadAsFromLocal 直接走 DownloadFileFromBytes，不会发 file-stream。
 * 在编辑器帧内 hook：始终 postMessage；仅当 OO_FILE_STREAM_ONLY 时跳过浏览器下载
 *（供宿主 imperative save 使用）。平时不置位，以便文件菜单「下载为」正常落盘。
 */
function hookDownloadInFrame(frame: HTMLIFrameElement): boolean {
  try {
    const win = frame.contentWindow as Window & {
      AscCommon?: { DownloadFileFromBytes?: DownloadFn }
    }
    if (!win || !win.AscCommon || typeof win.AscCommon.DownloadFileFromBytes !== 'function') {
      return false
    }
    const original = win.AscCommon.DownloadFileFromBytes
    if ((original as DownloadFn & { __ooHooked?: boolean }).__ooHooked) return true

    const hooked: DownloadFn & { __ooHooked?: boolean } = function (data, fileName, mime) {
      let buffer: ArrayBuffer
      if (data instanceof ArrayBuffer) {
        buffer = data.slice(0)
      } else if (data && (data as Uint8Array).buffer) {
        const u8 = data as Uint8Array
        buffer = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength)
      } else {
        buffer = new Uint8Array(data as ArrayBufferView).buffer
      }
      const ext = String(fileName || '').split('.').pop() || ''
      const payload = {
        type: STREAM_TYPE,
        fileName,
        fileType: ext.toLowerCase(),
        buffer
      }
      try {
        win.parent.postMessage(payload, '*', [buffer])
      } catch {
        win.parent.postMessage({ ...payload, buffer: buffer.slice(0) }, '*')
      }
      // 仅宿主 save() 期间吞掉浏览器下载；文件菜单下载仍走 original
      if (win.OO_FILE_STREAM_ONLY === true || window.OO_FILE_STREAM_ONLY === true) {
        return
      }
      original.call(win.AscCommon, data, fileName, mime)
    }
    hooked.__ooHooked = true
    win.AscCommon.DownloadFileFromBytes = hooked
    return true
  } catch {
    return false
  }
}

/** 挂载后周期性尝试 hook；不永久打开 OO_FILE_STREAM_ONLY */
export function prepareSaveStream(container: HTMLElement): () => void {
  let attempts = 0
  const timer = window.setInterval(() => {
    attempts += 1
    const frame = findEditorIframe(container)
    if (frame) hookDownloadInFrame(frame)
    if (attempts > 50) window.clearInterval(timer)
  }, 200)

  return () => window.clearInterval(timer)
}

/** 宿主 imperative save 前打开流模式，结束后务必 close */
export function beginFileStreamCapture(container: HTMLElement): () => void {
  const frame = findEditorIframe(container)
  if (frame) hookDownloadInFrame(frame)
  setStreamFlagOnFrame(frame, true)
  return () => setStreamFlagOnFrame(findEditorIframe(container), false)
}

export function waitForFileStream(requestId: string, timeoutMs = SAVE_TIMEOUT_MS): Promise<SaveResult> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      window.removeEventListener('message', onMessage)
      reject(new Error(`保存超时（${timeoutMs}ms），未收到 ${STREAM_TYPE}`))
    }, timeoutMs)

    function onMessage(event: MessageEvent) {
      const data = event.data
      if (!data || data.type !== STREAM_TYPE) return
      if (!data.buffer) {
        window.clearTimeout(timer)
        window.removeEventListener('message', onMessage)
        reject(new Error('未获取到文件流'))
        return
      }
      window.clearTimeout(timer)
      window.removeEventListener('message', onMessage)
      resolve({
        buffer: data.buffer as ArrayBuffer,
        fileName: String(data.fileName || ''),
        fileType: String(data.fileType || '')
      })
    }

    window.addEventListener('message', onMessage)
  })
}
