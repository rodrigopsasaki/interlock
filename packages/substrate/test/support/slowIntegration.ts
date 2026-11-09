import { it } from "vitest";

export interface SlowIntegrationDefinition {
  readonly budgetMs: number;
  readonly reason: string;
}

export function slowIntegration(
  name: string,
  definition: SlowIntegrationDefinition,
  run: () => Promise<void>,
): void {
  it(name, { timeout: definition.budgetMs }, async (context) => {
    Object.assign(context.task.meta, {
      interlockSlowIntegration: {
        budgetMs: definition.budgetMs,
        reason: definition.reason,
      },
    });
    await run();
  });
}
