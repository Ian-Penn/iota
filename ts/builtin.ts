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
	ASTnode_object,
	ASTnode_string,
	ASTnode_unknown,
	ASTnodeType,
	withResolve,
} from "./ASTnodes.js";
import { Module, ModulePath } from "./Module.js";

export const builtinPrefix = "builtin:";

type BuiltinType = ASTnode_alias & { left: ASTnode_identifier, value: ASTnodeType };

function use(name: string): ASTnode_identifier {
	return new ASTnode_identifier("builtin", name);
}

function newString(text: string): ASTnode_string {
	return new ASTnode_string("builtin", text);
}

function newNumber(number: number): ASTnode_number {
	return new ASTnode_number("builtin", number);
}

function makeBuiltinType(name: string): ASTnodeType {
	const object = new ASTnode_object("builtin", TypeType, []);
	object.name = `builtin.${name}`;
	object.addMember("builtinTag", newString(`${name}`));
	
	return object as ASTnodeType;
}

function makeBuiltinTypeAlias(name: string): BuiltinType {
	return new ASTnode_alias(
		"builtin",
		new ASTnode_identifier("builtin", name),
		makeBuiltinType(name),
	) as BuiltinType;
}

let TypeType: ASTnode_object;
export let builtinTypes: BuiltinType[] = [];
export let builtinModule: Module;

// export function makeListType(T: ASTnodeType): ASTnodeType {
// 	return new ASTnodeType_struct(
// 		"builtin",
// 		builtinPrefix + "List",
// 		[
// 			new ASTnode_argument("builtin", "T", T),
// 		]
// 	);
// }

// export function makeEffectType(T: ASTnodeType): ASTnodeType {
// 	return new ASTnodeType_struct(
// 		"builtin",
// 		builtinPrefix + "Effect",
// 		[
// 			new ASTnode_argument("builtin", "T", T),
// 		]
// 	);
// }

export function setUpBuiltins() {
	{
		TypeType = makeBuiltinType("Type") as ASTnode_object;

		builtinTypes.push(new ASTnode_alias(
			"builtin",
			new ASTnode_identifier("builtin", "Type"),
			TypeType,
		) as BuiltinType);
	}
	
	builtinTypes.push(
		makeBuiltinTypeAlias("Bool"),
		makeBuiltinTypeAlias("Float64"),
		makeBuiltinTypeAlias("String"),
		makeBuiltinTypeAlias("Effect"),
		makeBuiltinTypeAlias("Function"),
		makeBuiltinTypeAlias("Any"),
		makeBuiltinTypeAlias("Void"),
		// makeBuiltinTypeAlias("__Unknown__"),
	);
	
	builtinModule = new Module(null, "builtin",
		new ASTnode_object("builtin", null, [])
	);
	
	for (let i = 0; i < builtinTypes.length; i++) {
		const type = builtinTypes[i];
		// const name = builtinPrefix + type.left.name;
		builtinModule.root.addMember(type.left.name, type.value);
	}
	// function makeType(argType: ASTnodeType, returnType: ASTnodeType): ASTnodeType_functionType {
	// 	return new ASTnodeType_functionType(
	// 		"builtin",
	// 		"",
	// 		argType,
	// 		returnType,
	// 	);
	// }
	
	function makeBuiltin(name: string, value: ASTnode) {
		// const nameWithPrefix = builtinPrefix + name;
		builtinModule.root.addMember(name, value);
	}
	
	function makeFunction(args: [string, ASTnode][], task: ASTnode_builtinTask): ASTnode_function {
		let last: ASTnode = task;
		for (let i = args.length - 1; i >= 0; i--) {
			const arg = args[i];
			task.dependencies.push({
				name: arg[0],
				value: new ASTnode_identifier("builtin", arg[0])
			});
			last = new ASTnode_function("builtin",
				new ASTnode_argument("builtin", arg[0], arg[1]),
				[last]
			);
		}
		
		if (!(last instanceof ASTnode_function)) {
			utilities.unreachable();
		}
		
		return last;
	}
	
	function setFunction(name: string, args: [string, ASTnodeType][], task: ASTnode_builtinTask) {
		makeBuiltin(name, makeFunction(args, task));
	}
	
	setFunction("import", [["path", getBuiltinType("String")]],
		new ASTnode_builtinTask("", (context): ASTnodeType | ASTnode_error => {
			return getBuiltinType("Any");
		}, (context, task): ASTnode => {
			return withResolve(context, () => {
				const path = task.getDependency(context, "path");
				if (path.deadEnd || path instanceof ASTnode_unknown) {
					return task;
				}
				if (!(path instanceof ASTnode_string)) {
					utilities.unreachable();
				}
				
				if (path.value == "builtin") {
					return builtinModule.root;
				} else {
					utilities.TODO();
				}
			});
		})
	);
	
	// {
	// 	makeFunction("List", [["T", getBuiltinType("Type")]], 
	// 		new ASTnode_builtinTask("", (context): ASTnodeType | ASTnode_error => {
	// 			return getBuiltinType("Type");
	// 		}, (context, task): ASTnode => {
	// 			return withResolve(context, () => {
	// 				const T = task.getDependency(context, "T");
	// 				if (!(T instanceof ASTnodeType) || T instanceof ASTnodeType_selfType) {
	// 					return task;
	// 				}
	// 				return makeListType(T);
	// 			});
	// 		})
	// 	);
	// }
	
	// {
	// 	new ASTnode_builtinTask("List:get", (context): ASTnodeType | ASTnode_error => {
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
	
	// {
	// 	makeFunction("Effect", [["T", getBuiltinType("Type")]], 
	// 		new ASTnode_builtinTask("", (context): ASTnodeType | ASTnode_error => {
	// 			return getBuiltinType("Type");
	// 		}, (context, task): ASTnode => {
	// 			return withResolve(context, () => {
	// 				const T = task.getDependency(context, "T");
	// 				if (!(T instanceof ASTnodeType) || T instanceof ASTnodeType_selfType) {
	// 					return task;
	// 				}
	// 				return makeEffectType(T);
	// 			});
	// 		})
	// 	);
	// }
	
	// {
	// 	makeFunction("Float64ToString", [["number", getBuiltinType("Float64")]], 
	// 		new ASTnode_builtinTask("numberToString", (context): ASTnodeType | ASTnode_error => {
	// 			return getBuiltinType("String");
	// 		}, (context, task): ASTnode => {
	// 			return withResolve(context, () => {
	// 				const number = task.getDependency(context, "number");
	// 				if (!(number instanceof ASTnode_number)) {
	// 					return task;
	// 				}
	// 				return new ASTnode_string("builtin", number.value.toString());
	// 			});
	// 		})
	// 	);
	// }
	
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
	
	//#region operators
	
	function makeOperatorBuiltin(
		location: ASTnodeType,
		name: string,
		callBack: (left: ASTnode_number, right: ASTnode_number) => ASTnode_number
	) {
		if (!(location instanceof ASTnode_object)) {
			utilities.unreachable();
		}
		const fn = makeFunction([["left", getBuiltinType("Float64")], ["right", getBuiltinType("Float64")]],
			new ASTnode_builtinTask(name, (context): ASTnodeType | ASTnode_error => {
				return getBuiltinType("Float64");
			}, (context, task): ASTnode => {
				return withResolve(context, () => {
					const left = task.getDependency(context, "left");
					const right = task.getDependency(context, "right");
					if (left instanceof ASTnode_number && right instanceof ASTnode_number && context.doResolve()) {
						return callBack(left, right);
					}
					return task;
				});
			})
		);
		location.addMember(name, fn);
	}
	
	makeOperatorBuiltin(
		getBuiltinType("Float64"),
		"+",
		(left: ASTnode_number, right: ASTnode_number) => {
			return newNumber(left.value + right.value);
		}
	);
	
	// makeOperatorBuiltin_Float64(
	// 	"Float64_-",
	// 	(left: ASTnode_number, right: ASTnode_number) => {
	// 		return newNumber(left.value - right.value);
	// 	}
	// );
	
	makeOperatorBuiltin(
		getBuiltinType("Float64"),
		"*",
		(left: ASTnode_number, right: ASTnode_number) => {
			return newNumber(left.value * right.value);
		}
	);
	
	// makeOperatorBuiltin_Float64(
	// 	"Float64_/",
	// 	(left: ASTnode_number, right: ASTnode_number) => {
	// 		return newNumber(left.value / right.value);
	// 	}
	// );
	
	//#endregion operators
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