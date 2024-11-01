import * as utilities from "./utilities.js";
import {
	BuilderContext,
	ASTnode,
	ASTnode_alias,
	ASTnode_bool,
	ASTnode_call,
	ASTnode_function,
	ASTnode_identifier,
	ASTnode_if,
	ASTnode_instance,
	ASTnode_list,
	ASTnode_number,
	ASTnode_unsafeEffect,
	ASTnode_string,
	ASTnode_builtinTask
} from "./ASTnodes.js";
import { Module, ModulePath, TopLevelDef } from "./Module.js";

export class CodeGenContext {
	fprintOrigin = false;
	softLineMax = 10;
	noParenthesesForFloatingOperators = false;
};

export type CodegenJsSettings = {
	addDebugComments: boolean,
};

export function codegen_js(module: Module, exports: string[], settings: CodegenJsSettings): string {
	let topLevel: string[] = [];
	let topLevelEnd: string[] = [];
	
	/**
	 * TopLevelDefs to be generated
	 */
	const todo: [string, TopLevelDef][] = [];
	const done: string[] = [];
	function addTodoFn(name: string) {
		if (done.includes(name)) {
			return;
		}
		
		const newFn = module.getDef(new ModulePath([]), new ModulePath([name]));
		if (newFn == null) {
			utilities.unreachable();
		}
		todo.push([name, newFn[1]]);
	}
	
	let nextAliasId = 0;
	const aliases: [string, string][] = [];
	const topLevelAliases: [string, string][] = [];
	function getAlias(name: string): string {
		for (let i = aliases.length - 1; i >= 0; i--) {
			const alias = aliases[i];
			if (alias[0] == name) {
				return alias[1];
			}
		}
		for (let i = 0; i < topLevelAliases.length; i++) {
			const alias = topLevelAliases[i];
			if (alias[0] == name) {
				return alias[1];
			}
		}
		
		{
			const newName = `g${nextAliasId++}`;
			topLevelAliases.push([name, newName]);
			addTodoFn(name);
			return newName;
		}
	}
	function makeAlias(name: string) {
		const newName = `l${nextAliasId++}`;
		aliases.push([name, newName]);
		return newName;
	}
	function endAlias() {
		aliases.pop();
	}
	
	for (let i = 0; i < exports.length; i++) {
		const name = exports[i];
		topLevelAliases.push([name, name]);
		addTodoFn(name);
	}
	
	while (todo.length > 0) {
		const next = todo.pop()!;
		done.push(next[0]);
		const name = getAlias(next[0]);
		const context = new BuilderContext(module);
		context.resolve = "types";
		const node = next[1].value.evaluate(context);
		
		if (node instanceof ASTnode_function) {
			makeAlias(node.arg.name);
			const body = printList(node.body, "return ", ";");
			if (settings.addDebugComments) {
				topLevel.push(`// ${next[0]}`);
			}
			topLevel.push(`function ${name}(${getAlias(node.arg.name)}) {${joinBody(body)}\n}`);
			endAlias();
		} else {
			topLevelEnd.push(`var ${name} = ${print(node)};`);
			if (settings.addDebugComments) {
				topLevelEnd.push(`// ${next[0]}`);
			}
		}
	}
	
	function joinBody(body: string[]) {
		return ("\n" + body.join("\n")).replaceAll("\n", "\n\t");
	}
	
	function print(node: ASTnode, start?: string, end?: string, close: boolean = false): string {
		function unit(input: string, isFn = false): string {
			let output = input;
			if (start) output = start + output;
			if (end) output = output + end;
			if (isFn && close) {
				return `(${output})`;
			} else {
				return output;
			}
		}
		
		// if (node.location != "builtin" && node.location.origin != undefined) {
		// 	node = node.location.origin;
		// }
		
		if (node instanceof ASTnode_bool) {
			if (node.value) {
				return unit("true");
			} else {
				return unit("false");
			}
		} else if (node instanceof ASTnode_number) {
			return unit(`${node.value}`);
		} else if (node instanceof ASTnode_string) {
			return unit(`"${node.value.replaceAll("\"", "\\\"").replaceAll("\n", "\\n")}"`);
		} else if (node instanceof ASTnode_identifier) {
			return unit(`${getAlias(node.name)}`);
		} else if (node instanceof ASTnode_call) {
			return unit(`${print(node.left, "", "", true)}(${print(node.arg)})`);
		} else if (node instanceof ASTnode_if) {
			const condition = print(node.condition);
			const trueBody = joinBody(printList(node.trueBody, start, end));
			const falseBody = joinBody(printList(node.falseBody, start, end));
			return `if (${condition}) {${trueBody}\n} else {${falseBody}\n}`;
		} else if (node instanceof ASTnode_function) {
			makeAlias(node.arg.name);
			const body = printList(node.body, "return ", ";");
			const text = `(${getAlias(node.arg.name)}) => {${joinBody(body)}\n}`;
			endAlias();
			return unit(text, true);
		} else if (node instanceof ASTnode_instance) {
			let fields: string[] = [];
			for (let i = 0; i < node.codeBlock.length; i++) {
				const field = node.codeBlock[i];
				if (!(field instanceof ASTnode_alias)) {
					utilities.unreachable();
				}
				if (!(field.left instanceof ASTnode_identifier)) {
					utilities.unreachable();
				}
				fields.push(`${field.left.name}: ${print(field.value)},`);
			}
			return unit(`{${joinBody(fields)}\n}`);
		} else if (node instanceof ASTnode_unsafeEffect) {
			if (!(node.list instanceof ASTnode_list)) {
				utilities.TODO_addError();
			}
			
			let source = node.source;
			for (let i = 0; i < node.list.elements.length; i++) {
				const element = node.list.elements[i];
				source = source.replaceAll(`%%${i}%%`, print(element, "", "", true));
			}
			if (settings.addDebugComments) {
				return unit(`(/*unsafeEffect*/) => {${source}}`, true);
			} else {
				return unit(`() => {${source}}`, true);
			}
		} else if (node instanceof ASTnode_alias) {
			if (!(node.left instanceof ASTnode_identifier)) {
				utilities.TODO();
			}
			const name = makeAlias(node.left.name);
			const value = print(node.value, `${name} = `, ";");
			return `let ${name};\n${value}`;
		} else if (node instanceof ASTnode_builtinTask) {
			if (node.codegenId == "numberToString") {
				return unit(`${getAlias("number")}.toString()`);
			} else {
				return `___TODO___ASTnode_builtinTask(${node.codegenId})`;
			}
		}
		
		return `___TODO___(${utilities.getClassName(node)})`;
	}
	
	function printList(AST: ASTnode[], start?: string, end?: string): string[] {
		let textList: string[] = [];
		
		for (let i = 0; i < AST.length; i++) {
			let nodeText = print(AST[i], start, end);
			textList.push(nodeText);
		}
		
		return textList;
	}
	
	let output = "";
	if (topLevel.length > 0) {
		output += topLevel.join("\n");
	}
	if (topLevel.length > 0 && topLevelEnd.length > 0) {
		output += "\n";
	}
	if (topLevelEnd.length > 0) {
		output += topLevelEnd.reverse().join("\n");
	}
	
	return output;
}