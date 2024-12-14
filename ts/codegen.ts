import {
	ASTnode,
	ASTnode_alias,
	ASTnode_atom,
	ASTnode_bool,
	ASTnode_identifier,
	ASTnode_operator,
	ASTnode_set
} from "./ASTnodes.js";
import { inSetOperator } from "./lexer.js";
import { getClassName, unreachable } from "./utilities.js";

// type Mode = "interrogative" | "declarative";
enum Mode {
	interrogative,
	declarative,
}

export function codegen(inputAST: ASTnode[]): string {
	let mode = Mode.interrogative;
	
	function print(node: ASTnode): string {
		if (node instanceof ASTnode_bool) {
			if (node.value) {
				return "true";
			} else {
				return "false";
			}
		}
		
		else if (node instanceof ASTnode_identifier) {
			return node.name;
		}
		
		else if (node instanceof ASTnode_alias && node.left instanceof ASTnode_identifier) {
			let name = node.left.name;
			let value: string;
			if (node.value instanceof ASTnode_atom) {
				value = `{}`;
			} else if (node.value instanceof ASTnode_set) {
				value = `new Set()`;
			} else {
				unreachable();
			}
			return `const ${name} = ${value};`;
		}
		
		else if (node instanceof ASTnode_operator) {
			if (node.operatorText == "->") {
				const condition = print(node.left);
				const oldMode = mode;
				mode = Mode.declarative;
				const body = print(node.right);
				mode = oldMode;
				return `if (${condition}) {${body}}`;
			}
			
			else if (node.operatorText == inSetOperator) {
				const theSet = print(node.right);
				const element = print(node.left);
				
				debugger;
				
				if (mode == Mode.interrogative) {
					return `${theSet}.has(${element})`;
				} else {
					return `${theSet}.add(${element})`;
				}
			}
			
			else {
				return `__TODO_operator__(${node.operatorText})`;
			}
		}
		
		else {
			return `__TODO__(${getClassName(node)})`;
		}
	}
	
	function printList(AST: ASTnode[], top?: boolean): string[] {
		const list: string[] = [];
		
		for (let i = 0; i < AST.length; i++) {
			const node = AST[i];
			const text = print(node);
			
			if (top == true && !(node instanceof ASTnode_alias)) {
				if (node instanceof ASTnode_operator && node.operatorText == "->") {
					list.push(text);
				} else {
					// list.push(`console.log(${text});`);
					if (node.location == "builtin") unreachable();
					list.push(`console.log(${node.location.line}, ${text});`);
				}
			} else {
				list.push(text);
			}
		}
		
		return list;
	}
	
	function indent(text: string): string {
		return text.replaceAll("\n", "\n\t");
	}
	function joinBody(body: string[]): string {
		return indent("\n" + body.join("\n"));
	}
	
	let topText = "";
	
	topText += printList(inputAST, true).join("\n");
	
	return topText;
}