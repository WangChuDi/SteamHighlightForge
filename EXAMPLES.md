# Steam Highlight Forge 使用示例

## 场景1: 快速导出CS2某局游戏的所有击杀镜头

```bash
# 1. 查看可用的录制
python -m steam_highlight_forge.cli list-timelines --game cs2

# 输出示例:
# Found 3 timeline(s):
#   timeline_73020260507_142732.json  [Counter-Strike 2]
#   timeline_73020260506_131915.json  [Counter-Strike 2]
#   timeline_73020260506_120355.json  [Counter-Strike 2]

# 2. 查看某局游戏的回合信息
python -m steam_highlight_forge.cli list-rounds timeline_73020260507_142732.json

# 输出示例:
# Found 24 round(s) in timeline_73020260507_142732.json:
#   Round  1: 109.2s - 212.6s (103s)
#   Round  2: 212.6s - 318.7s (106s)
#   ...

# 3. 导出所有击杀和连杀镜头
python -m steam_highlight_forge.cli export timeline_73020260507_142732.json -t kill -t multi_kill

# 输出示例:
# Processing: timeline_73020260507_142732.json
# Types: kill, multi_kill
# Buffer: 5.0s before, 3.0s after
#
# Found 15 highlight clips:
#   [kill] 你击杀了Topazzzz @ 64.6s - 72.6s (R1)
#   [multi_kill] 双杀 @ 80.2s - 96.8s (R1)
#   [kill] 你击杀了用户0518VhE6L672 @ 238.6s - 246.6s (R2)
#   ...
# Merging video chunks from bg_730_20260506_120454...
# Extracting 15 highlight segments...
# Exported 12 highlight videos to output/timeline_73020260507_142732
```

## 场景2: 导出某个精彩回合的所有高光

```bash
# 导出第5回合的所有事件(击杀、死亡、炸弹)
python -m steam_highlight_forge.cli export timeline_73020260507_142732.json \
    --round 5 \
    -t kill -t multi_kill -t death -t bomb

# 或使用 -t all 导出所有类型
python -m steam_highlight_forge.cli export timeline_73020260507_142732.json \
    --round 5 \
    -t all
```

## 场景3: 导出3连杀及以上的精彩片段

```bash
# 导出至少3个击杀的连杀片段
python -m steam_highlight_forge.cli export-streaks timeline_73020260507_142732.json \
    --min-kills 3

# 输出示例:
# Found 2 kill streak(s):
#   3连杀 @ 76.1s - 86.6s
#     你击杀了落墨飞雨, 你击杀了dpgllnms, 你击杀了大花dahua
#   4连杀 @ 245.3s - 268.9s
#     你击杀了用户A, 你击杀了用户B, 你击杀了用户C, 你击杀了用户D
```

## 场景4: 自定义缓冲时间

```bash
# 炸弹事件前后各留10秒
python -m steam_highlight_forge.cli export timeline_73020260507_142732.json \
    -t bomb \
    --buffer-before 10 \
    --buffer-after 10
```

## 场景5: 预览模式(不导出视频)

```bash
# 先预览将要导出的片段
python -m steam_highlight_forge.cli export timeline_73020260507_142732.json \
    -t all \
    --dry-run

# 确认无误后再正式导出
python -m steam_highlight_forge.cli export timeline_73020260507_142732.json -t all
```

## 场景6: 批量处理多个录制

```bash
# 使用shell脚本批量导出所有CS2录制的击杀镜头
for timeline in gamerecordings/timelines/timeline_730*.json; do
    echo "Processing: $timeline"
    python -m steam_highlight_forge.cli export "$timeline" -t kill -t multi_kill
done
```

## 场景7: 自定义配置

创建 `config.local.yaml`:

```yaml
# 修改默认缓冲时间
buffer_before: 8.0
buffer_after: 5.0

# 修改输出路径
output_path: "/path/to/my/highlights"

# 自定义CS2高光类型的缓冲时间
games:
  cs2:
    highlight_types:
      multi_kill:
        buffer_before: 10.0
        buffer_after: 8.0
```

然后正常使用命令，会自动应用自定义配置:

```bash
python -m steam_highlight_forge.cli export timeline_73020260507_142732.json -t multi_kill
```

## 输出文件结构

```
output/
├── merged_timeline_73020260507_142732.mp4  # 合并后的完整视频
├── timeline_73020260507_142732/            # 高光片段目录
│   ├── highlight_001_你击杀了Topazzzz.mp4
│   ├── highlight_002_双杀.mp4
│   ├── highlight_003_你击杀了用户0518VhE6L672.mp4
│   └── ...
└── timeline_73020260507_142732_streaks/    # 连杀片段目录
    ├── highlight_001_3连杀.mp4
    └── highlight_002_4连杀.mp4
```

## 提示

1. **首次运行会较慢**: 需要合并m4s视频分片，后续导出会复用已合并的视频
2. **片段自动合并**: 时间接近的高光会自动合并为一个片段(可通过 `merge_threshold` 配置)
3. **文件命名**: 导出的文件名包含高光类型和描述，方便识别
4. **回合范围**: 高光片段会自动限制在回合时间范围内，不会跨回合
