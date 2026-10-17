// Pitch-only: @react-pdf/hyphenate exports subpaths for "import" only; map the require() used under tsx to the file.
const Module = require("module");
const path = require("path");
const orig = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request.startsWith("@react-pdf/hyphenate/")) {
    request = path.join(process.cwd(), "node_modules/@react-pdf/hyphenate/lib", request.split("/").pop() + ".js");
  }
  return orig.call(this, request, ...rest);
};
