/**
 * Упаковка PNG в ICO (формат «PNG внутри ICO», его понимают все современные браузеры и Windows).
 * @param {{ size: number, data: Buffer }[]} images — квадратные PNG, размер ≤ 256
 * @returns {Buffer}
 */
export function packIco(images) {
  if (images.length === 0) throw new Error('packIco: нужен хотя бы один PNG');
  const headerSize = 6;
  const entrySize = 16;
  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);

  let offset = headerSize + entrySize * images.length;
  const entries = images.map(({ size, data }) => {
    if (size < 1 || size > 256) throw new Error(`packIco: недопустимый размер ${size}`);
    const entry = Buffer.alloc(entrySize);
    entry.writeUInt8(size === 256 ? 0 : size, 0); // width
    entry.writeUInt8(size === 256 ? 0 : size, 1); // height
    entry.writeUInt8(0, 2); // palette
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += data.length;
    return entry;
  });

  return Buffer.concat([header, ...entries, ...images.map((image) => image.data)]);
}
