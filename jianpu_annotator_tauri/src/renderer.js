/**
 * 简谱 Canvas 渲染器
 * Ported from jianpu_renderer.py
 */

import { parseNoteValue } from './annotation.js';

// Renderer constants
const CELL_WIDTH = 60;
const CELL_HEIGHT = 100;
const NOTE_SIZE = 36;
const DOT_SIZE = 5;
const MARKER_SIZE = 8;
const LINE_WIDTH = 1.5;

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
    this.ctx = canvas.getContext('2d');
    this.beatsPerMeasure = 4;
  }

  /**
   * Resize canvas based on number of notes
   */
  resize(noteCount) {
    const width = Math.max(noteCount * CELL_WIDTH, 800);
    this.canvas.width = width;
    this.canvas.height = CELL_HEIGHT;
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

    // Handle prefix modifiers
    if (parsed.prefix.includes('z')) beats = 0.5;      // 八分
    else if (parsed.prefix.includes('x')) beats = 0.25; // 十六分
    else if (parsed.prefix.includes('c')) beats = 0.125; // 三十二分
    // N: handled in draw loop

    // Handle suffix modifiers
    if (parsed.suffix === ':') beats = 2; // 延长音

    console.log(`getNoteInfo: value="${note.value}", prefix="${parsed.prefix}", suffix="${parsed.suffix}", beats=${beats}, isN=${parsed.prefix.includes('N')}`);
    return { beats, isN: parsed.prefix.includes('N') };
  }

  /**
   * Draw all notes
   */
  draw(notes, selectedIdx, scrollX) {
    this.clear();

    let cumulativeBeats = 0;

    console.log(`=== draw start, beatsPerMeasure=${this.beatsPerMeasure}, total=${notes.length} notes ===`);

    for (let idx = 0; idx < notes.length; idx++) {
      const x = idx * CELL_WIDTH - scrollX;
      if (x < -CELL_WIDTH || x > this.canvas.width) continue;

      this.drawNote(notes[idx], x, idx === selectedIdx);

      const { beats, isN } = this.getNoteInfo(notes[idx]);

      if (isN && idx > 0) {
        // N: extend previous note by half its beats
        const prevInfo = this.getNoteInfo(notes[idx - 1]);
        cumulativeBeats += prevInfo.beats * 0.5;
        console.log(`  note ${idx}: N modifier, adding ${prevInfo.beats * 0.5} to cumulative=${cumulativeBeats}`);
      } else {
        cumulativeBeats += beats;
        console.log(`  note ${idx}: adding ${beats} to cumulative=${cumulativeBeats}`);
      }

      // Check if cumulativeBeats reached a new measure boundary
      if (cumulativeBeats % this.beatsPerMeasure === 0 && cumulativeBeats > 0) {
        // Draw measure line at the END of current note (between note n and n+1)
        const lineX = (idx + 1) * CELL_WIDTH - scrollX;
        console.log(`  >>> DRAW MEASURE LINE at x=${lineX} (after note ${idx}, cumulative=${cumulativeBeats})`);
        if (lineX > 0) {
          this.drawMeasureLine(lineX);
        }
      }
    }
    console.log(`=== draw end, final cumulativeBeats=${cumulativeBeats} ===`);
  }

  drawMeasureLine(x) {
    this.ctx.strokeStyle = "#999999";
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(x, 0);
    this.ctx.lineTo(x, this.canvas.height);
    this.ctx.stroke();
  }

  /**
   * Draw a single note
   */
  drawNote(note, x, selected) {
    const parsed = parseNoteValue(note.value);
    const cx = x + CELL_WIDTH / 2;
    const cy = CELL_HEIGHT / 2;

    // 1. Draw selected background
    if (selected) {
      this.drawSelectedBg(x, 0);
    }

    // 2. High octave dot (directly above note center)
    if (parsed.isHighOctave) {
      this.drawDot(cx, cy - 30);
    }

    // 3. Note number (colored by annotation)
    const noteColor = this.getNoteColor(note);
    this.drawNoteNumber(parsed.note || "?", cx, cy, noteColor);

    // 4. Low octave dot (directly below note center)
    if (parsed.isLowOctave) {
      this.drawDot(cx, cy + 30);
    }

    // 5. Beat lines below
    if (parsed.beatLines > 0) {
      this.drawBeatLines(cx, cy + 30, parsed.beatLines);
    }

    // 6. Suffix (to the right of note)
    if (parsed.suffix === ':') {
      this.drawSuffix(':', cx + 18, cy);
    }
  }

  drawSelectedBg(x, y) {
    this.ctx.fillStyle = COLOR_SELECTED_BG;
    this.ctx.fillRect(x + 2, y + 2, CELL_WIDTH - 4, CELL_HEIGHT - 4);
  }

  drawMarkers(note, cx, y) {
    const markers = [];
    if (note.ban) markers.push({ label: '板', color: COLOR_BAN });
    if (note.yan) markers.push({ label: '眼', color: COLOR_YAN });
    if (note.guGan) markers.push({ label: '骨', color: COLOR_GU_GAN });

    if (markers.length === 0) return;

    const startX = cx - (markers.length - 1) * 18 / 2;
    markers.forEach((marker, i) => {
      const mx = startX + i * 18;
      this.drawMarkerCircle(mx, y, marker.color);
    });
  }

  drawMarkerCircle(x, y, color) {
    this.ctx.beginPath();
    this.ctx.arc(x, y, MARKER_SIZE, 0, Math.PI * 2);
    this.ctx.fillStyle = color;
    this.ctx.fill();
  }

  drawDot(x, y) {
    this.ctx.beginPath();
    this.ctx.arc(x, y, DOT_SIZE, 0, Math.PI * 2);
    this.ctx.fillStyle = COLOR_DOT;
    this.ctx.fill();
  }

  drawNoteNumber(note, cx, cy, color = COLOR_NOTE) {
    this.ctx.font = `bold ${NOTE_SIZE}px sans-serif`;
    this.ctx.fillStyle = color;
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText(note, cx, cy);
  }

  /**
   * Get color for note based on ban/yan/gu_gan annotations
   * Priority: gu_gan > yan > ban
   */
  getNoteColor(note) {
    if (note.guGan) return COLOR_GU_GAN;
    if (note.yan) return COLOR_YAN;
    if (note.ban) return COLOR_BAN;
    return COLOR_NOTE;
  }

  drawBeatLines(cx, y, count) {
    this.ctx.strokeStyle = COLOR_DOT;
    this.ctx.lineWidth = LINE_WIDTH;

    for (let i = 0; i < count; i++) {
      const ly = y + i * 8;
      this.ctx.beginPath();
      this.ctx.moveTo(cx - 12, ly);
      this.ctx.lineTo(cx + 12, ly);
      this.ctx.stroke();
    }
  }

  drawSuffix(suffix, x, y) {
    this.ctx.font = `16px sans-serif`;
    this.ctx.fillStyle = COLOR_DOT;
    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText(suffix, x, y);
  }

  /**
   * Hit test - returns note index at given x position
   */
  hitTest(x, scrollX) {
    const idx = Math.floor((x + scrollX) / CELL_WIDTH);
    return idx;
  }
}

export { JianpuRenderer, CELL_WIDTH, CELL_HEIGHT };
