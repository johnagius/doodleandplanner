import {
  bestCells,
  buildGrid,
  gridRows,
  tallyGrid,
  type GridCell,
  type GridSpec,
} from '@dap/shared';
import { useMemo, useRef, useState } from 'react';
import { EmptyState } from '../../components/EmptyState.js';
import { defaultStartLocal, localInputToISO } from '../../lib/datetime.js';
import { useRoomStore } from '../../state/roomStore.js';

const DAY_FMT: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' };
const TIME_FMT: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', hour12: false };

/**
 * Doodle-style availability grid: a week × time matrix where you drag to mark
 * when you're free, over a live heatmap of how many people are available per
 * slot. Toggle between editing "your" availability and the group "heatmap".
 */
export function AvailabilityGridView() {
  const state = useRoomStore((s) => s.state)!;
  const meId = useRoomStore((s) => s.meId)!;
  const { setupGrid, setMyGridCells } = useRoomStore();

  const spec = state.gridSpec;
  if (!spec) return <GridSetup onCreate={setupGrid} />;

  return (
    <GridBoard
      spec={spec}
      meId={meId}
      grids={state.availabilityGrid ?? {}}
      members={state.room.members}
      onPaint={(ids, available) => setMyGridCells(ids, available)}
    />
  );
}

function GridSetup({ onCreate }: { onCreate: (spec: GridSpec) => void }) {
  const room = useRoomStore((s) => s.state!.room);
  const [startLocal, setStartLocal] = useState(defaultStartLocal(1, 0));
  const [days, setDays] = useState(7);
  const [startHour, setStartHour] = useState(room.settings.workingHours.startHour);
  const [endHour, setEndHour] = useState(room.settings.workingHours.endHour);
  const [slotMinutes, setSlotMinutes] = useState(60);

  return (
    <div className="stack">
      <EmptyState
        icon="🗓️"
        title="Set up an availability grid"
        hint="Pick a date range and hours; everyone then drags to mark when they're free, and a heatmap shows the best times at a glance."
      />
      <form
        className="card stack"
        aria-label="Grid setup"
        onSubmit={(e) => {
          e.preventDefault();
          // Normalise the chosen day to local midnight so columns align to days.
          const d = new Date(localInputToISO(startLocal));
          d.setHours(0, 0, 0, 0);
          onCreate({
            startDay: d.toISOString(),
            days,
            startHour,
            endHour,
            slotMinutes,
          });
        }}
      >
        <div className="row row-wrap" style={{ gap: '1rem' }}>
          <label className="field">
            First day
            <input
              className="input"
              type="datetime-local"
              value={startLocal}
              onChange={(e) => setStartLocal(e.target.value)}
              aria-label="First day"
            />
          </label>
          <label className="field">
            Days
            <select
              className="select"
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              aria-label="Days"
            >
              {[3, 5, 7, 10, 14].map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            From
            <input
              className="input"
              type="number"
              min={0}
              max={23}
              value={startHour}
              onChange={(e) => setStartHour(Number(e.target.value))}
              aria-label="Start hour"
              style={{ width: 80 }}
            />
          </label>
          <label className="field">
            To
            <input
              className="input"
              type="number"
              min={1}
              max={24}
              value={endHour}
              onChange={(e) => setEndHour(Number(e.target.value))}
              aria-label="End hour"
              style={{ width: 80 }}
            />
          </label>
          <label className="field">
            Slot
            <select
              className="select"
              value={slotMinutes}
              onChange={(e) => setSlotMinutes(Number(e.target.value))}
              aria-label="Slot length"
            >
              <option value={30}>30 min</option>
              <option value={60}>1 hour</option>
              <option value={120}>2 hours</option>
            </select>
          </label>
        </div>
        <button className="btn btn-primary" type="submit" disabled={endHour <= startHour}>
          Create grid
        </button>
      </form>
    </div>
  );
}

interface GridBoardProps {
  spec: GridSpec;
  meId: string;
  grids: Record<string, string[]>;
  members: { id: string; name: string; color: string }[];
  onPaint: (cellIds: string[], available: boolean) => void;
}

function GridBoard({ spec, meId, grids, members, onPaint }: GridBoardProps) {
  const [mode, setMode] = useState<'me' | 'everyone'>('me');
  const cells = useMemo(() => buildGrid(spec), [spec]);
  const rows = gridRows(spec);
  const memberIds = members.map((m) => m.id);
  const tally = useMemo(() => tallyGrid(cells, grids, memberIds), [cells, grids, memberIds]);
  const mineSet = useMemo(() => new Set(grids[meId] ?? []), [grids, meId]);
  const best = useMemo(() => bestCells(cells, grids, memberIds, 3), [cells, grids, memberIds]);
  const bestIds = new Set(best.map((b) => b.cellId));

  // Drag-paint state: while dragging, we add or remove depending on the first
  // cell's current state, and apply on release for a single store write.
  const drag = useRef<{ adding: boolean; touched: Set<string> } | null>(null);
  const [dragTick, setDragTick] = useState(0);

  // Distinct columns (days) and rows (times) from the cell list.
  const cols = spec.days;
  const cellByColRow = useMemo(() => {
    const m = new Map<string, GridCell>();
    for (const c of cells) m.set(`${c.col}:${c.row}`, c);
    return m;
  }, [cells]);

  const rowLabels = useMemo(() => {
    const out: string[] = [];
    for (let r = 0; r < rows; r++) {
      const c = cellByColRow.get(`0:${r}`);
      out.push(c ? new Date(c.start).toLocaleTimeString([], TIME_FMT) : '');
    }
    return out;
  }, [rows, cellByColRow]);

  const colLabels = useMemo(() => {
    const out: string[] = [];
    for (let col = 0; col < cols; col++) {
      const c = cellByColRow.get(`${col}:0`);
      out.push(c ? new Date(c.start).toLocaleDateString([], DAY_FMT) : '');
    }
    return out;
  }, [cols, cellByColRow]);

  function isPaintedMine(cellId: string): boolean {
    // Reflect in-progress drag immediately for responsiveness.
    if (drag.current?.touched.has(cellId)) return drag.current.adding;
    return mineSet.has(cellId);
  }

  function startDrag(cellId: string) {
    if (mode !== 'me') return;
    const adding = !mineSet.has(cellId);
    drag.current = { adding, touched: new Set([cellId]) };
    setDragTick((t) => t + 1);
  }
  function extendDrag(cellId: string) {
    if (!drag.current) return;
    drag.current.touched.add(cellId);
    setDragTick((t) => t + 1);
  }
  function endDrag() {
    const d = drag.current;
    drag.current = null;
    if (d && d.touched.size > 0) onPaint([...d.touched], d.adding);
    setDragTick((t) => t + 1);
  }

  const total = memberIds.length;

  return (
    <div className="stack" onPointerUp={endDrag} onPointerLeave={endDrag}>
      <div className="row spread row-wrap">
        <div className="row" role="tablist" aria-label="Grid mode" style={{ gap: '0.3rem' }}>
          <button
            className={`btn btn-sm ${mode === 'me' ? 'btn-primary' : ''}`}
            aria-pressed={mode === 'me'}
            onClick={() => setMode('me')}
          >
            ✏️ My availability
          </button>
          <button
            className={`btn btn-sm ${mode === 'everyone' ? 'btn-primary' : ''}`}
            aria-pressed={mode === 'everyone'}
            onClick={() => setMode('everyone')}
          >
            👥 Group heatmap
          </button>
        </div>
        <div className="row small muted">
          {mode === 'me'
            ? 'Drag across cells to mark when you’re free'
            : `Shading = people free of ${total}`}
        </div>
      </div>

      {best.length > 0 && (
        <div className="card row row-wrap" style={{ gap: '0.5rem', alignItems: 'center' }}>
          <strong className="small">Best so far:</strong>
          {best.map((b) => (
            <span key={b.cellId} className="badge badge-success">
              {new Date(b.start).toLocaleDateString([], { weekday: 'short' })}{' '}
              {new Date(b.start).toLocaleTimeString([], TIME_FMT)} · {b.count}/{total}
            </span>
          ))}
        </div>
      )}

      <div className="grid-scroll" data-tick={dragTick}>
        <div
          className="avail-grid"
          style={{ gridTemplateColumns: `var(--grid-label-w) repeat(${cols}, minmax(64px, 1fr))` }}
        >
          {/* Header row */}
          <div className="avail-corner" />
          {colLabels.map((label, col) => (
            <div key={`h${col}`} className="avail-colhead">
              {label}
            </div>
          ))}

          {/* Body rows */}
          {Array.from({ length: rows }, (_, row) => (
            <GridRow
              key={`r${row}`}
              row={row}
              label={rowLabels[row] ?? ''}
              cols={cols}
              cellByColRow={cellByColRow}
              mode={mode}
              total={total}
              tally={tally}
              bestIds={bestIds}
              isPaintedMine={isPaintedMine}
              onCellDown={startDrag}
              onCellEnter={extendDrag}
            />
          ))}
        </div>
      </div>

      <p className="muted small" style={{ textAlign: 'center' }}>
        {mode === 'everyone'
          ? 'Hover a cell to see who’s free. Switch to “My availability” to edit yours.'
          : 'Your picks are saved automatically and feed the group heatmap.'}
      </p>
    </div>
  );
}

function GridRow({
  row,
  label,
  cols,
  cellByColRow,
  mode,
  total,
  tally,
  bestIds,
  isPaintedMine,
  onCellDown,
  onCellEnter,
}: {
  row: number;
  label: string;
  cols: number;
  cellByColRow: Map<string, GridCell>;
  mode: 'me' | 'everyone';
  total: number;
  tally: Map<string, { count: number; available: string[] }>;
  bestIds: Set<string>;
  isPaintedMine: (cellId: string) => boolean;
  onCellDown: (cellId: string) => void;
  onCellEnter: (cellId: string) => void;
}) {
  return (
    <>
      <div className="avail-rowhead">{label}</div>
      {Array.from({ length: cols }, (_, col) => {
        const cell = cellByColRow.get(`${col}:${row}`);
        if (!cell) return <div key={`c${col}`} className="avail-cell" />;
        const t = tally.get(cell.id);
        const count = t?.count ?? 0;
        const intensity = total > 0 ? count / total : 0;
        const mine = isPaintedMine(cell.id);
        const isBest = bestIds.has(cell.id);

        const bg =
          mode === 'everyone'
            ? count === 0
              ? 'transparent'
              : `color-mix(in srgb, var(--success) ${Math.round(20 + intensity * 70)}%, transparent)`
            : mine
              ? 'var(--primary)'
              : 'transparent';

        return (
          <button
            key={`c${col}`}
            type="button"
            className={`avail-cell ${isBest ? 'best' : ''} ${mode === 'me' && mine ? 'mine' : ''}`}
            style={{ background: bg }}
            title={
              mode === 'everyone'
                ? `${count}/${total} free`
                : mine
                  ? 'You’re free — click to clear'
                  : 'Click to mark free'
            }
            aria-label={`${new Date(cell.start).toLocaleString()} — ${count} of ${total} free`}
            onPointerDown={(e) => {
              e.preventDefault();
              onCellDown(cell.id);
            }}
            onPointerEnter={() => onCellEnter(cell.id)}
          >
            {mode === 'everyone' && count > 0 ? count : ''}
          </button>
        );
      })}
    </>
  );
}
