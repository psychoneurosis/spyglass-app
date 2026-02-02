export const superSafeString = (val: any): string => {
  try {
    if (typeof val === 'string') return val;
    if (val instanceof Error) return val.message;
    const str = JSON.stringify(val);
    return str === '{}' ? 'Unknown Object Error' : str;
  } catch {
    return 'Unserializable Error';
  }
};
