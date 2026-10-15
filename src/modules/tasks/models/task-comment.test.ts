import { describe, expect, it } from 'vitest';

import { ForbiddenError } from '@/shared/errors/app-error';

import {
  assertCanDeleteComment,
  assertCanEditComment,
  canDeleteComment,
  canEditComment,
  normalizeCommentBody,
} from './task-comment';

describe('normalizeCommentBody', () => {
  it.each([
    ['  Привет  ', 'Привет'],
    ['a\r\nb\rc', 'a\nb\nc'],
    ['строка  \nвторая\t', 'строка\nвторая'],
    ['a\n\n\n\nb', 'a\n\nb'],
    ['a\n \n \n b', 'a\n\n b'],
    ['a\nb\n\nc', 'a\nb\n\nc'],
    ['\n\n  \n', ''],
  ])('%j → %j', (input, expected) => {
    expect(normalizeCommentBody(input)).toBe(expected);
  });
});

describe('comment permissions', () => {
  const author = { userId: 'u1', role: 'member' as const };
  const otherMember = { userId: 'u2', role: 'member' as const };
  const owner = { userId: 'u3', role: 'owner' as const };
  const comment = { authorId: 'u1' };
  const orphan = { authorId: null };

  it('author can edit and delete', () => {
    expect(canEditComment(comment, author)).toBe(true);
    expect(canDeleteComment(comment, author)).toBe(true);
  });

  it('owner can delete but not edit a foreign comment', () => {
    expect(canEditComment(comment, owner)).toBe(false);
    expect(canDeleteComment(comment, owner)).toBe(true);
  });

  it('other member can neither edit nor delete', () => {
    expect(canEditComment(comment, otherMember)).toBe(false);
    expect(canDeleteComment(comment, otherMember)).toBe(false);
    expect(() => assertCanEditComment(comment, otherMember)).toThrow(ForbiddenError);
    expect(() => assertCanDeleteComment(comment, otherMember)).toThrow(ForbiddenError);
  });

  it('comment of a deleted user: nobody edits, owner deletes', () => {
    expect(canEditComment(orphan, owner)).toBe(false);
    expect(canEditComment(orphan, otherMember)).toBe(false);
    expect(canDeleteComment(orphan, owner)).toBe(true);
    expect(canDeleteComment(orphan, otherMember)).toBe(false);
  });

  it('assertions pass for allowed actors', () => {
    expect(() => assertCanEditComment(comment, author)).not.toThrow();
    expect(() => assertCanDeleteComment(comment, owner)).not.toThrow();
  });
});
