import { writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { extractSegments } from "../src/knowledge/extract.js";
import { search, tokenize } from "../src/knowledge/search.js";
import { addKnowledgeFile, loadChunks, removeKnowledgeFile, toChunks } from "../src/knowledge/store.js";
import { addRequirement, autoCreateTasks } from "../src/project/ops.js";
import { suggestTasks } from "../src/project/suggest.js";
import { createProject, loadModel } from "../src/project/store.js";
import { tempRoot } from "./helpers.js";

/** 텍스트 한 줄짜리 최소 PDF */
function tinyPdf(text: string): Buffer {
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    null,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  const stream = `BT /F1 12 Tf 20 100 Td (${text}) Tj ET`;
  objs[3] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  let out = "%PDF-1.4\n";
  const offs: number[] = [];
  objs.forEach((o, i) => {
    offs.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

describe("참조자료(지식)", () => {
  it("형식별로 위치가 붙은 조각을 뽑는다 (md 제목, 메일, pdf 페이지, docx)", async () => {
    const md = await extractSegments("a.md", Buffer.from("# 개요\n본문 가\n\n## 범위\n본문 나"));
    expect(md.map((s) => s.locator)).toEqual(["개요", "범위"]);
    const eml = await extractSegments("m.eml", Buffer.from("Subject: 추가 요청\nFrom: a@b.c\n\n첫 문단\n\n둘째 문단"));
    expect(eml[0]!.text).toContain("제목: 추가 요청");
    expect(eml.map((s) => s.locator)).toEqual(["메일 정보", "본문 문단 1", "본문 문단 2"]);
    const pdf = await extractSegments("r.pdf", tinyPdf("Open data portal"));
    expect(pdf[0]).toEqual({ locator: "p.1", text: "Open data portal" });

    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    zip.file("[Content_Types].xml", '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
    zip.file("_rels/.rels", '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
    zip.file("word/document.xml", '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>심사 기준 안내</w:t></w:r></w:p></w:body></w:document>');
    const docx = await extractSegments("g.docx", await zip.generateAsync({ type: "nodebuffer" }));
    expect(docx[0]!.text).toBe("심사 기준 안내");

    await expect(extractSegments("x.hwp", Buffer.from(""))).rejects.toThrow("지원하지 않는");
  });

  it("긴 문단은 600자 안팎으로 나누고, 한국어는 두 글자 단위로 검색한다", () => {
    const long = "심사자는 신청 건을 검토한다. ".repeat(80);
    const chunks = toChunks("SRC-001", [{ locator: "문단 1", text: long }]);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.text.length <= 900)).toBe(true);
    expect(tokenize("반려 사유")).toEqual(["반려", "사유"]);
    const hits = search(
      [
        { id: "a", sourceId: "S", locator: "1", text: "공개일은 승인일 다음 날로 한다." },
        { id: "b", sourceId: "S", locator: "2", text: "반려 시 사유 입력은 필수이며 100자 이상 작성한다." },
      ],
      "반려 사유",
    );
    expect(hits[0]!.chunk.id).toBe("b");
  });

  it("파일을 올리면 보관·색인하고, 같은 파일은 한 번만, 출처로 쓰인 자료는 지우지 못한다", async () => {
    const root = await tempRoot();
    const dir = await createProject(root, { code: "KB", name: "k", serviceType: "NEW", preset: "public-civil" });
    const m = await loadModel(dir);
    const f = path.join(root, "회의록.txt");
    await writeFile(f, "반려 사유는 필수로 입력한다.\n\n목록은 50건까지 본다.");
    const r1 = await addKnowledgeFile(dir, m, f);
    expect(r1.source).toMatchObject({ id: "SRC-001", index: { status: "INDEXED", chunks: 2 } }); // 문단마다 위치를 남긴다
    expect((await addKnowledgeFile(dir, m, f)).duplicateOf).toBe("SRC-001");
    const hwp = path.join(root, "지침.hwp");
    await writeFile(hwp, "binary");
    expect((await addKnowledgeFile(dir, m, hwp)).source.index!.status).toBe("UNSUPPORTED");
    expect(await loadChunks(dir)).toHaveLength(2);

    addRequirement(m, { title: "반려", sources: [{ sourceId: "SRC-001" }] });
    await expect(removeKnowledgeFile(dir, m, "SRC-001")).rejects.toThrow("출처로 쓰는");
    await removeKnowledgeFile(dir, m, "SRC-002");
    expect(m.sources.map((s) => s.id)).toEqual(["SRC-001"]);
  });
});

describe("Task 자동 생성", () => {
  it("신청·심사·공개·알림·연계 요구사항을 시스템별 Task로 순서대로 나눈다", async () => {
    const root = await tempRoot();
    const m = await loadModel(await createProject(root, { code: "AU", name: "a", serviceType: "NEW", preset: "public-civil" }));
    m.systems.push({ code: "EXT", name: "외부 연계", users: [], channels: [], color: "#7C3AED", hasScreens: false, description: "" });
    const req = addRequirement(m, {
      title: "정보공개 청구",
      description: "민원인이 청구서를 신청하면 심사자가 검토 후 승인 또는 반려하고 결과를 문자로 알린다. 공개 결정 자료는 외부 포털로 연계 전송한다.",
    });
    const tasks = autoCreateTasks(m, req.id);
    expect(tasks.map((t) => `${t.systemCode}:${t.action}`)).toEqual([
      "CVL:자료 작성·등록 및 신청",
      "ADM:신청 목록 조회 및 내용 검토",
      "ADM:승인 또는 반려(사유 입력)",
      "CVL:처리 결과 확인, 반려 시 보완 후 재신청",
      "PUB:공개 목록·상세 조회",
      "CVL:처리 결과 알림 발송",
      "EXT:외부 연계 전송",
    ]);
    expect(tasks.every((t) => t.origin === "AUTO" && t.suggestReason)).toBe(true);
    expect(tasks[1]!.after).toEqual(["REQ-001-T01"]);
    expect(tasks[4]!.after).toEqual(["REQ-001-T03"]);
    expect(tasks[5]!.noScreenReason).toBe("자동 발송");
    expect(tasks[6]!.after).toEqual(["REQ-001-T05"]);
  });

  it("맞는 규칙이 없으면 확인이 필요한 1건만 제안한다", async () => {
    const root = await tempRoot();
    const m = await loadModel(await createProject(root, { code: "AV", name: "a", serviceType: "NEW", preset: "general" }));
    const req = addRequirement(m, { title: "웹 접근성 인증 획득" });
    const s = suggestTasks(m, req);
    expect(s).toHaveLength(1);
    expect(s[0]!.reason).toContain("직접 확인");
  });
});
