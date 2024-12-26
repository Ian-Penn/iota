import { Report } from "./report.js";
import { aliasOperator, inSetOperator, notInSetOperator, Token, TokenKind } from "./lexer.js";
import {
	ASTnode,
	ASTnode_alias,
	ASTnode_atom,
	ASTnode_bool,
	ASTnode_codeBlock,
	ASTnode_event,
	ASTnode_field,
	ASTnode_for,
	ASTnode_identifier,
	ASTnode_memberAccess,
	ASTnode_number,
	ASTnode_operator,
	ASTnode_set,
	ASTnode_string,
} from "./ASTnodes.js";
import { TODO, TODO_addError, unreachable } from "./utilities.js";

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
		unreachable();
	}
	return token.location.indentation;
}

function getOperatorPrecedence(operatorText: string): number {
	if (operatorText == aliasOperator || operatorText == "->") {
		return 1;
	}
	
	else if (
		operatorText == "=" ||
		operatorText == "!=" ||
		operatorText == ">" ||
		operatorText == "<" ||
		operatorText == ">=" ||
		operatorText == "<="
	) {
		return 2;
	}
	
	else if (operatorText == "|") {
		return 3;
	}
	
	else if (operatorText == "&") {
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
	
	else if (operatorText == inSetOperator || operatorText == notInSetOperator) {
		return 7;
	}
	
	else if (operatorText == ".") {
		return 8;
	}
	
	else {
		unreachable();
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
		throw new Report("unexpected end of file").indicator(context.tokens[i-1].location, "last token here");
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
			if (nextOperator.text == aliasOperator || nextOperator.text == "->") {
				mode = ParserMode.single;
			} else if (nextOperator.text == ".") {
				mode = ParserMode.singleNoContinue;
			} else {
				mode = ParserMode.singleNoOperatorContinue;
			}
			
			const _r = parse(context, mode, getIndentation(nextOperator), null)[0];
			if (_r == undefined) {
				throw new Report("nothing on right side of operator").indicator(nextOperator.location, "here");
			}
			right = parseOperators(context, _r, nextPrecedence);
			
			while (right instanceof ASTnode_operator && getNext(context).kind == TokenKind.operator) {
				const newRight = parseOperators(context, right, nextPrecedence);
				if (newRight == right) break;
				right = newRight;
			}
			
			if (nextOperator.text == aliasOperator) {
				return new ASTnode_alias(nextOperator.location, left, right); // TODO: rm?
			} else if (nextOperator.text == ".") {
				if (!(right instanceof ASTnode_identifier)) {
					TODO_addError();
				}
				return new ASTnode_memberAccess(nextOperator.location, left, right.name);
			} else {
				return new ASTnode_operator(nextOperator.location, nextOperator.text, left, right);
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

function getLine(input: ASTnode | Token): number {
	if (typeof input.location == "string") {
		unreachable();
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
				TODO();
			}
		}
	}
	
	function doIndentationCancel(): boolean {
		const lastT = getLast(context);
		if (lastT) {
			const nextT = getNext(context);
			if (typeof lastT.location == "string" || typeof nextT.location == "string") {
				unreachable();
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
						throw new Report("unexpected separator")
							.indicator(nextToken.location, `expected '${endAt} but got '${nextToken.text}'`);
					}
				}
			}
		}
		
		// if (getNext(context).kind == TokenKind.word) {
		// 	const nextWord = getNext(context).text;
		// 	if (nextWord == "then" || nextWord == "else") {
		// 		return ASTnodes;
		// 	}
		// }
		
		// indentation canceling
		if (doIndentationCancel()) {
			earlyReturn();
			return ASTnodes;
		}
		
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
			// case TokenKind.command: {
			// 	ASTnodes.push(new ASTnode_command(token.location, token.text));
			// 	break;
			// }
			
			case TokenKind.comment: {
				continue;
			}
			
			case TokenKind.number: {
				ASTnodes.push(new ASTnode_number(token.location, Number(token.text)));
				break;
			}
			
			case TokenKind.string: {
				ASTnodes.push(new ASTnode_string(token.location, token.text));
				break;
			}
			
			case TokenKind.word: {
				if (token.text == "true" || token.text == "false") {
					ASTnodes.push(new ASTnode_bool(token.location, token.text == "true"));
				}
				
				else if (token.text == "let") {
					const left = parse(context, ParserMode.singleNoOperatorContinue, nextIndentation, null)[0];
					if (left == undefined) TODO_addError();
					
					const equals = forward(context);
					if (equals.kind != TokenKind.operator || equals.text != "=") {
						throw new Report("expected equals").indicator(equals.location, "here");
					}
					
					const value = parse(context, ParserMode.single, nextIndentation, null)[0];
					if (value == undefined) TODO_addError();
					
					ASTnodes.push(new ASTnode_alias(token.location, left, value));
				}
				
				else if (token.text == "for") {
					const name = forward(context);
					if (name.kind != TokenKind.word) {
						throw new Report("expected name").indicator(name.location, "here");
					}
					
					const inOperator = forward(context);
					if (inOperator.kind != TokenKind.operator || inOperator.text != "in") {
						throw new Report("expected 'in' for 'for'").indicator(inOperator.location, "here");
					}
					
					const set = parse(context, ParserMode.singleNoContinue, nextIndentation, null)[0];
					if (set == undefined) TODO_addError();
					
					ASTnodes.push(new ASTnode_for(token.location, name.text, set));
				}
				
				else if (token.text == "old") {
					const identifier = parse(context, ParserMode.singleNoContinue, nextIndentation, null)[0];
					if (!(identifier instanceof ASTnode_identifier)) {
						TODO_addError();
					}
					
					identifier.useOld = true;
					ASTnodes.push(identifier);
				}
				
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
						TODO();
					} else if (elements.length > 1) {
						TODO_addError();
					} else {
						ASTnodes.push(elements[0]);
					}
				}
				
				else if (token.text == "[") {
					const elements = parse(context, ParserMode.comma, nextIndentation, "]");
					if (elements.length != 0) TODO();
					
					ASTnodes.push(new ASTnode_set(token.location));
				}
				
				else if (token.text == "{") {
					const body = parse(context, ParserMode.normal, nextIndentation, "}");
					
					ASTnodes.push(new ASTnode_codeBlock(token.location, body));
				}
				
				else if (token.text == "@") {
					ASTnodes.push(new ASTnode_atom(token.location));
				}
				
				else if (token.text == ":") {
					const left = ASTnodes.pop();
					if (left == undefined) {
						TODO_addError();
					}
					if (!(left instanceof ASTnode_identifier)) {
						TODO_addError();
					}
					
					const right = parse(context, ParserMode.single, nextIndentation, null)[0];
					if (right == undefined) {
						TODO_addError();
					}
					
					ASTnodes.push(new ASTnode_field(token.location, left.name, right));
				}
				
				else if (token.text == "#") {
					const name = forward(context);
					if (name.kind != TokenKind.word) {
						throw new Report("expected name").indicator(name.location, "here");
					}
					
					const openingParentheses = forward(context);
					if (openingParentheses.kind != TokenKind.separator || openingParentheses.text != "(") {
						throw new Report("expected openingParentheses").indicator(openingParentheses.location, "here");
					}
					
					const args = parse(context, ParserMode.comma, nextIndentation, ")");
					
					ASTnodes.push(new ASTnode_event(token.location, name.text, args));
				}
				
				else {
					if (endAt == null) {
						context.i--;
						return ASTnodes;
					} else {
						throw new Report("unexpected separator").indicator(token.location, "here");
					}
				}
				break;
			}
			case TokenKind.operator: {
				const left = ASTnodes[ASTnodes.length-1];
				if (left == undefined) {
					ASTnodes.push(new ASTnode_identifier(token.location, token.text));
				} else {
					context.i--;
					ASTnodes.pop();
					ASTnodes.push(parseOperators(context, left, 0));
				}
				break;
			}
			
			case TokenKind.endOfFile: {
				return ASTnodes;
			}
		
			default: {
				unreachable();
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
			if (mode == ParserMode.singleNoEqualsOperatorContinue && getNext(context).text == aliasOperator) {
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
				throw new Report("expected a comma").indicator(comma.location, "here");
			}
		}
	}
	
	return ASTnodes;
}