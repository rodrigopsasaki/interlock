for (let index = 0; index < 25; index += 1) {
  process.stdout.write(`stdout-${index}\n`);
  process.stderr.write(`stderr-${index}\n`);
}
