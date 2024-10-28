import * as utilities from "./utilities.js";
import {
	ASTnode,
	ASTnode_alias,
	ASTnode_argument,
	ASTnode_builtinTask,
	ASTnode_error,
	ASTnode_function,
	ASTnode_identifier,
	ASTnode_number,
	ASTnode_string,
	ASTnodeType,
	ASTnodeType_functionType,
	ASTnodeType_selfType,
	ASTnodeType_struct,
	BuilderContext,
	withResolve
} from "./ASTnodes.js";
import { Module, TopLevelDef } from "./Module.js";

export const builtinPrefix = "builtin:";

type BuiltinType = ASTnode_alias & { left: ASTnode_identifier, value: ASTnodeType_struct };

function makeBuiltinType(name: string): BuiltinType {
	return new ASTnode_alias(
		"builtin",
		new ASTnode_identifier("builtin", name),
		new ASTnodeType_struct("builtin", builtinPrefix + name, [])
	) as BuiltinType;
}

export function isSomeBuiltinType(type: ASTnodeType): boolean {
	return type.id.startsWith(builtinPrefix);
}

export function isBuiltinType(type: ASTnodeType, name: string): boolean {
	return isSomeBuiltinType(type) && type.id.split(":")[1] == name;
}

export let builtinTypes: BuiltinType[] = [];
export const builtins = new Map<string, TopLevelDef>();

export function makeListType(T: ASTnodeType): ASTnodeType {
	return new ASTnodeType_struct(
		"builtin",
		builtinPrefix + "List",
		[
			new ASTnode_argument("builtin", "T", T),
		]
	);
}

export function makeEffectType(T: ASTnodeType): ASTnodeType {
	return new ASTnodeType_struct(
		"builtin",
		builtinPrefix + "Effect",
		[
			new ASTnode_argument("builtin", "T", T),
		]
	);
}

export function setUpBuiltins() {
	builtinTypes = [
		makeBuiltinType("Type"),
		makeBuiltinType("Bool"),
		makeBuiltinType("Number"),
		makeBuiltinType("String"),
		makeBuiltinType("Effect"),
		makeBuiltinType("Function"),
		makeBuiltinType("Any"),
		makeBuiltinType("Void"),
		makeBuiltinType("__Unknown__"),
	];
	for (let i = 0; i < builtinTypes.length; i++) {
		const type = builtinTypes[i];
		const name = builtinPrefix + type.left.name;
		builtins.set(name, {
			name: name,
			value: type.value,
			valueRelativeTo: "",
			dependencies: [],
		});
	}
	function makeFunction(arg: string, argType: ASTnodeType, body: ASTnode[]): ASTnode_function {
		const fn = new ASTnode_function("builtin",
			new ASTnode_argument("builtin", arg, argType),
			body
		);
		fn.onlyResolveOnFullCall = true;
		return fn;
	}
	function makeType(argType: ASTnodeType, returnType: ASTnodeType): ASTnodeType_functionType {
		return new ASTnodeType_functionType(
			"builtin",
			"",
			argType,
			returnType,
		);
	}
	
	function makeBuiltin(name: string, value: ASTnode) {
		const nameWithPrefix = builtinPrefix + name;
		builtins.set(nameWithPrefix, {
			name: nameWithPrefix,
			value: value,
			valueRelativeTo: "",
			dependencies: [],
		});
	}
	
	function getArg(context: BuilderContext, name: string): ASTnode {
		const alias = context.getAlias(name);
		if (alias == null) {
			utilities.unreachable();
		}
		return alias.value;
	}
	
	{
		const task = new ASTnode_builtinTask("", (context): ASTnodeType | ASTnode_error => {
			return getBuiltinType("Type");
		}, (context): ASTnode => {
			return withResolve(context, () => {
				const T = getArg(context, "T");
				if (!(T instanceof ASTnodeType) || T instanceof ASTnodeType_selfType) {
					return task;
				}
				return makeListType(T);
			});
		});
		makeBuiltin("List", makeFunction("T", getBuiltinType("Type"), [ task ]));
	}
	
	// {
	// 	const task = new ASTnode_builtinTask("List:get", (context): ASTnodeType | ASTnode_error => {
	// 		const list = getArg(context, "index");
	// 		if (!(list instanceof ASTnode_list)) {
	// 			return new ASTnode_error("builtin", null);
	// 		}
	// 		const listType = list.getType(context);
	// 		if (!(listType instanceof ASTnodeType_struct)) {
	// 			utilities.unreachable();
	// 		}
	// 		const field = listType.getField("T");
	// 		if (field == null || !(field.type instanceof ASTnodeType)) {
	// 			utilities.unreachable();
	// 		}
	// 		return field.type;
	// 	}, (context): ASTnode => {
	// 		return withResolve(context, () => {
	// 			const index = getArg(context, "index");
	// 			if (!(index instanceof ASTnode_number)) {
	// 				return task;
	// 			}
	// 			const list = getArg(context, "index");
	// 			if (!(list instanceof ASTnode_list)) {
	// 				return task;
	// 			}
	// 			return ;
	// 		});
	// 	});
	// 	makeBuiltin("List:get",
	// 		makeFunction("index", getBuiltinType("Number"), [
	// 			makeFunction("list", makeListType(getBuiltinType("Any")), [ task ])
	// 		])
	// 	);
	// }
	
	{
		const task = new ASTnode_builtinTask("", (context): ASTnodeType | ASTnode_error => {
			return getBuiltinType("Type");
		}, (context): ASTnode => {
			return withResolve(context, () => {
				const T = getArg(context, "T");
				if (!(T instanceof ASTnodeType) || T instanceof ASTnodeType_selfType) {
					return task;
				}
				return makeEffectType(T);
			});
		});
		makeBuiltin("Effect", makeFunction("T", getBuiltinType("Type"), [ task ]));
	}
	
	{
		const task = new ASTnode_builtinTask("numberToString", (context): ASTnodeType | ASTnode_error => {
			return getBuiltinType("String");
		}, (context): ASTnode => {
			return withResolve(context, () => {
				const number = getArg(context, "number");
				if (!(number instanceof ASTnode_number)) {
					return task;
				}
				return new ASTnode_string("builtin", number.value.toString());
			});
		});
		makeBuiltin("numberToString", makeFunction("number", getBuiltinType("Number"), [ task ]));
	}
	
	// builtins.set("List:map", {
	// 	value: makeFunction("fn", makeType,
	// 		[
	// 			new ASTnode_builtinTask((context): ASTnodeType | ASTnode_error => {
	// 				return getBuiltinType("Type");
	// 			}, (context): ASTnode => {
	// 				return withResolve(context, () => {
	// 					utilities.TODO();
	// 				});
	// 			})
	// 		]
	// 	)
	// });
	
	// add the module
	const builtinModule = new Module(null, "builtin");
	builtinModule.defs = builtins;
}

export function getBuiltinType(name: string): ASTnodeType {
	for (let i = 0; i < builtinTypes.length; i++) {
		const alias = builtinTypes[i];
		if (alias.left.name == name) {
			return alias.value;
		}
	}
	
	utilities.unreachable();
}