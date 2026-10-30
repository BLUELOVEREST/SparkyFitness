import { createNotificationDecoder } from '../../src/utils/sparkyGymNotifications';
describe('durable owner notification stream', () => {
  it('reassembles fragmented CRLF frames and ignores comments', () => {
    const receive = jest.fn();
    const decode = createNotificationDecoder(receive);
    decode(': keepalive\r\n\r\nid: 12\r\nevent: comm');
    expect(receive).not.toHaveBeenCalled();
    decode('itted\r\ndata: {}\r\n\r\n');
    expect(receive).toHaveBeenCalledWith('12', 'committed');
  });
  it('accepts cursor-compaction recovery without an id', () => {
    const receive = jest.fn();
    createNotificationDecoder(receive)(
      'event: snapshot-required\ndata: {}\n\n'
    );
    expect(receive).toHaveBeenCalledWith('', 'snapshot-required');
  });
});
