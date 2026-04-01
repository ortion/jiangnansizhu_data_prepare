/**
 * 简谱标注器 - 数据模型和解析逻辑
 * Ported from annotation_data.py
 */

// NoteAnnotation class
class NoteAnnotation {
  constructor(noteId, value, ban = 0, yan = 0, guGan = 0) {
    this.noteId = noteId;
    this.value = value;
    this.ban = ban;
    this.yan = yan;
    this.guGan = guGan;
  }

  toggleBan() {
    this.ban = 1 - this.ban;
  }

  toggleYan() {
    this.yan = 1 - this.yan;
  }

  toggleGuGan() {
    this.guGan = 1 - this.guGan;
  }

  toDict() {
    return {
      id: this.noteId,
      value: this.value,
      ban: this.ban,
      yan: this.yan,
      gu_gan: this.guGan,
    };
  }

  static fromDict(data) {
    return new NoteAnnotation(
      data.id,
      data.value,
      data.ban,
      data.yan,
      data.gu_gan,
    );
  }
}

// AnnotationProject class
class AnnotationProject {
  constructor(source, notes) {
    this.source = source;
    this.notes = notes;
  }

  toDict() {
    return {
      source: this.source,
      notes: this.notes.map((n) => n.toDict()),
    };
  }

  static fromDict(data) {
    const notes = data.notes.map((n) => NoteAnnotation.fromDict(n));
    return new AnnotationProject(data.source, notes);
  }

  toJson() {
    return JSON.stringify(this.toDict(), null, 2);
  }

  static fromJson(jsonStr) {
    return AnnotationProject.fromDict(JSON.parse(jsonStr));
  }
}

// MultiRowAnnotationProject - contains multiple rows as a single project
class MultiRowAnnotationProject {
  constructor(projects) {
    this.projects = projects;
  }

  toDict() {
    return {
      type: "multi-row",
      rows: this.projects.map((p) => p.toDict()),
    };
  }

  static fromDict(data) {
    if (data.type !== "multi-row") {
      throw new Error("Not a multi-row project");
    }
    const projects = data.rows.map((r) => AnnotationProject.fromDict(r));
    return new MultiRowAnnotationProject(projects);
  }

  toJson() {
    return JSON.stringify(this.toDict(), null, 2);
  }

  static fromJson(jsonStr) {
    return MultiRowAnnotationProject.fromDict(JSON.parse(jsonStr));
  }
}

// Parse note value - extracts prefix, note, suffix, octave info
function parseNoteValue(value) {
  let prefix = "";
  let suffix = "";
  let note = "";
  let isHighOctave = false;
  let isLowOctave = false;
  let beatLines = 0;
  let isN = false; // 附点修饰

  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    // Handle note digit - once found, we stop capturing prefixes
    if ("12345670".includes(char) && !note) {
      note = char;
      continue;
    }
    if (char === "N" && i + 1 < value.length && value[i + 1] === ";") {
      isN = true; // 只有 N 后面跟着 ; 才是附点
      prefix += char + ";";
      i++; // 跳过 ; 符号
      continue;
    }
    // Handle modifiers - can appear before OR after the note digit
    if (char === "8" && !note) {
      // Only '8' before note means high octave
      isHighOctave = true;
      prefix += char;
    } else if ((char === "b" || char === "v") && !note) {
      // Only 'b' before note means low octave
      isLowOctave = true;
      prefix += char;
    } else if (char === "z") {
      beatLines = 1;
      prefix += char;
    } else if (char === "x") {
      beatLines = 2;
      prefix += char;
    } else if (char === "c") {
      beatLines = 3;
      prefix += char;
    } else if (char === ":") {
      suffix += char;
    }

    // else if (char === "!") {
    //   // 装饰音忽略
    //   break;
    // }
  }

  return {
    prefix,
    note,
    suffix,
    isHighOctave,
    isLowOctave,
    beatLines,
    isN,
  };
}

// Decode Unicode escapes
// function decodeUnicodeEscapes(text) {
//   let result = [];
//   let i = 0;
//   while (i < text.length) {
//     if (text.substring(i, i + 2) === '\\u' && i + 6 <= text.length) {
//       try {
//         let codePoint = parseInt(text.substring(i + 2, i + 6), 16);
//         result.push(String.fromCharCode(codePoint));
//         i += 6;
//         continue;
//       } catch (e) {
//         // ignore
//       }
//     }
//     result.push(text[i]);
//     i++;
//   }
//   return result.join('');
// }

// Clean note value
function cleanNoteValue(note) {
  // 移除 \u00C0...\u00C1 演奏技法符号
  note = note.replace(/\\u00C0.*?\\u00C1/g, "");
  // 移除 \u0448...\u0449 指法技法符号
  note = note.replace(/\\u0448.*?\\u0449/g, "");
  // 移除装饰音 !...@
  note = note.replace(/![^@]*@/g, "");
  return note.trim();
}

// Load notes from CSV row
function loadNotesFromCsvRow(row) {
  // const decoded = decodeUnicodeEscapes(row);
  const notes = row.split("|");

  const cleanedNotes = [];
  for (let n of notes) {
    n = n.trim();
    if (!n) continue;
    n = cleanNoteValue(n);
    if (n) cleanedNotes.push(n);
  }

  return cleanedNotes;
}

// Load parsed notes from CSV content
function loadParsedNotesCsv(csvContent) {
  const lines = csvContent.split("\n");
  const results = [];

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const row = lines[lineNum].trim();
    if (!row) continue;

    // Simple CSV parsing - find the last non-empty field
    let source = null;
    const fields = row.split(",");
    for (let i = fields.length - 1; i >= 0; i--) {
      const field = fields[i].trim();
      if (field) {
        source = field;
        break;
      }
    }

    if (!source) continue;

    const notes = loadNotesFromCsvRow(source);
    if (notes.length > 0) {
      results.push({
        line: lineNum + 1,
        source: source,
        notes: notes,
      });
    }
  }

  return results;
}

// Export functions
export {
  NoteAnnotation,
  AnnotationProject,
  MultiRowAnnotationProject,
  parseNoteValue,
  cleanNoteValue,
  loadNotesFromCsvRow,
  loadParsedNotesCsv,
};
