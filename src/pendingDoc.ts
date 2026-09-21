/** SPA 路由间传递待打开文档（同页跳转，不依赖弹窗） */
export type PendingDoc = {
  title: string
  fileType: string
  buffer?: ArrayBuffer | null
  handle?: FileSystemFileHandle
  ephemeral?: boolean
}

let pending: PendingDoc | null = null

export function setPendingDoc(doc: PendingDoc | null) {
  pending = doc
}

export function getPendingDoc(): PendingDoc | null {
  return pending
}

export function clearPendingDoc() {
  pending = null
}

/** @deprecated 用 getPendingDoc + clearPendingDoc，避免 StrictMode 双调用丢文档 */
export function takePendingDoc(): PendingDoc | null {
  const doc = pending
  pending = null
  return doc
}
