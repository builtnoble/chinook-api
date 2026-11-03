// "1 track", "3 tracks".
export const countOf = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;
