import { logEvent, parseTraceparent } from '../src/log';

describe('parseTraceparent', () => {
  it('should extract trace and span ids GIVEN a valid W3C header WHEN parsing', () => {
    const result = parseTraceparent('00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01');

    expect(result).toEqual({
      traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
      spanId: '00f067aa0ba902b7',
    });
  });

  it('should lower-case the ids GIVEN an upper-case header WHEN parsing', () => {
    const result = parseTraceparent('00-4BF92F3577B34DA6A3CE929D0E0E4736-00F067AA0BA902B7-01');

    expect(result?.traceId).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
  });

  it('should return undefined GIVEN no header WHEN parsing', () => {
    expect(parseTraceparent(undefined)).toBeUndefined();
    expect(parseTraceparent('')).toBeUndefined();
  });

  it('should return undefined GIVEN a malformed header WHEN parsing', () => {
    expect(parseTraceparent('not-a-traceparent')).toBeUndefined();
    expect(parseTraceparent('00-abc-def-01')).toBeUndefined();
  });

  // All-zero ids are invalid by the specification; accepting them would lump
  // unrelated requests under one trace in Grafana.
  it('should return undefined GIVEN all-zero ids WHEN parsing', () => {
    expect(
      parseTraceparent('00-00000000000000000000000000000000-00f067aa0ba902b7-01'),
    ).toBeUndefined();
    expect(
      parseTraceparent('00-4bf92f3577b34da6a3ce929d0e0e4736-0000000000000000-01'),
    ).toBeUndefined();
  });
});

describe('logEvent', () => {
  it('should write one JSON line with level and service name GIVEN fields WHEN logging', () => {
    const lines: string[] = [];

    logEvent({ msg: 'hello', outcome: 'issued' }, (line) => lines.push(line));

    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toEqual({
      level: 'info',
      service_name: 'car-repair-shop-auth',
      msg: 'hello',
      outcome: 'issued',
    });
  });

  it('should write to the console GIVEN no writer WHEN logging', () => {
    const spy = jest.spyOn(console, 'info').mockImplementation(() => undefined);

    logEvent({ msg: 'hello' });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(JSON.parse(spy.mock.calls[0][0] as string).msg).toBe('hello');
    spy.mockRestore();
  });
});
