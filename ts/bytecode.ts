import { ASTnode, ASTnode_alias, ASTnode_function, ASTnode_identifier, ASTnode_number } from "./ASTnodes.js";
import { getClassName, TODO } from "./utilities.js";

export enum BytecodeOp {
	nop = 0,
	
	func_new,
	func_call,
	
	local_get,
	local_set,
	
	type_new,
	
	f32_new,
	i32_add,
	i32_sub,
	i32_mul,
	i32_div,
}

export function makeBytecodeTextFormat(topAST: ASTnode[]): string {
	function print(node: ASTnode): string {
		console.log(getClassName(node), node.print());
		
		if (node instanceof ASTnode_number) {
			return `(f32_new ${node.value})`
		} else if (node instanceof ASTnode_function) {
			const body = printAST(node.body).join("\n");
			return `(func () (\n${body}\n))`
		} else if (node instanceof ASTnode_alias) {
			if (!(node.left instanceof ASTnode_identifier)) {
				TODO();
			}
			const name = node.left.name;
			const value = print(node.value);
			return `${value}\n(alias_new "${name}")`;
		} else {
			return `(TODO "${getClassName(node)}")`;
		}
	}
	
	function printAST(AST: ASTnode[]): string[] {
		const list: string[] = [];
		for (let i = 0; i < AST.length; i++) {
			const node = AST[i];
			const text = print(node);
			list.push(text);
		}
		return list;
	}
	
	return printAST(topAST).join("\n");
}

export function runBytecode(byteCode: Uint8Array) {
	
}