import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createProject, loadModel, saveModel, PROJECT_SUBDIRS } from "../src/project/store.js";
import { tempRoot } from "./helpers.js";

describe("프로젝트 생성·저장", () => {
  it("공공 민원형 프리셋으로 3개 시스템과 폴더 구조를 만든다", async () => {
    const root = await tempRoot();
    const dir = await createProject(root, { code: "P1", name: "테스트", serviceType: "NEW", preset: "public-civil" });
    for (const d of PROJECT_SUBDIRS) expect(existsSync(path.join(dir, d))).toBe(true);
    const m = await loadModel(dir);
    expect(m.systems.map((s) => s.code)).toEqual(["PUB", "CVL", "ADM"]);
    expect(m.project.version).toBe("0.1");
    expect(m.project.stages.S0A).toBeUndefined();
  });

  it("기존 서비스는 변경 범위가 필수이고, MODIFY이면 S2를 패스한다", async () => {
    const root = await tempRoot();
    await expect(createProject(root, { code: "P2", name: "x", serviceType: "EXISTING" })).rejects.toThrow("변경 범위");
    await expect(createProject(root, { code: "P3", name: "x", serviceType: "NEW", changeScope: "MODIFY" })).rejects.toThrow();
    const dir = await createProject(root, { code: "P4", name: "x", serviceType: "EXISTING", changeScope: "MODIFY" });
    const m = await loadModel(dir);
    expect(m.project.stages.S2).toBe("SKIPPED");
    expect(m.project.stages.S0A).toBe("NOT_STARTED");
  });

  it("같은 코드로 두 번 만들 수 없다", async () => {
    const root = await tempRoot();
    await createProject(root, { code: "P5", name: "x", serviceType: "NEW" });
    await expect(createProject(root, { code: "P5", name: "x", serviceType: "NEW" })).rejects.toThrow("이미 있는");
  });

  it("참조 오류가 있으면 저장하지 않는다", async () => {
    const root = await tempRoot();
    const dir = await createProject(root, { code: "P6", name: "x", serviceType: "NEW", preset: "general" });
    const m = await loadModel(dir);
    m.ia.nodes.push({ id: "USR_A_010", systemCode: "USR", parentId: "M-NONE", name: "a", kind: "PAGE", loginRequired: false, roles: [], taskIds: ["REQ-999-T01"], change: "NEW" });
    await expect(saveModel(dir, m)).rejects.toThrow(/M-NONE|REQ-999-T01/);
  });
});
