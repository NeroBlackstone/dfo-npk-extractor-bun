# dfo-npk-extractor-bun

DFO 跨平台资源包解析器，它可以:

- 将 .npk 文件转换为 PNG 图片和 OGG 音频
- 解密并提取加密的 .avi 视频文件，将 .avi转为 ogv格式 (需要ffmpeg)
- 以json格式解压PVF
- 从 PVF和NPK 生成 Godot .tres SpriteFrames

## Disclaimer

This project is intended for educational and research purposes only.

- Do NOT use extracted assets for commercial purposes.
- Do NOT redistribute game assets.
- All game resources belong to their respective copyright holders (e.g. Neople/Nexon).
- Users are responsible for complying with applicable laws and game EULA.

If you are a copyright holder and believe this project violates your rights, please contact for removal.

## 安装依赖

本项目需要 bun.js 运行时。

```bash
bun install
```


## 打包

出于法律风险上的考量，本项目不提供可执行的程序，推荐安装 bun 运行时并手动构建可执行程序。

```bash
# 本平台构建
bun run build

# 全平台交叉编译
bun run build:all
```

构建产物输出到 `dist/` 目录。

## 使用

```bash
# 解压 NPK（扫描当前目录所有 .npk）
dfo-extractor npk

# 解压单个 NPK 文件
dfo-extractor npk sprite_character_swordman_equipment_avatar_skin.NPK

# 指定输出目录
dfo-extractor npk sprite_character_swordman_equipment_avatar_skin.NPK --output ./out

# 配合 --link 模式
dfo-extractor npk --link sprite_character_swordman_equipment_avatar_skin.NPK

# 从 PVF 生成 Godot .tres 文件（结合 NPK 中的 sprite）
dfo-extractor tres --pvf Script.pvf

# 指定 NPK 目录和资源前缀
dfo-extractor tres --pvf Script.pvf --npk-dir ./npk/ --prefix sprite/

# 指定输出目录
dfo-extractor tres --pvf Script.pvf --output ./tres/

# 解密并提取 PVF 文件（默认输出到 out/pvf/ 目录）
dfo-extractor pvf Script.pvf

# 指定输出目录
dfo-extractor pvf Script.pvf --output ./out

# 提取并解析翻译（将 @listId::keyName 替换为实际翻译文本）
dfo-extractor pvf Script.pvf --resolve-string-link

# 导出物品 ID => 名称的 CSV
dfo-extractor list Script.pvf

# 解密当前目录所有 avi 文件（输出到 out/avi/ 目录）
dfo-extractor avi

# 解密单个 avi 文件
dfo-extractor avi video.avi

# 解密指定目录的 avi 文件
dfo-extractor avi ./videos --output ./out

# 解密并转换为 ogv 格式（需要 ffmpeg）
dfo-extractor avi ./videos --ogv

```

输出结构示例：
- 图片：`output/sprite/monster/screamingcave/apopis/(tn)apopis.img/0.png`
- 音频：`output/sounds/test/click.ogg`
- 视频：`output/video/quest_video.avi`（解密后）
- .tres：`output/tres/sm_body0000.tres`
- PVF 内容：`output/pvf/Script/skill/list.lst.json`

### npk 参数

| 参数 | 说明 |
|------|------|
| `<file.NPK>` | NPK 文件路径（可选，默认为当前目录） |
| `--output` | 输出目录（默认 `output/`） |
| `--link` | 启用 LINK 帧映射模式 |

### pvf 参数

| 参数 | 说明 |
|------|------|
| `<file.pvf>` | PVF 文件路径（必填） |
| `--output` | 输出目录（默认 `output/pvf`） |
| `--resolve-string-link` | 将 `@listId::keyName` 解析为实际翻译文本 |

### list 参数

| 参数 | 说明 |
|------|------|
| `<file.pvf>` | PVF 文件路径（必填） |
| `--output` | 输出文件路径（默认 `output/item-list.csv`） |

### tres 参数

| 参数 | 说明 |
|------|------|
| `--pvf` | PVF 文件路径（必填） |
| `--npk-dir` | NPK 文件目录，用于 LINK 帧解析（默认 cwd） |
| `--prefix` | .tres 内资源路径的前缀（默认 `sprite/`） |
| `--output` | 输出目录（默认 `output/pvf`） |

### avi 参数

| 参数 | 说明 |
|------|------|
| `<path>` | avi 文件或目录路径（可选，默认为当前目录） |
| `--output` | 输出目录（默认 `output/video`） |
| `--ogv` | 解密后转换为 ogv 格式（需要 ffmpeg） |

## LINK 帧处理

部分 IMG 文件包含 LINK 类型精灵（type=0x11），它们不存储独立数据，而是引用其他精灵的数据。

### 默认模式（无 `--link`）

LINK 帧会被导出为独立的 PNG 文件，使用目标精灵的图像数据和元数据：

```
sm_body0000.img/
├── 0.png   # 正常帧
├── 1.png   # LINK->0 的副本
├── 2.png   # 正常帧
└── ...
```

### `--link` 模式

生成 `.links.json` 映射文件，跳过 LINK 帧的 PNG 导出：

```bash
dfo-extractor npk --link
```

生成的文件结构：

- PNG：仅包含非 LINK 帧
- JSON：`{imgDir}/{basename}.links.json`，记录 LINK 帧映射关系

例如：`sprite/character/swordman/equipment/avatar/skin/sm_body0000.img/sm_body0000.img.links.json`

**JSON 格式：**

```json
{
  "source": {
    "npk": "sprite_character_swordman_equipment_avatar_skin.NPK",
    "img": "sprite/character/swordman/equipment/avatar/skin/sm_body0000.img"
  },
  "links": {
    "21": 10,
    "23": 12,
    "32": 11
  }
}
```

- `source.npk`：来源 NPK 文件名
- `source.img`：IMG 文件路径
- `links`：LINK 映射，`key` 为 LINK 帧索引，`value` 为目标帧索引

## 音频元数据

`--link` 模式下，导出的 OGG 音频会生成对应的元数据 JSON 文件。

**文件位置：** `{oggDir}/{npkBaseName}.npk.json`

例如：`sounds/amb/sounds_amb.npk.json`

**JSON 格式：**

```json
{
  "npkFile": "dist/sounds_amb.npk",
  "sounds": [
    "sounds/amb/amb_cave_01.ogg",
    "sounds/amb/amb_cave_02.ogg"
  ]
}
```

- `npkFile`：来源 NPK 文件路径
- `sounds`：该 NPK 导出的所有 OGG 文件路径列表

## PNG元数据

导出的 PNG 图片会通过 tEXt 块记录精灵的元数据信息，可用 `pngcheck`、`exiftool` 或图像编辑软件查看：

| 关键字 | 说明 | 示例值 |
|--------|------|--------|
| SpriteX | X偏移量 | 100 |
| SpriteY | Y偏移量 | 50 |
| SpriteFrameWidth | 帧宽度 | 64 |
| SpriteFrameHeight | 帧高度 | 64 |
| NpkFile | 来源NPK文件名 | character.NPK |
| ImgName | 来源IMG路径 | sprite/monster/boss.img |

## LST 转 JSON

PVF 中的 `.lst` 文件是 ScriptFile 格式的查找表（ID → 名称映射），导出时自动转换为 `.lst.json`。


## 测试

```
bun test
```

## 更多信息

- [文件格式规范](docs/format-specification.md) — NPK/IMG/PVF 文件格式、项目结构、API 文档
