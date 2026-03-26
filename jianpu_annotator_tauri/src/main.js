/**
 * 简谱标注器 - 主入口
 * Ported from main_window.py
 */

import { JianpuRenderer, CELL_WIDTH, CELL_HEIGHT } from './renderer.js';
import { NoteAnnotation, AnnotationProject, MultiRowAnnotationProject, loadParsedNotesCsv } from './annotation.js';
import { open, save } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';

// Application state
const state = {
  project: null,
  selectedIdx: -1,
  selectedRow: 0,
  scrollX: 0,
  csvData: [],
  csvPath: '',
  viewMode: 'single',  // 'single' or 'all'
  allProjects: [],       // Array of projects for "all" mode
  rowRenderers: []       // Array of renderers, one per row in "all" mode
};

// DOM elements
const elements = {
  csvPath: document.getElementById('csv-path'),
  lineNumber: document.getElementById('line-number'),
  beatsPerMeasure: document.getElementById('beats-per-measure'),
  zoomLevel: document.getElementById('zoom-level'),
  zoomDisplay: document.getElementById('zoom-display'),
  viewMode: document.getElementById('view-mode'),
  btnBrowse: document.getElementById('btn-browse'),
  btnLoadLine: document.getElementById('btn-load-line'),
  btnImport: document.getElementById('btn-import'),
  btnExport: document.getElementById('btn-export'),
  btnAutoBan: document.getElementById('btn-auto-ban'),
  canvasScroll: document.getElementById('canvas-scroll'),
  singleRowView: document.getElementById('single-row-view'),
  allRowsView: document.getElementById('all-rows-view'),
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

      // Auto load all rows in multi-row mode
      state.allProjects = state.csvData.map((row) => {
        const rowNotes = row.notes.map((v, i) => new NoteAnnotation(i, v, 0, 0, 0));
        return new AnnotationProject(row.source, rowNotes);
      });

      state.viewMode = 'all';
      elements.viewMode.value = 'all';
      state.project = state.allProjects[0];
      state.selectedRow = 0;
      state.selectedIdx = -1;
      state.scrollX = 0;

      const zoomScale = parseInt(elements.zoomLevel.value, 10) / 100;
      renderer.setZoom(zoomScale);
      setupAllRowsView();
      redrawCanvas();

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
  state.selectedRow = 0;
  state.scrollX = 0;

  // Prepare all projects for "all" mode
  state.allProjects = state.csvData.map((row, idx) => {
    const rowNotes = row.notes.map((v, i) => new NoteAnnotation(i, v, 0, 0, 0));
    return new AnnotationProject(row.source, rowNotes);
  });

  // Resize canvas
  const zoomScale = parseInt(elements.zoomLevel.value, 10) / 100;
  renderer.setZoom(zoomScale);

  if (state.viewMode === 'all') {
    setupAllRowsView();
  } else {
    renderer.resize(notes.length);
  }
  redrawCanvas();
  setStatus(`加载第 ${lineNum} 行，共 ${notes.length} 个音符`);
}

// Setup multiple rows for "all" mode
function setupAllRowsView() {
  elements.singleRowView.style.display = 'none';
  elements.allRowsView.style.display = 'flex';

  // Clear existing
  elements.allRowsView.innerHTML = '';
  state.rowRenderers = [];

  const zoomScale = parseInt(elements.zoomLevel.value, 10) / 100;

  // Create a row for each project
  state.allProjects.forEach((project, rowIdx) => {
    const rowDiv = document.createElement('div');
    rowDiv.className = 'canvas-row';

    const label = document.createElement('span');
    label.className = 'row-label';
    label.textContent = `行${rowIdx + 1}`;
    rowDiv.appendChild(label);

    const canvas = document.createElement('canvas');
    // Use a fixed base height that will be scaled, but canvas-row takes remaining space
    canvas.height = 100;
    rowDiv.appendChild(canvas);

    const scrollDiv = document.createElement('div');
    scrollDiv.className = 'canvas-scroll-inner';
    scrollDiv.style.overflowX = 'auto';
    scrollDiv.style.width = '100%';
    scrollDiv.style.flex = '1';
    scrollDiv.appendChild(canvas);
    rowDiv.appendChild(scrollDiv);

    elements.allRowsView.appendChild(rowDiv);

    // Create renderer for this row
    const rowRenderer = new JianpuRenderer(canvas);
    rowRenderer.setZoom(zoomScale);
    rowRenderer.resize(project.notes.length);
    state.rowRenderers.push({ renderer: rowRenderer, scrollEl: scrollDiv, canvas: canvas });

    // Bind scroll event
    scrollDiv.addEventListener('scroll', () => {
      const scrollX = scrollDiv.scrollLeft;
      rowRenderer.draw(project.notes, state.selectedRow === rowIdx ? state.selectedIdx : -1, scrollX);
    });

    // Bind click event
    canvas.addEventListener('click', (e) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const idx = rowRenderer.hitTest(x, scrollDiv.scrollLeft);

      if (idx >= 0 && idx < project.notes.length) {
        state.project = project;
        state.selectedRow = rowIdx;
        state.selectedIdx = idx;
        redrawCanvas();
        updateSelectedInfo();
        setStatus(`选中行${rowIdx + 1} 音符${idx + 1}: ${project.notes[idx].value}`);
      }
    });
  });
}

async function onImport() {
  try {
    const selected = await open({
      title: '选择 JSON 文件',
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });

    if (selected) {
      const content = await readTextFile(selected);
      const data = JSON.parse(content);

      if (data.type === 'multi-row') {
        // Import multi-row project
        const multiProject = MultiRowAnnotationProject.fromDict(data);
        state.allProjects = multiProject.projects;
        state.viewMode = 'all';
        elements.viewMode.value = 'all';
        state.project = state.allProjects[0];
        state.selectedRow = 0;
        setupAllRowsView();
        setStatus(`导入成功，共 ${state.allProjects.length} 行`);
      } else {
        // Import single-row project
        state.project = AnnotationProject.fromDict(data);
        state.viewMode = 'single';
        elements.viewMode.value = 'single';
        state.allProjects = [];
      }
      state.selectedIdx = -1;
      state.scrollX = 0;

      const zoomScale = parseInt(elements.zoomLevel.value, 10) / 100;
      renderer.setZoom(zoomScale);

      if (state.viewMode === 'all') {
        setupAllRowsView();
      } else {
        renderer.resize(state.project.notes.length);
      }
      redrawCanvas();
      setStatus(`导入成功，共 ${state.viewMode === 'all' ? state.allProjects.length + '行' : state.project.notes.length + '个音符'}`);
    }
  } catch (err) {
    setStatus(`导入失败: ${err}`);
  }
}

async function onExport() {
  if (!state.project && state.viewMode !== 'all') {
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
      let jsonContent;
      if (state.viewMode === 'all' && state.allProjects.length > 0) {
        const multiProject = new MultiRowAnnotationProject(state.allProjects);
        jsonContent = multiProject.toJson();
      } else {
        jsonContent = state.project.toJson();
      }
      await writeTextFile(savePath, jsonContent);
      setStatus(`导出成功: ${savePath}`);
    }
  } catch (err) {
    setStatus(`导出失败: ${err}`);
  }
}

// Auto-ban: mark the first note of each measure as ban
function onAutoBan() {
  const beatsPerMeasure = parseInt(elements.beatsPerMeasure.value, 10) || 4;
  console.log('[AutoBan] 开始自动标注板', { beatsPerMeasure, viewMode: state.viewMode });

  if (state.viewMode === 'all' && state.allProjects.length > 0) {
    // Apply to all rows
    let totalMarked = 0;
    state.allProjects.forEach((project) => {
      let cumulativeBeats = 0;
      let measureStartIdx = 0;

      // 先把每一行的第一个音标注为 ban
      if (project.notes.length > 0 && !project.notes[0].ban) {
        project.notes[0].ban = 1;
        totalMarked++;
        console.log(`[AutoBan] all模式 project 第一音 idx=0 标注ban=1`);
      }

      for (let idx = 0; idx < project.notes.length; idx++) {
        const note = project.notes[idx];

        // Get note beats from renderer
        const { beats, isN } = renderer.getNoteInfo(note);
        console.log(`[AutoBan] all模式 project[0] idx=${idx} note.value=${note.value} beats=${beats} isN=${isN} cumulativeBeats=${cumulativeBeats.toFixed(2)}`, { note });

        if (isN && idx > 0) {
          const prevInfo = renderer.getNoteInfo(project.notes[idx - 1]);
          cumulativeBeats += prevInfo.beats * 0.5;
          console.log(`[AutoBan] all模式 idx=${idx} 是N符，加前音符 ${prevInfo.beats}*0.5=${prevInfo.beats * 0.5} 到 cumulativeBeats`);
        } else {
          cumulativeBeats += beats;
        }

        // Check if we completed a measure
        if (cumulativeBeats >= beatsPerMeasure && idx > 0) {
          console.log(`[AutoBan] all模式 idx=${idx} 触发小节边界! cumulativeBeats=${cumulativeBeats.toFixed(2)} >= beatsPerMeasure=${beatsPerMeasure}`);
          // 标注的是 idx+1（下一音），因为 idx 是当前小节的最后一个音
          const nextIdx = idx + 1;
          if (nextIdx < project.notes.length && !project.notes[nextIdx].ban) {
            project.notes[nextIdx].ban = 1;
            totalMarked++;
            console.log(`[AutoBan] all模式 idx=${idx} 标注ban=1 at nextIdx=${nextIdx} note.value=${project.notes[nextIdx].value}`);
          } else if (nextIdx < project.notes.length) {
            console.log(`[AutoBan] all模式 idx=${idx} nextIdx=${nextIdx} 已有ban，跳过`);
          }
          measureStartIdx = nextIdx + 1;  // 下一小节的起始位置是 nextIdx+1
          cumulativeBeats = cumulativeBeats % beatsPerMeasure;
          console.log(`[AutoBan] all模式 idx=${idx} 更新 measureStartIdx=${measureStartIdx} remainder cumulativeBeats=${cumulativeBeats.toFixed(2)}`);
        }
      }
    });
    console.log(`[AutoBan] all模式完成，共标注 ${totalMarked} 个小节`);
    setStatus(`自动标注板完成，共标注 ${totalMarked} 个小节起始音`);
  } else if (state.project) {
    // Apply to single row
    let cumulativeBeats = 0;
    let measureStartIdx = 0;
    let totalMarked = 0;

    console.log(`[AutoBan] 单行模式开始，notes.length=${state.project.notes.length}`);

    // 先把第一个音标注为 ban
    if (state.project.notes.length > 0 && !state.project.notes[0].ban) {
      state.project.notes[0].ban = 1;
      totalMarked++;
      console.log(`[AutoBan] 单行模式 第一音 idx=0 标注ban=1`);
    }

    for (let idx = 0; idx < state.project.notes.length; idx++) {
      const note = state.project.notes[idx];

      const { beats, isN } = renderer.getNoteInfo(note);
      console.log(`[AutoBan] 单行模式 idx=${idx} note.value=${note.value} beats=${beats} isN=${isN} cumulativeBeats=${cumulativeBeats.toFixed(2)}`, { note });

      if (isN && idx > 0) {
        const prevInfo = renderer.getNoteInfo(state.project.notes[idx - 1]);
        cumulativeBeats += prevInfo.beats * 0.5;
        console.log(`[AutoBan] 单行模式 idx=${idx} 是N符，加前音符 ${prevInfo.beats}*0.5=${prevInfo.beats * 0.5}`);
      } else {
        cumulativeBeats += beats;
      }

      // Check if we completed a measure
      if (cumulativeBeats >= beatsPerMeasure && idx > 0) {
        console.log(`[AutoBan] 单行模式 idx=${idx} 触发小节边界! cumulativeBeats=${cumulativeBeats.toFixed(2)} >= beatsPerMeasure=${beatsPerMeasure}`);
        // 标注的是 idx+1（下一音），因为 idx 是当前小节的最后一个音
        const nextIdx = idx + 1;
        if (nextIdx < state.project.notes.length && !state.project.notes[nextIdx].ban) {
          state.project.notes[nextIdx].ban = 1;
          totalMarked++;
          console.log(`[AutoBan] 单行模式 idx=${idx} 标注ban=1 at nextIdx=${nextIdx} note.value=${state.project.notes[nextIdx].value}`);
        } else if (nextIdx < state.project.notes.length) {
          console.log(`[AutoBan] 单行模式 idx=${idx} nextIdx=${nextIdx} 已有ban，跳过`);
        }
        measureStartIdx = nextIdx + 1;  // 下一小节的起始位置是 nextIdx+1
        cumulativeBeats = cumulativeBeats % beatsPerMeasure;
        console.log(`[AutoBan] 单行模式 idx=${idx} 更新 measureStartIdx=${measureStartIdx} remainder cumulativeBeats=${cumulativeBeats.toFixed(2)}`);
      }
    }
    setStatus(`自动标注板完成，共标注 ${totalMarked} 个小节起始音`);
    console.log(`[AutoBan] 单行模式完成，共标注 ${totalMarked} 个小节`);
  } else {
    setStatus('请先加载简谱数据');
    return;
  }

  redrawCanvas();
}

// Single-row canvas click handler
function onSingleCanvasClick(e) {
  if (!state.project || state.viewMode === 'all') return;

  const rect = elements.canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;

  const idx = renderer.hitTest(x, state.scrollX);
  if (idx >= 0 && idx < state.project.notes.length) {
    state.selectedIdx = idx;
    state.selectedRow = 0;
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
  renderer.beatsPerMeasure = parseInt(elements.beatsPerMeasure.value, 10) || 4;
  const zoomScale = parseInt(elements.zoomLevel.value, 10) / 100;
  renderer.setZoom(zoomScale);

  if (state.viewMode === 'all' && state.allProjects.length > 0) {
    // Switch view if needed
    if (elements.singleRowView.style.display !== 'none') {
      elements.singleRowView.style.display = 'none';
    }
    if (elements.allRowsView.style.display === 'none') {
      setupAllRowsView();
    }

    // Update all row renderers
    state.rowRenderers.forEach((rowData, rowIdx) => {
      rowData.renderer.beatsPerMeasure = renderer.beatsPerMeasure;
      rowData.renderer.setZoom(zoomScale);

      rowData.renderer.resize(state.allProjects[rowIdx].notes.length);

      const scrollX = rowData.scrollEl.scrollLeft;
      const selectedIdx = (state.selectedRow === rowIdx) ? state.selectedIdx : -1;
      rowData.renderer.draw(state.allProjects[rowIdx].notes, selectedIdx, scrollX);
    });
  } else if (state.project) {
    // Single row mode
    if (elements.allRowsView.style.display !== 'none') {
      elements.allRowsView.style.display = 'none';
      elements.singleRowView.style.display = 'block';
    }
    renderer.resize(state.project.notes.length);
    renderer.draw(state.project.notes, state.selectedIdx, state.scrollX);
  } else {
    renderer.clear();
  }
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
elements.btnAutoBan.addEventListener('click', onAutoBan);
elements.canvas.addEventListener('click', onSingleCanvasClick);
elements.canvasScroll.addEventListener('scroll', onCanvasScroll);
elements.beatsPerMeasure.addEventListener('change', redrawCanvas);

// Zoom control
elements.zoomLevel.addEventListener('input', () => {
  elements.zoomDisplay.textContent = elements.zoomLevel.value + '%';
  redrawCanvas();
});

// View mode toggle
elements.viewMode.addEventListener('change', () => {
  state.viewMode = elements.viewMode.value;
  state.selectedIdx = -1;
  state.selectedRow = 0;
  state.scrollX = 0;
  redrawCanvas();
  setStatus(state.viewMode === 'all' ? '切换到全部模式' : '切换到单行模式');
});

document.addEventListener('keydown', onKeyDown);

// Initial status
setStatus('就绪');
