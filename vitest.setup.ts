import { join } from "node:path";

process.env["GIT_CEILING_DIRECTORIES"] = join(process.cwd(), "test");
