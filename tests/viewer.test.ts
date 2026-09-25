import { describe, expect, it } from "vitest";
import { buildPubInfo, buildShopMy } from "../scripts/build-examples.js";
import { collectViewerProject, renderViewer } from "../src/render/viewer/index.js";
import { tempRoot } from "./helpers.js";

describe("뷰어", () => {
  it("프로젝트 데이터를 담은 HTML을 만들고, 최근 스냅샷 대비 변경을 포함한다", async () => {
    const root = await tempRoot();
    const projects = [await collectViewerProject(await buildPubInfo(root)), await collectViewerProject(await buildShopMy(root))];
    expect(projects[0]!.diff).toBeNull();
    expect(projects[1]!.diff!.from).toBe("0.1");
    expect(projects[1]!.diff!.entries.requirements!.added).toEqual(["REQ-003"]);

    const html = await renderViewer({ generatedAt: "2026-09-25T00:00:00.000Z", projects });
    expect(html.startsWith("<!doctype html>")).toBe(true);
    const json = /<script type="application\/json" id="planning-data">([\s\S]*?)<\/script>/.exec(html)![1]!;
    expect(JSON.parse(json).projects).toHaveLength(2);

    const frag = await renderViewer({ generatedAt: "", projects }, { standalone: false });
    expect(frag.startsWith("<title>")).toBe(true);
    expect(frag).not.toContain("<html");
  });

  it("데이터 안의 </script>가 스크립트 블록을 끊지 않는다", async () => {
    const root = await tempRoot();
    const p = await collectViewerProject(await buildShopMy(root));
    p.model.requirements[0]!.title = "</script><b>x";
    const html = await renderViewer({ generatedAt: "", projects: [p] });
    expect(html.match(/<\/script>/g)).toHaveLength(2);
  });
});
