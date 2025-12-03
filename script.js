/**
 * Label PDF Printer v0.6
 * - LS-3116(2x3), LS-3114(2x4) 레이아웃 선택
 * - PDF 페이지 단위 가상 파일로 분해 후 슬롯 배정
 * - 드래그&드롭 / 클릭 이동
 * - 오프셋 / 슬롯별 축소% / 프리셋
 * - 스케일 모드:
 *   - ORIGINAL: PDF 원본 크기 존중 (텍스트/바코드 크기 우선)
 *   - FIT_WIDTH: 라벨 가로폭에 맞게 비율 유지
 * - clipToSlot(안전 모드): 슬롯 밖으로 튀어나가지 않도록 자동 축소
 * - 슬롯 밖으로 나갔을때 자르기 옵션
 */

window.addEventListener("DOMContentLoaded", () => {
  if (!window.PDFLib) {
    alert(
      "pdf-lib 라이브러리를 불러오지 못했습니다.\n" +
        "인터넷 연결 또는 index.html의 pdf-lib 스크립트 경로를 확인해주세요."
    );
    return;
  }

  const { PDFDocument, rgb } = window.PDFLib;

  // -----------------------------
  //  레이아웃 정의
  // -----------------------------
  const LAYOUTS = {
    LS3116: {
      id: "LS3116",
      name: "Formtec LS-3116",
      rows: 3,
      cols: 2,
      slotsPerPage: 6,
      labelWmm: 99.1,
      labelHmm: 93.1
    },
    LS3114: {
      id: "LS3114",
      name: "Formtec LS-3114",
      rows: 4,
      cols: 2,
      slotsPerPage: 8,
      labelWmm: 99.1,
      labelHmm: 67.7
    }
  };

  // A4 및 마진/간격(mm)
  const PAGE_WIDTH_MM = 210;
  const PAGE_HEIGHT_MM = 297;
  const MARGIN_L_MM = 4;
  const MARGIN_T_MM = 6;
  const GAP_H_MM = 2.5;
  const GAP_V_MM = 0;

  const MM_TO_PT = 72 / 25.4;

  // -----------------------------
  //  스케일 모드
  // -----------------------------
  const SCALE_MODES = {
    ORIGINAL: "original",
    FIT_WIDTH: "fitWidth"
  };

  // 기본: 원본 크기 존중
  let scaleMode = SCALE_MODES.ORIGINAL;
  // 슬롯 밖으로 나가지 않도록 자동 축소 옵션
  let clipToSlot = false;
  // 슬롯 경계에서 자르기 옵션 (기본값: true - 경계 밖 내용 제거)
  let clipAtBoundary = true;

  // -----------------------------
  //  상태값
  // -----------------------------
  let currentLayoutKey = null;
  let currentLayout = null;

  let currentFiles = []; // pdf 1페이지 = 1개 항목
  let pages = [];        // 페이지 보드들

  const PAGES_PER_VIEW = 4;
  let pageStripStartIndex = 0;

  let slotOffsets = [];

  let selectedFileIndex = null;
  let selectedSlotEl = null;

  let showAllFiles = false;
  let currentPreset = null;
  let offsetDetailsOpen = false;

  let previewUrl = null;

  // -----------------------------
  //  DOM
  // -----------------------------
  const layoutCards = Array.from(
    document.querySelectorAll(".layout-card[data-layout]")
  );

  const dropZone = document.getElementById("dropZone");
  const pdfFilesInput = document.getElementById("pdfFiles");
  const filesInfoText = document.getElementById("filesInfoText");
  const filesTable = document.getElementById("filesTable");
  const filesTableBody = filesTable.querySelector("tbody");
  const clearAllBtn = document.getElementById("clearAllBtn");
  const toggleFilesViewBtn = document.getElementById("toggleFilesViewBtn");

  const pageStrip = document.getElementById("pageStrip");
  const addPageBtn = document.getElementById("addPageBtn");
  const pageStripPrev = document.getElementById("pageStripPrev");
  const pageStripNext = document.getElementById("pageStripNext");
  const pageStripRange = document.getElementById("pageStripRange");
  const selectedFileInfo = document.getElementById("selectedFileInfo");

  const presetTracxBtn = document.getElementById("presetTracx");
  const presetShopeeBtn = document.getElementById("presetShopee");
  const sheetOffsetXInput = document.getElementById("sheetOffsetX");
  const sheetOffsetYInput = document.getElementById("sheetOffsetY");
  const showGuideInput = document.getElementById("showGuide");
  const bulkOffsetXInput = document.getElementById("bulkOffsetX");
  const bulkOffsetYInput = document.getElementById("bulkOffsetY");
  const bulkScaleInput = document.getElementById("bulkScale");
  const applyBulkOffsetBtn = document.getElementById("applyBulkOffset");
  const slotOffsetContainer = document.getElementById("slotOffsetContainer");
  const generateBtn = document.getElementById("generateBtn");
  const downloadLink = document.getElementById("downloadLink");
  const msg = document.getElementById("msg");
  const pdfPreview = document.getElementById("pdfPreview");

  const toggleOffsetDetailsBtn = document.getElementById("toggleOffsetDetails");
  const offsetDetails = document.getElementById("offsetDetails");
  const offsetPresetStatus = document.getElementById("offsetPresetStatus");

  const scaleModeRadios = document.querySelectorAll('input[name="scaleMode"]');
  const clipToSlotInput = document.getElementById("clipToSlot");
  const clipAtBoundaryInput = document.getElementById("clipAtBoundary");

  const helpBtn = document.getElementById("helpBtn");
  const helpModal = document.getElementById("helpModal");
  const helpCloseBtn = document.getElementById("helpClose");

  // -----------------------------
  //  초기 세팅
  // -----------------------------
  disableUpload(true);
  updateFilesInfo();
  renderFilesTable();
  renderPageBoards();
  renderOffsetInputs();
  updateOffsetAccordionUI();
  updateGenerateButtonState();
  // updatePresetStatusUI(); // Removed as function is deleted
  initScaleModeUI();

  // 기본 레이아웃: LS3116 자동 선택
  (function selectDefaultLayout() {
    const defaultKey = "LS3116";
    const radio = document.querySelector(`input[name="layoutSelect"][value="${defaultKey}"]`);
    if (!radio) return;

    radio.checked = true;
    currentLayoutKey = defaultKey;
    currentLayout = LAYOUTS[defaultKey];
    
    disableUpload(false);
    resetAllStateForLayoutChange();

    // Apply Tracx preset values on load
    slotOffsets = slotOffsets.map(() => ({ x: 3, y: -3, scale: 100 }));
    renderOffsetInputs();

    msg.innerHTML = `<div class="info">기본 레이아웃: ${currentLayout.name} 선택됨</div>`;
  })();

  // -----------------------------
  //  유틸 함수
  // -----------------------------
  function disableUpload(disabled) {
    if (disabled) dropZone.classList.add("disabled");
    else dropZone.classList.remove("disabled");
  }

  function resetAllStateForLayoutChange() {
    pages = [];
    pageStripStartIndex = 0;

    currentFiles.forEach((f) => {
      f.assignedPage = null;
      f.assignedSlot = null;
    });

    ensureEnoughPagesForSlotsNeeded(currentFiles.length);
    autoAssignNewFiles(0);

    resetSlotOffsets();
    renderOffsetInputs();
    renderPageBoards();
    renderFilesTable();
    updateFilesInfo();
    clearPreview();
    updateGenerateButtonState();
  }

  function resetSlotOffsets() {
    if (!currentLayout) {
      slotOffsets = [];
      return;
    }
    slotOffsets = [];
    for (let i = 0; i < currentLayout.slotsPerPage; i++) {
      if (currentPreset === "tracx") {
        slotOffsets.push({ x: 3, y: -3, scale: 100 });
      } else if (currentPreset === "none") {
        slotOffsets.push({ x: 0, y: 0, scale: 100 });
      } else {
        // Default fallback or Shopee
        slotOffsets.push({ x: 0, y: 0, scale: 100 }); // Changed from 95 to 100
      }
    }
  }

  function updateFilesInfo() {
    if (currentFiles.length === 0) {
      filesInfoText.textContent = "업로드된 파일이 없습니다.";
    } else {
      filesInfoText.textContent = `총 ${currentFiles.length}개 페이지 라벨이 추가되었습니다.`;
    }
  }

  function clearPreview() {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      previewUrl = null;
    }
    pdfPreview.src = "";
    downloadLink.style.display = "none";
  }

  function updateGenerateButtonState() {
    generateBtn.disabled = !currentLayout || currentFiles.length === 0;
  }

  function ensureEnoughPagesForSlotsNeeded(slotsNeeded) {
    if (!currentLayout) return;

    if (pages.length === 0) {
      pages.push({
        slots: Array(currentLayout.slotsPerPage).fill(null)
      });
    }
    if (!slotsNeeded || slotsNeeded <= 0) return;

    const totalSlots = pages.length * currentLayout.slotsPerPage;
    const usedSlots = countAssignedSlots();
    const remaining = totalSlots - usedSlots;
    let needMore = slotsNeeded - remaining;

    while (needMore > 0) {
      pages.push({
        slots: Array(currentLayout.slotsPerPage).fill(null)
      });
      needMore -= currentLayout.slotsPerPage;
    }
  }

  function countAssignedSlots() {
    let c = 0;
    pages.forEach((p) => {
      p.slots.forEach((s) => {
        if (s !== null) c++;
      });
    });
    return c;
  }

  function autoAssignNewFiles(startIndex) {
    if (!currentLayout) return;
    for (let i = startIndex; i < currentFiles.length; i++) {
      const f = currentFiles[i];
      if (f.assignedPage != null && f.assignedSlot != null) continue;
      let ok = false;
      for (let p = 0; p < pages.length && !ok; p++) {
        for (let s = 0; s < currentLayout.slotsPerPage && !ok; s++) {
          if (pages[p].slots[s] === null) {
            pages[p].slots[s] = i;
            f.assignedPage = p;
            f.assignedSlot = s;
            ok = true;
          }
        }
      }
      if (!ok) {
        pages.push({
          slots: Array(currentLayout.slotsPerPage).fill(null)
        });
        i--;
      }
    }
  }

  function recalcAssignmentsAfterFileRemoval(removedIndex) {
    pages.forEach((p) => {
      for (let s = 0; s < p.slots.length; s++) {
        const idx = p.slots[s];
        if (idx === null) continue;
        if (idx === removedIndex) {
          p.slots[s] = null;
        } else if (idx > removedIndex) {
          p.slots[s] = idx - 1;
        }
      }
    });

    pages.forEach((p, pageIdx) => {
      p.slots.forEach((fileIdx, slotIdx) => {
        if (fileIdx !== null && currentFiles[fileIdx]) {
          currentFiles[fileIdx].assignedPage = pageIdx;
          currentFiles[fileIdx].assignedSlot = slotIdx;
        }
      });
    });
  }

  const presetNoneBtn = document.getElementById("presetNone");

  if (presetNoneBtn) {
    presetNoneBtn.addEventListener("click", () => {
      setCurrentPreset("none");
      resetSlotOffsets(); // 0, 0, 95 (default reset) -> need to ensure it's 0,0,100 for "none"
      // Override for "No Preset" specific requirement: 0, 0, 100
      slotOffsets = slotOffsets.map(() => ({ x: 0, y: 0, scale: 100 }));
      renderOffsetInputs();
    });
  }

  if (presetTracxBtn) {
    presetTracxBtn.addEventListener("click", () => {
      setCurrentPreset("tracx");
      // Tracx: x:3, y:-3, scale:100
      slotOffsets = slotOffsets.map(() => ({ x: 3, y: -3, scale: 100 }));
      renderOffsetInputs();
    });
  }

  if (presetShopeeBtn) {
    presetShopeeBtn.addEventListener("click", () => {
      setCurrentPreset("shopee");
      // Shopee preset logic (keep existing or default)
      resetSlotOffsets();
      renderOffsetInputs();
    });
  }

  function setCurrentPreset(presetKey) {
    currentPreset = presetKey;
    if (presetNoneBtn) presetNoneBtn.classList.toggle("preset-active", presetKey === "none");
    if (presetTracxBtn) presetTracxBtn.classList.toggle("preset-active", presetKey === "tracx");
    if (presetShopeeBtn) presetShopeeBtn.classList.toggle("preset-active", presetKey === "shopee");
  }

  // Set default preset to Tracx
  setCurrentPreset("tracx");
  // Apply Tracx values on load
  slotOffsets = []; // Will be filled by renderOffsetInputs or we need to init it
  // Wait, slotOffsets is init in renderPageBoards -> resetSlotOffsets
  // We need to ensure when layout changes, we might want to re-apply preset? 
  // For now, just init logic.
  
  // We need to hook into resetAllStateForLayoutChange to apply default preset values if needed.
  // But user said "Tracx preset is default".
  // Let's modify resetSlotOffsets to respect currentPreset or just init with Tracx values if it's the default.

  function updateOffsetAccordionUI() {
    if (!offsetDetails || !toggleOffsetDetailsBtn) return;
    if (offsetDetailsOpen) {
      offsetDetails.style.display = "block";
      toggleOffsetDetailsBtn.textContent = "세부 오프셋 (고급) 접기 ▾";
    } else {
      offsetDetails.style.display = "none";
      toggleOffsetDetailsBtn.textContent = "세부 오프셋 (고급) 펼치기 ▸";
    }
  }

  function initScaleModeUI() {
    if (scaleModeRadios && scaleModeRadios.length > 0) {
      scaleModeRadios.forEach((radio) => {
        radio.addEventListener("change", (e) => {
          const val = e.target.value;
          if (val === "fitWidth") {
            scaleMode = SCALE_MODES.FIT_WIDTH;
          } else {
            scaleMode = SCALE_MODES.ORIGINAL;
          }
        });
      });
    }

    if (clipToSlotInput) {
      clipToSlotInput.addEventListener("change", (e) => {
        clipToSlot = e.target.checked;
      });
    }

    if (clipAtBoundaryInput) {
      clipAtBoundaryInput.addEventListener("change", (e) => {
        clipAtBoundary = e.target.checked;
      });
    }
  }

  // -----------------------------
  //  레이아웃 선택
  // -----------------------------
  // -----------------------------
  //  레이아웃 선택
  // -----------------------------
  const layoutRadios = document.querySelectorAll('input[name="layoutSelect"]');
  layoutRadios.forEach((radio) => {
    radio.addEventListener("change", (e) => {
      const layoutKey = e.target.value;
      if (!LAYOUTS[layoutKey]) return;

      currentLayoutKey = layoutKey;
      currentLayout = LAYOUTS[layoutKey];

      disableUpload(false);
      resetAllStateForLayoutChange();

      msg.innerHTML = `<div class="info">선택된 레이아웃: ${currentLayout.name} (${currentLayout.cols}×${currentLayout.rows}, Label ${currentLayout.labelWmm}×${currentLayout.labelHmm}mm)</div>`;
    });
  });

  // -----------------------------
  //  업로드
  // -----------------------------
  dropZone.addEventListener("click", () => {
    if (!currentLayout) {
      alert("먼저 1단계에서 라벨 용지를 선택해주세요.");
      return;
    }
    pdfFilesInput.click();
  });

  dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
  });

  dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    if (!currentLayout) {
      alert("먼저 1단계에서 라벨 용지를 선택해주세요.");
      return;
    }
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length > 0) handleFilesUpload(files);
  });

  pdfFilesInput.addEventListener("change", (e) => {
    if (!currentLayout) {
      alert("먼저 1단계에서 라벨 용지를 선택해주세요.");
      pdfFilesInput.value = "";
      return;
    }
    const files = Array.from(e.target.files || []);
    if (files.length > 0) handleFilesUpload(files);
    pdfFilesInput.value = "";
  });

  async function handleFilesUpload(files) {
    msg.innerHTML = `<div class="info">PDF 분석 중...</div>`;
    const startIndex = currentFiles.length;

    for (const file of files) {
      const arrayBuffer = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(arrayBuffer);
      const pageCount = pdfDoc.getPageCount();

      for (let i = 0; i < pageCount; i++) {
        currentFiles.push({
          name: `${file.name} (p.${i + 1})`,
          baseName: file.name,
          pageNumber: i,
          pdfBytes: arrayBuffer,
          assignedPage: null,
          assignedSlot: null
        });
      }
    }

    ensureEnoughPagesForSlotsNeeded(currentFiles.length - startIndex);
    autoAssignNewFiles(startIndex);

    updateFilesInfo();
    renderFilesTable();
    renderPageBoards();
    updateGenerateButtonState();

    msg.innerHTML = `<div class="success">PDF 업로드 및 자동 배치 완료 (총 ${currentFiles.length} 페이지)</div>`;
  }

  // -----------------------------
  //  파일 테이블
  // -----------------------------
  function renderFilesTable() {
    filesTableBody.innerHTML = "";

    if (currentFiles.length === 0) {
      filesTable.style.display = "none";
      if (toggleFilesViewBtn) toggleFilesViewBtn.style.display = "none";
      showAllFiles = false;
      return;
    }

    filesTable.style.display = "table";

    const total = currentFiles.length;
    const limit = showAllFiles ? total : Math.min(8, total);

    for (let idx = 0; idx < limit; idx++) {
      const f = currentFiles[idx];
      const tr = document.createElement("tr");

      const tdIdx = document.createElement("td");
      tdIdx.textContent = idx + 1;

      const tdName = document.createElement("td");
      tdName.textContent = f.name;

      const tdAssigned = document.createElement("td");
      if (f.assignedPage != null && f.assignedSlot != null) {
        tdAssigned.textContent = `Page ${f.assignedPage + 1}, Slot ${
          f.assignedSlot + 1
        }`;
      } else {
        tdAssigned.textContent = "미배정";
      }

      const tdDel = document.createElement("td");
      const btn = document.createElement("button");
      btn.textContent = "삭제";
      btn.className = "btn-secondary small";
      btn.addEventListener("click", () => removeFileAt(idx));
      tdDel.appendChild(btn);

      tr.appendChild(tdIdx);
      tr.appendChild(tdName);
      tr.appendChild(tdAssigned);
      tr.appendChild(tdDel);

      filesTableBody.appendChild(tr);
    }

    if (toggleFilesViewBtn) {
      if (total > 8) {
        toggleFilesViewBtn.style.display = "inline-flex";
        toggleFilesViewBtn.textContent = showAllFiles
          ? "목록 접기"
          : `전체 목록 보기 (${total}개)`;
      } else {
        toggleFilesViewBtn.style.display = "none";
        showAllFiles = false;
      }
    }
  }

  function removeFileAt(index) {
    if (index < 0 || index >= currentFiles.length) return;

    currentFiles.splice(index, 1);
    recalcAssignmentsAfterFileRemoval(index);

    updateFilesInfo();
    renderFilesTable();
    renderPageBoards();
    updateGenerateButtonState();
  }

  if (toggleFilesViewBtn) {
    toggleFilesViewBtn.addEventListener("click", () => {
      showAllFiles = !showAllFiles;
      renderFilesTable();
    });
  }

  clearAllBtn.addEventListener("click", () => {
    if (!confirm("모든 업로드 파일과 배치를 삭제할까요?")) return;

    currentFiles = [];
    pages = [];
    pageStripStartIndex = 0;
    selectedFileIndex = null;
    selectedSlotEl = null;
    resetSlotOffsets();
    updateFilesInfo();
    renderFilesTable();
    renderPageBoards();
    renderOffsetInputs();
    clearPreview();
    msg.innerHTML = `<div class="info">모든 파일과 배치가 초기화되었습니다.</div>`;
    updateGenerateButtonState();
  });

  // -----------------------------
  //  페이지 보드
  // -----------------------------
  function renderPageBoards() {
    pageStrip.innerHTML = "";

    if (!currentLayout) {
      pageStripRange.textContent = "0–0 / 0";
      return;
    }
    if (pages.length === 0) {
      pages.push({
        slots: Array(currentLayout.slotsPerPage).fill(null)
      });
    }

    const totalPages = pages.length;
    const start = pageStripStartIndex;
    const end = Math.min(start + PAGES_PER_VIEW, totalPages);
    pageStripRange.textContent = `${start + 1}–${end} / ${totalPages}`;

    for (let p = start; p < end; p++) {
      const page = pages[p];
      const board = document.createElement("div");
      board.className = "page-board";

      const title = document.createElement("div");
      title.style.fontSize = "14px";
      title.style.fontWeight = "600";
      title.style.marginBottom = "6px";
      title.textContent = `Page ${p + 1}`;
      board.appendChild(title);

      const grid = document.createElement("div");
      grid.className = "slot-grid";
      grid.style.gridTemplateColumns = `repeat(${currentLayout.cols}, 1fr)`;

      for (let s = 0; s < currentLayout.slotsPerPage; s++) {
        const slotEl = document.createElement("div");
        slotEl.className = "slot";
        slotEl.dataset.pageIndex = String(p);
        slotEl.dataset.slotIndex = String(s);
        slotEl.draggable = true;

        const fileIndex = page.slots[s];
        if (fileIndex !== null && currentFiles[fileIndex]) {
          const f = currentFiles[fileIndex];
          const originalName = f.baseName;
          
          // Create separate elements for filename and page
          const nameSpan = document.createElement("span");
          nameSpan.className = "slot-filename";
          nameSpan.textContent = originalName;
          
          const pageSpan = document.createElement("span");
          pageSpan.className = "slot-page";
          pageSpan.textContent = `(p.${f.pageNumber + 1})`;
          
          slotEl.appendChild(nameSpan);
          slotEl.appendChild(pageSpan);
          
          slotEl.title = f.name; // Tooltip for full name
        } else {
          slotEl.textContent = `빈 슬롯 ${s + 1}`;
        }

        if (
          selectedSlotEl &&
          Number(selectedSlotEl.dataset.pageIndex) === p &&
          Number(selectedSlotEl.dataset.slotIndex) === s
        ) {
          slotEl.classList.add("selected");
          selectedSlotEl = slotEl;
        }

        slotEl.addEventListener("click", () => {
          handleSlotClick(p, s, slotEl);
        });

        slotEl.addEventListener("dragstart", (e) =>
          handleSlotDragStart(e, p, s)
        );
        slotEl.addEventListener("dragover", (e) => {
          e.preventDefault();
        });
        slotEl.addEventListener("drop", (e) => handleSlotDrop(e, p, s));

        grid.appendChild(slotEl);
      }

      board.appendChild(grid);
      pageStrip.appendChild(board);
    }
  }

  function handleSlotClick(pageIndex, slotIndex, slotEl) {
    const fileIdx = pages[pageIndex].slots[slotIndex];

    if (fileIdx !== null) {
      selectedFileIndex = fileIdx;
      if (selectedSlotEl) selectedSlotEl.classList.remove("selected");
      slotEl.classList.add("selected");
      selectedSlotEl = slotEl;

      selectedFileInfo.textContent = `선택된 파일: ${
        currentFiles[fileIdx].name
      } (Page ${pageIndex + 1}, Slot ${slotIndex + 1})`;
      return;
    }

    if (selectedFileIndex == null) return;

    let fromPage = null;
    let fromSlot = null;
    for (let p = 0; p < pages.length; p++) {
      const idx = pages[p].slots.indexOf(selectedFileIndex);
      if (idx !== -1) {
        fromPage = p;
        fromSlot = idx;
        break;
      }
    }
    if (fromPage == null) return;

    if (pages[pageIndex].slots[slotIndex] !== null) {
      return;
    }

    pages[fromPage].slots[fromSlot] = null;
    pages[pageIndex].slots[slotIndex] = selectedFileIndex;

    currentFiles[selectedFileIndex].assignedPage = pageIndex;
    currentFiles[selectedFileIndex].assignedSlot = slotIndex;

    renderPageBoards();
    renderFilesTable();
  }

  let dragSource = null;

  function handleSlotDragStart(e, pageIndex, slotIndex) {
    const fileIdx = pages[pageIndex].slots[slotIndex];
    if (fileIdx === null) {
      e.preventDefault();
      return;
    }
    dragSource = { pageIndex, slotIndex };
  }

  function handleSlotDrop(e, targetPage, targetSlot) {
    e.preventDefault();
    if (!dragSource) return;

    const { pageIndex: fromPage, slotIndex: fromSlot } = dragSource;
    const fromFileIdx = pages[fromPage].slots[fromSlot];
    const toFileIdx = pages[targetPage].slots[targetSlot];

    if (fromPage === targetPage && fromSlot === targetSlot) {
      dragSource = null;
      return;
    }

    pages[fromPage].slots[fromSlot] = toFileIdx;
    pages[targetPage].slots[targetSlot] = fromFileIdx;

    if (fromFileIdx !== null) {
      currentFiles[fromFileIdx].assignedPage = targetPage;
      currentFiles[fromFileIdx].assignedSlot = targetSlot;
    }
    if (toFileIdx !== null) {
      currentFiles[toFileIdx].assignedPage = fromPage;
      currentFiles[toFileIdx].assignedSlot = fromSlot;
    }

    dragSource = null;
    renderPageBoards();
    renderFilesTable();
  }

  addPageBtn.addEventListener("click", () => {
    if (!currentLayout) {
      alert("먼저 라벨 레이아웃을 선택해주세요.");
      return;
    }
    pages.push({
      slots: Array(currentLayout.slotsPerPage).fill(null)
    });

    if (pages.length > PAGES_PER_VIEW) {
      pageStripStartIndex = pages.length - PAGES_PER_VIEW;
      if (pageStripStartIndex < 0) pageStripStartIndex = 0;
    }
    renderPageBoards();
  });

  pageStripPrev.addEventListener("click", () => {
    if (pageStripStartIndex <= 0) return;
    pageStripStartIndex = Math.max(0, pageStripStartIndex - PAGES_PER_VIEW);
    renderPageBoards();
  });

  pageStripNext.addEventListener("click", () => {
    if (pageStripStartIndex + PAGES_PER_VIEW >= pages.length) return;
    pageStripStartIndex = Math.min(
      pages.length - 1,
      pageStripStartIndex + PAGES_PER_VIEW
    );
    renderPageBoards();
  });

  // -----------------------------
  //  오프셋 UI
  // -----------------------------
  function renderOffsetInputs() {
    slotOffsetContainer.innerHTML = "";
    if (!currentLayout) return;

    if (slotOffsets.length !== currentLayout.slotsPerPage) {
      resetSlotOffsets();
    }

    for (let i = 0; i < currentLayout.slotsPerPage; i++) {
      const item = document.createElement("div");
      item.className = "slot-offset-item";

      const title = document.createElement("div");
      title.className = "slot-offset-title";
      title.textContent = `칸 ${i + 1}`;
      item.appendChild(title);

      const fields = document.createElement("div");
      fields.className = "slot-offset-fields";

      const labelX = document.createElement("label");
      labelX.textContent = "X ";
      const inputX = document.createElement("input");
      inputX.type = "number";
      inputX.step = "0.1";
      inputX.value = slotOffsets[i].x;
      labelX.appendChild(inputX);
      fields.appendChild(labelX);

      const labelY = document.createElement("label");
      labelY.textContent = " Y ";
      const inputY = document.createElement("input");
      inputY.type = "number";
      inputY.step = "0.1";
      inputY.value = slotOffsets[i].y;
      labelY.appendChild(inputY);
      fields.appendChild(labelY);

      const labelS = document.createElement("label");
      labelS.textContent = " 축소% ";
      const inputS = document.createElement("input");
      inputS.type = "number";
      inputS.step = "1";
      inputS.value = slotOffsets[i].scale;
      labelS.appendChild(inputS);
      fields.appendChild(labelS);

      inputX.addEventListener("input", () => {
        slotOffsets[i].x = parseFloat(inputX.value || "0");
      });
      inputY.addEventListener("input", () => {
        slotOffsets[i].y = parseFloat(inputY.value || "0");
      });
      inputS.addEventListener("input", () => {
        slotOffsets[i].scale = parseFloat(inputS.value || "100");
      });

      item.appendChild(fields);
      slotOffsetContainer.appendChild(item);
    }
  }

  applyBulkOffsetBtn.addEventListener("click", () => {
    if (!currentLayout) return;
    const bx = parseFloat(bulkOffsetXInput.value || "0");
    const by = parseFloat(bulkOffsetYInput.value || "0");
    const bs = parseFloat(bulkScaleInput.value || "100");

    for (let i = 0; i < slotOffsets.length; i++) {
      slotOffsets[i].x = bx;
      slotOffsets[i].y = by;
      slotOffsets[i].scale = bs;
    }
    renderOffsetInputs();
  });

  presetTracxBtn.addEventListener("click", () => {
    sheetOffsetXInput.value = "0";
    sheetOffsetYInput.value = "0";
    bulkOffsetXInput.value = "3";
    bulkOffsetYInput.value = "-3";
    bulkScaleInput.value = "100";
    applyBulkOffsetBtn.click();
    setCurrentPreset("tracx");
    msg.innerHTML =
      '<div class="info">트랙스로지스 프리셋이 적용되었습니다. (X:3, Y:-3, 축소:100%)</div>';
  });

  presetShopeeBtn.addEventListener("click", () => {
    sheetOffsetXInput.value = "0";
    sheetOffsetYInput.value = "0";
    bulkOffsetXInput.value = "5";
    bulkOffsetYInput.value = "-2";
    bulkScaleInput.value = "90";
    applyBulkOffsetBtn.click();
    setCurrentPreset("shopee");
    msg.innerHTML =
      '<div class="info">쇼피 SLS 프리셋이 적용되었습니다. (X:5, Y:-2, 축소:90%)</div>';
  });

  if (toggleOffsetDetailsBtn) {
    toggleOffsetDetailsBtn.addEventListener("click", () => {
      offsetDetailsOpen = !offsetDetailsOpen;
      updateOffsetAccordionUI();
    });
  }

  // -----------------------------
  //  PDF 생성
  // -----------------------------
  generateBtn.addEventListener("click", async () => {
    if (!currentLayout) {
      alert("먼저 레이아웃을 선택해주세요.");
      return;
    }
    if (currentFiles.length === 0) {
      alert("PDF 파일을 먼저 업로드해주세요.");
      return;
    }

    generateBtn.disabled = true;
    generateBtn.textContent = "생성 중...";
    msg.innerHTML = `<div class="info">PDF 생성 중입니다. 파일 개수 및 페이지 수에 따라 시간이 걸릴 수 있습니다...</div>`;
    clearPreview();

    try {
      const outDoc = await PDFDocument.create();

      const totalPages = pages.length;
      const sheetOffsetXmm = parseFloat(sheetOffsetXInput.value || "0");
      const sheetOffsetYmm = parseFloat(sheetOffsetYInput.value || "0");
      const showGuide = !!showGuideInput.checked;

      const sheetOffsetXPt = sheetOffsetXmm * MM_TO_PT;
      const sheetOffsetYPt = sheetOffsetYmm * MM_TO_PT;

      const pageWidthPt = PAGE_WIDTH_MM * MM_TO_PT;
      const pageHeightPt = PAGE_HEIGHT_MM * MM_TO_PT;

      for (let p = 0; p < totalPages; p++) {
        const sheet = pages[p];
        const hasAny = sheet.slots.some((idx) => idx !== null);
        if (!hasAny) continue;

        const page = outDoc.addPage([pageWidthPt, pageHeightPt]);

        // 1) PDF 내용 먼저
        for (let s = 0; s < currentLayout.slotsPerPage; s++) {
          const fileIndex = sheet.slots[s];
          if (fileIndex === null || !currentFiles[fileIndex]) continue;

          const vf = currentFiles[fileIndex];

          const srcDoc = await PDFDocument.load(vf.pdfBytes);
          const srcPage = srcDoc.getPage(vf.pageNumber);
          const embeddedPage = await outDoc.embedPage(srcPage);

          const rect = getLabelRect(s);
          const slotW = rect.wPt;
          const slotH = rect.hPt;

          const so = slotOffsets[s] || { x: 0, y: 0, scale: 100 };

          const slotBaseX =
            rect.xPt + sheetOffsetXPt + (so.x || 0) * MM_TO_PT;
          const slotBaseY =
            rect.yPt + sheetOffsetYPt + (so.y || 0) * MM_TO_PT;

          const pdfW = embeddedPage.width;
          const pdfH = embeddedPage.height;

          let finalScale;
          let renderW;
          let renderH;

          if (scaleMode === SCALE_MODES.ORIGINAL) {
            // 기본: 원래 크기 × 슬롯 축소%
            const userScaleFactor = (so.scale || 100) / 100;
            finalScale = userScaleFactor;

            // 안전 모드: 슬롯 폭/높이를 넘지 않도록 스케일 제한
            if (clipToSlot) {
              const maxScaleX = slotW / pdfW;
              const maxScaleY = slotH / pdfH;
              const maxContainScale = Math.min(maxScaleX, maxScaleY);
              finalScale = Math.min(finalScale, maxContainScale);
            }

            renderW = pdfW * finalScale;
            renderH = pdfH * finalScale;

            const finalX = slotBaseX;                      // 좌측 정렬
            const finalY = slotBaseY + (slotH - renderH);  // 상단 정렬

            // 슬롯 경계에서 클리핑 옵션
            if (clipAtBoundary) {
              // PDF 클리핑 경로 설정 (슬롯 영역만 표시)
              page.pushOperators(
                PDFLib.pushGraphicsState(),
                PDFLib.moveTo(slotBaseX, slotBaseY),
                PDFLib.lineTo(slotBaseX + slotW, slotBaseY),
                PDFLib.lineTo(slotBaseX + slotW, slotBaseY + slotH),
                PDFLib.lineTo(slotBaseX, slotBaseY + slotH),
                PDFLib.closePath(),
                PDFLib.clip(),
                PDFLib.endPath()
              );
            }

            page.drawPage(embeddedPage, {
              x: finalX,
              y: finalY,
              width: renderW,
              height: renderH
            });

            if (clipAtBoundary) {
              // 그래픽 상태 복원
              page.pushOperators(PDFLib.popGraphicsState());
            }

          } else if (scaleMode === SCALE_MODES.FIT_WIDTH) {
            // 기본: 라벨 가로폭에 맞게 비율 유지
            const baseScale = slotW / pdfW;
            const userScaleFactor = (so.scale || 100) / 100;
            finalScale = baseScale * userScaleFactor;

            // 안전 모드: 세로가 슬롯 높이를 넘지 않도록 제한
            if (clipToSlot) {
              const maxScaleY = slotH / pdfH;
              finalScale = Math.min(finalScale, maxScaleY);
            }

            renderW = pdfW * finalScale;
            renderH = pdfH * finalScale;

            const finalX = slotBaseX;                      // 좌측 정렬
            const finalY = slotBaseY + (slotH - renderH);  // 상단 정렬

            // 슬롯 경계에서 클리핑 옵션
            if (clipAtBoundary) {
              // PDF 클리핑 경로 설정 (슬롯 영역만 표시)
              page.pushOperators(
                PDFLib.pushGraphicsState(),
                PDFLib.moveTo(slotBaseX, slotBaseY),
                PDFLib.lineTo(slotBaseX + slotW, slotBaseY),
                PDFLib.lineTo(slotBaseX + slotW, slotBaseY + slotH),
                PDFLib.lineTo(slotBaseX, slotBaseY + slotH),
                PDFLib.closePath(),
                PDFLib.clip(),
                PDFLib.endPath()
              );
            }

            page.drawPage(embeddedPage, {
              x: finalX,
              y: finalY,
              width: renderW,
              height: renderH
            });

            if (clipAtBoundary) {
              // 그래픽 상태 복원
              page.pushOperators(PDFLib.popGraphicsState());
            }
          }
        }

        // 2) 가이드는 마지막에, 레이아웃 기준(오프셋 영향 X)으로 그림
        if (showGuide) {
          drawLabelGuides(page);
        }
      }

      const pdfBytes = await outDoc.save();
      const blob = new Blob([pdfBytes], { type: "application/pdf" });
      previewUrl = URL.createObjectURL(blob);
      pdfPreview.src = previewUrl;

      downloadLink.href = previewUrl;
      downloadLink.style.display = "inline-flex";

      msg.innerHTML = `<div class="success">PDF 생성 및 미리보기가 준비되었습니다.</div>`;
    } catch (e) {
      console.error(e);
      msg.innerHTML = `<div class="error">PDF 생성 중 오류: ${e.message}</div>`;
    } finally {
      generateBtn.disabled = currentFiles.length === 0;
      generateBtn.textContent = "PDF 생성";
    }
  });

  // -----------------------------
  //  라벨 슬롯 좌표 계산
  // -----------------------------
  function getLabelRect(slotIndex) {
    const cols = currentLayout.cols;
    const wmm = currentLayout.labelWmm;
    const hmm = currentLayout.labelHmm;

    const row = Math.floor(slotIndex / cols);
    const col = slotIndex % cols;

    const xmm = MARGIN_L_MM + col * (wmm + GAP_H_MM);
    const ymmFromTop = MARGIN_T_MM + row * (hmm + GAP_V_MM);
    const ymmBottom = PAGE_HEIGHT_MM - ymmFromTop - hmm;

    const xPt = xmm * MM_TO_PT;
    const yPt = ymmBottom * MM_TO_PT;
    const wPt = wmm * MM_TO_PT;
    const hPt = hmm * MM_TO_PT;

    return { xPt, yPt, wPt, hPt };
  }

  // -----------------------------
  //  가이드(레이블 테두리)
  // -----------------------------
  function drawLabelGuides(page) {
    for (let s = 0; s < currentLayout.slotsPerPage; s++) {
      const rect = getLabelRect(s);
      const x = rect.xPt;
      const y = rect.yPt;
      const w = rect.wPt;
      const h = rect.hPt;

      page.drawRectangle({
        x,
        y,
        width: w,
        height: h,
        borderColor: rgb(0.7, 0.7, 0.7),
        borderWidth: 0.7,
        color: rgb(1, 1, 1),
        opacity: 0
      });
    }
  }

  // -----------------------------
  //  Card Accordion Toggle
  // -----------------------------
  const cardToggleBtns = document.querySelectorAll(".card-toggle-btn");
  
  cardToggleBtns.forEach(btn => {
    const targetId = btn.dataset.target;
    const card = document.getElementById(targetId);
    if (!card) return;
    
    const cardBody = card.querySelector(".card-body");
    if (!cardBody) return;
    
    // Don't set initial max-height - let it be natural
    
    btn.addEventListener("click", () => {
      const isCollapsed = btn.classList.contains("collapsed");
      
      if (isCollapsed) {
        // Expand: recalculate scrollHeight for dynamic content
        cardBody.classList.remove("collapsed");
        cardBody.style.maxHeight = cardBody.scrollHeight + "px";
        btn.classList.remove("collapsed");
        
        // After transition, remove max-height to allow natural growth
        setTimeout(() => {
          if (!btn.classList.contains("collapsed")) {
            cardBody.style.maxHeight = "none";
          }
        }, 300);
      } else {
        // Collapse: set explicit height first, then animate to 0
        cardBody.style.maxHeight = cardBody.scrollHeight + "px";
        // Force reflow
        cardBody.offsetHeight;
        cardBody.style.maxHeight = "0";
        cardBody.classList.add("collapsed");
        btn.classList.add("collapsed");
      }
    });
  });

  // -----------------------------
  //  HELP 모달
  // -----------------------------
  helpBtn.addEventListener("click", () => {
    helpModal.classList.remove("hidden");
  });
  helpCloseBtn.addEventListener("click", () => {
    helpModal.classList.add("hidden");
  });
});
