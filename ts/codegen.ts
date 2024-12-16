import {
	ASTnode,
	ASTnode_alias,
	ASTnode_atom,
	ASTnode_bool,
	ASTnode_event,
	ASTnode_field,
	ASTnode_identifier,
	ASTnode_memberAccess,
	ASTnode_operator,
	ASTnode_set,
	ASTnode_string
} from "./ASTnodes.js";
import { inSetOperator } from "./lexer.js";
import { getClassName, unreachable } from "./utilities.js";

enum Mode {
	interrogative,
	declarative,
}

export class CodegenSettings {
	eventPrefix = "event_";
	allowArbitraryCodeExecution = false;
}

export function codegen(inputAST: ASTnode[], settings: CodegenSettings): string {
	let mode = Mode.interrogative;
	
	function print(node: ASTnode): string {
		if (node instanceof ASTnode_bool) {
			if (node.value) {
				return "true";
			} else {
				return "false";
			}
		}
		
		else if (node instanceof ASTnode_string) {
			return `"${node.value.replaceAll("\"", "\\\"").replaceAll("\n", "\\n")}"`;
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
			
			else if (node.operatorText == "&") {
				const left = print(node.left);
				const right = print(node.right);
				
				if (mode == Mode.interrogative) {
					return `${left} && ${right}`;
				} else {
					return `${left}; ${right}`;
				}
			}
			
			else if (node.operatorText == "=") {
				const left = print(node.left);
				const right = print(node.right);
				
				if (mode == Mode.interrogative) {
					return `${left} == ${right}`;
				} else {
					return `${left} = ${right}`;
				}
			}
			
			else {
				return `__TODO_operator__("${node.operatorText}")`;
			}
		}
		
		else if (node instanceof ASTnode_memberAccess) {
			const left = print(node.left);
			
			return `${left}.${node.name}`;
		}
		
		else if (node instanceof ASTnode_event) {
			const args = printList(node.args).join(", ");
			return `${settings.eventPrefix}${node.name}(${args})`;
		}
		
		else {
			return `__TODO__("${getClassName(node)}")`;
		}
	}
	
	function printList(AST: ASTnode[], top?: boolean): string[] {
		const list: string[] = [];
		
		for (let i = 0; i < AST.length; i++) {
			const node = AST[i];
			const text = print(node);
			
			if (
				top == true &&
				!(node instanceof ASTnode_alias) &&
				!(node instanceof ASTnode_operator && node.operatorText == "->")
			) {
				if (node.location == "builtin") unreachable();
				list.push(`console.log(${node.location.line}, ${text});`);
				continue;
			}
			
			if (node instanceof ASTnode_operator && node.operatorText == "->") {
				if (node.left instanceof ASTnode_event) {
					const argNames: string[] = node.left.args.map((arg) => {
						if (arg instanceof ASTnode_identifier) {
							return arg.name;
						} else if (arg instanceof ASTnode_field) {
							return arg.name;
						} else {
							unreachable();
						}
					});
					
					const oldMode = mode;
					mode = Mode.declarative;
					const right = print(node.right);
					mode = oldMode;
					
					list.push(`function ${settings.eventPrefix}${node.left.name}(${argNames.join(", ")}) {${right}}`);
					continue;
				}
			}
			
			list.push(text);
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