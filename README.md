# Steam Highlight Forge

自动从Steam游戏录制中提取并导出游戏高光片段的工具。

## 功能特性

- 🎮 **支持多游戏**: 目前支持CS2，可扩展至其他Steam游戏
- ⚡ **智能识别**: 自动识别击杀、连杀、死亡等游戏事件
- 🎯 **精准提取**: 基于游戏回合和时间线精确提取高光片段
- 🔧 **灵活配置**: 可自定义缓冲时间、高光类型等参数
- 📦 **一键导出**: 命令行工具快速批量导出高光视频

## 安装

### 前置要求

- Python 3.9+
- FFmpeg (用于视频处理)

### 安装FFmpeg

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install ffmpeg
```

**macOS:**
```bash
brew install ffmpeg
```

**Windows:**
从 [FFmpeg官网](https://ffmpeg.org/download.html) 下载并添加到PATH

### 安装项目

```bash
git clone <repository-url>
cd SteamHighlightForge
pip install -r requirements.txt
```

或使用开发模式安装:
```bash
pip install -e .
```

## 快速开始

### 1. 准备Steam录制数据

将Steam游戏录制文件放在 `gamerecordings` 目录下:

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

### 2. 查看可用录制

```bash
python -m steam_highlight_forge.cli list-timelines
```

### 3. 导出高光片段

**导出所有击杀和连杀:**
```bash
python -m steam_highlight_forge.cli export timeline_73020260507_142732.json
```

**导出特定回合的高光:**
```bash
python -m steam_highlight_forge.cli export timeline_73020260507_142732.json --round 5
```

**导出所有类型的高光:**
```bash
python -m steam_highlight_forge.cli export timeline_73020260507_142732.json -t all
```

**导出连杀片段:**
```bash
python -m steam_highlight_forge.cli export-streaks timeline_73020260507_142732.json --min-kills 3
```

## 命令详解

### list-timelines

列出所有可用的时间线录制文件。

```bash
python -m steam_highlight_forge.cli list-timelines [--game cs2]
```

### list-rounds

查看某个录制中的所有回合信息。

```bash
python -m steam_highlight_forge.cli list-rounds <timeline>
```

### export

导出高光片段。

```bash
python -m steam_highlight_forge.cli export <timeline> [OPTIONS]
```

**选项:**
- `-t, --type`: 高光类型 (可多次使用)
  - `kill`: 击杀
  - `multi_kill`: 多重击杀/双杀
  - `death`: 死亡
  - `bomb`: 炸弹相关事件
  - `ace`: ACE
  - `all`: 所有类型
- `-r, --round`: 指定回合号
- `-bb, --buffer-before`: 事件前缓冲时间(秒)
- `-ba, --buffer-after`: 事件后缓冲时间(秒)
- `--dry-run`: 仅显示将要导出的片段，不实际导出视频

**示例:**
```bash
# 导出第3回合的所有击杀和连杀
python -m steam_highlight_forge.cli export timeline_73020260507_142732.json -r 3 -t kill -t multi_kill

# 导出所有炸弹事件，前后各留10秒
python -m steam_highlight_forge.cli export timeline_73020260507_142732.json -t bomb -bb 10 -ba 10

# 预览将要导出的片段
python -m steam_highlight_forge.cli export timeline_73020260507_142732.json --dry-run
```

### export-streaks

导出连杀高光片段。

```bash
python -m steam_highlight_forge.cli export-streaks <timeline> [OPTIONS]
```

**选项:**
- `-k, --min-kills`: 最少击杀数 (默认: 2)
- `-w, --time-window`: 连杀时间窗口(秒) (默认: 10)
- `--dry-run`: 仅显示不导出

**示例:**
```bash
# 导出3杀及以上的连杀片段
python -m steam_highlight_forge.cli export-streaks timeline_73020260507_142732.json -k 3

# 导出15秒内的2连杀
python -m steam_highlight_forge.cli export-streaks timeline_73020260507_142732.json -k 2 -w 15
```

## 配置文件

编辑 `config.yaml` 自定义默认设置:

```yaml
recordings_path: "./gamerecordings"
output_path: "./output"
buffer_before: 5.0
buffer_after: 3.0
merge_threshold: 2.0

games:
  cs2:
    app_id: 730
    highlight_types:
      kill:
        buffer_before: 5.0
        buffer_after: 2.0
        priority: 2
      multi_kill:
        buffer_before: 3.0
        buffer_after: 3.0
        priority: 3
```

创建 `config.local.yaml` 覆盖本地设置(不会被git跟踪)。

## 扩展支持其他游戏

1. 在 `steam_highlight_forge/games/` 创建新的游戏配置类
2. 继承 `GameHighlightConfig` 基类
3. 实现必需的方法:
   - `app_id`: Steam应用ID
   - `game_name`: 游戏名称
   - `extract_rounds()`: 提取回合信息
   - `extract_highlights()`: 提取高光事件
   - `get_supported_highlight_types()`: 支持的高光类型

4. 在 `highlight_extractor.py` 中注册:

```python
from steam_highlight_forge.games.your_game import YourGameConfig

GAME_REGISTRY[your_app_id] = YourGameConfig
```

参考 `steam_highlight_forge/games/cs2.py` 的实现。

## 项目结构

```
SteamHighlightForge/
├── steam_highlight_forge/
│   ├── __init__.py
│   ├── cli.py                  # 命令行接口
│   ├── config.py               # 配置管理
│   ├── timeline_parser.py      # 时间线解析器
│   ├── video_processor.py      # 视频处理
│   ├── highlight_extractor.py  # 高光提取器
│   └── games/
│       ├── base.py             # 游戏配置基类
│       └── cs2.py              # CS2游戏配置
├── gamerecordings/             # Steam录制数据
├── output/                     # 导出的高光视频
├── config.yaml                 # 配置文件
├── requirements.txt
└── README.md
```

## 常见问题

**Q: 为什么找不到视频文件?**

A: 确保 `gamerecordings/video/` 目录下有对应的视频会话文件夹 (格式: `bg_{app_id}_{date}`)。

**Q: 导出的视频没有声音?**

A: 检查原始录制是否包含音频流 (`chunk-stream1-*.m4s` 文件)。

**Q: FFmpeg报错?**

A: 确保已正确安装FFmpeg并添加到系统PATH。运行 `ffmpeg -version` 验证。

**Q: 如何批量导出多个录制?**

A: 使用shell脚本循环处理:
```bash
for timeline in gamerecordings/timelines/timeline_730*.json; do
    python -m steam_highlight_forge.cli export "$timeline"
done
```

## 许可证

MIT License

## 贡献

欢迎提交Issue和Pull Request!
