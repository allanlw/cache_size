(function() {
  "use strict";

  // Why 2^19 accesses per round? I pulled it out of my ass, just like
  // all the other constants. Higher numbers give a reduction in noise
  var NUM_ACCESSES = (1 << 19);
  // Minimum size of array to use in measurement, in bytes
  // This should be smaller than what we think the smallest L1 cache size is.
  // Also it's cool to see how consistent the smaller array sizes are.
  var MIN_ARRAY_SIZE = 1024;
  // How many different sizes do we want to try? Going bigger than 32MB seems pointless
  var SIZE_MAGNITUDE = 16;

  // Minumimum byte offset to stride by. Remember: cache lines are 64 bytes
  var MIN_STRIDE = 32;
  // How many different strides do we want to try?
  var STRIDES_MAGNITUDE = 8;

  // Returns the current time as a float in seconds.
  // Higher resolution timing here would reduce noise.
  // One option is to polyfill using another worker and SharedArrayBuffer
  // But this isn't supported on most browsers yet.
  // Other options are PNaCl or similar other multithreaded polyfills.
  // performance.now() works reasonably fine though, even though it's crippled
  // and has a maximum resolution.
  // See https://bugs.chromium.org/p/chromium/issues/detail?id=506723
  var microtime;
  if (typeof performance !== "undefined" && typeof performance.now !== "undefined") {
    microtime = performance.now.bind(performance);
  // on systems that don't have it, fall back to Date.now
  // I'm looking at you Safari on Mavericks
  // Old versions of IE don't have Date.now, but they also don't have
  // Int32Array so they're screwed regardless
  } else {
    microtime = Date.now.bind(Date);
    NUM_ACCESSES *= 8; // sorry old browsers, but we need that extra precision
  }

  function measure_inner(array, array_size, stride) {
    // Divide the number of accesses that we want to do by the number of
    // hits we do per loop. Keeping the number of accesses ~constant
    // is nice for the demo because it looks cool and allows visual comparison
    // of the time it takes to do each round.
    // Note for larger array sizes this error gets bigger from the .ceil oh well
    var rounds = Math.ceil(NUM_ACCESSES / (array_size / stride));

    var start = microtime();

    // We only ever hit the end of the permutation on a multiple of 4 accesses
    // So funroll the loop a bit gentoo style.
    // We check that the precondition is true in measure_all.
    // This cuts some of the loop overhead out, which gets a bit tighter
    // results for the L1+L2 areas where the loop overhead matters.
    // It's also pretty badass tbh
    var i = 0, p = 0;
    while (true) {
      p = array[p];
      p = array[p];
      p = array[p];
      p = array[p];
      if (p === 0) { // when we hite p === 0 here, we have gone through the full permutation
        i += 1;
        if (i === rounds) {
          break;
        }
      }
    }
    // This loop terminates because we set up the entries in array as a permutation
    // of length (array_size / stride), and the length of the permutation is 0 mod 4
    // Note: Originally this was two nested for loops. Doing one loop is slightly slower
    // but much more consistent, presumably due to branch prediction.
    // Also I can't imagine how terrible all these data dependent instructions are
    // for the pipelining

    var end = microtime();

    var total_time = end - start;

    // Return the average loop iteration time.
    return total_time / (rounds * (array_size / stride));
  }

  function setup_array(array, array_size, stride) {
    // Chose an odd multiple of stride that the golden ratio times the number
    // of items that we want to access.
    // Note that this is a generator of {0,stride,2*stride,...} mod array_size
    // AKA this can generate a permutation of all the bytes we want to access
    var step = (((array_size / stride * 0.61803398875) | 1)  * stride) | 0;

    var i, current, next;

    // zero the entire array (or, the portion we care about)
    // not required at all, but  but is a nice to have
    // note: safari doesn't support array.fill, so use a loop
    for (i = 0; i < array_size/4; i += 1) {
      array[i] = 0;
    }

    // Generate our permutation and insert the index of the next element into
    // each element in the array.
    current = 0;
    for (i = 0; i < array_size; i += stride) {
      next = (current + step) % array_size; 
      array[current/4] = next/4; // divide by 4 for integer alignment
      current = next;
    }

    console.assert(current === 0, "Didn't generate?");

    // Touch every element to try to clean up our cache a bit
    for (i = 0; i < array_size/4; i+=1) {
      array[i] |= 0;
    }
  }

  // This calls measure_inner multiple times and returns the minimum, which is presumably
  // close to the optimal time that the loop in measure_inner could run in.
  function measure(measurement_array, array_size, stride) {
    var i = 0, best = 0, m;

    console.assert(array_size <= measurement_array.length * 4, "Weird size");
    console.assert((array_size / stride) % 4 === 0, "Didn't meet unroll precondition");

    setup_array(measurement_array, array_size, stride);

    // Why 4 passes? I pulled it out of my ass. Lowest number that seemed to get
    // reasonably consistent results. Lower numbers have more noise, presumably
    // Return minimum time, not average, because we want the optimal run time
    for (i = 0; i < 4; i += 1) {
      m = measure_inner(measurement_array, array_size, stride);
      if (best === 0 || m < best) {
        best = m;
      }
    }
    return best;
  }

  // This just posts a list of all possible strides we're going to test to the page
  function post_headers() {
    var headers = [], i;
    for (i = 0; i < STRIDES_MAGNITUDE; i += 1) {
      headers.push(MIN_STRIDE * (1 << i));
    }
    self.postMessage({"type": "head", "headers": headers});
  }


  function measure_all() {
    // Int32 vs. Uint32 doesn't seem to have a big difference here
    // Lets use Int32 because it's a bit more friendly to the engine, probably?
    // (For uint32 extraction don't they have to do a bunch of wankery with signs?)
    var measurement_array = new Int32Array((MIN_ARRAY_SIZE * (1 << SIZE_MAGNITUDE)) / 4);

    var results = new Float64Array(SIZE_MAGNITUDE * STRIDES_MAGNITUDE);
    var cache_time, stride, as, i, j;

    post_headers();

    // try to warm up the JIT? Does this even work?
    // It seems to help a little on FireFox for the first few
    for (i = 0; i < SIZE_MAGNITUDE/2; i += 1) {
      measure(measurement_array, MIN_ARRAY_SIZE * (1 << i), 8);
    }

    for (i = 0; i < SIZE_MAGNITUDE; i += 1) {
      as = MIN_ARRAY_SIZE * (1 << i);
      self.postMessage({"type": "start_row", "size": as});
      for (j = 0; j < STRIDES_MAGNITUDE; j += 1) {
        stride = MIN_STRIDE * (1 << j);
        // measure_inner has a funrolled loop that assumes that stride is less than half
        // of the array_size (because it assumes the permutation will be at least length 4)
        if (stride * 2 < as) {
          cache_time = measure(measurement_array, as, stride);
        } else {
          cache_time = NaN;
        }
        self.postMessage({"type":"measurement", "time": cache_time*1e6, "stride": stride });
        results[i * STRIDES_MAGNITUDE + j] = cache_time;
      }
    }

    measurement_array = null;

    self.postMessage({"type":"done", "results": results});

    close();
  }

  measure_all();
}());
