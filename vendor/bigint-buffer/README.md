# Local bigint-buffer replacement

This package is a small, pure-JavaScript implementation of the `bigint-buffer`
API used by `znn-ts-sdk`. It intentionally does not compile or load the
upstream native addon. Conversion to a fixed-width buffer validates that the
value fits before allocating the result, so oversized values cannot be silently
truncated.

It is installed from this repository to keep the browser bundle independent of
the unmaintained native implementation in `bigint-buffer@1.1.5`.
