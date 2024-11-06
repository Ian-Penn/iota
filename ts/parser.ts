import * as utilities from "./utilities.js";
import { CompileError } from "./report.js";
import { Token, TokenKind } from "./lexer.js";
import {
	ASTnode,
	ASTnode_alias,
	ASTnode_command,
	ASTnode_identifier,
	ASTnode_if,
	ASTnode_object,
	Bool_new,
	Float64_new,
	String_new
} from "./ASTnodes.js";

export type ParserContext = {
	tokens: Token[],
	i: number,
}

export enum ParserMode {
	normal,
	single,
	singleNoContinue,
	singleNoOperatorContinue,
	singleNoEqualsOperatorContinue,
	singleNoCall,
	comma,
}

function getIndentation(token: Token): number {
	if (token.location == "builtin") {
		utilities.unreachable();
	}
	return token.location.indentation;
}

function getOperatorPrecedence(operatorText: string): number {
	if (operatorText == "=") {
		return 1;
	}
	
	else if (operatorText == "||") {
		return 2;
	}
	
	else if (operatorText == "&&") {
		return 3;
	}
	
	else if (
		operatorText == "==" ||
		operatorText == "!=" ||
		operatorText == ">" ||
		operatorText == "<" ||
		operatorText == ">=" ||
		operatorText == "<="
	) {
		return 4;
	}
	
	else if (
		operatorText == "+" ||
		operatorText == "-"
	) {
		return 5;
	}
	
	else if (
		operatorText == "*" ||
		operatorText == "/" ||
		operatorText == "%"
	) {
		return 6;
	}
	
	else if (operatorText == "as") {
		return 7;
	}
	
	else if (operatorText == ".") {
		return 8;
	}
	
	else {
		utilities.unreachable();
	}
}

function more(context: ParserContext): boolean {
	return context.tokens[context.i] != undefined;
}

function forward(context: ParserContext): Token {
	let token = context.tokens[context.i];
	while (token != undefined && token.kind == TokenKind.comment) {
		context.i++;
		token = context.tokens[context.i];
	}
	
	if (!token) {
		const endToken = context.tokens[context.i-1];
		return {
			kind: TokenKind.endOfFile,
			text: "[end of file]",
			location: endToken.location,
		};
	}
	
	context.i++;
	
	return token;
}

function getLast(context: ParserContext): Token | null {
	const token = context.tokens[context.i-1];
	
	if (token) {
		return token;
	} else {
		return null;
	}
}

function getNext(context: ParserContext): Token {
	let i = context.i;
	let token = context.tokens[i];
	while (token != undefined && token.kind == TokenKind.comment) {
		i++;
		token = context.tokens[i];
	}
	if (!token) {
		token = context.tokens[context.i];
	}
	
	if (!token) {
		throw new CompileError("unexpected end of file").indicator(context.tokens[i-1].location, "last token here");
	}
	
	return token;
}

function parseOperators(context: ParserContext, left: ASTnode, lastPrecedence: number): ASTnode {
	if (!context.tokens[context.i]) {
		return left;
	}
	
	const nextOperator = context.tokens[context.i];
	
	if (nextOperator.kind == TokenKind.operator) {
		const nextPrecedence = getOperatorPrecedence(nextOperator.text);
		
		if (nextPrecedence > lastPrecedence) {
			let right: ASTnode;
			context.i++;
			let mode;
			if (nextOperator.text == "=") {
				mode = ParserMode.single;
			} else if (nextOperator.text == ".") {
				mode = ParserMode.singleNoContinue;
			} else {
				mode = ParserMode.singleNoOperatorContinue;
			}
			
			const _r = parse(context, mode, getIndentation(nextOperator), null)[0];
			if (_r == undefined) {
				throw new CompileError("nothing on right side of operator").indicator(nextOperator.location, "here");
			}
			right = parseOperators(context, _r, nextPrecedence);
			
			if (nextOperator.text == "=") {
				return new ASTnode_alias(nextOperator.location, left, right);
			} else {
				utilities.TODO();
				// return new ASTnode_operator(nextOperator.location, nextOperator.text, left, right);
				// return new ASTnode_call(
				// 	nextOperator.location,
				// 	new ASTnode_call(
				// 		nextOperator.location,
				// 		new ASTnode_identifier(nextOperator.location, nextOperator.text),
				// 		left,
				// 	),
				// 	right,
				// );
			}
		}
	}
	
	return left;
}

function parseType(context: ParserContext, separatingText: string): ASTnode | null {
	let type: ASTnode | null = null;
	
	const separator = getNext(context);
	if (separator.text == separatingText) {
		forward(context);
		
		type = parse(context, ParserMode.single, getIndentation(separator) + 1, null)[0];
	}
	
	return type;
}

// function parseFields(context: ParserContext): ASTnode_argument[] {
// 	{
// 		const openingBracket = forward(context);
// 		if (openingBracket.kind != TokenKind.separator || openingBracket.text != "{") {
// 			throw new CompileError("expected openingBracket for field list").indicator(openingBracket.location, "here");
// 		}
// 	}
	
// 	let AST: ASTnode_argument[] = [];
	
// 	if (getNext(context).kind == TokenKind.separator && getNext(context).text == "}") {
// 		forward(context);
// 		return AST;
// 	}
	
// 	while (context.i < context.tokens.length) {
// 		const name = forward(context);
// 		if (name.kind != TokenKind.word) {
// 			throw new CompileError("expected name in field list").indicator(name.location, "here");
// 		}
		
// 		const type = parse(context, ParserMode.single, getIndentation(name) + 1, null)[0];
// 		if (!type) {
// 			throw new CompileError("field without a type").indicator(name.location, "here");
// 		}
		
// 		AST.push(new ASTnode_argument(name.location, name.text, type));	
		
// 		const end = forward(context);
		
// 		if (end.kind == TokenKind.separator && end.text == "}") {
// 			return AST;
// 		} else if (end.kind == TokenKind.separator && end.text == ",") {
// 			continue;
// 		} else {
// 			throw new CompileError("expected a comma in field list").indicator(end.location, "here");
// 		}
// 	}
	
// 	return AST;
// }

// function parseFieldsEquals(context: ParserContext): ASTnode_alias[] {
// 	{
// 		const openingBracket = forward(context);
// 		if (openingBracket.kind != TokenKind.separator || openingBracket.text != "{") {
// 			throw new CompileError("expected openingBracket for field list").indicator(openingBracket.location, "here");
// 		}
// 	}
	
// 	let AST: ASTnode_alias[] = [];
	
// 	if (getNext(context).kind == TokenKind.separator && getNext(context).text == "}") {
// 		forward(context);
// 		return AST;
// 	}
	
// 	while (context.i < context.tokens.length) {
// 		const name = forward(context);
// 		if (name.kind != TokenKind.word) {
// 			throw new CompileError("expected name in field list").indicator(name.location, "here");
// 		}
		
// 		const equals = forward(context);
// 		if (equals.kind != TokenKind.operator || equals.text != "=") {
// 			throw new CompileError("expected equals in field list").indicator(equals.location, "here");
// 		}
		
// 		const value = parse(context, ParserMode.single, getIndentation(name) + 1, null)[0];
// 		if (!value) {
// 			throw new CompileError("field without a type").indicator(name.location, "here");
// 		}
		
// 		AST.push(new ASTnode_alias(
// 			name.location,
// 			new ASTnode_identifier(name.location, name.text),
// 			value
// 		));	
		
// 		const end = forward(context);
		
// 		if (end.kind == TokenKind.separator && end.text == "}") {
// 			return AST;
// 		} else if (end.kind == TokenKind.separator && end.text == ",") {
// 			continue;
// 		} else {
// 			throw new CompileError("expected a comma in field list").indicator(end.location, "here");
// 		}
// 	}
	
// 	return AST;
// }

function getLine(input: ASTnode | Token): number {
	if (typeof input.location == "string") {
		utilities.unreachable();
	}
	
	return input.location.line;
}

export function parse(context: ParserContext, mode: ParserMode, indentation: number, endAt: ")" | "}" | "]" | null): ASTnode[] {
	let ASTnodes: ASTnode[] = [];
	
	function earlyReturn() {
		if (endAt && more(context) && getNext(context).kind == TokenKind.separator && getNext(context).text != ",") {
			if (getNext(context).text == endAt) {
				forward(context);
			} else {
				utilities.TODO();
			}
		}
	}
	
	function doIndentationCancel(): boolean {
		const lastT = getLast(context);
		if (lastT) {
			const nextT = getNext(context);
			if (typeof lastT.location == "string" || typeof nextT.location == "string") {
				utilities.unreachable();
			}
			
			if (lastT.location.line == nextT.location.line) {
				return false;
			}
			
			if (getIndentation(nextT) < indentation) {
				return true;
			}
		}
		
		return false;
	}
	
	while (context.i < context.tokens.length) {
		if (endAt != null) {
			const nextToken = getNext(context);
			
			if (nextToken.kind == TokenKind.separator) {
				if (nextToken.text == ")" || nextToken.text == "}" || nextToken.text == "]") {
					if (endAt == nextToken.text) {
						context.i++;
						return ASTnodes;
					} else {
						throw new CompileError("unexpected separator")
							.indicator(nextToken.location, `expected '${endAt} but got '${nextToken.text}'`);
					}
				}
			}
		}
		
		if (getNext(context).kind == TokenKind.word) {
			const nextWord = getNext(context).text;
			if (nextWord == "then" || nextWord == "else") {
				return ASTnodes;
			}
		}
		
		// indentation canceling
		if (doIndentationCancel()) {
			earlyReturn();
			return ASTnodes;
		}
		
		// {
		// 	const last = getLast(context);
		// 	if (
		// 		mode != ParserMode.singleNoCall &&
		// 		ASTnodes.length > 0 &&
		// 		more(context) &&
		// 		getNext(context).kind != TokenKind.operator &&
		// 		ASTnodes[ASTnodes.length - 1] instanceof ASTnode &&
		// 		!(ASTnodes[ASTnodes.length - 1] instanceof ASTnode_command) &&
		// 		!(
		// 			getNext(context).kind == TokenKind.separator &&
		// 			getNext(context).text == ")"
		// 		) &&
		// 		!(
		// 			last &&
		// 			last.kind == TokenKind.separator &&
		// 			last.text == ","
		// 		)
		// 	) {
		// 		const left = ASTnodes.pop();
		// 		if (!left || getLast(context) == null || left.location == "builtin") {
		// 			utilities.unreachable();
		// 		}
				
		// 		let newIndentation;
		// 		if (left instanceof ASTnode_call) {
		// 			newIndentation = left.location.indentation + 1;
		// 		} else {
		// 			newIndentation = indentation + 1;
		// 		}
				
		// 		let mode;
		// 		if (getLine(left) == getLine(getNext(context))) {
		// 			mode = ParserMode.singleNoCall;
		// 		} else {
		// 			mode = ParserMode.single;
		// 		}
				
		// 		const arg = parse(
		// 			context,
		// 			mode,
		// 			// getLast(context)!.indentation + 1,
		// 			newIndentation,
		// 			null
		// 		)[0];
				
		// 		if (arg == undefined) {
		// 			ASTnodes.push(left); // undo pop
		// 			// if (doIndentationCancel()) {
		// 			// 	earlyReturn();
		// 			// 	return ASTnodes;
		// 			// }
		// 		} else {
		// 			ASTnodes.push(new ASTnode_call(left.location, left, arg));
		// 			continue;
		// 		}
		// 	}
		// }
		
		if (
			mode == ParserMode.single &&
			ASTnodes.length > 0 &&
			getNext(context).kind != TokenKind.operator
		) {
			earlyReturn();
			return ASTnodes;
		}
		
		const token = forward(context);
		const nextIndentation = getIndentation(token) + 1;
		
		switch (token.kind) {
			case TokenKind.command: {
				ASTnodes.push(new ASTnode_command(token.location, token.text));
				break;
			}
			
			case TokenKind.comment: {
				continue;
			}
			
			case TokenKind.number: {
				ASTnodes.push(Float64_new(token.location, Number(token.text)));
				break;
			}
			
			case TokenKind.string: {
				ASTnodes.push(String_new(token.location, token.text));
				break;
			}
			
			case TokenKind.word: {
				if (token.text == "true" || token.text == "false") {
					ASTnodes.push(Bool_new(token.location, token.text == "true"));
				}
				
				else if (token.text == "if") {
					const condition = parse(context, ParserMode.normal, nextIndentation, null)[0];
					if (!condition) {
						throw new CompileError("if expression is missing a condition").indicator(token.location, "here");
					}
					const then = forward(context);
					if (then.kind != TokenKind.word || then.text != "then") {
						throw new CompileError("expected then").indicator(then.location, "here");
					}
					
					const trueBody = parse(context, ParserMode.normal, nextIndentation, null);
					const _else = forward(context);
					if (_else.kind != TokenKind.word || _else.text != "else") {
						throw new CompileError("expected else").indicator(_else.location, "here");
					}
					
					const falseBody = parse(context, ParserMode.normal, nextIndentation, null);
					
					ASTnodes.push(new ASTnode_if(
						token.location,
						condition,
						trueBody,
						falseBody
					));	
				}
				
				// else if (token.text == "struct") {
				// 	const fields = parseFields(context);
				// 	ASTnodes.push(new ASTnodeType_struct(token.location, "", fields));
				// }
				
				// else if (token.text == "enum") {
				// 	const fields = parseFields(context);
					
				// 	ASTnodes.push(new ASTnodeType_enum(
				// 		token.location,
				// 		"",
				// 		fields,
				// 	));
				// }
				
				// else if (token.text == "match") {
				// 	const expression = parse(context, ParserMode.single, indentation, null, getLine(token))[0];
					
				// 	const openingBracket = forward(context);
				// 	if (openingBracket.kind != TokenKind.separator || openingBracket.text != "{") {
				// 		throw new CompileError("expected openingBracket").indicator(openingBracket.location, "here");
				// 	}
				// 	const codeBlock = parse(context, ParserMode.normal, indentation, "}", getLine(token));
					
				// 	ASTnodes.push({
				// 		kind: "match",
				// 		location: token.location,
				// 		expression: expression,
				// 		codeBlock: codeBlock,
				// 	});
				// }
				
				// else if (token.text == "unsafeEffect") {
				// 	const source = forward(context);
				// 	if (source.kind != TokenKind.string) {
				// 		throw new CompileError("expected source string").indicator(source.location, "here");
				// 	}
					
				// 	const listNode = parse(context, ParserMode.singleNoContinue, nextIndentation, null);
				// 	if (listNode.length == 0) {
				// 		utilities.TODO_addError();
				// 	}
					
				// 	const type = parse(
				// 		context,
				// 		ParserMode.singleNoContinue,
				// 		getIndentation(token) + 1,
				// 		null
				// 	);
				// 	if (type.length == 0) {
				// 		utilities.TODO_addError();
				// 	}
					
				// 	ASTnodes.push(new ASTnode_unsafeEffect(token.location, source.text, listNode[0], type[0]));
				// }
				
				else {
					ASTnodes.push(new ASTnode_identifier(token.location, token.text));
				}
				break;
			}
			
			case TokenKind.separator: {
				if (token.text == endAt) {
					return ASTnodes;
				}
				if (token.text == "(") {
					const elements = parse(context, ParserMode.comma, nextIndentation, ")");
					if (elements.length == 0) {
						utilities.TODO();
					} else if (elements.length > 1) {
						utilities.TODO_addError();
					} else {
						ASTnodes.push(elements[0]);
					}
				}
				
				// else if (token.text == "[") {
				// 	const elements = parse(context, ParserMode.comma, nextIndentation, "]");
					
				// 	ASTnodes.push(new ASTnode_list(token.location, elements));
				// }
				
				// else if (token.text == "@") {
				// 	const name = forward(context);
				// 	if (name.kind != TokenKind.word) {
				// 		throw new CompileError("expected name for function argument").indicator(token.location, "here");
				// 	}
					
				// 	const openingParentheses = forward(context);
				// 	if (openingParentheses.kind != TokenKind.separator || openingParentheses.text != "(") {
				// 		throw new CompileError("expected openingParentheses").indicator(openingParentheses.location, "here");
				// 	}
					
				// 	const type = parse(context, ParserMode.normal, nextIndentation, ")")[0];
				// 	if (!type) {
				// 		throw new CompileError("function argument without a type").indicator(name.location, "here");
				// 	}
					
				// 	const body = parse(context, ParserMode.normal, nextIndentation, null);
				// 	ASTnodes.push(new ASTnode_function(
				// 		token.location, 
				// 		new ASTnode_argument(token.location, name.text, type),
				// 		body
				// 	));
				// }
				
				else if (token.text == "&") {
					let prototype = null;
					if (getNext(context).kind != TokenKind.separator || getNext(context).text != "{") {
						prototype = parse(context, ParserMode.single, nextIndentation, null)[0];
						if (!prototype || !(prototype instanceof ASTnode_object)) {
							utilities.TODO_addError();
						}
					}
					
					const openingBracket = forward(context);
					if (openingBracket.kind != TokenKind.separator || openingBracket.text != "{") {
						throw new CompileError("expected openingBracket for field list")
							.indicator(openingBracket.location, "here");
					}
					const members = parse(context, ParserMode.normal, nextIndentation, "}");
					
					ASTnodes.push(new ASTnode_object(token.location, prototype, members));
				}
				
				// else if (token.text == "\\") {
				// 	const openingParentheses = forward(context);
				// 	if (openingParentheses.kind != TokenKind.separator || openingParentheses.text != "(") {
				// 		throw new CompileError("expected openingParentheses").indicator(openingParentheses.location, "here");
				// 	}
					
				// 	const type = parse(context, ParserMode.normal, nextIndentation, ")")[0];
				// 	if (!type) {
				// 		throw new CompileError("function argument without a type").indicator(token.location, "here");
				// 	}
					
				// 	const returnType = parseType(context, "->");
				// 	if (!returnType) {
				// 		throw new CompileError("function type must have a return type").indicator(token.location, "here");
				// 	}
					
				// 	ASTnodes.push(new ASTnodeType_functionType(
				// 		token.location,
				// 		JSON.stringify(token.location),
				// 		type,
				// 		returnType,
				// 	));
				// }
				
				else if (token.text == ":") {
					throw new CompileError("unexpected separator ':'").indicator(token.location, "here");
				}
				
				// else if (token.text == "{") {
				// 	const members = parse(context, ParserMode.normal, nextIndentation, "}");
					
				// 	ASTnodes.push(new ASTnode_object(token.location, members));
				// }
				
				else {
					if (endAt == null) {
						context.i--;
						return ASTnodes;
					} else {
						throw new CompileError("unexpected separator").indicator(token.location, "here");
					}
				}
				break;
			}
			case TokenKind.operator: {
				const left = ASTnodes[ASTnodes.length-1];
				if (left == undefined) {
					ASTnodes.push(new ASTnode_identifier(token.location, token.text));
				} else {
					if (token.text == "->") {
						utilities.TODO();
					} else {
						context.i--;
						ASTnodes.pop();
						ASTnodes.push(parseOperators(context, left, 0));
					}
				}
				break;
			}
			
			case TokenKind.endOfFile: {
				return ASTnodes;
			}
		
			default: {
				utilities.unreachable();
			}
		}
		
		if (mode == ParserMode.singleNoContinue) {
			earlyReturn();
			return ASTnodes;
		}
		
		if (mode == ParserMode.singleNoOperatorContinue) {
			earlyReturn();
			return ASTnodes;
		}
		
		if (context.tokens[context.i] && getNext(context).kind == TokenKind.operator) {
			if (mode == ParserMode.singleNoEqualsOperatorContinue && getNext(context).text == "=") {
				earlyReturn();
				return ASTnodes;
			}
			continue;
		}
		
		if (mode == ParserMode.singleNoEqualsOperatorContinue) {
			earlyReturn();
			return ASTnodes;
		}
		
		if (mode == ParserMode.singleNoCall) {
			earlyReturn();
			return ASTnodes;
		}
		
		if (
			ASTnodes.length > 0 &&
			more(context) &&
			getNext(context).kind != TokenKind.operator &&
			!(getNext(context).kind == TokenKind.separator && getNext(context).text == ",")
		) {
			continue; // continue for fn call at top of loop
		}
		
		if (mode == ParserMode.comma) {
			const comma = forward(context);
			if (comma.kind != TokenKind.separator || comma.text != ",") {
				throw new CompileError("expected a comma").indicator(comma.location, "here");
			}
		}
	}
	
	return ASTnodes;
}