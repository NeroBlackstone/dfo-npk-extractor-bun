# ScriptFile → JSON 转换规范

PVF ScriptFile 二进制 token 流到 JSON 树的序列化规范。

## 顶层结构

输出文件命名为 `{原文件名}.{原扩展名}.json`，例如 `snowman.mob` → `snowman.mob.json`。

顶层为 `{}` 对象，直接包含各子 section，不保留根 section 包装：

```jsonc
{
  "level": 10,
  "width": [1, 1],
  // ...其他子 section
}
```

## 节点类型

### Section

所有 section 统一为 `"name": value` 形式，通过值的类型区分 leaf 和 container：

```jsonc
{
  "level": 10                          // leaf：单值
  "width": [1, 1]                     // leaf：多值
  "name": "史莱姆"                     // leaf：单个 String
  "command": ["(UP)", "(RIGHT)"]      // leaf：多个 String
  "dungeon": {                         // container：{} 包裹子 section
    "static_data": [130, 150, 500]
  }
}
```

**判断规则**：预扫描所有 type 5 token，如果字符串表中存在 `[/name]` 形式的 token → container（值为 `{}`）；否则 → leaf（值为基础类型或 `[]`）。

**单值简化**：leaf section 只含一个 token 时，直接输出值，不包类型标记。

**Command（type 6）**：直接输出字符串，不加包装。**CommandSeparator（type 8）**：丢弃，无语义。

### 基础值

| 类型 | 二进制 type | JSON 表示 |
|------|------------|-----------|
| Int | 2 | `number` |
| Float | 4 | `number` |
| IntEx | 3 | `number` |
| String | 7 | `string`（直接输出） |
| Command | 6 | `string`（直接输出） |
| CommandSeparator | 8 | 丢弃 |

### StringLink

二进制 type 9 + type 10 成对出现。type 9 提供 listId（指向 `.str` 文件），type 10 提供 key name。

格式：`"@{listId}::{name}"`，`@` 前缀为唯一标识，无歧义。

查找路径：`listId` → `n_string.lst[listId]` → `.str` 文件名 → 该文件中 `key=name` 的条目 → 解析文本。

完整示例（`snowman.mob`）：

```jsonc
{
  "width": [40, 10],

  "common_champion_elemental_property": [
    "@0::water_element",
    "@0::dark_element"
  ],

  "ability_category": [
    "@1::hp_max", "*", 140,
    "@1::phys_atk", "*", 100
  ],

  "category": [
    "@2::undead",
    "@2::melee_combat",
    "@2::close_carefully"
  ],

  "level": [18, 33],
  "dark_resistance": [30, 30]
}
```

## 解析算法

### 第一步：扁平化

从偏移 2 开始，每 5 字节读取一个 token：

```
[token: 1 byte type][data: 4 bytes LE int32]
```

产出扁平 token 列表 `tokens[]`。

### 第二步：预扫描 container names

遍历所有 type 5 token，检查 stringtable 内容是否匹配 `[/xxx]` 模式：

```
containerNames = Set<string>()
for token in tokens:
    if token.type == 5:
        name = stringtable[token.data]
        if name starts with "[/" and ends with "]":
            containerNames.add(name[2..^1])  // 提取内部名称
```

### 第三步：递归构建树

```
function parseBody(tokens, start, end):
    nodes = []
    i = start
    while i < end:
        token = tokens[i]
        if token.type == 5:
            name = stringtable[token.data]
            isContainer = containerNames.has(name)
            if isContainer:
                closeIdx = findCloseTag(tokens, i+1, name)
                sectionEnd = closeIdx
            else:
                sectionEnd = findNextSection(tokens, i+1, end)

            children = parseBody(tokens, i+1, sectionEnd)
            if isContainer:
                // container: 转为 object，子 section 名作为 key
                obj = {}
                for child in children:
                    for key, value in child:
                        obj[key] = value
                nodes.push({ [name]: obj })
            else:
                // leaf: 单值简化
                if children.length == 1:
                    nodes.push({ [name]: children[0] })
                else:
                    nodes.push({ [name]: children })
            i = sectionEnd + (isContainer ? 1 : 0)
        else:
            if token.type == 8:  // CommandSeparator: 丢弃
                i++
            else:
                nodes.push(parseLeaf(token, tokens[i+1]))
                i += (token.type == 9) ? 2 : 1
    return nodes
```

### 第四步：StringLink 合并

type 9 (StringLinkIndex) 必须与下一个 type 10 (StringLink) 合并为一个字符串。type 9 的 data 作为 listId，type 10 的 data 经 stringtable 解析后作为 name。输出格式为 `"@{listId}::{name}"`。不做 `.str` 文件的实际查找，仅保留索引信息。

## 完整示例

### 示例 1：简单数值 section

```jsonc
// [level] → 10
"level": 10

// [width] → 1 1
"width": [1, 1]
```

### 示例 2：嵌套 section

```jsonc
// [dungeon] → [/dungeon]，内部有 [static data]
"dungeon": {
  "static_data": [130, 150, 500]
}
```

### 示例 3：混合内容

```jsonc
// [mob] 内含值 + 嵌套 section + leaf section
"mob": {
  "name": "史莱姆",
  "level": [10, 20, 30],
  "ability_category": [1, 2]
}
```

### 示例 4：StringLink

```jsonc
// type 9(listId=12) + type 10(strIdx=5)
"@12::monster_name"
```

### 示例 5：技能出招表

```jsonc
// [command] → [/command]，内部全是 cmd 和 sep
"command": ["(UP)", "(RIGHT)", "(SKILL)"]
```

## 类型映射速查

| 二进制 type | 名称 | JSON 表示 |
|-------------|------|-----------|
| 2 | Int | `number` |
| 3 | IntEx | `number` |
| 4 | Float | `number` |
| 5 | Section (leaf) | `"name": value` 或 `"name": [v1, v2, ...]` |
| 5 | Section (container) | `"name": { 子 section, ... }` |
| 6 | Command | `string`（直接输出） |
| 7 | String | `string`（直接输出） |
| 8 | CommandSeparator | 丢弃 |
| 9+10 | StringLink | `"@{listId}::{name}"` |

## .str 文件转换

`.str` 文件是本地化字符串字典，格式为 `key>value`，每行一条。被 StringLink 通过 `listId` 引用。

### 转换规则

| 源文件 | 输出文件 | 内容 |
|--------|----------|------|
| `*.str` | `*.str.json` | key → 翻译文本 |

### JSON 格式

输出为扁平对象，key 为原始 key，value 为 `>` 后的文本：

```json
{
  "name_6505": "슬라임",
  "name_6506": "고블린",
  "hp_max": "HP MAX"
}
```

### 解析规则

按行读取，跳过 `//` 开头的注释行和空行。每行以 `>` 分割为 key 和 value。

## LST 文件转换

`.lst` 文件是 ScriptFile 格式的查找表（ID → 名称映射），无任何 section，纯扁平 token 流。

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

输出为扁平对象，key 为 Int token 值（ID），value 为 StringLink 解析后的文本：

```json
{
  "0": "swordman/swordman.chr",
  "1": "fighter/fighter.chr",
  "2": "gunner/gunner.chr"
}
```

### 解析规则

遍历扁平 token 流，每两个 token 为一组：

1. token A（StringLink 或 String）→ 解析为文本，作为 value
2. token B（Int）→ 作为 key

跳过 `n_string.lst`（内部翻译索引，不导出）。

## 注意事项

1. **StringLinkIndex (type 9) 永远与下一个 token (type 10) 成对出现**，不可单独出现
2. **container 的闭标签 token 不出现在 JSON 中**，仅用于界定对象范围
3. **Int 和 Float 在 JSON 中都是 number**，如需区分可在解析时保留原始 type 信息（扩展方案：`{ "int": 42 }` / `{ "float": 3.14 }`）
4. **section 名称去除 `[]` 包裹，空格替换为下划线**，例如 `[/action info]` → `action_info`
5. **重复 section 自然映为 object 中的同名 key 数组**，无需特殊处理
6. **leaf section 不含嵌套子 section**，否则应视为 container
