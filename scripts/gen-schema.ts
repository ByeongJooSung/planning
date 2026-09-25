/** model/*.json 과 project.json 의 JSON Schema를 schemas/ 에 생성한다. (작업 0-2 산출물) */
import { mkdir, writeFile } from "node:fs/promises";
import { z } from "zod";
import { MODEL_FILES, Project } from "../src/model/schema.js";

await mkdir("schemas", { recursive: true });
const all: [string, z.ZodType][] = [["project.json", Project], ...Object.entries(MODEL_FILES)];
for (const [file, schema] of all) {
  const json = z.toJSONSchema(schema, { io: "input" });
  await writeFile(`schemas/${file.replace(".json", ".schema.json")}`, JSON.stringify(json, null, 2) + "\n");
}
console.log(`${all.length}개 스키마를 schemas/ 에 생성했습니다`);
