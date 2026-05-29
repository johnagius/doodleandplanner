/** "What shall we do?" activity planning + interest voting. */
import { generateId } from './ids.js';
import type { Activity } from './types.js';

export interface CreateActivityInput {
  roomId: string;
  title: string;
  description?: string;
  proposedBy: string;
  durationMinutes?: number;
  now?: () => Date;
}

export function createActivity(input: CreateActivityInput): Activity {
  const title = input.title.trim();
  if (!title) throw new Error('Activity title is required');
  return {
    id: generateId('act'),
    roomId: input.roomId,
    title,
    description: input.description?.trim() || undefined,
    proposedBy: input.proposedBy,
    interested: [],
    durationMinutes: input.durationMinutes,
    createdAt: (input.now ?? (() => new Date()))().toISOString(),
  };
}

/** Toggle a member's interest in an activity. */
export function toggleInterest(activity: Activity, memberId: string): Activity {
  const has = activity.interested.includes(memberId);
  return {
    ...activity,
    interested: has
      ? activity.interested.filter((id) => id !== memberId)
      : [...activity.interested, memberId],
  };
}

export function scheduleActivity(activity: Activity, scheduledAt: string | undefined): Activity {
  return { ...activity, scheduledAt };
}

export function updateActivity(
  activity: Activity,
  patch: Partial<Pick<Activity, 'title' | 'description' | 'durationMinutes'>>,
): Activity {
  const next = { ...activity, ...patch };
  if (patch.title !== undefined) {
    const title = patch.title.trim();
    if (!title) throw new Error('Activity title is required');
    next.title = title;
  }
  return next;
}

/** Activities ranked by interest count (desc), ties broken by creation order. */
export function rankActivities(activities: Activity[]): Activity[] {
  return [...activities].sort((a, b) => {
    if (b.interested.length !== a.interested.length) {
      return b.interested.length - a.interested.length;
    }
    return a.createdAt.localeCompare(b.createdAt);
  });
}
