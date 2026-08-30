import { handler } from '../src/handler';

describe('Auth function skeleton', () => {
  it('should return 501 GIVEN no implementation yet WHEN the handler runs', async () => {
    await expect(handler()).resolves.toEqual({ statusCode: 501 });
  });
});
