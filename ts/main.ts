import { HashCache, readFile, TODO_addError } from "./utilities.js";
import logger from "./logger.js";
import { lex } from "./lexer.js";
import { parse, ParserMode } from "./parser.js";
import { Report } from "./report.js";
import { codegen } from "./codegen.js";

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

function runFile(filePath: string) {
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
		// console.log(`AST:\n${printAST(new CodeGenContext(), AST).join("\n")}\n`);
		
		// console.log("AST", AST);
		const outputText = codegen(AST);
		console.log("outputText:\n" + outputText);
	} catch (error) {
		if (error instanceof Report) {
			TODO_addError();
		} else {
			throw error;
		}
	}
}

function main() {
	while (process.argv[i].startsWith("-")) {
		const flag = nextArg();
		if (flag == "-log") {
			logger.enableLogs();
		} else {
			TODO_addError();
		}
	}
	
	const mode = nextArg();
	
	switch (mode) {
		case "runFile": {
			const filePath = nextArg();
			runFile(filePath);
			
			break;
		}
	
		default: {
			TODO_addError();
		}
	}
}