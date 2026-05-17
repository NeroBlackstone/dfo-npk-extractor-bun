# ANI → JSON 转换规范

PVF 二进制动画文件 `.ani` 到 JSON 的序列化规范。

## 整体结构

```jsonc
{
  "framesCount": 6,
  "resources": [
    "creature/monster/slime.img"
  ],
  "loop": true,
  "shadow": false,
  "frames": [
    {
      "imgId": 0,
      "imgParam": 0,
      "path": "creature/monster/slime.img",
      "x": 0,
      "y": 0,
      "coord": 0,
      "rateX": 1.0,
      "rateY": 1.0,
      "rotate": 0.0,
      "color": "0xffffffff",
      "loop": false,
      "shadow": false,
      "interpolation": false,
      "delay": 50,
      "damageType": 0,
      "sound": "",
      "setFlag": 0,
      "flipType": 0,
      "clip": [0, 0, 0, 0],
      "loopStart": false,
      "loopEnd": 0,
      "itemType": 0,
      "effectColor": null,
      "effectPos": null,
      "damageBox": [
        { "type": 14, "values": [0, 0, 100, 100, 50, 50] }
      ],
      "attackBox": [
        { "type": 15, "values": [0, 0, 80, 80, 40, 40] }
      ]
    }
  ]
}
```

## 二进制格式

二进制 ANI 文件结构：

```
+------------------+------------+
| framesCount      | 2 bytes   | uint16 - 总帧数
+------------------+------------+
| countOfResources | 2 bytes   | uint16 - 资源路径数量
+------------------+------------+
| resourceLen[i]   | 4 bytes   | int32 - 第 i 个路径长度
+------------------+------------+
| resourceStr[i]   | N bytes   | ASCII - 路径 (转小写)
+------------------+------------+
| animParamCount   | 2 bytes   | uint16 - 动画级参数数量
+------------------+------------+
| animParam[]      | ...       | 动画级参数
+------------------+------------+
| frame[0]         | ...       | 帧数据
+------------------+------------+
| frame[1]         | ...       |
+------------------+------------+
| ...              |           |
+------------------+------------+
```

### 动画级参数

每个参数：`type(2 bytes) + data`

| type | 名称 | 数据 | 说明 |
|------|------|------|------|
| 0 | LOOP | int8 (1 byte) | 是否循环播放 |
| 1 | SHADOW | int8 (1 byte) | 是否显示阴影 |
| 3 | COORD | uint16 (2 bytes) | 坐标系 |
| 18 | SPECTRUM | 可变 | 光谱效果参数 |
| 28 | OPERATION | uint16 (2 bytes) | 操作类型 |

### 帧数据结构

```
+------------------+------------+
| boxCount         | 2 bytes   | uint16 - 碰撞盒数量
+------------------+------------+
| box[0].type      | 2 bytes   | 14=DAMAGE_BOX, 15=ATTACK_BOX
+------------------+------------+
| box[0].values    | 24 bytes  | 6 × int32
+------------------+------------+
| ...              |           | 重复 boxCount 次
+------------------+------------+
| imgId            | 2 bytes   | int16, -1 表示无图像
+------------------+------------+
| imgParam         | 2 bytes   | uint16, 仅 imgId >= 0 时存在
+------------------+------------+
| x                | 4 bytes   | int32
+------------------+------------+
| y                | 4 bytes   | int32
+------------------+------------+
| propertyCount    | 2 bytes   | uint16 - 帧属性数量
+------------------+------------+
| property[]       | ...       | 帧属性 (type+data)
+------------------+------------+
```

### 帧属性类型

| type | 名称 | 数据 | 说明 |
|------|------|------|------|
| 0 | LOOP | int8 (1 byte) | 是否循环 |
| 1 | SHADOW | int8 (1 byte) | 是否显示阴影 |
| 10 | INTERPOLATION | int8 (1 byte) | 是否启用插值 |
| 3 | COORD | uint16 (2 bytes) | 坐标系 |
| 7 | IMAGE_RATE | 8 bytes | rateX(float) + rateY(float) |
| 8 | IMAGE_ROTATE | 4 bytes | rotate(float) |
| 9 | RGBA | 4 bytes | R,G,B,A 各 1 byte |
| 11 | GRAPHIC_EFFECT | 可变 | 图形特效 |
| 12 | DELAY | 4 bytes (int32) | 帧延迟(ms) |
| 13 | DAMAGE_TYPE | 2 bytes (uint16) | 伤害类型 |
| 16 | PLAY_SOUND | 可变 | 长度(int32) + 音效路径 |
| 17 | PRELOAD | 无 | 预加载，无额外数据 |
| 23 | SET_FLAG | 4 bytes (int32) | 标志位 |
| 24 | FLIP_TYPE | 2 bytes (uint16) | 翻转类型 (1=水平, 2=垂直, 3=全部) |
| 25 | LOOP_START | 无 | 循环起始标记 |
| 26 | LOOP_END | 4 bytes (int32) | 循环结束标记 |
| 27 | CLIP | 8 bytes | 4 × int16 裁剪区域 |
| 2, 4, 5, 6, 19, 20, 21, 22 | 未知 | 无数据 | 保留类型，跳过 |

### GRAPHIC_EFFECT 详细格式

`type(2 bytes) + itemType(2 bytes) + [额外数据]`

| itemType | 名称 | 额外数据 |
|----------|------|----------|
| 0 | NONE | 无 |
| 1 | DODGE | 无 |
| 2 | LINEARDODGE | 无 |
| 3 | DARK | 无 |
| 4 | XOR | 无 |
| 5 | MONOCHROME | R,G,B (3 bytes) |
| 6 | SPACEDISTORT | X,Y (2 × int16 = 4 bytes) |

## JSON 输出格式

### 顶层结构

```jsonc
{
  "framesCount": 6,        // uint16
  "resources": [...],     // string[] - 资源路径数组
  "loop": true,           // boolean
  "shadow": false,        // boolean
  "frames": [...]         // AniFrame[]
}
```

### 帧对象 (AniFrame)

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| imgId | number | 0 | 资源索引，-1 表示无图像 |
| imgParam | number | 0 | 图像参数 |
| path | string | "" | 资源路径 (小写) |
| x | number | 0 | X 坐标 |
| y | number | 0 | Y 坐标 |
| coord | number | 0 | 坐标系 |
| rateX | number | 1.0 | X 缩放比例 |
| rateY | number | 1.0 | Y 缩放比例 |
| rotate | number | 0.0 | 旋转角度 |
| color | string | "0xffffffff" | RGBA 颜色 (十六进制字符串) |
| loop | boolean | false | 是否循环 |
| shadow | boolean | false | 是否显示阴影 |
| interpolation | boolean | false | 是否启用插值 |
| delay | number | 50 | 帧延迟 (ms) |
| damageType | number | 0 | 伤害类型 |
| sound | string | "" | 音效路径 |
| setFlag | number | 0 | 标志位 |
| flipType | number | 0 | 翻转类型 (1=水平, 2=垂直, 3=全部) |
| clip | number[] | [0,0,0,0] | 裁剪区域 [x1, y1, x2, y2] |
| loopStart | boolean | false | 是否为循环起始帧 |
| loopEnd | number | 0 | 循环结束帧索引 |
| itemType | number | 0 | 图形特效类型 |
| effectColor | object \| null | null | 单色效果颜色 {r, g, b} |
| effectPos | object \| null | null | 空间扭曲位置 {x, y} |
| damageBox | AniBox[] | [] | 伤害盒数组 |
| attackBox | AniBox[] | [] | 攻击盒数组 |

### 碰撞盒对象 (AniBox)

| 字段 | 类型 | 说明 |
|------|------|------|
| type | number | 14=DAMAGE_BOX, 15=ATTACK_BOX |
| values | number[] | 6 个 int32 值 [x1, y1, x2, y2, cx, cy] |

## 完整示例

### 示例 1：基本动画

```jsonc
{
  "framesCount": 2,
  "resources": [
    "creature/monster/slime_0.img",
    "creature/monster/slime_1.img"
  ],
  "loop": true,
  "shadow": false,
  "frames": [
    {
      "imgId": 0,
      "imgParam": 0,
      "path": "creature/monster/slime_0.img",
      "x": 0,
      "y": 0,
      "coord": 0,
      "rateX": 1.0,
      "rateY": 1.0,
      "rotate": 0.0,
      "color": "0xffffffff",
      "loop": false,
      "shadow": false,
      "interpolation": false,
      "delay": 100,
      "damageType": 0,
      "sound": "",
      "setFlag": 0,
      "flipType": 0,
      "clip": [0, 0, 0, 0],
      "loopStart": true,
      "loopEnd": 0,
      "itemType": 0,
      "effectColor": null,
      "effectPos": null,
      "damageBox": [],
      "attackBox": []
    },
    {
      "imgId": 1,
      "imgParam": 0,
      "path": "creature/monster/slime_1.img",
      "x": 10,
      "y": 5,
      "coord": 0,
      "rateX": 1.0,
      "rateY": 1.0,
      "rotate": 0.0,
      "color": "0xffffffff",
      "loop": false,
      "shadow": false,
      "interpolation": false,
      "delay": 100,
      "damageType": 0,
      "sound": "",
      "setFlag": 0,
      "flipType": 0,
      "clip": [0, 0, 0, 0],
      "loopStart": false,
      "loopEnd": 0,
      "itemType": 0,
      "effectColor": null,
      "effectPos": null,
      "damageBox": [],
      "attackBox": []
    }
  ]
}
```

### 示例 2：带碰撞盒和特效

```jsonc
{
  "framesCount": 1,
  "resources": [
    "creature/monster/skill.ani"
  ],
  "loop": false,
  "shadow": true,
  "frames": [
    {
      "imgId": 0,
      "imgParam": 0,
      "path": "creature/monster/skill.ani",
      "x": 100,
      "y": 200,
      "coord": 0,
      "rateX": 1.5,
      "rateY": 1.5,
      "rotate": 45.0,
      "color": "0xff8040ff",
      "loop": false,
      "shadow": true,
      "interpolation": true,
      "delay": 50,
      "damageType": 1,
      "sound": "skill/fire.wav",
      "setFlag": 0,
      "flipType": 1,
      "clip": [0, 0, 200, 200],
      "loopStart": false,
      "loopEnd": 0,
      "itemType": 5,
      "effectColor": { "r": 128, "g": 128, "b": 128 },
      "effectPos": null,
      "damageBox": [
        { "type": 14, "values": [-50, -50, 50, 50, 0, 0] }
      ],
      "attackBox": [
        { "type": 15, "values": [-30, -30, 30, 30, 0, 0] }
      ]
    }
  ]
}
```

### 示例 3：空间扭曲特效

```jsonc
{
  "framesCount": 1,
  "resources": [
    "creature/monster/portal.ani"
  ],
  "loop": true,
  "shadow": false,
  "frames": [
    {
      "imgId": 0,
      "imgParam": 0,
      "path": "creature/monster/portal.ani",
      "x": 0,
      "y": 0,
      "coord": 0,
      "rateX": 1.0,
      "rateY": 1.0,
      "rotate": 0.0,
      "color": "0xffffffff",
      "loop": true,
      "shadow": false,
      "interpolation": false,
      "delay": 66,
      "damageType": 0,
      "sound": "",
      "setFlag": 0,
      "flipType": 0,
      "clip": [0, 0, 0, 0],
      "loopStart": false,
      "loopEnd": 0,
      "itemType": 6,
      "effectColor": null,
      "effectPos": { "x": 10, "y": -10 },
      "damageBox": [],
      "attackBox": []
    }
  ]
}
```

## 类型映射速查

| 二进制 type | 名称 | JSON 字段 | 数据类型 |
|-------------|------|-----------|----------|
| - | framesCount | framesCount | number |
| - | resources | resources | string[] |
| 0 | LOOP | loop | boolean |
| 1 | SHADOW | shadow | boolean |
| - | - | frames | AniFrame[] |
| - | box.type=14 | damageBox[].type | number |
| - | box.type=15 | attackBox[].type | number |
| - | box.values | [].values | number[6] |
| - | imgId | imgId | number |
| - | imgParam | imgParam | number |
| - | path | path | string |
| - | x, y | x, y | number |
| 3 | COORD | coord | number |
| 7 | IMAGE_RATE | rateX, rateY | number |
| 8 | IMAGE_ROTATE | rotate | number |
| 9 | RGBA | color | string (hex) |
| 0 | LOOP | frame.loop | boolean |
| 1 | SHADOW | frame.shadow | boolean |
| 10 | INTERPOLATION | interpolation | boolean |
| 11 | GRAPHIC_EFFECT | itemType | number |
| 11 | MONOCHROME | effectColor | {r,g,b} |
| 11 | SPACEDISTORT | effectPos | {x,y} |
| 12 | DELAY | delay | number |
| 13 | DAMAGE_TYPE | damageType | number |
| 16 | PLAY_SOUND | sound | string |
| 23 | SET_FLAG | setFlag | number |
| 24 | FLIP_TYPE | flipType | number |
| 25 | LOOP_START | loopStart | boolean |
| 26 | LOOP_END | loopEnd | number |
| 27 | CLIP | clip | number[4] |

## 注意事项

1. **资源路径转小写**：二进制中的路径存储为 ASCII，转 JSON 时统一转为小写
2. **颜色格式**：RGBA (0xRRGGBBAA) 转为 `"0xFFFFFFFF"` 格式的十六进制字符串
3. **imgId = -1**：表示该帧无图像关联，`path` 为空字符串，`imgParam` 不存在
4. **effectColor/effectPos**：仅当 itemType 为对应类型时存在，否则为 `null`
5. **loopEnd**：值为 int32，表示循环结束帧索引
6. **clip**：4 个 int16 值，通常表示裁剪区域坐标 [x1, y1, x2, y2]