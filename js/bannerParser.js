/**
 * Ellucian Banner Self-Service (P_CrseSchdDetl) Parser
 * Supports:
 * 1. Saved HTML (.html / DOMParser)
 * 2. Copy-pasted plain text (Ctrl+A / Ctrl+C)
 * 3. Bookmarklet JSON payload via URL hash (#data=...)
 */
const BannerParser = (() => {
  const PALETTE = [
    "#2563eb", // Blue
    "#7c3aed", // Violet
    "#059669", // Emerald
    "#d97706", // Amber
    "#db2777", // Pink
    "#0891b2", // Cyan
    "#dc2626", // Red
    "#4f46e5", // Indigo
    "#65a30d", // Lime
    "#ea580c", // Orange
    "#0d9488", // Teal
    "#9333ea"  // Purple
  ];

  // Day indices: 0 = Lunes .. 5 = Sábado
  // In Ellucian Banner Latin America (e.g. Santo Tomás), Miércoles is "I" (L, M, I, J, V, S)
  const SPANISH_DAY_MAP = {
    L: 0,
    M: 1,
    I: 2,
    X: 2,
    W: 2,
    J: 3,
    V: 4,
    S: 5
  };

  const ENGLISH_DAY_MAP = {
    M: 0,
    T: 1,
    W: 2,
    R: 3,
    F: 4,
    S: 5
  };

  function cleanText(str) {
    return (str || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  }

  function cleanInstructor(str) {
    return cleanText(str)
      .replace(/;/g, " ")
      .replace(/\(\s*P\s*\)/gi, "")
      .replace(/Correo-e/gi, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  /**
   * Parse "Course Name - SUBJ 12345 - SEC" caption
   */
  function parseCourseHeader(raw) {
    const text = cleanText(raw);
    // Match: Title - CODE - SECTION (at the end)
    const match = text.match(/^(.+?)\s+-\s+([A-ZÁÉÍÓÚÑ0-9]{2,8}\s+[A-Z0-9]{2,8})\s+-\s+([A-Z0-9-]+)$/i);
    if (match) {
      return {
        title: cleanText(match[1]),
        code: cleanText(match[2]).toUpperCase(),
        section: cleanText(match[3]).toUpperCase()
      };
    }
    // Fallback: split by " - "
    const parts = text.split(/\s+-\s+/);
    if (parts.length >= 3) {
      const section = parts.pop();
      const code = parts.pop();
      return {
        title: cleanText(parts.join(" - ")),
        code: cleanText(code),
        section: cleanText(section)
      };
    }
    return { title: text, code: "", section: "" };
  }

  /**
   * Parse time string like "8:30 am - 10:00 am" or "08:30 - 10:00" into minutes from midnight
   */
  function parseTimeRange(raw) {
    const text = cleanText(raw).toLowerCase();
    if (!text || text === "tba" || text.includes("asignar") || text.includes("confirmar")) {
      return null;
    }

    const parts = text.split(/\s*[-–]\s*/);
    if (parts.length !== 2) return null;

    const startMin = parseSingleTime(parts[0]);
    const endMin = parseSingleTime(parts[1]);
    if (startMin === null || endMin === null || endMin <= startMin) return null;

    return { startMin, endMin };
  }

  function parseSingleTime(str) {
    const m = cleanText(str).toLowerCase().match(/^(\d{1,2}):(\d{2})(?:\s*(am|pm|a\.m\.|p\.m\.))?$/);
    if (!m) return null;
    let hours = parseInt(m[1], 10);
    const mins = parseInt(m[2], 10);
    const meridiem = m[3] ? m[3].replace(/\./g, "") : null;

    if (meridiem === "pm" && hours < 12) hours += 12;
    if (meridiem === "am" && hours === 12) hours = 0;

    if (hours < 0 || hours > 23 || mins < 0 || mins > 59) return null;
    return hours * 60 + mins;
  }

  /**
   * Parse Banner days string (e.g. "L X", "LMX", "MWF", "M R") into array of day indices (0..5)
   */
  function parseDays(raw, isEnglishHint = false) {
    const text = cleanText(raw).toUpperCase().replace(/[^A-Z]/g, "");
    if (!text || text === "TBA") return [];

    // Heuristic: if it contains L, I, X, J, or V, it's definitely Spanish
    const hasSpanishLetter = /[LIXJV]/.test(text);
    const hasEnglishLetter = /[TRF]/.test(text);
    const useEnglish = !hasSpanishLetter && (hasEnglishLetter || isEnglishHint);
    const map = useEnglish ? ENGLISH_DAY_MAP : SPANISH_DAY_MAP;

    const days = [];
    for (const ch of text) {
      if (ch in map && !days.includes(map[ch])) {
        days.push(map[ch]);
      }
    }
    return days.sort((a, b) => a - b);
  }

  /**
   * Clean up Banner room names (strips street/building prefix and extracts Sala/Lab + Piso)
   */
  function cleanRoom(raw) {
    const text = cleanText(raw);
    if (!text || text.toLowerCase() === "tba" || text.toLowerCase() === "pa" || text.toLowerCase().includes("por asignar") || text.toLowerCase().includes("por anunciar")) {
      return "Por asignar";
    }
    // Extract standard Santo Tomás code like S-11-P05-A or L-03-P06-A if present
    const codeMatch = text.match(/\b([A-Z])-(\d+)-P(\d+)(?:-([A-Z0-9]+))?\b/i);
    if (codeMatch) {
      return codeMatch[0].toUpperCase();
    }
    // Otherwise strip common street/campus prefixes (e.g. "Prat N° 825-879", "CP0002")
    return text
      .replace(/^.*?N[°º]\s*[\d\-]+\s+/i, "")
      .replace(/^CP\d+\s+/i, "")
      .trim() || text;
  }

  /**
   * Format room into human-readable "Sala 11 · Piso 5" or "Lab 02 · Piso 6"
   */
  function formatRoom(raw, includeCode = false) {
    const cleaned = cleanRoom(raw);
    if (!cleaned || cleaned === "Por asignar") return "Por asignar";

    const m = cleaned.match(/\b([A-Z])-(\d+)-P(\d+)(?:-([A-Z0-9]+))?\b/i);
    if (m) {
      const kindMap = {
        S: "Sala",
        L: "Lab",
        T: "Taller",
        A: "Auditorio"
      };
      const letter = m[1].toUpperCase();
      const kind = kindMap[letter] || `Sala ${letter}`;
      const num = m[2];
      const floor = parseInt(m[3], 10);
      const base = `${kind} ${num} · Piso ${floor}`;
      return includeCode ? `${base} (${m[0].toUpperCase()})` : base;
    }

    return cleaned;
  }

  /**
   * Parse Banner Date Range (e.g. "Mar 09, 2026 - Jul 10, 2026" or "09/03/2026 - 10/07/2026")
   */
  function parseDateRange(raw) {
    const text = cleanText(raw);
    if (!text) return { startDate: null, endDate: null };
    const parts = text.split(/\s*[-–]\s*/);
    if (parts.length !== 2) return { startDate: null, endDate: null };
    return {
      startDate: parseFlexibleDate(parts[0]),
      endDate: parseFlexibleDate(parts[1])
    };
  }

  function parseFlexibleDate(str) {
    const s = cleanText(str);
    // DD/MM/YYYY or DD-MM-YYYY
    const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (dmy) {
      const dd = dmy[1].padStart(2, "0");
      const mm = dmy[2].padStart(2, "0");
      return `${dmy[3]}-${mm}-${dd}`;
    }
    // "Mar 09, 2026" or "09-MAR-2026"
    const months = {
      ene: "01", jan: "01", feb: "02", mar: "03", abr: "04", apr: "04",
      may: "05", jun: "06", jul: "07", ago: "08", aug: "08",
      sep: "09", oct: "10", nov: "11", dic: "12", dec: "12"
    };
    const mdy = s.match(/^([a-zA-Z]{3})\s+(\d{1,2}),?\s+(\d{4})$/);
    if (mdy) {
      const mm = months[mdy[1].toLowerCase()];
      if (mm) return `${mdy[3]}-${mm}-${mdy[2].padStart(2, "0")}`;
    }
    const dmyText = s.match(/^(\d{1,2})[\s\-]([a-zA-Z]{3})[\s\-](\d{4})$/);
    if (dmyText) {
      const mm = months[dmyText[2].toLowerCase()];
      if (mm) return `${dmyText[3]}-${mm}-${dmyText[1].padStart(2, "0")}`;
    }
    return null;
  }

  /**
   * Deduplicate courses (by NRC or Code+Section) and meetings (same day + time)
   */
  function deduplicateCourses(courses) {
    const unique = [];
    for (const c of courses || []) {
      const existing = unique.find(
        (u) =>
          (u.nrc && c.nrc && u.nrc === c.nrc) ||
          (u.code && c.code && u.code === c.code && u.section === c.section)
      );
      if (!existing) {
        const dedupMeetings = [];
        for (const m of c.meetings || []) {
          if (!dedupMeetings.some((em) => em.day === m.day && Math.abs(em.startMin - m.startMin) <= 2 && Math.abs(em.endMin - m.endMin) <= 2)) {
            dedupMeetings.push({ ...m });
          }
        }
        unique.push({ ...c, meetings: dedupMeetings, tbaMeetings: [...(c.tbaMeetings || [])] });
      } else {
        if (isCodeLikeTitle(existing.title, existing.code) && !isCodeLikeTitle(c.title, c.code)) {
          existing.title = c.title;
        }
        if (!existing.nrc && c.nrc) existing.nrc = c.nrc;
        if (!existing.instructor && c.instructor) existing.instructor = c.instructor;
        for (const m of c.meetings || []) {
          const dup = existing.meetings.find(
            (em) => em.day === m.day && Math.abs(em.startMin - m.startMin) <= 2 && Math.abs(em.endMin - m.endMin) <= 2
          );
          if (!dup) existing.meetings.push({ ...m });
        }
      }
    }
    return unique;
  }

  /**
   * Assign deterministic colors to courses
   */
  function finalizeSchedule(courses, term = "") {
    const deduped = deduplicateCourses(courses);
    deduped.forEach((course, idx) => {
      if (!course.color) {
        course.color = PALETTE[idx % PALETTE.length];
      }
      if (!course.id) {
        course.id = course.nrc || `${course.code}-${course.section}-${idx}`;
      }
    });

    return {
      term: cleanText(term),
      courses: deduped,
      importedAt: new Date().toISOString()
    };
  }

  /**
   * 1. Parse saved HTML from Banner P_CrseSchdDetl
   */
  function parseHTML(htmlString) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, "text/html");

    const tables = Array.from(doc.querySelectorAll("table.datadisplaytable, table"));
    const courses = [];
    let currentCourse = null;
    let detectedTerm = "";

    for (const table of tables) {
      const captionEl = table.querySelector("caption");
      const captionText = cleanText(captionEl ? captionEl.textContent : "");

      // Is this a Scheduled Meeting Times table?
      const isMeetingCaption = /horas de reuni|scheduled meeting|meeting times/i.test(captionText);
      const headerCells = Array.from(table.querySelectorAll("tr th")).map((th) => cleanText(th.textContent).toLowerCase());
      const hasMeetingHeaders =
        headerCells.some((h) => h === "hora" || h === "time") &&
        headerCells.some((h) => h === "días" || h === "dias" || h === "days");

      if (isMeetingCaption || (hasMeetingHeaders && currentCourse)) {
        if (!currentCourse) continue;
        const rows = Array.from(table.querySelectorAll("tr"));
        if (rows.length < 2) continue;

        const colNames = Array.from(rows[0].querySelectorAll("th, td")).map((c) => cleanText(c.textContent).toLowerCase());
        const isEnglish = colNames.some((c) => c === "days" || c === "where" || c === "time");

        const idxType = colNames.findIndex((c) => c === "tipo" || c === "type");
        const idxTime = colNames.findIndex((c) => c === "hora" || c === "time");
        const idxDays = colNames.findIndex((c) => c === "días" || c === "dias" || c === "days");
        const idxWhere = colNames.findIndex((c) => c === "dónde" || c === "donde" || c === "where" || c.includes("ubicaci"));
        const idxDates = colNames.findIndex((c) => c.includes("fecha") || c.includes("date"));
        const idxSchedType = colNames.findIndex((c) => c.includes("tipo de horario") || c.includes("schedule type"));
        const idxInstr = colNames.findIndex((c) => c.includes("instructor"));

        for (let r = 1; r < rows.length; r++) {
          const cells = Array.from(rows[r].querySelectorAll("td")).map((td) => cleanText(td.textContent));
          if (cells.length < 3) continue;

          const timeRaw = idxTime >= 0 ? cells[idxTime] : cells[1];
          const daysRaw = idxDays >= 0 ? cells[idxDays] : cells[2];
          const whereRaw = idxWhere >= 0 ? cells[idxWhere] : cells[3] || "";
          const datesRaw = idxDates >= 0 ? cells[idxDates] : cells[4] || "";
          const schedTypeRaw = idxSchedType >= 0 ? cells[idxSchedType] : cells[5] || (idxType >= 0 ? cells[idxType] : "Cátedra");
          const instrRaw = idxInstr >= 0 ? cells[idxInstr] : cells[6] || currentCourse.instructor;

          const time = parseTimeRange(timeRaw);
          const days = parseDays(daysRaw, isEnglish);
          const { startDate, endDate } = parseDateRange(datesRaw);

          if (!time || days.length === 0) {
            currentCourse.tbaMeetings.push({
              type: schedTypeRaw || "Clase",
              room: cleanRoom(whereRaw),
              note: `${daysRaw || "TBA"} · ${timeRaw || "Por asignar"}`
            });
            continue;
          }

          for (const day of days) {
            currentCourse.meetings.push({
              day,
              startMin: time.startMin,
              endMin: time.endMin,
              room: cleanRoom(whereRaw),
              type: schedTypeRaw || "Cátedra",
              instructor: cleanInstructor(instrRaw || currentCourse.instructor || ""),
              startDate,
              endDate
            });
          }
        }
        continue;
      }

      // Otherwise, check if this is a Course Metadata table
      const rows = Array.from(table.querySelectorAll("tr"));
      const meta = {};
      for (const row of rows) {
        const th = row.querySelector("th");
        const td = row.querySelector("td");
        if (th && td) {
          const key = cleanText(th.textContent).replace(/:$/, "").toLowerCase();
          meta[key] = cleanText(td.textContent);
        }
      }

      const nrc = meta["nrc"] || meta["crn"] || "";
      const term = meta["periodo asociado"] || meta["plazo asociado"] || meta["associated term"] || "";
      if (term && !detectedTerm) detectedTerm = term;

      if (captionText && (nrc || meta["créditos"] || meta["credits"] || meta["campus"] || meta["estado"] || meta["estatus"] || meta["status"])) {
        const parsed = parseCourseHeader(captionText);
        currentCourse = {
          id: nrc || `${parsed.code}-${parsed.section}-${courses.length}`,
          title: parsed.title,
          code: parsed.code,
          section: parsed.section,
          nrc,
          term,
          credits: meta["créditos"] || meta["credits"] || "",
          campus: meta["campus"] || "",
          instructor: cleanInstructor(meta["instructor asignado"] || meta["assigned instructor"] || ""),
          meetings: [],
          tbaMeetings: []
        };
        courses.push(currentCourse);
      }
    }

    if (courses.length === 0) {
      const weekly = parseWeeklyGridHTML(doc);
      if (weekly && weekly.courses.length > 0) {
        return weekly;
      }
      throw new Error("No se encontraron ramos de Ellucian Banner en el HTML. Asegúrate de guardar la página 'Horario de Detalle de Alumno' o 'Semana de un Vistazo'.");
    }

    return finalizeSchedule(courses, detectedTerm);
  }

  /**
   * Fallback parser for "Semana de un Vistazo" (bwskfshd.P_CrseSchd)
   */
  function parseWeeklyGridHTML(doc) {
    const tables = Array.from(doc.querySelectorAll("table.datadisplaytable, table"));
    const gridTable = tables.find((t) => {
      const headers = Array.from(t.querySelectorAll("tr th")).map((th) => cleanText(th.textContent).toLowerCase());
      return headers.some((h) => h === "lunes" || h === "monday") && headers.some((h) => h === "martes" || h === "tuesday");
    });
    if (!gridTable) return null;

    const rows = Array.from(gridTable.querySelectorAll("tr"));
    if (rows.length < 2) return null;

    const coursesMap = new Map();
    // Track remaining rowspan for columns 0..7 (col 0 is time label, 1..6 are Lunes..Sábado)
    const spanRemaining = [];

    for (let r = 1; r < rows.length; r++) {
      const cells = Array.from(rows[r].children);
      let colIdx = 0;

      for (const cell of cells) {
        while (spanRemaining[colIdx] > 0) {
          spanRemaining[colIdx]--;
          colIdx++;
        }

        const rowspan = parseInt(cell.getAttribute("rowspan") || "1", 10);
        const colspan = parseInt(cell.getAttribute("colspan") || "1", 10);

        if (rowspan > 1) {
          for (let c = 0; c < colspan; c++) {
            spanRemaining[colIdx + c] = rowspan - 1;
          }
        }

        // Columns 1..6 correspond to Lunes (0) .. Sábado (5)
        const day = colIdx - 1;
        if (day >= 0 && day <= 5 && cell.tagName === "TD") {
          const link = cell.querySelector("a");
          if (link) {
            const lines = link.innerHTML
              .split(/<br\s*\/?>/i)
              .map((part) => cleanText(part.replace(/<[^>]+>/g, " ")))
              .filter(Boolean);

            // Expected lines: ["IGR 00140-A08", "38338 Clase", "9:45 AM-10:25 AM", "CP0002 S-11-P05-A"]
            const codeSec = lines[0] || "Ramo";
            const nrcType = lines[1] || "";
            const timeStr = lines[2] || "";
            const roomStr = lines[3] || "Por asignar";

            const time = parseTimeRange(timeStr);
            if (time) {
              const nrcMatch = nrcType.match(/^(\d+)\s*(.*)$/);
              const nrc = nrcMatch ? nrcMatch[1] : "";
              const type = nrcMatch && nrcMatch[2] ? nrcMatch[2] : "Clase";

              const lastDash = codeSec.lastIndexOf("-");
              const code = lastDash > 0 ? codeSec.slice(0, lastDash).trim() : codeSec;
              const section = lastDash > 0 ? codeSec.slice(lastDash + 1).trim() : "";

              const key = nrc || codeSec;
              if (!coursesMap.has(key)) {
                coursesMap.set(key, {
                  id: key,
                  title: codeSec,
                  code,
                  section,
                  nrc,
                  term: "",
                  credits: "",
                  campus: "",
                  instructor: "",
                  meetings: [],
                  tbaMeetings: []
                });
              }

              coursesMap.get(key).meetings.push({
                day,
                startMin: time.startMin,
                endMin: time.endMin,
                room: cleanRoom(roomStr),
                type,
                instructor: "",
                startDate: null,
                endDate: null
              });
            }
          }
        }

        colIdx += colspan;
      }

      // Decrement any trailing columns that were spanned from previous rows
      while (colIdx < spanRemaining.length) {
        if (spanRemaining[colIdx] > 0) spanRemaining[colIdx]--;
        colIdx++;
      }
    }

    const courses = Array.from(coursesMap.values());
    return courses.length ? finalizeSchedule(courses, "") : null;
  }

  /**
   * 2. Parse copied plain text (Ctrl+A, Ctrl+C from Banner)
   */
  function parseText(rawText) {
    const lines = rawText
      .split(/\r?\n/)
      .map((l) => l.replace(/\u00a0/g, " ").trimEnd())
      .filter((l) => l.trim().length > 0);

    const courses = [];
    let currentCourse = null;
    let inMeetingTable = false;
    let isEnglishHint = false;
    let detectedTerm = "";

    // Regex for course title line: "Title - SUBJ 12345 - SEC"
    const headerRegex = /^(.+?)\s+-\s+([A-ZÁÉÍÓÚÑ0-9]{2,8}\s+[A-Z0-9]{2,8})\s+-\s+([A-Z0-9-]+)$/i;
    // Regex for a time range anywhere in a meeting row
    const timeRegex = /(\d{1,2}:\d{2}(?:\s*(?:am|pm|a\.m\.|p\.m\.))?\s*[-–]\s*\d{1,2}:\d{2}(?:\s*(?:am|pm|a\.m\.|p\.m\.))?)/i;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      const headerMatch = line.match(headerRegex);
      if (headerMatch) {
        inMeetingTable = false;
        currentCourse = {
          id: "",
          title: cleanText(headerMatch[1]),
          code: cleanText(headerMatch[2]).toUpperCase(),
          section: cleanText(headerMatch[3]).toUpperCase(),
          nrc: "",
          term: "",
          credits: "",
          campus: "",
          instructor: "",
          meetings: [],
          tbaMeetings: []
        };
        courses.push(currentCourse);
        continue;
      }

      if (!currentCourse) continue;

      if (/horas de reuni|scheduled meeting/i.test(line)) {
        inMeetingTable = true;
        if (/scheduled meeting/i.test(line)) isEnglishHint = true;
        continue;
      }

      if (!inMeetingTable) {
        // Key-value metadata
        const kv = line.match(/^([^:\t]+):\s*(.+)$/);
        if (kv) {
          const key = kv[1].trim().toLowerCase();
          const val = cleanText(kv[2]);
          if (key === "nrc" || key === "crn") currentCourse.nrc = val;
          else if (key.includes("periodo") || key.includes("plazo") || key.includes("term")) {
            currentCourse.term = val;
            if (!detectedTerm) detectedTerm = val;
          } else if (key.includes("crédito") || key.includes("credit")) currentCourse.credits = val;
          else if (key === "campus") currentCourse.campus = val;
          else if (key.includes("instructor")) currentCourse.instructor = cleanInstructor(val);
        }
        continue;
      }

      // Skip table header line
      if (/^(tipo|type)[\t\s]+(hora|time)/i.test(line)) {
        if (/^type/i.test(line)) isEnglishHint = true;
        continue;
      }

      // Meeting row: try tab split first, then regex fallback
      const cols = line.split(/\t+/).map((c) => cleanText(c));
      if (cols.length >= 4 && timeRegex.test(cols[1])) {
        const time = parseTimeRange(cols[1]);
        const days = parseDays(cols[2], isEnglishHint);
        const room = cleanRoom(cols[3]);
        const { startDate, endDate } = parseDateRange(cols[4] || "");
        const schedType = cols[5] || cols[0] || "Cátedra";
        const instr = cols[6] || currentCourse.instructor || "";

        if (time && days.length > 0) {
          for (const day of days) {
            currentCourse.meetings.push({
              day,
              startMin: time.startMin,
              endMin: time.endMin,
              room,
              type: schedType,
              instructor: instr,
              startDate,
              endDate
            });
          }
        } else {
          currentCourse.tbaMeetings.push({
            type: schedType,
            room,
            note: `${cols[2] || "TBA"} · ${cols[1] || "Por asignar"}`
          });
        }
      } else {
        // Fallback when browser strips tabs into spaces
        const tm = line.match(timeRegex);
        if (tm) {
          const time = parseTimeRange(tm[1]);
          const afterTime = line.slice(line.indexOf(tm[1]) + tm[1].length).trim();
          const parts = afterTime.split(/\s{2,}/);
          const days = parseDays(parts[0] || "", isEnglishHint);
          const room = cleanRoom(parts[1] || "");
          if (time && days.length > 0) {
            for (const day of days) {
              currentCourse.meetings.push({
                day,
                startMin: time.startMin,
                endMin: time.endMin,
                room,
                type: "Clase",
                instructor: currentCourse.instructor || "",
                startDate: null,
                endDate: null
              });
            }
          }
        }
      }
    }

    if (courses.length === 0) {
      throw new Error("No se pudieron detectar ramos en el texto pegado. Asegúrate de copiar toda la página de Horario de Detalle (Ctrl+A, Ctrl+C).");
    }

    return finalizeSchedule(courses, detectedTerm);
  }

  /**
   * 3. Generate 1-Click Bookmarklet pointing to the current app URL.
   * When run on "Semana de un Vistazo", it automatically fetches all linked "Horario de Detalle" pages
   * on the current origin (fixing Santo Tomás's selferviceprd link typo) using the active session.
   */
  function buildBookmarklet(targetUrl) {
    const cleanUrl = targetUrl.split("#")[0].split("?")[0];
    const script = `(async function(){var links=[...new Set([...document.querySelectorAll('a[href*="P_CrseSchdDetl"]')].map(function(a){var u=new URL(a.href,location.href);return location.origin+u.pathname+u.search;}))];var h='';if(links.length){try{var pages=await Promise.all(links.map(function(u){return fetch(u,{credentials:'include'}).then(function(r){return r.text();});}));pages.forEach(function(txt){var d=new DOMParser().parseFromString(txt,'text/html');d.querySelectorAll('table.datadisplaytable').forEach(function(t){var c=t.cloneNode(true);c.querySelectorAll('img,a').forEach(function(x){x.remove();});h+=c.outerHTML.replace(/\\s+(style|class|summary|scope|colspan|align|valign|width|border|cellspacing|cellpadding)="[^"]*"/gi,'');});});}catch(e){}}if(!h){var t=document.querySelectorAll('table.datadisplaytable');if(!t.length){alert('Abre "Semana de un Vistazo" o "Horario de Detalle de Alumno" en Banner.');return;}t.forEach(function(e){h+=e.outerHTML;});}var p=btoa(unescape(encodeURIComponent(h)));window.open(${JSON.stringify(cleanUrl)}+'?t='+Date.now()+'#html='+p,'_blank');})();`;
    return "javascript:" + script;
  }

  /**
   * Check URL hash for bookmarklet payload (#html=... or #data=...)
   */
  function parseFromLocationHash() {
    const hash = window.location.hash || "";
    if (hash.startsWith("#html=")) {
      const b64 = hash.slice(6);
      const html = decodeURIComponent(escape(atob(b64)));
      history.replaceState(null, "", window.location.pathname);
      return parseHTML(html);
    }
    if (hash.startsWith("#data=")) {
      const jsonStr = decodeURIComponent(escape(atob(hash.slice(6))));
      history.replaceState(null, "", window.location.pathname);
      return JSON.parse(jsonStr);
    }
    return null;
  }

  /**
   * Standard University 40-minute academic blocks (Santo Tomás)
   * Pair of blocks = 80 min + 10 min break before next pair
   */
  const UNIVERSITY_BLOCKS = [
    { num: 0, label: "Mód. 0", startMin: 480, endMin: 494, startText: "08:00", endText: "08:14", optional: true },
    { num: 1, label: "Bloque 1", startMin: 495, endMin: 535, startText: "08:15", endText: "08:55" },
    { num: 2, label: "Bloque 2", startMin: 536, endMin: 575, startText: "08:56", endText: "09:35", breakAfter: true },
    { num: 3, label: "Bloque 3", startMin: 585, endMin: 625, startText: "09:45", endText: "10:25" },
    { num: 4, label: "Bloque 4", startMin: 626, endMin: 665, startText: "10:26", endText: "11:05", breakAfter: true },
    { num: 5, label: "Bloque 5", startMin: 675, endMin: 715, startText: "11:15", endText: "11:55" },
    { num: 6, label: "Bloque 6", startMin: 716, endMin: 755, startText: "11:56", endText: "12:35", breakAfter: true },
    { num: 7, label: "Bloque 7", startMin: 765, endMin: 805, startText: "12:45", endText: "13:25" },
    { num: 8, label: "Bloque 8", startMin: 806, endMin: 845, startText: "13:26", endText: "14:05", breakAfter: true },
    { num: 9, label: "Bloque 9", startMin: 855, endMin: 895, startText: "14:15", endText: "14:55" },
    { num: 10, label: "Bloque 10", startMin: 896, endMin: 935, startText: "14:56", endText: "15:35", breakAfter: true },
    { num: 11, label: "Bloque 11", startMin: 945, endMin: 985, startText: "15:45", endText: "16:25" },
    { num: 12, label: "Bloque 12", startMin: 986, endMin: 1025, startText: "16:26", endText: "17:05", breakAfter: true },
    { num: 13, label: "Bloque 13", startMin: 1035, endMin: 1075, startText: "17:15", endText: "17:55" },
    { num: 14, label: "Bloque 14", startMin: 1076, endMin: 1115, startText: "17:56", endText: "18:35", breakAfter: true },
    { num: 15, label: "Bloque 15", startMin: 1125, endMin: 1165, startText: "18:45", endText: "19:25" },
    { num: 16, label: "Bloque 16", startMin: 1166, endMin: 1205, startText: "19:26", endText: "20:05", breakAfter: true },
    { num: 17, label: "Bloque 17", startMin: 1215, endMin: 1255, startText: "20:15", endText: "20:55" },
    { num: 18, label: "Bloque 18", startMin: 1256, endMin: 1295, startText: "20:56", endText: "21:35", breakAfter: true },
    { num: 19, label: "Bloque 19", startMin: 1305, endMin: 1345, startText: "21:45", endText: "22:25" },
    { num: 20, label: "Bloque 20", startMin: 1346, endMin: 1385, startText: "22:26", endText: "23:05" }
  ];

  function isCodeLikeTitle(title, code) {
    if (!title) return true;
    const t = title.replace(/\s+/g, "").toUpperCase();
    const c = (code || "").replace(/\s+/g, "").toUpperCase();
    return Boolean(c && t.startsWith(c));
  }

  /**
   * Merge two schedules (e.g., "Semana de un Vistazo" + one or more "Horario de Detalle")
   * Matches courses by NRC or Code+Section and enriches names, professors, rooms, and meetings.
   */
  function mergeSchedules(baseSchedule, incomingSchedule) {
    if (!baseSchedule || !Array.isArray(baseSchedule.courses) || !baseSchedule.courses.length) {
      return incomingSchedule;
    }
    if (!incomingSchedule || !Array.isArray(incomingSchedule.courses) || !incomingSchedule.courses.length) {
      return baseSchedule;
    }

    const mergedCourses = baseSchedule.courses.map((c) => ({
      ...c,
      meetings: [...(c.meetings || [])],
      tbaMeetings: [...(c.tbaMeetings || [])]
    }));

    for (const inc of incomingSchedule.courses) {
      const existing = mergedCourses.find(
        (c) =>
          (c.nrc && inc.nrc && c.nrc === inc.nrc) ||
          (c.code && inc.code && c.code === inc.code && c.section === inc.section)
      );

      if (!existing) {
        mergedCourses.push({
          ...inc,
          color: PALETTE[mergedCourses.length % PALETTE.length]
        });
        continue;
      }

      // Enrich metadata: prefer real course name over code-only name
      if (isCodeLikeTitle(existing.title, existing.code) && !isCodeLikeTitle(inc.title, inc.code)) {
        existing.title = inc.title;
      }
      if (!existing.nrc && inc.nrc) existing.nrc = inc.nrc;
      if (!existing.term && inc.term) existing.term = inc.term;
      if (!existing.credits && inc.credits) existing.credits = inc.credits;
      if (!existing.campus && inc.campus) existing.campus = inc.campus;
      if (!existing.instructor && inc.instructor) existing.instructor = inc.instructor;

      // Merge meetings without duplicates
      for (const m of inc.meetings || []) {
        const dup = existing.meetings.find(
          (em) => em.day === m.day && Math.abs(em.startMin - m.startMin) <= 2 && Math.abs(em.endMin - m.endMin) <= 2
        );
        if (dup) {
          if (!dup.instructor && m.instructor) dup.instructor = m.instructor;
          if (!dup.startDate && m.startDate) dup.startDate = m.startDate;
          if (!dup.endDate && m.endDate) dup.endDate = m.endDate;
          if ((dup.type === "Clase" || !dup.type) && m.type) dup.type = m.type;
          if (m.room && m.room !== "Por asignar") {
            dup.room = cleanRoom(m.room);
          }
        } else {
          existing.meetings.push({ ...m, room: cleanRoom(m.room) });
        }
      }

      for (const tba of inc.tbaMeetings || []) {
        const dupTba = existing.tbaMeetings.some((t) => t.note === tba.note);
        if (!dupTba) existing.tbaMeetings.push({ ...tba });
      }
    }

    return finalizeSchedule(mergedCourses, incomingSchedule.term || baseSchedule.term || "");
  }

  /**
   * Repair schedules stored before "I" (Miércoles) was added to SPANISH_DAY_MAP
   */
  function repairStoredSchedule(schedule) {
    if (!schedule || !Array.isArray(schedule.courses)) return schedule;
    for (const course of schedule.courses) {
      if (!Array.isArray(course.tbaMeetings) || !course.tbaMeetings.length) continue;
      const remainingTba = [];
      for (const tba of course.tbaMeetings) {
        const parts = (tba.note || "").split("·").map((s) => s.trim());
        const days = parseDays(parts[0] || "");
        const time = parseTimeRange(parts[1] || "");
        if (days.length > 0 && time) {
          for (const day of days) {
            const dup = (course.meetings || []).find(
              (m) => m.day === day && Math.abs(m.startMin - time.startMin) <= 2 && Math.abs(m.endMin - time.endMin) <= 2
            );
            if (dup) {
              if ((dup.type === "Clase" || !dup.type) && tba.type) dup.type = tba.type;
              if (tba.room && tba.room !== "Por asignar") dup.room = cleanRoom(tba.room);
            } else {
              course.meetings.push({
                day,
                startMin: time.startMin,
                endMin: time.endMin,
                room: cleanRoom(tba.room),
                type: tba.type || "Clase",
                instructor: course.instructor || "",
                startDate: null,
                endDate: null
              });
            }
          }
        } else {
          remainingTba.push(tba);
        }
      }
      course.tbaMeetings = remainingTba;
    }
    schedule.courses = deduplicateCourses(schedule.courses);
    return schedule;
  }

  return {
    PALETTE,
    UNIVERSITY_BLOCKS,
    cleanRoom,
    formatRoom,
    parseHTML,
    parseText,
    mergeSchedules,
    repairStoredSchedule,
    buildBookmarklet,
    parseFromLocationHash
  };
})();
