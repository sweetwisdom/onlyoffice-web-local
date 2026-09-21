# office-web-local（集成说明备份）

可独立拆出的 Vite + React 展示台：本机目录工作区 + **同页 DocsAPI 直挂**编辑器（无 `onlyoffice.html` 外壳）。

离线静态产物直接放在 `public/`（含 `vendor/`），`baseUrl` 用 Vite `import.meta.env.BASE_URL`（`base: './'`）。产品介绍见 [README.md](./README.md) / [readme.zh.md](./readme.zh.md)。

## 目录结构

```
demo/
├── packages/oo-offline/   # 本地 SDK：createEditor / OnlyOfficeEditor
├── src/
│   ├── HomePage.tsx       # 首页：新建 / 打开 / 本机文件夹
│   ├── EditorPage.tsx     # /editor：createEditor 直挂
│   ├── fs/workspace.ts    # File System Access + IDB 句柄
│   └── …
├── public/                # 离线静态产物（vendor/ 等，不入 git）
├── Dockerfile             # nginx 打包
└── package.json           # "oo-offline": "file:./packages/oo-offline"
```

## 快速开始

### 1. 准备静态产物

在离线重建工程根目录构建后，将 `OnlyofficePersonal-build-output/` 内容拷入 `demo/public/`（需含 `vendor/`）。

### 2. 安装并开发

```bash
cd demo
npm install
npm run dev
```

浏览器打开 http://127.0.0.1:5173/ 。

| 命令 | 说明 |
|------|------|
| `npm run dev` | 开发服 `127.0.0.1:5173` |
| `npm run build` | 生产构建 |
| `npm run preview` | 预览构建结果 |

## 嵌入 SDK

```ts
import { createEditor, bufferToBlobUrl } from 'oo-offline'

const url = bufferToBlobUrl(buf, 'docx')
const editor = await createEditor({
  container: el,
  baseUrl: './',
  document: { url, fileType: 'docx', title: 'a.docx', key: `doc-${Date.now()}` },
  lang: 'zh-CN'
})
const { buffer } = await editor.save('docx')
editor.destroy()
URL.revokeObjectURL(url)
```

- `baseUrl` 须同源，指向含 `vendor/` 的产物根（本 demo 为 Vite `BASE_URL`，对应 `public/`）。
- 打开文档用 `blob:` / `http(s):`；无 url 时 Offline 内联空白文档。
