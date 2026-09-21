# oo-offline

DocsAPI **同页直挂** SDK（无 `onlyoffice.html` 外壳 iframe）。静态资源仍来自 `OnlyofficePersonal-build-output/`。

## 用法

```ts
import { createEditor, bufferToBlobUrl } from 'oo-offline'

const url = bufferToBlobUrl(arrayBuffer, 'docx')
const editor = await createEditor({
  container: document.getElementById('host')!,
  baseUrl: '/',
  document: { url, fileType: 'docx', title: 'demo.docx' },
  onDocumentReady: () => console.log('ready')
})

const { buffer } = await editor.save('docx')
editor.destroy()
URL.revokeObjectURL(url)
```

React：

```tsx
import { OnlyOfficeEditor, type OnlyOfficeEditorHandle } from 'oo-offline/react'

const ref = useRef<OnlyOfficeEditorHandle>(null)
<OnlyOfficeEditor
  ref={ref}
  baseUrl="/"
  document={{ buffer: file, fileType: 'docx', title: file.name }}
/>
```

## 约束

- `baseUrl` 须与页面同源，指向产物根（内含 `vendor/`；本 demo 为 `/`，对应 `public/`）。
- 打开文档只用 blob / http(s) URL（源码无 `openDocument({buffer})`）。
- 保存依赖编辑器帧内对 `DownloadFileFromBytes` 的 hook，回传 `onlyoffice-file-stream`。
- `api.js` 内部仍会创建一层编辑器 iframe（上游架构）。
