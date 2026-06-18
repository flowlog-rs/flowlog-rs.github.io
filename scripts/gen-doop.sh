#!/usr/bin/env bash
# Regenerate src/doopProgram.js (the string module the playground imports) from
# the editable src/doop.dl. Escapes backslashes and backticks so the `\t`
# delimiters survive inside the JS template literal.
#
# Edit src/doop.dl, then run `make doop` (or `bash scripts/gen-doop.sh`).
set -euo pipefail
cd "$(dirname "$0")/.."
{
  printf 'export default `'
  sed -e 's/\\/\\\\/g' -e 's/`/\\`/g' src/doop.dl
  printf '`;\n'
} > src/doopProgram.js
echo "regenerated src/doopProgram.js from src/doop.dl ($(wc -l < src/doop.dl) lines)"
