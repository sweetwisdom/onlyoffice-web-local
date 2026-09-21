# Changelog

## [2.0.0] — 2026-09-21

### 引擎升级

本次将编辑器内核从旧版 se-office / 自带精简 SDK，升级为**从 ONLYOFFICE 官方源码重建的离线包**，对齐当前构建基准：

| 组件 | 基准 | 说明 |
|------|------|------|
| **sdkjs** | `72b0421`（`release/v9.4.0` → master） | 文档 / 表格 / 演示 / PDF 内核 |
| **web-apps** | `1323afd3` | 编辑器 UI；含 Offline 离线加载链路 |
| 参考对照 | ONLYOFFICE Personal **9.3.0.133** | 字体、x2t WASM、缩略图等运行时资源 |

相对 1.x（onlyoffice-web-local 旧栈），这是一次**内核大版本升级**：补丁化离线（`window.isOffline`、Offline.js、浏览器内 x2t），不再依赖 Document Server。

### 新增

- **`oo-offline` SDK**：同页 `DocsAPI.DocEditor` 直挂（`createEditor` / React `OnlyOfficeEditor`），无外层 `onlyoffice.html` 宿主 iframe
- **本机目录工作区**：File System Access API；句柄存 IndexedDB，文件字节读写本机磁盘
- **PDF 编辑**：新建 / 打开 / 另存为 PDF（离线 `_downloadAsFromLocal`）
- **Docker**：`Dockerfile` + nginx，产物目录 `html/`
- **GitHub Actions**：`release.yml`（tag / 手动）、`deploy.yml`（Pages + Release 附件 `html.zip`）

### 变更

- 打开文档：blob URL 或无 url 空白文档 → Offline.js + 产物内 x2t（不再应用层 `asc_openDocument({ buf })`）
- 保存：imperative `editor.save()` 走文件流 hook；文件菜单「下载为」走浏览器下载
- 静态资源：离线产物放在 `public/`（含 `vendor/`），Vite `base: './'`
- 产品名保持 **office-web-local**

### 修复

- 空白新建不再强制 `document.url`
- 文件菜单下载被 `OO_FILE_STREAM_ONLY` 误吞
- PDF 另存 `targetExt` 为空导致 x2t code 88
- `plugins.json` / `themes.json` 404 噪音（空配置占位）

### 已知问题 / 注意

- 完整 `public/vendor` 约 **700MB**，直接存储在 Git 中，克隆与首次部署的数据量较大
- 单附件 Release 勿超过约 2GiB；大包上传/Pages 可能较慢
- 字体与 x2t 仍来自 Personal 运行时，仅本地使用、勿随意分发

---

## [1.x] — 历史（onlyoffice-web-local）

基于 se-office WebSDK + 应用层 x2t-wasm：`convertDocument` → `asc_openDocument({ buf })`，`onSave` 再转回 Office 格式下载。详见原仓库 README。
