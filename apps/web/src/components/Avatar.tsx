import { initials, type Member } from '@dap/shared';

export function Avatar({
  member,
  size = 32,
  title,
}: {
  member: Pick<Member, 'name' | 'color'>;
  size?: number;
  title?: string;
}) {
  return (
    <span
      className="avatar"
      title={title ?? member.name}
      aria-label={member.name}
      style={{ background: member.color, width: size, height: size, fontSize: size * 0.4 }}
    >
      {initials(member.name)}
    </span>
  );
}

export function AvatarStack({ members, max = 5 }: { members: Member[]; max?: number }) {
  const shown = members.slice(0, max);
  const extra = members.length - shown.length;
  return (
    <span className="avatar-stack" aria-label={`${members.length} members`}>
      {shown.map((m) => (
        <Avatar key={m.id} member={m} />
      ))}
      {extra > 0 && (
        <span className="avatar" style={{ background: 'var(--muted)' }} title={`${extra} more`}>
          +{extra}
        </span>
      )}
    </span>
  );
}
