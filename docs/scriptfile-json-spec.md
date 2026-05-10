# ScriptFile → JSON 转换规范

PVF ScriptFile 二进制 token 流到 JSON 树的序列化规范。

## 核心概念

- **section 块 `{}`**：一个独立 section 的完整内容，包含其所有子节点
- **container section 始终为数组 `[{...}]`**：每个元素是一个独立 section 块，即使只有一个
- **叶子值**：leaf section 直接输出值，不包 section 块

## 顶层结构

输出文件命名为 `{原文件名}.{原扩展名}.json`，例如 `snowman.mob` → `snowman.mob.json`。

顶层为 `[]` 数组，每个元素是一个顶层 section 块：

```jsonc
[
  {
    "mob": {
      "name": "史莱姆",
      "level": [{ "value": 10 }]
    }
  }
]
```

## 节点类型

### Section（container）

container section 输出为 `"name": [{}]` 形式，始终为数组，每个元素是一个 section 块：

```jsonc
{
  "dungeon": [
    { "static_data": [130, 150, 500] }
  ]
}
```

即使只有一个 section 块，也保持数组形式：

```jsonc
{
  "input": [
    { "state_check": { "d": 700, "time": 700 } }
  ]
}
```

**判断规则**：预扫描所有 type 5 token，如果字符串表中存在 `[/name]` 形式的 token → container。

### Section（leaf）

leaf section 输出为 `"name": value` 形式，value 为基础类型或数组：

```jsonc
{
  "level": 10,                        // 单值
  "width": [1, 1],                    // 多值
  "name": "史莱姆",                    // 单个 String
  "command": ["(UP)", "(RIGHT)"]      // 多个 String
}
```

**单值简化**：leaf section 只含一个 token 时，直接输出值，不包数组。

### Section（empty）

section 内无任何子 token 时，输出 `null`。常见于 `.key` 等配置文件中的空占位：

```jsonc
{
  "input": null,
  "state_check": [{ "target_current_direction": 50, "time": 100 }]
}
```

### 重复 section

同级出现多个同名 container section 时，每个 section 块作为数组的一个元素：

```jsonc
"input": [
  { "state_check": { "target_current_direction": 50, "time": 100 } },
  { "state_check": { "d": 700, "time": 700 } }
]
```

与单个 container 形式一致，无需特殊处理。

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
            if children.length == 0:
                // 空 section: 无子 token，输出 null
                nodes.push({ [name]: null })
            elif isContainer:
                // container: 合并子节点为 object
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

### 第四步：container 包装

将每个 container section 包装为数组：

```
function wrapContainers(nodes):
    result = []
    for node in nodes:
        name = Object.keys(node)[0]
        value = node[name]
        if value is object and not Array.isArray(value):
            result.push({ [name]: [value] })
        else:
            result.push(node)
    return result
```

顶层 `parseBody` 的返回值直接调用 `wrapContainers`，即为最终 JSON 数组。

### 第五步：StringLink 合并

type 9 (StringLinkIndex) 必须与下一个 type 10 (StringLink) 合并为一个字符串。type 9 的 data 作为 listId，type 10 的 data 经 stringtable 解析后作为 name。输出格式为 `"@{listId}::{name}"`。不做 `.str` 文件的实际查找，仅保留索引信息。

## 完整示例

### 示例 1：简单数值 section

```jsonc
// [level] → 10
[
  { "level": 10 }
]

// [width] → 1 1
[
  { "width": [1, 1] }
]
```

### 示例 2：嵌套 section

```jsonc
// [dungeon] → [/dungeon]，内部有 [static data]
[
  {
    "dungeon": [
      { "static_data": [130, 150, 500] }
    ]
  }
]
```

### 示例 3：混合内容

```jsonc
// [mob] 内含值 + 嵌套 section + leaf section
[
  {
    "mob": {
      "name": "史莱姆",
      "level": [{ "value": 10 }, { "value": 20 }, { "value": 30 }],
      "ability_category": [1, 2]
    }
  }
]
```

### 示例 4：StringLink

```jsonc
// type 9(listId=12) + type 10(strIdx=5)
"@12::monster_name"
```

### 示例 5：技能出招表

```jsonc
// [command] → [/command]，内部全是 cmd 和 sep
[
  {
    "command": ["(UP)", "(RIGHT)", "(SKILL)"]
  }
]
```

### 示例 6：重复 section

```jsonc
// 两个 [input]，各自内部有 [state_check]
[
  {
    "input": [
      { "state_check": { "target_current_direction": 50, "time": 100 } },
      { "state_check": { "d": 700, "time": 700 } }
    ]
  }
]
```

### 示例 7：空 section

```jsonc
// [input] 内无任何子 token
[
  {
    "input": null
  }
]
```

## 类型映射速查

| 二进制 type | 名称 | JSON 表示 |
|-------------|------|-----------|
| 2 | Int | `number` |
| 3 | IntEx | `number` |
| 4 | Float | `number` |
| 5 | Section (leaf) | `"name": value` 或 `"name": [v1, v2, ...]` |
| 5 | Section (container) | `"name": [{...}]`（始终为数组） |
| 5 | Section (empty) | `"name": null` |
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
5. **container section 始终为数组**，每个元素是一个独立 section 块，无论是否重复
6. **leaf section 不含嵌套子 section**，否则应视为 container
