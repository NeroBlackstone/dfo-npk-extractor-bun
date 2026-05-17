# ScriptFile → JSON 转换规范

PVF ScriptFile 二进制 token 流到 JSON 树的序列化规范。

## 核心概念

- **section 块**：一个独立 section 的完整内容，包含其所有子节点和值
- **token**：二进制中的最小单元，`[type: 1 byte][data: 4 bytes]`

### Container Section

**定义**：有对应闭标签 `[/name]` 的 section。

**特征**：
- 二进制中存在 type 5 token 且字符串表条目以 `[/` 开头
- section 内部可以包含子 section、值 token，或两者都有
- 输出时在 JSON 中表现为数组

**判断方法**：预扫描所有 type 5 token，统计字符串表中是否存在 `[/name]` 形式的条目。如果存在 → container。

### Leaf Section

**定义**：无闭标签 `[/name]` 的 section。

**特征**：
- 二进制中不存在对应的 `[/name]` 闭标签
- section 内部只包含值 token，不含子 section
- 输出时直接输出值数组

### Empty Section

**定义**：section 存在但内部既无值 token 也无子 section。

**输出**：`null`

## 顶层结构

输出文件命名为 `{原文件名}.{原扩展名}.json`，例如 `snowman.mob` → `snowman.mob.json`。

顶层为 `[]` 数组，每个元素是一个**顶层 section 块**。即使只有一个顶层 section，也保持数组形式。

**顶层 section**：每个顶层 section 各自成为数组中的一个独立对象。

```jsonc
[
  { "index": [50] },
  { "new_page": null },
  { "image": [1, 7, 22, 0, 0, 0, "interface/newstyle/windows/guide/content.img", 17] },
  { "text": [10, 265, 310, 0, "合成装扮时..."] }
]
```

**为什么顶层用数组**：顶层 section 可能出现重名（如 `[input]` 出现 4 次），JSON 对象 key 不能重复，所以每个 section 独立为对象。

## 二进制格式

从第 2 字节开始，每 5 字节为一组 token：

```
[type: 1 byte][data: 4 bytes] 重复直到文件末尾
```

### Token 类型定义

| Type | 名称 | Data 格式 | 说明 |
|------|------|-----------|------|
| 2 | Int | int32 LE | 普通整数 |
| 3 | IntEx | int32 LE | 扩展整数 |
| 4 | Float | float32 LE | 浮点数 |
| 5 | Section | string table index | 节名，指向字符串表 |
| 6 | Command | string table index | 命令，指向字符串表 |
| 7 | String | string table index | 字符串值，指向字符串表 |
| 8 | CommandSeparator | string table index | 命令分隔符，丢弃 |
| 9 | StringLinkIndex | int32 | 字符串链接索引，listId |
| 10 | StringLink | string table index | 字符串链接，指向字符串表 |

### 字符串表

字符串表（`stringtable.bin`）存储所有 section 名称和字符串值。字符串表条目格式为：

- 开标签：`[sectionName]`  → 二进制中为 type 5 + 字符串表索引
- 闭标签：`[/sectionName]` → 二进制中为 type 5 + 字符串表索引，解析时字符串表条目本身含 `[/` 前缀

**重要**：section 名称本身可能含 `[]`，如 `[title]`、`[think]`、`[void]`。名称中的空格在 JSON key 中用下划线替代（如 `base ani` → `base_ani`）。解析时按原样输出 section 名称。

**注意**：字符串 `` `[xxx]` `` 在 PVF 文件中是一个 section 名称，不是普通字符串值。因此 `` `[think]` ``、`[void]`、`[/think]` 等都是 section 标签，而非字符串内容。

## 节点类型

### Section（container）

container section 有对应闭标签 `[/name]`。输出为数组形式 `[{...}]`。

```jsonc
[
  {
    "dungeon": [
      { "static_data": [130, 150, 500] }
    ]
  }
]
```

**container 内容是单 key JSON 对象**：container 的值是 `[{key: values}]` 形式，每个子 section 是独立对象。

**container 自身有值时**：当 container 同时有自身值和子 section 时，自身值用 `_value` 数组标记。

```jsonc
{
  "uidata": [
    { "_value": ["pos"] },
    { "index": [0] },
    { "pos": [80, 20] }
  ]
}
```

### Section（leaf）

leaf section 无闭标签，直接输出值数组。

**顶层 leaf**：

```jsonc
[
  { "level": [10] },
  { "width": [1, 1] },
  { "name": ["史莱姆"] },
  { "command": ["(", "UP", ")", "(", "RIGHT", ")"] }
]
```

### 基础值

| 类型 | 二进制 type | JSON 表示 | 说明 |
|------|------------|-----------|------|
| Int | 2 | `number` | 普通整数 |
| Float | 4 | `number` | 浮点数，无小数点时补 `.0` |
| IntEx | 3 | `number` | 扩展整数，与 Int 合并输出 |
| String | 7 | `string` | 字符串值 |
| Command | 6 | `string` | 命令/按键值 |
| CommandSeparator | 8 | 丢弃 | 无语义，不输出 |

### StringLink（type 9 + type 10）

二进制中 type 9 和 type 10 必须成对出现：
- type 9（data = int32）：listId，指向 `.str` 文件
- type 10（data = string table index）：key name，指向字符串表

格式：`"@{listId}::{keyName}"`

**解析路径**：
1. `listId` → `n_string.lst[listId]` → 得到 `.str` 文件名
2. 在该 `.str` 文件中查找 `key={keyName}` 的条目
3. 解析 `value` 部分（格式：`key>value`）

**解析失败时**：保留原始格式 `"@{listId}::{keyName}"`，不抛出错误。

## 完整示例

### 示例 1：多个顶层 section

```jsonc
[
  { "index": [50] },
  { "new_page": null },
  { "image": [1, 7, 22, 0, 0, 0, "interface/newstyle/windows/guide/content.img", 17] },
  { "text": [10, 265, 310, 0, "合成装扮时..."] }
]
```

### 示例 2：嵌套 section（container）

```jsonc
[
  {
    "dungeon": [
      { "static_data": [130, 150, 500] }
    ]
  }
]
```

### 示例 3：container 内多个子 section

```jsonc
[
  {
    "trigger": [
      {
        "all": [
          { "call_the_name": ["creature/.../talk_call.ani"] },
          { "using_skill": ["creature/.../talk_skill.ani"] },
          { "state_special": ["creature/.../talk_random.ani"] }
        ]
      }
    ]
  }
]
```

### 示例 4：container 自身有值（_value）

```jsonc
[
  {
    "uidata": {
      "_value": ["pos"],
      "index": [0],
      "pos": [80, 20]
    }
  }
]
```

### 示例 5：StringLink

```jsonc
"@12::monster_name"
```

### 示例 6：技能出招表

```jsonc
[
  {
    "command": ["(UP)", "(RIGHT)", "(SKILL)"]
  }
]
```

### 示例 7：空 section

```jsonc
[
  { "input": null }
]
```

### 示例 8：重复 section（多次出现）

```jsonc
[
  { "input": ["a", 50, "time", 800] },
  { "input": ["z", 700, "time", 900] }
]
```

### 示例 9：重复 container section

```jsonc
[
  {
    "cancel_skill": [
      {
        "character_job": ["[at mage]", "none", 1, 17, 21, 23, 16, 15, 13, 25, 11, 169]
      },
      {
        "character_job": ["[at mage]", "elementalbomber", 1, 17, 21, 23, 16, 15, 13, 25, 11, 169, 62, 61]
      }
    ]
  }
]
```

### 示例 10：JSON key 中空格替换为下划线

```jsonc
{
  "motion": {
    "base_ani": ["../animation/booster_particle_0.ani"],
    "sub_ani": ["../animation/booster_particle_1.ani", 0, 1, "...", 0, 7]
  }
}
```

### 示例 11：leaf section 多值为扁平数组

```jsonc
[
  { "skill_tree": ["[swordman]", "skilltree/swordman_sp.co", "[fighter]", "skilltree/fighter_sp.co"] }
]
```

## 类型映射速查

| 二进制 type | 名称 | JSON 表示 |
|-------------|------|-----------|
| 2 | Int | `number` |
| 3 | IntEx | `number` |
| 4 | Float | `number` |
| 5 | Section (leaf) | `{ "name": [values] }` |
| 5 | Section (container) | `{ "name": [{...}] }` |
| 5 | Section (empty) | `"name": null` |
| 6 | Command | `string` |
| 7 | String | `string` |
| 8 | CommandSeparator | 丢弃 |
| 9+10 | StringLink | `"@{listId}::{name}"` |

## .str 文件转换

`.str` 文件是本地化字符串字典，格式为 `key>value`，每行一条。被 StringLink 通过 `listId` 引用。

### JSON 格式

```json
{
  "name_6505": "슬라임",
  "name_6506": "고블린"
}
```

## LST 文件转换

`.lst` 文件是 ScriptFile 格式的查找表（ID → 名称映射），无任何 section，纯扁平 token 流。

### JSON 格式

```json
{
  "0": "swordman/swordman.chr",
  "1": "fighter/fighter.chr"
}
```

## 注意事项

1. **StringLinkIndex (type 9) 永远与下一个 token (type 10) 成对出现**
2. **container 的闭标签 token 不出现在 JSON 中**
3. **Int、IntEx 和 Float 在 JSON 中都是 number**
4. **section 名称保留原始格式**，包括 `[]` 包裹
5. **所有值都是数组**，包括单值也包装为数组（如 `100` → `[100]`，`"text"` → `["text"]`）
6. **leaf section 不含嵌套子 section**
7. **重复 section**：每个重复的 section 各自独立为对象
8. **StringLink 解析失败时保留原文**
9. **Float 输出时无小数点则补 `.0`**
10. **CommandSeparator (type 8) 完全丢弃**
11. **顶层 section 各自为独立对象**
12. **JSON key 中的空格**：替换为下划线
13. **container 自身有值时**：使用 `_value` 数组标记
14. **leaf section 多值**：直接输出扁平数组，如 `["[swordman]", "path1", "[fighter]", "path2", ...]`