# Steam Highlight Forge

自动从Steam游戏录制中提取并导出游戏高光片段的桌面应用。

## 功能特性

- 🎮 **支持多游戏**: 目前支持CS2，可扩展至其他Steam游戏
- ⚡ **智能识别**: 自动识别击杀、连杀、死亡等游戏事件
- 🎯 **精准提取**: 基于游戏回合和时间线精确提取高光片段
- 🔧 **灵活配置**: 可自定义缓冲时间、高光类型等参数
- 🎬 **时间线预览**: 可视化时间线，快速定位高光时刻
- 📦 **一键导出**: 批量导出高光视频片段

## 安装

### 从 Release 下载

前往 [Releases](../../releases) 页面下载对应平台的安装包：

- **Windows**: `.msi` 或 `.exe` 安装程序
- **macOS**: `.dmg` (Intel/Apple Silicon)
- **Linux**: `.deb` 或 `.AppImage`

### 前置要求

- FFmpeg (用于视频处理)

**Ubuntu/Debian:**
```bash
sudo apt install ffmpeg
```

**macOS:**
```bash
brew install ffmpeg
```

**Windows:**
从 [FFmpeg官网](https://ffmpeg.org/download.html) 下载并添加到PATH

## 本地开发

### 环境要求

- Node.js 18+
- Rust 1.77+
- 系统依赖 (Linux): `libwebkit2gtk-4.1-dev libgtk-3-dev libappindicator3-dev librsvg2-dev patchelf`

### 开发运行

```bash
cd app
npm install
cargo tauri dev
```

### 本地构建 (仅x64)

```bash
cd app
cargo tauri build
```

构建产物在 `app/src-tauri/target/release/bundle/` 目录下。

## 发布流程

使用 GitHub Actions 自动构建多平台安装包：

```bash
git tag v0.1.0
git push origin v0.1.0
```

推送 tag 后会自动触发 `.github/workflows/release.yml`，构建以下平台：

- Windows x64 (NSIS installer)
- macOS x64 + ARM64
- Linux x64 (deb + AppImage)

构建完成后会创建 Draft Release，确认后发布即可。

## 使用说明

1. 打开应用，点击 "Choose Recordings Folder" 选择 Steam 录制目录
   - 通常位于 `Steam/userdata/<userid>/gamerecordings/`
2. 应用会自动扫描并列出所有游戏录制会话
3. 选择一个会话，查看时间线和事件
4. 配置高光类型（击杀、连杀、死亡、炸弹）和缓冲时间
5. 点击 "Extract Highlights" 提取高光片段
6. 选择要导出的片段，点击 "Export Selected" 导出视频

## Steam 录制目录结构

```
gamerecordings/
├── timelines/
│   ├── timeline_73020260507_142732.json
│   └── ...
└── video/
    └── bg_730_20260506_120454/
        ├── init-stream0.m4s
        ├── chunk-stream0-*.m4s
        └── ...
```

## 扩展支持其他游戏

在 `app/src-tauri/src/highlights.rs` 中实现 `GameHighlightExtractor` trait，并在 `get_extractor()` 中注册。

参考 `CS2Extractor` 的实现。

## 许可证

MIT License
