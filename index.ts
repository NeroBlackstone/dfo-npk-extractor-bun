import { parseArgs } from "node:util";
import { generateTresFiles } from "./src/ani/tres";
import { extract } from "./src/npk/extract";

const WORK_DIR = ".";
const OUTPUT_BASE = ".";

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
		output: {
			type: "string",
			default: OUTPUT_BASE,
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
  extract   从 NPK 文件解压 sprite/audio
  tres      扫描 .ani 文件，为共享 npk 生成 .tres

Options:
  --help        显示帮助
  --link        启用 LINK 帧映射模式（仅 extract）
  --ani-dir     扫描 .ani 文件的目录（仅 tres，默认: cwd）
  --output      .tres 文件输出目录（仅 tres，默认: cwd）

Examples:
  npk-extractor extract                    # 解压 cwd 中所有 npk
  npk-extractor extract some.npk           # 解压单个 npk
  npk-extractor extract --link            # 带 link 模式解压
  npk-extractor tres                       # 扫描 cwd 生成 .tres
  npk-extractor tres --ani-dir ./animations
  `.trim(),
	);
}

switch (command) {
	case "extract": {
		const npkFileArg = cmdPositionals[0] ?? null;
		extract({
			npkPath: npkFileArg,
			linkMode: values.link,
			workDir: WORK_DIR,
			outputBase: OUTPUT_BASE,
		});
		break;
	}
	case "tres": {
		generateTresFiles({
			aniDir: values["ani-dir"],
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
