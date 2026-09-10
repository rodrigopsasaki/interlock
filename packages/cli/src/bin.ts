import { run } from "./main.ts";

const result = await run(process.argv.slice(2));
const stream = result.exitCode === 0 ? process.stdout : process.stderr;
stream.write(`${result.message}\n`);
process.exitCode = result.exitCode;
