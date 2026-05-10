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

### 转换规则

| 源文件 | 输出文件 | 内容 |
|--------|----------|------|
| `itemname.lst` | `itemname.lst.json` | 物品 ID → 物品名称 |
| `monstername.lst` | `monstername.lst.json` | 怪物 ID → 怪物名称 |
| `skillname*.lst` | `skillname*.lst.json` | 技能 ID → 技能名称 |
| `npcname.lst` | `npcname.lst.json` | NPC ID → NPC 名称 |
| `character.lst` | `character.lst.json` | 索引 → 角色文件路径 |
| `n_string.lst` | 不导出 | 字符串翻译索引（内部使用） |

### JSON 格式

```json
{
  "0": "swordman/swordman.chr",
  "1": "fighter/fighter.chr",
  "2": "gunner/gunner.chr"
}
```

- Key：ScriptFile 中的 Int token 值（ID）
- Value：String token 通过 `stringtable.bin` 解析后的文本


## 测试

```
bun test
```

## 项目结构

```
src/
├── ani/
│   ├── tres.ts       # Godot .tres 格式生成器（从 PVF 二进制 .ani 生成）
│   └── index.ts      # 导出入口
├── img/
│   ├── decoder.ts    # Sprite 数据解码 (Zlib/DDS)
│   ├── dds.ts        # DDS 格式解码 (DXT1/DXT3/DXT5)
│   ├── png.ts        # PNG 编码器
│   ├── reader.ts     # IMG 文件读取
│   ├── types.ts      # IMG 类型定义
│   └── versions/     # IMG 版本处理器（策略模式）
│       ├── base.ts   # VersionHandler 接口定义
│       ├── ver2.ts   # Ver1/Ver2 处理器
│       ├── ver4.ts   # Ver4 处理器（含调色板逻辑）
│       └── index.ts  # 工厂函数
├── npk/
│   ├── index.ts      # 导出入口
│   ├── album.ts      # NpkAlbum 类（含 isAudio, getAudioData）
│   ├── extract.ts    # NPK 解压入口（npk 子命令）
│   └── reader.ts     # NPK 读取核心
├── pvf/
│   ├── index.ts      # 导出入口
│   ├── reader.ts     # PVF 解密与读取核心
│   ├── extract.ts    # PVF 提取入口（pvf 子命令）
│   └── types.ts      # PVF 类型定义
└── utils/
    ├── crypto.ts     # XOR 加密/解密工具
    └── file.ts       # 文件操作工具
```

## NPK/IMG 文件格式

### NPK 文件结构

```
+------------------+
| NeoplePack_Bill  |  16 bytes - NPK 标志
+------------------+
| album_count      |  4 bytes  - IMG 数量
+------------------+
| album_entry[0]   |  264 bytes
| album_entry[1]   |  264 bytes
| ...              |
+------------------+
| album_data[0]    |  IMG 数据
| album_data[1]    |
| ...              |
+------------------+
```

每个 album_entry (264 bytes):
```
+-------------+------------+---------------------------+
| offset      | 4 bytes   | IMG 数据在文件中的偏移    |
+-------------+------------+---------------------------+
| length      | 4 bytes   | IMG 数据长度              |
+-------------+------------+---------------------------+
| path_xor   | 256 bytes  | XOR 加密后的路径          |
+-------------+------------+---------------------------+
```

### IMG 文件格式差异

#### Ver1 (IMAGE_FLAG = "Neople Image File")

```
+-------------+------------+
| flag        | 16 bytes  | "Neople Image File"
+-------------+------------+
| padding     | 6 bytes   | 全 0
+-------------+------------+
| version     | 4 bytes   | 固定 1
+-------------+------------+
| count       | 4 bytes   | Sprite 数量
+-------------+------------+
| sprite[0]   | 36 bytes  | Sprite 条目
+-------------+------------+
| sprite[1]   | 36 bytes  |
+-------------+------------+
| ...         |           |
+-------------+------------+
| data        | 后续数据   |
+-------------+------------+
```

- Sprite 条目起始偏移: **30**

#### Ver2 (IMG_FLAG = "Neople Img File", version = 2)

```
+-------------+------------+
| flag        | 16 bytes  | "Neople Img File"
+-------------+------------+
| indexLength | 8 bytes   | 索引区总长度
+-------------+------------+
| version     | 4 bytes   | 固定 2
+-------------+------------+
| count       | 4 bytes   | Sprite 数量
+-------------+------------+
| sprite[0]   | 36 bytes  | Sprite 条目
+-------------+------------+
| ...         |           |
+-------------+------------+
| data        | 后续数据   |
+-------------+------------+
```

- Sprite 条目起始偏移: **32**
- 数据起始偏移: `32 + indexLength`

#### Ver4 (IMG_FLAG = "Neople Img File", version = 4)

```
+-------------+------------+
| flag        | 16 bytes  | "Neople Img File"
+-------------+------------+
| indexLength | 8 bytes   | 索引区总长度
+-------------+------------+
| version     | 4 bytes   | 固定 4
+-------------+------------+
| count       | 4 bytes   | Sprite 数量
+-------------+------------+
| palette_cnt | 4 bytes   | 调色板颜色数量 (N)
+-------------+------------+
| palette[0]  | 4 bytes   | BGRA 颜色
+-------------+------------+
| ...         | N * 4     |
+-------------+------------+
| sprite[0]   | 36 bytes  | Sprite 条目
+-------------+------------+
| ...         |           |
+-------------+------------+
| data        | 后续数据   |
+-------------+------------+
```

- Sprite 条目起始偏移: `32 + 4 + palette_cnt * 4` = `36 + palette_cnt * 4`
- 数据起始偏移: `spriteEntriesStart + indexLength`
- **特殊处理**: Ver4 的 ARGB_1555 + ZLIB 压缩数据解压后是**调色板索引** (每像素 1 字节)，需要通过调色板转换为 ARGB_8888

### Sprite 条目格式

每个 Sprite 条目:

| 偏移 | 大小 | 说明 |
|------|------|------|
| 0 | 4 | type (颜色格式) |
| 4 | 4 | compressMode (压缩模式) |
| 8 | 4 | width |
| 12 | 4 | height |
| 16 | 4 | length (数据长度) |
| 20 | 4 | x (X偏移) |
| 24 | 4 | y (Y偏移) |
| 28 | 4 | frameWidth |
| 32 | 4 | frameHeight |

**LINK 类型** (type = 0x11) 只有 type 和 target index，长度为 8 字节。

### 颜色格式 (ColorBits)

| 值 | 名称 | 说明 |
|----|------|------|
| 0x0e | ARGB_1555 | 16位色，每像素2字节 |
| 0x0f | ARGB_4444 | 16位色，每像素2字节 |
| 0x10 | ARGB_8888 | 32位色，每像素4字节 |
| 0x11 | LINK | 链接到另一个 Sprite |
| 0x12 | DXT_1 | DDS 压缩格式 |
| 0x13 | DXT_3 | DDS 压缩格式 |
| 0x14 | DXT_5 | DDS 压缩格式 |

### 压缩模式 (CompressMode)

| 值 | 名称 | 说明 |
|----|------|------|
| 0x05 | NONE | 无压缩 |
| 0x06 | ZLIB | Zlib 压缩 |
| 0x07 | DDS_ZLIB | DDS + Zlib 压缩 |

### 音频文件 (OGG)

NPK 中音频文件以 `.ogg` 结尾，存储在 `sounds/` 目录下：

```
+-------------+------------+
| album_count | 4 bytes   | 音频文件数量
+-------------+------------+
| album_entry | 264 bytes | 每个条目同图片格式
+-------------+------------+
| audio_data  | OGG 流    | 原始 OGG 字节，"OggS" 开头
+-------------+------------+
```

**OGG 数据特征**：
- 文件开头为 `OggS` (0x4F 0x67 0x67 0x53)
- 数据为原始 OGG 字节流，无 IMG 头部
- 按 album 的 `offset` 和 `length` 直接读取即可

示例 (test/test_audio.npk):
- 路径格式: `sounds/test/click.ogg`
- 2 个测试音频文件

## PVF 文件格式

PVF（Package Virtual File System）是 DNF 用于存储游戏配置、脚本、字符串表等数据的打包格式。PVF 文件内部使用自定义的加密和编码机制。

### PVF 文件整体结构

```
+------------------+
| PvfHeader        |  56 bytes - 文件头
+------------------+
| 目录树数据       |  dirTreeLength bytes - 加密的目录索引
+------------------+
| 文件数据[0]      |  加密的文件内容
| 文件数据[1]      |
| ...              |
+------------------+
```

### PvfHeader 文件头 (56 bytes)

```
+------------------+------------+
| sizeGUID         | 4 bytes   | 固定值 0x24 (36)
+------------------+------------+
| GUID             | 36 bytes  | 文件唯一标识
+------------------+------------+
| fileVersion      | 4 bytes   | PVF 版本号
+------------------+------------+
| dirTreeLength    | 4 bytes   | 目录树占用字节数
+------------------+------------+
| dirTreeChecksum  | 4 bytes   | 目录树 CRC32 校验码
+------------------+------------+
| numFilesInDirTree| 4 bytes   | PVF 内文件总数
+------------------+------------+
```

总大小: 4 + 36 + 4 + 4 + 4 + 4 = **56 字节**

### 目录树结构

目录树紧跟在头部之后，存储了 PVF 内所有文件的索引信息。目录树数据是**加密**的，需要先解密才能读取。

#### 目录树解密算法

```
密码常量: PASSWORD_PVF = 0x81A79011
校验码:   crc32 = header.dirTreeChecksum

对目录树数据中每个 4 字节块进行解密:
  block_decrypted = rotateRight32(block XOR PASSWORD_PVF XOR crc32, 6)
```

其中 rotateRight32(x, n) 表示将 32 位无符号整数循环右移 n 位：

```typescript
function rotateRight32(x: number, n: number): number {
  return ((x >>> n) | (x << (32 - n))) >>> 0;
}
```

#### 目录树条目格式

每个文件条目的大小为 filePathLength + 20 字节：

```
+------------------+------------+
| fileNumber       | 4 bytes   | 文件序号
+------------------+------------+
| filePathLength   | 4 bytes   | 文件路径长度 (字节)
+------------------+------------+
| filePath         | N bytes   | 文件路径 (BIG5 编码)
+------------------+------------+
| fileLength       | 4 bytes   | 文件数据长度
+------------------+------------+
| fileCrc32        | 4 bytes   | 文件数据 CRC32 校验码
+------------------+------------+
| relativeOffset   | 4 bytes   | 文件在数据区的相对偏移
+------------------+------------+
```

#### 文件路径解码

文件路径存储为 **BIG5HKSCS**（繁体中文/香港增补字符集）编码，读取后需要转换为 UTF-8：

```typescript
const decoder = new TextDecoder("big5");
const filePath = decoder.decode(filePathRaw);
```

韩文版 DNF 使用 **CP949** 编码（`new TextDecoder("euc-kr")`）。

### 文件数据区

文件数据区紧跟在目录树之后，存储了所有文件的实际内容。文件数据同样使用**加密**保护。

#### 文件数据解密

```
密码常量: PASSWORD_PVF = 0x81A79011
校验码:   crc32 = entry.fileCrc32  (每个文件自己的 CRC32)

对文件数据中每个 4 字节块进行解密:
  block_decrypted = rotateRight32(block XOR PASSWORD_PVF XOR crc32, 6)
```

#### 4 字节对齐

文件数据在 PVF 中按 4 字节对齐存储：

```typescript
const alignedLength = (fileLength + 3) & ~3;  // 向上对齐到 4 的倍数
```

解密后需要将对齐产生的多余字节清零。

#### 文件绝对偏移计算

```typescript
const absoluteOffset = PVF_HEADER_SIZE + dirTreeLength + entry.relativeOffset;
// 即: 56 + dirTreeLength + relativeOffset
```

### 文件类型分发

PVF 内的文件按内容和格式可分为 **5 类**：

#### 1. 纯文本文件

直接存储文本内容，不需要反编译，按编码解码即可。

| 扩展名 | 说明 | 编码 |
|--------|------|------|
| `.nut` | Squirrel 脚本 | EUC-KR (CP949) |
| `.str` | 字符串表文本 | BIG5 |
| `.txt` | 纯文本 | 通常是 EUC-KR |
| `.xml` | XML 配置 | UTF-8 |
| `.rtf` | RTF 文档 | - |

#### 2. ScriptFile（脚本文件）

前 2 字节固定为 `0xD0B0`，内部是二进制 token 流，需要反编译为 `#PVF_File` 格式。

**二进制结构：**

```
[Header: 2 bytes] [Token: 5 bytes] [Token: 5 bytes] ...
```

- **Header**：`0xB0 0xD0`（小端读取为 `0xD0B0`），固定 2 字节
- **Token**：每 5 字节一组，`[type: 1 byte][data: 4 bytes]`（LE），重复直到文件末尾

**Token Type 定义：**

| Type | 名称 | 说明 |
|------|------|------|
| 2 | Int | 普通整数，data 为 `int32 LE` |
| 3 | IntEx | 扩展整数，data 为 `int32 LE` |
| 4 | Float | 浮点数，data 为 `float32 LE` |
| 5 | Section | 节名，data 为字符串表索引 |
| 6 | Command | 命令标记，data 为字符串表索引 |
| 7 | String | 字符串值，data 为字符串表索引 |
| 8 | CommandSeparator | 命令分隔符，data 为字符串表索引 |
| 9 | StringLinkIndex | 字符串链接索引，由 type 10 处理 |
| 10 | StringLink | 字符串链接，data 为字符串表索引 |

常见扩展名：

- `.ai`、`.aic` — AI 脚本
- `.skl` — 技能配置
- `.stk` — 堆叠/消耗品配置
- `.equ` — 装备配置
- `.mob` — 怪物配置
- `.map`、`.twn`、`.wdm` — 地图/城镇/世界地图
- `.chr` — 角色配置
- `.act` — 动作配置
- `.atk` — 攻击信息
- `.dgn` — 地下城配置
- `.qst` — 任务配置
- `.shp` — 商店配置
- `.tbl` — 参数表
- `.lst` — 列表文件
- `.ui`、`.key`、`.co` — UI/按键/客户端配置

#### 3. Binary ANI（二进制动画文件）

`.ani` 动画文件，二进制格式，需要专门的反编译器解析为文本帧序列。

##### 整体结构

```
+------------------+------------+
| framesCount      | 2 bytes   | 帧总数 (uint16)
+------------------+------------+
| countOfResources | 2 bytes   | 资源路径数量 (uint16)
+------------------+------------+
| resourceLen[i]   | 4 bytes   | 第 i 个资源路径长度 (int32)
+------------------+------------+
| resourceStr[i]   | N bytes   | 资源路径字符串 (ASCII, null 结尾)
+------------------+------------+
| animParamCount   | 2 bytes   | 动画级参数数量 (uint16)
+------------------+------------+
| animParam[0]     | ...       | 动画级参数 (类型+数据)
+------------------+------------+
| ...              |           |
+------------------+------------+
| frame[0]         | ...       | 帧数据
+------------------+------------+
| frame[1]         | ...       |
+------------------+------------+
| ...              |           |
+------------------+------------+
```

##### 动画级参数

每个参数由 `type(2 bytes)` + `data` 组成，部分类型不带额外数据：

| type | 名称 | 额外数据 | 说明 |
|------|------|----------|------|
| 0 | LOOP | 1 byte (int8) | 是否循环播放 |
| 1 | SHADOW | 1 byte (int8) | 是否显示阴影 |
| 3 | COORD | 2 bytes (uint16) | 坐标系 |
| 28 | OPERATION | 2 bytes (uint16) | 操作类型 |
| 18 | SPECTRUM | 17 bytes | 光谱效果参数 |

##### 帧数据结构

每帧由碰撞盒 + 图像引用 + 坐标 + 帧属性组成：

```
+------------------+------------+
| boxCount         | 2 bytes   | 碰撞盒数量 (uint16)
+------------------+------------+
| box[0].type      | 2 bytes   | 14=DAMAGE_BOX, 15=ATTACK_BOX
+------------------+------------+
| box[0].values    | 24 bytes  | 6 × int32
+------------------+------------+
| ...              |           | 重复 boxCount 次
+------------------+------------+
| imgId            | 2 bytes   | 资源索引 (int16), -1 表示无图像
+------------------+------------+
| imgParam         | 2 bytes   | 图像参数 (uint16), 仅 imgId >= 0 时存在
+------------------+------------+
| x                | 4 bytes   | X 坐标 (int32)
+------------------+------------+
| y                | 4 bytes   | Y 坐标 (int32)
+------------------+------------+
| propertyCount    | 2 bytes   | 帧属性数量 (uint16)
+------------------+------------+
| property[0]      | ...       | 帧属性 (类型+数据)
+------------------+------------+
| ...              |           |
+------------------+------------+
```

##### 帧属性类型

每个帧属性由 `type(2 bytes)` + `data` 组成：

| type | 名称 | 额外数据 | 说明 |
|------|------|----------|------|
| 0 | LOOP | 1 byte (int8) | 是否循环 |
| 1 | SHADOW | 1 byte (int8) | 是否显示阴影 |
| 10 | INTERPOLATION | 1 byte (int8) | 是否启用插值 |
| 3 | COORD | 2 bytes (uint16) | 坐标系 |
| 7 | IMAGE_RATE | 8 bytes | rateX(float) + rateY(float) |
| 8 | IMAGE_ROTATE | 4 bytes | rotate(float) |
| 9 | RGBA | 4 bytes | R,G,B,A 各 1 字节 |
| 11 | GRAPHIC_EFFECT | 可变 | 图形特效（含 MONOCHROME/SPACEDISTORT 子类型） |
| 12 | DELAY | 4 bytes (int32) | 帧延迟(ms) |
| 13 | DAMAGE_TYPE | 2 bytes (uint16) | 伤害类型 |
| 16 | PLAY_SOUND | 可变 | 4 bytes 长度 + N bytes 音效路径 |
| 23 | SET_FLAG | 4 bytes (int32) | 标志位 |
| 24 | FLIP_TYPE | 2 bytes (uint16) | 翻转类型 (1=水平, 2=垂直, 3=全部) |
| 25 | LOOP_START | 无 | 循环起始标记 |
| 26 | LOOP_END | 4 bytes (int32) | 循环结束标记 |
| 27 | CLIP | 8 bytes | 4 × int16 裁剪区域 |
| 2, 4, 5, 6, 19-22 | 未知 | 无数据 | 保留/废弃类型，直接跳过 |

#### 4. Document 文件

二进制文档格式，与 ScriptFile 不同：

- 前 2 字节是 magic header（值为 `0x0002`）
- 内部有开闭标签结构，如 `[element]`、`[/element]`
- 需要 `stringtable.bin` 来解析标签名
- 例如部分 `.img`、`.hsp`、`.lay`、`.cbt`、`.pet` 等文件

**二进制结构：**

```
[Header: 2 bytes] [Token: 5 bytes] [Token: 5 bytes] ...
```

- **Header**：`0x02 0x00`（小端读取为 `0x0002`），固定 2 字节
- **Token**：与 ScriptFile 相同，每 5 字节一组，`[type: 1 byte][data: 4 bytes]`（LE）

**Token Type 定义（与 ScriptFile 共用）：**

| Type | 名称 | 说明 |
|------|------|------|
| 2 | Int | 普通整数，data 为 `int32 LE` |
| 3 | IntEx | 扩展整数，data 为 `int32 LE` |
| 4 | Float | 浮点数，data 为 `float32 LE` |
| 5 | Section | 标签名（如 `[tagname]`、`[/tagname]`），data 为字符串表索引 |
| 6 | Command | 命令标记，data 为字符串表索引 |
| 7 | String | 字符串值，data 为字符串表索引 |
| 8 | CommandSeparator | 命令分隔符，data 为字符串表索引 |
| 9 | StringLinkIndex | 字符串链接索引，由 type 10 处理 |
| 10 | StringLink | 字符串链接，data 为字符串表索引 |

**与 ScriptFile 的区别：**

- ScriptFile 是扁平 token 流，输出为 `#PVF_File` 格式的脚本文本
- Document 是树形结构，type 5 (Section) 的字符串表值格式为 `[tagname]`（开标签）或 `[/tagname]`（闭标签），解析为嵌套 XML 树

#### 5. 原始二进制文件

不需要解析，直接原样写出。

| 扩展名 | 说明 |
|--------|------|
| `.bin` | `stringtable.bin` 等 |
| `.exe` | 可执行文件 |
| `.img` | 图片原始数据（非 Document 的） |
| `.info`、`.evn`、`.pos` 等 | 其他二进制数据 |

### 判断逻辑

代码层面的文件类型判断优先级（`src/pvf/extract.ts`）：

```
if (扩展名 === .ani)           → Binary ANI（反编译）
else if (扩展名 === .str)      → BIG5 文本
else if (扩展名 === .nut)      → EUC-KR 文本
else if (排除 stringtable.bin / n_string.lst 且 data.length > 7)
  ├─ if (isScriptFile(data))   → ScriptFile（前 2 字节 === 0xD0B0）
  └─ else                      → Document（尝试解析，失败则原样写出）
else                           → 原始二进制
```

注意：代码中不显式检查 `0x0002` 魔数，而是对所有未匹配扩展名的文件先尝试 ScriptFile 解析（`isScriptFile` 检查 `0xD0B0`），失败后尝试 Document 解析（try/catch），再失败则作为原始二进制处理。

---

### PVF 内部文件格式

#### stringtable.bin

字符串索引表，包含所有 ScriptFile / Document 中引用的字符串键：

```
+------------------+------------+
| count            | 4 bytes   | 字符串数量
+------------------+------------+
| offset[0]        | 4 bytes   | 第 0 个字符串相对偏移
+------------------+------------+
| offset[1]        | 4 bytes   | 第 1 个字符串相对偏移
+------------------+------------+
| ...              | count+1 个 | 偏移表（offset[count] 为总长度）
+------------------+------------+
| stringData       | 后续数据   | BIG5 编码的字符串数据
+------------------+------------+
```

第 `i` 个字符串长度 = `offset[i+1] - offset[i]`，起始位置 = `offset[i] + 4`（偏移表本身占 4 字节，但代码中实际偏移需要再 +4）。

#### n_string.lst

`.str` 文件索引映射表，本身是 **ScriptFile**（header `0xD0B0`），但当前提取器使用简化的硬编码解析：

```
+------------------+------------+
| header           | 2 bytes   | 0xD0B0 (ScriptFile 标识)
+------------------+------------+
| padding          | 6 bytes   | 每条目前 6 字节填充
+------------------+------------+
| index            | 4 bytes   | stringtable.bin 中的索引
+------------------+------------+
| ...              |           | 重复 6 bytes padding + 4 bytes index
+------------------+------------+
```

通过该索引从 `stringtable.bin` 查到 `.str` 文件名，再读取对应的 `.str` 文件内容，解析 `key>value` 格式的本地化文本。

## API

### 读取 NPK 文件

```typescript
import { readNpk, readNpkFile, NpkAlbum } from './src/npk/index.ts';

// 从文件读取
const albums = readNpkFile('path/to/file.NPK');

// 获取所有 Album 路径
for (const album of albums) {
  console.log(album.path);
}

// 检测是否为音频文件
if (album.isAudio()) {
  const audioData = album.getAudioData(); // 原始 OGG 字节
} else {
  // 图片文件
  const header = album.getHeader();
  if (header) {
    console.log(`Version: ${header.version}, Count: ${header.count}`);
  }

  // 获取所有 Sprite
  for (const sprite of album.getSprites()) {
    console.log(`Sprite ${sprite.index}: ${sprite.width}x${sprite.height}`);
  }

  // 获取 Sprite 数据
  const data = album.getSpriteData(0);
}
```
