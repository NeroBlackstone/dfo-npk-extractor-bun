# dfo-npk-extractor-bun

DNF (地下城与勇士) NPK 跨平台资源包解析器。将 .npk 文件转换为 PNG 图片。

## 安装

```bash
bun install
```

## 使用

1. 将 `.npk` 文件放到工作目录
2. 执行：

```bash
bun run index.ts
```

或在github下载可执行文件，在有npk的目录下执行:

```
./npk-extractor
```

输出结构：`sprite/monster/screamingcave/apopis/(tn)apopis.img/0.png`

## 打包

在拉取了依赖的前提下，执行构建脚本，即可全平台构建:

```
./build.sh
```

## 测试

```
bun test
```

## 项目结构

```
src/
├── img/
│   ├── decoder.ts     # Sprite 数据解码 (Zlib/DDS)
│   ├── dds.ts         # DDS 格式解码 (DXT1/DXT3/DXT5)
│   ├── reader.ts      # IMG 文件读取
│   └── types.ts       # IMG 类型定义
├── npk/
│   ├── index.ts       # 导出入口
│   ├── album.ts       # NpkAlbum 类
│   └── reader.ts      # NPK 读取核心
└── utils/
    └── crypto.ts      # XOR 加密/解密工具
```

## API

### 读取 NPK 文件

```typescript
import { readNpk, readNpkFile, NpkAlbum } from './src/npk/index.ts';

// 从文件读取
const albums = readNpkFile('test/sprite_monster_screamingcave_apopis.NPK');

// 获取所有 Album 路径
for (const album of albums) {
  console.log(album.path);
}

// 获取 Album 的 IMG 信息
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
```
