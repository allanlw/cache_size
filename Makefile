all: cache_size

cache_size: cache_size.c
	gcc -o $@ $< -O2 -std=c99 -march=native -Wall -Wextra

clean:
	rm -rf cache_size
