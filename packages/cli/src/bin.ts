import { run } from "./main.ts";

const result = run(process.argv.slice(2));
process.stderr.write(`${result.message}\n`);
process.exitCode = result.exitCode;
