import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { tempRoot } from "./helpers.js";

const run = (root: string, args: string[]) =>
  execFileSync("npx", ["tsx", "src/cli.ts", "--root", root, ...args], { encoding: "utf8" });

describe("CLI", () => {
  it("프로젝트 생성 → 요구사항 → 시스템별 Task → RTM", async () => {
    const root = await tempRoot();
    expect(run(root, ["init", "DEMO", "--name", "데모", "--type", "NEW", "--preset", "public-civil"])).toContain("PUB(대국민 포털)");
    expect(run(root, ["req", "add", "--title", "대국민 정보공개"])).toContain("REQ-001");
    run(root, ["task", "add", "REQ-001", "--system", "CVL", "--actor", "민원인", "--action", "자료 등록"]);
    run(root, ["task", "add", "REQ-001", "--system", "ADM", "--action", "승인", "--after", "T01"]);
    const matrix = run(root, ["rtm", "--view", "matrix"]);
    expect(matrix).toMatch(/REQ-001 대국민 정보공개 \| — \| T01 · 화면 미연결 · 미착수 \| T02/);
    expect(() => run(root, ["task", "add", "REQ-001", "--system", "XXX", "--action", "a"])).toThrow();
  }, 60_000);
});
