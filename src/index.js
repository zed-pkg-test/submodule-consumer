// Reads the schema that arrives via the git submodule at vendor/schema.
// A consumer of the PUBLISHED package needs this file to be in the artifact --
// which depends entirely on whether the submodule was checked out at pack time.
const fs = require("node:fs");
const path = require("node:path");

const schemaPath = path.join(__dirname, "..", "vendor", "schema", "schema.json");
module.exports.schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
module.exports.TITLE = module.exports.schema.title;
