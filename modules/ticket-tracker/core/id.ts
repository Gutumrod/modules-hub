export function nextTicketId(existingTickets: { id?: string }[]): string {
  const maxId = existingTickets.reduce((max, ticket) => {
    const match = /^TCK-(\d+)$/.exec(ticket.id || '');
    return match ? Math.max(max, Number(match[1])) : max;
  }, 1000);
  return `TCK-${maxId + 1}`;
}
