import * as utilities from "./utilities.js";
import logger, { LogType } from "./logger.js";
import { Module, ModulePath, TopLevelDef } from "./Module.js";
import { CompileError } from "./report.js";
import { getBuiltinType } from "./builtin.js";
import { CodeGenContext } from "./codegen.js";
import { isOperator } from "./lexer.js";

export type SourceLocation = "builtin" | {
	path: string,
	line: number,
	startColumn: number,
	endColumn: number,
	indentation: number,
	origin?: ASTnode,
};

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

export type ResolveMode = "none" | "types" | "all" | "force";

export class BuilderContext {
	aliases: ASTnode_alias[] = [];
	setUnalias: boolean = false;
	
	/**
	 * Resolve is for a case like this:
	 * 
	 * ```@x(Number) x + (1 + 1)```
	 * 
	 * If the function is a evaluated at top level, I want the AST to stay the same.
	 * If resolve always happened the output of that expression would be:
	 * 
	 * ```@x(Number) x + 2```
	 * 
	 * Which is probably fine in this case, but for more complex expressions,
	 * having everything be simplified can make things completely unreadable.
	 * And can ruin the point of abstraction!
	 */
	resolve: ResolveMode = "all";
	
	evalStack: ASTnode[] = [];
	// fnStack: ASTnode_function[] = [];
	
	currentDef: TopLevelDef | null = null;
	
	constructor(
		public module: Module,
	) {}
	
	pushEvalStack(fn: ASTnode) {
		this.evalStack.push(fn);
	}
	
	popEvalStack() {
		this.evalStack.pop();
	}
	
	isOnEvalStackOnlyIdentifiers(node: ASTnode): boolean {
		for (let i = 0; i < this.evalStack.length; i++) {
			const onStack = this.evalStack[i];
			if (!(onStack instanceof ASTnode_identifier)) {
				return false;
			}
			if (SourceLocation_same(node.location, onStack.location)) {
				return true;
			}
		}
		return false;
	}
	
	isOnEvalStack(node: ASTnode): boolean {
		for (let i = 0; i < this.evalStack.length; i++) {
			const onStack = this.evalStack[i];
			if (SourceLocation_same(node.location, onStack.location)) {
				return true;
			}
		}
		return false;
	}
	
	resolveTypes(): boolean {
		return this.resolve == "types" || this.doResolve();
	}
	
	doResolve(): boolean {
		return this.resolve == "all" || this.forceResolve();
	}
	
	forceResolve(): boolean {
		return this.resolve == "force";
	}
	
	getAlias(name: string): ASTnode_alias | null {
		for (let i = this.aliases.length-1; i >= 0; i--) {
			const alias = this.aliases[i];
			if (alias.left instanceof ASTnode_identifier && alias.left.name == name) {
				return alias;
			}
		}
		
		return null;
	}
	
	getDef(name: string): [ModulePath, TopLevelDef] | null {
		// if (name.startsWith("~")) {
		// 	const path = name.slice(1);
		// 	const def = this.module.getDef(this.module.currentDirectory, path);
		// 	if (def != null) {
		// 		return def;
		// 	}
		// } else {
		const pair = this.module.getDef(this.module.currentDirectory, new ModulePath([name]));
		if (pair != null) {
			return pair;
		}
		// }
		
		return null;
	}
}

export class ASTnode {
	deadEnd = false;
	
	constructor(
		public location: SourceLocation,
	) {}
	
	isType(): this is ASTnodeType {
		return (
			this instanceof ASTnode_object &&
			this.prototype != null &&
			this.prototype.equals(getBuiltinType("Type"))
		);
	}
	
	asBool(): boolean | null {
		if (this instanceof ASTnode_object && this.hasPrototype(getBuiltinType("Bool"))) {
			return this.data;
		} else {
			return null;
		}
	}
	
	_print(context = new CodeGenContext()): string {
		utilities.unreachable();
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
		
		const oldNoPrintOrigin = context.fprintOrigin;
		context.fprintOrigin = false;
		const text = this._print(context);
		context.fprintOrigin = oldNoPrintOrigin;
		return text;
	}
	
	getType(context: BuilderContext): ASTnodeType | ASTnode_error {
		utilities.unreachable();
	}
	
	evaluate(context: BuilderContext): ASTnode {
		return this;
	}
	
	clone(): ASTnode {
		utilities.unreachable();
	}
}

export class ASTnode_command extends ASTnode {
	constructor(
		location: SourceLocation,
		public text: string,
	) {
		super(location);
	}
	
	_print(context = new CodeGenContext()): string {
		return `>${this.text}`;
	}
	
	getType(context: BuilderContext): ASTnodeType | ASTnode_error {
		utilities.unreachable();
	}
	
	evaluate(context: BuilderContext): ASTnode {
		utilities.unreachable();
	}
}

//#region literals

export function Bool_new(location: SourceLocation, value: boolean): ASTnode_object {
	const object = new ASTnode_object(location, getBuiltinType("Bool"), []);
	object.data = value;
	return object;
}

// export class ASTnode_bool extends ASTnode {
// 	constructor(
// 		location: SourceLocation,
// 		public value: boolean,
// 	) {
// 		super(location);
// 	}
	
// 	_print(context = new CodeGenContext()): string {
// 		if (this.value) {
// 			return "true";
// 		} else {
// 			return "false";
// 		}
// 	}
	
// 	getType(context: BuilderContext): ASTnodeType | ASTnode_error {
// 		return getBuiltinType("Bool");
// 	}
	
// 	clone() {
// 		return new ASTnode_bool(this.location, this.value);
// 	}
// }
export class ASTnode_number extends ASTnode {
	constructor(
		location: SourceLocation,
		public value: number,
	) {
		super(location);
	}
	
	_print(context = new CodeGenContext()): string {
		return `${this.value}`;
	}
	
	getType(context: BuilderContext): ASTnodeType | ASTnode_error {
		return getBuiltinType("Float64");
	}
	
	clone() {
		return new ASTnode_number(this.location, this.value);
	}
}
export class ASTnode_string extends ASTnode {
	constructor(
		location: SourceLocation,
		public value: string,
	) {
		super(location);
	}
	
	_print(context = new CodeGenContext()): string {
		return `"${this.value.replaceAll("\n", "\\n").replaceAll("\"", "\\\"")}"`;
	}
	
	getType(context: BuilderContext): ASTnodeType | ASTnode_error {
		return getBuiltinType("String");
	}
	
	clone() {
		return new ASTnode_string(this.location, this.value);
	}
}
// export class ASTnode_list extends ASTnode {
// 	constructor(
// 		location: SourceLocation,
// 		public elements: ASTnode[],
// 	) {
// 		super(location);
// 	}
	
// 	_print(context = new CodeGenContext()): string {
// 		const elements = printAST(context, this.elements).join(", ");
// 		return `[${elements}]`;
// 	}
	
// 	getType(context: BuilderContext): ASTnodeType | ASTnode_error {
// 		let type = getBuiltinType("__Unknown__");
// 		for (let i = 0; i < this.elements.length; i++) {
// 			const element = this.elements[i];
// 			const elementType = element.getType(context);
// 			if (elementType instanceof ASTnode_error) {
// 				return elementType;
// 			}
// 			if (isBuiltinType(type, "__Unknown__")) {
// 				type = elementType;
// 			} else {
// 				const error = expectType(context, type, elementType);
// 				if (error != null) {
// 					// TODO: add more error context
// 					return new ASTnode_error(fromNode(this), error);
// 				}
// 			}
// 		}
// 		return makeListType(type);
// 	}
	
// 	evaluate(context: BuilderContext): ASTnode {
// 		const elements: ASTnode[] = [];
// 		for (let i = 0; i < this.elements.length; i++) {
// 			const element = this.elements[i];
// 			elements.push(element.evaluate(context));
// 		}
// 		return new ASTnode_list(fromNode(this), elements);
// 	}
// }

export type ASTnodeType = ASTnode_object & {
	prototype: ASTnode_object
};
export class ASTnode_object extends ASTnode {
	// static prototypeName = "__prototype__";
	
	public data: any = null;
	
	constructor(
		location: SourceLocation,
		public prototype: ASTnode_object | null,
		public members: ASTnode[],
	) {
		super(location);
	}
	
	hasPrototype(other: ASTnode_object): boolean {
		if (this.prototype == null) {
			return false;
		}
		
		return this.prototype.equals(other) || this.prototype.hasPrototype(other);
	}
	
	equals(other: ASTnode_object): boolean {
		return this.print() == other.print();
	}
	
	addMember(name: string, value: ASTnode) {
		const location = "builtin"; // TODO? location
		this.members.push(new ASTnode_alias(
			location,
			new ASTnode_identifier(location, name),
			value,
		));
	}
	
	_print(context = new CodeGenContext()): string {
		let prototype = "";
		if (this.prototype != null) {
			if (context.simplifyObjects) {
				if (this.prototype.equals(getBuiltinType("Bool"))) {
					return `${this.data}`;
				}
			}
			prototype = `{${this.prototype.print(context)}}`;
		}
		
		const members = joinBody(printAST(context, this.members));
		return `${prototype}{${members}\n}`;
	}
	
	getType(context: BuilderContext): ASTnodeType | ASTnode_error {
		return getBuiltinType("Any");
	}
	
	evaluate(context: BuilderContext): ASTnode {
		return this;
	}
}

//#endregion

//#region types

// export abstract class ASTnodeType extends ASTnode {
// 	constructor(
// 		location: SourceLocation,
// 		public id: string,
// 	) {
// 		super(location);
// 	}
// }

// export class ASTnodeType_struct extends ASTnodeType {
// 	constructor(
// 		location: SourceLocation,
// 		id: string,
// 		public fields: ASTnode_argument[],
// 	) {
// 		super(location, id);
// 	}
	
// 	getField(name: string): ASTnode_argument | null {
// 		for (let i = 0; i < this.fields.length; i++) {
// 			const field = this.fields[i];
// 			if (field.name == name) {
// 				return field;
// 			}
// 		}
// 		return null;
// 	}
	
// 	_print(context = new CodeGenContext()): string {
// 		let argText = printAST(context, this.fields).join(", ");
// 		if (argText.length > context.softLineMax) {
// 			argText = indent("\n" + printAST(context, this.fields).join(",\n")) + "\n";
// 		}
// 		return `struct ${this.id}{${argText}}`;
// 	}
	
// 	getType(context: BuilderContext): ASTnodeType | ASTnode_error {
// 		for (let i = 0; i < this.fields.length; i++) {
// 			const field = this.fields[i];
// 			const type = field.type.getType(context);
// 			if (type instanceof ASTnode_error) {
// 				return type;
// 			}
// 		}
		
// 		return getBuiltinType("Type");
// 	}
	
// 	evaluate(context: BuilderContext): ASTnode {
// 		// const oldResolve = context.resolve;
// 		// context.resolve = false;
// 		const fields: ASTnode_argument[] = [];
// 		for (let i = 0; i < this.fields.length; i++) {
// 			const field = this.fields[i];
// 			fields.push(field.evaluate(context));
// 		}
// 		// context.resolve = oldResolve;
// 		return new ASTnodeType_struct(fromNode(this), this.id, fields);
// 	}
	
// 	clone() {
// 		return new ASTnodeType_struct(this.location, this.id, this.fields);
// 	}
// }

// export class ASTnodeType_enum extends ASTnodeType {
// 	constructor(
// 		location: SourceLocation,
// 		id: string,
// 		public cases: ASTnode_argument[],
// 	) {
// 		super(location, id);
// 	}
	
// 	getCase(name: string): ASTnode_argument | null {
// 		for (let i = 0; i < this.cases.length; i++) {
// 			const currentCase = this.cases[i];
// 			if (currentCase.name == name) {
// 				return currentCase;
// 			}
// 		}
// 		return null;
// 	}
	
// 	getCaseIndex(name: string): number | null {
// 		for (let i = 0; i < this.cases.length; i++) {
// 			const currentCase = this.cases[i];
// 			if (currentCase.name == name) {
// 				return i;
// 			}
// 		}
// 		return null;
// 	}
	
// 	_print(context = new CodeGenContext()): string {
// 		let argText = printAST(context, this.cases).join(", ");
// 		if (argText.length > context.softLineMax) {
// 			argText = indent("\n" + printAST(context, this.cases).join(",\n")) + "\n";
// 		}
// 		return `enum ${this.id}{${argText}}`;
// 	}
	
// 	getType(context: BuilderContext): ASTnodeType | ASTnode_error {
// 		for (let i = 0; i < this.cases.length; i++) {
// 			const node = this.cases[i];
// 			const fieldType = node.type.getType(context);
// 			if (fieldType instanceof ASTnode_error) {
// 				return fieldType;
// 			}
// 		}
		
// 		return getBuiltinType("Type");
// 	}
	
// 	evaluate(context: BuilderContext): ASTnode {
// 		const fields: ASTnode_argument[] = [];
// 		for (let i = 0; i < this.cases.length; i++) {
// 			const node = this.cases[i];
// 			fields.push(node.evaluate(context));
// 		}
		
// 		return new ASTnodeType_enum(this.location, this.id, fields);
// 	}
// }

// export class ASTnodeType_functionType extends ASTnodeType {
// 	constructor(
// 		location: SourceLocation,
// 		id: string,
// 		public argType: ASTnode,
// 		public returnType: ASTnode,
// 	) {
// 		super(location, id);
// 	}
	
// 	_print(context = new CodeGenContext()): string {
// 		const argType = this.argType.print(context);
// 		const returnType = this.returnType.print(context);
// 		return `\\(${argType}) -> ${returnType}`;
// 	}
	
// 	getType(context: BuilderContext): ASTnodeType | ASTnode_error {
// 		{
// 			const argType = this.argType.getType(context);
// 			if (argType instanceof ASTnode_error) {
// 				return argType;
// 			}
// 			const error = expectType(context, getBuiltinType("Type"), argType);
// 			if (error != null) {
// 				return new ASTnode_error(this.location,
// 					error.indicator(this.location, "here")
// 				);
// 			}
// 		}
// 		{
// 			const returnType = this.returnType.getType(context);
// 			if (returnType instanceof ASTnode_error) {
// 				return returnType;
// 			}
// 			const error = expectType(context, getBuiltinType("Type"), returnType);
// 			if (error != null) {
// 				return new ASTnode_error(this.location,
// 					error.indicator(this.location, "here")
// 				);
// 			}
// 		}
		
// 		return getBuiltinType("Type");
// 	}
	
// 	evaluate(context: BuilderContext): ASTnode {
// 		const argType = this.argType.evaluate(context);
// 		const returnType = this.returnType.evaluate(context);
// 		return new ASTnodeType_functionType(fromNode(this), this.id, argType, returnType);
// 	}
// }
// export class ASTnodeType_selfType extends ASTnodeType {
// 	constructor(
// 		location: SourceLocation,
// 		id: string,
// 		public type: ASTnodeType,
// 	) {
// 		super(location, id);
// 	}
	
// 	_print(context = new CodeGenContext()): string {
// 		return `__selfType__(${this.type.print(context)})`;
// 	}
	
// 	getType(context: BuilderContext): ASTnodeType | ASTnode_error {
// 		return this.type;
// 	}
// }

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
		public left: ASTnode,
		public value: ASTnode,
	) {
		super(location);
	}
	
	_print(context = new CodeGenContext()): string {
		const left = this.left.print(context);
		const value = this.value.print(context);
		return `${left} = ${value}`;
	}
	
	/**
	 * Currently this gets the type of `value`.
	 */
	getType(context: BuilderContext): ASTnodeType | ASTnode_error {
		// const leftType = this.left.getType(context);
		// // If the left side does not give an error, then that means left is already defined.
		// if (!(leftType instanceof ASTnode_error)) {
		// 	const oldResolve = context.resolve;
		// 	context.resolve = "force";
		// 	const original = this.left.evaluate(context);
		// 	context.resolve = oldResolve;
		// 	return new ASTnode_error(fromNode(this),
		// 		new CompileError(`alias '${this.left.print()}' is already defined`)
		// 			.indicator(this.location, `redefinition here`)
		// 			.indicator(original.location, `original from here`)
		// 	);
		// }
		
		const valueType = this.value.getType(context);
		if (valueType instanceof ASTnode_error) {
			return valueType;
		}
		
		return valueType;
	}
	
	evaluate(context: BuilderContext): ASTnode {
		const value = withResolve(context, () => this.value.evaluate(context));
		
		const out = new ASTnode_alias(fromNode(this), this.left, value);
		out.unalias = this.unalias;
		return out;
	}
}

export class ASTnode_identifier extends ASTnode {
	constructor(
		location: SourceLocation,
		public name: string,
	) {
		super(location);
	}
	
	_print(context = new CodeGenContext()): string {
		if (isOperator(this.name) && !context.noParenthesesForFloatingOperators) {
			return `(${this.name})`;
		} else {
			return `${this.name}`;
		}
	}
	
	getType(context: BuilderContext): ASTnodeType | ASTnode_error {
		if (context.isOnEvalStackOnlyIdentifiers(this)) {
			// TODO: This is better than the compiler stack overflowing.
			// But this is still not a very good error message.
			return new ASTnode_error(
				this.location,
				new CompileError("recursive definition!")
					.indicator(this.location, "here")
			);
		}
		
		let value: ASTnode;
		{
			const alias = context.getAlias(this.name);
			if (alias != null) {
				value = alias.value;
			} else {
				const pair = context.getDef(this.name);
				if (pair != null) {
					value = pair[1].value;
					if (context.currentDef != null && !context.currentDef.dependencies.includes(this.name)) {
						context.currentDef.dependencies.push(this.name);
					}
				} else {
					return new ASTnode_error(fromNode(this),
						new CompileError(`alias '${this.name}' does not exist`)
							.indicator(this.location, `here`)
					);
				}
			}
		}
		
		const oldAliases = context.aliases;
		context.aliases = [];
		context.pushEvalStack(this);
		const output = value.getType(context);
		context.popEvalStack();
		context.aliases = oldAliases;
		
		return output;
	}
	
	evaluate(context: BuilderContext): ASTnode {
		let unalias = false;
		let value: ASTnode;
		let defPair: [ModulePath, TopLevelDef] | null = null;
		{
			const alias = context.getAlias(this.name);
			if (alias != null) {
				value = alias.value.evaluate(context);
				if (alias.unalias) {
					unalias = true;
				}
			} else {
				defPair = context.getDef(this.name);
				if (defPair != null) {
					value = defPair[1].value.evaluate(context);
					if (context.currentDef != null && !context.currentDef.dependencies.includes(this.name)) {
						context.currentDef.dependencies.push(this.name);
					}
				} else {
					utilities.unreachable();
				}
			}
		}
		
		if (context.forceResolve()) {
			return value;
		}
		
		// if (value instanceof ASTnode_unknowable || value instanceof ASTnodeType_selfType) {
		// 	const newIdentifier = new ASTnode_identifier(this.location, this.name);
		// 	newIdentifier.deadEnd = true;
		// 	return newIdentifier;
		// }
		
		if (context.doResolve() || unalias) {
			logger.log(LogType.resolve, `resolved ${this.name} to ${value.print()}`);
			return value;
		}
		
		let newName = this.name;
		
		if (defPair != null) {
			newName = defPair[0].toString();
		}
		
		return new ASTnode_identifier(this.location, newName);
	}
}

// export class ASTnode_function extends ASTnode {
// 	/**
// 	 * TODO: hack for builtinTasks
// 	 * 
// 	 * There might be more elegant way of doing this.
// 	 */
// 	onlyResolveOnFullCall = false;
	
// 	constructor(
// 		location: SourceLocation,
// 		public arg: ASTnode_argument,
// 		public body: ASTnode[],
// 	) {
// 		super(location);
// 	}
	
// 	_print(context = new CodeGenContext()): string {
// 		let type = this.arg.type.print(context);
// 		let body = printAST(context, this.body);
// 		if (this.body[0] instanceof ASTnode_function || !body.join("\n").includes("\n")) {
// 			return `@${this.arg.name}(${type}) ${body.join("\n")}`;
// 		} else {
// 			return `@${this.arg.name}(${type})${joinBody(body)}`;
// 		}
// 	}
	
// 	getType(context: BuilderContext): ASTnodeType | ASTnode_error {
// 		if (context.isOnEvalStack(this)) {
// 			return new ASTnode_void(fromNode(this));
// 		}
		
// 		const arg = this.arg;
// 		const argumentTypeType = arg.type.getType(context);
// 		if (argumentTypeType instanceof ASTnode_error) {
// 			return argumentTypeType;
// 		}
		
// 		let argumentType = withResolve(context, () => arg.type.evaluate(context));
// 		if (!argumentType.isType()) {
// 			argumentType = getBuiltinType("Any");
// 		}
// 		context.aliases.push(makeAliasWithType(arg.location, arg.name, argumentType as ASTnodeType));
// 		context.pushEvalStack(this);
// 		const actualResultType = getTypeFromList(context, this.body);
// 		context.popEvalStack();
// 		context.aliases.pop();
// 		if (actualResultType instanceof ASTnode_error) {
// 			return actualResultType;
// 		}
		
// 		return new ASTnodeType_functionType(fromNode(this), "", argumentType, actualResultType);
// 	}
	
// 	evaluate(context: BuilderContext): ASTnode {
// 		const arg = this.arg;
		
// 		const argumentType = arg.type.evaluate(context);
		
// 		let argValue: ASTnode = new ASTnode_unknowable(arg.location);
// 		if (argumentType instanceof ASTnodeType) {
// 			argValue = new ASTnodeType_selfType(arg.location, "TODO?", argumentType);
// 		}
		
// 		let body = this.body;
		
// 		if (!context.isOnEvalStack(this)) {
// 			context.aliases.push(new ASTnode_alias(arg.location, new ASTnode_identifier(arg.location, arg.name), argValue));
// 			const oldSetUnalias = context.setUnalias;
// 			context.setUnalias = false;
// 			context.pushEvalStack(this);
// 			body = evaluateList(context, this.body);
// 			context.popEvalStack();
// 			context.setUnalias = oldSetUnalias;
// 			context.aliases.pop();
// 		}
		
// 		const newFunction = new ASTnode_function(fromNode(this), new ASTnode_argument(arg.location, arg.name, argumentType), body);
// 		newFunction.onlyResolveOnFullCall = this.onlyResolveOnFullCall;
		
// 		// logger.log(LogType.evaluate, "newFunction", newFunction.print());
		
// 		return newFunction;
// 	}
// }

// export class ASTnode_argument extends ASTnode {
// 	constructor(
// 		location: SourceLocation,
// 		public name: string,
// 		public type: ASTnode,
// 	) {
// 		super(location);
// 	}
	
// 	_print(context = new CodeGenContext()): string {
// 		const type = this.type.print(context);
// 		return `${this.name} ${type}`;
// 	}
	
// 	evaluate(context: BuilderContext): ASTnode_argument {
// 		const type = this.type.evaluate(context);
// 		return new ASTnode_argument(fromNode(this), this.name, type);
// 	}
// }

// export class ASTnode_call extends ASTnode {
// 	constructor(
// 		location: SourceLocation,
// 		public left: ASTnode,
// 		public arg: ASTnode,
// 	) {
// 		super(location);
// 	}
	
// 	_print(context = new CodeGenContext()): string {
// 		const left = this.left.print(context);
// 		const arg = this.arg.print(context);
// 		return `(${left} ${arg})`;
// 	}
	
// 	getType(context: BuilderContext): ASTnodeType | ASTnode_error {
// 		const leftType = this.left.getType(context);
// 		if (leftType instanceof ASTnode_error) {
// 			return leftType;
// 		}
// 		if (!(leftType instanceof ASTnodeType_functionType)) {
// 			const error = new CompileError(`can not call type ${leftType.print()}`)
// 				.indicator(this.left.location, `here`);
// 			return new ASTnode_error(fromNode(this), error);
// 		}
		
// 		const functionToCall = withResolve(context, () => this.left.evaluate(context));
// 		if (!(functionToCall instanceof ASTnode_function)) {
// 			if (leftType.returnType instanceof ASTnodeType) {
// 				return leftType.returnType;
// 			} else {
// 				return getBuiltinType("Type");
// 			}
// 		}
		
// 		const functionToCallArgType = withResolve(context, () => functionToCall.arg.type.evaluate(context));
// 		if (!(functionToCallArgType instanceof ASTnodeType)) {
// 			utilities.TODO_addError();
// 		}
		
// 		const actualArgType = this.arg.getType(context);
// 		if (actualArgType instanceof ASTnode_error) {
// 			return actualArgType;
// 		}
		
// 		{
// 			const error = expectType(context, functionToCallArgType, actualArgType);
// 			if (error) {
// 				error.indicator(this.location, `for function call here`);
// 				error.indicator(this.arg.location, `(this argument)`);
// 				error.indicator(functionToCall.location, `function from here`);
// 				return new ASTnode_error(fromNode(this), error);
// 			}
// 		}
		
// 		const arg = this.arg;
		
// 		const resolved = withResolve(context, () => this.evaluate(context));
// 		if (resolved.deadEnd) {
// 			const functionToCallType = functionToCall.getType(context);
// 			if (!(functionToCallType instanceof ASTnodeType_functionType)) {
// 				utilities.unreachable();
// 			}
// 			if (!(functionToCallType.returnType instanceof ASTnodeType)) {
// 				utilities.unreachable();
// 			}
// 			return functionToCallType.returnType;
// 		} else {
// 			const newAlias = makeAliasWithType(arg.location, functionToCall.arg.name, functionToCallArgType);
// 			newAlias.unalias = true;
// 			context.aliases.push(newAlias);
// 			const returnType = resolved.getType(context);
// 			context.aliases.pop();
			
// 			return returnType;
// 		}
// 	}
	
// 	evaluate(context: BuilderContext): ASTnode {
// 		let functionToCall = this.left.evaluate(context);
// 		let argValue = this.arg.evaluate(context);
// 		let resolve = context.doResolve();
		
// 		const hasDeadEnd = functionToCall.deadEnd || argValue.deadEnd;
		
// 		{
// 			const resolvedArg = withResolve(context, () => this.arg.evaluate(context));
// 			if (context.resolveTypes() && resolvedArg instanceof ASTnodeType) {
// 				resolve = true;
// 				functionToCall = withResolve(context, () => this.left.evaluate(context))
// 				argValue = resolvedArg;
// 			}
// 		}
		
// 		if (functionToCall instanceof ASTnode_function && functionToCall.onlyResolveOnFullCall) {
// 			if (argValue.deadEnd) {
// 				resolve = false;
// 			}
// 		}
		
// 		if (
// 			!hasDeadEnd &&
// 			functionToCall instanceof ASTnode_function &&
// 			!context.isOnEvalStack(functionToCall)
// 		) {
// 			const oldSetUnalias = context.setUnalias;
// 			context.setUnalias = true;
// 			const arg = functionToCall.arg;
// 			const newAlias = new ASTnode_alias(arg.location, new ASTnode_identifier(arg.location, arg.name), argValue);
// 			newAlias.unalias = true;
// 			context.aliases.push(newAlias);
// 			if (!resolve) context.pushEvalStack(functionToCall);
// 			const resultList = evaluateList(context, functionToCall.body);
// 			let result = resultList[resultList.length-1];
// 			if (!resolve) context.popEvalStack();
// 			context.aliases.pop();
// 			context.setUnalias = oldSetUnalias;
			
// 			if (resolve) {
// 				if (this.location != "builtin") {
// 					result.location = {
// 						path: this.location.path,
// 						line: this.location.line,
// 						startColumn: this.location.startColumn,
// 						endColumn: this.location.endColumn,
// 						indentation: this.location.indentation,
// 						origin: this,
// 					};
// 				}
// 				return result;
// 			}
// 		}
		
// 		logger.log(LogType.resolve, `call: ${context.resolve} -> ${functionToCall.print()}`);
		
// 		const newCall = new ASTnode_call(fromNode(this), functionToCall, argValue);
// 		newCall.deadEnd = hasDeadEnd;
// 		return newCall;
// 	}
// }

// export class ASTnode_operator extends ASTnode {
// 	constructor(
// 		location: SourceLocation,
// 		public operatorText: string,
// 		public left: ASTnode,
// 		public right: ASTnode,
// 	) {
// 		super(location);
// 	}
	
// 	numberToNumber(op: string): boolean {
// 		return op == "+" ||
// 		       op == "-" ||
// 		       op == "*" ||
// 		       op == "/";
// 	}
	
// 	stringToBool(op: string): boolean {
// 		return op == "!=" ||
// 			   op == "==";
// 	}
	
// 	toBool(op: string): boolean {
// 		return op == "!=" ||
// 		       op == "==" ||
// 		       op == "<" ||
// 		       op == ">" ||
// 		       op == "<=" ||
// 		       op == ">=";
// 	}
	
// 	_print(context = new CodeGenContext()): string {
// 		const left = this.left.print(context);
// 		const right = this.right.print(context);
// 		if (this.operatorText == ".") {
// 			return `${left}.${right}`;
// 		} else {
// 			return `(${left} ${this.operatorText} ${right})`;
// 		}
// 	}
	
// 	getType(context: BuilderContext): ASTnodeType | ASTnode_error {
// 		const op = this.operatorText;
		
// 		if (this.numberToNumber(op) || this.toBool(op)) {
// 			const left = this.left.getType(context);
// 			if (left instanceof ASTnode_error) {
// 				return left;
// 			}
// 			const right = this.right.getType(context);
// 			if (right instanceof ASTnode_error) {
// 				return right;
// 			}
			
// 			let expectedType = getBuiltinType("Number");
// 			if (isBuiltinType(left, "String")) {
// 				expectedType = left;
// 			}
			
// 			let outType: ASTnodeType;
// 			if (this.toBool(op)) {
// 				outType = getBuiltinType("Bool");
// 			} else {
// 				if (op == "+" && isBuiltinType(left, "String") && isBuiltinType(right, "String")) {
// 					outType = getBuiltinType("String");
// 				} else {
// 					outType = getBuiltinType("Number");
// 				}
// 			}
			
// 			{
// 				let error = expectType(context, expectedType, left);
// 				if (error) {
// 					error.indicator(this.left.location, `on left of '${op}' operator`);
// 					return new ASTnode_error(fromNode(this), error);
// 				}
// 			}
// 			{
// 				let error = expectType(context, expectedType, right);
// 				if (error) {
// 					error.indicator(this.right.location, `on right of '${op}' operator`);
// 					return new ASTnode_error(fromNode(this), error);
// 				}
// 			}
			
// 			return outType;
// 		}
		
// 		else if (op == ".") {
// 			if (!(this.right instanceof ASTnode_identifier)) {
// 				utilities.TODO_addError();
// 			}
// 			const name = this.right.name;
			
// 			const leftType = this.left.getType(context);
// 			if (leftType instanceof ASTnode_error) {
// 				return leftType;
// 			}
			
// 			if (leftType instanceof ASTnodeType_struct) {
// 				if (isBuiltinType(leftType, "Type")) {
// 					const left = this.left.evaluate(context);
// 					if (left instanceof ASTnodeType_enum) {
// 						const enumCase = left.getCase(name);
// 						if (enumCase == null) {
// 							utilities.TODO_addError();
// 						}
// 						return new ASTnodeType_functionType(
// 							this.location,
// 							"",
// 							enumCase.type,
// 							left,
// 						);
// 						// return getBuiltinType("Type");
// 					} else {
// 						utilities.TODO_addError();
// 					}
// 				} else {
// 					const field = leftType.getField(name);
// 					if (field == null) {
// 						utilities.TODO_addError();
// 					}
					
// 					const type = field.type.evaluate(context);
// 					if (!(type instanceof ASTnodeType)) {
// 						utilities.unreachable();
// 					}
					
// 					return type;
// 				}
// 			} else {
// 				utilities.TODO_addError();
// 			}
// 		}
		
// 		else {
// 			utilities.TODO();
// 		}
// 	}
	
// 	evaluate(context: BuilderContext): ASTnode {
// 		const op = this.operatorText;
		
// 		if (this.numberToNumber(op) || this.toBool(op)) {
// 			const left = this.left.evaluate(context);
// 			const right = this.right.evaluate(context);
// 			if (left instanceof ASTnode_number && right instanceof ASTnode_number && context.doResolve()) {
// 				const left_v = left.value;
// 				const right_v = right.value;
				
// 				if (op == "+") {
// 					return new ASTnode_number(fromNode(this), left_v + right_v);
// 				} else if (op == "-") {
// 					return new ASTnode_number(fromNode(this), left_v - right_v);
// 				} else if (op == "*") {
// 					return new ASTnode_number(fromNode(this), left_v * right_v);
// 				} else if (op == "/") {
// 					return new ASTnode_number(fromNode(this), left_v / right_v);
// 				} else if (op == "==") {
// 					return new ASTnode_bool(fromNode(this), left_v == right_v);
// 				} else if (op == "!=") {
// 					return new ASTnode_bool(fromNode(this), left_v != right_v);
// 				} else if (op == "<") {
// 					return new ASTnode_bool(fromNode(this), left_v < right_v);
// 				} else if (op == ">") {
// 					return new ASTnode_bool(fromNode(this), left_v > right_v);
// 				} else if (op == "<=") {
// 					return new ASTnode_bool(fromNode(this), left_v <= right_v);
// 				} else if (op == ">=") {
// 					return new ASTnode_bool(fromNode(this), left_v >= right_v);
// 				}
				
// 				utilities.unreachable();
// 			} else if (left instanceof ASTnode_string && right instanceof ASTnode_string && context.doResolve()) {
// 				const left_v = left.value;
// 				const right_v = right.value;
				
// 				if (op == "+") {
// 					return new ASTnode_string(fromNode(this), left_v + right_v);
// 				} else if (op == "==") {
// 					return new ASTnode_bool(fromNode(this), left_v == right_v);
// 				} else if (op == "!=") {
// 					return new ASTnode_bool(fromNode(this), left_v != right_v);
// 				}
				
// 				utilities.unreachable();
// 			}
			
// 			const output = new ASTnode_operator(fromNode(this), this.operatorText, left, right);
// 			if (context.doResolve()) {
// 				output.deadEnd = true;
// 			}
// 			return output;
// 		} else if (op == ".") {
// 			const left = this.left.evaluate(context);
// 			debugger;
// 			if (left.deadEnd) {
// 				const output = new ASTnode_operator(fromNode(this), this.operatorText, left, this.right);
// 				if (context.doResolve()) {
// 					output.deadEnd = true;
// 				}
// 				return output;
// 			}
			
// 			if (!(this.right instanceof ASTnode_identifier)) {
// 				utilities.unreachable();
// 			}
// 			const name = this.right.name;
			
// 			if (left instanceof ASTnode_instance) {
// 				const alias = getAliasFromList(left.codeBlock, name);
// 				if (!alias) {
// 					utilities.unreachable();
// 				}
				
// 				return alias.value;
// 			} else if (left instanceof ASTnodeType_enum) {
// 				// const enumCase = left.getCase(name);
// 				// if (enumCase == null) {
// 				// 	utilities.unreachable();
// 				// }
// 				// const task = new ASTnode_builtinTask("", (context): ASTnodeType | ASTnode_error => {
// 				// 	return left;
// 				// }, (context): ASTnode => {
// 				// 	return withResolve(context, () => {
// 				// 		const input = task_getArg(context, "input");
// 				// 		if (!(input instanceof ASTnode_instance)) {
// 				// 			return task;
// 				// 		}
// 				// 		const instance = new ASTnode_instance(this.location, left, input.codeBlock);
// 				// 		// instance.caseName = left.getCaseIndex(name);
// 				// 		// if (instance.caseName == null) {
// 				// 		// 	utilities.unreachable();
// 				// 		// }
// 				// 		instance.caseName = name;
// 				// 		return instance;
// 				// 	});
// 				// });
// 				// const enumConstructor = new ASTnode_function(
// 				// 	this.location,
// 				// 	new ASTnode_argument(this.location, "input", enumCase.type),
// 				// 	[
// 				// 		task
// 				// 	],
// 				// );
// 				// return enumConstructor;
// 				utilities.TODO();
// 			} else {
// 				utilities.unreachable();
// 			}
// 		} else {
// 			utilities.TODO();
// 		}
// 	}
	
// 	clone() {
// 		return new ASTnode_operator(this.location, this.operatorText, this.left, this.right);
// 	}
// }

export class ASTnode_field extends ASTnode {
	constructor(
		location: SourceLocation,
		public name: string,
		public type: ASTnode,
	) {
		super(location);
	}
}

export class ASTnode_match extends ASTnode {
	constructor(
		location: SourceLocation,
		public expression: ASTnode,
		public codeBlock: ASTnode[],
	) {
		super(location);
	}
}

export class ASTnode_matchCase extends ASTnode {
	constructor(
		location: SourceLocation,
		public name: string,
		public types: ASTnode[],
		public codeBlock: ASTnode[],
	) {
		super(location);
	}
}

export class ASTnode_while extends ASTnode {
	constructor(
		location: SourceLocation,
		public condition: ASTnode,
		public codeBlock: ASTnode[],
	) {
		super(location);
	}
}

export class ASTnode_if extends ASTnode {
	constructor(
		location: SourceLocation,
		public condition: ASTnode,
		public trueBody: ASTnode[],
		public falseBody: ASTnode[],
	) {
		super(location);
	}
	
	_print(context = new CodeGenContext()): string {
		const condition = this.condition.print(context);
		const trueBody = joinBody(printAST(new CodeGenContext(), this.trueBody));
		const falseBody = joinBody(printAST(new CodeGenContext(), this.falseBody));
		return `if ${condition} then${trueBody}\nelse${falseBody}`;
	}
	
	getType(context: BuilderContext): ASTnodeType | ASTnode_error {
		const condition = this.condition.getType(context);
		if (condition instanceof ASTnode_error) {
			return condition;
		}
		
		{
			const error = expectType(context, condition, getBuiltinType("Bool"));
			if (error) {
				utilities.TODO_addError();
			}
		}
		
		const trueType = getTypeFromList(context, this.trueBody);
		const falseType = getTypeFromList(context, this.falseBody);
		
		if (trueType instanceof ASTnode_void && falseType instanceof ASTnode_void) {
			utilities.TODO_addError();
		}
		if (trueType instanceof ASTnode_void) {
			return falseType;
		}
		if (falseType instanceof ASTnode_void) {
			return trueType;
		}
		
		if (trueType instanceof ASTnode_error) {
			return trueType;
		}
		if (falseType instanceof ASTnode_error) {
			return falseType;
		}
		
		{
			const error = expectType(context, trueType, falseType);
			if (error) {
				const trueLocation = this.trueBody[this.trueBody.length-1].location;
				const falseLocation = this.falseBody[this.falseBody.length-1].location;
				error.indicator(trueLocation, `expected same type as trueBody (${trueType.print()})`);
				error.indicator(falseLocation, `but got type ${falseType.print()}`);
				return new ASTnode_error(fromNode(this), error);
			}
		}
		
		return trueType;
	}
	
	evaluate(context: BuilderContext): ASTnode {
		const conditionNode = this.condition.evaluate(context);
		const condition = conditionNode.asBool();
		if (condition == null) {
			const trueBody = evaluateList(context, this.trueBody);
			const falseBody = evaluateList(context, this.falseBody);
			
			return new ASTnode_if(
				fromNode(this),
				conditionNode,
				trueBody,
				falseBody,
			);
		}
		
		if (condition) {
			const resultList = evaluateList(context, this.trueBody);
			return resultList[resultList.length-1];
		} else {
			const resultList = evaluateList(context, this.falseBody);
			return resultList[resultList.length-1];
		}
	}
}

// export class ASTnode_unsafeEffect extends ASTnode {
// 	constructor(
// 		location: SourceLocation,
// 		public source: string,
// 		public list: ASTnode,
// 		public type: ASTnode,
// 	) {
// 		super(location);
// 	}
	
// 	_print(context = new CodeGenContext()): string {
// 		const list = this.list.print(context);
// 		const type = this.type.print(context);
// 		return `unsafeEffect "${this.source.replaceAll("\"", "\\\"")}" ${list} ${type}`;
// 	}
	
// 	getType(context: BuilderContext): ASTnodeType | ASTnode_error {
// 		{
// 			const error = this.type.getType(context);
// 			if (error instanceof ASTnode_error) {
// 				return error;
// 			}
// 		}
		
// 		let type = withResolve(context, () => this.type.evaluate(context));
// 		if (!type.isType()) {
// 			utilities.unreachable();
// 		}
		
// 		return makeEffectType(type);
// 	}
	
// 	evaluate(context: BuilderContext): ASTnode {
// 		return new ASTnode_unsafeEffect(fromNode(this), this.source, this.list.evaluate(context), this.type.evaluate(context));
// 	}
// }

//#endregion

//#region internal

export class ASTnode_error extends ASTnode {
	constructor(
		location: SourceLocation,
		public compileError: CompileError | null,
	) {
		super(location);
	}
	
	_print(context = new CodeGenContext()): string {
		if (this.compileError != null) {
			return `__compileError__(${this.compileError.msg})`;
		} else {
			return `__compileError__`;
		}
	}
}

export class ASTnode_void extends ASTnode_error {
	constructor(
		location: SourceLocation,
	) {
		super(location, null);
	}
}

export class ASTnode_unknowable extends ASTnode {
	constructor(
		location: SourceLocation,
	) {
		super(location);
	}
	
	_print(context = new CodeGenContext()): string {
		return "__ASTnode_unknowable__";
	}
	
	getType(context: BuilderContext): ASTnodeType | ASTnode_error {
		return new ASTnode_error(this.location, null);
	}
}

type ASTnode_builtinTask_dependency = {
	name: string,
	value: ASTnode,
};
export class ASTnode_builtinTask extends ASTnode {
	dependencies: ASTnode_builtinTask_dependency[] = [];
	
	constructor(
		readonly codegenId: string,
		// dependencies: string[],
		private _getType: (context: BuilderContext) => ASTnodeType | ASTnode_error,
		private _evaluate: (context: BuilderContext, task: ASTnode_builtinTask) => ASTnode,
	) {
		super("builtin");
		// for (let i = 0; i < dependencies.length; i++) {
		// 	const name = dependencies[i];
		// 	this.dependencies.push({
		// 		name: name,
		// 		value: new ASTnode_identifier(this.location, name),
		// 	});
		// }
	}
	
	getDependency(context: BuilderContext, name: string): ASTnode {
		for (let i = 0; i < this.dependencies.length; i++) {
			const dependency = this.dependencies[i];
			if (dependency.name == name) {
				return dependency.value.evaluate(context);
			}
		}
		utilities.unreachable();
	}
	
	_print(context = new CodeGenContext()): string {
		return "__builtinTask__";
	}
	
	getType(context: BuilderContext): ASTnodeType | ASTnode_error {
		return this._getType(context);
	}
	
	evaluate(context: BuilderContext): ASTnode {
		const output = this._evaluate(context, this);
		if (output == this) {
			const newTask = new ASTnode_builtinTask(
				this.codegenId,
				// [],
				this._getType,
				this._evaluate,
			);
			
			for (let i = 0; i < this.dependencies.length; i++) {
				const dependency = this.dependencies[i];
				newTask.dependencies.push({
					name: dependency.name,
					value: dependency.value.evaluate(context),
				});
			}
			
			return newTask;
		} else {
			// done
			return output;
		}
	}
}

//#endregion

//#region utilities

export function withResolve<T>(context: BuilderContext, fn: () => T): T {
	const oldResolve = context.resolve;
	context.resolve = "all";
	const output = fn();
	context.resolve = oldResolve;
	return output;
}

function getArgText(context: CodeGenContext, args: ASTnode[]): string {
	let argText = "";
	for (let i = 0; i < args.length; i++) {
		const argNode = args[i];
		const comma = argText == "";
		argText += argNode.print(context);
		if (comma) {
			argText += ", ";
		}
	}
	return argText;
}

// export function makeAliasWithType(location: SourceLocation, name: string, type: ASTnodeType): ASTnode_alias {
// 	return new ASTnode_alias(
// 		location,
// 		new ASTnode_identifier(location, name),
// 		new ASTnodeType_selfType(location, "TODO?", type)
// 	);
// }

export function getAliasFromList(AST: ASTnode[], name: string): ASTnode_alias | null {
	for (let i = 0; i < AST.length; i++) {
		const alias = AST[i];
		if (!(alias instanceof ASTnode_alias)) {
			utilities.unreachable();
		}
		if (alias.left instanceof ASTnode_identifier && alias.left.name == name) {
			return alias;
		}
	}

	return null;
}

/**
 * Takes an expectedType and an actualType, if the types are different returns a CompileError else null.
 */
function expectType(
	context: BuilderContext,
	expectedType: ASTnodeType,
	actualType: ASTnodeType,
): CompileError | null {
	// if (expectedType instanceof ASTnodeType_selfType) {
	// 	return null;
	// }
	
	// if (isBuiltinType(expectedType, "Any")) {
	// 	return null;
	// }
	
	// if (isBuiltinType(expectedType, "Function") && actualType instanceof ASTnodeType_functionType) {
	// 	return null;
	// }
	
	// if (expectedType instanceof ASTnodeType_functionType && actualType instanceof ASTnodeType_functionType) {
	// 	if (
	// 		!(expectedType.returnType instanceof ASTnodeType) ||
	// 		!(actualType.returnType instanceof ASTnodeType)
	// 	) {
	// 		utilities.unreachable();
	// 	}
	// 	const error = expectType(context, expectedType.returnType, actualType.returnType);
	// 	if (error != null) {
	// 		error.msg =
	// 		`expected type \"${expectedType.print()}\", but got type \"${actualType.print()}\"\n  return type `
	// 		+ error.msg;
	// 	}
	// 	return error;
	// }
	
	// if (expectedType.id != actualType.id) {
	// 	const expectedTypeText = expectedType.print();
	// 	const actualTypeText = actualType.print();
	// 	const error = new CompileError(`expected type ${expectedTypeText}, but got type ${actualTypeText}`);
	// 	debugger;
	// 	return error;
	// }
	
	// if (expectedType instanceof ASTnodeType_struct && actualType instanceof ASTnodeType_struct) {
	// 	for (let i = 0; i < expectedType.fields.length; i++) {
	// 		const expectedField = expectedType.fields[i];
	// 		const actualField = actualType.getField(expectedField.name);
	// 		if (!actualField) {
	// 			utilities.TODO_addError();
	// 		}
	// 		if (!(expectedField.type instanceof ASTnodeType) || !(actualField.type instanceof ASTnodeType)) {
	// 			utilities.unreachable();
	// 		}
	// 		const error = expectType(context, expectedField.type, actualField.type);
	// 		if (error != null) {
	// 			error.msg =
	// 			`expected type \"${expectedType.print()}\", but got type \"${actualType.print()}\"\n  field "${expectedField.name}" `
	// 			+ error.msg;
	// 			return error;
	// 		}
	// 	}
		
	// 	for (let i = 0; i < actualType.fields.length; i++) {
	// 		const actualField = actualType.fields[i];
	// 		const expectedField = expectedType.getField(actualField.name);
	// 		if (expectedField == null) {
	// 			utilities.TODO_addError();
	// 		}
	// 	}
	// }
	
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

export function getTypeFromList(context: BuilderContext, AST: ASTnode[]): ASTnodeType | ASTnode_error {
	let outNode = null;
	for (let i = 0; i < AST.length; i++) {
		const ASTnode = AST[i];
		if (ASTnode instanceof ASTnode_alias) {
			utilities.TODO();
			// const valueType = ASTnode.getType(context);
			// if (valueType instanceof ASTnode_error) {
			// 	return valueType;
			// }
			// const name = ASTnode.left.print();
			// context.aliases.push(makeAliasWithType(ASTnode.location, name, valueType));
		} else {
			outNode = ASTnode.getType(context);
		}
	}
	
	for (let i = 0; i < AST.length; i++) {
		const ASTnode = AST[i];
		if (ASTnode instanceof ASTnode_alias) {
			context.aliases.pop();
		}
	}
	
	if (!outNode) utilities.TODO_addError();
	return outNode;
}

export function evaluateList(context: BuilderContext, AST: ASTnode[]): ASTnode[] {
	let aliasCount = 0;
	
	let output: ASTnode[] = [];
	for (let i = 0; i < AST.length; i++) {
		const ASTnode = AST[i];
		const result: ASTnode = ASTnode.evaluate(context);
		if (result instanceof ASTnode_alias) {
			if (context.setUnalias) {
				result.unalias = true;
			}
			context.aliases.push(result);
			aliasCount++;
		}
		output.push(result);
	}
	
	for (let i = 0; i < aliasCount; i++) {
		context.aliases.pop();
	}
	
	return output;
}

function joinBody(body: string[]): string {
	return indent("\n" + body.join("\n"));
}

function indent(text: string): string {
	return text.replaceAll("\n", "\n\t");
}

//#endregion