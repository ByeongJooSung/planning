# Planning Studio

요구사항에서 출발해 서비스 기획 산출물(기획안 → 정보구조도 → 다이어그램 → 스토리보드 → 프로토타입)을 프로젝트 단위로 만들고 관리하는 도구입니다.

## 문서
- [PRD (제품 요구사항 정의서)](docs/PRD.md)
- [작업 계획서](docs/WORK_PLAN.md)
- [ADR-001 P0 기반 구조 결정](docs/decisions/ADR-001-p0-foundation.md)

## 현재 단계: P0 기반 구축
- 기획 데이터 모델(시스템 구분·요구사항·Task 포함)과 JSON Schema
- 파일 기반 프로젝트 생성·저장, 시스템 구분 프리셋
- 요구사항 추적표(RTM): 요구사항별 / 요구사항 × 시스템 / 화면 역추적, 단계별 누락·근거 없는 산출물 검사
- 버전 스냅샷과 버전 간 비교(Diff)
- 샘플 프로젝트 2건(`examples/projects`)

## 시작하기
```bash
npm install
npm test                      # 테스트
npm run build                 # dist/ 빌드 → node dist/cli.js …
npm run planning -- --help    # 개발 중 실행 (tsx)
```

## 사용 예 — 대국민 정보공개
```bash
alias planning="npm run -s planning --"

planning init PUBINFO --name "정보공개 통합 서비스" --type NEW --preset public-civil --template PUBLIC
planning system add EXT --name "외부 연계" --no-screens

planning req add --title "대국민 정보공개" --source SRC-001:p.14
planning task add REQ-001 --system CVL --actor 민원인 --action "자료 등록 및 공개 신청"
planning task add REQ-001 --system ADM --actor 심사자 --action "검토 후 승인·반려" --after T01
planning task add REQ-001 --system PUB --actor 국민 --action "공개 목록·상세 조회" --after T02

planning rtm --view matrix     # 요구사항 × 시스템
planning rtm --write           # rtm/ 에 rtm.md, rtm.json, rtm-*.csv 저장
planning check                 # 무결성·누락·근거 없는 산출물
planning snapshot --note "착수 기준선"
planning diff 0.1              # v0.1 대비 현재 변경 사항
```

기존 서비스는 `--type EXISTING --scope NEW_MENU|MODIFY|RENEWAL`로 만듭니다. `MODIFY`이면 정보구조도 단계는 패스하고 영향 화면 ID만 등록합니다.

| 옵션 | 설명 |
|---|---|
| `--root <dir>` | 프로젝트 루트 (기본 `projects/`, 환경변수 `PLANNING_ROOT`) |
| `-p <code>` | 프로젝트 코드 (루트에 하나뿐이면 생략) |
| `--id-mode ORIGINAL` | RFP 원본 ID(SFR-001 등)를 요구사항 ID로 사용 |

## 샘플 프로젝트
```bash
npx tsx scripts/build-examples.ts          # examples/projects 다시 생성
planning --root examples/projects -p PUBINFO status
```
- `PUBINFO`: 신규 구축, 공공 민원형 + 외부 연계, 정보공개 요구사항의 시스템별 Task, 누락·근거 없음 사례 포함 — [추적표 보기](examples/projects/PUBINFO/rtm/rtm.md)
- `SHOPMY`: 기존 서비스 기존 메뉴 수정, v0.1 스냅샷 후 변경 요청(CR-001) 반영 — `planning --root examples/projects -p SHOPMY diff 0.1`

## 폴더 구조
```
src/model/     스키마, ID 규칙, 화면 ID 생성, 무결성 검사
src/project/   프로젝트 저장소, 시스템 프리셋, 변경 연산
src/trace/     추적성·RTM 계산
src/version/   스냅샷, Diff
src/render/    RTM Markdown·CSV 출력
src/cli.ts     CLI
schemas/       JSON Schema (npm run gen:schema)
examples/      샘플 프로젝트
tests/         테스트
```
