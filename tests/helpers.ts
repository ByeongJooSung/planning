import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export const tempRoot = () => mkdtemp(path.join(tmpdir(), "planning-test-"));
