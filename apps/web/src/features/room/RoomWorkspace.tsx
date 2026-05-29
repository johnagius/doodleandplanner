import { findMember } from '@dap/shared';
import { useState } from 'react';
import { Avatar, AvatarStack } from '../../components/Avatar.js';
import { isRealtimeBackend } from '../../lib/storage/index.js';
import { useRoomStore } from '../../state/roomStore.js';
import { ActivitiesPanel } from '../activities/ActivitiesPanel.js';
import { DoodleCanvas } from '../doodle/DoodleCanvas.js';
import { EventsPanel } from '../events/EventsPanel.js';
import { InventoryPanel } from '../inventory/InventoryPanel.js';
import { MembersPanel } from '../members/MembersPanel.js';
import { PollsPanel } from '../polls/PollsPanel.js';
import { ShareBar } from './ShareBar.js';

type TabId = 'schedule' | 'doodle' | 'plan' | 'inventory' | 'activities' | 'members';

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'schedule', label: 'Schedule', icon: '🗳️' },
  { id: 'doodle', label: 'Doodle', icon: '🎨' },
  { id: 'plan', label: 'Plan', icon: '🗓️' },
  { id: 'inventory', label: 'Inventory', icon: '🎒' },
  { id: 'activities', label: 'Activities', icon: '🎉' },
  { id: 'members', label: 'Members', icon: '👥' },
];

export function RoomWorkspace() {
  const state = useRoomStore((s) => s.state)!;
  const meId = useRoomStore((s) => s.meId);
  const [tab, setTab] = useState<TabId>('schedule');

  const me = meId ? findMember(state.room, meId) : undefined;

  return (
    <div className="container">
      <section className="stack" style={{ marginBottom: '1rem' }}>
        <div className="row spread row-wrap">
          <div>
            <h1 style={{ marginBottom: 4 }}>{state.room.name}</h1>
            {state.room.description && (
              <p className="muted" style={{ margin: 0 }}>
                {state.room.description}
              </p>
            )}
          </div>
          <div className="row">
            <span
              className={`badge ${isRealtimeBackend() ? 'badge-success' : ''}`}
              title={
                isRealtimeBackend()
                  ? 'Changes sync live to everyone in the room'
                  : 'Saved on this device and synced across your tabs'
              }
            >
              {isRealtimeBackend() ? '🟢 Live sync' : '🔵 This device'}
            </span>
            <AvatarStack members={state.room.members} />
            {me && (
              <span className="row small" style={{ gap: 6 }}>
                <Avatar member={me} size={26} /> <span className="muted">you</span>
              </span>
            )}
          </div>
        </div>
        <ShareBar />
      </section>

      <nav className="tabs" role="tablist" aria-label="Room sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={`tab ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            <span aria-hidden>{t.icon}</span> {t.label}
          </button>
        ))}
      </nav>

      <div role="tabpanel">
        {tab === 'schedule' && <PollsPanel />}
        {tab === 'doodle' && <DoodleCanvas />}
        {tab === 'plan' && <EventsPanel />}
        {tab === 'inventory' && <InventoryPanel />}
        {tab === 'activities' && <ActivitiesPanel />}
        {tab === 'members' && <MembersPanel />}
      </div>
    </div>
  );
}
