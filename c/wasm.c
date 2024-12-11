#pragma once

// #define WASM_EXPORT __attribute__((visibility("default")))

typedef enum Bool {
	true = 1,
	false = 0,
} Bool;

int min(int a, int b) {
	if (a < b) {
		return a;
	} else {
		return b;
	}
}

// #define NO_MAIN

#ifdef NO_MAIN

#define NULL (void *)0

int memcmp(const void *a, const void *b, int size) {
	for (int i = 0; i < size; i++) {
		if (a != b) {
			return i;
		}
	}
	
	return 0;
}

void memset(void *b, int c, int len) {
	unsigned char *p = b;
	while(len > 0) {
		*p = c;
		p += 1;
		len -= 1;
	}
}

int strlen(char *str) {
	int len = 0;
	while (str[len] != 0) len++;
	return len;
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

#else
#include <stdio.h>
#include <stdarg.h>
#include <stdlib.h>
#include <string.h>
#endif