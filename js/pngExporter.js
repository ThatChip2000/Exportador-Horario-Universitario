const PngExporter = (() => {
  const DAY_NAMES = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

  function formatMin(m) {
    const hh = String(Math.floor(m / 60)).padStart(2, "0");
    const mm = String(m % 60).padStart(2, "0");
    return `${hh}:${mm}`;
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function wrapLines(ctx, text, maxWidth, maxLines) {
    const words = (text || "").split(/\s+/);
    const lines = [];
    let current = "";
    for (const w of words) {
      const test = current ? `${current} ${w}` : w;
      if (ctx.measureText(test).width <= maxWidth) {
        current = test;
      } else {
        if (current) lines.push(current);
        current = w;
        if (lines.length >= maxLines) break;
      }
    }
    if (current && lines.length < maxLines) lines.push(current);
    return lines;
  }

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

  function exportPNG(schedule, blocks, options) {
    const { showSaturday, visibleBlocks, theme } = options;
    const isDark = theme !== "light";
    const numDays = showSaturday ? 6 : 5;

    const scale = 2;
    const timeColW = 104;
    const dayColW = 210;
    const headerH = 74;
    const dayHeaderH = 42;
    const blockH = 56;
    const pad = 24;

    const gridW = timeColW + numDays * dayColW;
    const gridH = dayHeaderH + visibleBlocks.length * blockH;
    const canvasW = gridW + pad * 2;
    const canvasH = headerH + gridH + pad * 2;

    const canvas = document.createElement("canvas");
    canvas.width = canvasW * scale;
    canvas.height = canvasH * scale;
    const ctx = canvas.getContext("2d");
    ctx.scale(scale, scale);

    // Colors
    const bg = isDark ? "#0f172a" : "#f8fafc";
    const cardBg = isDark ? "#1e293b" : "#ffffff";
    const headerBg = isDark ? "#162033" : "#f1f5f9";
    const border = isDark ? "#334155" : "#cbd5e1";
    const subtle = isDark ? "rgba(148,163,184,0.16)" : "rgba(15,23,42,0.08)";
    const textMain = isDark ? "#f1f5f9" : "#0f172a";
    const textMuted = isDark ? "#94a3b8" : "#64748b";

    // Background
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvasW, canvasH);

    // Title
    ctx.fillStyle = textMain;
    ctx.font = "bold 22px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
    ctx.fillText("Horario Semanal", pad, pad + 26);

    ctx.fillStyle = textMuted;
    ctx.font = "13px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
    ctx.fillText(schedule.term || "Ellucian Banner · Horario Visual", pad, pad + 48);

    const gx = pad;
    const gy = pad + headerH;

    // Grid container
    roundRect(ctx, gx, gy, gridW, gridH, 12);
    ctx.fillStyle = cardBg;
    ctx.fill();
    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Day Headers
    ctx.fillStyle = headerBg;
    roundRect(ctx, gx, gy, gridW, dayHeaderH, 12);
    ctx.fill();

    ctx.strokeStyle = border;
    ctx.beginPath();
    ctx.moveTo(gx, gy + dayHeaderH);
    ctx.lineTo(gx + gridW, gy + dayHeaderH);
    ctx.stroke();

    ctx.fillStyle = textMain;
    ctx.font = "bold 14px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Bloque", gx + timeColW / 2, gy + 26);
    for (let d = 0; d < numDays; d++) {
      const cx = gx + timeColW + d * dayColW + dayColW / 2;
      ctx.fillText(DAY_NAMES[d], cx, gy + 26);
    }
    ctx.textAlign = "left";

    // Vertical dividers
    for (let d = 0; d <= numDays; d++) {
      const lx = gx + timeColW + d * dayColW;
      ctx.strokeStyle = d === 0 ? border : subtle;
      ctx.beginPath();
      ctx.moveTo(lx, gy);
      ctx.lineTo(lx, gy + gridH);
      ctx.stroke();
    }

    // Block rows & labels
    visibleBlocks.forEach((ub, i) => {
      const y = gy + dayHeaderH + i * blockH;
      if (i > 0) {
        const prevUb = visibleBlocks[i - 1];
        ctx.strokeStyle = prevUb.breakAfter ? border : subtle;
        ctx.lineWidth = prevUb.breakAfter ? 1.5 : 1;
        ctx.beginPath();
        ctx.moveTo(gx, y);
        ctx.lineTo(gx + gridW, y);
        ctx.stroke();
        ctx.lineWidth = 1;
      }

      ctx.textAlign = "center";
      ctx.fillStyle = textMain;
      ctx.font = "bold 11px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
      ctx.fillText(ub.label, gx + timeColW / 2, y + 23);

      ctx.fillStyle = textMuted;
      ctx.font = "11px ui-monospace, Menlo, Consolas, monospace";
      ctx.fillText(`${ub.startText} - ${ub.endText}`, gx + timeColW / 2, y + 39);
    });
    ctx.textAlign = "left";

    // Draw class blocks (supporting side-by-side layout for overlaps)
    for (const blk of blocks) {
      if (blk.day >= numDays) continue;

      const yStart = mapMinToY(blk.startMin, visibleBlocks, blockH);
      const yEnd = mapMinToY(blk.endMin, visibleBlocks, blockH);

      const totalCols = blk._totalCols || 1;
      const colIdx = blk._col || 0;
      const colW = (dayColW - 8) / totalCols;

      const x = gx + timeColW + blk.day * dayColW + 4 + colIdx * colW + (colIdx > 0 ? 1 : 0);
      const y = gy + dayHeaderH + yStart + 2;
      const w = colW - (totalCols > 1 ? 2 : 0);
      const h = Math.max(26, yEnd - yStart - 4);

      roundRect(ctx, x, y, w, h, 8);
      ctx.fillStyle = blk.color;
      ctx.fill();

      // Left accent bar
      ctx.fillStyle = "rgba(255,255,255,0.65)";
      ctx.fillRect(x, y + 4, 3, h - 8);

      // Text inside block
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 12px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
      const titleLines = wrapLines(ctx, blk.courseTitle, w - 16, 2);
      let ty = y + 16;
      for (const line of titleLines) {
        ctx.fillText(line, x + 9, ty);
        ty += 14;
      }

      if (h >= 46) {
        ctx.font = "11px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
        ctx.fillStyle = "rgba(255,255,255,0.92)";
        ctx.fillText(`${formatMin(blk.startMin)} - ${formatMin(blk.endMin)}`, x + 9, ty + 1);
        ty += 14;
      }

      if (h >= 52 && blk.room) {
        ctx.font = "600 11px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
        const roomFormatted = BannerParser.formatRoom(blk.room);
        const roomShort = roomFormatted.length > 26 ? roomFormatted.slice(0, 25) + "…" : roomFormatted;
        ctx.fillText(`📍 ${roomShort}`, x + 9, ty + 1);
      }
    }

    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "Horario_Semanal.png";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }, "image/png");
  }

  return { exportPNG };
})();
