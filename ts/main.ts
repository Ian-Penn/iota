import { HashCache, readFile, TODO_addError } from "./utilities.js";
import logger from "./logger.js";
import { lex } from "./lexer.js";
import { parse, ParserMode } from "./parser.js";
import { Report } from "./report.js";
import { buildAST, BuilderSettings, OptLevel } from "./builder.js";
import { CodeGenContext, printAST } from "./ASTnodes.js";

function nextArg(): string {
	return process.argv[i++];
}

const helpText = `
flags:
  -log ~ enable compiler logging

modes:
  init <modulePath>
  runFile <filePath>
  start <modulePath>
`;

let i = 2;

if (process.argv[i] == undefined) {
	console.log(helpText);
} else {
	main();
}

type BuilderSettingsChanges = {
	[Property in keyof BuilderSettings]?: BuilderSettings[Property]
};

function genFile(filePath: string, builderSettingsChanges: BuilderSettingsChanges): string | null {
	const text = readFile(filePath);
	if (text == null) TODO_addError();
	
	let tokens;
	let AST;
	try {
		const lexStart = Date.now();
		tokens = lex(filePath, text);
		logger.addTime("lexing", Date.now() - lexStart);
		
		const parseStart = Date.now();
		AST = parse({
			tokens: tokens,
			i: 0,
		}, ParserMode.normal, 0, null);
		logger.addTime("parsing", Date.now() - parseStart);
		console.log(`AST:\n${printAST(new CodeGenContext(), AST).join("\n")}\n`);
		
		// const outputText = codegen(AST, new CodegenSettings());
		// console.log("outputText:\n" + outputText);
		
		const outputText = buildAST(AST, Object.assign(new BuilderSettings(), builderSettingsChanges));
		console.log("outputText:\n" + outputText);
		
		return outputText;
	} catch (error) {
		if (error instanceof Report) {
			console.error(error.getText("error: ", true, true));
			return null;
		} else {
			throw error;
		}
	}
}

function main() {
	const builderSettingsChanges: BuilderSettingsChanges = {};
	builderSettingsChanges.addDebugger = true;
	builderSettingsChanges.logging = true;
	
	while (process.argv[i].startsWith("-")) {
		const flag = nextArg();
		if (flag == "-log") {
			logger.enableLogs();
		}
		
		else if (flag == "-g") {
			builderSettingsChanges.addDebugger = true;
			builderSettingsChanges.logging = true;
		}
		
		else {
			TODO_addError();
		}
	}
	
	const mode = nextArg();
	
	switch (mode) {
		case "runFile": {
			const filePath = nextArg();
			const outputText = genFile(filePath, builderSettingsChanges);
			if (outputText == null) return;
			console.log("\nruning...\n");
			new Function(outputText)();
			
			break;
		}
	
		default: {
			TODO_addError();
		}
	}
}