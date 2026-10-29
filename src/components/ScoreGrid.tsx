'use client';

import { Fragment, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, EyeOff, GripVertical, Plus, X } from 'lucide-react';
import Modal, { ModalHeader } from '@/components/Modal';
import type { StudentData } from '@/services/school-database.service';
import type { Assignment, AssignmentGroup, GradeConfig, StudentScore } from '@/services/teacher-database.service';
import {
  assignmentField, buildColumns, computeBreakdown, examMax, fieldMax, getFieldValue,
  gradeColor, round2, type ScoreBreakdown, type ScoreField,
} from '@/lib/grade-calculation';

export interface CellEdit {
  studentId: string;
  field: ScoreField;
  value: number | null;
}

export interface ScoreGridActions {
  editAssignment: (a: Assignment) => void;
  setVisibility: (ids: string[], visible: boolean) => void;
  groupAssignments: (ids: string[], name: string, rawScore: number) => void;
  editGroup: (group: AssignmentGroup, name: string, rawScore: number) => void;
  removeFromGroup: (a: Assignment) => void;
  ungroup: (group: AssignmentGroup) => void;
  deleteAssignments: (ids: string[]) => void;
  renameAssignment: (a: Assignment, title: string) => void;
  /** Open the new-assignment popup */
  addAssignment: () => void;
  setExamMax: (exam: 'midterm' | 'final', max: number) => void;
  /** New assignment order + scaled column position per group (desktop drag) */
  reorder: (idOrder: string[], scaledPositions: Record<string, number>) => void;
}

interface ScoreGridProps {
  isDark: boolean;
  editable: boolean;
  allowReorder: boolean;
  students: StudentData[];
  assignments: Assignment[];
  groups: AssignmentGroup[];
  scores: Map<string, StudentScore>;
  config: GradeConfig;
  /** studentId|field → text that failed validation (shown red, not saved) */
  invalid: Map<string, string>;
  onEdit: (edits: CellEdit[]) => void;
  onInvalid: (entries: Array<{ key: string; text: string | null }>) => void;
  onUndo: () => void;
  onRedo: () => void;
  onStudentClick: (s: StudentData) => void;
  notify: (message: string) => void;
  actions: ScoreGridActions;
}

type GridCol =
  | { key: string; kind: 'assignment'; field: ScoreField; assignment: Assignment; group?: AssignmentGroup }
  | { key: string; kind: 'groupScaled'; group: AssignmentGroup; members: Assignment[] }
  | { key: string; kind: 'exam'; field: 'midterm' | 'final' };

type Pos = { r: number; c: number };
type MenuTarget =
  | { type: 'assignment'; assignment: Assignment }
  | { type: 'group'; group: AssignmentGroup }
  | { type: 'exam'; exam: 'midterm' | 'final' };
type DragSource = { type: 'assignment'; id: string } | { type: 'group'; gid: string } | { type: 'scaled'; gid: string };
type Dialog =
  | { type: 'group'; ids: string[]; group?: AssignmentGroup }
  | { type: 'exam'; exam: 'midterm' | 'final' };

const SCALED = '__scaled';
const LONG_PRESS_MS = 450;
const cellKey = (studentId: string, field: ScoreField) => `${studentId}|${field}`;

export function formatScore(n: number | undefined): string {
  if (n === undefined) return '';
  return Number.isInteger(n) ? String(n) : String(round2(n));
}

/** Parse a typed/pasted score. '' clears the cell. */
export function parseScore(text: string): { ok: true; value: number | null } | { ok: false } {
  const t = text.trim().replace(',', '.');
  if (t === '') return { ok: true, value: null };
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(t)) return { ok: false };
  const n = Number(t);
  return Number.isFinite(n) ? { ok: true, value: n } : { ok: false };
}

export default function ScoreGrid(props: ScoreGridProps) {
  const {
    isDark, editable, allowReorder, students, assignments, groups, scores, config, invalid,
    onEdit, onInvalid, onUndo, onRedo, onStudentClick, notify, actions,
  } = props;

  const containerRef = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [active, setActive] = useState<Pos | null>(null);
  const [anchor, setAnchor] = useState<Pos | null>(null);
  const [editing, setEditingState] = useState<{ pos: Pos; text: string; viaTyping: boolean } | null>(null);
  // Mirrors `editing` synchronously so a blur and a click in the same tick commit only once
  const editingRef = useRef<typeof editing>(null);
  const setEditing = (value: typeof editing) => { editingRef.current = value; setEditingState(value); };
  const [selectingCells, setSelectingCells] = useState(false);
  const [selectedHeaders, setSelectedHeaders] = useState<string[]>([]);
  const headerDragStart = useRef<string | null>(null);
  const lastHeaderClick = useRef<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; target: MenuTarget } | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; text: string } | null>(null);
  const [dragSource, setDragSource] = useState<DragSource | null>(null);
  const [dropHint, setDropHint] = useState<{ key: string; side: 'left' | 'right' } | null>(null);
  const selectedHeadersRef = useRef(selectedHeaders);
  selectedHeadersRef.current = selectedHeaders;
  const touchState = useRef<{ timer: ReturnType<typeof setTimeout> | null; startX: number; startY: number; selecting: boolean }>(
    { timer: null, startX: 0, startY: 0, selecting: false },
  );
  const lastTouchAt = useRef(0);
  const menuOpenedAt = useRef(0);

  // View mode starts with groups folded to their scaled column; edit mode shows everything
  useEffect(() => {
    setCollapsed(editable ? new Set() : new Set(groups.map(g => g.id)));
    setEditing(null);
    setActive(null);
    setAnchor(null);
    setSelectedHeaders([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editable]);

  const layout = useMemo(() => buildColumns(assignments, groups), [assignments, groups]);

  const cols: GridCol[] = useMemo(() => {
    const out: GridCol[] = [];
    for (const c of layout) {
      if (c.kind === 'assignment') {
        if (c.group && collapsed.has(c.group.id)) continue;
        out.push({ key: c.assignment.id, kind: 'assignment', field: assignmentField(c.assignment.id), assignment: c.assignment, group: c.group });
      } else {
        out.push({ key: `${SCALED}:${c.group.id}`, kind: 'groupScaled', group: c.group, members: c.members });
      }
    }
    out.push({ key: 'midterm', kind: 'exam', field: 'midterm' });
    out.push({ key: 'final', kind: 'exam', field: 'final' });
    return out;
  }, [layout, collapsed]);

  const examStart = cols.length - 2;
  const isEditableCol = (c: GridCol | undefined): c is Extract<GridCol, { field: ScoreField }> =>
    !!c && editable && (c.kind === 'assignment' || c.kind === 'exam');

  const breakdowns = useMemo(() => {
    const map = new Map<string, ScoreBreakdown>();
    for (const s of students) map.set(s.studentId, computeBreakdown(scores.get(s.studentId), assignments, groups, config));
    return map;
  }, [students, scores, assignments, groups, config]);

  const assignmentHeaderIds = useMemo(
    () => cols.flatMap(c => (c.kind === 'assignment' ? [c.assignment.id] : [])),
    [cols],
  );

  // ---------------------------------------------------------------- cells

  const cellText = useCallback((r: number, c: number): string => {
    const student = students[r];
    const col = cols[c];
    if (!student || !col) return '';
    if (col.kind === 'groupScaled') return formatScore(breakdowns.get(student.studentId)?.groups[col.group.id]);
    const bad = invalid.get(cellKey(student.studentId, col.field));
    if (bad !== undefined) return bad;
    return formatScore(getFieldValue(scores.get(student.studentId), col.field));
  }, [students, cols, breakdowns, invalid, scores]);

  const selection = useMemo(() => {
    if (!active) return null;
    const a = anchor ?? active;
    return {
      r1: Math.min(a.r, active.r), r2: Math.max(a.r, active.r),
      c1: Math.min(a.c, active.c), c2: Math.max(a.c, active.c),
    };
  }, [active, anchor]);

  // One real <input> follows the active cell. It takes every keystroke, so typing, paste,
  // IME and tablet on-screen keyboards all work; it only becomes visible while editing.
  const editorRef = useRef<HTMLInputElement>(null);
  const tableWrapRef = useRef<HTMLDivElement>(null);
  const [editorBox, setEditorBox] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const focusGrid = () => editorRef.current?.focus({ preventScroll: true });

  const moveTo = useCallback((pos: Pos, extend = false) => {
    const r = Math.max(0, Math.min(students.length - 1, pos.r));
    const c = Math.max(0, Math.min(cols.length - 1, pos.c));
    setActive({ r, c });
    if (!extend) setAnchor({ r, c });
  }, [students.length, cols.length]);

  useEffect(() => {
    if (!active) return;
    const el = containerRef.current?.querySelector(`[data-cell="${active.r}:${active.c}"]`);
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [active]);

  // Keep the editor over the active cell (columns can change width as values change)
  useLayoutEffect(() => {
    const el = active ? tableWrapRef.current?.querySelector<HTMLElement>(`[data-cell="${active.r}:${active.c}"]`) : null;
    const box = el ? { left: el.offsetLeft, top: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight } : null;
    setEditorBox(prev => (
      prev?.left === box?.left && prev?.top === box?.top && prev?.width === box?.width && prev?.height === box?.height ? prev : box
    ));
  }, [active, cols, scores, invalid, editing, collapsed]);

  /** Validate and commit texts; invalid ones stay red and unsaved. */
  const commitTexts = useCallback((entries: Array<{ r: number; c: number; text: string }>) => {
    const edits: CellEdit[] = [];
    const marks: Array<{ key: string; text: string | null }> = [];
    for (const { r, c, text } of entries) {
      const student = students[r];
      const col = cols[c];
      if (!student || !isEditableCol(col)) continue;
      const key = cellKey(student.studentId, col.field);
      const parsed = parseScore(text);
      const max = fieldMax(col.field, assignments, config);
      if (!parsed.ok || (parsed.value !== null && (parsed.value < 0 || parsed.value > max))) {
        marks.push({ key, text });
        continue;
      }
      if (invalid.has(key)) marks.push({ key, text: null });
      edits.push({ studentId: student.studentId, field: col.field, value: parsed.value });
    }
    if (marks.length) onInvalid(marks);
    if (edits.length) onEdit(edits);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [students, cols, assignments, config, invalid, onEdit, onInvalid, editable]);

  const nextEditableCol = (c: number, dir: 1 | -1) => {
    for (let i = c + dir; i >= 0 && i < cols.length; i += dir) if (isEditableCol(cols[i])) return i;
    return c;
  };

  const startEditing = (pos: Pos, text: string, viaTyping: boolean) => {
    if (!isEditableCol(cols[pos.c])) return;
    setEditing({ pos, text, viaTyping });
    focusGrid();
    if (!viaTyping) requestAnimationFrame(() => editorRef.current?.select());
  };

  const finishEditing = (move?: { dr: number; dc: number }) => {
    const current = editingRef.current;
    if (!current) return;
    const { pos, text } = current;
    setEditing(null);
    if (text !== cellText(pos.r, pos.c)) commitTexts([{ r: pos.r, c: pos.c, text }]);
    if (move) {
      const c = move.dc ? nextEditableCol(pos.c, move.dc > 0 ? 1 : -1) : pos.c;
      moveTo({ r: pos.r + move.dr, c });
    }
  };

  const clearSelection = () => {
    if (!selection || !editable) return;
    const entries: Array<{ r: number; c: number; text: string }> = [];
    for (let r = selection.r1; r <= selection.r2; r++) {
      for (let c = selection.c1; c <= selection.c2; c++) {
        if (isEditableCol(cols[c]) && cellText(r, c) !== '') entries.push({ r, c, text: '' });
      }
    }
    commitTexts(entries);
  };

  const selectionTsv = () => {
    if (!selection) return '';
    const lines: string[] = [];
    for (let r = selection.r1; r <= selection.r2; r++) {
      const row: string[] = [];
      for (let c = selection.c1; c <= selection.c2; c++) row.push(cellText(r, c));
      lines.push(row.join('\t'));
    }
    return lines.join('\n');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (dialog || renaming) return;
    const mod = e.metaKey || e.ctrlKey;

    if (editing) {
      switch (e.key) {
        case 'Enter': e.preventDefault(); finishEditing({ dr: e.shiftKey ? -1 : 1, dc: 0 }); return;
        case 'Tab': e.preventDefault(); finishEditing({ dr: 0, dc: e.shiftKey ? -1 : 1 }); return;
        case 'Escape': e.preventDefault(); setEditing(null); return;
        case 'ArrowUp': e.preventDefault(); finishEditing({ dr: -1, dc: 0 }); return;
        case 'ArrowDown': e.preventDefault(); finishEditing({ dr: 1, dc: 0 }); return;
        case 'ArrowLeft':
        case 'ArrowRight':
          if (editing.viaTyping) {
            e.preventDefault();
            finishEditing({ dr: 0, dc: e.key === 'ArrowLeft' ? -1 : 1 });
          }
          return;
      }
      return;
    }

    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) onRedo(); else onUndo();
      return;
    }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); onRedo(); return; }
    if (mod && e.key.toLowerCase() === 'c' && selection) {
      e.preventDefault();
      const tsv = selectionTsv();
      navigator.clipboard?.writeText(tsv)
        .then(() => notify(`คัดลอก ${selection.r2 - selection.r1 + 1} × ${selection.c2 - selection.c1 + 1} ช่อง`))
        .catch(() => notify('คัดลอกไม่สำเร็จ'));
      return;
    }
    if (!active) return;
    const { r, c } = active;
    switch (e.key) {
      case 'ArrowUp': e.preventDefault(); moveTo({ r: r - 1, c }, e.shiftKey); return;
      case 'ArrowDown': e.preventDefault(); moveTo({ r: r + 1, c }, e.shiftKey); return;
      case 'ArrowLeft': e.preventDefault(); moveTo({ r, c: c - 1 }, e.shiftKey); return;
      case 'ArrowRight': e.preventDefault(); moveTo({ r, c: c + 1 }, e.shiftKey); return;
      case 'Enter': e.preventDefault(); moveTo({ r: r + (e.shiftKey ? -1 : 1), c }); return;
      case 'Tab': e.preventDefault(); moveTo({ r, c: nextEditableCol(c, e.shiftKey ? -1 : 1) }); return;
      case 'Escape': setAnchor(active); setSelectedHeaders([]); return;
      case 'Delete':
      case 'Backspace': e.preventDefault(); clearSelection(); return;
      case 'F2': e.preventDefault(); startEditing(active, cellText(r, c), false); return;
    }
    // Any other key types into the editor; onChange turns that into editing
  };

  const handleEditorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value;
    if (editingRef.current) { setEditing({ ...editingRef.current, text }); return; }
    if (!active || !isEditableCol(cols[active.c])) return;
    setAnchor(active);
    setEditing({ pos: active, text, viaTyping: true });
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    if (editing || !active || !editable) return;
    const text = e.clipboardData.getData('text/plain');
    if (!text) return;
    e.preventDefault();
    const rows = text.replace(/\r/g, '').replace(/\n+$/, '').split('\n').map(line => line.split('\t'));
    // Pasted columns fill the editable columns from the active one onward (scaled columns are skipped)
    const targetCols: number[] = [];
    for (let c = active.c; c < cols.length && targetCols.length < Math.max(...rows.map(r => r.length)); c++) {
      if (isEditableCol(cols[c])) targetCols.push(c);
    }
    const available = students.length - active.r;
    if (rows.length > available) {
      notify(`ข้อมูลที่วางมี ${rows.length} แถว แต่มีนักเรียนเหลือ ${available} คน — วางเฉพาะ ${available} แถวแรก`);
    }
    const entries: Array<{ r: number; c: number; text: string }> = [];
    rows.slice(0, available).forEach((row, i) => {
      row.forEach((value, j) => {
        if (targetCols[j] !== undefined) entries.push({ r: active.r + i, c: targetCols[j], text: value });
      });
    });
    commitTexts(entries);
    if (entries.length) {
      const last = entries[entries.length - 1];
      setAnchor(active);
      setActive({ r: last.r, c: last.c });
    }
  };

  useEffect(() => {
    const stop = () => setSelectingCells(false);
    window.addEventListener('mouseup', stop);
    return () => window.removeEventListener('mouseup', stop);
  }, []);

  // ---------------------------------------------------------------- headers

  const selectHeader = (id: string, e: React.MouseEvent) => {
    if (e.shiftKey && lastHeaderClick.current) {
      const a = assignmentHeaderIds.indexOf(lastHeaderClick.current);
      const b = assignmentHeaderIds.indexOf(id);
      if (a >= 0 && b >= 0) {
        setSelectedHeaders(assignmentHeaderIds.slice(Math.min(a, b), Math.max(a, b) + 1));
        return;
      }
    }
    if (e.metaKey || e.ctrlKey) {
      setSelectedHeaders(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
    } else {
      setSelectedHeaders([id]);
      headerDragStart.current = id;
    }
    lastHeaderClick.current = id;
  };

  const extendHeaderDrag = (id: string) => {
    const start = headerDragStart.current;
    if (!start) return;
    const a = assignmentHeaderIds.indexOf(start);
    const b = assignmentHeaderIds.indexOf(id);
    if (a >= 0 && b >= 0) setSelectedHeaders(assignmentHeaderIds.slice(Math.min(a, b), Math.max(a, b) + 1));
  };

  useEffect(() => {
    const stop = () => { headerDragStart.current = null; };
    window.addEventListener('mouseup', stop);
    return () => window.removeEventListener('mouseup', stop);
  }, []);

  const openMenu = (x: number, y: number, target: MenuTarget) => {
    if (!editable) return;
    if (target.type === 'assignment' && !selectedHeadersRef.current.includes(target.assignment.id)) {
      setSelectedHeaders([target.assignment.id]);
    }
    menuOpenedAt.current = Date.now();
    setMenu({ x, y, target });
  };

  /**
   * Header gestures. Mouse: click / Shift / Ctrl select, drag across headers, right-click menu.
   * Touch (tablets): tap selects one column; press-and-hold then slide selects a range
   * (like a mouse drag); press-and-hold on an already selected column, or a two-finger
   * tap, opens the menu. Emulated mouse events that follow a touch are ignored.
   */
  const headerHandlers = (target: MenuTarget) => {
    const id = target.type === 'assignment' ? target.assignment.id : null;
    const fromTouch = () => Date.now() - lastTouchAt.current < 800;
    return {
      onMouseDown: (e: React.MouseEvent) => {
        if (!editable || !id || e.button !== 0 || fromTouch()) return;
        selectHeader(id, e);
      },
      onMouseEnter: () => { if (editable && id && !fromTouch()) extendHeaderDrag(id); },
      onContextMenu: (e: React.MouseEvent) => {
        if (!editable) return;
        e.preventDefault();
        if (!fromTouch()) openMenu(e.clientX, e.clientY, target);
      },
      onTouchStart: (e: React.TouchEvent) => {
        if (!editable) return;
        lastTouchAt.current = Date.now();
        const ts = touchState.current;
        if (ts.timer) clearTimeout(ts.timer);
        ts.timer = null;
        ts.selecting = false;
        if (e.touches.length === 2) {
          const [a, b] = [e.touches[0], e.touches[1]];
          openMenu((a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2, target);
          return;
        }
        if (e.touches.length !== 1) return;
        ts.startX = e.touches[0].clientX;
        ts.startY = e.touches[0].clientY;
        ts.timer = setTimeout(() => {
          ts.timer = null;
          if (id && !selectedHeadersRef.current.includes(id)) {
            ts.selecting = true;
            setSelectedHeaders([id]);
            headerDragStart.current = id;
            lastHeaderClick.current = id;
            navigator.vibrate?.(15);
          } else {
            openMenu(ts.startX, ts.startY, target);
          }
        }, LONG_PRESS_MS);
      },
      onTouchMove: (e: React.TouchEvent) => {
        const ts = touchState.current;
        if (!ts.timer) return;
        const t = e.touches[0];
        if (Math.abs(t.clientX - ts.startX) > 10 || Math.abs(t.clientY - ts.startY) > 10) {
          clearTimeout(ts.timer);
          ts.timer = null;
        }
      },
      onTouchEnd: () => {
        lastTouchAt.current = Date.now();
        const ts = touchState.current;
        if (ts.timer) {
          // Short tap: select just this column
          clearTimeout(ts.timer);
          ts.timer = null;
          if (id) { setSelectedHeaders([id]); lastHeaderClick.current = id; }
        }
        ts.selecting = false;
        headerDragStart.current = null;
      },
    };
  };

  // While a press-and-hold selection is active, sliding the finger extends it instead of scrolling
  // (needs a non-passive listener to call preventDefault).
  const extendHeaderDragRef = useRef(extendHeaderDrag);
  extendHeaderDragRef.current = extendHeaderDrag;
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onMove = (e: TouchEvent) => {
      if (!touchState.current.selecting) return;
      e.preventDefault();
      const t = e.touches[0];
      const rect = el.getBoundingClientRect();
      if (t.clientX > rect.right - 40) el.scrollLeft += 16;
      else if (t.clientX < rect.left + 260) el.scrollLeft -= 16;
      const th = (document.elementFromPoint(t.clientX, t.clientY) as HTMLElement | null)?.closest('[data-header-id]');
      const headerId = th?.getAttribute('data-header-id');
      if (headerId) extendHeaderDragRef.current(headerId);
    };
    el.addEventListener('touchmove', onMove, { passive: false });
    return () => el.removeEventListener('touchmove', onMove);
  }, []);

  useEffect(() => {
    if (!menu) return;
    // A click right after a touch gesture opened the menu is part of that gesture, not a dismissal
    const close = () => { if (Date.now() - menuOpenedAt.current > 400) setMenu(null); };
    window.addEventListener('click', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [menu]);

  // ---------------------------------------------------------------- drag to reorder (desktop)

  const canDrag = editable && allowReorder;

  type Unit = { type: 'single'; id: string } | { type: 'group'; gid: string; items: string[] };
  const units = useMemo((): Unit[] => {
    const out: Unit[] = [];
    for (const c of layout) {
      if (c.kind === 'assignment' && !c.group) out.push({ type: 'single', id: c.assignment.id });
      else {
        const gid = c.kind === 'assignment' ? c.group!.id : c.group.id;
        const last = out[out.length - 1];
        const item = c.kind === 'assignment' ? c.assignment.id : SCALED;
        if (last?.type === 'group' && last.gid === gid) last.items.push(item);
        else out.push({ type: 'group', gid, items: [item] });
      }
    }
    return out;
  }, [layout]);

  /** Where `targetKey` sits: its unit and, inside a group, its item index. */
  const locate = (targetKey: string) => {
    for (let u = 0; u < units.length; u++) {
      const unit = units[u];
      if (unit.type === 'single' && unit.id === targetKey) return { u, i: -1 };
      if (unit.type === 'group') {
        if (targetKey === `group:${unit.gid}`) return { u, i: -1 };
        const i = unit.items.findIndex(x => (x === SCALED ? `${SCALED}:${unit.gid}` : x) === targetKey);
        if (i >= 0) return { u, i };
      }
    }
    return null;
  };

  const dropAllowed = (source: DragSource, targetKey: string) => {
    const loc = locate(targetKey);
    if (!loc) return false;
    const unit = units[loc.u];
    if (source.type === 'scaled') return unit.type === 'group' && unit.gid === source.gid && loc.i >= 0;
    if (source.type === 'assignment') {
      const a = assignments.find(x => x.id === source.id);
      const gid = a?.groupId && groups.some(g => g.id === a.groupId) ? a.groupId : null;
      if (gid) return unit.type === 'group' && unit.gid === gid && loc.i >= 0;
    }
    return true;
  };

  const applyDrop = (source: DragSource, targetKey: string, side: 'left' | 'right') => {
    const loc = locate(targetKey);
    if (!loc || !dropAllowed(source, targetKey)) return;
    const next: Unit[] = units.map(u => (u.type === 'group' ? { ...u, items: [...u.items] } : { ...u }));

    const inGroupMove = source.type === 'scaled'
      || (source.type === 'assignment' && next.some(u => u.type === 'group' && u.items.includes(source.id)));
    if (inGroupMove) {
      const unit = next[loc.u] as Extract<Unit, { type: 'group' }>;
      const item = source.type === 'scaled' ? SCALED : (source as { id: string }).id;
      const from = unit.items.indexOf(item);
      let to = loc.i + (side === 'right' ? 1 : 0);
      if (from < to) to -= 1;
      if (from === to) return;
      unit.items.splice(from, 1);
      unit.items.splice(to, 0, item);
    } else {
      const from = next.findIndex(u => (source.type === 'group' ? u.type === 'group' && u.gid === source.gid : u.type === 'single' && u.id === (source as { id: string }).id));
      if (from < 0 || from === loc.u) return;
      const target = next[loc.u];
      // Dropping on a group's inside snaps to the nearer edge of the whole group
      const after = target.type === 'group' && loc.i >= 0 ? loc.i >= target.items.length / 2 : side === 'right';
      let to = loc.u + (after ? 1 : 0);
      const [moved] = next.splice(from, 1);
      if (from < to) to -= 1;
      next.splice(to, 0, moved);
    }

    const idOrder = next.flatMap(u => (u.type === 'single' ? [u.id] : u.items.filter(x => x !== SCALED)));
    const scaledPositions: Record<string, number> = {};
    next.forEach(u => { if (u.type === 'group') scaledPositions[u.gid] = u.items.indexOf(SCALED); });
    actions.reorder(idOrder, scaledPositions);
  };

  const dragProps = (source: DragSource) => (canDrag ? {
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', 'column');
      setDragSource(source);
    },
    onDragEnd: () => { setDragSource(null); setDropHint(null); },
    onMouseDown: (e: React.MouseEvent) => e.stopPropagation(),
  } : {});

  const dropProps = (targetKey: string) => (canDrag ? {
    onDragOver: (e: React.DragEvent) => {
      if (!dragSource || !dropAllowed(dragSource, targetKey)) return;
      e.preventDefault();
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const side = e.clientX < rect.left + rect.width / 2 ? 'left' : 'right';
      if (dropHint?.key !== targetKey || dropHint.side !== side) setDropHint({ key: targetKey, side });
    },
    onDragLeave: () => setDropHint(h => (h?.key === targetKey ? null : h)),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      if (dragSource) {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        applyDrop(dragSource, targetKey, e.clientX < rect.left + rect.width / 2 ? 'left' : 'right');
      }
      setDragSource(null);
      setDropHint(null);
    },
  } : {});

  const dropClass = (key: string) =>
    dropHint?.key === key ? (dropHint.side === 'left' ? 'shadow-[inset_3px_0_0_#3b82f6]' : 'shadow-[inset_-3px_0_0_#3b82f6]') : '';

  // ---------------------------------------------------------------- styles

  // Flat sheet on the soft-UI surface; sticky cells need opaque backgrounds
  const border = isDark ? 'border-gray-700' : 'border-gray-300';
  const surface = 'bg-surface';
  const headBg = isDark ? 'bg-[#33312f]' : 'bg-[#dde1e8]';
  const groupBg = isDark ? 'bg-purple-950' : 'bg-purple-50';
  const muted = isDark ? 'text-gray-400' : 'text-gray-500';
  const thBase = `border-b border-r ${border} px-2 text-xs font-bold whitespace-nowrap select-none [-webkit-touch-callout:none]`;
  const tdBase = `border-b border-r ${border} h-10 text-center text-sm tabular-nums`;

  const headerBg = (id: string) => (selectedHeaders.includes(id) ? 'bg-blue-600 text-white' : headBg);

  // ---------------------------------------------------------------- render pieces

  const renderAssignmentHeader = (col: Extract<GridCol, { kind: 'assignment' }>, rowSpan: number) => {
    const a = col.assignment;
    const isRenaming = renaming?.id === a.id;
    return (
      <th
        key={col.key}
        rowSpan={rowSpan}
        data-colkey={col.key}
        className={`${thBase} ${headerBg(a.id)} sticky ${rowSpan === 2 ? 'top-0' : 'top-9'} z-20 min-w-[84px] max-w-[160px] ${editable ? 'cursor-pointer' : ''} ${!a.isVisible ? 'opacity-50' : ''} ${dropClass(col.key)}`}
        data-header-id={a.id}
        onDoubleClick={() => editable && setRenaming({ id: a.id, text: a.title })}
        title={[a.title, a.description, a.deadline ? `กำหนดส่ง ${a.deadline}` : ''].filter(Boolean).join('\n')}
        {...headerHandlers({ type: 'assignment', assignment: a })}
        {...dropProps(col.key)}
      >
        <div className="flex items-center justify-center gap-1">
          {canDrag && (
            <span {...dragProps({ type: 'assignment', id: a.id })} className={`cursor-grab ${muted}`} title="ลากเพื่อย้าย">
              <GripVertical size={12} />
            </span>
          )}
          {isRenaming ? (
            <input
              autoFocus
              value={renaming.text}
              onChange={e => setRenaming({ id: a.id, text: e.target.value })}
              onMouseDown={e => e.stopPropagation()}
              onKeyDown={e => {
                if (e.key === 'Enter' && renaming.text.trim()) { actions.renameAssignment(a, renaming.text.trim()); setRenaming(null); focusGrid(); }
                if (e.key === 'Escape') { setRenaming(null); focusGrid(); }
              }}
              onBlur={() => setRenaming(null)}
              className="w-28 h-6 px-1 rounded border border-transparent bg-surface text-xs shadow-neu-in-xs"
            />
          ) : (
            <span className="truncate max-w-[120px]">{a.title}</span>
          )}
          {!a.isVisible && <EyeOff size={11} className={muted} />}
        </div>
        <div className={`text-[10px] font-medium ${selectedHeaders.includes(a.id) ? 'text-blue-100' : muted}`}>เต็ม {formatScore(a.maxScore)}</div>
      </th>
    );
  };

  const renderScaledHeader = (col: Extract<GridCol, { kind: 'groupScaled' }>, rowSpan: number) => (
    <th
      key={col.key}
      rowSpan={rowSpan}
      data-colkey={col.key}
      className={`${thBase} ${groupBg} sticky ${rowSpan === 2 ? 'top-0' : 'top-9'} z-20 min-w-[84px] text-purple-600 dark:text-purple-300 ${dropClass(col.key)}`}
      {...headerHandlers({ type: 'group', group: col.group })}
      {...dropProps(col.key)}
    >
      <div className="flex items-center justify-center gap-1">
        {canDrag && !collapsed.has(col.group.id) && (
          <span {...dragProps({ type: 'scaled', gid: col.group.id })} className="cursor-grab opacity-60" title="ลากเพื่อย้าย">
            <GripVertical size={12} />
          </span>
        )}
        <span>ทอนเหลือ {formatScore(col.group.rawScore)}</span>
      </div>
      <div className="text-[10px] font-medium opacity-70">
        จากเต็ม {formatScore(col.members.filter(m => m.isVisible).reduce((s, m) => s + (m.maxScore || 0), 0))}
      </div>
    </th>
  );

  const renderExamHeader = (col: Extract<GridCol, { kind: 'exam' }>) => {
    const max = examMax(config, col.field);
    const proportion = config.proportions[col.field];
    return (
      <th
        key={col.key}
        rowSpan={2}
        className={`${thBase} ${isDark ? 'bg-indigo-950' : 'bg-indigo-50'} sticky top-0 z-20 min-w-[92px] text-indigo-600 dark:text-indigo-300`}
        {...headerHandlers({ type: 'exam', exam: col.field })}
      >
        <div>{col.field === 'midterm' ? 'กลางภาค' : 'ปลายภาค'}</div>
        <div className="text-[10px] font-medium opacity-70">
          เต็ม {formatScore(max)}{max !== proportion ? ` → ${formatScore(proportion)}` : ''}
        </div>
      </th>
    );
  };

  // Header row 1: group names merged over their columns; everything else spans both rows
  const headerRow1: React.ReactNode[] = [];
  const headerRow2: React.ReactNode[] = [];
  for (let i = 0; i < examStart; i++) {
    const col = cols[i];
    const gid = col.kind === 'groupScaled' ? col.group.id : col.kind === 'assignment' ? col.group?.id : undefined;
    if (!gid) {
      if (col.kind === 'assignment') headerRow1.push(renderAssignmentHeader(col, 2));
      continue;
    }
    let span = 0;
    while (i + span < examStart) {
      const c = cols[i + span];
      const cg = c.kind === 'groupScaled' ? c.group.id : c.kind === 'assignment' ? c.group?.id : undefined;
      if (cg !== gid) break;
      if (c.kind === 'assignment') headerRow2.push(renderAssignmentHeader(c, 1));
      else if (c.kind === 'groupScaled') headerRow2.push(renderScaledHeader(c, 1));
      span++;
    }
    const group = groups.find(g => g.id === gid)!;
    const isCollapsed = collapsed.has(gid);
    headerRow1.push(
      <th
        key={`group:${gid}`}
        colSpan={span}
        className={`${thBase} ${groupBg} sticky top-0 z-20 h-9 text-purple-700 dark:text-purple-300 ${dropClass(`group:${gid}`)}`}
        {...headerHandlers({ type: 'group', group })}
        {...dropProps(`group:${gid}`)}
      >
        <div className="flex items-center justify-center gap-1">
          {canDrag && (
            <span {...dragProps({ type: 'group', gid })} className="cursor-grab opacity-60" title="ลากเพื่อย้ายทั้งกลุ่ม">
              <GripVertical size={12} />
            </span>
          )}
          <button
            type="button"
            onClick={() => setCollapsed(prev => {
              const next = new Set(prev);
              if (next.has(gid)) next.delete(gid); else next.add(gid);
              return next;
            })}
            className="flex items-center gap-1 hover:underline"
            title={isCollapsed ? 'กางดูงานในกลุ่ม' : 'พับกลุ่ม'}
          >
            {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
            <span className="truncate max-w-[200px]">{group.name}</span>
          </button>
        </div>
      </th>,
    );
    i += span - 1;
  }

  const addColumnHeader = editable ? (
    <th key="__add" rowSpan={2} className={`${thBase} ${headBg} sticky top-0 z-20 min-w-[110px]`}>
      <button type="button" onClick={actions.addAssignment} className="flex items-center gap-1 mx-auto text-red-500 hover:text-red-600">
        <Plus size={14} /> เพิ่มงาน
      </button>
    </th>
  ) : null;

  /** One background per cell (Tailwind can't order two bg classes): invalid > selected > selected column > tone. */
  const cellBg = (base: string, bad: boolean, selected: boolean, columnSelected: boolean) => {
    if (bad) return isDark ? 'bg-red-900/60 text-red-100' : 'bg-red-100 text-red-700';
    if (selected) return isDark ? 'bg-blue-700/60 text-white' : 'bg-blue-200 text-blue-950';
    if (columnSelected) return isDark ? 'bg-blue-900/50' : 'bg-blue-100';
    return base;
  };

  const renderCell = (r: number, c: number) => {
    const student = students[r];
    const col = cols[c];
    const isActive = active?.r === r && active?.c === c;
    const inSel = selection && r >= selection.r1 && r <= selection.r2 && c >= selection.c1 && c <= selection.c2;
    const isEditing = editing?.pos.r === r && editing?.pos.c === c;

    let bad = false;
    let text = cellText(r, c);
    let tone = '';
    let bg = '';
    if (col.kind === 'groupScaled') {
      tone = isDark ? 'text-purple-300 font-bold' : 'text-purple-700 font-bold';
      bg = isDark ? 'bg-purple-950/40' : 'bg-purple-50/60';
    } else {
      const key = cellKey(student.studentId, col.field);
      const value = getFieldValue(scores.get(student.studentId), col.field);
      bad = invalid.has(key) || (value !== undefined && value > fieldMax(col.field, assignments, config));
      if (col.kind === 'assignment' && !col.assignment.isVisible) tone = 'opacity-50';
      if (!editable && text === '') { text = '–'; tone += ` ${muted}`; }
    }

    return (
      <td
        key={col.key}
        data-cell={`${r}:${c}`}
        className={`${tdBase} relative cursor-cell ${tone} ${cellBg(bg, bad, !!inSel && !isActive, col.kind === 'assignment' && selectedHeaders.includes(col.assignment.id))} ${isActive ? 'outline outline-[3px] -outline-offset-[3px] outline-blue-600' : ''}`}
        onMouseDown={e => {
          if (e.button !== 0) return;
          e.preventDefault();
          finishEditing();
          moveTo({ r, c }, e.shiftKey);
          focusGrid();
          setSelectingCells(true);
        }}
        onMouseEnter={() => { if (selectingCells) setActive({ r, c }); }}
        onDoubleClick={() => startEditing({ r, c }, cellText(r, c), false)}
        title={bad ? `เกินคะแนนเต็มหรือไม่ใช่ตัวเลข (เต็ม ${col.kind !== 'groupScaled' ? formatScore(fieldMax(col.field, assignments, config)) : ''}) — ยังไม่ได้บันทึก` : undefined}
      >
        {isEditing ? null : text}
      </td>
    );
  };

  const rightCols = 3;
  const rightW = 64;

  return (
    <div className="relative">
      <div
        ref={containerRef}
        className={`overflow-auto max-h-[calc(100vh-260px)] min-h-[240px] rounded-xl border ${border} bg-surface ${isDark ? 'text-gray-100' : 'text-gray-900'}`}
      >
        <div ref={tableWrapRef} className="relative min-w-full w-max">
        <input
          ref={editorRef}
          aria-label="ช่องกรอกคะแนน"
          value={editing ? editing.text : ''}
          readOnly={!editable}
          inputMode="decimal"
          autoComplete="off"
          onChange={handleEditorChange}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onBlur={() => finishEditing()}
          style={editorBox ?? { left: 0, top: 0, width: 0, height: 0 }}
          className={`absolute z-[5] p-0 border-0 text-center text-sm tabular-nums outline-none ${editing
            ? `bg-surface ${isDark ? 'text-white' : 'text-gray-900'} ring-2 ring-inset ring-blue-500`
            : 'opacity-0 pointer-events-none'}`}
        />
        <table className="border-separate border-spacing-0 min-w-full">
          <thead>
            <tr className="h-9">
              <th rowSpan={2} className={`${thBase} ${headBg} sticky left-0 top-0 z-40 w-12 min-w-[48px]`}>เลขที่</th>
              <th rowSpan={2} className={`${thBase} ${headBg} sticky left-12 top-0 z-40 min-w-[180px] text-left`}>ชื่อ - สกุล</th>
              {headerRow1}
              {addColumnHeader}
              {renderExamHeader(cols[examStart] as Extract<GridCol, { kind: 'exam' }>)}
              {renderExamHeader(cols[examStart + 1] as Extract<GridCol, { kind: 'exam' }>)}
              {[
                { label: 'เก็บ', sub: `/${formatScore(config.proportions.collected)}` },
                { label: 'รวม', sub: '/100' },
                { label: 'เกรด', sub: '' },
              ].map((h, i) => (
                <th
                  key={h.label}
                  rowSpan={2}
                  style={{ right: (rightCols - 1 - i) * rightW, width: rightW, minWidth: rightW }}
                  className={`${thBase} ${isDark ? 'bg-emerald-950' : 'bg-emerald-50'} sticky top-0 z-40 text-emerald-700 dark:text-emerald-300 ${i === 0 ? 'border-l' : ''}`}
                >
                  <div>{h.label}</div>
                  {h.sub && <div className="text-[10px] font-medium opacity-70">{h.sub}</div>}
                </th>
              ))}
            </tr>
            <tr className="h-9">{headerRow2}</tr>
          </thead>
          <tbody>
            {students.map((student, r) => {
              const b = breakdowns.get(student.studentId)!;
              return (
                <tr key={student.studentId}>
                  <td className={`${tdBase} ${surface} sticky left-0 z-10 ${muted}`}>{student.number || '-'}</td>
                  <td
                    className={`${tdBase} ${surface} sticky left-12 z-10 !text-left px-3 font-semibold truncate max-w-[220px] cursor-pointer hover:text-blue-500`}
                    onClick={() => onStudentClick(student)}
                  >
                    {student.name}
                  </td>
                  {cols.slice(0, examStart).map((_, c) => renderCell(r, c))}
                  {editable && <td className={tdBase} />}
                  {renderCell(r, examStart)}
                  {renderCell(r, examStart + 1)}
                  <td
                    style={{ right: 2 * rightW }}
                    className={`${tdBase} sticky z-10 border-l font-bold ${b.isExceeding ? (isDark ? 'bg-red-900/60 text-red-200' : 'bg-red-50 text-red-600') : `${surface} text-blue-600 dark:text-blue-300`}`}
                    title={b.isExceeding ? `คะแนนเก็บเกินสัดส่วน ${config.proportions.collected}` : undefined}
                  >
                    {formatScore(b.collected)}
                  </td>
                  <td style={{ right: rightW }} className={`${tdBase} ${surface} sticky z-10 font-black`}>{formatScore(b.total)}</td>
                  <td style={{ right: 0 }} className={`${tdBase} ${surface} sticky z-10 text-base font-black ${gradeColor(b.grade, config)}`}>{b.grade}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>

      {menu && (
        <div
          style={{ left: Math.min(menu.x, window.innerWidth - 240), top: Math.min(menu.y, window.innerHeight - 260) }}
          className={`fixed z-[80] w-56 rounded-xl bg-surface shadow-neu-lg p-1 text-sm ${isDark ? 'text-gray-100' : 'text-gray-800'}`}
          onClick={e => e.stopPropagation()}
        >
          <ContextMenuItems
            target={menu.target}
            isDark={isDark}
            selected={selectedHeaders.map(id => assignments.find(a => a.id === id)).filter((a): a is Assignment => !!a)}
            close={() => setMenu(null)}
            onGroup={() => setDialog({ type: 'group', ids: selectedHeaders.length ? selectedHeaders : [(menu.target as { assignment: Assignment }).assignment.id] })}
            onEditGroup={g => setDialog({ type: 'group', ids: [], group: g })}
            onExamMax={exam => setDialog({ type: 'exam', exam })}
            actions={actions}
          />
        </div>
      )}

      {dialog?.type === 'group' && (
        <GroupDialog
          isDark={isDark}
          group={dialog.group}
          members={dialog.group
            ? assignments.filter(a => a.groupId === dialog.group!.id)
            : dialog.ids.map(id => assignments.find(a => a.id === id)).filter((a): a is Assignment => !!a)}
          defaultName={`งานกลุ่ม ${groups.length + 1}`}
          onClose={() => { setDialog(null); focusGrid(); }}
          onSubmit={(name, raw) => {
            if (dialog.group) actions.editGroup(dialog.group, name, raw);
            else actions.groupAssignments(dialog.ids, name, raw);
            setDialog(null);
            setSelectedHeaders([]);
            focusGrid();
          }}
        />
      )}

      {dialog?.type === 'exam' && (
        <ExamMaxDialog
          isDark={isDark}
          exam={dialog.exam}
          current={examMax(config, dialog.exam)}
          proportion={config.proportions[dialog.exam]}
          onClose={() => { setDialog(null); focusGrid(); }}
          onSubmit={max => { actions.setExamMax(dialog.exam, max); setDialog(null); focusGrid(); }}
        />
      )}
    </div>
  );
}

function ContextMenuItems({ target, isDark, selected, close, onGroup, onEditGroup, onExamMax, actions }: {
  target: MenuTarget;
  isDark: boolean;
  /** Assignments whose headers are selected */
  selected: Assignment[];
  close: () => void;
  onGroup: () => void;
  onEditGroup: (g: AssignmentGroup) => void;
  onExamMax: (exam: 'midterm' | 'final') => void;
  actions: ScoreGridActions;
}) {
  const item = `w-full text-left px-3 py-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5`;
  const run = (fn: () => void) => () => { close(); fn(); };

  if (target.type === 'exam') {
    return (
      <button type="button" className={item} onClick={run(() => onExamMax(target.exam))}>
        ตั้งคะแนนเต็มข้อสอบ{target.exam === 'midterm' ? 'กลางภาค' : 'ปลายภาค'}
      </button>
    );
  }
  if (target.type === 'group') {
    const g = target.group;
    return (
      <Fragment>
        <div className="px-3 py-1 text-[11px] font-bold opacity-50 truncate">{g.name}</div>
        <button type="button" className={item} onClick={run(() => onEditGroup(g))}>แก้ชื่อกลุ่ม / คะแนนทอน</button>
        <button type="button" className={`${item} text-red-500`} onClick={run(() => actions.ungroup(g))}>ยกเลิกกลุ่ม (งานยังอยู่)</button>
      </Fragment>
    );
  }
  const a = target.assignment;
  // Actions apply to every selected column when the clicked one is part of the selection
  const targets = selected.some(x => x.id === a.id) ? selected : [a];
  const ids = targets.map(x => x.id);
  const many = targets.length > 1;
  const count = many ? ` ${targets.length} งาน` : '';
  const anyVisible = targets.some(x => x.isVisible);
  const anyHidden = targets.some(x => !x.isVisible);
  return (
    <Fragment>
      {many && <div className="px-3 py-1 text-[11px] font-bold opacity-50">เลือกอยู่ {targets.length} งาน</div>}
      <button type="button" className={`${item} font-bold text-purple-600 dark:text-purple-300`} onClick={run(onGroup)}>
        ปรับคะแนน{many ? ` (${targets.length} งาน)` : ''}…
      </button>
      {!many && (
        <button type="button" className={item} onClick={run(() => actions.editAssignment(a))}>แก้ไขงาน (ชื่อ / คะแนนเต็ม / กำหนดส่ง)</button>
      )}
      {anyVisible && (
        <button type="button" className={item} onClick={run(() => actions.setVisibility(ids, false))}>ซ่อน{count}จากนักเรียน</button>
      )}
      {anyHidden && (
        <button type="button" className={item} onClick={run(() => actions.setVisibility(ids, true))}>แสดง{count}ให้นักเรียนเห็น</button>
      )}
      {!many && a.groupId && (
        <button type="button" className={item} onClick={run(() => actions.removeFromGroup(a))}>เอาออกจากกลุ่ม</button>
      )}
      <div className={`my-1 border-t ${isDark ? 'border-white/10' : 'border-gray-300/70'}`} />
      <button type="button" className={`${item} text-red-500`} onClick={run(() => actions.deleteAssignments(ids))}>ลบ{count || 'งาน'}</button>
    </Fragment>
  );
}

function DialogShell({ title, children, onClose }: { isDark: boolean; title: string; children: React.ReactNode; onClose: () => void }) {
  const id = useId();
  return (
    <Modal open onClose={onClose} size="sm" labelledBy={id} className="p-5">
      <ModalHeader id={id} title={title} onClose={onClose} />
      {children}
    </Modal>
  );
}

function GroupDialog({ isDark, group, members, defaultName, onClose, onSubmit }: {
  isDark: boolean;
  group?: AssignmentGroup;
  members: Assignment[];
  defaultName: string;
  onClose: () => void;
  onSubmit: (name: string, rawScore: number) => void;
}) {
  const [name, setName] = useState(group?.name ?? defaultName);
  const [raw, setRaw] = useState(group ? formatScore(group.rawScore) : '10');
  const total = members.filter(m => m.isVisible).reduce((s, m) => s + (m.maxScore || 0), 0);
  const parsed = parseScore(raw);
  const valid = name.trim() !== '' && parsed.ok && parsed.value !== null && parsed.value > 0;
  const input = `w-full h-11 px-3 rounded-xl border text-base border-transparent bg-surface shadow-neu-in-sm focus:outline-none focus:ring-2 focus:ring-purple-500/30`;

  return (
    <DialogShell isDark={isDark} title={group ? 'แก้ไขกลุ่มคะแนน' : 'ปรับคะแนน'} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={e => { e.preventDefault(); if (valid) onSubmit(name.trim(), (parsed as { value: number }).value); }}
      >
        <div>
          <label className="block text-sm font-bold mb-1 opacity-70">ชื่อกลุ่ม</label>
          <input autoFocus className={input} value={name} onChange={e => setName(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-bold mb-1 opacity-70">คะแนนที่ต้องการ</label>
          <input className={input} inputMode="decimal" value={raw} onChange={e => setRaw(e.target.value)} />
        </div>
        <div className={`p-3 rounded-xl text-sm ${isDark ? 'bg-purple-950/50 text-purple-200' : 'bg-purple-50 text-purple-700'}`}>
          งาน {members.length} ชิ้น เต็มรวม {formatScore(total)} → ทอนเหลือ {valid ? formatScore((parsed as { value: number }).value) : '?'}
          <div className="text-xs opacity-70 mt-1 truncate">{members.map(m => m.title).join(', ')}</div>
        </div>
        <button type="submit" disabled={!valid} className="w-full h-11 rounded-xl bg-purple-600 text-white font-bold disabled:opacity-40">
          ตกลง
        </button>
      </form>
    </DialogShell>
  );
}

function ExamMaxDialog({ isDark, exam, current, proportion, onClose, onSubmit }: {
  isDark: boolean;
  exam: 'midterm' | 'final';
  current: number;
  proportion: number;
  onClose: () => void;
  onSubmit: (max: number) => void;
}) {
  const [text, setText] = useState(formatScore(current));
  const parsed = parseScore(text);
  const valid = parsed.ok && parsed.value !== null && parsed.value > 0;
  const label = exam === 'midterm' ? 'กลางภาค' : 'ปลายภาค';
  return (
    <DialogShell isDark={isDark} title={`คะแนนเต็มข้อสอบ${label}`} onClose={onClose}>
      <form className="space-y-4" onSubmit={e => { e.preventDefault(); if (valid) onSubmit((parsed as { value: number }).value); }}>
        <input
          autoFocus
          inputMode="decimal"
          value={text}
          onChange={e => setText(e.target.value)}
          className={`w-full h-11 px-3 rounded-xl border text-base border-transparent bg-surface shadow-neu-in-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30`}
        />
        <p className="text-sm opacity-70">
          ครูกรอกคะแนนจากข้อสอบเต็ม {valid ? formatScore((parsed as { value: number }).value) : '?'} แล้วระบบทอนให้เหลือ {formatScore(proportion)} คะแนนตามสัดส่วน{label}
        </p>
        <button type="submit" disabled={!valid} className="w-full h-11 rounded-xl bg-indigo-600 text-white font-bold disabled:opacity-40">
          บันทึก
        </button>
      </form>
    </DialogShell>
  );
}
