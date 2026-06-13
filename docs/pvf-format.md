# PVF 文件格式规范

PVF（Package Virtual File System）是 DNF 用于存储游戏配置、脚本、字符串表等数据的打包格式。PVF 文件内部使用自定义的加密和编码机制。

> 配套阅读：[`pvf-i18n.md`](./pvf-i18n.md) — 字符串池、`.str` 翻译表、ScriptFile StringLink 的完整 i18n 机制。

## PVF 文件整体结构

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

**Section 嵌套与开闭标签：**

type 5 (Section) 同时表示开标签和闭标签，两者在二进制中结构完全一致，区别在于字符串表条目内容：

```
开标签:  [05] [strIdx]  →  stringtable[strIdx] = "[sectionName]"
闭标签:  [05] [strIdx]  →  stringtable[strIdx] = "[/sectionName]"
```

解析器通过字符串前缀 `[/` 来区分闭标签。section 的边界判定规则：

- **Container section**（有闭标签 `[/name]`）：子节点从开标签开始，到闭标签结束
- **Leaf section**（无闭标签）：隐式终止于下一个同级或父级 section 的 type 5 token

构建树需要两步：预扫描收集所有 `[/xxx]` 模式的 type 5 token → 递归解析时用该集合判断 section 类型。

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

#### 4. 原始二进制文件

不需要解析，直接原样写出。

| 扩展名 | 说明 |
|--------|------|
| `.bin` | `stringtable.bin` 等 |
| `.exe` | 可执行文件 |
| `.img` | 图片原始数据 |
| `.info`、`.evn`、`.pos` 等 | 其他二进制数据 |

### 判断逻辑

代码层面的文件类型判断优先级（`src/pvf/extract.ts`）：

```
if (扩展名 === .ani)           → Binary ANI（反编译）
else if (扩展名 === .str)      → BIG5 文本
else if (扩展名 === .nut)      → EUC-KR 文本
else if (排除 stringtable.bin / n_string.lst 且 data.length > 7)
  └─ if (isScriptFile(data))   → ScriptFile（前 2 字节 === 0xD0B0）
else                           → 原始二进制
```

---

### PVF 内部文件格式

#### stringtable.bin

字符串索引表，包含所有 ScriptFile 中引用的字符串键：

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