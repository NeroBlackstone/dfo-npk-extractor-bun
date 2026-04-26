# Changelog

## dev

- `tres` 子命令的 `--output` 参数改为 `--prefix`，用于控制 .tres 内资源路径的前缀（默认 `sprite/`）


## v0.4.0

- `.tres` 文件输出到 cwd 的 `tres/` 文件夹
- 只收集 `.ani` 文件实际使用的 IMG 的 links，避免 key 格式不匹配问题
- `--link` 模式下新增音频元数据 JSON，记录来源 NPK 和 OGG 文件列表
- 新增 `tres` 子命令，扫描 .ani 文件生成 Godot .tres 格式 SpriteFrames
- CLI 重构为子命令结构（`extract` / `tres`）
- 构建脚本迁移至 package.json（删除 `build/` 目录）


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