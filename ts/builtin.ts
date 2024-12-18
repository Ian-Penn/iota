import { ASTnode, ASTnode_alias, ASTnode_identifier, ASTnode_set } from "./ASTnodes.js";

export function getBuiltinScope(): ASTnode[] {
	const scope: ASTnode[] = [];
	
	function addAlias(name: string, value: ASTnode) {
		scope.push(new ASTnode_alias(
			"builtin",
			new ASTnode_identifier("builtin", name),
			value,
		));
	}
	
	addAlias("Number", new ASTnode_set("builtin"));
	
	return scope;
}