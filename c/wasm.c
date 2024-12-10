#define NULL (void *)0
#define true 1
#define false 0

#define WASM_EXPORT __attribute__((visibility("default")))

void memset(void *b, int c, int len) {
	unsigned char *p = b;
	while(len > 0) {
		*p = c;
		p += 1;
		len -= 1;
	}
}

extern unsigned char __heap_base;

void *bump_pointer = &__heap_base;
void* malloc(int size) {
	void *ptr = bump_pointer;
	bump_pointer += size;
	memset(ptr, 0, size);
	return ptr;
}

// TODO
// void free(void* ptr) {}

void freeAll() {
	bump_pointer = &__heap_base;
}