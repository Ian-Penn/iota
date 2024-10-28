# Iota - A Small Functional Language

## Design Goals

### Be as consistent as possible (within reason)
```iota
// You make an alias using equals.
a = 1

// And you make a function using: @argName(ArgType) result
// So defining a function that you want to use later should be:
add1 = @x(Number) x + 1

add1 a // -> 2
```

### Be surprisingly transparent
```iota
// If add is defined as:
add = @a(Number) @b(Number) a + b

// The value of add should simply be:
add // -> @a(Number) @b(Number) a + b

// And this should work well with currying.
add 1 // -> @b(Number) 1 + b

// And finally:
add 1 2 // -> 3
```