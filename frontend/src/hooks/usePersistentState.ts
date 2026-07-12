import { useEffect, useState } from 'react';

export function usePersistentState<T>(
  key: string,
  defaultValue: T,
  validate?: (value: string) => boolean
) {
  const [value, setValue] = useState<T>(() => {
    const storedValue = localStorage.getItem(key);
    if (storedValue === null) return defaultValue;
    if (validate && !validate(storedValue)) return defaultValue;
    return storedValue as T;
  });

  useEffect(() => {
    localStorage.setItem(key, String(value));
  }, [key, value]);

  return [value, setValue] as const;
}
