/**
 *  Ver 0.2 (슬롯 선택/이동 방식으로 변경)
 */
// ======= LS-3116 Layout Constants (A4 Portrait, 2x3) =======
const PAGE_W_MM = 210;
const PAGE_H_MM = 297;

const LEFT_MARGIN_MM = 4;
const RIGHT_MARGIN_MM = 4;
const TOP_MARGIN_MM = 6;
const BOTTOM_MARGIN_MM = 9;
const H_GAP_MM = 2.5; // 좌우 칸 사이
const V_GAP_MM = 0; // 상하 칸 사이

const LABEL_W_MM =
  (PAGE_W_MM - LEFT_MARGIN_MM - RIGHT_MARGIN_MM - H_GAP_MM) / 2;
const LABEL_H_MM =
  (PAGE_H_MM - TOP_MARGIN_MM - BOTTOM_MARGIN_MM - 2 * V_GAP_MM) / 3;

const MAX_PAGES = 40;
const SLOTS_PER_PAGE = 6;

const mmToPt = (mm) => (mm * 72) / 25.4;

function getLabelRect(slot) {
  const row = Math.floor(slot / 2); // 0,1,2
  const col = slot % 2; // 0,1

  const pageHPt = mmToPt(PAGE_H_MM);
  const labelWPt = mmToPt(LABEL_W_MM);
  const labelHPt = mmToPt(LABEL_H_MM);
  const leftMarginPt = mmToPt(LEFT_MARGIN_MM);
  const topMarginPt = mmToPt(TOP_MARGIN_MM);
  const hGapPt = mmToPt(H_GAP_MM);
  const vGapPt = mmToPt(V_GAP_MM);

  const x = leftMarginPt + col * (labelWPt + hGapPt);
  const yTop = pageHPt - topMarginPt - row * (labelHPt + vGapPt);

  return { x, yTop, width: labelWPt, height: labelHPt };
}

// ======= State =======
// currentFiles[i] = { file: File, page: 0~9|null, slot: 0~5|null }
let currentFiles = [];
// slotToFileIndex[page][slot] = fileIndex | null
let slotToFileIndex = Array.from({ length: MAX_PAGES }, () =>
  Array(SLOTS_PER_PAGE).fill(null)
);
// ✅ 이제 "선택된 것"은 '파일' 기준으로만 관리 (슬롯에서 선택)
let selectedFileIndex = null;

let totalPages = 1; // 1~10
let visiblePageStart = 0; // 현재 보이는 페이지 시작 인덱스 (0-based)
let previewUrl = null;
let showAllFiles = false; // 파일 리스트 전체보기 토글

// ======= DOM =======
const pdfInput = document.getElementById("pdfFiles");
const dropZone = document.getElementById("dropZone");
const filesInfoText = document.getElementById("filesInfoText");
const filesTable = document.getElementById("filesTable");
const tbody = filesTable.querySelector("tbody");
const toggleFilesViewBtn = document.getElementById("toggleFilesViewBtn");

const pageStrip = document.getElementById("pageStrip");
const pageStripPrev = document.getElementById("pageStripPrev");
const pageStripNext = document.getElementById("pageStripNext");
const pageStripRange = document.getElementById("pageStripRange");
const addPageBtn = document.getElementById("addPageBtn");

const selectedFileInfo = document.getElementById("selectedFileInfo");

const generateBtn = document.getElementById("generateBtn");
const msg = document.getElementById("msg");
const pdfPreview = document.getElementById("pdfPreview");
const downloadLink = document.getElementById("downloadLink");
const showGuideInput = document.getElementById("showGuide");
const sheetOffsetXInput = document.getElementById("sheetOffsetX");
const sheetOffsetYInput = document.getElementById("sheetOffsetY");
const bulkSlotOffsetXInput = document.getElementById("bulkSlotOffsetX");
const bulkSlotOffsetYInput = document.getElementById("bulkSlotOffsetY");
const bulkSlotScaleInput = document.getElementById("bulkSlotScale");
const applyBulkSlotOffsetBtn = document.getElementById(
  "applyBulkSlotOffsetBtn"
);
const clearAllBtn = document.getElementById("clearAllBtn");
const offsetPresetSelect = document.getElementById("offsetPreset");
const toggleOffsetDetailsBtn = document.getElementById("toggleOffsetDetails");
const offsetDetails = document.getElementById("offsetDetails");

const helpBtn = document.getElementById("helpBtn");
const layoutTipBtn = document.getElementById("layoutTipBtn");
const helpModal = document.getElementById("helpModal");
const helpClose = document.getElementById("helpClose");

const {
  PDFDocument,
  rgb,
  pushGraphicsState,
  popGraphicsState,
  moveTo,
  lineTo,
  closePath,
  clip,
  endPath,
} = PDFLib;

// ======= 도움말 모달 =======
function openHelpModal() {
  helpModal.classList.remove("hidden");
}
function closeHelpModal() {
  helpModal.classList.add("hidden");
}
helpBtn.addEventListener("click", openHelpModal);
layoutTipBtn.addEventListener("click", openHelpModal);
helpClose.addEventListener("click", closeHelpModal);
helpModal.addEventListener("click", (e) => {
  if (e.target === helpModal || e.target.classList.contains("modal-backdrop")) {
    closeHelpModal();
  }
});

// ======= 파일 업로드 / 드롭존 =======
dropZone.addEventListener("click", () => {
  pdfInput.click();
});

pdfInput.addEventListener("change", () => {
  const files = Array.from(pdfInput.files || []);
  if (files.length > 0) addFiles(files);
  pdfInput.value = "";
});

dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  e.stopPropagation();
  dropZone.classList.add("dragover");
});

dropZone.addEventListener("dragleave", (e) => {
  e.preventDefault();
  e.stopPropagation();
  dropZone.classList.remove("dragover");
});

dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  e.stopPropagation();
  dropZone.classList.remove("dragover");
  const files = Array.from(e.dataTransfer.files || []);
  if (files.length > 0) addFiles(files);
});

function addFiles(newFiles) {
  for (const f of newFiles) {
    if (f.type !== "application/pdf") continue;
    currentFiles.push({ file: f, page: null, slot: null });
  }

  autoAssignSlots();

  // ✅ 파일 리스트에서 선택해서 배치하는 기능 제거
  // -> 선택은 항상 "슬롯 클릭"으로만 이루어짐
  // selectedFileIndex 는 여기서 건드리지 않음

  renderFilesTable();
  renderPageStrip();
  updateSelectedFileInfo();
  updateFilesInfo();
  updateFilesToggleBtn();
  generateBtn.disabled = currentFiles.length === 0;

  msg.innerHTML = "";
  downloadLink.style.display = "none";
}

// ======= 자동 배정 (빈 칸 순서대로) =======
function autoAssignSlots() {
  for (let i = 0; i < currentFiles.length; i++) {
    const f = currentFiles[i];
    if (f.page !== null && f.slot !== null) continue;

    let assigned = false;
    for (let p = 0; p < totalPages && !assigned; p++) {
      for (let s = 0; s < SLOTS_PER_PAGE; s++) {
        if (slotToFileIndex[p][s] === null) {
          slotToFileIndex[p][s] = i;
          f.page = p;
          f.slot = s;
          assigned = true;
          break;
        }
      }
    }

    if (!assigned && totalPages < MAX_PAGES) {
      totalPages++;
      const newPage = totalPages - 1;
      slotToFileIndex[newPage] =
        slotToFileIndex[newPage] || Array(SLOTS_PER_PAGE).fill(null);
      slotToFileIndex[newPage][0] = i;
      f.page = newPage;
      f.slot = 0;
      assigned = true;
    }

    if (!assigned) {
      alert(
        `더 이상 배정 가능한 라벨 칸이 없습니다. (최대 ${MAX_PAGES}페이지, 페이지당 6칸)`
      );
      break;
    }
  }

  adjustVisiblePageStart();
}

// ======= 파일 전체 삭제 =======
clearAllBtn.addEventListener("click", () => {
  if (currentFiles.length === 0) return;
  if (!confirm("모든 업로드된 파일과 칸 배정을 삭제할까요?")) return;

  currentFiles = [];
  slotToFileIndex = Array.from({ length: MAX_PAGES }, () =>
    Array(SLOTS_PER_PAGE).fill(null)
  );
  selectedFileIndex = null;
  totalPages = 1;
  visiblePageStart = 0;

  renderFilesTable();
  renderPageStrip();
  updateSelectedFileInfo();
  updateFilesInfo();
  updateFilesToggleBtn();
  generateBtn.disabled = true;

  msg.innerHTML = "";
  downloadLink.style.display = "none";
  if (previewUrl) {
    URL.revokeObjectURL(previewUrl);
    previewUrl = null;
  }
  pdfPreview.src = "";
});

// ======= 파일 테이블 렌더링 + 아코디언 =======
function renderFilesTable() {
  if (currentFiles.length === 0) {
    filesTable.style.display = "none";
    return;
  }
  filesTable.style.display = "table";
  tbody.innerHTML = "";

  const total = currentFiles.length;
  const maxVisible = 10;
  const visibleCount = showAllFiles ? total : Math.min(maxVisible, total);

  for (let idx = 0; idx < visibleCount; idx++) {
    const item = currentFiles[idx];
    const tr = document.createElement("tr");
    tr.className = "file-row";
    tr.dataset.index = idx;

    // ✅ 파일 리스트는 "선택 배정" 용도가 아니므로 클릭 핸들러 제거
    // 다만 현재 선택된 파일과 동기화된 하이라이트는 유지
    if (selectedFileIndex === idx) tr.classList.add("selected");

    const tdIdx = document.createElement("td");
    tdIdx.textContent = idx + 1;

    const tdName = document.createElement("td");
    tdName.textContent = item.file.name;

    const tdSlot = document.createElement("td");
    if (item.page === null || item.slot === null) {
      tdSlot.textContent = "미배정";
    } else {
      tdSlot.textContent = `${item.page + 1}p / 칸 ${item.slot + 1}`;
    }

    const tdDel = document.createElement("td");
    const delBtn = document.createElement("button");
    delBtn.textContent = "삭제";
    delBtn.className = "btn-secondary small";
    delBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteFile(idx);
    });
    tdDel.appendChild(delBtn);

    tr.append(tdIdx, tdName, tdSlot, tdDel);
    tbody.appendChild(tr);
  }

  // 10개 초과인데 접힌 상태이면, 요약행 추가
  if (!showAllFiles && total > visibleCount) {
    const rest = total - visibleCount;
    const tr = document.createElement("tr");
    tr.className = "file-row";

    const tdIdx = document.createElement("td");
    tdIdx.textContent = "…";

    const tdName = document.createElement("td");
    tdName.colSpan = 3;
    tdName.textContent = `외 ${rest}개 파일 더 있음 (위의 "전체 목록 보기" 버튼으로 확인)`;

    tr.append(tdIdx, tdName);
    tbody.appendChild(tr);
  }
}

function deleteFile(idx) {
  if (!currentFiles[idx]) return;

  // 해당 파일이 배정된 칸 비우기 + 인덱스 보정
  for (let p = 0; p < MAX_PAGES; p++) {
    for (let s = 0; s < SLOTS_PER_PAGE; s++) {
      if (slotToFileIndex[p][s] === idx) {
        slotToFileIndex[p][s] = null;
      } else if (slotToFileIndex[p][s] > idx) {
        slotToFileIndex[p][s] -= 1;
      }
    }
  }

  currentFiles.splice(idx, 1);

  // 선택된 파일 삭제 시 선택 해제
  if (selectedFileIndex === idx) {
    selectedFileIndex = null;
  } else if (selectedFileIndex > idx) {
    selectedFileIndex -= 1;
  }

  renderFilesTable();
  renderPageStrip();
  updateSelectedFileInfo();
  updateFilesInfo();
  updateFilesToggleBtn();
  generateBtn.disabled = currentFiles.length === 0;
}

function updateFilesInfo() {
  const n = currentFiles.length;
  if (n === 0) {
    filesInfoText.textContent = "업로드된 파일이 없습니다.";
  } else {
    filesInfoText.textContent = `업로드된 PDF: ${n}개`;
  }
}

function updateFilesToggleBtn() {
  const n = currentFiles.length;
  const maxVisible = 10;
  if (n <= maxVisible) {
    toggleFilesViewBtn.style.display = "none";
    showAllFiles = false;
    return;
  }
  toggleFilesViewBtn.style.display = "inline-block";
  if (showAllFiles) {
    toggleFilesViewBtn.textContent = "상위 10개만 보기";
  } else {
    toggleFilesViewBtn.textContent = `전체 목록 보기 (${n}개)`;
  }
}

toggleFilesViewBtn.addEventListener("click", () => {
  showAllFiles = !showAllFiles;
  updateFilesToggleBtn();
  renderFilesTable();
});

// ======= 페이지 스트립 / 페이지 보드 =======
function adjustVisiblePageStart() {
  // 한 화면에 4페이지까지 보여줌
  if (totalPages <= 4) {
    visiblePageStart = 0;
  } else {
    if (visiblePageStart + 4 > totalPages) {
      visiblePageStart = totalPages - 4;
    }
    if (visiblePageStart < 0) visiblePageStart = 0;
  }
}

function renderPageStrip() {
  adjustVisiblePageStart();
  pageStrip.innerHTML = "";

  const endPage = Math.min(totalPages, visiblePageStart + 4);

  for (let p = visiblePageStart; p < endPage; p++) {
    const board = document.createElement("div");
    board.className = "page-board";
    board.dataset.page = p;

    const header = document.createElement("div");
    header.className = "page-board-header";
    const title = document.createElement("div");
    title.className = "page-board-title";
    title.textContent = `페이지 ${p + 1}`;
    const tag = document.createElement("div");
    tag.className = "page-board-tag";
    tag.textContent = "2×3 Slots";
    header.append(title, tag);

    const grid = document.createElement("div");
    grid.className = "layout-grid";

    for (let slot = 0; slot < SLOTS_PER_PAGE; slot++) {
      const cell = document.createElement("div");
      cell.className = "layout-cell";
      cell.dataset.page = p;
      cell.dataset.slot = slot;
      cell.setAttribute("draggable", "true");

      const slotLabel = document.createElement("div");
      slotLabel.className = "slot-label";
      slotLabel.textContent = `칸 ${slot + 1}`;

      const contentLabel = document.createElement("div");
      const fileIdx = slotToFileIndex[p][slot];
      if (fileIdx === null || currentFiles[fileIdx] === undefined) {
        contentLabel.className = "empty-label";
        contentLabel.textContent = "미배정";
      } else {
        contentLabel.className = "file-label";
        contentLabel.textContent = currentFiles[fileIdx].file.name;
        cell.classList.add("assigned");
      }

      // ✅ 선택된 파일이 들어 있는 슬롯은 강조 표시
      if (
        selectedFileIndex !== null &&
        fileIdx !== null &&
        fileIdx === selectedFileIndex
      ) {
        cell.classList.add("selected-slot");
      }

      cell.appendChild(slotLabel);
      cell.appendChild(contentLabel);

      // ✅ 슬롯 클릭 로직 변경
      cell.addEventListener("click", () => onClickSlotCell(p, slot));

      // 드래그앤드랍은 기존대로 유지 (슬롯 간 이동/교환 전용)
      cell.addEventListener("dragstart", onSlotDragStart);
      cell.addEventListener("dragover", onSlotDragOver);
      cell.addEventListener("drop", onSlotDrop);

      grid.appendChild(cell);
    }

    const footer = document.createElement("div");
    footer.className = "page-board-footer";
    footer.textContent = `페이지 ${p + 1}`;

    board.append(header, grid, footer);
    pageStrip.appendChild(board);
  }

  // Range 표시
  const startDisp = visiblePageStart + 1;
  const endDisp = endPage;
  pageStripRange.textContent = `${startDisp}–${endDisp} / ${totalPages}`;
}

// 슬롯 드래그 핸들러
function onSlotDragStart(e) {
  const cell = e.currentTarget;
  const page = parseInt(cell.dataset.page, 10);
  const slot = parseInt(cell.dataset.slot, 10);
  if (isNaN(page) || isNaN(slot)) return;
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", `${page}:${slot}`);
}

function onSlotDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
}

function onSlotDrop(e) {
  e.preventDefault();
  const destCell = e.currentTarget;
  const destPage = parseInt(destCell.dataset.page, 10);
  const destSlot = parseInt(destCell.dataset.slot, 10);
  const data = e.dataTransfer.getData("text/plain");
  if (!data) return;
  const [srcPageStr, srcSlotStr] = data.split(":");
  const srcPage = parseInt(srcPageStr, 10);
  const srcSlot = parseInt(srcSlotStr, 10);
  if (
    isNaN(srcPage) ||
    isNaN(srcSlot) ||
    isNaN(destPage) ||
    isNaN(destSlot)
  )
    return;
  if (srcPage === destPage && srcSlot === destSlot) return;

  handleSlotDragDrop(srcPage, srcSlot, destPage, destSlot);
}

function handleSlotDragDrop(srcPage, srcSlot, destPage, destSlot) {
  const srcIdx = slotToFileIndex[srcPage][srcSlot];
  const destIdx = slotToFileIndex[destPage][destSlot];
  if (srcIdx === null || currentFiles[srcIdx] === undefined) return;

  if (destIdx === null) {
    // move
    slotToFileIndex[destPage][destSlot] = srcIdx;
    slotToFileIndex[srcPage][srcSlot] = null;
    currentFiles[srcIdx].slot = destSlot;
    currentFiles[srcIdx].page = destPage;
  } else {
    // swap (드래그앤드랍으로만 가능)
    slotToFileIndex[destPage][destSlot] = srcIdx;
    slotToFileIndex[srcPage][srcSlot] = destIdx;
    currentFiles[srcIdx].slot = destSlot;
    currentFiles[srcIdx].page = destPage;
    currentFiles[destIdx].slot = srcSlot;
    currentFiles[destIdx].page = srcPage;
  }

  renderPageStrip();
  renderFilesTable();
  updateSelectedFileInfo();
}

// 페이지 스트립 네비게이션
pageStripPrev.addEventListener("click", () => {
  if (visiblePageStart > 0) {
    visiblePageStart = Math.max(0, visiblePageStart - 1);
    renderPageStrip();
  }
});

pageStripNext.addEventListener("click", () => {
  if (visiblePageStart + 4 < totalPages) {
    visiblePageStart = Math.min(totalPages - 4, visiblePageStart + 1);
    if (visiblePageStart < 0) visiblePageStart = 0;
    renderPageStrip();
  }
});

addPageBtn.addEventListener("click", () => {
  if (totalPages >= MAX_PAGES) {
    alert(`페이지는 최대 ${MAX_PAGES}페이지까지 생성 가능합니다.`);
    return;
  }
  totalPages++;
  adjustVisiblePageStart();
  // 새 페이지를 오른쪽에 보이도록
  if (totalPages <= 4) {
    visiblePageStart = 0;
  } else {
    visiblePageStart = totalPages - 4;
  }
  renderPageStrip();
});

// ======= 선택된 파일 정보 =======
function updateSelectedFileInfo() {
  if (selectedFileIndex === null || !currentFiles[selectedFileIndex]) {
    selectedFileInfo.textContent =
      "선택된 파일: 없음 (페이지 보드에서 파일이 들어간 슬롯을 클릭해서 선택)";
  } else {
    const f = currentFiles[selectedFileIndex];
    const slotText =
      f.page === null || f.slot === null
        ? "미배정"
        : `${f.page + 1}p / 칸 ${f.slot + 1}`;
    selectedFileInfo.textContent = `선택된 파일: ${f.file.name} (현재: ${slotText})`;
  }
}

// ======= 칸 클릭 로직 (선택 & 빈 슬롯으로 이동만 허용) =======
function onClickSlotCell(page, slot) {
  const fileIdxAtSlot = slotToFileIndex[page][slot];

  if (fileIdxAtSlot !== null && currentFiles[fileIdxAtSlot]) {
    // ✅ 1) 파일이 들어 있는 슬롯을 클릭하면, 그 파일을 "선택"만 함 (위치 변화 없음)
    selectedFileIndex = fileIdxAtSlot;

    renderPageStrip();
    renderFilesTable();
    updateSelectedFileInfo();
    msg.innerHTML = "";
    downloadLink.style.display = "none";
    return;
  }

  // 여기까지 왔다는 것은 "빈 슬롯"을 클릭한 경우
  // ✅ 2) 선택된 파일이 없다면 아무 동작도 하지 않음
  if (selectedFileIndex === null || !currentFiles[selectedFileIndex]) {
    return;
  }

  // ✅ 3) 선택된 파일이 있는 경우, 그 파일을 이 빈 슬롯으로 "이동" (클릭 이동은 빈 슬롯만 허용)
  const f = currentFiles[selectedFileIndex];
  const srcPage = f.page;
  const srcSlot = f.slot;

  if (
    srcPage !== null &&
    srcSlot !== null &&
    slotToFileIndex[srcPage][srcSlot] === selectedFileIndex
  ) {
    slotToFileIndex[srcPage][srcSlot] = null;
  }

  slotToFileIndex[page][slot] = selectedFileIndex;
  f.page = page;
  f.slot = slot;

  renderPageStrip();
  renderFilesTable();
  updateSelectedFileInfo();
  msg.innerHTML = "";
  downloadLink.style.display = "none";
}

// ======= 세부 오프셋 토글 (아코디언) =======
toggleOffsetDetailsBtn.addEventListener("click", () => {
  const isHidden = offsetDetails.style.display === "none";
  offsetDetails.style.display = isHidden ? "block" : "none";
  toggleOffsetDetailsBtn.textContent = isHidden
    ? "세부 오프셋 (고급) 접기 ▴"
    : "세부 오프셋 (고급) 펼치기 ▾";
});

// ======= Bulk Slot Offset & Scale =======
applyBulkSlotOffsetBtn.addEventListener("click", () => {
  const bulkX = parseFloat(bulkSlotOffsetXInput.value || "0") || 0;
  const bulkY = parseFloat(bulkSlotOffsetYInput.value || "0") || 0;
  let bulkScale = parseFloat(bulkSlotScaleInput.value || "95");
  if (isNaN(bulkScale)) bulkScale = 95;
  if (bulkScale < 10) bulkScale = 10;
  if (bulkScale > 200) bulkScale = 200;
  bulkSlotScaleInput.value = bulkScale;

  for (let slot = 0; slot < SLOTS_PER_PAGE; slot++) {
    const xInput = document.getElementById(`slotOffsetX${slot}`);
    const yInput = document.getElementById(`slotOffsetY${slot}`);
    const sInput = document.getElementById(`slotScale${slot}`);
    if (xInput) xInput.value = bulkX;
    if (yInput) yInput.value = bulkY;
    if (sInput) sInput.value = bulkScale;
  }
});

// ======= Presets =======
function applyPreset(preset) {
  if (preset === "tracx") {
    bulkSlotOffsetXInput.value = -1;
    bulkSlotOffsetYInput.value = 4;
    bulkSlotScaleInput.value = 95;
  } else if (preset === "shopee") {
    // 현재 코드 기준: X=2, Y=0, 축소 94%
    bulkSlotOffsetXInput.value = 2;
    bulkSlotOffsetYInput.value = 0;
    bulkSlotScaleInput.value = 94;
  }
  applyBulkSlotOffsetBtn.click();
}

offsetPresetSelect.addEventListener("change", () => {
  applyPreset(offsetPresetSelect.value);
});

// 초기 프리셋 + 페이지 스트립 + 파일 정보
offsetPresetSelect.value = "tracx";
applyPreset("tracx");
updateFilesInfo();
updateFilesToggleBtn();
renderPageStrip();
updateSelectedFileInfo();

// ======= PDF 생성 =======
generateBtn.onclick = generate;

async function generate() {
  msg.innerHTML = "";
  downloadLink.style.display = "none";

  const assignedFiles = currentFiles.filter(
    (f) => f.page !== null && f.slot !== null
  );
  if (assignedFiles.length === 0) {
    msg.innerHTML =
      '<div class="error">라벨 칸에 배정된 파일이 없습니다. 최소 1개 이상 배정해주세요.</div>';
    return;
  }

  generateBtn.disabled = true;
  generateBtn.textContent = "생성 중...";

  try {
    const out = await PDFDocument.create();

    // 실제 출력할 페이지 수: 마지막으로 사용된 page 인덱스 기준
    let maxPageUsed = -1;
    for (const f of currentFiles) {
      if (f.page !== null && f.page > maxPageUsed) maxPageUsed = f.page;
    }
    const totalPagesToPrint = Math.max(1, maxPageUsed + 1);

    const outPages = [];
    for (let p = 0; p < totalPagesToPrint; p++) {
      const page = out.addPage([mmToPt(PAGE_W_MM), mmToPt(PAGE_H_MM)]);
      outPages.push(page);
    }

    const showGuide = !showGuideInput || showGuideInput.checked;

    const sheetOffsetXmm = sheetOffsetXInput
      ? parseFloat(sheetOffsetXInput.value || "0") || 0
      : 0;
    const sheetOffsetYmm = sheetOffsetYInput
      ? parseFloat(sheetOffsetYInput.value || "0") || 0
      : 0;
    const sheetOffsetXPt = mmToPt(sheetOffsetXmm);
    const sheetOffsetYPt = mmToPt(sheetOffsetYmm);

    const slotOffsetXPt = [];
    const slotOffsetYPt = [];
    const slotScalePercent = [];
    for (let slot = 0; slot < SLOTS_PER_PAGE; slot++) {
      const xInput = document.getElementById(`slotOffsetX${slot}`);
      const yInput = document.getElementById(`slotOffsetY${slot}`);
      const sInput = document.getElementById(`slotScale${slot}`);

      const mmX = xInput ? parseFloat(xInput.value || "0") || 0 : 0;
      const mmY = yInput ? parseFloat(yInput.value || "0") || 0 : 0;
      let scaleP = sInput ? parseFloat(sInput.value || "95") || 95 : 95;
      if (scaleP < 10) scaleP = 10;
      if (scaleP > 200) scaleP = 200;

      slotOffsetXPt[slot] = mmToPt(mmX);
      slotOffsetYPt[slot] = mmToPt(mmY);
      slotScalePercent[slot] = scaleP;
    }

    // 1) PDF 내용 + 클리핑
    for (let i = 0; i < currentFiles.length; i++) {
      const item = currentFiles[i];
      if (item.page === null || item.slot === null) continue;
      if (item.page < 0 || item.page >= totalPagesToPrint) continue;

      const buffer = await item.file.arrayBuffer();
      const uint8 = new Uint8Array(buffer);
      const [embedded] = await out.embedPdf(uint8, [0]);

      const rect = getLabelRect(item.slot);
      const scalePercent = slotScalePercent[item.slot] ?? 95;
      const scale = scalePercent / 100;

      const drawHeight = embedded.height * scale;

      const labelX = rect.x;
      const labelYTop = rect.yTop;

      const clipX = labelX;
      const clipY = labelYTop - rect.height;
      const clipW = rect.width;
      const clipH = rect.height;

      let drawX = labelX + sheetOffsetXPt + slotOffsetXPt[item.slot];
      let drawYTop = labelYTop + sheetOffsetYPt + slotOffsetYPt[item.slot];
      let drawY = drawYTop - drawHeight;

      const outPage = outPages[item.page];

      outPage.pushOperators(
        pushGraphicsState(),
        moveTo(clipX, clipY),
        lineTo(clipX + clipW, clipY),
        lineTo(clipX + clipW, clipY + clipH),
        lineTo(clipX, clipY + clipH),
        closePath(),
        clip(),
        endPath()
      );

      outPage.drawPage(embedded, {
        x: drawX,
        y: drawY,
        xScale: scale,
        yScale: scale,
      });

      outPage.pushOperators(popGraphicsState());
    }

    // 2) 각 페이지마다 가이드 테두리 (오프셋 적용 안 함)
    if (showGuide) {
      for (let p = 0; p < totalPagesToPrint; p++) {
        const outPage = outPages[p];
        for (let slot = 0; slot < SLOTS_PER_PAGE; slot++) {
          const rect = getLabelRect(slot);
          const x = rect.x;
          const yBottom = rect.yTop - rect.height;

          outPage.drawRectangle({
            x,
            y: yBottom,
            width: rect.width,
            height: rect.height,
            borderWidth: 0.5,
            borderColor: rgb(0.2, 0.2, 0.2),
          });
        }
      }
    }

    const bytes = await out.save();
    const blob = new Blob([bytes], { type: "application/pdf" });

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(blob);

    pdfPreview.src = previewUrl;
    downloadLink.href = previewUrl;
    downloadLink.style.display = "inline-flex";

    msg.innerHTML = `<div class="success">PDF 생성 및 미리보기 준비 완료! (총 ${totalPagesToPrint} 페이지)</div>`;
  } catch (e) {
    console.error(e);
    msg.innerHTML = `<div class="error">오류: ${e.message}</div>`;
  } finally {
    generateBtn.disabled = currentFiles.length === 0;
    generateBtn.textContent = "PDF 생성";
  }
}
