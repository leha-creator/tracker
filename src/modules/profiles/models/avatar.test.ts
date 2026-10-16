import { describe, expect, it } from 'vitest';

import {
  avatarContentTypeOfKey,
  avatarStorageKey,
  avatarUrl,
  detectImageType,
  isAvatarUrl,
} from './avatar';

const bytes = (values: number[]) => new Uint8Array(values);
const ascii = (text: string) => Array.from(text, (char) => char.charCodeAt(0));

describe('detectImageType', () => {
  it('detects PNG, JPEG and WebP', () => {
    expect(detectImageType(bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe(
      'image/png',
    );
    expect(detectImageType(bytes([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(detectImageType(bytes([...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WEBP')]))).toBe(
      'image/webp',
    );
  });

  it('rejects other content', () => {
    expect(detectImageType(bytes(ascii('GIF89a')))).toBeNull();
    expect(detectImageType(bytes(ascii('<svg')))).toBeNull();
    expect(detectImageType(new Uint8Array())).toBeNull();
  });
});

describe('avatar urls', () => {
  it('builds key and url', () => {
    expect(avatarStorageKey('u1', 'id1', 'image/jpeg')).toBe('users/u1/avatar/id1.jpg');
    expect(avatarContentTypeOfKey('users/u1/avatar/id1.jpg')).toBe('image/jpeg');
    expect(avatarContentTypeOfKey('users/u1/avatar/id1')).toBeNull();
    expect(avatarUrl('u1', 'abc')).toBe('/api/users/u1/avatar?v=abc');
  });

  it('accepts only app avatar urls', () => {
    expect(isAvatarUrl(avatarUrl('u1', '0192f3a0-0000-7000'))).toBe(true);
    expect(isAvatarUrl('/api/users/u1/avatar')).toBe(true);
    expect(isAvatarUrl('https://evil.example/pixel.png')).toBe(false);
    expect(isAvatarUrl('//evil.example/api/users/u1/avatar')).toBe(false);
    expect(isAvatarUrl(null)).toBe(false);
  });
});
