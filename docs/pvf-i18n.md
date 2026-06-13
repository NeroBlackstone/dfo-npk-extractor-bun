# PVF 国际化（i18n）与字符串替换机制

本文档详细说明 PVF 包内的多语言文本如何存储、引用与解析。涉及 `stringtable.bin`、`n_string.lst`、`<topic>.<lang>.str` 三类文件的协作机制，以及 ScriptFile 中的 `StringLink`（type 9 + type 10）如何完成 key→翻译的替换。

> 配套阅读：[`pvf-format.md`](./pvf-format.md)（PVF 整体结构）· [`scriptfile-json-spec.md`](./scriptfile-json-spec.md)（ScriptFile 二进制格式）

---

## 一、TL;DR

PVF 的 i18n 由**三层**构成：

```
┌─────────────────────────────────────────────────────────────┐
│  stringtable.bin  (字符串池 / 共享字典)                       │
│  ===============                                             │
│  • 90% 路径/节标记 (swordman/..., [name], [/name])            │
│  • 5%  i18n key (name_3035, explain_3035, multi_hit_ex_name) │
│  • 5%  默认/基础翻译 (紅色小晶塊, 鬼劍士/黑騎士用技能, ...)   │
└─────────────────────────────────────────────────────────────┘
                            ↑ 4 字节索引
                            │
┌─────────────────────────────────────────────────────────────┐
│  ScriptFile (e.g. cubepiece_red.stk)                          │
│  ===================                                          │
│  [type=9  listId=13]    ← StringLinkIndex 翻译表编号         │
│  [type=10 idx=395628]   → binMap[395628] = "name_3035"       │
└─────────────────────────────────────────────────────────────┘
                            ↓ listId 解析
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  n_string.lst (翻译表注册表)                                  │
│  ======================                                       │
│  listId 0..25 → <topic>.<lang>.str                            │
│  listId=13   → stackable/Stackable.kor.str                    │
└─────────────────────────────────────────────────────────────┘
                            ↓ 加载 .str
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  stackable/Stackable.kor.str (主题翻译表)                     │
│  ============================                                 │
│  name_3035>紅色小晶塊                                          │
│  name2_3035>...                                                │
│  explain_3035>...                                              │
└─────────────────────────────────────────────────────────────┘
```

**关键事实**：

1. ScriptFile 中**不存**翻译文本本身，只存 key（`name_3035`）
2. key 通过 stringtable.bin 压缩为 4 字节索引
3. key 翻译成目标语言文本，存放在 `<topic>.<lang>.str` 中
4. `.str` 文件按**主题**分类（Equipment、Stackable、Monster 等），不按语言
5. **语言切换** = 换一组 `.str` 文件（`.kor.str` / `.jpn.str` / `.chn.str` / 无后缀）
6. stringtable.bin 还独立存一份"默认翻译"作为 fallback

---

## 二、各组件详解

### 2.1 `stringtable.bin` —— 字符串池

详见 [`pvf-format.md#stringtablebin`](./pvf-format.md#stringtablebin)。**简言之**：

```
+------------------+
| count            | 4 bytes   | 字符串数量
+------------------+
| offset[0..count] | (count+1)×4 bytes
+------------------+
| stringData       | 剩余      | BIG5 编码的字符串池
+------------------+
```

`parseStringTable(data)` 返回 `string[]`（下标即 id）。本仓库解析出共 **432,582** 条字符串。

**字符串池的"三重身份"**：

| 身份 | 占比 | 例子 | 用途 |
|---|---|---|---|
| 路径 | ~70% | `swordman/kagemaru/kagemaru.aic` | 文件路径、节名标记 |
| i18n key | ~5% | `name_3035`、`explain_410993` | 供 `.str` 翻译的目标 key |
| 默认翻译 | ~5% | `紅色小晶塊` | 客户端 fallback 显示 |

> 实测：43 万串中含中文字符的有 20,279 条（4.7%），纯韩文 21,496 条（5.0%），纯 ASCII 39 万条（90.4%）。**没有**日文假名（0 个）。

---

### 2.2 ScriptFile 的 StringLink（type 9 + type 10）

ScriptFile 二进制中，**翻译 key 引用** 跨两个连续 token：

| Token | Type | 含义 |
|---|---|---|
| `[09] [listId]` | 9 = StringLinkIndex | 翻译表编号（指向 n_string.lst 的条目序号） |
| `[0A] [strIdx]` | 10 = StringLink | key 字符串的 stringtable 索引 |

具体例子（`stackable/material/cubepiece_red.stk` 起始 token 流）：

```
B0 D0                  ← ScriptFile magic
05 A5 2C 00 00         ← type=5,  value=11429  → binMap[11429] = "[name]"   (节标记)
09 0D 00 00 00         ← type=9,  value=13     → listId=13                  (翻译表编号)
0A 6C 09 06 00         ← type=10, value=395628 → binMap[395628] = "name_3035"
05 1F 47 00 00         ← type=5,  value=18406  → binMap[18406] = "[name2]"
09 0D 00 00 00         ← type=9,  value=13
0A D7 EF 03 00         ← type=10, value=258007 → binMap[258007] = "name2_3035"
05 D9 41 00 00         ← type=5,  value=16857  → binMap[16857] = "[explain]"
09 0D 00 00 00         ← type=9,  value=13
0A 6D 09 06 00         ← type=10, value=395629 → binMap[395629] = "explain_3035"
```

代码侧的实现（`src/pvf/decoders/script-file-json.ts:336-346`）：

```ts
case 9: {
    return undefined; // StringLinkIndex is handled by the next type 10 token
}

case 10: {
    // If previous token was type 9 (StringLinkIndex), combine them
    const prevToken = index > 0 ? tokens[index - 1] : null;
    const listId = prevToken?.type === 9 ? prevToken.listId : 0;
    const keyName = ctx.binMap[token.value] || "";
    return `@${listId}::${keyName}`;
}
```

输出 JSON 中看到 `"@13::name_3035"`，就是这个机制。

---

### 2.3 `n_string.lst` —— 翻译表注册表

> 详细二进制格式见 [`pvf-format.md#n_stringlst`](./pvf-format.md#n_stringlst)

**结构**：

```
[D0 B0]   ← ScriptFile magic
[06 字节 padding]
[4 字节 stringtable index]    ← 引用一个 .str 文件名
[06 字节 padding]
[4 字节 stringtable index]
...
```

**核心约定**：每条索引**按出现顺序编号**，编号就是 `listId`。

实际解析（基于 `dist/Script.pvf`）：

```
listId= 0   →  Character/Character.kor.str
listId= 1   →  Common/Common.kor.str
listId= 2   →  Dungeon/Dungeon.kor.str
listId= 3   →  equipment/equipment.kor.str
listId= 4   →  Etc/Etc.kor.str
listId= 5   →  ItemShop/ItemShop.kor.str
listId= 6   →  Map/Map.kor.str
listId= 7   →  Monster/Monster.kor.str
listId= 8   →  Npc/Npc.kor.str
listId= 9   →  PassiveObject/PassiveObject.kor.str
listId=10   →  Pet/Pet.kor.str
listId=11   →  n_Quest/Quest.kor.str
listId=12   →  Skill/Skill.kor.str
listId=13   →  stackable/Stackable.kor.str   ← cubepiece_red.stk 用这个
listId=14   →  Town/Town.kor.str
listId=15   →  WorldMap/WorldMap.kor.str
listId=16   →  Creature/Creature.kor.str
listId=17   →  AICharacter/AICharacter.kor.str
listId=18   →  n_Quest/EpicQuest.kor.str
listId=19   →  Region/Region.kor.str
listId=20   →  UI/UI.kor.str
listId=21   →  PVP_Mission/mission.kor.str
listId=22   →  Etc/RandomOption/RandomOption.kor.str
listId=23   →  Event/Event.kor.str
listId=24   →  ChatEmoticon/ChatEmoticon.kor.str
listId=25   →  ClientOnly/ClientOnly.kor.str
```

实测扫描 200 个脚本文件的 StringLink 引用分布：

| listId | 翻译表 | 引用次数 | 主题 |
|---|---|---|---|
| 3 | equipment/equipment.kor.str | **409** | 装备（最常用）|
| 13 | stackable/Stackable.kor.str | **121** | 堆叠物/材料 |
| 12 | Skill/Skill.kor.str | 34 | 技能 |
| 7 | Monster/Monster.kor.str | 16 | 怪物 |
| 0/1/2/4..25 | (其他主题) | <10 | 各自 |

---

### 2.4 `<topic>.<lang>.str` —— 主题翻译表

每个 `.str` 文件存**一个主题**的 `key>value` 翻译对，文本格式（非二进制）：

```
// 注释行（以 // 开头，解析时会被收为 kv，但带 // 前缀的 key 实际无意义）
// 07.03.02 ?? ???? ?? ?? 30? -

//(original)category_06_01>鬼劍士/黑騎士用技能
//(original)explain_3330>深淵派對入場券\n根據入場地下城的等級消耗數量也不同...
npc_name_GSD>GSD
npc_name_albert>阿爾伯特
npc_name_glam>格林
map_name_455>PVP 無名
map_name_460>赫頓瑪爾的月光酒館改
name_3035>紅色小晶塊
```

**`.str` 后缀即语言标识**（来自 `src/pvf/decoders/str-json.ts`）：

| 后缀 | 编码 | 客户端 |
|---|---|---|
| `.chn.str` / `.chs.str` | GBK | 简中服 |
| `.kor.str` | EUC-KR | 韩服 |
| `.jpn.str` | BIG5 兜底 | 日服 |
| `.str` (无后缀) | BIG5 | 繁中服（基础）|

> ⚠️ **实测发现**：本仓库的 `dist/Script.pvf` 中 `.kor.str` 实际是 **BIG5 编码**（与后缀不符），强制按 EUC-KR 解码会出乱码。详见 [§四 已知问题](#四已知问题)。

---

## 三、完整解析流程（以 cubepiece_red.stk 为例）

### 步骤 1：解析 stringtable.bin

```
binMap[395628] = "name_3035"
binMap[258006] = "紅色小晶塊"        ← 默认翻译（fallback）
```

### 步骤 2：解析 n_string.lst

```
listIdToFile[13] = "stackable/Stackable.kor.str"
```

### 步骤 3：加载 `<listId=13>` 对应的 `.str` 文件

按当前客户端语言选 `.str`：

| 客户端语言 | 优先查找 | 备选 |
|---|---|---|
| 简中 | `stackable/Stackable.chn.str` | `.kor.str` / stringtable |
| 韩文 | `stackable/Stackable.kor.str` | stringtable |
| 日文 | `stackable/Stackable.jpn.str` | stringtable |
| 繁中 | `stackable/Stackable.str`（无后缀）| stringtable |

加载后得到 `Map<string, string>`：

```ts
{
  "name_3035": "紅色小晶塊",
  "name2_3035": "...",
  "explain_3035": "...",
  ...
}
```

### 步骤 4：解析 cubepiece_red.stk

遇到 token 流：

```
[05] binMap[11429] = "[name]"          ← 节标记
[09] 13                                 ← listId
[10] binMap[395628] = "name_3035"       ← key
```

引擎按**优先级链**解析：

```
1. 查 strMap = listIdToFile[13] 对应 .str 里的 "name_3035" → "紅色小晶塊"
2. 找到了 → 显示 "紅色小晶塊"
3. 没找到 → 在 stringtable.bin 中找"同 key 串"（如 binMap[258006] = "紅色小晶塊"）→ 显示
4. 还没找到 → 显示 key 本身 "name_3035"
```

### 步骤 5：JSON 输出

```json
{
  "name": [
    "@13::name_3035"
  ],
  "name2": [
    "@13::name2_3035"
  ],
  "explain": [
    "@13::explain_3035"
  ]
}
```

`@13::` 是**调试占位符**，原意是留给上层做翻译替换。本仓库当前**未实现**自动替换（详见 [§四](#四已知问题)）。

---

## 四、已知问题

### 4.1 当前 `extract.ts` 不会做翻译替换

`buildStringContext` 构造了 `stringMap: Map<key, value>`（`src/pvf/build-string-context.ts`），但下游 `parseScriptFileToJson` **只查 `binMap`，不查 `stringMap`**。结果就是反编译产物里保留 `"@13::name_3035"` 这种 key 引用形式。

### 4.2 `.kor.str` 强制按 EUC-KR 解码 → 乱码

`src/pvf/decoders/str-json.ts:14-18`：

```ts
if (lower.endsWith(".chn.str") || lower.endsWith(".chs.str")) return "gbk";
if (lower.endsWith(".kor.str")) return "euc-kr";
if (lower.endsWith(".jpn.str")) return "big5";
return "big5";
```

实测 `stackable.kor.str` 原始字节：

```
原始 hex: 6e616d655f333033353e acf5a6e2a470b4b9b6f4 0d
                name_3035       > 紅   色  小  晶  塊  \r
当 EUC-KR 解码: name_3035>¬õ¦â¤p´¹¶ô       ← 乱码
当 BIG5 解码:   name_3035>紅色小晶塊          ← 正确
```

`stackable.kor.str` 是 **BIG5 编码** 的繁中翻译（与 `.kor` 后缀不符）。建议在 `encodingForStrFile` 中加 BIG5 兜底：

```ts
if (lower.endsWith(".kor.str")) {
    // 实际可能是 BIG5 编码的繁中（混合服版本）
    return "big5";
}
```

### 4.3 23 万条翻译多数在 stringMap 里查不到

构造 stringMap 时（`parseNStringLst`）只读 `n_string.lst` 引用的 26 个 `.str` 文件，得到 **246,781** 条翻译。但 `.str` 里 value 已经是**翻译后的目标语言文本**（不是 base），所以这些不能用作"原始 key 的回退翻译"。

简单说：**`stringMap` 内的 key 和 stringtable.bin 内的 i18n key 不完全对应**——`.str` 的 key 命名是人为约定，stringtable 里的 key 是脚本引用，必须有统一来源才能匹配。

---

## 五、提取器增强路线

要让 `dfo-extractor pvf` 真正按语言切换输出，需要在 `extractFile`（`src/pvf/extract.ts`）里加翻译层：

```ts
// 概念伪代码
function resolveStringLink(listId: number, keyName: string, ctx: PvfStringContext): string {
    // 1. 查 listId 对应 .str 里的翻译
    const strFile = ctx.listIdToFile[listId];   // 新增字段
    const translationMap = ctx.translations[strFile];  // 预先按客户端 locale 加载
    if (translationMap?.has(keyName)) {
        return translationMap.get(keyName)!;
    }

    // 2. 查 stringtable.bin 里"同 key 的 fallback 翻译"
    //    通过预扫描建立 key → 默认翻译的映射
    const fallback = ctx.keyToDefault.get(keyName);
    if (fallback) return fallback;

    // 3. 显示 key 本身
    return keyName;
}
```

CLI 端加 `--lang` 参数：

```bash
dfo-extractor pvf Script.pvf --lang chn     # 简中
dfo-extractor pvf Script.pvf --lang kor     # 韩文
dfo-extractor pvf Script.pvf --lang jpn     # 日文
dfo-extractor pvf Script.pvf --lang base    # stringtable 默认
```

---

## 六、参考：实测数据

来源：仓库 `dist/Script.pvf`（2021-05-27 版，181 MB，325,142 文件）。

| 指标 | 数值 |
|---|---|
| stringtable.bin 字符串总数 | 432,582 |
| 含 CJK（中日韩） | 20,279（4.69%）|
| 含纯韩文（AC00-D7AF） | 21,496（4.97%）|
| 含平/片假名 | 0 |
| 含日文汉字 | 极少 |
| n_string.lst 条目数 | 26 |
| 主题翻译表总数 | 26（17 个 .kor.str + 9 个 .jpn.str）|
| stringMap 总 key 数 | 246,781 |
| 其中 value 是 CJK | 17,650 |

样例翻译（来自 `stringMap` 实际值，BIG5 解码）：

```
npc_name_albert    > 阿爾伯特
npc_name_glam      > 格林
map_name_455       > PVP 無名
map_name_460       > 赫頓瑪爾的月光酒館改
quest_conflagration_01 > 有人蹤跡的...？
quest_conflagration_02 > 請守護森林
```

> 注：以上 `value` 均为**繁体中文**（含「騎」「蹟」「請」等繁中字形），非简中。这份 PVF 是"繁中 base + 韩/日 服注释"的混合包。

---

## 七、相关源码索引

| 关注点 | 文件 |
|---|---|
| 解析 stringtable.bin | `src/pvf/string-table.ts:8` `parseStringTable` |
| 解析 .str 文本 | `src/pvf/decoders/str-json.ts:42` `convertStrToJsonObject` |
| 解析 n_string.lst | `src/pvf/string-table.ts:77` `parseNStringLst` |
| 构造 stringMap | `src/pvf/build-string-context.ts:8` `buildStringContext` |
| ScriptFile type 9/10 处理 | `src/pvf/decoders/script-file-json.ts:336-346` |
| 按后缀选 .str 编码 | `src/pvf/decoders/str-json.ts:12` `encodingForStrFile` |
| 解码器路由 | `src/pvf/decoders/index.ts:33` `decoders` |
| PVF 文件提取入口 | `src/pvf/extract.ts:24` `extractPvf` |
