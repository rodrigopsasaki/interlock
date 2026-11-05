const ENTER_ALT_SCREEN = "\x1b[?1049h";
const EXIT_ALT_SCREEN = "\x1b[?1049l";
const HIDE_CURSOR = "\x1b[?25l";
const SHOW_CURSOR = "\x1b[?25h";
const CLEAR_AND_HOME = "\x1b[2J\x1b[H";

export interface FaceOutput {
  write(text: string): unknown;
  on(event: "resize", listener: () => void): unknown;
  off(event: "resize", listener: () => void): unknown;
}

export function enterAltScreen(stream: FaceOutput): void {
  stream.write(ENTER_ALT_SCREEN + HIDE_CURSOR);
}

export function exitAltScreen(stream: FaceOutput): void {
  stream.write(SHOW_CURSOR + EXIT_ALT_SCREEN);
}

export function drawScreen(stream: FaceOutput, text: string): void {
  stream.write(CLEAR_AND_HOME + text);
}
