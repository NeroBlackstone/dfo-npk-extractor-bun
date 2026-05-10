# dfo-npk-extractor-bun

NPK/PVF 跨平台资源包解析器。将 .npk 文件转换为 PNG 图片和 OGG 音频，从 PVF 生成 Godot .tres SpriteFrames。

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
npk-extractor npk

# 解压单个 NPK 文件
npk-extractor npk sprite_character_swordman_equipment_avatar_skin.NPK

# 配合 --link 模式
npk-extractor npk --link sprite_character_swordman_equipment_avatar_skin.NPK

# 从 PVF 生成 Godot .tres 文件（结合 NPK 中的 sprite）
npk-extractor tres --pvf Script.pvf

# 指定 NPK 目录和资源前缀
npk-extractor tres --pvf Script.pvf --npk-dir ./npk/ --prefix sprite/

# 解密并提取 PVF 文件（默认输出到 pvf/ 目录）
npk-extractor pvf Script.pvf

# 指定输出目录
npk-extractor pvf Script.pvf --output ./out
```

输出结构示例：
- 图片：`sprite/monster/screamingcave/apopis/(tn)apopis.img/0.png`
- 音频：`sounds/test/click.ogg`
- .tres：`tres/sm_body0000.tres`

### npk 参数

| 参数 | 说明 |
|------|------|
| `<file.NPK>` | NPK 文件路径（可选，默认为当前目录） |
| `--link` | 启用 LINK 帧映射模式 |

### pvf 参数

| 参数 | 说明 |
|------|------|
| `<file.pvf>` | PVF 文件路径（必填） |
| `--output` | 输出目录（默认 `pvf/`） |

### tres 参数

| 参数 | 说明 |
|------|------|
| `--pvf` | PVF 文件路径（必填
| `--npk-dir` | NPK 文件目录，用于 LINK 帧解析（默认 cwd） |
| `--prefix` | .tres 内资源路径的前缀（默认 `sprite/`） |

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
npk-extractor npk --link
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
