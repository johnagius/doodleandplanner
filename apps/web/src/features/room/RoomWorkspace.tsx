import { computeNudges, findMember } from '@dap/shared';
import { useState } from 'react';
import { Avatar, AvatarStack } from '../../components/Avatar.js';
import { isRealtimeBackend } from '../../lib/storage/index.js';
import { useRoomStore } from '../../state/roomStore.js';
import { ActivitiesPanel } from '../activities/ActivitiesPanel.js';
import { ChatPanel } from '../chat/ChatPanel.js';
import { AvailabilityGridView } from '../grid/AvailabilityGridView.js';
import { DoodleCanvas } from '../doodle/DoodleCanvas.js';
import { EventsPanel } from '../events/EventsPanel.js';
import { InventoryPanel } from '../inventory/InventoryPanel.js';
import { MembersPanel } from '../members/MembersPanel.js';
import { PollsPanel } from '../polls/PollsPanel.js';
import { SummaryView } from '../summary/SummaryView.js';
import { ShareBar } from './ShareBar.js';

type TabId =
  | 'schedule'
  | 'grid'
  | 'doodle'
  | 'plan'
  | 'inventory'
  | 'activities'
  | 'chat'
  | 'members'
  | 'summary';

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'schedule', label: 'Schedule', icon: '🗳️' },
  { id: 'grid', label: 'Grid', icon: '🟩' },
  { id: 'doodle', label: 'Doodle', icon: '🎨' },
  { id: 'plan', label: 'Plan', icon: '🗓️' },
  { id: 'inventory', label: 'Inventory', icon: '🎒' },
  { id: 'activities', label: 'Activities', icon: '🎉' },
  { id: 'chat', label: 'Chat', icon: '💬' },
  { id: 'summary', label: 'Summary', icon: '📋' },
  { id: 'members', label: 'Members', icon: '👥' },
];

export function RoomWorkspace() {
  const state = useRoomStore((s) => s.state)!;
  const meId = useRoomStore((s) => s.meId);
  const [tab, setTab] = useState<TabId>('schedule');

  const me = meId ? findMember(state.room, meId) : undefined;

  const nudges = meId
    ? computeNudges({
        viewerId: meId,
        polls: state.polls,
        inventory: state.inventory,
        events: state.events,
        activities: state.activities,
      })
    : null;

  const nudgeChips: { label: string; tab: TabId }[] = [];
  if (nudges) {
    if (nudges.pollsToVote > 0)
      nudgeChips.push({
        label: `🗳️ ${nudges.pollsToVote} poll${nudges.pollsToVote > 1 ? 's' : ''} to vote`,
        tab: 'schedule',
      });
    if (nudges.eventsToRsvp > 0)
      nudgeChips.push({
        label: `🗓️ RSVP to ${nudges.eventsToRsvp} event${nudges.eventsToRsvp > 1 ? 's' : ''}`,
        tab: 'plan',
      });
    if (nudges.itemsNeeded > 0)
      nudgeChips.push({
        label: `🎒 ${nudges.itemsNeeded} item${nudges.itemsNeeded > 1 ? 's' : ''} unclaimed`,
        tab: 'inventory',
      });
  }

  return (
    <div className="container">
      <section className="room-header">
        <div className="row spread row-wrap" style={{ gap: '0.75rem' }}>
          <div style={{ minWidth: 0 }}>
            <h1 className="room-title">{state.room.name}</h1>
            {state.room.description && (
              <p className="muted" style={{ margin: '0.25rem 0 0' }}>
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
        {nudgeChips.length > 0 && (
          <div className="row row-wrap" aria-label="Things to do" style={{ gap: '0.4rem' }}>
            {nudgeChips.map((c) => (
              <button key={c.label} className="nudge-chip" onClick={() => setTab(c.tab)}>
                {c.label}
              </button>
            ))}
          </div>
        )}
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
        {tab === 'grid' && <AvailabilityGridView />}
        {tab === 'doodle' && <DoodleCanvas />}
        {tab === 'plan' && <EventsPanel />}
        {tab === 'inventory' && <InventoryPanel />}
        {tab === 'activities' && <ActivitiesPanel />}
        {tab === 'chat' && <ChatPanel />}
        {tab === 'summary' && <SummaryView />}
        {tab === 'members' && <MembersPanel />}
      </div>
    </div>
  );
}
