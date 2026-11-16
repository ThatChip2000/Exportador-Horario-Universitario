const IcsExporter = (() => {
  const ICS_DAYS = ["MO", "TU", "WE", "TH", "FR", "SA"];

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function formatDateYMD(dateObj) {
    return `${dateObj.getFullYear()}${pad(dateObj.getMonth() + 1)}${pad(dateObj.getDate())}`;
  }

  function formatDateTime(dateObj, minutesFromMidnight) {
    const hh = Math.floor(minutesFromMidnight / 60);
    const mm = minutesFromMidnight % 60;
    return `${formatDateYMD(dateObj)}T${pad(hh)}${pad(mm)}00`;
  }

  function escapeICS(str) {
    return (str || "")
      .replace(/\\/g, "\\\\")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,")
      .replace(/\n/g, "\\n");
  }

  /**
   * Find the first occurrence date >= startDate matching dayIndex (0=Mon..5=Sat)
   */
  function getFirstOccurrence(startDateStr, dayIndex) {
    const [y, m, d] = startDateStr.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    // JS getDay(): 0=Sun, 1=Mon..6=Sat -> convert to 0=Mon..6=Sun
    const currentIdx = (dt.getDay() + 6) % 7;
    const diff = (dayIndex - currentIdx + 7) % 7;
    dt.setDate(dt.getDate() + diff);
    return dt;
  }

  function generateICS(schedule, blocks, defaultStartDate, defaultEndDate) {
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Horario Visual Santo Tomas//Banner Parser//ES",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      `X-WR-CALNAME:${escapeICS(schedule.term ? `Horario ${schedule.term}` : "Horario Universitario")}`
    ];

    const nowStamp = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

    blocks.forEach((blk, idx) => {
      const startStr = blk.startDate || defaultStartDate;
      const endStr = blk.endDate || defaultEndDate;
      const firstDate = getFirstOccurrence(startStr, blk.day);

      const dtStart = formatDateTime(firstDate, blk.startMin);
      const dtEnd = formatDateTime(firstDate, blk.endMin);
      const untilDate = endStr.replace(/-/g, "") + "T235959";
      const byDay = ICS_DAYS[blk.day] || "MO";

      const summary = `${blk.courseTitle} (${blk.type})`;
      const descParts = [
        blk.courseCode ? `Código: ${blk.courseCode}${blk.courseSection ? "-" + blk.courseSection : ""}` : "",
        blk.nrc ? `NRC: ${blk.nrc}` : "",
        blk.instructor ? `Profesor: ${blk.instructor}` : "",
        `Tipo: ${blk.type}`
      ].filter(Boolean);

      lines.push("BEGIN:VEVENT");
      lines.push(`UID:${Date.now()}-${idx}-${blk.nrc || "curso"}@horariovisual`);
      lines.push(`DTSTAMP:${nowStamp}`);
      lines.push(`DTSTART:${dtStart}`);
      lines.push(`DTEND:${dtEnd}`);
      lines.push(`RRULE:FREQ=WEEKLY;BYDAY=${byDay};UNTIL=${untilDate}`);
      lines.push(`SUMMARY:${escapeICS(summary)}`);
      if (blk.room) lines.push(`LOCATION:${escapeICS(blk.room)}`);
      if (descParts.length) lines.push(`DESCRIPTION:${escapeICS(descParts.join("\\n"))}`);
      lines.push("END:VEVENT");
    });

    lines.push("END:VCALENDAR");
    return lines.join("\r\n");
  }

  function downloadICS(schedule, blocks, startDate, endDate) {
    const content = generateICS(schedule, blocks, startDate, endDate);
    const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "Horario_Universitario.ics";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return { downloadICS };
})();
