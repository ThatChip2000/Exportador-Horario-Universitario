(() => {
  const STORAGE_KEY = "horario_st_data_v1";
  const PREFS_KEY = "horario_st_prefs_v1";
  const DAY_NAMES = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  const BLOCK_HEIGHT = 56; // px per 40-min academic block

  let state = {
    schedule: null,
    prefs: {
      theme: "dark",
      mergeBlocks: true,
      showSaturday: false,
      highlightNow: true
    }
  };

  // DOM refs
  const el = {
    emptyState: document.getElementById("empty-state"),
    toolbar: document.getElementById("schedule-toolbar"),
    workspace: document.getElementById("schedule-workspace"),
    grid: document.getElementById("schedule-grid"),
    coursesList: document.getElementById("courses-list"),
    tbaSection: document.getElementById("tba-section"),
    tbaList: document.getElementById("tba-list"),
    termBadge: document.getElementById("term-badge"),
    statsBadge: document.getElementById("stats-badge"),
    printTitle: document.getElementById("print-title"),
    printSubtitle: document.getElementById("print-subtitle"),

    chkMerge: document.getElementById("chk-merge-blocks"),
    chkSaturday: document.getElementById("chk-show-saturday"),
    chkNow: document.getElementById("chk-highlight-now"),
    btnTheme: document.getElementById("btn-toggle-theme"),

    modalImport: document.getElementById("modal-import"),
    modalCourse: document.getElementById("modal-course"),
    modalIcs: document.getElementById("modal-ics"),
    importFeedback: document.getElementById("import-feedback"),

    dropZone: document.getElementById("drop-zone"),
    fileInput: document.getElementById("file-input"),
    pasteTextarea: document.getElementById("paste-textarea"),
    bookmarkletLink: document.getElementById("bookmarklet-link"),
    bookmarkletCode: document.getElementById("bookmarklet-code"),

    icsStart: document.getElementById("ics-start-date"),
    icsEnd: document.getElementById("ics-end-date"),

    detailTitle: document.getElementById("detail-title"),
    detailBody: document.getElementById("detail-body")
  };

  function formatMin(m) {
    const hh = String(Math.floor(m / 60)).padStart(2, "0");
    const mm = String(m % 60).padStart(2, "0");
    return `${hh}:${mm}`;
  }

  function loadStorage() {
    try {
      const savedPrefs = JSON.parse(localStorage.getItem(PREFS_KEY) || "null");
      if (savedPrefs) state.prefs = { ...state.prefs, ...savedPrefs };
    } catch (_) {}

    try {
      const savedSched = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (savedSched && Array.isArray(savedSched.courses)) {
        state.schedule = BannerParser.repairStoredSchedule(savedSched);
        saveSchedule();
      }
    } catch (_) {}
  }

  function saveSchedule() {
    if (state.schedule) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.schedule));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  function savePrefs() {
    localStorage.setItem(PREFS_KEY, JSON.stringify(state.prefs));
  }

  function applyTheme() {
    document.documentElement.setAttribute("data-theme", state.prefs.theme);
    el.btnTheme.textContent = state.prefs.theme === "dark" ? "🌙" : "☀️";
  }

  /**
   * Build flattened list of meeting blocks, optionally merging consecutive blocks
   */
  function getProcessedBlocks() {
    if (!state.schedule) return [];
    const raw = [];
    for (const course of state.schedule.courses) {
      for (const m of course.meetings || []) {
        raw.push({
          courseId: course.id,
          courseTitle: course.title,
          courseCode: course.code,
          courseSection: course.section,
          nrc: course.nrc,
          credits: course.credits,
          campus: course.campus,
          color: course.color,
          day: m.day,
          startMin: m.startMin,
          endMin: m.endMin,
          room: BannerParser.cleanRoom(m.room),
          type: m.type,
          instructor: m.instructor || course.instructor || "",
          startDate: m.startDate,
          endDate: m.endDate
        });
      }
    }

    raw.sort((a, b) => a.day - b.day || a.startMin - b.startMin);

    if (!state.prefs.mergeBlocks) return raw;

    const merged = [];
    for (const blk of raw) {
      const prev = merged.find(
        (p) =>
          p.day === blk.day &&
          p.courseId === blk.courseId &&
          p.room === blk.room &&
          p.type === blk.type &&
          blk.startMin - p.endMin >= 0 &&
          blk.startMin - p.endMin <= 15
      );
      if (prev) {
        prev.endMin = Math.max(prev.endMin, blk.endMin);
      } else {
        merged.push({ ...blk });
      }
    }
    return merged;
  }

  /**
   * Determine visible University Academic Blocks for the grid
   */
  function getVisibleUniversityBlocks(blocks, showSaturday) {
    const allBlocks = BannerParser.UNIVERSITY_BLOCKS;
    const activeDayBlocks = blocks.filter((b) => showSaturday || b.day < 5);

    let minMin = 495; // Default start: Bloque 1 (08:15)
    let maxMin = 1115; // Default end: Bloque 14 (18:35)

    for (const b of activeDayBlocks) {
      if (b.startMin < minMin) minMin = b.startMin;
      if (b.endMin > maxMin) maxMin = b.endMin;
    }

    return allBlocks.filter((ub) => {
      if (ub.optional && minMin > ub.startMin) return false;
      return ub.endMin >= minMin && ub.startMin <= maxMin;
    });
  }

  /**
   * Map a minute timestamp (e.g. 585 = 09:45) to Y pixel offset in the block grid
   */
  function mapMinToY(min, visibleBlocks, blockHeight) {
    if (!visibleBlocks.length) return 0;
    if (min <= visibleBlocks[0].startMin) return 0;

    for (let i = 0; i < visibleBlocks.length; i++) {
      const ub = visibleBlocks[i];
      if (min >= ub.startMin && min <= ub.endMin) {
        const ratio = (min - ub.startMin) / Math.max(1, ub.endMin - ub.startMin);
        return (i + ratio) * blockHeight;
      }
      if (i < visibleBlocks.length - 1) {
        const nextUb = visibleBlocks[i + 1];
        if (min > ub.endMin && min < nextUb.startMin) {
          return (i + 1) * blockHeight;
        }
      }
    }
    return visibleBlocks.length * blockHeight;
  }

  /**
   * Assign columns for overlapping blocks within the same day
   */
  function layoutDayBlocks(dayBlocks) {
    const sorted = [...dayBlocks].sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);
    const groups = [];
    let currentGroup = [];
    let groupEnd = -1;

    for (const b of sorted) {
      if (b.startMin >= groupEnd) {
        if (currentGroup.length) groups.push(currentGroup);
        currentGroup = [b];
        groupEnd = b.endMin;
      } else {
        currentGroup.push(b);
        groupEnd = Math.max(groupEnd, b.endMin);
      }
    }
    if (currentGroup.length) groups.push(currentGroup);

    const positioned = [];
    for (const group of groups) {
      const cols = [];
      for (const b of group) {
        let placed = false;
        for (let c = 0; c < cols.length; c++) {
          if (cols[c][cols[c].length - 1].endMin <= b.startMin) {
            cols[c].push(b);
            b._col = c;
            placed = true;
            break;
          }
        }
        if (!placed) {
          b._col = cols.length;
          cols.push([b]);
        }
      }
      const totalCols = cols.length;
      for (const b of group) {
        b._totalCols = totalCols;
        positioned.push(b);
      }
    }
    return positioned;
  }

  function render() {
    applyTheme();
    el.chkMerge.checked = state.prefs.mergeBlocks;
    el.chkSaturday.checked = Boolean(state.prefs.showSaturday);
    el.chkNow.checked = state.prefs.highlightNow;

    if (!state.schedule || !state.schedule.courses.length) {
      el.emptyState.hidden = false;
      el.toolbar.hidden = true;
      el.workspace.hidden = true;
      return;
    }

    el.emptyState.hidden = true;
    el.toolbar.hidden = false;
    el.workspace.hidden = false;

    const blocks = getProcessedBlocks();
    const showSaturday = Boolean(state.prefs.showSaturday);
    const numDays = showSaturday ? 6 : 5;

    const laidOutByDay = Array.from({ length: numDays }, (_, d) =>
      layoutDayBlocks(blocks.filter((b) => b.day === d))
    );
    const hasOverlaps = laidOutByDay.some((dayArr) => dayArr.some((b) => b._totalCols > 1));

    const visibleBlocks = getVisibleUniversityBlocks(blocks, showSaturday);
    const totalHeight = visibleBlocks.length * BLOCK_HEIGHT;

    // Badges & Print headers
    if (state.schedule.term) {
      el.termBadge.textContent = state.schedule.term;
      el.termBadge.hidden = false;
      el.printSubtitle.textContent = state.schedule.term;
    } else {
      el.termBadge.hidden = true;
      el.printSubtitle.textContent = "";
    }
    el.statsBadge.textContent =
      `${state.schedule.courses.length} ramos · ${blocks.length} bloques` +
      (hasOverlaps ? " · ⚠️ Con topones" : "");

    // Build Grid
    el.grid.style.gridTemplateColumns = `96px repeat(${numDays}, minmax(135px, 1fr))`;
    el.grid.innerHTML = "";

    const now = new Date();
    const todayIdx = (now.getDay() + 6) % 7; // 0=Mon..6=Sun
    const nowMin = now.getHours() * 60 + now.getMinutes();

    // Header row
    const corner = document.createElement("div");
    corner.className = "grid-header-cell";
    corner.textContent = "Bloque";
    el.grid.appendChild(corner);

    for (let d = 0; d < numDays; d++) {
      const hCell = document.createElement("div");
      hCell.className = "grid-header-cell" + (state.prefs.highlightNow && d === todayIdx ? " today" : "");
      hCell.textContent = DAY_NAMES[d];
      el.grid.appendChild(hCell);
    }

    // Left Column: University Block labels
    const timeCol = document.createElement("div");
    timeCol.className = "grid-time-col";
    timeCol.style.height = `${totalHeight}px`;

    visibleBlocks.forEach((ub, idx) => {
      const slot = document.createElement("div");
      slot.className = "block-label-slot" + (ub.breakAfter ? " break-after" : "");
      slot.style.top = `${idx * BLOCK_HEIGHT}px`;
      slot.style.height = `${BLOCK_HEIGHT}px`;
      slot.innerHTML = `
        <span class="block-label-num">${escapeHtml(ub.label)}</span>
        <span class="block-label-time">${ub.startText} - ${ub.endText}</span>
      `;
      timeCol.appendChild(slot);
    });
    el.grid.appendChild(timeCol);

    // Day columns
    const firstMin = visibleBlocks.length ? visibleBlocks[0].startMin : 480;
    const lastMin = visibleBlocks.length ? visibleBlocks[visibleBlocks.length - 1].endMin : 1200;

    for (let d = 0; d < numDays; d++) {
      const col = document.createElement("div");
      col.className = "day-column";
      col.style.height = `${totalHeight}px`;

      // Block row lines
      visibleBlocks.forEach((ub, idx) => {
        if (idx > 0) {
          const prevUb = visibleBlocks[idx - 1];
          const line = document.createElement("div");
          line.className = "hour-line" + (prevUb.breakAfter ? " major" : "");
          line.style.top = `${idx * BLOCK_HEIGHT}px`;
          col.appendChild(line);
        }
      });

      // Now indicator
      if (state.prefs.highlightNow && d === todayIdx && nowMin >= firstMin && nowMin <= lastMin) {
        const nowLine = document.createElement("div");
        nowLine.className = "now-indicator";
        nowLine.style.top = `${mapMinToY(nowMin, visibleBlocks, BLOCK_HEIGHT)}px`;
        col.appendChild(nowLine);
      }

      // Class Blocks
      const dayBlocks = laidOutByDay[d];
      for (const blk of dayBlocks) {
        const yStart = mapMinToY(blk.startMin, visibleBlocks, BLOCK_HEIGHT);
        const yEnd = mapMinToY(blk.endMin, visibleBlocks, BLOCK_HEIGHT);
        const top = yStart + 2;
        const height = Math.max(30, yEnd - yStart - 4);
        const widthPct = 100 / blk._totalCols;
        const leftPct = blk._col * widthPct;

        const card = document.createElement("div");
        const isNow = state.prefs.highlightNow && d === todayIdx && nowMin >= blk.startMin && nowMin <= blk.endMin;
        card.className = "class-block" + (isNow ? " is-now" : "");
        card.dataset.courseId = blk.courseId;
        card.style.background = blk.color;
        card.style.top = `${top}px`;
        card.style.height = `${height}px`;
        card.style.left = `calc(${leftPct}% + 3px)`;
        card.style.width = `calc(${widthPct}% - 6px)`;

        card.innerHTML = `
          <div class="class-block-title">${escapeHtml(blk.courseTitle)}</div>
          <div class="class-block-meta">${formatMin(blk.startMin)} - ${formatMin(blk.endMin)}</div>
          ${blk.room ? `<div class="class-block-room">📍 ${escapeHtml(BannerParser.formatRoom(blk.room))}</div>` : ""}
          ${height >= 72 ? `<span class="class-block-badge">${escapeHtml(blk.type)}</span>` : ""}
        `;

        card.addEventListener("click", () => openCourseDetail(blk));
        col.appendChild(card);
      }

      el.grid.appendChild(col);
    }

    renderSidebar();
  }

  function renderSidebar() {
    el.coursesList.innerHTML = "";
    const tbaItems = [];

    for (const course of state.schedule.courses) {
      const item = document.createElement("div");
      item.className = "course-item";
      item.innerHTML = `
        <div class="color-picker-wrap" title="Cambiar color">
          <div class="color-dot" style="background: ${course.color}"></div>
          <input type="color" class="color-input-hidden" value="${course.color}" aria-label="Color de ${escapeHtml(course.title)}" />
        </div>
        <div class="course-item-info">
          <div class="course-item-title" title="${escapeHtml(course.title)}">${escapeHtml(course.title)}</div>
          <div class="course-item-sub">
            ${escapeHtml(course.code)}${course.section ? "-" + escapeHtml(course.section) : ""}
            ${course.nrc ? "· NRC " + escapeHtml(course.nrc) : ""}
          </div>
        </div>
      `;

      const colorInput = item.querySelector("input[type='color']");
      const colorDot = item.querySelector(".color-dot");
      colorInput.addEventListener("input", (e) => {
        course.color = e.target.value;
        colorDot.style.background = course.color;
        el.grid.querySelectorAll(".class-block").forEach((blockEl) => {
          if (blockEl.dataset.courseId === course.id) {
            blockEl.style.background = course.color;
          }
        });
        saveSchedule();
      });

      el.coursesList.appendChild(item);

      for (const tba of course.tbaMeetings || []) {
        tbaItems.push({ course, tba });
      }
    }

    if (tbaItems.length) {
      el.tbaSection.hidden = false;
      el.tbaList.innerHTML = tbaItems
        .map(
          ({ course, tba }) => `
        <div class="tba-item">
          <strong>${escapeHtml(course.title)}</strong><br />
          <span>${escapeHtml(tba.type)} · ${escapeHtml(tba.room)}</span>
        </div>`
        )
        .join("");
    } else {
      el.tbaSection.hidden = true;
    }
  }

  function parseTimeInput(str) {
    const [hh, mm] = (str || "").split(":").map(Number);
    if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
    return hh * 60 + mm;
  }

  function findCourseById(courseId) {
    if (!state.schedule || !Array.isArray(state.schedule.courses)) return null;
    return state.schedule.courses.find((c) => c.id === courseId) || null;
  }

  function deleteBlockFromSchedule(blk) {
    const course = findCourseById(blk.courseId);
    if (!course) return;
    course.meetings = (course.meetings || []).filter(
      (m) => !(m.day === blk.day && m.startMin >= blk.startMin && m.endMin <= blk.endMin)
    );
    if (!course.meetings.length && !(course.tbaMeetings || []).length) {
      state.schedule.courses = state.schedule.courses.filter((c) => c.id !== course.id);
    }
    saveSchedule();
    el.modalCourse.hidden = true;
    render();
  }

  function updateBlockInSchedule(blk, updated) {
    const course = findCourseById(blk.courseId);
    if (!course) return;

    course.title = updated.title;
    const oldMeetings = course.meetings || [];
    const matched = oldMeetings.filter(
      (m) => m.day === blk.day && m.startMin >= blk.startMin && m.endMin <= blk.endMin
    );
    const firstMatched = matched[0] || {};

    course.meetings = oldMeetings.filter(
      (m) => !(m.day === blk.day && m.startMin >= blk.startMin && m.endMin <= blk.endMin)
    );
    course.meetings.push({
      day: updated.day,
      startMin: updated.startMin,
      endMin: updated.endMin,
      room: BannerParser.cleanRoom(updated.room),
      type: updated.type || "Clase",
      instructor: updated.instructor,
      startDate: firstMatched.startDate || blk.startDate || null,
      endDate: firstMatched.endDate || blk.endDate || null
    });
    course.meetings.sort((a, b) => a.day - b.day || a.startMin - b.startMin);

    saveSchedule();
    el.modalCourse.hidden = true;
    render();
  }

  function openCourseDetail(blk) {
    const renderViewMode = () => {
      el.detailTitle.textContent = blk.courseTitle;
      el.detailBody.innerHTML = `
        <div class="detail-list">
          <div class="detail-row"><span class="detail-label">Código / Sección</span><span>${escapeHtml(blk.courseCode || "-")}${blk.courseSection ? "-" + escapeHtml(blk.courseSection) : ""}</span></div>
          <div class="detail-row"><span class="detail-label">NRC</span><span>${escapeHtml(blk.nrc || "-")}</span></div>
          <div class="detail-row"><span class="detail-label">Horario</span><span>${DAY_NAMES[blk.day]} · ${formatMin(blk.startMin)} - ${formatMin(blk.endMin)}</span></div>
          <div class="detail-row"><span class="detail-label">Tipo</span><span>${escapeHtml(blk.type || "-")}</span></div>
          <div class="detail-row"><span class="detail-label">Sala / Ubicación</span><span>${escapeHtml(BannerParser.formatRoom(blk.room, true) || "-")}</span></div>
          <div class="detail-row"><span class="detail-label">Profesor</span><span>${escapeHtml(blk.instructor || "Por asignar")}</span></div>
          <div class="detail-row"><span class="detail-label">Campus</span><span>${escapeHtml(blk.campus || "-")}</span></div>
          <div class="detail-row"><span class="detail-label">Créditos</span><span>${escapeHtml(blk.credits || "-")}</span></div>
        </div>
        <div class="detail-actions">
          <button type="button" id="btn-detail-delete" class="btn btn-danger-ghost">🗑️ Eliminar bloque</button>
          <button type="button" id="btn-detail-edit" class="btn btn-secondary">✏️ Editar</button>
        </div>
        <div id="detail-delete-confirm" class="confirm-box confirm-danger" hidden>
          <p>¿Eliminar este bloque de <strong>${DAY_NAMES[blk.day]} ${formatMin(blk.startMin)} - ${formatMin(blk.endMin)}</strong>?</p>
          <div class="confirm-actions">
            <button type="button" id="btn-confirm-delete-no" class="btn btn-secondary btn-sm">Cancelar</button>
            <button type="button" id="btn-confirm-delete-yes" class="btn btn-danger btn-sm">Sí, eliminar</button>
          </div>
        </div>
      `;

      const confirmBox = document.getElementById("detail-delete-confirm");
      document.getElementById("btn-detail-delete").addEventListener("click", () => {
        confirmBox.hidden = false;
      });
      document.getElementById("btn-confirm-delete-no").addEventListener("click", () => {
        confirmBox.hidden = true;
      });
      document.getElementById("btn-confirm-delete-yes").addEventListener("click", () => {
        deleteBlockFromSchedule(blk);
      });
      document.getElementById("btn-detail-edit").addEventListener("click", renderEditMode);
    };

    const renderEditMode = () => {
      el.detailTitle.textContent = `Editar · ${blk.courseTitle}`;
      const dayOptions = DAY_NAMES.map(
        (name, idx) => `<option value="${idx}" ${idx === blk.day ? "selected" : ""}>${name}</option>`
      ).join("");

      el.detailBody.innerHTML = `
        <form id="edit-block-form" class="edit-form">
          <label>
            <span>Nombre del ramo</span>
            <input type="text" id="edit-title" value="${escapeHtml(blk.courseTitle)}" required />
          </label>
          <div class="form-grid">
            <label>
              <span>Día</span>
              <select id="edit-day">${dayOptions}</select>
            </label>
            <label>
              <span>Tipo</span>
              <input type="text" id="edit-type" list="type-suggestions" value="${escapeHtml(blk.type || "Clase")}" />
              <datalist id="type-suggestions">
                <option value="Cátedra"></option>
                <option value="Práctico"></option>
                <option value="Laboratorio"></option>
                <option value="Taller"></option>
                <option value="Ayudantía"></option>
              </datalist>
            </label>
          </div>
          <div class="form-grid">
            <label>
              <span>Hora inicio</span>
              <input type="time" id="edit-start" value="${formatMin(blk.startMin)}" required />
            </label>
            <label>
              <span>Hora término</span>
              <input type="time" id="edit-end" value="${formatMin(blk.endMin)}" required />
            </label>
          </div>
          <label>
            <span>Sala / Ubicación</span>
            <input type="text" id="edit-room" value="${escapeHtml(blk.room || "")}" placeholder="Ej: S-11-P05-A o Sala 11 · Piso 5" />
          </label>
          <label>
            <span>Profesor</span>
            <input type="text" id="edit-instructor" value="${escapeHtml(blk.instructor || "")}" placeholder="Por asignar" />
          </label>
          <div id="edit-error" class="feedback error" hidden></div>
          <div id="edit-actions" class="detail-actions">
            <button type="button" id="btn-edit-cancel" class="btn btn-secondary">Cancelar</button>
            <button type="submit" class="btn btn-primary">💾 Guardar cambios</button>
          </div>
          <div id="edit-save-confirm" class="confirm-box" hidden>
            <p>¿Confirmas guardar los cambios en esta clase?</p>
            <div class="confirm-actions">
              <button type="button" id="btn-confirm-save-no" class="btn btn-secondary btn-sm">Volver</button>
              <button type="button" id="btn-confirm-save-yes" class="btn btn-primary btn-sm">Sí, guardar</button>
            </div>
          </div>
        </form>
      `;

      const form = document.getElementById("edit-block-form");
      const errBox = document.getElementById("edit-error");
      const saveConfirm = document.getElementById("edit-save-confirm");
      const editActions = document.getElementById("edit-actions");
      let pendingUpdate = null;

      document.getElementById("btn-edit-cancel").addEventListener("click", renderViewMode);

      form.addEventListener("submit", (e) => {
        e.preventDefault();
        errBox.hidden = true;

        const title = document.getElementById("edit-title").value.trim();
        const day = parseInt(document.getElementById("edit-day").value, 10);
        const startMin = parseTimeInput(document.getElementById("edit-start").value);
        const endMin = parseTimeInput(document.getElementById("edit-end").value);
        const type = document.getElementById("edit-type").value.trim() || "Clase";
        const room = document.getElementById("edit-room").value.trim();
        const instructor = document.getElementById("edit-instructor").value.trim();

        if (!title) {
          errBox.textContent = "El nombre del ramo no puede estar vacío.";
          errBox.hidden = false;
          return;
        }
        if (startMin === null || endMin === null || endMin <= startMin) {
          errBox.textContent = "La hora de término debe ser mayor a la hora de inicio.";
          errBox.hidden = false;
          return;
        }

        pendingUpdate = { title, day, startMin, endMin, type, room, instructor };
        editActions.hidden = true;
        saveConfirm.hidden = false;
      });

      document.getElementById("btn-confirm-save-no").addEventListener("click", () => {
        saveConfirm.hidden = true;
        editActions.hidden = false;
        pendingUpdate = null;
      });

      document.getElementById("btn-confirm-save-yes").addEventListener("click", () => {
        if (pendingUpdate) {
          updateBlockInSchedule(blk, pendingUpdate);
        }
      });
    };

    renderViewMode();
    el.modalCourse.hidden = false;
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function showFeedback(msg, isError = false) {
    el.importFeedback.hidden = false;
    el.importFeedback.className = "feedback " + (isError ? "error" : "success");
    el.importFeedback.textContent = msg;
  }

  function clearFeedback() {
    el.importFeedback.hidden = true;
    el.importFeedback.textContent = "";
  }

  function applyParsedSchedule(incomingSchedule) {
    state.schedule = BannerParser.mergeSchedules(state.schedule, incomingSchedule);
    saveSchedule();
    el.modalImport.hidden = true;
    clearFeedback();
    render();
  }

  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error(`No se pudo leer el archivo ${file.name}`));
      reader.readAsText(file, "UTF-8");
    });
  }

  async function handleHtmlFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;

    try {
      let combined = state.schedule;
      let parsedCount = 0;
      for (const file of files) {
        const text = await readFileAsText(file);
        const parsed = BannerParser.parseHTML(text);
        combined = BannerParser.mergeSchedules(combined, parsed);
        parsedCount++;
      }
      state.schedule = combined;
      saveSchedule();
      el.fileInput.value = "";
      el.modalImport.hidden = true;
      clearFeedback();
      render();
    } catch (err) {
      showFeedback(err.message, true);
    }
  }

  function initBookmarkletUI() {
    const code = BannerParser.buildBookmarklet(window.location.href);
    el.bookmarkletLink.href = code;
    el.bookmarkletCode.value = code;
  }

  function bindEvents() {
    // Open Import Modal
    document.getElementById("btn-open-import").addEventListener("click", () => {
      clearFeedback();
      initBookmarkletUI();
      el.modalImport.hidden = false;
    });
    document.getElementById("btn-empty-import").addEventListener("click", () => {
      clearFeedback();
      initBookmarkletUI();
      el.modalImport.hidden = false;
    });

    // Load Demo
    const loadDemo = () => {
      state.schedule = DemoData.getSampleSchedule();
      saveSchedule();
      render();
    };
    document.getElementById("btn-load-demo").addEventListener("click", loadDemo);
    document.getElementById("btn-empty-demo").addEventListener("click", loadDemo);

    // Clear
    document.getElementById("btn-clear-schedule").addEventListener("click", () => {
      state.schedule = null;
      saveSchedule();
      render();
    });

    // Theme toggle
    el.btnTheme.addEventListener("click", () => {
      state.prefs.theme = state.prefs.theme === "dark" ? "light" : "dark";
      savePrefs();
      applyTheme();
    });

    // Toolbar toggles
    el.chkMerge.addEventListener("change", (e) => {
      state.prefs.mergeBlocks = e.target.checked;
      savePrefs();
      render();
    });
    el.chkSaturday.addEventListener("change", (e) => {
      state.prefs.showSaturday = e.target.checked;
      savePrefs();
      render();
    });
    el.chkNow.addEventListener("change", (e) => {
      state.prefs.highlightNow = e.target.checked;
      savePrefs();
      render();
    });

    // Modal close buttons & backdrop click
    document.querySelectorAll("[data-close-modal]").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.getElementById(btn.getAttribute("data-close-modal")).hidden = true;
      });
    });
    [el.modalImport, el.modalCourse, el.modalIcs].forEach((backdrop) => {
      backdrop.addEventListener("click", (e) => {
        if (e.target === backdrop) backdrop.hidden = true;
      });
    });

    // Tabs
    document.querySelectorAll(".tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
        document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
        tab.classList.add("active");
        document.getElementById(tab.getAttribute("data-tab")).classList.add("active");
        clearFeedback();
      });
    });

    // File Upload & Drag-Drop (supports multiple files)
    el.dropZone.addEventListener("click", () => el.fileInput.click());
    el.fileInput.addEventListener("change", (e) => handleHtmlFiles(e.target.files));
    el.dropZone.addEventListener("dragover", (e) => {
      e.preventDefault();
      el.dropZone.classList.add("dragover");
    });
    el.dropZone.addEventListener("dragleave", () => el.dropZone.classList.remove("dragover"));
    el.dropZone.addEventListener("drop", (e) => {
      e.preventDefault();
      el.dropZone.classList.remove("dragover");
      handleHtmlFiles(e.dataTransfer.files);
    });

    // Paste text
    document.getElementById("btn-parse-text").addEventListener("click", () => {
      try {
        const parsed = BannerParser.parseText(el.pasteTextarea.value);
        applyParsedSchedule(parsed);
      } catch (err) {
        showFeedback(err.message, true);
      }
    });

    // Copy bookmarklet
    document.getElementById("btn-copy-bookmarklet").addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(el.bookmarkletCode.value);
        showFeedback("Código del Bookmarklet copiado al portapapeles.");
      } catch (_) {
        el.bookmarkletCode.select();
        document.execCommand("copy");
        showFeedback("Código seleccionado/copiado.");
      }
    });

    // Export PNG
    document.getElementById("btn-export-png").addEventListener("click", () => {
      if (!state.schedule) return;
      const blocks = getProcessedBlocks();
      const showSaturday = Boolean(state.prefs.showSaturday);
      const numDays = showSaturday ? 6 : 5;
      const laidOutBlocks = [];
      for (let d = 0; d < numDays; d++) {
        laidOutBlocks.push(...layoutDayBlocks(blocks.filter((b) => b.day === d)));
      }
      const visibleBlocks = getVisibleUniversityBlocks(blocks, showSaturday);
      PngExporter.exportPNG(state.schedule, laidOutBlocks, {
        showSaturday,
        visibleBlocks,
        theme: state.prefs.theme
      });
    });

    // Export PDF (print)
    document.getElementById("btn-export-pdf").addEventListener("click", () => {
      if (!state.schedule) return;
      window.print();
    });

    // Export Excel (.xlsx)
    document.getElementById("btn-export-excel").addEventListener("click", () => {
      if (!state.schedule) return;
      const blocks = getProcessedBlocks();
      const showSaturday = Boolean(state.prefs.showSaturday);
      const visibleBlocks = getVisibleUniversityBlocks(blocks, showSaturday);
      ExcelExporter.exportExcel(state.schedule, blocks, {
        showSaturday,
        visibleBlocks
      });
    });

    // Export ICS Modal
    document.getElementById("btn-open-ics").addEventListener("click", () => {
      if (!state.schedule) return;
      const blocks = getProcessedBlocks();
      const firstDated = blocks.find((b) => b.startDate && b.endDate);
      const year = new Date().getFullYear();
      el.icsStart.value = (firstDated && firstDated.startDate) || `${year}-08-10`;
      el.icsEnd.value = (firstDated && firstDated.endDate) || `${year}-12-31`;
      el.modalIcs.hidden = false;
    });

    document.getElementById("btn-download-ics").addEventListener("click", () => {
      if (!state.schedule) return;
      const blocks = getProcessedBlocks();
      IcsExporter.downloadICS(state.schedule, blocks, el.icsStart.value, el.icsEnd.value);
      el.modalIcs.hidden = true;
    });
  }

  // Init
  loadStorage();
  try {
    const hashSchedule = BannerParser.parseFromLocationHash();
    if (hashSchedule) {
      state.schedule = BannerParser.mergeSchedules(state.schedule, hashSchedule);
      saveSchedule();
    }
  } catch (err) {
    console.error("Error parsing bookmarklet hash:", err);
  }

  bindEvents();
  render();

  // Refresh "now" indicator every 60 seconds
  setInterval(() => {
    if (state.schedule && state.prefs.highlightNow) {
      render();
    }
  }, 60000);
})();
