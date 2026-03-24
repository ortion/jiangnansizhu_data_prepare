/**
 * 简谱标注器 - 主入口
 * Ported from main_window.py
 */

import { JianpuRenderer, CELL_WIDTH, CELL_HEIGHT } from './renderer.js';
import { NoteAnnotation, AnnotationProject, loadParsedNotesCsv } from './annotation.js';
import { open, save } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';

// Application state
const state = {
  project: null,
  selectedIdx: -1,
  scrollX: 0,
  csvData: [],
  csvPath: ''
};

// DOM elements
const elements = {
  csvPath: document.getElementById('csv-path'),
  lineNumber: document.getElementById('line-number'),
  beatsPerMeasure: document.getElementById('beats-per-measure'),
  btnBrowse: document.getElementById('btn-browse'),
  btnLoadLine: document.getElementById('btn-load-line'),
  btnImport: document.getElementById('btn-import'),
  btnExport: document.getElementById('btn-export'),
  canvasScroll: document.getElementById('canvas-scroll'),
  canvas: document.getElementById('jianpu-canvas'),
  selectedInfo: document.getElementById('selected-info'),
  statusText: document.getElementById('status-text')
};

// Initialize renderer
const renderer = new JianpuRenderer(elements.canvas);
renderer.resize(1);

// Event handlers
async function onPickCsv() {
  try {
    const selected = await open({
      title: '选择 parsed_notes.csv',
      filters: [{ name: 'CSV', extensions: ['csv'] }]
    });

    if (selected) {
      elements.csvPath.value = selected;
      state.csvPath = selected;

      const content = await readTextFile(selected);
      state.csvData = loadParsedNotesCsv(content);

      if (!state.csvData.length) {
        setStatus('CSV 文件无有效数据');
        return;
      }

      setStatus(`加载成功，共 ${state.csvData.length} 行`);
    }
  } catch (err) {
    setStatus(`加载失败: ${err}`);
  }
}

async function onLoadLine() {
  if (!state.csvData.length) {
    setStatus('请先加载 CSV 文件');
    return;
  }

  const lineNum = parseInt(elements.lineNumber.value, 10);
  if (isNaN(lineNum) || lineNum < 1) {
    setStatus('请输入有效的行号');
    return;
  }

  const rowData = state.csvData.find(d => d.line === lineNum);
  if (!rowData) {
    setStatus(`行 ${lineNum} 无有效数据`);
    return;
  }

  // Create annotation project
  const notes = rowData.notes.map((v, i) => new NoteAnnotation(i, v, 0, 0, 0));
  state.project = new AnnotationProject(rowData.source, notes);
  state.selectedIdx = -1;
  state.scrollX = 0;

  // Resize canvas
  renderer.resize(notes.length);
  redrawCanvas();
  setStatus(`加载第 ${lineNum} 行，共 ${notes.length} 个音符`);
}

async function onImport() {
  try {
    const selected = await open({
      title: '选择 JSON 文件',
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });

    if (selected) {
      const content = await readTextFile(selected);
      state.project = AnnotationProject.fromJson(content);
      state.selectedIdx = -1;
      state.scrollX = 0;

      renderer.resize(state.project.notes.length);
      redrawCanvas();
      setStatus(`导入成功，共 ${state.project.notes.length} 个音符`);
    }
  } catch (err) {
    setStatus(`导入失败: ${err}`);
  }
}

async function onExport() {
  if (!state.project) {
    setStatus('请先加载或导入简谱');
    return;
  }

  try {
    const savePath = await save({
      title: '保存 JSON 文件',
      defaultPath: 'jianpu_annotation.json',
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });

    if (savePath) {
      await writeTextFile(savePath, state.project.toJson());
      setStatus(`导出成功: ${savePath}`);
    }
  } catch (err) {
    setStatus(`导出失败: ${err}`);
  }
}

function onCanvasClick(e) {
  if (!state.project) return;

  const rect = elements.canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;

  const idx = renderer.hitTest(x, state.scrollX);
  if (idx >= 0 && idx < state.project.notes.length) {
    state.selectedIdx = idx;
    redrawCanvas();
    updateSelectedInfo();
    setStatus(`选中音符 ${idx + 1}: ${state.project.notes[idx].value}`);
  }
}

function onCanvasScroll(e) {
  state.scrollX = e.target.scrollLeft;
  redrawCanvas();
}

function onKeyDown(e) {
  if (!state.project || state.selectedIdx < 0) return;

  const key = e.key.toUpperCase();
  const note = state.project.notes[state.selectedIdx];

  switch (key) {
    case 'B':
      note.toggleBan();
      redrawCanvas();
      updateSelectedInfo();
      setStatus(`音符 ${state.selectedIdx + 1}: 板=${note.ban ? '是' : '否'}`);
      e.preventDefault();
      break;
    case 'Y':
      note.toggleYan();
      redrawCanvas();
      updateSelectedInfo();
      setStatus(`音符 ${state.selectedIdx + 1}: 眼=${note.yan ? '是' : '否'}`);
      e.preventDefault();
      break;
    case 'G':
      note.toggleGuGan();
      redrawCanvas();
      updateSelectedInfo();
      setStatus(`音符 ${state.selectedIdx + 1}: 骨干音=${note.guGan ? '是' : '否'}`);
      e.preventDefault();
      break;
    case 'ARROWLEFT':
      if (state.selectedIdx > 0) {
        state.selectedIdx--;
        redrawCanvas();
        updateSelectedInfo();
      }
      e.preventDefault();
      break;
    case 'ARROWRIGHT':
      if (state.selectedIdx < state.project.notes.length - 1) {
        state.selectedIdx++;
        redrawCanvas();
        updateSelectedInfo();
      }
      e.preventDefault();
      break;
  }
}

function redrawCanvas() {
  if (!state.project) {
    renderer.clear();
    return;
  }
  renderer.beatsPerMeasure = parseInt(elements.beatsPerMeasure.value, 10) || 4;
  renderer.draw(state.project.notes, state.selectedIdx, state.scrollX);
}

function updateSelectedInfo() {
  if (!state.project || state.selectedIdx < 0) {
    elements.selectedInfo.textContent = '无选中音符';
    return;
  }

  const note = state.project.notes[state.selectedIdx];
  elements.selectedInfo.textContent =
    `音符: ${note.value}\n` +
    `板: ${note.ban ? '是' : '否'}\n` +
    `眼: ${note.yan ? '是' : '否'}\n` +
    `骨干音: ${note.guGan ? '是' : '否'}`;
}

function setStatus(msg) {
  elements.statusText.textContent = msg;
}

// Bind events
elements.btnBrowse.addEventListener('click', onPickCsv);
elements.btnLoadLine.addEventListener('click', onLoadLine);
elements.btnImport.addEventListener('click', onImport);
elements.btnExport.addEventListener('click', onExport);
elements.canvas.addEventListener('click', onCanvasClick);
elements.canvasScroll.addEventListener('scroll', onCanvasScroll);
elements.beatsPerMeasure.addEventListener('change', redrawCanvas);
document.addEventListener('keydown', onKeyDown);

// Initial status
setStatus('就绪');
