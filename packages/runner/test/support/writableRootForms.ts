export const MALFORMED_WRITABLE_ROOT_ARGS: readonly (readonly [string, string, string])[] = [
  ["a scalar instead of a list", '"{path}"', "must be a list of strings"],
  ["a mapping instead of a list", "{ path: here }", "must be a list of strings"],
  ["a null instead of a list", "null", "must be a list of strings"],
  ["an empty list", "[]", "must not be empty"],
  ["a non-string element", '["{path}", 7]', '[1]" must be a string'],
  ["a nested list element", '["{path}", [--nested]]', '[1]" must be a string'],
  ["a missing placeholder", "[--test-write-root]", 'exactly one "{path}" element; found 0'],
  ["a repeated placeholder", '["{path}", "{path}"]', 'exactly one "{path}" element; found 2'],
  ["an embedded placeholder", '["--test-write-root={path}"]', '[0]" embeds "{path}"'],
  [
    "a whole placeholder beside an embedded one",
    '["{path}", "--also={path}"]',
    '[1]" embeds "{path}"',
  ],
];

export const PATH_WITH_SPACES_AND_QUOTES = `/fixture root/with "double" and 'single' quotes/.git`;
