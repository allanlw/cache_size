#include <stdio.h>
#include <time.h>
#include <unistd.h>
#include <sys/time.h>
#include <stdlib.h>
#include <assert.h>
#include <math.h>
#include <string.h>

#define NUM_ACCESSES (1 << 24)

#define MIN_ARRAY_SIZE (1024)
#define SIZE_MAGNITUDE 16
#define MAX_ARRAY_SIZE (MIN_ARRAY_SIZE * (2 << SIZE_MAGNITUDE))

#define MIN_STRIDE 16
#define STRIDES_MAGNITUDE 8

static volatile char measurement_array[MAX_ARRAY_SIZE];

// https://stackoverflow.com/questions/3898840/converting-a-number-of-bytes-into-a-file-size-in-c
void printsize(int size) {
    static const char *SIZES[] = { "B", "k", "M", "G" };
    unsigned int div = 0;

    while (size >= 1024 && div < (sizeof SIZES / sizeof *SIZES)) {
        div++;
        size /= 1024;
    }

    printf("% 6d%s", size, SIZES[div]);
}

double microtime() {
  struct timeval t;
  if (gettimeofday(&t, NULL) != 0) {
    perror("Couldn't gettimeofday?");
    exit(1);
  }
  return (double)t.tv_sec + ((double)t.tv_usec / 1.0e6);
}

double measure(int array_size, int stride) {
  assert(array_size <= MAX_ARRAY_SIZE);
  int rounds = NUM_ACCESSES / (array_size / stride);
  double start = microtime();
  for (int i = 0; i < rounds; i++) {
    for (int j = 0; j < array_size; j += stride) {
      measurement_array[j] = 0;
    }
  }
  double end = microtime();
  double total_time = end - start;
  return total_time / NUM_ACCESSES;
}

int main() {
  double * results = malloc(sizeof(double) * SIZE_MAGNITUDE * STRIDES_MAGNITUDE);

  memset((char *)measurement_array, 0, sizeof(measurement_array));

  printf("Showing avg time to access memory in nanoseconds. Rows are array size, columns are stride\n");
  printf("-------");
  for (int i = 0; i < STRIDES_MAGNITUDE; i++) {
    printsize(MIN_STRIDE * (2 << i));
  }
  putchar('\n');

  for (int i = 0; i < SIZE_MAGNITUDE; i++) {
    int as = MIN_ARRAY_SIZE * (2 << i);
    printsize(as);
    for (int j = 0; j < STRIDES_MAGNITUDE; j++) {
      int stride = MIN_STRIDE * (2 << j);
      double cache_time;
      if (stride < as) {
        cache_time = measure(as, stride);
      } else {
        cache_time = NAN;
      }
      results[i * STRIDES_MAGNITUDE + j] = cache_time;
      printf(" %6.3f", cache_time * 1.0e9);
      fflush(stdout);
    }
    putchar('\n');
  }

  return 0;
}
