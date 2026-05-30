import { mkdirSync, readdirSync, statSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { parseArgs } from "node:util";
import { generateTresFiles } from "./src/ani/tres";
import { decryptAvi, isEncryptedAvi } from "./src/avi";
import { extract } from "./src/npk/extract";
import { extractPvf } from "./src/pvf";

const WORK_DIR = ".";

const { positionals, values } = parseArgs({
	args: Bun.argv.slice(2),
	options: {
		link: {
			type: "boolean",
			default: false,
		},
		help: {
			type: "boolean",
			default: false,
		},
		"npk-dir": {
			type: "string",
			default: WORK_DIR,
		},
		pvf: {
			type: "string",
			default: "",
		},
		prefix: {
			type: "string",
			default: "sprite/",
		},
		output: {
			type: "string",
		},
		recursive: {
			type: "boolean",
			default: false,
		},
	},
	allowPositionals: true,
	strict: true,
});

const [command, ...cmdPositionals] = positionals;

function showHelp() {
	console.log(
		`
dfo-extractor <command> [options]

Commands:
  npk       从 NPK 文件解压 sprite/audio
  tres      从 PVF 读取二进制 .ani，结合 NPK 生成 .tres
  pvf       解密并提取 PVF 文件中的内容
  avi       解密加密的 avi 视频文件

Options:
  --help        显示帮助
  --link        启用 LINK 帧映射模式（仅 npk）
  --pvf         PVF 文件路径（仅 tres，必选）
  --npk-dir     NPK 文件目录（仅 tres，用于 LINK 解析，默认: cwd）
  --prefix      .tres 内资源路径的前缀（仅 tres，默认: sprite/）
  --output      输出目录（仅 pvf/avi，默认: pvf 或 avi）
  --recursive   递归处理目录（仅 avi）

Examples:
  dfo-extractor npk                        # 解压 cwd 中所有 npk
  dfo-extractor npk some.npk               # 解压单个 npk
  dfo-extractor npk --link                # 带 link 模式解压
  dfo-extractor tres --pvf character.pvf   # 从 PVF 生成 .tres
  dfo-extractor tres --pvf f.pvf --npk-dir ./npk/ --prefix sprite/
  dfo-extractor pvf file.pvf               # 提取 PVF 所有文件到 pvf/
  dfo-extractor pvf file.pvf --output ./out
  dfo-extractor avi                        # 解密 cwd 中所有 avi
  dfo-extractor avi video.avi             # 解密单个 avi 文件
  dfo-extractor avi ./videos --output ./out --recursive
  `.trim(),
	);
}

switch (command) {
	case "npk": {
		const npkFileArg = cmdPositionals[0] ?? null;
		extract({
			npkPath: npkFileArg,
			linkMode: values.link,
			workDir: WORK_DIR,
			outputBase: WORK_DIR,
		});
		break;
	}
	case "tres": {
		const pvfPath = values.pvf;
		if (!pvfPath) {
			console.error("Error: 请指定 PVF 文件路径 (--pvf)");
			showHelp();
			process.exit(1);
		}
		await generateTresFiles({
			pvfPath,
			npkDir: values["npk-dir"],
			prefix: values.prefix,
		});
		break;
	}
	case "pvf": {
		const pvfFile = cmdPositionals[0];
		if (!pvfFile) {
			console.error("Error: 请指定 PVF 文件路径");
			showHelp();
			process.exit(1);
		}
		await extractPvf({
			pvfPath: pvfFile,
			outputDir: values.output ?? "pvf",
		});
		break;
	}
	case "avi": {
		const inputPath = cmdPositionals[0] ?? WORK_DIR;
		const outputDir = values.output ?? "avi/";
		const recursive = values.recursive;

		function processAviFile(srcPath: string): void {
			if (!isEncryptedAvi(srcPath)) {
				console.log(`跳过非加密 avi: ${srcPath}`);
				return;
			}

			const dstPath = join(outputDir, basename(srcPath));
			mkdirSync(outputDir, { recursive: true });
			decryptAvi(srcPath, dstPath);
			console.log(`解密: ${srcPath} -> ${dstPath}`);
		}

		const stats = statSync(inputPath);
		if (stats.isFile()) {
			processAviFile(inputPath);
		} else if (stats.isDirectory()) {
			mkdirSync(outputDir, { recursive: true });
			const entries = readdirSync(inputPath, { recursive });
			const aviFiles = entries
				.filter(
					(f) => typeof f === "string" && extname(f).toLowerCase() === ".avi",
				)
				.map((f) => join(inputPath, f as string));

			let count = 0;
			for (const file of aviFiles) {
				try {
					processAviFile(file);
					count++;
				} catch (e) {
					console.error(`处理失败: ${file} - ${e}`);
				}
			}
			console.log(`完成: 解密 ${count} 个文件`);
		}
		break;
	}
	case "help":
	case undefined:
		if (values.help || command === undefined) {
			showHelp();
		} else {
			console.error(`Unknown command: ${command}`);
			showHelp();
			process.exit(1);
		}
		break;
	default:
		console.error(`Unknown command: ${command}`);
		showHelp();
		process.exit(1);
}
