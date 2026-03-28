# dfo-npk-extractor-bun

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.ts
```

This project was created using `bun init` in bun v1.3.10. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.

---

## NPK 文件格式解析

NPK 是 DNF（地下城与勇士）游戏使用的资源包格式。

### 文件结构

```
+-------------------+
| Header (20字节)   |
+-------------------+
| Directory (N×264) |
+-------------------+
| Data              |
+-------------------+
| SHA256 (32字节)   |  (可选)
+-------------------+
```

### Header 结构 (20字节)

| 偏移 | 大小 | 类型   | 说明                |
|------|------|--------|---------------------|
| 0    | 16   | string | NPK标志: "NeoplePack_Bill" |
| 16   | 4    | int32  | IMG文件数量 (小端序) |

### Directory 结构 (每个Album 264字节)

| 偏移 | 大小 | 类型   | 说明                |
|------|------|--------|---------------------|
| 0    | 4    | int32  | 文件偏移 (小端序)    |
| 4    | 4    | int32  | 文件长度 (小端序)    |
| 8    | 256  | bytes  | 加密的路径名        |

### 示例数据

以 `sprite_monster_screamingcave_apopis.NPK` 为例：

**Header (十六进制)**:
```
4e 65 6f 70 6c 65 50 61 63 6b 5f 42 69 6c 6c 00  05 00 00 00
```
解读:
- 标志: `NeoplePack_Bill` (16字节)
- 数量: `05 00 00 00` = 5 (little-endian)

**Directory Entry 0 (偏移20，长度38801)**:
```
54 05 00 00  C1 97 00 00  03 05 11 01 ...
```
解读:
- offset: `54 05 00 00` = 0x554 = 1372
- length: `C1 97 00 00` = 0x97C1 = 38801
- path: 256字节加密数据

---

## XOR 路径加密算法

### 密钥生成

密钥头部: `"puchikon@neople dungeon and fighter "` (36字节)

剩余字节用 `"DNF"` 循环填充:
```
key[0..35]   = "puchikon@neople dungeon and fighter "
key[36..254] = "DNFDNFDNFDNF..." (循环)
key[255]     = 0
```

### 路径解密

路径字段固定256字节，每个字节与密钥异或后解密。

**关键问题**: 当 `path[i] == key[i]` 时，异或结果为0，可能与null终止符冲突。

**正确算法**:
1. 解密所有字节
2. 在解密后的数据中找到第一个 null (0) 作为终止符

```typescript
function decryptPath(encryptedData: Uint8Array, key: Uint8Array): string {
  let nullIndex = -1;
  const decrypted = new Uint8Array(encryptedData.length);

  for (let i = 0; i < encryptedData.length; i++) {
    decrypted[i] = encryptedData[i] ^ key[i];
    if (decrypted[i] === 0 && nullIndex === -1) {
      nullIndex = i;
      break;
    }
  }

  if (nullIndex === -1) nullIndex = encryptedData.length;
  return new TextDecoder().decode(decrypted.subarray(0, nullIndex));
}
```

### 示例

路径: `sprite/monster/screamingcave/apopis/(tn)apopis.img`

| 位置 | 路径字符 | key[i] | 加密结果 (path ^ key) |
|------|---------|--------|----------------------|
| 0    | s (115) | p (112) | 7                   |
| 9    | n (110) | n (110) | **0** (碰撞!)        |
| 22   | n (110) | n (110) | **0** (碰撞!)        |
| 50   | null    | F (70)  | 70                   |

解密后找到位置9的第一个null，正确得到路径。

---

## API

### NpkFile

```typescript
import { NpkFile } from './src/npk/index.ts';
```

#### 构造函数

```typescript
new NpkFile(filePath: string): NpkFile
```

#### 属性

| 属性 | 类型 | 说明 |
|------|------|------|
| `albums` | `NpkAlbum[]` | 目录列表 |

**NpkAlbum 结构:**

| 属性 | 类型 | 说明 |
|------|------|------|
| `offset` | `number` | 文件数据在NPK中的偏移 |
| `length` | `number` | 文件长度 |
| `path` | `string` | 解密后的路径 |

#### 方法

```typescript
npk.getAlbumData(path: string): Buffer | null
```

根据路径获取Album的原始数据。

#### 属性访问器

```typescript
npk.size: number
```

获取NPK文件总大小。

#### 示例

```typescript
const npk = new NpkFile('test/sprite_monster_screamingcave_apopis.NPK');

// 获取所有Album路径
for (const album of npk.albums) {
  console.log(album.path);
}

// 通过路径获取数据
const data = npk.getAlbumData('sprite/monster/screamingcave/apopis/apopis.img');
if (data) {
  // 处理数据
}
```

---

## 文件清单

```
src/
├── types/
│   └── npk.ts          # NPK 类型定义
├── utils/
│   └── crypto.ts       # XOR 加密/解密工具
└── npk/
    ├── index.ts        # NpkFile 类，对外接口
    ├── reader.ts       # NPK 读取核心
    └── npk.test.ts     # 单元测试
```
