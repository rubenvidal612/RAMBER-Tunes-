function stripLyricsFencesAndNoise(src) {
  let s = String(src || '').replace(/\r\n/g, '\n');
  // 1) Quitar fences markdown de apertura: ```language o ``` o --- + título
  s = s.replace(/^[ \t]*```[ \t]*(?:lyrics|text|markdown|md|song|letras?|es|en)?[ \t]*\n?/gi, '');
  s = s.replace(/^[ \t]*~~~[ \t]*(?:lyrics|text|markdown|md|song)?[ \t]*\n?/gi, '');
  s = s.replace(/^[ \t]*(---+|\*\*\*+)[ \t]*\n?/g, '');
  // 2) Quitar fences markdown de cierre (al final o líneas que contengan solo ```)
  s = s.replace(/\n[ \t]*```[ \t]*$/g, '');
  s = s.replace(/\n[ \t]*~~~[ \t]*$/g, '');
  s = s.replace(/^[ \t]*```[ \t]*$/gm, '');
  s = s.replace(/^[ \t]*~~~[ \t]*$/gm, '');
  // 3) Quitar fences de cierre al final sin newline
  s = s.replace(/```[ \t]*$/g, '');
  s = s.replace(/~~~[ \t]*$/g, '');
  // 4) Quitar filas de encabezado tipo "Lyrics:" / "Letra:" / "Title:" / (texto técnico residual corto)
  const lines = s.split('\n');
  const out = [];
  let sawLyrics = false;
  for (let i = 0; i < lines.length; i++) {
    let ln = lines[i];
    let trimmed = ln.trim();
    if (!trimmed) { out.push(''); continue; }
    if (!sawLyrics) {
      const tLower = trimmed.toLowerCase().trim();
      // Quitar hasta 3 líneas técnicas iniciales, MÁS LÍMITES estrictos para no borrar estrofas
      if (out.filter(Boolean).length < 3 && trimmed.length <= 80) {
        const looksHeader =
          /^(letras?|lyrics|title|título|canción|cancion|song|audio file|transcript|transcripción|transcripcion|output|resultado|letra de la canción|lyrics for)[ \t]*[:：-]?/i.test(trimmed) ||
          /^(aqu[ií] est[aá] la|here is the|ahora la letra|letra limpia|letra estructurada|estructura|structured lyrics)/i.test(trimmed) ||
          /^\[[ \t]*(letras?|lyrics|transcripci[oó]n|resultado|texto)[ \t]*\]$/i.test(trimmed);
        if (looksHeader) continue;
      }
      sawLyrics = true;
    }
    // Quitar etiquetas técnicas tipo "```" residuales
    const re = /^[ \t]*(```|~~~)[ \t]*(lyrics|text|markdown|md|song|letras?)?[ \t]*$/i;
    if (re.test(trimmed)) continue;
    // Quitar líneas tipo "Fin de la letra" / "End of lyrics" / "---"
    const lTrim = trimmed.toLowerCase();
    if ((lTrim === '---' || lTrim === '***' || lTrim === '…') && trimmed.length < 10) continue;
    if (/^(fin de la[s]? (letras?|canci[oó]n)|end of (lyrics|song|text))$/i.test(trimmed)) continue;
    out.push(ln);
  }
  s = out.join('\n');
  s = s.replace(/\n{3,}/g, '\n\n').trim();
  return s;
}

function normalizeLyricsTags(t) {
  const cleaned = stripLyricsFencesAndNoise(t);
  const lines = (cleaned || '').toString().split('\n');
  const mapped = lines.map((line) => {
    const s = line.trim();
    if (!s) return '';
    const paren = /^\(([^)]+)\)\s*$/.exec(s) || /^\(([^)]+)\)\s*:\s*$/.exec(s);
    if (paren && paren[1]) {
      const inner = paren[1].toString().trim().replace(/:/g, '').trim();
      const innerLower = inner.toLowerCase();
      const innerIsTag =
        innerLower === 'coro' ||
        innerLower.startsWith('coro ') ||
        innerLower === 'chorus' ||
        innerLower.startsWith('chorus ') ||
        innerLower.startsWith('verso') ||
        innerLower.startsWith('verse') ||
        innerLower.startsWith('pre-coro') ||
        innerLower.startsWith('pre coro') ||
        innerLower.startsWith('bridge') ||
        innerLower.startsWith('puente') ||
        innerLower.startsWith('outro') ||
        innerLower.startsWith('intro') ||
        innerLower.startsWith('estribillo');
      const innerSafe = innerLower.normalize('NFKD').replace(/[^\p{L}\p{N}\s-]/gu, '').trim();
      const innerLooksLikeInstruction =
        Boolean(innerSafe) &&
        innerSafe.length <= 48 &&
        (innerIsTag ||
          innerSafe === 'instrumental' ||
          innerSafe.startsWith('intro ') ||
          innerSafe.startsWith('outro ') ||
          innerSafe.startsWith('final') ||
          innerSafe.startsWith('solo') ||
          innerSafe.startsWith('pausa') ||
          innerSafe.startsWith('break') ||
          innerSafe.startsWith('interludio') ||
          innerSafe.startsWith('voz ') ||
          innerSafe.startsWith('voces ') ||
          innerSafe.startsWith('sube ') ||
          innerSafe.startsWith('baja '));
      if (innerLooksLikeInstruction || inner.length < 30) return `[${inner}]`;
    }
    const lower = s.toLowerCase();
    const isTag =
      lower === 'coro' ||
      lower.startsWith('coro ') ||
      lower === 'chorus' ||
      lower.startsWith('chorus ') ||
      lower.startsWith('verso') ||
      lower.startsWith('verse') ||
      lower.startsWith('pre-coro') ||
      lower.startsWith('pre coro') ||
      lower.startsWith('bridge') ||
      lower.startsWith('puente') ||
      lower.startsWith('outro') ||
      lower.startsWith('intro') ||
      lower.startsWith('estribillo');
    if (isTag && !s.startsWith('[')) return `[${s.replace(/:/g, '').trim()}]`;
    if (s.startsWith('[') && s.endsWith(']')) return s;
    if (s.endsWith(':') && s.length < 20) return `[${s.slice(0, -1).trim()}]`;
    return line;
  });
  return mapped.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function sentenceSplit(text) {
  const src = String(text || '').replace(/\r\n/g, '\n');
  const chunks = [];
  let buf = '';
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    buf += c;
    if ((c === '\n') || (c === '.' && (i + 1 >= src.length || /\s/.test(src[i + 1]))) || (c === '!' && (i + 1 >= src.length || /\s/.test(src[i + 1]))) || (c === '?' && (i + 1 >= src.length || /\s/.test(src[i + 1]))) || (c === ';' && (i + 1 >= src.length || /\s/.test(src[i + 1]))) || (c === ',' && (i + 1 >= src.length || /\s/.test(src[i + 1])))) {
      const t = buf.trim();
      if (t) chunks.push(t);
      buf = '';
    }
  }
  const rest = buf.trim();
  if (rest) chunks.push(rest);
  return chunks;
}

function chunkLineLength(sentences, targetLinesPerVerse) {
  const groups = [];
  let cur = [];
  let curLines = 0;
  for (const s of sentences) {
    const linesInSentence = Math.max(1, Math.ceil(s.length / 58));
    if (cur.length > 0 && curLines + linesInSentence > targetLinesPerVerse) {
      groups.push(cur);
      cur = [s];
      curLines = linesInSentence;
    } else {
      cur.push(s);
      curLines += linesInSentence;
    }
  }
  if (cur.length) groups.push(cur);
  return groups;
}

function normalizeWordsForCompare(t) {
  return String(t || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function detectChorusByRepetition(rawGroups) {
  if (!Array.isArray(rawGroups) || rawGroups.length < 3) return { index: -1, group: null };
  const normalized = rawGroups.map((g) => normalizeWordsForCompare(Array.isArray(g) ? g.join(' ') : String(g)));
  const minWords = 12;
  for (let i = 0; i < normalized.length - 1; i++) {
    const a = normalized[i];
    if (!a || a.split(' ').length < minWords) continue;
    const aTokens = a.split(' ').filter(Boolean);
    for (let j = i + 1; j < normalized.length; j++) {
      const b = normalized[j];
      if (!b) continue;
      const bTokens = b.split(' ').filter(Boolean);
      if (bTokens.length < minWords * 0.7) continue;
      let hits = 0;
      for (const w of aTokens) {
        if (b.includes(` ${w} `) || b.startsWith(`${w} `) || b.endsWith(` ${w}`) || b === w) hits++;
      }
      const ratio = (2 * hits) / (aTokens.length + bTokens.length);
      if (ratio >= 0.58) {
        const earlier = Math.min(i, j);
        return { index: earlier, group: rawGroups[earlier] };
      }
    }
  }
  return { index: -1, group: null };
}

const NARRATIVE_KEYWORDS = [
  'corrido', 'historia', 'cuento', 'nacio', 'nació', 'vida', 'muerte', 'muere', 'mataron', 'le dijeron', 'fue a',
  'se fue', 'llegaron', 'cuando el', 'cuando la', 'cuando era', 'allá en', 'ahi en', 'ahí en', 'se llamaba',
  'llamado', 'llamada', 'recordando', 'pueblo', 'rancho', 'compa', 'compadre', 'jefe', 'sargento', 'capitan',
  'capitán', 'pistola', 'camino', 'carro', 'troca', 'viaje', 'frontera', 'mexico', 'méxico', 'culiacan',
  'sinaloa', 'guadalajara', 'monterrey', 'tijuana', 'nuevo leon', 'nuevo león', 'hermosisimo', 'hermosísimo',
  'ayer', 'temprano', 'una noche', 'una mañana', 'aquel dia', 'aquel día', 'esa noche', 'a los cuantos',
  'despues', 'después', 'entonces', 'llego', 'llegó', 'salio', 'salió', 'iba caminando', 'paso', 'pasó',
  'dijo el', 'dijo la', 'le contaron', 'sabiendo', 'sin saber'
];

function isLikelyNarrativeNoChorus(lyricsNorm) {
  const hayRepeticionClara = arguments.length > 1 ? Boolean(arguments[1]) : false;
  if (hayRepeticionClara) return false;
  const t = normalizeWordsForCompare(lyricsNorm);
  if (!t) return false;
  let hits = 0;
  for (const k of NARRATIVE_KEYWORDS) {
    const p = ` ${k} `;
    if (t.includes(p) || t.startsWith(`${k} `) || t.endsWith(` ${k}`) || t === k) hits++;
  }
  const wordCount = t.split(' ').filter(Boolean).length;
  if (wordCount >= 160 && hits >= 2) return true;
  if (hits >= 4) return true;
  return false;
}

function wrapLines(text) {
  const raw = String(text || '').replace(/\r\n/g, '\n');
  const existing = raw.split('\n').map((l) => l.trim()).filter(Boolean);
  if (existing.length >= 4) return existing;
  const sentences = sentenceSplit(raw);
  const out = [];
  for (const s of sentences) {
    if (!s) continue;
    if (s.length <= 64) {
      out.push(s);
      continue;
    }
    const parts = s.split(/\s*,\s*/).filter(Boolean);
    if (parts.length >= 2 && parts.every((p) => p.length <= 70)) {
      for (const p of parts) out.push(p);
      continue;
    }
    let curLine = '';
    const toks = s.split(/\s+/).filter(Boolean);
    for (const tok of toks) {
      if (!curLine) curLine = tok;
      else if ((curLine + ' ' + tok).length <= 60) curLine = `${curLine} ${tok}`;
      else {
        out.push(curLine);
        curLine = tok;
      }
    }
    if (curLine) out.push(curLine);
  }
  return out;
}

function formatLyricsWithSections(raw) {
  try {
    const cleaned = stripLyricsFencesAndNoise(raw);
    const src = String(cleaned || '').trim();
    if (!src) return '';
    const preExisting = normalizeLyricsTags(src);
    const preLines = preExisting.split('\n').map((s) => s.trim());
    const hasExistingTags = preLines.some((l) => /^\[(Verse|Chorus|Pre-Chorus|Bridge|Outro|Intro|Instrumental Break|Coro|Estribillo|Puente|Intro|Outro)(\s.*)?\]$/i.test(l));
    if (hasExistingTags) {
      return preExisting;
    }
    const sentences = sentenceSplit(src).filter(Boolean);
    if (sentences.length === 0) return src;
    const wordCount = normalizeWordsForCompare(src).split(' ').filter(Boolean).length;
    const targetLinesPerVerse = wordCount < 120 ? 4 : (wordCount < 220 ? 5 : 6);
    const groups = chunkLineLength(sentences, targetLinesPerVerse).filter((g) => g && g.length);
    if (groups.length === 0) return src;
    const { index: chorusIdx } = detectChorusByRepetition(groups);
    const hasChorus = chorusIdx >= 0;
    const narrative = isLikelyNarrativeNoChorus(src, hasChorus);
    const out = [];
    let verseCounter = 1;
    let preChorusPending = false;
    let chorusCount = 0;
    let usedBridge = false;
    for (let g = 0; g < groups.length; g++) {
      const group = groups[g];
      if (!group || !group.length) continue;
      if (g === 0) {
        if (narrative) {
          out.push('[Verse 1]');
          verseCounter = 2;
        } else if (hasChorus && chorusIdx > 0) {
          out.push('[Verse 1]');
          verseCounter = 2;
        } else {
          out.push('[Verse 1]');
          verseCounter = 2;
        }
      } else if (hasChorus && g === chorusIdx && chorusCount === 0) {
        out.push('[Chorus]');
        chorusCount = 1;
      } else if (hasChorus && chorusCount >= 1 && g > chorusIdx) {
        const isRepeat = (() => {
          const a = normalizeWordsForCompare(groups[chorusIdx].join(' '));
          const b = normalizeWordsForCompare(group.join(' '));
          if (!a || !b) return false;
          const at = a.split(' ').filter(Boolean);
          const bt = b.split(' ').filter(Boolean);
          if (at.length < 8 || bt.length < 8) return false;
          let hits = 0;
          for (const w of at) {
            if (b.includes(` ${w} `) || b.startsWith(`${w} `) || b.endsWith(` ${w}`) || b === w) hits++;
          }
          const ratio = (2 * hits) / (at.length + bt.length);
          return ratio >= 0.48;
        })();
        if (isRepeat) {
          out.push('[Chorus]');
          chorusCount++;
        } else if (g === groups.length - 1) {
          out.push('[Outro]');
        } else if (!usedBridge && groups.length - g > 1 && chorusCount >= 1 && !preChorusPending) {
          out.push('[Bridge]');
          usedBridge = true;
        } else if (!preChorusPending && g + 1 < groups.length && (() => {
          const next = groups[g + 1];
          const a = normalizeWordsForCompare(groups[chorusIdx].join(' '));
          const b = normalizeWordsForCompare(next.join(' '));
          if (!a || !b) return false;
          const at = a.split(' ').filter(Boolean);
          const bt = b.split(' ').filter(Boolean);
          if (at.length < 8 || bt.length < 8) return false;
          let hits = 0;
          for (const w of at) {
            if (b.includes(` ${w} `) || b.startsWith(`${w} `) || b.endsWith(` ${w}`) || b === w) hits++;
          }
          const ratio = (2 * hits) / (at.length + bt.length);
          return ratio >= 0.48;
        })()) {
          out.push('[Pre-Chorus]');
          preChorusPending = true;
        } else {
          out.push(`[Verse ${verseCounter}]`);
          verseCounter++;
          preChorusPending = false;
        }
      } else if (narrative && g === groups.length - 1) {
        if (groups.length > 3) {
          const maybeBreak = Math.floor(groups.length * 0.62);
          if (g > maybeBreak && !usedBridge) {
          } else {
            out.push('[Outro]');
          }
        } else {
          out.push('[Outro]');
        }
      } else if (narrative) {
        const approxThird = Math.floor(groups.length / 3);
        const twoThirds = Math.floor((groups.length * 2) / 3);
        if (!usedBridge && approxThird > 1 && (g === approxThird || g === twoThirds) && groups.length > 5) {
          out.push('[Instrumental Break]');
          usedBridge = true;
        } else {
          out.push(`[Verse ${verseCounter}]`);
          verseCounter++;
        }
      } else if (g === groups.length - 1) {
        out.push('[Outro]');
      } else if (!usedBridge && groups.length >= 5 && g === Math.floor(groups.length / 2)) {
        out.push('[Instrumental Break]');
        usedBridge = true;
      } else if (!preChorusPending && hasChorus && chorusIdx > g && g + 1 === chorusIdx) {
        out.push('[Pre-Chorus]');
        preChorusPending = true;
      } else {
        out.push(`[Verse ${verseCounter}]`);
        verseCounter++;
        preChorusPending = false;
      }
      const wrappedLines = wrapLines(group.join(' '));
      for (const ln of wrappedLines) {
        out.push(ln);
      }
      if (g < groups.length - 1) out.push('');
    }
    const joined = out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    return joined || src;
  } catch (e) {
    try {
      return (raw || '').toString();
    } catch {
      return '';
    }
  }
}

function formatLyricsForEditing(raw) {
  return formatLyricsWithSections(raw);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    normalizeLyricsTags,
    formatLyricsWithSections,
    formatLyricsForEditing,
    detectChorusByRepetition,
    isLikelyNarrativeNoChorus,
  };
}

export {
  normalizeLyricsTags,
  formatLyricsWithSections,
  formatLyricsForEditing,
  detectChorusByRepetition,
  isLikelyNarrativeNoChorus,
};
