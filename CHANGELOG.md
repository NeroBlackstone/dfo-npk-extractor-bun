# Changelog

## v0.4.0

- `--link` 模式下新增音频元数据 JSON，记录来源 NPK 和 OGG 文件列表

## v0.3.0

- 添加 `--link` 模式，生成 LINK 帧映射文件
- PNG 元数据新增 `NpkFile` 字段，记录来源 NPK 文件名
- PNG 元数据新增 `ImgName` 字段，记录来源 IMG 路径
- 支持通过 CLI 参数指定 NPK 文件路径
- LINK 映射文件改为生成到 IMG 目录内：`{imgDir}/{basename}.links.json`

## v0.2.0

- 添加了 v4 IMG格式支持
- 添加了音频文件支持

## v0.1.0

- 添加 v2 IMG格式支持