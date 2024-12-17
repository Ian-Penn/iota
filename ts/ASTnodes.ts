import { Hash, TODO, TODO_addError, unreachable } from "./utilities.js";
import logger, { LogType } from "./logger.js";

export type SourceLocation = "builtin" | {
	path: string,
	line: number,
	startColumn: number,
	endColumn: number,
	indentation: number,
	origin?: ASTnode,
};

export class CodeGenContext {
	
}

export function SourceLocation_same(a: SourceLocation, b: SourceLocation): boolean {
	if (a == "builtin" || b == "builtin") return false;
	return (
		a.path == b.path &&
		a.line == b.line &&
		a.startColumn == b.startColumn &&
		a.endColumn == b.endColumn
	);
}

function fromNode(node: ASTnode): SourceLocation {
	const location = node.location;
	if (location == "builtin") {
		return location;
	} else {
		return {
			path: location.path,
			line: location.line,
			startColumn: location.startColumn,
			endColumn: location.endColumn,
			indentation: location.indentation,
			origin: node,
		};
	}
}

function getLast<T>(array: T[]): T {
	return array[array.length-1];
}

export type ResolveMode = "none" | "types" | "all";

export class LocalBuilderContext {
	// aliases: ASTnode_alias[] = [];
	// objects: ASTnode_object[] = [];
	scopes: ASTnode[][] = [];
}

export type DebuggerRecordType = "evaluate_start" | "evaluate_end" | "getType_start" | "getType_end";

export class DebuggerRecord {
	constructor(
		public type: DebuggerRecordType,
		public location: SourceLocation,
		public text: string,
	) {}
}

export class BuilderContext {
	local = new LocalBuilderContext();
	evalStack: ASTnode[] = [];
	
	constructor() {}
	
	pushEvalStack(node: ASTnode) {
		this.evalStack.push(node);
	}
	
	popEvalStack() {
		this.evalStack.pop();
	}
	
	getAlias(name: string): ASTnode_alias | null {
		for (let i = this.local.scopes.length-1; i >= 0; i--) {
			const scope = this.local.scopes[i];
			for (let j = 0; j < scope.length; j++) {
				const alias = scope[j];
				if (
					alias instanceof ASTnode_alias &&
					alias.left instanceof ASTnode_identifier &&
					alias.left.name == name
				) {
					return alias;
				}
			}
		}
		
		return null;
	}
	
	debuggerRecords: DebuggerRecord[] = [];
	debug() {
		let indent = 0;
		console.log(this.debuggerRecords.map((record) => {
			let text = "";
			let currentIndent = indent;
			if (record.type == "evaluate_start") {
				indent++;
				text += "-> ";
			} else if (record.type == "evaluate_end") {
				indent--;
				currentIndent--;
				text += "<- ";
			} else if (record.type == "getType_start") {
				indent++;
				text += "type-> ";
			} else if (record.type == "getType_end") {
				indent--;
				currentIndent--;
				text += "type<- ";
			}
			text += "  ".repeat(currentIndent);
			
			return text + record.text;
		}).join("\n"));
	}
}

class makeHashContext {
	nextRef = 0;
	refs = new Map<ASTnode, number>();
}

function makeHash(context: makeHashContext, input: string | number | ASTnode | any[]): string {
	if (typeof input == "string" || typeof input == "number" || typeof input == "boolean") {
		const text = `${input}`;
		return `${typeof input}${text.length}${text}`;
	} else if (input instanceof Array) {
		return `array${input.length}[${input.map((element) => {
			return makeHash(context, element);
		}).join()}]`;
	} else if (input instanceof ASTnode) {
		const ref = context.refs.get(input);
		if (ref != undefined) {
			return `ref<${ref}>`
		}
		context.refs.set(input, context.nextRef);
		context.nextRef++;
		return `hash${input.getHash(context).toString()}`;
	} else {
		const text = JSON.stringify(input);
		return `json${text.length}${text}`;
	}
}

export class ASTnode {
	// lastAliasName: string | null = null;
	__cashedHash__ : Hash | null = null;
	
	id: string = "";
	
	// TODO: Use this for the builtin module for performance.
	// __CannotBeReducedMore__ = false;
	
	constructor(
		readonly location: SourceLocation,
	) {}
	
	equals(other: ASTnode): boolean {
		return this.getHash().equals(other.getHash());
	}
	
	getHash(context = new makeHashContext()): Hash {
		if (this.__cashedHash__ != null) {
			return this.__cashedHash__;
		}
		
		const hashInput = Object.keys(this).flatMap(key => {
			if (key == "prototype" || key == "location" || key == "__cashedHash__") {
				return [];
			}
			
			const value = (this as any)[key];
			
			// for ASTnode_builtinTask
			if (value instanceof Function) {
				return [];
			}
			
			return [makeHash(context, value)];
		}).join();
		
		// console.log("hashInput:", getClassName(this), Object.keys(this), hashInput);
		const hash = new Hash(hashInput);
		
		if (context.refs.size == 0) {
			this.__cashedHash__ = hash;
		}
		
		return hash;
	}
	
	/**
	 * callBack returns true when done
	 */
	analyze(callBack: (node: ASTnode) => boolean) {
		if (callBack(this) == true) {
			return;
		}
		
		Object.keys(this).forEach(key => {
			if (key == "prototype" || key == "location" || key == "__cashedHash__") {
				return;
			}
			
			const value = (this as any)[key];
			
			// for ASTnode_builtinTask
			if (value instanceof ASTnode) {
				value.analyze(callBack);
			}
			
			if (value instanceof Array) {
				value.forEach((element) => {
					if (element instanceof ASTnode) {
						element.analyze(callBack);
					}
				})
			}
		});
	}
	
	/**
	 * Should not be over written by a subclass!
	 */
	print(context = new CodeGenContext()): string {
		// if (this.location != "builtin" && this.location.origin != undefined) {
		// 	const thisIsBuiltinType = this instanceof ASTnodeType && isSomeBuiltinType(this);
			
		// 	let printOrigin = false;
		// 	const origin = this.location.origin;
			
		// 	if (context.fprintOrigin) {
		// 		printOrigin = true;
		// 	}
			
		// 	if (printOrigin) {
		// 		const oldNoPrintOrigin = context.fprintOrigin;
		// 		context.fprintOrigin = false;
		// 		const text = origin._print(context);
		// 		context.fprintOrigin = oldNoPrintOrigin;
		// 		return text;
		// 	}
		// }
		
		// const oldNoPrintOrigin = context.forceLastAliasName;
		// context.forceLastAliasName = false;
		const text = this._print(context);
		// context.forceLastAliasName = oldNoPrintOrigin;
		return text;
	}
	_print(context = new CodeGenContext()): string {
		unreachable();
	}
}

// export class ASTnode_command extends ASTnode {
// 	constructor(
// 		location: SourceLocation,
// 		readonly text: string,
// 	) {
// 		super(location);
// 	}
	
// 	_print(context = new CodeGenContext()): string {
// 		return `>${this.text}`;
// 	}
	
// 	_evaluate(context: BuilderContext): ASTnode {
// 		unreachable();
// 	}
// }

//#region literals

export class ASTnode_bool extends ASTnode {
	constructor(
		location: SourceLocation,
		readonly value: boolean,
	) {
		super(location);
	}
	
	_print(context = new CodeGenContext()): string {
		if (this.value) {
			return "true";
		} else {
			return "false";
		}
	}
}
export class ASTnode_number extends ASTnode {
	constructor(
		location: SourceLocation,
		readonly value: number,
	) {
		super(location);
	}
	
	_print(context = new CodeGenContext()): string {
		return `${this.value}`;
	}
}
export class ASTnode_string extends ASTnode {
	constructor(
		location: SourceLocation,
		readonly value: string,
	) {
		super(location);
	}
	
	_print(context = new CodeGenContext()): string {
		return `"${this.value.replaceAll("\n", "\\n").replaceAll("\"", "\\\"")}"`;
	}
}

export class ASTnode_set extends ASTnode {
	constructor(
		location: SourceLocation,
	) {
		super(location);
	}
	
	_print(context = new CodeGenContext()): string {
		return `[]`;
	}
}

export class ASTnode_atom extends ASTnode {
	constructor(
		location: SourceLocation,
	) {
		super(location);
	}
	
	_print(context = new CodeGenContext()): string {
		return `@`;
	}
}

export class ASTnode_event extends ASTnode {
	constructor(
		location: SourceLocation,
		public name: string,
		public args: ASTnode[],
	) {
		super(location);
	}
	
	_print(context = new CodeGenContext()): string {
		return `#${this.name}(${printAST(context, this.args).join(", ")})`;
	}
}

//#endregion

//#region other

export class ASTnode_alias extends ASTnode {
	unalias = false;
	
	constructor(
		location: SourceLocation,
		/**
		 * left is an ASTnode instead of a string
		 * because an ASTnode lets the left side of the alias be something like `a.b.c`
		 */
		readonly left: ASTnode,
		readonly value: ASTnode,
	) {
		super(location);
	}
	
	_print(context = new CodeGenContext()): string {
		const left = this.left.print(context);
		const value = this.value.print(context);
		return `${left} = ${value}`;
	}
}

export class ASTnode_identifier extends ASTnode {
	constructor(
		location: SourceLocation,
		readonly name: string,
	) {
		super(location);
	}
	
	_print(context = new CodeGenContext()): string {
		// if (isOperator(this.name)) {
		// 	return `(${this.name})`;
		// } else {
			return `${this.name}`;
		// }
	}
}

export class ASTnode_operator extends ASTnode {
	constructor(
		location: SourceLocation,
		readonly operatorText: string,
		readonly left: ASTnode,
		readonly right: ASTnode,
	) {
		super(location);
	}
	
	_print(context = new CodeGenContext()): string {
		const left = this.left.print(context);
		const right = this.right.print(context);
		return `(${left} ${this.operatorText} ${right})`;
	}
}

export class ASTnode_memberAccess extends ASTnode {
	constructor(
		location: SourceLocation,
		readonly left: ASTnode,
		readonly name: string,
	) {
		super(location);
	}
	
	_print(context = new CodeGenContext()): string {
		const left = this.left.print(context);
		return `${left}.${this.name}`;
	}
}

export class ASTnode_field extends ASTnode {
	constructor(
		location: SourceLocation,
		readonly name: string,
		readonly type: ASTnode,
	) {
		super(location);
	}
	
	_print(context = new CodeGenContext()): string {
		const type = this.type.print(context);
		return `${this.name}: ${type}`;
	}
}

export class ASTnode_codeBlock extends ASTnode {
	constructor(
		location: SourceLocation,
		readonly body: ASTnode[],
	) {
		super(location);
	}
	
	_print(context = new CodeGenContext()): string {
		const body = joinBody(printAST(context, this.body));
		return `{${body}\n}`;
	}
}

export class ASTnode_match extends ASTnode {
	constructor(
		location: SourceLocation,
		readonly expression: ASTnode,
		readonly codeBlock: ASTnode[],
	) {
		super(location);
	}
}

export class ASTnode_matchCase extends ASTnode {
	constructor(
		location: SourceLocation,
		readonly name: string,
		readonly types: ASTnode[],
		readonly codeBlock: ASTnode[],
	) {
		super(location);
	}
}

//#endregion

//#region utilities

export function getAliasFromList(AST: ASTnode[], name: string): ASTnode_alias | null {
	for (let i = 0; i < AST.length; i++) {
		const alias = AST[i];
		if (!(alias instanceof ASTnode_alias)) {
			unreachable();
		}
		if (alias.left instanceof ASTnode_identifier && alias.left.name == name) {
			return alias;
		}
	}

	return null;
}

export function printAST(context: CodeGenContext, AST: ASTnode[]): string[] {
	let textList: string[] = [];
	
	for (let i = 0; i < AST.length; i++) {
		let nodeText = AST[i].print(context);
		textList.push(nodeText);
	}
	
	return textList;
}

function joinBody(body: string[]): string {
	return indent("\n" + body.join("\n"));
}

function indent(text: string): string {
	return text.replaceAll("\n", "\n\t");
}

//#endregion