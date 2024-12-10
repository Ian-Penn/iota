typedef enum Instruction {
	Instruction_nop = 0x00,
	
	Instruction_func_new, // () [argType] -> [func]
	Instruction_func_call,
	
	Instruction_local_get,
	Instruction_local_set,
	
	Instruction_type_new,
	
	Instruction_table_new,
	Instruction_table_set, // (size: u8 name: char[size]) [value, table] -> [table]
	Instruction_table_get,
	
	// i32_add,
	// i32_sub,
	// i32_mul,
	// i32_div,
	
	// same as JavaScript "number"
	Instruction_f32_new, // (value: f32) []
	Instruction_f32_add, // () [right: f32, left: f32]
	Instruction_f32_sub, // () [right: f32, left: f32]
	Instruction_f32_mul, // () [right: f32, left: f32]
	Instruction_f32_div, // () [right: f32, left: f32]
} Instruction;