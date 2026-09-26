# Planning Studio

요구사항에서 출발해 서비스 기획 산출물(기획안 → 정보구조도 → 다이어그램 → 스토리보드 → 프로토타입)을 프로젝트 단위로 만들고 관리하는 도구입니다.

## 문서
- [PRD (제품 요구사항 정의서)](docs/PRD.md)
- [작업 계획서](docs/WORK_PLAN.md)
- [ADR-001 P0 기반 구조 결정](docs/decisions/ADR-001-p0-foundation.md)
- [ADR-002 참조자료·Task 자동 생성·디자인 시스템·뷰어](docs/decisions/ADR-002-knowledge-design-viewer.md)
- [ADR-003 웹 서비스 — 계정·프로젝트 멤버·AI 호출 설정](docs/decisions/ADR-003-web-service.md)

## 현재 단계: P0 완료 + 선행 1~3
- 기획 데이터 모델(시스템 구분·요구사항·Task·디자인 시스템)과 JSON Schema
- 파일 기반 프로젝트, 시스템 구분 프리셋, 버전 스냅샷·Diff
- 요구사항 추적표(RTM): 요구사항별 / 요구사항 × 시스템 / 화면 역추적, 단계별 누락·근거 없는 산출물 검사
- 참조자료 지식베이스: 파일 올리기·색인·검색 (txt, md, csv, json, html, eml, docx, pdf)
- 요구사항 등록 시 시스템별 Task 자동 생성(규칙 기반) 또는 수동 생성
- 시스템별 디자인 시스템: 컨셉 3종 제안 → 선택 → 생성 → 컴포넌트 추가
- 뷰어: 프로젝트 목록 → 프로젝트 상세 → Task 상세(플로우·화면설계서·프로토타입), 통합 산출물
- 설계 화면 실제 규격(1920×1080) 고정 배치 후 축소 표시 — 줄바꿈 없음
- AI 요청: 화면설계서·정보구조도·프로토타입·디자인 시스템별 Figma 그리기 / Claude 요청 프롬프트(참조 URL·참조자료 근거 포함)
- AI 생성·미세조정: 정보구조도·화면설계서·프로세스 플로우 1차 생성 → 후속 프롬프트로 미세조정 → 적용. 디자인 시스템 미세조정은 이를 쓰는 모든 화면에 컴포넌트 단위로 일괄 반영
- 디자인 시스템 조정: 섹션별(색상·글꼴·간격·모서리·컨트롤·레이아웃·템플릿·컴포넌트) 프롬프트, 이미지 클릭 핀·번호 라벨 댓글로 수정 요청, 전역 프롬프트는 새 컴포넌트용. 누적 적용·되돌리기

- 웹 서비스: 회원가입·로그인, 프로젝트를 만든 사람이 운영자 — 공동 작업자 초대(작업자·열람자·운영자), 화면에서 바로 편집, 프로젝트별·개인별 AI 호출 설정(Claude API 또는 로컬 LLM·OpenAI 호환 API, 키는 암호화·비공개)

## 웹 서비스로 실행
```bash
npm install && npm run build
PLANNING_SECRET=<긴 임의 문자열> node dist/cli.js --root /srv/planning serve --port 8080
# 개발 중: npm run planning -- --root projects serve
```
브라우저로 `http://<서버>:8080` → 회원가입. **첫 가입자**가 데이터 폴더에 이미 있는 프로젝트의 운영자가 됩니다.

| 환경변수 | 설명 |
|---|---|
| `PORT`, `HOST` | 기본 8080, 0.0.0.0 |
| `PLANNING_ROOT` | 데이터 폴더 (프로젝트 + `.service/` 계정·설정) |
| `PLANNING_SECRET` | AI 키 암호화 비밀값. 없으면 `.service/secret.key`를 만든다. 바꾸면 저장한 키를 다시 입력해야 함 |
| `PLANNING_SIGNUP=closed` | 초대받은 이메일만 가입 |
| `PLANNING_ADMINS` | 서비스 관리자 이메일(쉼표 구분). 첫 가입자는 항상 관리자 — 계정 관리 화면에서 회원 목록·삭제 |
| `ANTHROPIC_API_KEY`, `PLANNING_AI_MODEL` | 선택: 서버 기본 AI (프로젝트·개인 설정이 없을 때, 기본 모델 claude-opus-5) |
| `PUBLIC_URL` | 초대 링크 주소 (프록시 뒤에서) |
| `COOKIE_SECURE=1` | HTTPS 뒤에서 Secure 쿠키 |

**AI 연결** — 프로젝트 → 설정 → AI 설정(프로젝트 공통, 운영자가 관리) 또는 내 계정(개인). 연결을 여러 개 저장하고 드롭다운으로 바로 바꿉니다.
1. **+ 연결 추가** → 종류 선택: **NVIDIA**(`https://integrate.api.nvidia.com/v1`, 키 `nvapi-…`), **LM Studio**(`http://<주소>:1234/v1`, 키 없음), Ollama, Anthropic, 직접 입력(OpenAI 호환)
2. API 키는 선택(Anthropic만 필수) → **모델 불러오기** → 쓸 모델을 여러 개 체크(목록에 없으면 직접 입력) → 저장
3. 운영자는 모델 옆 **기본으로**로 프로젝트 기본을 정하고, 멤버는 **나만 바꾸기** 드롭다운이나 AI 생성 창의 드롭다운으로 자기만 바꿉니다.
- 키는 암호화 저장·화면에 다시 안 보임. 프로젝트 연결의 주소·키는 멤버에게 안 보이고 이름·모델만 보입니다.
- 인터넷 배포(Vercel)에서는 `localhost`에 닿지 않습니다. LM Studio·Ollama는 외부에서 접속 가능한 주소(포트 포워딩, cloudflared·ngrok 터널)를 넣거나, 같은 네트워크에서 `planning serve`로 띄우세요.
- 최대 출력 토큰은 연결마다 정할 수 있고(기본 8192), 모델이 그 값을 거부하면 빼고 다시 보냅니다.

**새 버전 알림** — 새 버전이 배포되면 열려 있는 화면 위에 "새 버전이 배포됐습니다. 작업 중인 내용을 먼저 저장한 뒤 새로고침하세요" 알림이 뜹니다(자동 새로고침 없음, 입력 중인 창이 있으면 한 번 더 확인). 서버가 SSE(`/api/events`)로 버전을 알려 주고 모든 API 응답 머리 `x-app-version`에도 버전이 실립니다. Vercel 함수는 WebSocket을 지원하지 않아 SSE를 씁니다. 탭이 숨겨졌거나 10분간 조작이 없으면 연결을 쉬고, 다시 돌아오면 버전부터 확인합니다. 버전은 Vercel이면 커밋, 그 밖에는 `PLANNING_VERSION` 또는 화면 내용 해시입니다.

### 배포
- **Vercel** (서버리스 + Upstash Redis):
  1. Vercel → Add New → Project → GitHub `byeongjoosung/planning` 가져오기 (Framework: Other — 나머지는 `vercel.json`이 정함)
  2. 프로젝트 → Storage → Marketplace에서 **Upstash for Redis** 만들기 → 이 프로젝트에 연결 (`KV_REST_API_URL`, `KV_REST_API_TOKEN`이 자동으로 들어감)
  3. 선택: Settings → Environment Variables에 `PLANNING_SECRET`(16자 이상, 없으면 첫 실행 때 만들어 Redis에 보관), `ANTHROPIC_API_KEY`, `PLANNING_SIGNUP=closed`
  4. Deployments → Redeploy → `https://<프로젝트>.vercel.app` 접속 → 첫 가입자가 샘플 프로젝트 2개의 운영자
  - 리전: `vercel.json`의 `regions`(현재 도쿄 `hnd1`)를 Upstash 주 저장소 지역과 맞춥니다. `/api/health`의 `kvMs`(Redis 왕복 ms)가 한 자릿수면 맞게 된 것입니다.
  - 한도: 참조자료 한 번에 3MB(Vercel 요청 4.5MB), AI 생성 최대 300초. 로컬 LLM은 Vercel에서 접속할 수 있는 공개 주소여야 합니다(사내망 주소 불가).
- **Docker**: `docker build -t planning-studio . && docker run -p 8080:8080 -v planning-data:/data -e PLANNING_SECRET=… planning-studio` — 데이터 볼륨이 비어 있으면 샘플 프로젝트 2개를 넣습니다(`SEED_EXAMPLES=0`이면 안 넣음).
- **Render**: 이 저장소를 Render에 연결하고 New → Blueprint를 고르면 `render.yaml`대로 웹 서비스와 영구 디스크를 만들고 `https://planning-studio-xxxx.onrender.com` 주소를 줍니다. 만든 뒤 `PUBLIC_URL`을 그 주소로 넣으세요.
- 그 밖에 Docker가 도는 곳(Fly.io, Railway, 사내 서버)이면 같은 이미지로 됩니다. 파일 저장소라 인스턴스는 하나만 띄웁니다.

## 시작하기 (CLI)
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

planning kb add 제안요청서.pdf 회의록.txt   # 참조자료 → 프로젝트 지식
planning kb search 반려 사유
planning req add --title "정보공개 청구" --desc "민원인이 신청하면 심사자가 승인·반려하고 문자로 알린다" --auto-tasks
planning task suggest REQ-002          # 자동 생성 미리보기
planning design propose CVL            # 시스템별 디자인 컨셉 3종
planning design select CVL A           # 선택 → 디자인 시스템 생성
planning design component-add ADM review-timeline --name "심사 이력 타임라인" --category data --for SFR-003-T01

planning link add https://www.krds.go.kr --label "KRDS"   # 참조 URL (--kind SERVICE|FIGMA|REFERENCE)
planning prompt sb CVL_INF_REG_010 --for figma           # AI 요청 프롬프트 (sb|proto|ia|ds)
planning gen prompt ia ADM                                # AI 생성 프롬프트 (ia|sb|flow|ds) → Claude에서 JSON 받기
planning gen prompt sb ADM_INF_REV_010 --refine v1.json --instruction "검색 조건에 신청인 추가"   # 미세조정
planning gen apply ds ADM patch.json --instruction "주 색을 더 진하게"   # 반영 (디자인 개정 r+1)
planning gen review                                       # 디자인 변경 뒤 다시 검토할 화면
planning gen prompt ds ADM --scope cmp:data-table --instruction "머리글을 진하게"   # 섹션·컴포넌트 범위 조정

planning rtm --view matrix     # 요구사항 × 시스템
planning rtm --write           # rtm/ 에 rtm.md, rtm.json, rtm-*.csv 저장
planning check                 # 무결성·누락·근거 없는 산출물
planning snapshot --note "착수 기준선"
planning diff 0.1              # v0.1 대비 현재 변경 사항
planning view [--url <공유 주소>] # outputs/viewer.html — 브라우저로 여는 프로젝트 뷰어(읽기 전용)
planning serve --port 8080     # 웹 서비스 (로그인·공동 작업·편집·AI 생성)
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
planning --root examples/projects view --all   # examples/projects/viewer.html
```

`examples/projects/viewer.html`을 브라우저로 열면 두 샘플 프로젝트의 대시보드, 요구사항·Task, 요구사항 추적표, 정보구조도, 프로세스 플로우, 버전 이력을 볼 수 있습니다.
- `PUBINFO`: 신규 구축, 공공 민원형 + 외부 연계, 정보공개 요구사항의 시스템별 Task, 누락·근거 없음 사례 포함 — [추적표 보기](examples/projects/PUBINFO/rtm/rtm.md)
- `SHOPMY`: 기존 서비스 기존 메뉴 수정, v0.1 스냅샷 후 변경 요청(CR-001) 반영 — `planning --root examples/projects -p SHOPMY diff 0.1`

## 폴더 구조
```
src/model/     스키마, ID 규칙, 화면 ID 생성, 무결성 검사
src/project/   프로젝트 저장소, 시스템 프리셋, 변경 연산
src/trace/     추적성·RTM 계산
src/version/   스냅샷, Diff
src/render/    RTM Markdown·CSV 출력, viewer/ 프로젝트 뷰어·웹 화면(HTML)
src/service/   서비스 코어 — 편집 명령 실행·화면 데이터 계산 (파일 시스템 없음)
src/server/    웹 서비스 — 계정·세션·멤버·초대·AI 설정·API (planning serve)
src/cli.ts     CLI
schemas/       JSON Schema (npm run gen:schema)
examples/      샘플 프로젝트
tests/         테스트
```
