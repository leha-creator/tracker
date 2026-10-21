import { describe, expect, it } from 'vitest';

import {
  encodeFeedCursor,
  FEED_START,
  mergeAuditFeed,
  parseFeedCursor,
  type FeedCursor,
} from './audit-feed';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const at = (minute: number) => new Date(Date.UTC(2026, 9, 21, 12, minute));
const item = (n: number, minute: number) => ({ id: uuid(n), createdAt: at(minute) });

describe('feed cursor', () => {
  it('кодирует и разбирает обе части', () => {
    const cursor: FeedCursor = {
      local: { createdAt: at(5), id: uuid(1) },
      remote: `${at(3).toISOString()}_${uuid(2)}`,
    };
    expect(parseFeedCursor(encodeFeedCursor(cursor))).toEqual(cursor);
  });

  it('сохраняет признак «сторона закончилась»', () => {
    const cursor: FeedCursor = { local: 'done', remote: `${at(1).toISOString()}_${uuid(3)}` };
    expect(parseFeedCursor(encodeFeedCursor(cursor))).toEqual(cursor);
    expect(encodeFeedCursor({ local: null, remote: 'done' })).toBe('~-');
  });

  it('старый курсор — только локальная часть', () => {
    const raw = `${at(5).toISOString()}_${uuid(1)}`;
    expect(parseFeedCursor(raw)).toEqual({
      local: { createdAt: at(5), id: uuid(1) },
      remote: null,
    });
  });

  it('мусор — с начала', () => {
    expect(parseFeedCursor(undefined)).toEqual(FEED_START);
    expect(parseFeedCursor('x~y')).toEqual(FEED_START);
  });
});

describe('mergeAuditFeed', () => {
  it('сливает по времени и отдаёт курсоры обеих сторон', () => {
    const result = mergeAuditFeed({
      cursor: FEED_START,
      pageSize: 3,
      local: [item(1, 50), item(2, 30), item(3, 10)],
      localDone: true,
      remote: [item(11, 40), item(12, 20)],
      remoteNextCursor: null,
    });
    expect(result.items.map((i) => i.id)).toEqual([uuid(1), uuid(11), uuid(2)]);
    expect(result.nextCursor).toEqual({
      local: { createdAt: at(30), id: uuid(2) },
      remote: `${at(40).toISOString()}_${uuid(11)}`,
    });
  });

  it('последняя страница — без курсора', () => {
    const result = mergeAuditFeed({
      cursor: FEED_START,
      pageSize: 10,
      local: [item(1, 5)],
      localDone: true,
      remote: [item(11, 6)],
      remoteNextCursor: null,
    });
    expect(result.items).toHaveLength(2);
    expect(result.nextCursor).toBeNull();
  });

  it('событие с тем же id показывается один раз', () => {
    const result = mergeAuditFeed({
      cursor: FEED_START,
      pageSize: 10,
      local: [item(1, 5), item(2, 3)],
      localDone: true,
      remote: [item(1, 5)],
      remoteNextCursor: null,
    });
    expect(result.items.map((i) => i.id)).toEqual([uuid(1), uuid(2)]);
  });

  it('обрывает страницу, когда буфер IdP кончился раньше самого IdP', () => {
    const result = mergeAuditFeed({
      cursor: FEED_START,
      pageSize: 10,
      local: [item(1, 50), item(2, 10)],
      localDone: true,
      remote: [item(11, 40)],
      remoteNextCursor: 'idp-next',
    });
    expect(result.items.map((i) => i.id)).toEqual([uuid(1), uuid(11)]);
    expect(result.nextCursor).toEqual({
      local: { createdAt: at(50), id: uuid(1) },
      remote: 'idp-next',
    });
  });

  it('продолжает со стороны, у которой ещё есть события', () => {
    const cursor: FeedCursor = { local: 'done', remote: 'prev' };
    const result = mergeAuditFeed({
      cursor,
      pageSize: 2,
      local: [],
      localDone: true,
      remote: [item(11, 9), item(12, 8), item(13, 7)],
      remoteNextCursor: null,
    });
    expect(result.items).toHaveLength(2);
    expect(result.nextCursor).toEqual({
      local: 'done',
      remote: `${at(8).toISOString()}_${uuid(12)}`,
    });
  });
});
