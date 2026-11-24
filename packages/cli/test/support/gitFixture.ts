import {
  type FixtureRepositoryOptions,
  fixtureGit,
  initFixtureRepository,
} from "../../../../test/support/gitFixture.ts";

export function configureFixtureIdentity(directory: string): void {
  fixtureGit(["config", "--local", "user.name", "fixture"], { cwd: directory });
  fixtureGit(["config", "--local", "user.email", "fixture@example.invalid"], {
    cwd: directory,
  });
}

export function initFixtureRepositoryWithIdentity(
  directory: string,
  options: FixtureRepositoryOptions = {},
): void {
  initFixtureRepository(directory, options);
  configureFixtureIdentity(directory);
}
