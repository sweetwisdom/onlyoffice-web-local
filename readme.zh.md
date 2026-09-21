# office-web-local

基于only-office的纯本地项目，支持本地`打开、编辑`office文档

[live-demo🪄](https://sweetwisdom.github.io/onlyoffice-web-local/)


[English](README.md) | [中文](readme.zh.md) | [更新日志](CHANGELOG.md)


基于 OnlyOffice 的本地网页文档编辑器，让您直接在浏览器中编辑文档，无需服务器端处理，保护您的隐私安全。

## ✨ 主要特性

- 🔒 **隐私优先**: 所有文档处理都在浏览器本地进行，不上传到任何服务器
- 📝 **多格式支持**: 支持 DOCX、XLSX、PPTX 等多种文档格式
- ⚡ **实时编辑**: 提供流畅的实时文档编辑体验
- 🚀 **无需部署**: 纯前端实现，无需服务器端处理
- 🎯 **即开即用**: 打开网页即可开始编辑文档



## 📄 打开远程文件

### 功能说明

通过路由参数自动下载并打开远程 Office 文件（如 `.docx`、`.pptx` 等），并将其转换为 `File` 对象供后续使用（如预览或编辑）。

### 使用方法

页面地址需包含以下参数：

* `url`（必填）：远程文件地址
* `filename`（可选）：文件名，如果未提供将尝试自动解析

示例：
[00.xlsx](https://sweetwisdom.github.io/onlyoffice-web-local/#/?url=https://sweetwisdom.github.io/react-filePreview/filePreview/00.xlsx)

```
?filename=00.pptx&url=https://example.com/files/00.pptx
```

### 文件名获取优先级

1. 路由参数 `filename`
2. 从 `url` 中解析
3. 从响应头 `Content-Disposition` 提取

若无法获取文件名，将终止操作并提示错误。



![打开远程文件](.imgs/image-20260921092719591.png)

## 📚 格式支持与功能展示

| 功能 | 支持格式 | 预览 |
| --- | --- | --- |
| Word 编辑 | DOCX | <img src=".imgs/image-20260921092749217.png" alt="Word 编辑器" width="360" /> |
| 表格编辑 | XLSX | <img src=".imgs/image-20260921092808205.png" alt="Excel 编辑器" width="360" /> |
| 演示文稿编辑 | PPTX | <img src=".imgs/image-20260921092826958.png" alt="PPT 编辑器" width="360" /> |
| PDF 查看 | PDF | <img src=".imgs/image-20260921092912651.png" alt="PDF 查看器" width="360" /> |
| 文档导出 | DOCX、XLSX、PPTX、PDF | <img src="./.imgs/image-20250524104854846.png" alt="文档导出" width="360" /> |

## 开发支持

```sh
pnpm install
```

### Compile and Hot-Reload for Development

```sh
pnpm dev
```

### Type-Check, Compile and Minify for Production

```sh
pnpm build
```

## Docker 支持

自定义镜像名为 vue-local-office 的镜像（请注意下面命令末尾有一个点 . 表示使用当前路径下的 Dockerfile 文件，可根据实际情况指定路径）

docker build -t vue-local-office .

端口映射并启动 docker 容器（8080:80：表示在容器中使用 80 端口，并将该端口转发到主机的 8080 端口；local-office：表示自定义容器名；vue-local-office：表示自定义镜像名）

docker run -dp 8080:80 --name local-office vue-local-office

操作完上面两个命令后，在浏览器打开 http://localhost:8080 即可预览

## GitHub Actions（Release / Pages）

工作流已放在 `.github/workflows/`（源自 onlyoffice-web-local，已改为 npm）：

| 工作流 | 触发 | 行为 |
|--------|------|------|
| `release.yml` | 推送 `v*` tag，或手动 `workflow_dispatch` | `npm run build` → 上传 `html.zip` 到 Release |
| `deploy.yml` | 推送 `main` | 部署 GitHub Pages + 上传 `html.zip` Release |

**注意**：完整离线产物在 `public/vendor`（约 700MB），直接存储在 Git 中，因此克隆与首次部署的数据量较大；单附件 Release 勿超过约 2GiB。

## 技术原理

使用x2t-wam替代onlyofice服务

使用only-office websdk  实现编辑(来自se-office)

## 参考

[Qihoo360/se-office: se-office扩展，提供基于开放标准的全功能办公生产力套件，基于浏览器预览和编辑office。](https://github.com/Qihoo360/se-office)

[cryptpad/onlyoffice-x2t-wasm: CryptPad WebAssembly file conversion tool](https://github.com/cryptpad/onlyoffice-x2t-wasm)
