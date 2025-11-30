# 📄 LS-3116 Label PDF Printer

**Formtec LS-3116 (A4 / 2×3) 라벨 용지에 맞춰 다양한 패킹라벨(Packing Label) PDF를 자동 배치·정렬해 PDF로 출력하는 웹 서비스**

* PDF 형식의 패킹라벨 등을 LS-3116 A4 라벨지에 맞게 원하는 칸에 배치가능 (항상 왼쪽 상단에만 인쇄되는 문제 해결)
* 여러개의 패킹 라벨 pdf파일을 동시에 배치하고 인쇄 가능


본 프로젝트는 완전한 **Client-Side Web App**이며, 정적 호스팅에서 즉시 실행됩니다.

https://sanglyn.github.io/LS3116-Label-PDF-Printer/

---

## 📦 Files

| File           | Description                                       |
| -------------- | ------------------------------------------------- |
| **index.html** | UI 구조 및 라벨 배치 화면 구성                               |
| **script.js**  | PDF 업로드 · 자동 배정 · 슬롯 선택/드래그 · 오프셋 계산 · PDF 렌더링 로직 |
| **styles.css** | 전체 UI 스타일링                                        |

---

# ✨ 주요 기능 요약

## 1. PDF 업로드

* 패킹라벨 여러 개 업로드 가능
* 자동으로 빈 슬롯부터 배정됨 

## 2. 슬롯 기반 배치 시스템

* **슬롯 클릭 → 파일 선택**
* 선택된 슬롯은 **파란 외곽선**으로 강조
* **빈 슬롯 클릭 → 선택된 파일을 해당 슬롯으로 이동 (클릭 이동)**
* **Slot → Slot 교환은 오직 드래그 앤 드롭으로만 가능**
  → 실수 방지 UX

## 3. 드래그 앤 드롭

* 슬롯 간 교환(swap)
* 빈 칸으로 드롭 시 이동
* 다른 페이지로 이동 가능

## 4. 페이지 보드 (2×3 Grid)

* 한 화면에 **4페이지까지 표시**
* 최대 **40페이지 확장 가능**

## 5. 오프셋(Offset) 조정 기능
* 트랙스로지스, 쇼피SLS용 preset 지원
* 
### 전체 오프셋

[
\Delta X_\text{sheet},; \Delta Y_\text{sheet}
]

### 전체 칸 오프셋

[
\Delta X_\text{bulk},; \Delta Y_\text{bulk},;
S_\text{bulk}( % )
]

### 칸별 세부 조정

[
\Delta X_{i},; \Delta Y_{i},; S_i(%)
\qquad (i = 1\ldots6)
]

### 프리셋 제공

* 트랙스로지스
* Shopee SLS

## 6. PDF 생성 (pdf-lib 기반)

* 각 PDF의 첫 페이지를 slot 영역에 클리핑(clip) 후 렌더링
* 오프셋/스케일 반영
* 가이드 라벨 테두리 표시 가능
* 자동 미리보기 생성

---

# 🔧 기술 스택

* **Vanilla JavaScript**
* **pdf-lib** for PDF embedding
* **HTML5 / CSS3**
* 100% Client-Side



---

# 📂 프로젝트 구조

```txt
/
│── index.html
│── script.js
│── styles.css
└── README.md
```

---

# 📜 라이선스

MIT License

---


