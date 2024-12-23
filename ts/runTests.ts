import * as fs from "fs";
import path from "path";

import * as utilities from "./utilities.js";
import logger from "./logger.js";
import { lex, TokenKind } from "./lexer.js";
import { Report, getIndicatorText, removeDuplicateErrors } from "./report.js";
import { parse, ParserMode } from "./parser.js";
import { buildAST, BuilderSettings } from "./builder.js";
import { ASTnode } from "./ASTnodes.js";

const c_green = "\x1B[32m";
const c_red = "\x1B[31m"
const c_reset = "\x1B[0m";

let total = 0;
let skipped = 0;
let succeeded = 0;
let failed = 0;

function testSkip() {
	console.log(`\n\t\x1B[34mTest skipped.${c_reset}\n`);
	skipped++;
}

function testSuccess() {
	console.log(`\n\t${c_green}Test success!${c_reset}\n`);
	succeeded++;
}

function testFailure(msg: string) {
	console.log(`\n\t${c_red}Test failure:\n${msg}${c_reset}\n`);
	failed++;
	
	process.exitCode = 1;
}

// const builtinImportNode = parse({
// 	tokens: lex("__builtinImportNode__", `builtin = #import "builtin"`),
// 	i: 0,
// }, ParserMode.normal, 0, null)[0];

function testFile(filePath: string) {
	filePath = path.normalize(filePath);
	
	total++;
	
	console.log(`running test: '${filePath}'`);
	
	let comments: any;
	let mode: any;
	
	const settings = new BuilderSettings();
	let AST: ASTnode[] = [];
	let errors: Report[] = [];
	
	try {
		const text = utilities.readFile(filePath);
		if (text == null) utilities.TODO_addError();

		const lexStart = Date.now();
		const tokens = lex(filePath, text);
		if (!tokens[0] || tokens[0].kind != TokenKind.comment) {
			console.log(`unable to test file '${filePath}' (no top comment)`);
			utilities.unreachable();
		}
		
		comments = tokens[0].text.split("\n");
		mode = comments.shift();
		if (mode == "testSkip") {
			throw `__testSkip__`;
		}
		logger.addTime("lexing", Date.now() - lexStart);

		const parseStart = Date.now();
		AST = parse({
			tokens: tokens,
			i: 0,
		}, ParserMode.normal, 0, null);
		logger.addTime("parsing", Date.now() - parseStart);
		
		// AST.unshift(builtinImportNode);
	} catch (error) {
		if (error == "__testSkip__") {
			testSkip();
			return;
		} else if (error instanceof Report) {
			errors.push(error);
		} else {
			testFailure(`error: ${error}`);
			return;
		}
	}
	
	errors = removeDuplicateErrors(errors);
	
	if (errors.length == 0) {
		// function getActualOutput() {
		// 	let actualOutput = "";
		// 	for (let i = 0; i < module.topLevelEvaluations.length; i++) {
		// 		const evaluation = module.topLevelEvaluations[i];
		// 		if (actualOutput != "") {
		// 			actualOutput += "\n";
		// 		}
		// 		actualOutput += getIndicatorText(evaluation, false, options.fancyErrors, false);
		// 	}
			
		// 	return actualOutput;
		// }
		
		if (mode == "runLog") {
			const expectedOutput = comments.join("\n");
			
			settings.languageSettings.logFnName = "__testinglogFnName__";
			
			let output: any = [];
			function __testinglogFnName__() {
				output = [...output, ...arguments];
			}
			const jsCode = buildAST(AST, settings);
			new Function("__testinglogFnName__", jsCode)(__testinglogFnName__);
			const actualOutput = JSON.stringify(output);
			
			console.log(jsCode);
			console.log(output);
			
			if (expectedOutput == actualOutput) {
				testSuccess();
			} else {
				testFailure(`-- expectedOutput\n${expectedOutput}\n-- actualOutput\n${actualOutput}`);
			}
		}
		
		// if (mode == "compError") {
		// 	const expectedOutput = comments.join("\n");
		// 	testFailure(`expected error output = ${expectedOutput}\n\nactual output is success`);
		// }
		
		// else if (mode == "compSucceed") {
		// 	let output = "";
		// 	for (let i = 0; i < module.topLevelEvaluations.length; i++) {
		// 		const evaluation = module.topLevelEvaluations[i];
		// 		if (evaluation.msg != "true") {
		// 			output += getIndicatorText(evaluation, false, options.fancyErrors, false);
		// 		}
		// 	}
		// 	if (output.length == 0) {
		// 		testSuccess();
		// 	} else {
		// 		testFailure(output);
		// 	}
		// }
		
		// else if (mode == "compOut") {
		// 	const actualOutput = getActualOutput();
			
		// 	const expectedOutput = comments.join("\n");
		// 	if (expectedOutput == actualOutput) {
		// 		testSuccess();
		// 	} else {
		// 		testFailure(`-- expectedOutput\n${expectedOutput}\n-- actualOutput\n${actualOutput}`);
		// 	}
		// }
		
		// else if (mode == "topLevel") {
		// 	// const text = module.printDefs(false, false);
		// 	const text = module.root.print();
		// 	const expectedOutput = comments.join("\n");
		// 	if (expectedOutput == text) {
		// 		testSuccess();
		// 	} else {
		// 		testFailure(`-- expectedOutput\n${expectedOutput}\n-- actualOutput\n${text}`);
		// 	}
		// }
		
		// else if (mode == "codegen_js") {
		// 	const settings: CodegenJsSettings = {
		// 		addDebugComments: false,
		// 	};
			
		// 	const codegenText = codegen_js(module, ["main"], settings);
		// 	const expectedOutput = comments.join("\n");
		// 	if (expectedOutput == codegenText) {
		// 		testSuccess();
		// 	} else {
		// 		testFailure(`-- expectedOutput\n${expectedOutput}\n-- actualOutput\n${codegenText}`);
		// 	}
		// }
		
		else {
			throw `unknown mode "${mode}"`;
		}
	} else {
		let errorText = "";
		for (let i = 0; i < errors.length; i++) {
			const error = errors[i];
			if (errorText != "") {
				errorText += "\n";
			}
			errorText += error.getText("error: ", false, false);
		}
		
		if (mode == "compError") {
			const expectedOutput = comments.join("\n");
			const actualOutput = errorText;
			if (expectedOutput == actualOutput) {
				testSuccess();
			} else {
				testFailure(`-- expectedOutput\n${expectedOutput}\n-- actualOutput\n${actualOutput}`);
			}
		} else {
			testFailure(`compilation failed, output = ${errorText}`);
		}
	}
}

function testDir(dirPath: string) {
	const files = fs.readdirSync(dirPath);
	// console.log(files);
	files.forEach((file) => {
		testFile(path.join(dirPath, file));
	});
}

testDir("./tests/run");

// testDir("./tests/js");

console.log(`total: ${total}`);
console.log(`skipped: ${skipped}`);
console.log(`succeeded: ${c_green}${succeeded}${c_reset}`);
console.log(`failed: ${c_red}${failed}${c_reset}`);