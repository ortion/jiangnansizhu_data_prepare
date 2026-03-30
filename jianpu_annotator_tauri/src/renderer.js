/**
 * 简谱 Canvas 渲染器
 * Ported from jianpu_renderer.py
 */

import { parseNoteValue } from "./annotation.js";

// Renderer constants
const CELL_WIDTH = 24;
const CELL_HEIGHT = 100;
const NOTE_SIZE = 24;
const DOT_SIZE = 3;
const MARKER_SIZE = 8;
const LINE_WIDTH = 1.5;

// 每一拍前面的间距（可调大小）
const BEAT_GAP = 12;

// Colors
const COLOR_SELECTED_BG = "#E6F0FF";
const COLOR_BAN = "#FF6600";
const COLOR_YAN = "#00AA55";
const COLOR_GU_GAN = "#FF0000";
const COLOR_NOTE = "#000000";
const COLOR_DOT = "#666666";

class JianpuRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.beatsPerMeasure = 4;
    this.zoomScale = 1.0;
    this.noteXPositions = []; // 保存音符位置
    this.noteWidths = []; // 每个音符实际宽度
  }

  /**
   * Resize canvas based on number of notes
   */
  resize(noteCount, rowCount = 1) {
    const cellHeight = CELL_HEIGHT * this.zoomScale;
    const width = Math.max(noteCount * CELL_WIDTH * this.zoomScale * 1.5, 800);
    const height = cellHeight * rowCount;
    this.canvas.width = width;
    this.canvas.height = height;
  }

  /**
   * Set zoom level
   */
  setZoom(scale) {
    this.zoomScale = scale;
  }

  /**
   * Clear the canvas
   */
  clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /**
   * Calculate beats for a single note
   * Returns { beats, extendsHalf }
   */
  getNoteInfo(note) {
    const parsed = parseNoteValue(note.value);
    let beats = 1; // default

    if (parsed.prefix.includes("z")) beats = 0.5;
    else if (parsed.prefix.includes("x")) beats = 0.25;
    else if (parsed.prefix.includes("c")) beats = 0.125;

    if (parsed.suffix === ":") beats = 2;
    const isN = parsed.prefix.includes("N");
    if (isN) {
      beats = beats * 1.5;
    }

    return { beats, isN };
  }

  /**
   * Draw all notes (single row mode)
   */
  draw(notes, selectedIdx, scrollX) {
    this.drawMultipleRows([notes], selectedIdx, 0, scrollX);
  }

  /**
   * Draw multiple rows (all mode)
   */
  drawMultipleRows(allRows, selectedIdx, selectedRow, scrollX) {
    this.clear();

    const scaledCellWidth = CELL_WIDTH * this.zoomScale;
    const scaledCellHeight = CELL_HEIGHT * this.zoomScale;
    const scaledBeatGap = BEAT_GAP * this.zoomScale;

    for (let row = 0; row < allRows.length; row++) {
      const notes = allRows[row];
      const rowY = row * scaledCellHeight;

      // 1. 计算节拍信息
      const noteBeatsInfo = [];
      let cumulativeBeats = 0;

      for (let idx = 0; idx < notes.length; idx++) {
        const note = notes[idx];
        const noteInfo = this.getNoteInfo(note);
        let beatValue = noteInfo.beats;

        if (noteInfo.isN && idx > 0) {
          const prevBeatValue = noteBeatsInfo[idx - 1].beatValue;
          beatValue = prevBeatValue * 0.5;
        }

        noteBeatsInfo.push({
          note: note,
          beatValue,
          cumulativeStart: cumulativeBeats,
          cumulativeEnd: cumulativeBeats + beatValue,
        });
        cumulativeBeats += beatValue;
      }

      // 2. 计算每个音符宽度 + 位置（核心修改）
      this.noteXPositions = [];
      this.noteWidths = [];
      let currentX = 0;
      let lastBeatFloor = -1;

      for (let idx = 0; idx < notes.length; idx++) {
        const info = noteBeatsInfo[idx];
        const note = notes[idx];
        const parsed = parseNoteValue(note.value);

        // 新拍间距
        const currentBeatFloor = Math.floor(info.cumulativeStart);
        if (currentBeatFloor !== lastBeatFloor) {
          currentX += scaledBeatGap;
          lastBeatFloor = currentBeatFloor;
        }

        // 核心：二分音符占 1个CELL，四分音符也占1个CELL
        const width = scaledCellWidth;
        this.noteWidths.push(width);
        this.noteXPositions.push(currentX);
        currentX += width;
      }

      // 3. 绘制音符
      for (let idx = 0; idx < notes.length; idx++) {
        const x = this.noteXPositions[idx] - scrollX;
        const w = this.noteWidths[idx];
        if (x + w < 0 || x > this.canvas.width) continue;

        const isSelected = row === selectedRow && idx === selectedIdx;
        this.drawNote(notes[idx], x, rowY, w, isSelected);
      }

      // 4. 小节线
      const totalBeats = cumulativeBeats;
      const measureCount = Math.floor(totalBeats / this.beatsPerMeasure);

      for (let measure = 1; measure <= measureCount; measure++) {
        const measureBeats = measure * this.beatsPerMeasure;
        let sumBeats = 0;

        for (let idx = 0; idx < noteBeatsInfo.length; idx++) {
          const info = noteBeatsInfo[idx];
          const nextSum = sumBeats + info.beatValue;

          if (measureBeats > sumBeats && measureBeats <= nextSum) {
            const ratio = (measureBeats - sumBeats) / info.beatValue;
            const mx =
              this.noteXPositions[idx] + ratio * this.noteWidths[idx] - scrollX;
            this.drawMeasureLine(mx, rowY, scaledCellHeight);
            break;
          }
          sumBeats = nextSum;
        }
      }
    }
  }

  drawMeasureLine(x, rowY, rowHeight) {
    this.ctx.strokeStyle = "#999999";
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(x, rowY);
    this.ctx.lineTo(x, rowY + rowHeight);
    this.ctx.stroke();
  }

  // 绘制音符（支持动态宽度）
  drawNote(note, x, rowY, width, selected) {
    const parsed = parseNoteValue(note.value);
    const s = this.zoomScale;
    const scaledNoteSize = NOTE_SIZE * s;
    const scaledDotSize = DOT_SIZE * s;

    const cx = x + width / 2;
    const cy = rowY + (CELL_HEIGHT * s) / 2;

    if (selected) {
      this.ctx.fillStyle = COLOR_SELECTED_BG;
      this.ctx.fillRect(
        x + 2 * s,
        rowY + 2 * s,
        width - 4 * s,
        CELL_HEIGHT * s - 4 * s,
      );
    }

    if (parsed.isHighOctave) this.drawDot(cx, cy - 24 * s, scaledDotSize);
    this.drawNoteNumber(
      parsed.note || "?",
      cx,
      cy,
      this.getNoteColor(note),
      scaledNoteSize,
    );
    if (parsed.isLowOctave) this.drawDot(cx, cy + 24 * s, scaledDotSize);
    if (parsed.beatLines > 0)
      this.drawBeatLines(cx, cy + 32 * s, parsed.beatLines, s);
    if (parsed.isN)
      this.drawNDot(cx + 15 * s, cy + 10 * s, scaledDotSize * 0.7);
    if (parsed.suffix === ":") this.drawSuffix("-", cx + 13 * s, cy, 16 * s);
  }

  drawDot(x, y, size) {
    this.ctx.beginPath();
    this.ctx.arc(x, y, size, 0, Math.PI * 2);
    this.ctx.fillStyle = COLOR_DOT;
    this.ctx.fill();
  }

  drawNDot(x, y, size) {
    this.drawDot(x, y, size);
  }

  drawNoteNumber(note, cx, cy, color, size) {
    this.ctx.font = `bold ${size}px sans-serif`;
    this.ctx.fillStyle = color;
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";
    this.ctx.fillText(note, cx, cy);
  }

  getNoteColor(note) {
    if (note.guGan) return COLOR_GU_GAN;
    if (note.yan) return COLOR_YAN;
    if (note.ban) return COLOR_BAN;
    return COLOR_NOTE;
  }

  drawBeatLines(cx, y, count, scale) {
    this.ctx.strokeStyle = COLOR_DOT;
    this.ctx.lineWidth = LINE_WIDTH * scale;
    for (let i = 0; i < count; i++) {
      const ly = y + i * 6 * scale;
      this.ctx.beginPath();
      this.ctx.moveTo(cx - 12 * scale, ly);
      this.ctx.lineTo(cx + 12 * scale, ly);
      this.ctx.stroke();
    }
  }

  drawSuffix(suffix, x, y, fontSize) {
    this.ctx.font = `${fontSize}px sans-serif`;
    this.ctx.fillStyle = COLOR_DOT;
    this.ctx.textAlign = "left";
    this.ctx.textBaseline = "middle";
    this.ctx.fillText(suffix, x, y);
  }

  // 精准点击
  hitTest(x, scrollX) {
    const worldX = x + scrollX;
    for (let i = 0; i < this.noteXPositions.length; i++) {
      const l = this.noteXPositions[i];
      const r = l + this.noteWidths[i];
      if (worldX >= l && worldX <= r) return i;
    }
    return -1;
  }
}

export { JianpuRenderer, CELL_WIDTH, CELL_HEIGHT };
