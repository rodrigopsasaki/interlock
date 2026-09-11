const ENTER_ALT_SCREEN = "\x1b[?1049h";
const EXIT_ALT_SCREEN = "\x1b[?1049l";
const HIDE_CURSOR = "\x1b[?25l";
const SHOW_CURSOR = "\x1b[?25h";
const CLEAR_AND_HOME = "\x1b[2J\x1b[H";

export function enterAltScreen(stream: NodeJS.WriteStream): void {
  stream.write(ENTER_ALT_SCREEN + HIDE_CURSOR);
}

export function exitAltScreen(stream: NodeJS.WriteStream): void {
  stream.write(SHOW_CURSOR + EXIT_ALT_SCREEN);
}

export function drawScreen(stream: NodeJS.WriteStream, text: string): void {
  stream.write(CLEAR_AND_HOME + text);
}
