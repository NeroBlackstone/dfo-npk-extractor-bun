import { parseArgs } from "node:util";
import { generateTresFiles } from "./src/ani/tres";
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
		"ani-dir": {
			type: "string",
			default: WORK_DIR,
		},
		prefix: {
			type: "string",
			default: "sprite/",
		},
		output: {
			type: "string",
			default: "pvf",
		},
	},
	allowPositionals: true,
	strict: true,
});

const [command, ...cmdPositionals] = positionals;

function showHelp() {
	console.log(
		`
npk-extractor <command> [options]

Commands:
  npk       从 NPK 文件解压 sprite/audio
  tres      扫描 .ani 文件，为共享 npk 生成 .tres
  pvf       解密并提取 PVF 文件中的内容

Options:
  --help        显示帮助
  --link        启用 LINK 帧映射模式（仅 npk）
  --ani-dir     扫描 .ani 文件的目录（仅 tres，默认: cwd）
  --prefix      .tres 内资源路径的前缀（仅 tres，默认: sprite/）
  --output      输出目录（仅 pvf，默认: pvf）

Examples:
  npk-extractor npk                        # 解压 cwd 中所有 npk
  npk-extractor npk some.npk               # 解压单个 npk
  npk-extractor npk --link                # 带 link 模式解压
  npk-extractor tres                       # 扫描 cwd 生成 .tres
  npk-extractor tres --ani-dir ./animations
  npk-extractor pvf file.pvf               # 提取 PVF 所有文件到 pvf/
  npk-extractor pvf file.pvf --output ./out
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
		generateTresFiles({
			aniDir: values["ani-dir"],
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
			outputDir: values.output,
		});
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
