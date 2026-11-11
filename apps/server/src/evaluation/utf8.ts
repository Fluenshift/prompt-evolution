export const isWellFormedUtf8String = (value: string): boolean =>
  Buffer.from(value, "utf-8").toString("utf-8") === value;

export const isUtf8ByteBoundary = (source: Buffer, offset: number): boolean => {
  if (offset === 0 || offset === source.byteLength) {
    return true;
  }

  const byte = source[offset];
  return byte !== undefined && (byte < 0x80 || byte > 0xbf);
};
