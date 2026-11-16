/**
 * Pure-JS Native .xlsx (OpenXML) Exporter — Zero external dependencies.
 * Generates a real .xlsx file with 2 sheets:
 * 1. "Horario Semanal" (colored block grid with merged cells for multi-block classes)
 * 2. "Ramos del Semestre" (summary table with NRC, code, professor, credits, campus, rooms)
 */
const ExcelExporter = (() => {
  const DAY_NAMES = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

  // --- Minimal ZIP (STORE / method 0) with CRC32 ---
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) {
      c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
  }

  function createZip(files) {
    const encoder = new TextEncoder();
    const localParts = [];
    const centralParts = [];
    let offset = 0;

    for (const f of files) {
      const nameBytes = encoder.encode(f.name);
      const dataBytes = encoder.encode(f.content);
      const crc = crc32(dataBytes);
      const size = dataBytes.length;

      // Local file header (30 bytes + name)
      const lh = new Uint8Array(30 + nameBytes.length);
      const lv = new DataView(lh.buffer);
      lv.setUint32(0, 0x04034b50, true);
      lv.setUint16(4, 20, true); // version needed
      lv.setUint16(6, 0x0800, true); // UTF-8 flag
      lv.setUint16(8, 0, true); // method 0 (STORE)
      lv.setUint16(10, 0, true);
      lv.setUint16(12, 0x21, true);
      lv.setUint32(14, crc, true);
      lv.setUint32(18, size, true);
      lv.setUint32(22, size, true);
      lv.setUint16(26, nameBytes.length, true);
      lv.setUint16(28, 0, true);
      lh.set(nameBytes, 30);

      localParts.push(lh, dataBytes);

      // Central directory header (46 bytes + name)
      const ch = new Uint8Array(46 + nameBytes.length);
      const cv = new DataView(ch.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0x0800, true);
      cv.setUint16(10, 0, true);
      cv.setUint16(12, 0, true);
      cv.setUint16(14, 0x21, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, size, true);
      cv.setUint32(24, size, true);
      cv.setUint16(28, nameBytes.length, true);
      cv.setUint16(30, 0, true);
      cv.setUint16(32, 0, true);
      cv.setUint16(34, 0, true);
      cv.setUint16(36, 0, true);
      cv.setUint32(38, 0, true);
      cv.setUint32(42, offset, true);
      ch.set(nameBytes, 46);

      centralParts.push(ch);
      offset += lh.length + size;
    }

    const centralSize = centralParts.reduce((acc, b) => acc + b.length, 0);
    const eocd = new Uint8Array(22);
    const ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(4, 0, true);
    ev.setUint16(6, 0, true);
    ev.setUint16(8, files.length, true);
    ev.setUint16(10, files.length, true);
    ev.setUint32(12, centralSize, true);
    ev.setUint32(16, offset, true);
    ev.setUint16(20, 0, true);

    return new Blob([...localParts, ...centralParts, eocd], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });
  }

  function escXml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  function colLetter(colIdx) {
    return String.fromCharCode(65 + colIdx);
  }

  function formatMin(m) {
    const hh = String(Math.floor(m / 60)).padStart(2, "0");
    const mm = String(m % 60).padStart(2, "0");
    return `${hh}:${mm}`;
  }

  function hexToArgb(hex) {
    const clean = (hex || "#2563eb").replace("#", "").toUpperCase();
    return "FF" + (clean.length === 6 ? clean : "2563EB");
  }

  function buildStylesXml(courseColors) {
    // Fills: 0=none, 1=gray125 (required by Excel), 2=header dark, 3=time col light, 4..=course colors
    const courseFills = courseColors
      .map(
        (hex) =>
          `<fill><patternFill patternType="solid"><fgColor rgb="${hexToArgb(hex)}"/><bgColor indexed="64"/></patternFill></fill>`
      )
      .join("");

    // CellXfs:
    // 0: default
    // 1: Title (bold 14pt)
    // 2: Table Header (bold white on dark #1E293B, centered, border)
    // 3: Block/Time cell (centered, light fill #F1F5F9, border)
    // 4: Empty grid cell (bordered)
    // 5: Summary cell (bordered, wrapText)
    // 6 + idx: Course block cell (bold white on course color, centered, wrapText, border)
    const courseXfs = courseColors
      .map(
        (_, i) =>
          `<xf numFmtId="0" fontId="2" fillId="${4 + i}" borderId="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>`
      )
      .join("");

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="4">
    <font><sz val="10"/><name val="Calibri"/></font>
    <font><b/><sz val="14"/><color rgb="FF0F172A"/><name val="Calibri"/></font>
    <font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
    <font><b/><sz val="10"/><color rgb="FF0F172A"/><name val="Calibri"/></font>
  </fonts>
  <fills count="${4 + courseColors.length}">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF1E293B"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF1F5F9"/><bgColor indexed="64"/></patternFill></fill>
    ${courseFills}
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left style="thin"><color rgb="FFCBD5E1"/></left>
      <right style="thin"><color rgb="FFCBD5E1"/></right>
      <top style="thin"><color rgb="FFCBD5E1"/></top>
      <bottom style="thin"><color rgb="FFCBD5E1"/></bottom>
      <diagonal/>
    </border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="${6 + courseColors.length}">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="0" applyFont="1"/>
    <xf numFmtId="0" fontId="2" fillId="2" borderId="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="3" fillId="3" borderId="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
    ${courseXfs}
  </cellXfs>
</styleSheet>`;
  }

  function cellXml(ref, text, styleIdx) {
    return `<c r="${ref}" s="${styleIdx}" t="inlineStr"><is><t xml:space="preserve">${escXml(text)}</t></is></c>`;
  }

  function buildScheduleSheetXml(schedule, blocks, visibleBlocks, showSaturday, colorIndexMap) {
    const numDays = showSaturday ? 6 : 5;
    const rowsXml = [];
    const merges = [];

    // Row 1: Title
    const title = `Horario Semanal${schedule.term ? " — " + schedule.term : ""}`;
    rowsXml.push(`<row r="1" ht="26" customHeight="1">${cellXml("A1", title, 1)}</row>`);

    // Row 3: Header (Bloque, Hora, Lunes..Viernes/Sábado)
    const headerCells = [cellXml("A3", "Bloque", 2), cellXml("B3", "Horario", 2)];
    for (let d = 0; d < numDays; d++) {
      headerCells.push(cellXml(`${colLetter(2 + d)}3`, DAY_NAMES[d], 2));
    }
    rowsXml.push(`<row r="3" ht="24" customHeight="1">${headerCells.join("")}</row>`);

    // Pre-map which blocks fall into each (rowIdx, day)
    // A class block covers university block i if it overlaps [ub.startMin, ub.endMin]
    const gridData = Array.from({ length: visibleBlocks.length }, () => Array(numDays).fill(null));

    for (const blk of blocks) {
      if (blk.day >= numDays) continue;
      const spannedIndices = [];
      visibleBlocks.forEach((ub, i) => {
        if (blk.startMin <= ub.endMin - 2 && blk.endMin >= ub.startMin + 2) {
          spannedIndices.push(i);
        }
      });
      if (!spannedIndices.length) continue;

      const roomFormatted = BannerParser.formatRoom(blk.room);
      const label = `${blk.courseTitle}\n${formatMin(blk.startMin)} - ${formatMin(blk.endMin)}\n📍 ${roomFormatted} (${blk.type})`;
      const styleIdx = 6 + (colorIndexMap.get(blk.color) ?? 0);

      const firstIdx = spannedIndices[0];
      const lastIdx = spannedIndices[spannedIndices.length - 1];

      for (const i of spannedIndices) {
        if (!gridData[i][blk.day]) {
          gridData[i][blk.day] = {
            text: i === firstIdx ? label : "",
            styleIdx
          };
        } else if (i === firstIdx) {
          // Topón in the same cell: append both
          gridData[i][blk.day].text += `\n---\n${label}`;
        }
      }

      if (lastIdx > firstIdx) {
        const col = colLetter(2 + blk.day);
        merges.push(`${col}${4 + firstIdx}:${col}${4 + lastIdx}`);
      }
    }

    // Rows 4..: University blocks
    visibleBlocks.forEach((ub, i) => {
      const rNum = 4 + i;
      const cells = [
        cellXml(`A${rNum}`, ub.label, 3),
        cellXml(`B${rNum}`, `${ub.startText} - ${ub.endText}`, 3)
      ];
      for (let d = 0; d < numDays; d++) {
        const ref = `${colLetter(2 + d)}${rNum}`;
        const cellInfo = gridData[i][d];
        if (cellInfo) {
          cells.push(cellXml(ref, cellInfo.text, cellInfo.styleIdx));
        } else {
          cells.push(cellXml(ref, "", 4));
        }
      }
      rowsXml.push(`<row r="${rNum}" ht="44" customHeight="1">${cells.join("")}</row>`);
    });

    const colsXml = `<cols>
      <col min="1" max="1" width="12" customWidth="1"/>
      <col min="2" max="2" width="15" customWidth="1"/>
      <col min="3" max="${2 + numDays}" width="26" customWidth="1"/>
    </cols>`;

    const mergeXml = merges.length
      ? `<mergeCells count="${merges.length}">${merges.map((m) => `<mergeCell ref="${m}"/>`).join("")}</mergeCells>`
      : "";

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  ${colsXml}
  <sheetData>${rowsXml.join("")}</sheetData>
  ${mergeXml}
</worksheet>`;
  }

  function buildCoursesSheetXml(schedule) {
    const headers = ["Ramo", "Código", "Sección", "NRC", "Profesor", "Créditos", "Campus", "Horarios y Salas"];
    const rowsXml = [];

    rowsXml.push(
      `<row r="1" ht="24" customHeight="1">${headers.map((h, i) => cellXml(`${colLetter(i)}1`, h, 2)).join("")}</row>`
    );

    (schedule.courses || []).forEach((c, idx) => {
      const rNum = 2 + idx;
      const meetingsSummary = (c.meetings || [])
        .map((m) => `${DAY_NAMES[m.day] || ""} ${formatMin(m.startMin)}-${formatMin(m.endMin)} (${BannerParser.formatRoom(m.room)})`)
        .join(" | ");

      const values = [
        c.title || "",
        c.code || "",
        c.section || "",
        c.nrc || "",
        c.instructor || "Por asignar",
        c.credits || "",
        c.campus || "",
        meetingsSummary
      ];

      const cells = values.map((v, colIdx) => cellXml(`${colLetter(colIdx)}${rNum}`, v, 5));
      rowsXml.push(`<row r="${rNum}" ht="24" customHeight="1">${cells.join("")}</row>`);
    });

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <cols>
    <col min="1" max="1" width="32" customWidth="1"/>
    <col min="2" max="2" width="14" customWidth="1"/>
    <col min="3" max="4" width="10" customWidth="1"/>
    <col min="5" max="5" width="28" customWidth="1"/>
    <col min="6" max="6" width="10" customWidth="1"/>
    <col min="7" max="7" width="18" customWidth="1"/>
    <col min="8" max="8" width="48" customWidth="1"/>
  </cols>
  <sheetData>${rowsXml.join("")}</sheetData>
</worksheet>`;
  }

  function exportExcel(schedule, blocks, options) {
    const { showSaturday, visibleBlocks } = options;

    const uniqueColors = [];
    const colorIndexMap = new Map();
    for (const c of schedule.courses || []) {
      const col = c.color || "#2563eb";
      if (!colorIndexMap.has(col)) {
        colorIndexMap.set(col, uniqueColors.length);
        uniqueColors.push(col);
      }
    }
    if (!uniqueColors.length) {
      colorIndexMap.set("#2563eb", 0);
      uniqueColors.push("#2563eb");
    }

    const files = [
      {
        name: "[Content_Types].xml",
        content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`
      },
      {
        name: "_rels/.rels",
        content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`
      },
      {
        name: "xl/workbook.xml",
        content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Horario Semanal" sheetId="1" r:id="rId1"/>
    <sheet name="Ramos del Semestre" sheetId="2" r:id="rId2"/>
  </sheets>
</workbook>`
      },
      {
        name: "xl/_rels/workbook.xml.rels",
        content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`
      },
      {
        name: "xl/styles.xml",
        content: buildStylesXml(uniqueColors)
      },
      {
        name: "xl/worksheets/sheet1.xml",
        content: buildScheduleSheetXml(schedule, blocks, visibleBlocks, showSaturday, colorIndexMap)
      },
      {
        name: "xl/worksheets/sheet2.xml",
        content: buildCoursesSheetXml(schedule)
      }
    ];

    const blob = createZip(files);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "Horario_Semanal.xlsx";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return { exportExcel };
})();
