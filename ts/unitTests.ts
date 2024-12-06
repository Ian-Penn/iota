import test from 'node:test';
import assert from 'node:assert';
import { ASTnode, ASTnode_if, ASTnode_unknown } from './ASTnodes.js';
import { getBuiltinType } from './builtin.js';

test("one", () => {
	// const node = new ASTnode_if(
	// 	"builtin",
	// 	new ASTnode_unknown("builtin", getBuiltinType("Bool")),
		
	// );
	assert.strictEqual(1, 1);
});

test("two", () => {
	assert.strictEqual(1, 2);
});