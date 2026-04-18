# dfo-npk-extractor-bun

NPK 跨平台资源包解析器。将 .npk 文件转换为 PNG 图片和 OGG 音频。

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

在拉取了依赖的前提下，执行构建脚本:

- 全平台构建: `./build/all.sh`
- 单平台构建: 参见 [build/](build/) 目录下的脚本

## 使用

1. 将 `.npk` 文件放到工作目录
2. 执行：

```bash
bun run index.ts
```

或者使用构建后的可执行文件（参见 [build/](build/) 目录）:

```
./dist/npk-extractor
```

输出结构示例：
- 图片：`sprite/monster/screamingcave/apopis/(tn)apopis.img/0.png`
- 音频：`sounds/test/click.ogg`

## 测试

```
bun test
```

## 项目结构

```
src/
├── extract/          # 提取逻辑
│   └── index.ts      # 音频/图片提取函数
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
│   └── reader.ts     # NPK 读取核心
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
