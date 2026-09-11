const args = process.argv.slice(2);
process.stdout.write(`argv: ${args.join(" ")}\n`);
process.exitCode = Number(process.env["FAKE_BIN_EXIT_CODE"] ?? "0");
