import { join } from "node:path";

process.env["GIT_CEILING_DIRECTORIES"] = join(process.cwd(), "test");
process.env["INTERLOCK_MACHINE"] = join(
  import.meta.dirname,
  "test",
  "fixtures",
  "machine-none.yaml",
);
