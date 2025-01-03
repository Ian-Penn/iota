import { SourceLocation } from "./ASTnodes.js";

// export function isOperator(text: string) {
// 	return text == '+' ||
// 	text == '-' ||
// 	text == '*' ||
// 	text == '/' ||
// 	text == '%' ||
// 	text == '==' ||
// 	text == '>' ||
// 	text == '<' ||
// 	text == '>=' ||
// 	text == '<=';
// }

export const aliasOperator = "is";
export const inSetOperator = "in";
export const notInSetOperator = "!in";

export enum TokenKind {
	command,
	comment,
	
	number,
	string,
	word,
	
	separator,
	operator,
	endOfFile,
};

export type Token = {
	kind: TokenKind,
	text: string,
	location: SourceLocation,
	endLine?: number,
};

function wordStart(text: string, i: number): boolean {
	return (text[i] >= 'a' && text[i] <= 'z') || (text[i] >= 'A' && text[i] <= 'Z') || text[i] == '_';
}

function wordContinue(text: string, i: number): boolean {
	return wordStart(text, i) || base10Number(text, i);// || oneCharacterOperator(text, i)
}

function base10Number(text: string, i: number): boolean {
	return text[i] >= '0' && text[i] <= '9';
}

function operator(text: string, i: number): string | null {
	const three = text[i] + text[i+1] + text[i+2];
	if (
		three == notInSetOperator
	) {
		return three;
	}
	
	const two = text[i] + text[i+1];
	if (
		two == aliasOperator ||
		two === inSetOperator ||
		text[i] == '!' && text[i+1] == '=' ||
		text[i] == '<' && text[i+1] == '=' ||
		text[i] == '>' && text[i+1] == '=' ||
		text[i] == '|' && text[i+1] == '|' ||
		text[i] == '-' && text[i+1] == '>'
	) {
		return two;
	}
	
	if (
		text[i] == '>' ||
		text[i] == '<' ||
		text[i] == '=' ||
		text[i] == '+' ||
		text[i] == '-' ||
		text[i] == '*' ||
		text[i] == '/' ||
		text[i] == '%' ||
		text[i] == '.' ||
		text[i] == '&'
	) {
		return text[i];
	}
	
	return null;
}

function separator(text: string, i: number): boolean {
	return text[i] == '(' ||
	text[i] == ')' ||
	text[i] == '{' ||
	text[i] == '}' ||
	text[i] == '[' ||
	text[i] == ']' ||
	text[i] == ';' ||
	text[i] == ',' ||
	text[i] == '@' ||
	text[i] == '#' ||
	text[i] == ':' ||
	text[i] == '\\';
}

export function lex(filePath: string, text: string): Token[] {
	let tokens: Token[] = [];
	
	let line = 1;
	let column = 1;
	let columnStartI = 0;
	let indentation = 0;
	let onIndentation = true;
	
	for (let i = 0; i < text.length; i++) {
		if (text[i] == "\n") {
			line++;
			column = 0;
			columnStartI = i;
			indentation = 0;
			onIndentation = true;
			continue;
		}
		
		column += i - columnStartI;
		
		columnStartI = i;
		const startColumn = column;
		
		let type;
		let str = "";
		let location: SourceLocation;
		let endLine;
		
		// comment
		if (text[i] == '/' && text[i+1] == '/') {
			i++;
			if (text[i+1] == " ") i++;
			
			for (; i < text.length; i++) {
				if (!text[i+1] || text[i+1] == "\n") {
					break;
				} else {
					str += text[i+1];
				}
			}
			
			if (
				tokens.length > 0 &&
				tokens[tokens.length - 1] &&
				tokens[tokens.length - 1].kind == TokenKind.comment
			) {
				const lastComment = tokens[tokens.length - 1];
				if (lastComment.location != "builtin" && lastComment.endLine && lastComment.endLine + 1 == line) {
					lastComment.text += "\n" + str;
					lastComment.endLine = line;
					continue;
				}
			}
			
			type = TokenKind.comment;
			location = {
				path: filePath,
				line: line,
				startColumn: startColumn,
				endColumn: startColumn,
				indentation: indentation,
			};
			endLine = line;
		}
		
		else if (text[i] == '>' && startColumn == 1) {
			i++;
			
			for (; i < text.length; i++) {
				if (text[i] == "\n") {
					i--;
					break;
				} else {
					str += text[i];
				}
			}
			
			type = TokenKind.command;
			location = {
				path: filePath,
				line: line,
				startColumn: startColumn,
				endColumn: startColumn,
				indentation: indentation,
			};
		}
		
		else if ((text[i] == "-" && base10Number(text, i + 1)) || base10Number(text, i)) {
			if (text[i] == "-") {
				str += "-";
				i++;
			}
			for (; i < text.length; i++) {
				if (base10Number(text, i) || text[i] == '.') {
					str += text[i];	
				} else {
					break;
				}
			}
			
			i--;
			
			type = TokenKind.number;
			location = {
				path: filePath,
				line: line,
				startColumn: startColumn,
				endColumn: startColumn + str.length - 1,
				indentation: indentation,
			};
		}
		
		// else if (twoCharacterOperator(text, i)) {
		// 	i++;
		// 	type = TokenKind.operator;
		// 	str = text[i-1] + text[i];
		// 	location = {
		// 		path: filePath,
		// 		line: line,
		// 		startColumn: startColumn,
		// 		endColumn: startColumn + 1,
		// 		indentation: indentation,
		// 	};
		// }
		
		// else if (oneCharacterOperator(text, i)) {
		// 	type = TokenKind.operator;
		// 	str = text[i];
		// 	location = {
		// 		path: filePath,
		// 		line: line,
		// 		startColumn: startColumn,
		// 		endColumn: startColumn,
		// 		indentation: indentation,
		// 	};
		// }
		
		else if (operator(text, i) != null) {
			str = operator(text, i)!;
			i += str.length - 1;
			type = TokenKind.operator;
			location = {
				path: filePath,
				line: line,
				startColumn: startColumn,
				endColumn: startColumn + str.length - 1,
				indentation: indentation,
			};
		}
		
		else if (separator(text, i)) {
			type = TokenKind.separator;
			str = text[i];
			location = {
				path: filePath,
				line: line,
				startColumn: startColumn,
				endColumn: startColumn,
				indentation: indentation,
			};
		}
		
		// word
		else if (wordStart(text, i)) {
			for (; i < text.length; i++) {
				if (wordContinue(text, i)) {
					str += text[i];	
				} else {
					break;
				}
			}
			
			i--;
			
			type = TokenKind.word;
			location = {
				path: filePath,
				line: line,
				startColumn: startColumn,
				endColumn: startColumn + str.length - 1,
				indentation: indentation,
			};
		}
		
		// string
		else if (text[i] == "\"") {
			i++;
			for (; i < text.length; i++) {
				if (text[i] != "\"") { // "
					if (text[i] == "\\") { // \
						if (text[i+1] == "n") { // new line
							str += "\n";
						} else if (text[i+1] == "t") { // tab
							str += "\t";
						} else if (text[i+1] == "\"") { // "
							str += "\"";
						} else if (text[i+1] == "\\") { // \
							str += "\\";
						}
						i++;
						continue;
					}
					str += text[i];	
				} else {
					break;
				}
			}
			
			type = TokenKind.string;
			location = {
				path: filePath,
				line: line,
				startColumn: startColumn,
				endColumn: startColumn + str.length + 1,
				indentation: indentation,
			};
		} else {
			if (onIndentation && (text[i] == " " || text[i] == "\t")) {
				indentation++;
			}
			continue;
		}
		
		onIndentation = false;
		
		tokens.push({
			kind: type,
			text: str,
			location: location,
			endLine: endLine,
		});
	}
	
	return tokens;
}