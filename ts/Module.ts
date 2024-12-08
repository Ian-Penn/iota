import crypto from "crypto";
import { join as joinPath, dirname, basename, relative as relativePath } from "path";

import * as utilities from "./utilities.js";
import logger, { LogType } from "./logger.js";
import { Report, getIndicatorText, Indicator, removeDuplicateErrors } from "./report.js";
import {
	ASTnode,
	ASTnode_alias,
	ASTnode_command,
	ASTnode_error,
	ASTnode_identifier,
	ASTnode_object,
	BuilderContext,
	printAST,
} from "./ASTnodes.js";
import { CodeGenContext } from "./codegen.js";
import { lex } from "./lexer.js";
import { parse, ParserMode } from "./parser.js";
import { runCommand } from "./commands.js";
import { bytecode_compileTextFormat, bytecode_debug, bytecode_makeTextFormat, Environment } from "./bytecode.js";

export type IdeOptions = {
	mode: "compileFile",
};

export type CompilerOptions = {
	filePath: string,
	fancyErrors: boolean,
	includeLogs: string[],
	
	outputPath?: string,
	ideOptions?: IdeOptions,
};

// export type MetaObjectImport = {
// 	/**
// 	 * Inside the module.
// 	 */
// 	path: string,
// 	relativeFsPath: string | null,
// };

// export type MetaObject = {
// 	// version: number,
// 	imports: MetaObjectImport[],
// };

export type Import = {
	/**
	 * Inside the module.
	 */
	path: ModulePath,
	relativeFsPath: string | null,
	moduleIndex: number,
};

const moduleList: Module[] = [];
function getFromModuleList(name: string): Module | null {
	for (let i = 0; i < moduleList.length; i++) {
		const module = moduleList[i];
		if (module.name == name) {
			return module;
		}
	}
	
	return null;
}

export const pathSeparator = "_";
export class ModulePath {
	segments: string[] = [];
	
	constructor(segments: string[]) {
		for (let i = 0; i < segments.length; i++) {
			const segment = segments[i];
			const subSegments = segment.split(pathSeparator);
			for (let i = 0; i < subSegments.length; i++) {
				const subSegment = subSegments[i];
				if (subSegment != "") {
					this.segments.push(subSegment);
				}
			}
		}
	}
	
	toString(): string {
		return this.segments.join(pathSeparator);
	}
	
	isTop(): boolean {
		return this.segments.length == 0;
	}
	
	startsWith(otherPath: ModulePath): boolean {
		return this.toString().startsWith(otherPath.toString());
	}
	
	equals(otherPath: ModulePath): boolean {
		return this.toString() == otherPath.toString();
	}
}

// export class TopLevelDef {
// 	constructor(
// 		public name: string,
// 		public value: ASTnode,
// 		public relativeTo: ModulePath,
// 		public dependencies: string[],
// 	) {}
	
// 	getModuleName(): string {
// 		return this.name.split(":")[0];
// 	}
	
// 	getPath(): ModulePath {
// 		return new ModulePath([this.name.split(":")[1]]);
// 	}
	
// 	getOriginModule(): Module {
// 		const module = getFromModuleList(this.getModuleName());
// 		if (module == null) {
// 			utilities.unreachable();
// 		}
		
// 		return module;
// 	}
// }

export class Module {
	topLevelEvaluations: Indicator[] = [];
	errors: Report[] = [];
	// currentDirectory = new ModulePath([]);
	// private imports: Import[] = [];
	readonly moduleIndex: number;
	
	// private defEvalQueue: TopLevelDef[] = [];
	// private topLevelEvalQueue: TopLevelDef[] = [];
	
	/**
	 * adds this to moduleList
	 */
	constructor(
		public fsBasePath: string | null = null,
		public name: string,
		public root: ASTnode_object,
	) {
		logger.log(LogType.module, `made new Module ${fsBasePath} ${name}`);
		this.moduleIndex = moduleList.push(this)-1;
	}
	
	getFullFsPath() {
		let fsBasePath = this.fsBasePath
		if (fsBasePath == null) {
			fsBasePath = "";
		}
		return joinPath(fsBasePath, this.name);
	}
	
	getDefsPath(): string {
		if (this.fsBasePath == null) {
			utilities.unreachable();
		}
		
		return joinPath(this.fsBasePath, this.name, "defs.iota");
	}
	
	addAST(AST: ASTnode[]) {
		const text = bytecode_makeTextFormat(AST);
		console.log("\nmakeBytecodeTextFormat:\n" + text + "\n");
		
		const bytecode = bytecode_compileTextFormat(text);
		console.log("\nbytecode:\n" + bytecode_debug(bytecode) + "\n");
		
		const environment = new Environment(1000);
		
		environment.run(bytecode);
		debugger;
		console.log("\noutput:\n" + environment.debug() + "\n");
		
		// for (let index = 0; index < AST.length; index++) {
		// 	const node = AST[index];
			
		// 	if (node instanceof ASTnode_alias) {
		// 		if (!(node.left instanceof ASTnode_identifier)) {
		// 			utilities.TODO();
		// 		}
		// 		const name = node.left.name;
		// 		this.root.setMember(name, node.value);
		// 	} else {
		// 		logger.log(LogType.module, `found top level evaluation`);
				
		// 		const builderContext = new BuilderContext(this);
		// 		builderContext.local.scopes.push(this.root.members);
				
		// 		const location = node.location;
		// 		// {
		// 		// 	const error = node.getType(builderContext);
		// 		// 	if (error instanceof ASTnode_error) {
		// 		// 		if (!error.compileError) {
		// 		// 			logger.log(LogType.module, `!error.compileError`);
		// 		// 			break;
		// 		// 		}
		// 		// 		this.errors.push(error.compileError);
		// 		// 		continue;
		// 		// 	}
		// 		// }
				
		// 		console.log("getType debug:");
		// 		builderContext.debug();
		// 		builderContext.debuggerRecords = [];
				
		// 		const result = node.evaluate(builderContext);
		// 		const codeGenContext = new CodeGenContext();
		// 		codeGenContext.forceLastAliasName = false;
		// 		const resultText = result.print(codeGenContext);
				
		// 		console.log("evaluate debug:");
		// 		builderContext.debug();
				
		// 		this.topLevelEvaluations.push({ location: location, msg: `${resultText}` });
		// 	}
		// }
		
		// {
		// 	const context = new BuilderContext(this);
		// 	context.resolve = "none";
		// 	// context.resolve = "all";
		// 	const newRoot = this.root.evaluate(context);
		// 	// console.log("newRoot", newRoot.print());
		// 	if (!(newRoot instanceof ASTnode_object)) {
		// 		utilities.TODO();
		// 	}
		// 	this.root = newRoot;
		// }
	}
	
	addText(filePath: string, text: string) {
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
			
			this.addAST(AST);
		} catch (error) {
			if (error instanceof Report) {
				this.errors.push(error);
			} else {
				throw error;
			}
		}
	}
	
	outputErrorsAndEvaluations(fancyErrors: boolean) {
		const errors = removeDuplicateErrors(this.errors);

		for (let i = 0; i < errors.length; i++) {
			const error = errors[i];
			console.log(error.getText("\x1B[31merror: ", true, fancyErrors));
		}

		if (errors.length == 0) {
			if (this.topLevelEvaluations.length > 0) {
				console.log("top level evaluations:");
			}
			for (let i = 0; i < this.topLevelEvaluations.length; i++) {
				const evaluation = this.topLevelEvaluations[i];
				let indicatorText = getIndicatorText(evaluation, true, fancyErrors, evaluation.msg.includes("\n"));
				console.log(indicatorText);
			}
		} else {
			process.exitCode = 1;
		}
	}
	
	dumpDebug() {
		const context = new CodeGenContext();
		
		console.log(`name: ${this.name}`);
		console.log(`basePath: ${this.fsBasePath}`);
		console.log(`root: ${this.root.print(context)}`);
	}
}