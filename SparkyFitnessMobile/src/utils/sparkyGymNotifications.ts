/** Bounded, incremental SSE framing. Payloads stay on the server; only committed IDs matter. */
export function createNotificationDecoder(
  receive: (id: string, event: string) => void
) {
  let pending = '';
  return (chunk: string) => {
    pending += chunk;
    if (pending.length > 65536)
      throw new Error('Notification frame exceeds limit');
    let match: RegExpExecArray | null;
    while ((match = /\r?\n\r?\n/.exec(pending))) {
      const frame = pending.slice(0, match.index);
      pending = pending.slice(match.index + match[0].length);
      let id = '';
      let event = 'message';
      let hasData = false;
      for (const line of frame.split(/\r?\n/)) {
        if (line.startsWith('id:')) id = line.slice(3).trimStart();
        if (line.startsWith('event:')) event = line.slice(6).trimStart();
        if (line.startsWith('data:')) hasData = true;
      }
      if (hasData && !id.includes('\0')) receive(id, event);
    }
  };
}
