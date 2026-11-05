import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, extname, join, relative, resolve } from "node:path";
import ts from "typescript";
import { afterEach, describe, expect, it } from "vitest";
import {
  fixtureGit,
  fixtureGitArgv,
  sandboxedFixtureCommand,
} from "../../../test/support/gitFixture.ts";

// The audited fixture process boundary. Test and support sources may start processes only where
// this guard can read the command statically; Git runs only through test/support/gitFixture.ts,
// which suppresses auto-maintenance on every invocation. Anything the guard cannot resolve fails.

const repoRoot = resolve(import.meta.dirname, "..", "..", "..");
const runsRoot = join(import.meta.dirname, ".runs");

const HELPER = "test/support/gitFixture.ts";
const CHILD_PROCESS = new Set(["node:child_process", "child_process"]);
const SPAWNING = new Set([
  "execFileSync",
  "execFile",
  "spawnSync",
  "spawn",
  "execSync",
  "exec",
  "fork",
]);
const SHELL_STRING = new Set(["execSync", "exec"]);
const SHELLS = new Set(["sh", "bash", "zsh", "dash", "ksh"]);
const WRAPPERS = new Set(["env", "xargs", "nice", "nohup", "timeout", "command", "sudo", "time"]);
const SANDBOX_VALUE_OPTIONS = new Set(["-p", "-f", "-n", "-D"]);
const GIT_WORD = /(^|[^\w.-])git(?![\w-])/;
const EXECUTABLE = new Set([".ts", ".mts", ".cts", ".tsx", ".js", ".mjs", ".cjs", ".jsx"]);

// The one positive control that runs Git with maintenance left on, and the file allowed to call it.
const MAINTENANCE_CONTROL = "unsuppressedGitForMaintenanceControl";
const MAINTENANCE_CONTROL_SITES = new Set(["packages/verifier/test/fixtureCleanup.test.ts"]);

// Instrumentation that wraps child_process to observe it: allowed only in this exact file, and
// only to forward each call unchanged to the original module.
const INSTRUMENTATION_SITES = new Set(["packages/face/test/noSyncGit.test.ts"]);

interface Finding {
  readonly path: string;
  readonly line: number;
  readonly reason: string;
}

type Static = { readonly kind: "text"; readonly text: string } | { readonly kind: "node" };

function guardSource(path: string, text: string): readonly Finding[] {
  if (path === HELPER) return [];
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, scriptKind(path));
  const findings: Finding[] = [];
  const report = (node: ts.Node, reason: string): void => {
    const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
    findings.push({ path, line, reason });
  };

  const direct = new Map<string, string>();
  const namespaces = new Set<string>();
  const constants = new Map<string, ts.Expression>();

  const collect = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const list = node.parent;
      if (ts.isVariableDeclarationList(list) && (list.flags & ts.NodeFlags.Const) !== 0) {
        constants.set(node.name.text, node.initializer);
      }
    }
    ts.forEachChild(node, collect);
  };
  collect(source);

  for (const statement of source.statements) {
    if (ts.isImportDeclaration(statement) && isChildProcess(statement.moduleSpecifier)) {
      const clause = statement.importClause;
      if (clause === undefined || clause.isTypeOnly) continue;
      if (clause.name) namespaces.add(clause.name.text);
      const bindings = clause.namedBindings;
      if (bindings && ts.isNamespaceImport(bindings)) namespaces.add(bindings.name.text);
      if (bindings && ts.isNamedImports(bindings)) {
        for (const specifier of bindings.elements) {
          if (specifier.isTypeOnly) continue;
          const imported = (specifier.propertyName ?? specifier.name).text;
          if (SPAWNING.has(imported)) direct.set(specifier.name.text, imported);
          else report(specifier, `imports ${imported} from child_process, outside the audited set`);
        }
      }
    }
    if (
      ts.isExportDeclaration(statement) &&
      statement.moduleSpecifier &&
      isChildProcess(statement.moduleSpecifier)
    ) {
      report(statement, "re-exports child_process");
    }
    if (
      ts.isImportEqualsDeclaration(statement) &&
      ts.isExternalModuleReference(statement.moduleReference) &&
      isChildProcess(statement.moduleReference.expression)
    ) {
      report(statement, "requires child_process");
    }
  }

  const staticValue = (
    expression: ts.Expression,
    seen: ReadonlySet<string> = new Set(),
  ): Static | undefined => {
    if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
      return { kind: "text", text: expression.text };
    }
    if (ts.isParenthesizedExpression(expression) || ts.isAsExpression(expression)) {
      return staticValue(expression.expression, seen);
    }
    if (
      ts.isPropertyAccessExpression(expression) &&
      ts.isIdentifier(expression.expression) &&
      expression.expression.text === "process" &&
      expression.name.text === "execPath"
    ) {
      return { kind: "node" };
    }
    if (ts.isIdentifier(expression) && !seen.has(expression.text)) {
      const initializer = constants.get(expression.text);
      if (initializer) return staticValue(initializer, new Set([...seen, expression.text]));
    }
    return undefined;
  };

  const staticText = (expression: ts.Expression): string | undefined => {
    const value = staticValue(expression);
    return value?.kind === "text" ? value.text : undefined;
  };

  const checkArgv = (
    at: ts.Node,
    command: Static,
    args: readonly ts.Expression[] | undefined,
  ): void => {
    if (command.kind === "node") return;
    const name = basename(command.text);
    if (name === "git") {
      report(at, "runs git directly instead of through test/support/gitFixture.ts");
      return;
    }
    if (SHELLS.has(name)) {
      checkShellArgv(at, args);
      return;
    }
    if (name === "sandbox-exec") {
      checkSandboxArgv(at, args);
      return;
    }
    if (WRAPPERS.has(name)) checkWrapperArgv(at, args);
  };

  const checkShellArgv = (at: ts.Node, args: readonly ts.Expression[] | undefined): void => {
    if (args === undefined) {
      report(at, "starts a shell whose arguments are not a literal array");
      return;
    }
    const flag = args.findIndex((arg) => staticText(arg) === "-c");
    const script = args[flag + 1];
    const leading = args.slice(0, flag + 2);
    if (
      flag === -1 ||
      script === undefined ||
      leading.some((arg) => staticText(arg) === undefined)
    ) {
      report(at, "starts a shell without a static -c script");
      return;
    }
    if (GIT_WORD.test(staticText(script) ?? "")) report(at, "runs git through a shell script");
  };

  const checkSandboxArgv = (at: ts.Node, args: readonly ts.Expression[] | undefined): void => {
    if (args === undefined) {
      report(at, "starts sandbox-exec whose arguments are not a literal array");
      return;
    }
    let index = 0;
    for (let option = args[0]; option !== undefined; option = args[index]) {
      if (!SANDBOX_VALUE_OPTIONS.has(staticText(option) ?? "")) break;
      index += 2;
    }
    const nested = args[index];
    const nestedCommand = nested === undefined ? undefined : staticValue(nested);
    if (nestedCommand === undefined) {
      report(at, "starts sandbox-exec with a command the guard cannot read");
      return;
    }
    checkArgv(at, nestedCommand, args.slice(index + 1));
  };

  const checkWrapperArgv = (at: ts.Node, args: readonly ts.Expression[] | undefined): void => {
    const texts = args?.map(staticText);
    if (texts === undefined || texts.some((text) => text === undefined)) {
      report(at, "starts a command wrapper whose arguments the guard cannot read");
      return;
    }
    if (texts.some((text) => text !== undefined && GIT_WORD.test(text))) {
      report(at, "runs git beneath a command wrapper");
    }
  };

  const literalElements = (
    expression: ts.Expression | undefined,
  ): readonly ts.Expression[] | undefined => {
    if (expression === undefined) return [];
    if (!ts.isArrayLiteralExpression(expression)) return undefined;
    if (expression.elements.some(ts.isSpreadElement)) return undefined;
    return expression.elements;
  };

  const checkCall = (call: ts.CallExpression, name: string): void => {
    const [first, second] = call.arguments;
    if (first === undefined || ts.isSpreadElement(first)) {
      report(call, `calls ${name} with a command the guard cannot read`);
      return;
    }
    if (SHELL_STRING.has(name)) {
      const script = staticText(first);
      if (script === undefined)
        report(call, `calls ${name} with a shell string the guard cannot read`);
      else if (GIT_WORD.test(script)) report(call, `runs git through ${name}'s shell`);
      return;
    }
    const command = staticValue(first);
    if (command === undefined) {
      report(call, `calls ${name} with a command the guard cannot read`);
      return;
    }
    const argsNode =
      second !== undefined && ts.isArrayLiteralExpression(second) ? second : undefined;
    checkArgv(
      call,
      command,
      argsNode === undefined && second !== undefined ? undefined : literalElements(argsNode),
    );
  };

  const instrumentation = INSTRUMENTATION_SITES.has(path);
  const forwardedOriginals = new Set<ts.Node>();

  const checkInstrumentation = (mock: ts.CallExpression): void => {
    const factory = mock.arguments[1];
    if (!instrumentation || factory === undefined || !ts.isArrowFunction(factory)) {
      report(mock, "mocks child_process outside an exact instrumentation exception");
      return;
    }
    const importOriginal = factory.parameters[0]?.name;
    const visit = (node: ts.Node): void => {
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer &&
        ts.isAwaitExpression(node.initializer) &&
        ts.isCallExpression(node.initializer.expression) &&
        importOriginal !== undefined &&
        ts.isIdentifier(importOriginal) &&
        ts.isIdentifier(node.initializer.expression.expression) &&
        node.initializer.expression.expression.text === importOriginal.text
      ) {
        forwardedOriginals.add(node);
        checkForwardingOnly(factory, node.name.text);
      }
      ts.forEachChild(node, visit);
    };
    visit(factory);
  };

  const checkForwardingOnly = (factory: ts.ArrowFunction, original: string): void => {
    const visit = (node: ts.Node): void => {
      if (
        ts.isIdentifier(node) &&
        node.text === original &&
        isReference(node) &&
        !forwardedDeclaration(node)
      ) {
        if (!isTypePosition(node) && !isSpreadOfModule(node) && !isForwardingCall(node)) {
          report(node, `uses ${original} for more than forwarding in an instrumentation exception`);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(factory);
  };

  const forwardedDeclaration = (node: ts.Identifier): boolean =>
    ts.isVariableDeclaration(node.parent) && forwardedOriginals.has(node.parent);

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const [first] = node.arguments;
      const namesChildProcess = first !== undefined && isChildProcess(first);
      if (namesChildProcess && ts.isIdentifier(callee) && callee.text === "require") {
        report(node, "requires child_process");
      }
      if (namesChildProcess && callee.kind === ts.SyntaxKind.ImportKeyword) {
        report(node, "imports child_process dynamically");
      }
      if (
        namesChildProcess &&
        ts.isPropertyAccessExpression(callee) &&
        (callee.name.text === "mock" || callee.name.text === "doMock")
      ) {
        checkInstrumentation(node);
      }
    }
    if (
      ts.isIdentifier(node) &&
      node.text === MAINTENANCE_CONTROL &&
      !MAINTENANCE_CONTROL_SITES.has(path)
    ) {
      report(node, `uses ${MAINTENANCE_CONTROL} outside its positive control`);
    }
    if (ts.isIdentifier(node) && isReference(node)) {
      const name = direct.get(node.text);
      if (name !== undefined) {
        if (ts.isCallExpression(node.parent) && node.parent.expression === node)
          checkCall(node.parent, name);
        else report(node, `lets ${name} escape the guard's reading`);
      }
      if (namespaces.has(node.text)) {
        const access = node.parent;
        const call = access.parent;
        if (
          ts.isPropertyAccessExpression(access) &&
          access.expression === node &&
          SPAWNING.has(access.name.text) &&
          call !== undefined &&
          ts.isCallExpression(call) &&
          call.expression === access
        ) {
          checkCall(call, access.name.text);
        } else {
          report(node, "uses child_process in a way the guard cannot read");
        }
      }
    }
    if (isGeneratedScriptStart(node)) checkGeneratedScript(node);
    ts.forEachChild(node, visit);
  };

  const checkGeneratedScript = (start: ts.Node): void => {
    const array = start.parent;
    const pieces = ts.isArrayLiteralExpression(array) ? array.elements : [start];
    const texts = pieces.map((piece) =>
      ts.isStringLiteral(piece) || ts.isNoSubstitutionTemplateLiteral(piece)
        ? piece.text
        : undefined,
    );
    if (texts.some((text) => text === undefined)) {
      report(start, "generates a shell script with content the guard cannot read");
      return;
    }
    if (GIT_WORD.test(texts.join("\n"))) report(start, "generates a shell script that runs git");
  };

  visit(source);
  return findings;
}

function isGeneratedScriptStart(node: ts.Node): boolean {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text.startsWith("#!");
  }
  return ts.isTemplateExpression(node) && node.head.text.startsWith("#!");
}

function isChildProcess(expression: ts.Node): boolean {
  return (
    (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) &&
    CHILD_PROCESS.has(expression.text)
  );
}

function isReference(node: ts.Identifier): boolean {
  const parent = node.parent;
  if (ts.isImportSpecifier(parent) || ts.isImportClause(parent) || ts.isNamespaceImport(parent)) {
    return false;
  }
  if (ts.isPropertyAccessExpression(parent) && parent.name === node) return false;
  if (
    (ts.isPropertyAssignment(parent) ||
      ts.isMethodDeclaration(parent) ||
      ts.isPropertyDeclaration(parent) ||
      ts.isPropertySignature(parent) ||
      ts.isMethodSignature(parent)) &&
    parent.name === node
  ) {
    return false;
  }
  return !(ts.isQualifiedName(parent) && parent.right === node);
}

function isTypePosition(node: ts.Node): boolean {
  for (let current: ts.Node | undefined = node.parent; current; current = current.parent) {
    if (ts.isTypeNode(current)) return true;
    if (ts.isExpression(current) || ts.isStatement(current)) return false;
  }
  return false;
}

function isSpreadOfModule(node: ts.Identifier): boolean {
  return ts.isSpreadAssignment(node.parent) && node.parent.expression === node;
}

function isForwardingCall(node: ts.Identifier): boolean {
  const access = node.parent;
  if (!ts.isPropertyAccessExpression(access) || !SPAWNING.has(access.name.text)) return false;
  const call = access.parent;
  if (!ts.isCallExpression(call) || call.expression !== access || call.arguments.length !== 1) {
    return false;
  }
  const [argument] = call.arguments;
  if (
    argument === undefined ||
    !ts.isSpreadElement(argument) ||
    !ts.isIdentifier(argument.expression)
  ) {
    return false;
  }
  const forwarded = argument.expression.text;
  for (let current: ts.Node = call; !ts.isSourceFile(current); current = current.parent) {
    if (ts.isArrowFunction(current) || ts.isFunctionExpression(current)) {
      const rest = current.parameters.at(-1);
      return (
        rest !== undefined &&
        rest.dotDotDotToken !== undefined &&
        ts.isIdentifier(rest.name) &&
        rest.name.text === forwarded
      );
    }
  }
  return false;
}

function scriptKind(path: string): ts.ScriptKind {
  const extension = extname(path);
  if (extension === ".tsx") return ts.ScriptKind.TSX;
  if (extension === ".jsx") return ts.ScriptKind.JSX;
  if (extension === ".js" || extension === ".mjs" || extension === ".cjs") return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function scanRoots(root: string): readonly string[] {
  const packages = join(root, "packages");
  const names = readdirSync(packages, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  return [join(root, "test"), ...names.map((name) => join(packages, name, "test"))];
}

// Every root must exist and be a directory; scratch directories (dot-named) and node_modules
// hold fixture output, never sources. An empty result means the guard read nothing.
function executableSources(roots: readonly string[]): readonly string[] {
  const walk = (directory: string): readonly string[] =>
    readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        return entry.name.startsWith(".") || entry.name === "node_modules" ? [] : walk(path);
      }
      return entry.isFile() && EXECUTABLE.has(extname(entry.name)) && !entry.name.endsWith(".d.ts")
        ? [path]
        : [];
    });
  const sources = roots.flatMap((root) => {
    if (!statSync(root).isDirectory()) throw new Error(`scan root ${root} is not a directory`);
    return walk(root);
  });
  if (sources.length === 0) throw new Error(`no executable sources under ${roots.join(", ")}`);
  return sources;
}

function guardRepository(root: string): readonly Finding[] {
  return executableSources(scanRoots(root)).flatMap((path) =>
    guardSource(relative(root, path), readFileSync(path, "utf-8")),
  );
}

const SITE = "packages/cli/test/example.test.ts";

function reasonsFor(text: string, path = SITE): readonly string[] {
  return guardSource(path, text).map((finding) => finding.reason);
}

describe("the fixture process guard over this repository", () => {
  it("finds every fixture process start readable and every fixture git inside the helper", () => {
    expect(guardRepository(repoRoot)).toEqual([]);
  });
});

describe("the fixture process guard refuses", () => {
  it.each([
    [
      "a named import",
      'import { execFileSync } from "node:child_process";\nexecFileSync("git", ["commit"]);',
    ],
    [
      "an aliased import",
      'import { execFileSync as run } from "node:child_process";\nrun("git", ["commit"]);',
    ],
    [
      "a namespace import",
      'import * as cp from "node:child_process";\ncp.spawnSync("git", ["status"]);',
    ],
    ["a default import", 'import cp from "child_process";\ncp.execFile("git", ["status"]);'],
    ["spawn", 'import { spawn } from "node:child_process";\nspawn("git", ["merge", "x"]);'],
    [
      "execFile",
      'import { execFile } from "node:child_process";\nexecFile("/usr/bin/git", ["status"]);',
    ],
    [
      "execSync's shell string",
      'import { execSync } from "node:child_process";\nexecSync("git commit -m x");',
    ],
    [
      "exec's shell string",
      'import { exec } from "node:child_process";\nexec("cd x && git status");',
    ],
    [
      "a constant command",
      'import { spawnSync } from "node:child_process";\nconst GIT = "git";\nspawnSync(GIT, []);',
    ],
    [
      "a template command",
      'import { spawnSync } from "node:child_process";\nspawnSync(`git`, ["status"]);',
    ],
    [
      "sh -c",
      'import { spawnSync } from "node:child_process";\nspawnSync("/bin/sh", ["-c", "git add ."]);',
    ],
    [
      "bash -c",
      'import { execFileSync } from "node:child_process";\nexecFileSync("bash", ["-c", "echo && git status"]);',
    ],
    [
      "git beneath sandbox-exec",
      'import { spawnSync } from "node:child_process";\nspawnSync("sandbox-exec", ["-p", policy, "git", "commit"]);',
    ],
    [
      "a shell beneath sandbox-exec",
      'import { spawnSync } from "node:child_process";\nspawnSync("sandbox-exec", ["-p", policy, "/bin/sh", "-c", "git add ."]);',
    ],
    [
      "git beneath env",
      'import { execFileSync } from "node:child_process";\nexecFileSync("env", ["A=1", "git", "status"]);',
    ],
  ])("%s that runs git", (_, text) => {
    expect(reasonsFor(text)).toEqual([expect.stringMatching(/git/)]);
  });

  it.each([
    [
      "a variable command",
      'import { spawnSync } from "node:child_process";\nlet cmd = pick();\nspawnSync(cmd, []);',
    ],
    [
      "a spread argument list",
      'import { execFileSync } from "node:child_process";\nexecFileSync(...argv);',
    ],
    [
      "an interpolated command",
      // biome-ignore lint/suspicious/noTemplateCurlyInString: the source under test interpolates
      'import { spawnSync } from "node:child_process";\nspawnSync(`${tool}`, []);',
    ],
    [
      "an interpolated shell string",
      // biome-ignore lint/suspicious/noTemplateCurlyInString: the source under test interpolates
      'import { execSync } from "node:child_process";\nexecSync(`${tool} status`);',
    ],
    [
      "a shell given a variable",
      'import { spawnSync } from "node:child_process";\nspawnSync("sh", ["-c", script]);',
    ],
    [
      "a shell given no array",
      'import { spawnSync } from "node:child_process";\nspawnSync("sh", args);',
    ],
    [
      "a shell given a spread",
      'import { spawnSync } from "node:child_process";\nspawnSync("sh", [...args]);',
    ],
    [
      "a spread beneath sandbox-exec",
      'import { spawnSync } from "node:child_process";\nspawnSync("sandbox-exec", ["-p", policy, ...command]);',
    ],
    [
      "a variable beneath sandbox-exec",
      'import { spawnSync } from "node:child_process";\nspawnSync("sandbox-exec", ["-p", policy, program]);',
    ],
    [
      "an escaping binding",
      'import { execFile } from "node:child_process";\nconst run = promisify(execFile);',
    ],
    [
      "a shorthand escape",
      'import { spawn } from "node:child_process";\nexport const tools = { spawn };',
    ],
    ["an escaping namespace", 'import * as cp from "node:child_process";\nuse(cp);'],
    [
      "a computed namespace member",
      'import * as cp from "node:child_process";\ncp["spawnSync"]("x");',
    ],
    [
      "an unaudited export",
      'import { ChildProcess } from "node:child_process";\nnew ChildProcess();',
    ],
    ["require", 'const cp = require("child_process");'],
    ["a dynamic import", 'const cp = await import("node:child_process");'],
    ["a re-export", 'export { spawn } from "node:child_process";'],
    [
      "a mock outside the exception",
      'vi.mock("node:child_process", async (o) => ({ ...(await o()) }));',
    ],
    [
      "an interpolated generated script",
      // biome-ignore lint/suspicious/noTemplateCurlyInString: the source under test interpolates
      'writeFileSync(p, ["#!/bin/sh", `exec ${tool} "$@"`].join("\\n"));',
    ],
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the source under test interpolates
    ["a template generated script", "writeFileSync(p, `#!/bin/sh\\nexec ${tool}`);"],
    ["the unsuppressed control elsewhere", 'unsuppressedGitForMaintenanceControl(["commit"]);'],
  ])("%s", (_, text) => {
    expect(reasonsFor(text)).not.toEqual([]);
  });

  it.each([
    ["an array", 'writeFileSync(p, ["#!/bin/sh", "exec git \\"$@\\""].join("\\n"));'],
    ["a string", 'writeFileSync(p, "#!/bin/sh\\ngit commit -m x\\n");'],
  ])("a generated shell script in %s that runs git", (_, text) => {
    expect(reasonsFor(text)).toEqual(["generates a shell script that runs git"]);
  });

  it("instrumentation that does more than forward, even in the exact exception file", () => {
    const text = [
      'vi.mock("node:child_process", async (importOriginal) => {',
      "  const actual = await importOriginal();",
      '  actual.execFileSync("git", ["commit"]);',
      "  return { ...actual };",
      "});",
    ].join("\n");
    expect(reasonsFor(text, "packages/face/test/noSyncGit.test.ts")).toEqual([
      expect.stringMatching(/more than forwarding/),
    ]);
  });
});

describe("the fixture process guard permits", () => {
  it.each([
    [
      "the helper",
      'import { fixtureGit } from "../../../test/support/gitFixture.ts";\nfixtureGit(["commit"], { cwd });',
    ],
    [
      "the helper's sandbox form",
      'import { sandboxedFixtureCommand } from "../../../test/support/gitFixture.ts";\nsandboxedFixtureCommand(p, cwd, { git: ["commit"] }, env);',
    ],
    [
      "a type-only import",
      'import type { ChildProcess } from "node:child_process";\nlet c: ChildProcess;',
    ],
    [
      "a non-git command",
      'import { execFileSync } from "node:child_process";\nexecFileSync("rm", ["-r", directory]);',
    ],
    [
      "the interlock binary",
      'import { execFileSync } from "node:child_process";\nexecFileSync(process.execPath, [bin, ...args], { cwd });',
    ],
    [
      "a shell writing outside git",
      'import { spawnSync } from "node:child_process";\nspawnSync("/bin/sh", ["-c", "printf x > \\"$1\\"", "sh", target]);',
    ],
    [
      "a non-git command beneath sandbox-exec",
      'import { spawnSync } from "node:child_process";\nspawnSync("sandbox-exec", ["-p", policy, "/usr/bin/true"]);',
    ],
    [
      "a .git path in a script",
      'import { execSync } from "node:child_process";\nexecSync("printf x > .git");',
    ],
    [
      "a git flag in a script",
      'import { execSync } from "node:child_process";\nexecSync("echo --git-dir");',
    ],
    ["a static generated script", 'writeFileSync(p, ["#!/bin/sh", "exit 0"].join("\\n"));'],
  ])("%s", (_, text) => {
    expect(reasonsFor(text)).toEqual([]);
  });

  it("the unsuppressed control in its positive control", () => {
    const text =
      'import { unsuppressedGitForMaintenanceControl } from "x";\nunsuppressedGitForMaintenanceControl(["commit"]);';
    expect(reasonsFor(text, "packages/verifier/test/fixtureCleanup.test.ts")).toEqual([]);
  });

  it("forwarding-only instrumentation in its exact exception file", () => {
    const text = [
      'vi.mock("node:child_process", async (importOriginal) => {',
      '  const actual = await importOriginal<typeof import("node:child_process")>();',
      "  return {",
      "    ...actual,",
      "    spawnSync: (...args: Parameters<typeof actual.spawnSync>) => actual.spawnSync(...args),",
      "  };",
      "});",
    ].join("\n");
    expect(reasonsFor(text, "packages/face/test/noSyncGit.test.ts")).toEqual([]);
    expect(reasonsFor(text)).not.toEqual([]);
  });
});

describe("the fixture process guard's scan", () => {
  let scratch: string | undefined;

  afterEach(() => {
    if (scratch !== undefined) rmSync(scratch, { recursive: true, force: true });
    scratch = undefined;
  });

  function scratchDirectory(): string {
    mkdirSync(runsRoot, { recursive: true });
    scratch = mkdtempSync(join(runsRoot, "guard-"));
    return scratch;
  }

  it("fails on a missing scan root", () => {
    expect(() => executableSources([join(scratchDirectory(), "absent")])).toThrowError(/ENOENT/);
  });

  it("fails when a scan root cannot be enumerated", () => {
    const file = join(scratchDirectory(), "file.ts");
    writeFileSync(file, "export {};\n");
    expect(() => executableSources([file])).toThrowError(/not a directory/);
  });

  it("fails on an empty source set", () => {
    const root = scratchDirectory();
    mkdirSync(join(root, ".runs"));
    writeFileSync(join(root, ".runs", "hidden.ts"), "export {};\n");
    writeFileSync(join(root, "notes.yaml"), "x: 1\n");
    expect(() => executableSources([root])).toThrowError(/no executable sources/);
  });

  it("fails when the repository has no packages directory", () => {
    expect(() => scanRoots(scratchDirectory())).toThrowError(/ENOENT/);
  });
});

describe("the fixture git helper", () => {
  it("prefixes every argv with the maintenance suppression", () => {
    expect(fixtureGitArgv(["commit", "-c", "HEAD"])).toEqual([
      "git",
      "-c",
      "maintenance.auto=false",
      "commit",
      "-c",
      "HEAD",
    ]);
  });

  it.each([
    [["-c", "maintenance.auto=true", "commit"]],
    [["-c", "Maintenance.Auto", "commit"]],
    [["--config-env=maintenance.auto=VALUE", "commit"]],
    [["--config-env", "maintenance.auto=VALUE", "commit"]],
  ])("refuses arguments overriding the suppression: %j", (args) => {
    expect(() => fixtureGitArgv(args)).toThrowError(/overriding maintenance.auto/);
  });

  it.each([
    [{ GIT_CONFIG_PARAMETERS: "'maintenance.auto'='true'" }],
    [{ GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "maintenance.AUTO", GIT_CONFIG_VALUE_0: "true" }],
  ])("refuses environment overriding the suppression: %j", (overrides) => {
    expect(() => fixtureGit(["--version"], { env: { ...process.env, ...overrides } })).toThrowError(
      /overriding maintenance.auto/,
    );
  });

  it.each([
    [["init", "--quiet"]],
    [["-c", "init.defaultBranch=main", "init"]],
    [["-C", "elsewhere", "clone", "source", "destination"]],
  ])("refuses to create a repository outside the pinned initializers: %j", (args) => {
    expect(() => fixtureGit(args)).toThrowError(/creates a repository only through/);
  });

  it.each([
    [["git", "commit"]],
    [["/usr/bin/git", "status"]],
    [["/bin/sh", "-c", "git add ."]],
  ] as const)("refuses git outside the sandbox's git form: %j", (argv) => {
    expect(() =>
      sandboxedFixtureCommand("(version 1)", repoRoot, { argv }, process.env),
    ).toThrowError(/refuses git outside the git form/);
  });
});
