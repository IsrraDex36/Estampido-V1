#!/usr/bin/env node
import { CommanderError } from "commander";
import { UserInputError } from "../../core/errors.js";
import { buildProgram, readVersion } from "./program.js";

/** Exit codes: 0 ok · 1 internal error · 2 bad input/usage. */
try {
  await buildProgram(await readVersion()).parseAsync(process.argv);
} catch (err) {
  if (err instanceof CommanderError) {
    process.exitCode = err.exitCode === 0 ? 0 : 2;
  } else if (err instanceof UserInputError) {
    console.error(`✘ ${err.message}`);
    process.exitCode = 2;
  } else {
    console.error("✘ Error interno:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  }
}
