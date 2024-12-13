import {
	ASTnode,
	ASTnode_alias,
	ASTnode_atom,
	ASTnode_identifier,
	ASTnode_set
} from "./ASTnodes.js";
import { unreachable } from "./utilities.js";

export function codegen(inputAST: ASTnode[]): string {
	// function print(node: ASTnode): string {
		
	// }
	
	// function printList(AST: ASTnode[]): string[] {
		
	// }
	
	let topText = "";
	
	debugger;
	
	for (let i = 0; i < inputAST.length; i++) {
		const node = inputAST[i];
		if (node instanceof ASTnode_alias && node.left instanceof ASTnode_identifier) {
			let name = node.left.name;
			let value: string;
			if (node.value instanceof ASTnode_atom) {
				value = `{}`;
			} else if (node.value instanceof ASTnode_set) {
				value = `new Set()`;
			} else {
				unreachable();
			}
			topText += `const ${name} = ${value};\n`;
		}
	}
	
	return topText;
}